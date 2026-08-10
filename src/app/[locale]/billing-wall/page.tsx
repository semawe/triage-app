import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";

export default async function BillingWallPage() {
  const session = await requireAuth();

  // L'admin n'est plus exempté du mur (il avait accès à toute l'app) : il est
  // arrêté ici comme les autres, avec le chemin de régularisation.
  const adminMembership = await prisma.organisationMember.findFirst({
    where: { userId: session.user.id, role: "admin" },
    include: { organisation: true },
  });

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-4xl mb-6">🔒</div>
        <h1 className="text-2xl font-bold text-white mb-3">Accès suspendu</h1>
        <p className="text-gray-400 mb-6">
          {adminMembership
            ? "L'abonnement de votre organisation est expiré ou en retard de paiement. Régularisez depuis les paramètres de facturation pour rouvrir l'accès."
            : "L'abonnement de votre organisation est expiré ou en retard de paiement. Contactez l'administrateur de votre organisation pour régulariser la situation."}
        </p>
        {adminMembership && (
          <Link
            href="/settings"
            className="inline-block rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors mb-6"
          >
            Régulariser l&apos;abonnement →
          </Link>
        )}
        <p className="text-xs text-gray-600">
          Vous êtes connecté en tant que {session.user.email}
        </p>
      </div>
    </div>
  );
}
