"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, requireOrg } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { consumedSeats } from "@/lib/seats";

export async function requestJoin(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAuth();
  const userId = session.user.id;

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org || !org.allowedEmailDomain) return { ok: false, error: "Organisation introuvable" };

  const userEmail = session.user.email ?? "";
  const domain = userEmail.split("@")[1] ?? "";
  if (domain !== org.allowedEmailDomain) return { ok: false, error: "Domaine non autorisé" };

  const existing = await prisma.organisationMember.findUnique({
    where: { organisationId_userId: { organisationId: orgId, userId } },
  });
  if (existing) return { ok: false, error: "Déjà membre" };

  await prisma.joinRequest.upsert({
    where: { userId_organisationId: { userId, organisationId: orgId } },
    create: { userId, organisationId: orgId, status: "pending" },
    update: { status: "pending" },
  });

  return { ok: true };
}

export async function approveJoinRequest(requestId: string): Promise<void> {
  const { org, membership } = await requireOrg();
  if (membership.role !== "admin") return;

  const req = await prisma.joinRequest.findUnique({ where: { id: requestId } });
  if (!req || req.organisationId !== org.id) return;

  // Garde de siège : ne pas approuver au-delà de la limite (membres + invitations en attente)
  if ((await consumedSeats(org.id)) >= org.seatCount) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/members?error=seats-full`);
  }

  await prisma.$transaction([
    prisma.joinRequest.update({ where: { id: requestId }, data: { status: "approved" } }),
    prisma.organisationMember.upsert({
      where: { organisationId_userId: { organisationId: org.id, userId: req.userId } },
      create: { organisationId: org.id, userId: req.userId, role: "member" },
      update: {},
    }),
  ]);

  revalidatePath("/[locale]/members", "page");
}

export async function rejectJoinRequest(requestId: string): Promise<void> {
  const { org, membership } = await requireOrg();
  if (membership.role !== "admin") return;

  const req = await prisma.joinRequest.findUnique({ where: { id: requestId } });
  if (!req || req.organisationId !== org.id) return;

  await prisma.joinRequest.update({ where: { id: requestId }, data: { status: "rejected" } });
  revalidatePath("/[locale]/members", "page");
}
