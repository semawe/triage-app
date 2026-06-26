import { prisma } from "./prisma";

/**
 * Nombre de sièges consommés par une organisation = membres actuels
 * + invitations en attente non expirées (chacune réserve un siège).
 * Compter les invitations en attente empêche d'émettre plusieurs invitations
 * sous la limite qui, une fois toutes acceptées, la dépasseraient.
 */
export async function consumedSeats(orgId: string): Promise<number> {
  const [members, pendingInvites] = await Promise.all([
    prisma.organisationMember.count({ where: { organisationId: orgId } }),
    prisma.pendingInvite.count({
      where: { orgId, expiresAt: { gt: new Date() } },
    }),
  ]);
  return members + pendingInvites;
}

/** Libellé d'erreur unifié quand la limite de sièges est atteinte. */
export function seatLimitMessage(seatCount: number): string {
  return `Limite de ${seatCount} siège${seatCount > 1 ? "s" : ""} atteinte. Ajoute des sièges depuis Paramètres › Facturation.`;
}
