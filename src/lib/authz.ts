import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/session";

/**
 * Garde d'autorisation par espace : admin de l'org OU lead de l'espace.
 * Utilisée par la gouvernance (rôles) et le module synchro (indicateurs,
 * checklists, projets, override de features).
 */
export async function canManageSpace(spaceId: string) {
  const { session, org, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";

  const space = await prisma.space.findFirst({
    where: { id: spaceId, organisationId: org.id },
  });
  if (!space) return { ok: false as const };

  const callerMember = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId: session.user.id } },
  });
  const isLead = callerMember?.role === "lead";

  if (!isAdmin && !isLead) return { ok: false as const };
  return { ok: true as const, session, org, space };
}
