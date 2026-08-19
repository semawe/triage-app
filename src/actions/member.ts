"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, requireOrg, requireSuperAdmin } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { sendEmail } from "@/lib/email";
import { consumedSeats, seatLimitMessage } from "@/lib/seats";
import { newToken } from "@/lib/tokens";

export async function updateMemberRole(
  memberId: string,
  newRole: "admin" | "member"
) {
  const { session, org } = await requireOrg();

  const currentUserMembership = await prisma.organisationMember.findUnique({
    where: {
      organisationId_userId: {
        organisationId: org.id,
        userId: session.user.id,
      },
    },
  });

  if (currentUserMembership?.role !== "admin") return;

  const target = await prisma.organisationMember.findUnique({
    where: { id: memberId },
  });

  if (!target) return;
  if (target.organisationId !== org.id) return;
  if (target.userId === session.user.id) return; // can't change own role

  await prisma.organisationMember.update({
    where: { id: memberId },
    data: { role: newRole },
  });

  revalidatePath("/", "layout");
}

export async function removeMember(memberId: string) {
  const { session, org } = await requireOrg();

  const currentUserMembership = await prisma.organisationMember.findUnique({
    where: {
      organisationId_userId: {
        organisationId: org.id,
        userId: session.user.id,
      },
    },
  });

  if (currentUserMembership?.role !== "admin") return;

  const target = await prisma.organisationMember.findUnique({
    where: { id: memberId },
  });

  if (!target) return;
  if (target.organisationId !== org.id) return;
  if (target.userId === session.user.id) return;

  // Une appartenance d'espace ou une attribution de rôle survivante n'accorde
  // pas d'accès sans OrganisationMember, mais elle ressusciterait silencieusement
  // si la personne rejoignait l'organisation plus tard. Le retrait signifie donc
  // retrait de tous les rôles propres à CETTE organisation, atomiquement.
  await prisma.$transaction([
    prisma.roleAssignment.deleteMany({
      where: {
        userId: target.userId,
        role: { space: { organisationId: org.id } },
      },
    }),
    prisma.spaceMember.deleteMany({
      where: {
        userId: target.userId,
        space: { organisationId: org.id },
      },
    }),
    prisma.organisationMember.delete({ where: { id: memberId } }),
  ]);

  revalidatePath("/", "layout");
}

// ── Invitations ───────────────────────────────────────────────────────────────

export async function generateInvite(
  _prev: { url: string; error?: string } | null,
  formData: FormData
): Promise<{ url: string; error?: string }> {
  const { org, membership } = await requireOrg();
  if (membership.role !== "admin") return { url: "" };

  const role = (formData.get("role") as "admin" | "member") ?? "member";
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Comptage et création dans la même transaction verrouillée : deux émissions
  // simultanées passaient toutes deux la garde du dernier siège.
  const invite = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${org.id} FOR UPDATE`;
    if ((await consumedSeats(org.id, tx)) >= org.seatCount) return null;
    return tx.pendingInvite.create({
      data: { orgId: org.id, role, expiresAt, token: newToken() },
    });
  });
  if (!invite) return { url: "", error: seatLimitMessage(org.seatCount) };

  const locale = await getLocale().catch(() => "fr");
  return { url: `${process.env.AUTH_URL ?? "http://localhost:3000"}/${locale}/invite/${invite.token}` };
}

export async function sendInviteByEmail(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const { org, membership } = await requireOrg();
  if (membership.role !== "admin") return { ok: false, error: "Non autorisé." };

  const email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
  const role = (formData.get("role") as "admin" | "member") ?? "member";

  if (!email || !email.includes("@")) return { ok: false, error: "Adresse email invalide." };

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  // Invitation nominative : le lien ne vaut que pour cette adresse (il circule
  // par transfert, historique, capture — surtout quand il confère `admin`).
  const invite = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${org.id} FOR UPDATE`;
    if ((await consumedSeats(org.id, tx)) >= org.seatCount) return null;
    return tx.pendingInvite.create({
      data: { orgId: org.id, role, expiresAt, email, token: newToken() },
    });
  });
  if (!invite) return { ok: false, error: seatLimitMessage(org.seatCount) };

  const locale = await getLocale().catch(() => "fr");
  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/${locale}/invite/${invite.token}`;
  const roleLabel = role === "admin" ? "administrateur" : "membre";

  const result = await sendEmail({
    to: [email],
    subject: `Invitation à rejoindre ${org.name.replace(/[\r\n]+/g, " ")} sur Triage App`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
        <h2 style="color:#1f2937;margin-bottom:8px">Tu es invité(e) sur Triage App</h2>
        <p style="color:#4b5563">Tu as été invité(e) à rejoindre l'organisation <strong>${escapeHtml(org.name)}</strong> en tant que <strong>${roleLabel}</strong>.</p>
        <p style="margin:24px 0">
          <a href="${inviteUrl}" style="background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Rejoindre ${escapeHtml(org.name)} →
          </a>
        </p>
        <p style="color:#9ca3af;font-size:13px">Ce lien est valable 7 jours. Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
      </div>
    `,
  });

  if (!result.ok) return { ok: false, error: result.error ?? "Erreur lors de l'envoi." };
  return { ok: true };
}

export async function acceptInvite(token: string) {
  const session = await requireAuth();
  const locale = await getLocale().catch(() => "fr");

  const invite = await prisma.pendingInvite.findUnique({ where: { token } });
  if (!invite || invite.expiresAt < new Date()) {
    // La page d'invitation rend l'état « invalide ou expiré »
    redirect(`/${locale}/invite/${token}`);
  }

  // Invitation nominative : elle ne vaut que pour l'adresse destinataire.
  // Sans ce contrôle, un lien transféré confère le rôle (y compris `admin`)
  // à quiconque l'ouvre avec son propre compte Google.
  const callerEmail = (session.user.email ?? "").trim().toLowerCase();
  if (invite.email && invite.email !== callerEmail) {
    redirect(`/${locale}/invite/${token}?wrong-account=1`);
  }

  const already = await prisma.organisationMember.findUnique({
    where: {
      organisationId_userId: { organisationId: invite.orgId, userId: session.user.id },
    },
  });

  // Recontrôle du siège à l'acceptation (cas d'un downgrade après émission), DANS
  // la transaction et sous verrou de l'organisation.
  //
  // Il vivait avant l'ouverture de la transaction : deux invités acceptant en même
  // temps sur le dernier siège lisaient tous deux « il en reste un » et entraient
  // tous deux, laissant l'organisation au-dessus de ce qu'elle facture (revue
  // adverse du 18/08/2026). `generateInvite` et `approveJoinRequest` étaient déjà
  // couverts par des tests de concurrence ; cette porte-ci ne l'était pas.
  const complet = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${invite.orgId} FOR UPDATE`;

    if (!already) {
      const org = await tx.organisation.findUniqueOrThrow({ where: { id: invite.orgId } });
      const members = await tx.organisationMember.count({
        where: { organisationId: invite.orgId },
      });
      if (members >= org.seatCount) return true;
    }

    await tx.organisationMember.upsert({
      where: {
        organisationId_userId: { organisationId: invite.orgId, userId: session.user.id },
      },
      create: { organisationId: invite.orgId, userId: session.user.id, role: invite.role },
      update: {},
    });
    // L'invitation est à usage unique : elle se consomme avec l'entrée, ou pas.
    await tx.pendingInvite.delete({ where: { id: invite.id } });
    return false;
  });

  if (complet) redirect(`/${locale}/invite/${token}?full=1`);

  redirect(`/${locale}/meetings`);
}

// ── Space members ─────────────────────────────────────────────────────────────

export async function addSpaceMember(
  spaceId: string,
  formData: FormData
) {
  const { session, org, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";

  // Check if caller is space lead
  const callerSpaceMembership = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId: session.user.id } },
  });
  const isSpaceLead = callerSpaceMembership?.role === "lead";

  if (!isAdmin && !isSpaceLead) return;

  const space = await prisma.space.findFirst({
    where: { id: spaceId, organisationId: org.id },
  });
  if (!space) return;

  const userId = formData.get("userId") as string;
  const role = (formData.get("role") as "lead" | "member") ?? "member";
  if (!userId) return;

  await prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId, userId } },
    create: { spaceId, userId, role },
    update: { role },
  });

  revalidatePath("/", "layout");
}

export async function updateSpaceMemberRole(
  spaceId: string,
  userId: string,
  newRole: "lead" | "member"
) {
  const { session, org, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";

  const callerSpaceMembership = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId: session.user.id } },
  });
  const isSpaceLead = callerSpaceMembership?.role === "lead";

  if (!isAdmin && !isSpaceLead) return;

  const space = await prisma.space.findFirst({
    where: { id: spaceId, organisationId: org.id },
  });
  if (!space) return;

  await prisma.spaceMember.updateMany({ where: { spaceId, userId }, data: { role: newRole } });

  revalidatePath("/", "layout");
}

export async function removeSpaceMember(spaceId: string, userId: string) {
  const { session, org, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";

  const callerSpaceMembership = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId: session.user.id } },
  });
  const isSpaceLead = callerSpaceMembership?.role === "lead";

  if (!isAdmin && !isSpaceLead) return;

  const space = await prisma.space.findFirst({
    where: { id: spaceId, organisationId: org.id },
  });
  if (!space) return;

  await prisma.spaceMember.deleteMany({ where: { spaceId, userId } });

  revalidatePath("/", "layout");
}

// ── Super admin ───────────────────────────────────────────────────────────────

export async function superAdminCreateOrg(formData: FormData) {
  await requireSuperAdmin();

  const name = (formData.get("name") as string)?.trim();
  const adminEmail = (formData.get("adminEmail") as string)?.trim();
  if (!name || !adminEmail) return;

  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });

  const org = await prisma.organisation.create({
    data: {
      name,
      slug: `${slug}-${Date.now()}`,
      spaces: { create: { name: "Cercle principal", type: "circle" } },
    },
  });

  if (adminUser) {
    await prisma.organisationMember.create({
      data: { organisationId: org.id, userId: adminUser.id, role: "admin" },
    });
  }

  revalidatePath("/", "layout");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
