import { cache } from "react";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { isOrgAccessible } from "./stripe";
import { isMeetingPrivate } from "./visibility";
import { hasFeature } from "./features";
import type { Session } from "next-auth";

type AuthSession = Session & { user: { id: string } };

export const requireAuth = cache(async (): Promise<AuthSession> => {
  const session = await auth();
  if (!session?.user?.id) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/login`);
  }
  return session as AuthSession;
});

/**
 * Contexte organisation de l'appelant.
 *
 * `allowSuspended` lève UNIQUEMENT le mur de facturation, jamais un contrôle
 * d'appartenance : réservé aux pages et actions qui servent à régulariser
 * l'abonnement (Paramètres › Facturation). Partout ailleurs, `requireOrg()`.
 */
const loadOrg = cache(async (allowSuspended: boolean) => {
  const session = await requireAuth();

  const allMemberships = await prisma.organisationMember.findMany({
    where: { userId: session.user.id },
    include: {
      organisation: {
        include: { spaces: { orderBy: { createdAt: "asc" } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (allMemberships.length === 0) {
    const locale = await getLocale().catch(() => "fr");
    // Check if the user's email domain matches an org that allows domain auto-join
    const email = session.user.email ?? "";
    const domain = email.split("@")[1] ?? "";
    if (domain) {
      const matchingOrg = await prisma.organisation.findFirst({
        where: { allowedEmailDomain: domain },
        select: { id: true },
      });
      if (matchingOrg) {
        redirect(`/${locale}/join-request?orgId=${matchingOrg.id}`);
      }
    }
    redirect(`/${locale}/setup`);
  }

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("triage-active-org")?.value;

  const membership =
    allMemberships.find((m) => m.organisationId === activeOrgId) ??
    allMemberships[0];

  const allOrgs = allMemberships.map((m) => ({
    id: m.organisationId,
    name: m.organisation.name,
    logoUrl: m.organisation.logoUrl,
    primaryColor: m.organisation.primaryColor,
    role: m.role,
  }));

  const org = membership.organisation;

  // Abonnement expiré : mur de facturation pour TOUS les rôles. Un admin n'est pas
  // exempté — il régularise via Paramètres › Facturation, qui passe par
  // `requireOrgForBilling()`. Seuls les super-admins plateforme traversent le mur.
  if (!allowSuspended && !isOrgAccessible(org)) {
    const sa = await prisma.superAdmin.findUnique({
      where: { userId: session.user.id },
      select: { userId: true },
    });
    if (!sa) {
      const locale = await getLocale().catch(() => "fr");
      redirect(`/${locale}/billing-wall`);
    }
  }

  return {
    session,
    org,
    membership,
    allOrgs,
  };
});

export const requireOrg = () => loadOrg(false);

/** Variante tolérant un abonnement suspendu — pages et actions de facturation seulement. */
export const requireOrgForBilling = () => loadOrg(true);

/**
 * Garde d'autorisation pour les mutations liées à une réunion.
 * Vérifie que l'appelant est membre de l'organisation dont relève la réunion
 * (indépendamment de l'org active du cookie), ET qu'il a le droit de la voir
 * si elle est confidentielle. Renvoie null sinon.
 * Les Server Actions appellent ce helper en tête et `return` si null.
 */
export const requireMeetingAccess = async (meetingId: string) => {
  const session = await requireAuth();
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      space: {
        select: {
          organisationId: true,
          isPrivate: true,
          // features de l'espace + de l'org : résolution du flag sync_phase
          // dans openMeeting sans requête supplémentaire.
          features: true,
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

  // Confidentialité : appartenance à l'org insuffisante sur une réunion privée.
  // Y accèdent l'admin de l'org, les membres de l'espace, et l'hôte de la réunion.
  const confidentiality = hasFeature(meeting.space.organisation, "confidentiality");
  if (
    isMeetingPrivate(meeting, meeting.space, confidentiality) &&
    membership.role !== "admin"
  ) {
    const isHost = meeting.createdById === session.user.id;
    if (!isHost) {
      const spaceMember = await prisma.spaceMember.findUnique({
        where: {
          spaceId_userId: { spaceId: meeting.spaceId, userId: session.user.id },
        },
        select: { userId: true },
      });
      if (!spaceMember) return null;
    }
  }

  return { session, meeting, membership };
};

export const requireSuperAdmin = cache(async () => {
  const session = await requireAuth();
  const sa = await prisma.superAdmin.findUnique({
    where: { userId: session.user.id },
  });
  if (!sa) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/meetings`);
  }
  return { session };
});

export const isSuperAdmin = cache(async (userId: string): Promise<boolean> => {
  const sa = await prisma.superAdmin.findUnique({ where: { userId } });
  return !!sa;
});
