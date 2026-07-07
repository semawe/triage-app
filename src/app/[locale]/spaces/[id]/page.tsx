import { redirect } from "@/i18n/navigation";

// La fiche espace vit désormais sur la page canonique du cercle.
export default async function SpaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale, id } = await params;
  const { tab } = await searchParams;
  redirect({ href: `/circles/${id}${tab ? `?tab=${tab}` : ""}`, locale });
}
