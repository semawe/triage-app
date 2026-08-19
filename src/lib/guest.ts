import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { auth } from "./auth";
import { peutVoirLaReunion } from "./visibility";
import { hasFeature } from "./features";

/**
 * Accès invité (retour de test #31).
 *
 * Un invité ponctuel n'a ni session NextAuth ni appartenance à l'organisation :
 * son jeton (MeetingGuest.token), posé dans un cookie httpOnly, fait foi pour
 * une réunion donnée. Toute logique partagée membre/invité doit résoudre
 * l'invité AVANT d'appeler une garde qui exige une authentification (sinon
 * l'invité serait redirigé vers le login).
 */
export const GUEST_COOKIE = "triapp_guest";

/**
 * Le MeetingGuest valide porté par ce jeton, sinon null.
 *
 * Garde nommée du porteur de jeton — l'équivalent, pour un invité, de ce que
 * `requireAuth()` est pour un membre. Les trois conditions de validité (jeton
 * connu, non révoqué, non expiré) vivent ICI et nulle part ailleurs : elles
 * étaient réécrites à l'identique dans la page d'entrée invité et dans
 * `enterAsGuest`, où une divergence n'aurait rien cassé de visible tout en
 * ouvrant un accès révoqué. Toute nouvelle porte d'entrée invité passe par
 * cette fonction plutôt que par un `findUnique` sur `token`.
 */
export async function getGuestByToken(token: string) {
  if (!token) return null;

  const guest = await prisma.meetingGuest.findUnique({
    where: { token },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!guest) return null;
  if (guest.revokedAt) return null;
  if (guest.expiresAt && guest.expiresAt < new Date()) return null;
  return guest;
}

/** Le MeetingGuest valide porté par le cookie pour cette réunion, sinon null. */
export async function getGuestForMeeting(meetingId: string) {
  const store = await cookies();
  const token = store.get(GUEST_COOKIE)?.value;
  if (!token) return null;

  const guest = await getGuestByToken(token);
  if (!guest || guest.meetingId !== meetingId) return null;
  return guest;
}

type Participant = {
  userId: string;
  isGuest: boolean;
  canRecordOutputs: boolean;
};

/**
 * Résout l'identité agissante sur une réunion : invité valide (jeton) ou
 * membre de l'organisation. Renvoie null si ni l'un ni l'autre.
 * Les invités peuvent ajouter des points mais pas enregistrer d'outputs.
 * N'effectue aucune redirection (contrairement à requireMeetingAccess).
 */
export async function resolveParticipant(meetingId: string): Promise<Participant | null> {
  const guest = await getGuestForMeeting(meetingId);
  if (guest?.userId) {
    return { userId: guest.userId, isGuest: true, canRecordOutputs: false };
  }

  const session = await auth();
  if (!session?.user?.id) return null;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      space: {
        select: {
          organisationId: true,
          isPrivate: true,
          organisation: { select: { features: true } },
        },
      },
    },
  });
  if (!meeting) return null;

  const membership = await prisma.organisationMember.findUnique({
    where: {
      organisationId_userId: {
        organisationId: meeting.space.organisationId,
        userId: session.user.id,
      },
    },
  });
  if (!membership) return null;

  // Même décision que `requireMeetingAccess`, et littéralement la même fonction :
  // un membre de l'org extérieur au cercle privé n'est pas un participant.
  const visible = await peutVoirLaReunion({
    meeting,
    space: meeting.space,
    enabled: hasFeature(meeting.space.organisation, "confidentiality"),
    userId: session.user.id,
    role: membership.role,
  });
  if (!visible) return null;

  return { userId: session.user.id, isGuest: false, canRecordOutputs: true };
}
