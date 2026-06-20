import { auth } from "./auth";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { Session } from "next-auth";

type AuthSession = Session & { user: { id: string } };

export async function requireAuth(): Promise<AuthSession> {
  const session = await auth();
  if (!session?.user?.id) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/login`);
  }
  return session as AuthSession;
}

export async function requireOrg() {
  const session = await requireAuth();
  const membership = await prisma.organisationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organisation: {
        include: { spaces: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!membership) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/setup`);
  }
  return { session, org: membership.organisation };
}
