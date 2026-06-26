import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { updateMemberRole, removeMember } from "@/actions/member";
import { approveJoinRequest, rejectJoinRequest } from "@/actions/join";
import InviteButton from "./InviteButton";
import SendInviteForm from "./SendInviteForm";
import { Link } from "@/i18n/navigation";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { session, org, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";
  const { error } = await searchParams;

  const members = await prisma.organisationMember.findMany({
    where: { organisationId: org.id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Pending join requests (admin only)
  const joinRequests = isAdmin
    ? await prisma.joinRequest.findMany({
        where: { organisationId: org.id, status: "pending" },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // Current user's space memberships
  const mySpaces = await prisma.spaceMember.findMany({
    where: { userId: session.user.id, space: { organisationId: org.id } },
    include: { space: true },
  });

  return (
    <AppShell>
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Membres</h1>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>{org.name}</span>
          <span className="text-gray-700">·</span>
          <span>
            <span className={members.length > org.seatCount ? "text-red-400" : "text-white"}>
              {members.length}
            </span>
            <span className="text-gray-600"> / {org.seatCount} siège{org.seatCount > 1 ? "s" : ""}</span>
          </span>
        </div>
      </div>

      {error === "seats-full" && (
        <div className="mb-6 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
          Limite de {org.seatCount} siège{org.seatCount > 1 ? "s" : ""} atteinte — impossible
          d&apos;approuver cette demande. Ajoute des sièges depuis{" "}
          <Link href="/settings" className="underline hover:text-red-200">
            Paramètres › Facturation
          </Link>
          .
        </div>
      )}

      {/* Invite — admins only */}
      {isAdmin && (
        <div className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-6">
          <div>
            <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Inviter par email
            </h2>
            <SendInviteForm />
            <p className="mt-3 text-xs text-gray-600">
              Un email avec un lien d&apos;accès est envoyé directement au destinataire. Valable 7 jours.
            </p>
          </div>
          <div className="border-t border-gray-800 pt-5">
            <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Ou générer un lien
            </h2>
            <InviteButton />
            <p className="mt-3 text-xs text-gray-600">
              Partage le lien manuellement dans Slack ou par message. Lien à usage unique
              (une personne), valable 7 jours.
            </p>
          </div>
        </div>
      )}

      {/* Pending join requests — admins only */}
      {isAdmin && joinRequests.length > 0 && (
        <div className="mb-8 rounded-xl bg-gray-900 border border-yellow-900/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-yellow-900/50 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
            <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">
              {joinRequests.length} demande{joinRequests.length !== 1 ? "s" : ""} en attente
            </p>
          </div>
          <div className="divide-y divide-gray-800">
            {joinRequests.map((req) => {
              const approve = approveJoinRequest.bind(null, req.id);
              const reject = rejectJoinRequest.bind(null, req.id);
              return (
                <div key={req.id} className="flex items-center justify-between px-5 py-4 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={req.user.name} image={req.user.image} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{req.user.name ?? "—"}</p>
                      <p className="text-xs text-gray-500 truncate">{req.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <form action={approve}>
                      <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
                        Accepter
                      </button>
                    </form>
                    <form action={reject}>
                      <button type="submit" className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                        Refuser
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Member list */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden mb-8">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {members.length} membre{members.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="divide-y divide-gray-800">
          {members.map((m) => {
            const isSelf = m.userId === session.user.id;
            const makeAdmin = updateMemberRole.bind(null, m.id, "admin");
            const makeMember = updateMemberRole.bind(null, m.id, "member");
            const remove = removeMember.bind(null, m.id);

            return (
              <div
                key={m.id}
                className="flex items-center justify-between px-5 py-4 gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={m.user.name} image={m.user.image} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {m.user.name ?? "—"}
                      {isSelf && (
                        <span className="ml-2 text-xs text-gray-500">(vous)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{m.user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <RoleBadge role={m.role} />
                  {isAdmin && !isSelf && (
                    <div className="flex items-center gap-2">
                      {m.role === "member" ? (
                        <form action={makeAdmin}>
                          <button type="submit" className="text-xs text-gray-500 hover:text-indigo-400 transition-colors">
                            Passer admin
                          </button>
                        </form>
                      ) : (
                        <form action={makeMember}>
                          <button type="submit" className="text-xs text-gray-500 hover:text-yellow-400 transition-colors">
                            Retirer admin
                          </button>
                        </form>
                      )}
                      <span className="text-gray-700">·</span>
                      <form action={remove}>
                        <button type="submit" className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                          Retirer
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* My spaces */}
      <div>
        <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Mes espaces
        </h2>
        {mySpaces.length > 0 ? (
          <div className="space-y-2">
            {mySpaces.map((sm) => (
              <Link
                key={sm.id}
                href={`/spaces/${sm.space.id}`}
                className="flex items-center justify-between rounded-xl bg-gray-900 border border-gray-800 px-5 py-3 hover:border-gray-700 transition-colors"
              >
                <span className="text-sm text-white">{sm.space.name}</span>
                <RoleBadge role={sm.role} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">Tu n&apos;es membre d&apos;aucun espace pour l&apos;instant.</p>
        )}
      </div>

      {!isAdmin && (
        <p className="mt-8 text-xs text-gray-600 text-center">
          Seuls les administrateurs peuvent inviter des membres ou modifier les rôles.
        </p>
      )}
    </AppShell>
  );
}

function Avatar({ name, image }: { name: string | null; image: string | null }) {
  const initials = name
    ? name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name ?? ""} className="h-8 w-8 rounded-full object-cover shrink-0" />;
  }
  return (
    <span className="h-8 w-8 rounded-full bg-indigo-800 text-indigo-200 text-xs font-semibold flex items-center justify-center shrink-0">
      {initials}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin" || role === "lead") {
    return (
      <span className="rounded-full border border-indigo-800 bg-indigo-900/40 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
        {role === "admin" ? "Admin" : "Leader"}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400">
      Membre
    </span>
  );
}
