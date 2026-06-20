"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export async function createOrg(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/login`);
  }

  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  // Redirect if user already has an org
  const existing = await prisma.organisationMember.findFirst({
    where: { userId: session.user.id },
  });
  if (existing) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/meetings`);
  }

  // Generate unique slug
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  let slug = base;
  let attempt = 0;
  while (await prisma.organisation.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${base}-${attempt}`;
  }

  await prisma.organisation.create({
    data: {
      name,
      slug,
      members: { create: { userId: session.user.id, role: "admin" } },
      spaces: { create: { name: "Cercle principal", type: "circle" } },
    },
  });

  const locale = await getLocale().catch(() => "fr");
  redirect(`/${locale}/meetings`);
}
