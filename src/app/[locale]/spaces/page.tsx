import { redirect } from "@/i18n/navigation";

// Les espaces ont fusionné avec les cercles : /spaces → /circles (vue liste).
export default async function SpacesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/circles?view=list", locale });
}
