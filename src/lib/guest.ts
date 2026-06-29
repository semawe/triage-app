import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { auth } from "./auth";

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

/** Le MeetingGuest valide porté par le cookie pour cette réunion, sinon null. */
export async function getGuestForMeeting(meetingId: string) {
  const store = await cookies();
  const token = store.get(GUEST_COOKIE)?.value;
  if (!token) return null;

  const guest = await prisma.meetingGuest.findUnique({
    where: { token },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!guest || guest.meetingId !== meetingId) return null;
  if (guest.revokedAt) return null;
  if (guest.expiresAt && guest.expiresAt < new Date()) return null;
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
    include: { space: { select: { organisationId: true } } },
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

  return { userId: session.user.id, isGuest: false, canRecordOutputs: true };
}
