import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function MembersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <AppShell>
      <h1 className="text-xl font-semibold text-gray-900">Membres</h1>
      <p className="mt-2 text-sm text-gray-500">En construction — Phase 1</p>
    </AppShell>
  );
}
