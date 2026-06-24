"use client";

import { adminDeleteOrg } from "@/actions/admin";
import { useTransition } from "react";

export default function DeleteOrgButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Supprimer définitivement "${orgName}" et toutes ses données ?`)) return;
    startTransition(() => adminDeleteOrg(orgId));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/40 transition-colors disabled:opacity-50"
    >
      {pending ? "Suppression…" : "Supprimer l'organisation"}
    </button>
  );
}
