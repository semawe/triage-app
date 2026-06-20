import { isSuperAdmin, requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOrgFeatures } from "@/lib/features";
import NavBar from "./NavBar";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const { session, org, membership, allOrgs } = await requireOrg();

  const sa = await isSuperAdmin(session.user.id);
  const features = getOrgFeatures(org);

  const liveMeetings = await prisma.meeting.findMany({
    where: {
      status: "open",
      space: {
        organisationId: org.id,
        OR: [
          { members: { some: { userId: session.user.id } } },
          ...(membership.role === "admin" ? [{ organisationId: org.id }] : []),
        ],
      },
    },
    include: { space: { select: { name: true } } },
    take: 3,
  });

  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      <NavBar
        showAdmin={sa}
        activeOrg={{
          id: org.id,
          name: org.name,
          logoUrl: org.logoUrl,
          primaryColor: org.primaryColor,
        }}
        allOrgs={allOrgs}
        liveMeetings={liveMeetings.map((m) => ({ id: m.id, spaceName: m.space.name }))}
        features={features}
        isOrgAdmin={membership.role === "admin"}
      />
      <main className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
