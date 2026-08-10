import type { Prisma } from "@/generated/prisma";
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
