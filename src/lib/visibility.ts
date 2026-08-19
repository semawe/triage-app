import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/features";

/**
 * Confidentialité — source unique de vérité.
 *
 * `Space.isPrivate` ne gouvernait jusqu'ici que l'affichage des réunions : tout le
 * reste du contenu d'un cercle privé (gouvernance, membres, cockpit, projets) était
 * lisible par n'importe quel membre de l'organisation. Ces helpers portent la règle
 * une fois pour toutes, côté requête (prédicat Prisma) comme côté vérification
 * ponctuelle.
 *
 * Règle : quand le module `confidentiality` est actif, un espace privé n'est visible
 * que de ses membres et des admins de l'org ; une réunion hérite de son espace, sauf
 * override explicite `Meeting.isPrivate`. Module inactif = aucun cloisonnement (les
 * prédicats sont alors sans effet, pour ne pas verrouiller sur des données héritées).
 */

export type Viewer = {
  orgId: string;
  userId: string;
  isAdmin: boolean;
  /** Module `confidentiality` résolu au niveau de l'org. */
  enabled: boolean;
};

/** Construit le viewer depuis le contexte renvoyé par `requireOrg()`. */
export function viewerFrom(ctx: {
  session: { user: { id: string } };
  org: { id: string; features: unknown };
  membership: { role: string };
}): Viewer {
  return {
    orgId: ctx.org.id,
    userId: ctx.session.user.id,
    isAdmin: ctx.membership.role === "admin",
    enabled: hasFeature(ctx.org, "confidentiality"),
  };
}

/** L'appelant peut-il traverser le cloisonnement sans vérification d'espace ? */
function unrestricted(v: Viewer): boolean {
  return !v.enabled || v.isAdmin;
}

/** Confidentialité effective d'une réunion : override réunion, sinon espace. */
export function isMeetingPrivate(
  meeting: { isPrivate: boolean | null },
  space: { isPrivate: boolean },
  enabled: boolean
): boolean {
  if (!enabled) return false;
  return meeting.isPrivate ?? space.isPrivate;
}

/**
 * Prédicat Prisma des espaces visibles, à composer avec les autres filtres :
 * `where: { ...visibleSpaceWhere(v), type: "circle" }`.
 */
export function visibleSpaceWhere(v: Viewer): Prisma.SpaceWhereInput {
  if (unrestricted(v)) return { organisationId: v.orgId };
  return {
    organisationId: v.orgId,
    OR: [{ isPrivate: false }, { members: { some: { userId: v.userId } } }],
  };
}

/**
 * Prédicat Prisma des réunions visibles. Tient compte de l'override
 * `Meeting.isPrivate` dans les deux sens (réunion publique dans un espace privé,
 * réunion privée dans un espace public).
 */
export function visibleMeetingWhere(v: Viewer): Prisma.MeetingWhereInput {
  if (unrestricted(v)) return { space: { organisationId: v.orgId } };
  return {
    space: { organisationId: v.orgId },
    OR: [
      { isPrivate: false },
      { isPrivate: null, space: { isPrivate: false } },
      { space: { members: { some: { userId: v.userId } } } },
    ],
  };
}

/** Vérification ponctuelle sur un espace déjà chargé. */
export function canViewSpace(
  v: Viewer,
  space: { isPrivate: boolean; members?: { userId: string }[] }
): boolean {
  if (unrestricted(v)) return true;
  if (!space.isPrivate) return true;
  return !!space.members?.some((m) => m.userId === v.userId);
}

/**
 * Prédicat Prisma des sorties visibles — composé du prédicat des réunions, pour
 * que la règle ne soit écrite qu'une fois.
 *
 * Sans lui, une action assignée à quelqu'un lui était affichée sur `/actions` et
 * `/me` sans le moindre contrôle de cloisonnement : le contenu, le titre de la
 * réunion et le nom du cercle confidentiel avec (revue adverse du 18/08/2026).
 */
export function visibleOutputWhere(v: Viewer): Prisma.OutputWhereInput {
  return { item: { meeting: visibleMeetingWhere(v) } };
}

/**
 * L'utilisateur donné peut-il voir cette réunion ?
 *
 * **Décision unique.** Cette règle — un cercle privé n'est visible que de ses
 * membres, de l'admin de l'org et de l'hôte de la réunion — était écrite quatre
 * fois : ici en prédicats, dans `requireMeetingAccess`, dans `resolveParticipant`,
 * et à la main dans les pages `/meetings` et `/me` où le drapeau `confidentiality`
 * n'était même pas consulté. Une divergence entre ces copies ne casse rien de
 * visible : elle ouvre ou ferme un accès en silence. Les quatre appellent
 * maintenant cette fonction.
 *
 * Elle sert aussi à valider un **tiers** — l'assigné d'une action — et pas
 * seulement l'appelant : assigner une action à quelqu'un qui n'a pas accès à la
 * réunion lui en livrait le contenu par la porte de derrière.
 */
export async function peutVoirLaReunion(opts: {
  meeting: { spaceId: string; isPrivate: boolean | null; createdById: string | null };
  space: { isPrivate: boolean };
  /** Module `confidentiality` résolu au niveau de l'org de la réunion. */
  enabled: boolean;
  userId: string;
  /** Rôle de l'utilisateur dans l'organisation de la réunion. */
  role: string;
}): Promise<boolean> {
  const { meeting, space, enabled, userId, role } = opts;

  if (!isMeetingPrivate(meeting, space, enabled)) return true;
  if (role === "admin") return true;
  if (meeting.createdById === userId) return true;

  const membre = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: meeting.spaceId, userId } },
    select: { userId: true },
  });
  return !!membre;
}
