import { cache } from "react";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { isOrgAccessible } from "./stripe";
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

export const requireOrg = cache(async () => {
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

  // Redirect to billing wall if subscription expired (skip for super admins checked later)
  if (!isOrgAccessible(org) && membership.role !== "admin") {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/billing-wall`);
  }

  return {
    session,
    org,
    membership,
    allOrgs,
  };
});

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
