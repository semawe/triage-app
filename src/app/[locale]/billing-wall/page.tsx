import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

export default async function BillingWallPage() {
  const session = await requireAuth();
  const locale = await getLocale().catch(() => "fr");

  // If user has an org where they're admin and it's accessible, redirect away
  const adminMembership = await prisma.organisationMember.findFirst({
    where: { userId: session.user.id, role: "admin" },
    include: { organisation: true },
  });
  if (adminMembership) {
    redirect(`/${locale}/settings`);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-4xl mb-6">🔒</div>
        <h1 className="text-2xl font-bold text-white mb-3">Accès suspendu</h1>
        <p className="text-gray-400 mb-6">
          L&apos;abonnement de votre organisation est expiré ou en retard de paiement.
          Contactez l&apos;administrateur de votre organisation pour régulariser la situation.
        </p>
        <p className="text-xs text-gray-600">
          Vous êtes connecté en tant que {session.user.email}
        </p>
      </div>
    </div>
  );
}
