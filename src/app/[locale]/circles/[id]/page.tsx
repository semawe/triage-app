import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { addSpaceMember, removeSpaceMember, updateSpaceMemberRole } from "@/actions/member";
import { createSpace, updateSpacePrivacy } from "@/actions/space";
import {
  updateSpaceGovernance,
  createRole,
  updateRole,
  deleteRole,
  assignRoleMember,
  removeRoleAssignment,
} from "@/actions/governance";
import { Link } from "@/i18n/navigation";
import { hasFeature } from "@/lib/features";
import CircleViz from "../CircleViz";
import SyncSettingsTab from "./SyncSettingsTab";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const TYPE_LABELS: Record<string, string> = {
  circle: "Cercle", project: "Projet", instance: "Instance",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", open: "En cours", closed: "Terminée",
};

export default async function CircleDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab = "apercu" } = await searchParams;
  const { session, org, membership } = await requireOrg();

  const space = await prisma.space.findFirst({
    where: { id, organisationId: org.id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      meetings: { orderBy: { date: "desc" }, take: 30 },
      indicators: {
        orderBy: { order: "asc" },
        include: { values: { orderBy: { recordedAt: "desc" }, take: 1 } },
      },
      checklistItems: { orderBy: { order: "asc" } },
      projects: { orderBy: [{ status: "asc" }, { createdAt: "asc" }] },
      children: {
        include: {
          members: {
            where: { role: "lead" },
            include: { user: { select: { id: true, name: true, image: true } } },
            take: 1,
          },
          _count: { select: { children: true, roles: true } },
        },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      },
      roles: {
        include: {
          assignments: {
            where: { endDate: null },
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!space) notFound();

  // Fil d'Ariane : chaîne complète des ancêtres, calculée sur l'ensemble
  // des espaces de l'org (peu nombreux) plutôt qu'en N requêtes récursives.
  const allSpaces = await prisma.space.findMany({
    where: { organisationId: org.id },
    select: { id: true, name: true, parentId: true },
  });
  const byId = new Map(allSpaces.map((s) => [s.id, s]));
  const ancestors: { id: string; name: string }[] = [];
  let cursor = space.parentId;
  while (cursor && byId.has(cursor) && ancestors.length < 20) {
    const p = byId.get(cursor)!;
    ancestors.unshift({ id: p.id, name: p.name });
    cursor = p.parentId;
  }

  const isAdmin = membership.role === "admin";
  const callerMembership = space.members.find((m) => m.userId === session.user.id);
  const isSpaceLead = callerMembership?.role === "lead";
  const canManage = isAdmin || isSpaceLead;
  const canSeeMeetings = !space.isPrivate || isAdmin || !!callerMembership;

  const orgMembers = await prisma.organisationMember.findMany({
    where: { organisationId: org.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  const spaceMemberIds = new Set(space.members.map((m) => m.userId));
  const addableMembers = orgMembers.filter((m) => !spaceMemberIds.has(m.userId));

  const openMeetings = space.meetings.filter((m) => m.status === "open");
  const draftMeetings = space.meetings.filter((m) => m.status === "draft");
  const closedMeetings = space.meetings.filter((m) => m.status === "closed");

  const updateGovernance = updateSpaceGovernance.bind(null, space.id);
  const addRole = createRole.bind(null, space.id);
  const addMember = addSpaceMember.bind(null, space.id);
  const setPrivateTrue = updateSpacePrivacy.bind(null, space.id, true);
  const setPrivateFalse = updateSpacePrivacy.bind(null, space.id, false);

  // Phase de synchro : override espace lu tel quel (null = hérité de l'org).
  const rawSpaceFeatures = space.features;
  const syncOverride =
    rawSpaceFeatures && typeof rawSpaceFeatures === "object" && !Array.isArray(rawSpaceFeatures) &&
    typeof (rawSpaceFeatures as Record<string, unknown>).sync_phase === "boolean"
      ? ((rawSpaceFeatures as Record<string, unknown>).sync_phase as boolean)
      : null;
  const orgSyncEnabled = hasFeature(org, "sync_phase");

  const vizSpaces = space.children.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type as "circle" | "instance" | "project",
    purpose: s.purpose,
    leader: s.members[0]?.user ?? null,
    childCount: s._count.children,
    roleCount: s._count.roles,
  }));

  const vizRoles = space.roles.map((r) => ({
    id: r.id,
    name: r.name,
    purpose: r.purpose,
    domains: r.domains,
    accountabilities: r.accountabilities,
    holders: r.assignments.map((a) => ({
      id: a.user.id, name: a.user.name, image: a.user.image,
    })),
  }));

  const tabs = [
    { key: "apercu", label: "Aperçu" },
    { key: "gouvernance", label: "Gouvernance" },
    { key: "reunions", label: `Réunions (${space.meetings.length})` },
    { key: "membres", label: `Membres (${space.members.length})` },
    { key: "synchro", label: "Cockpit" },
  ];

  return (
    <AppShell>
      {/* Fil d'Ariane */}
      <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
        <Link href="/circles" className="hover:text-gray-300 transition-colors">
          {org.name}
        </Link>
        {ancestors.map((a) => (
          <span key={a.id} className="flex items-center gap-1.5">
            <span>›</span>
            <Link href={`/circles/${a.id}`} className="hover:text-gray-300 transition-colors">
              {a.name}
            </Link>
          </span>
        ))}
        <span>›</span>
        <span className="text-gray-400">{space.name}</span>
      </div>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">{space.name}</h1>
        <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2.5 py-0.5">
          {TYPE_LABELS[space.type] ?? space.type}
        </span>
        {space.isPrivate && (
          <span className="text-xs text-orange-400 border border-orange-900 rounded-full px-2.5 py-0.5">
            Confidentiel
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-gray-800 overflow-x-auto">
        {tabs.map(({ key, label }) => (
          <Link
            key={key}
            href={`/circles/${id}?tab=${key}`}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
              tab === key
                ? "border-indigo-500 text-indigo-300 bg-indigo-950/30"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* ── APERÇU ──────────────────────────────────────────────────────────── */}
      {tab === "apercu" && (
        <div className="space-y-6">
          {space.purpose && (
            <p className="text-sm text-gray-400 italic leading-relaxed max-w-2xl">
              {space.purpose}
            </p>
          )}

          {vizSpaces.length === 0 && vizRoles.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-12 text-center">
              <p className="text-sm text-gray-600">
                Aucun sous-cercle ni rôle dans {space.name}.
              </p>
              {canManage && (
                <p className="mt-1 text-xs text-gray-700">
                  Crée un sous-cercle ci-dessous, ou un rôle depuis l&apos;onglet Gouvernance.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden" style={{ height: "min(560px, calc(100vh - 280px))" }}>
              <CircleViz
                spaces={vizSpaces}
                roles={vizRoles}
                currentUserId={session.user.id}
                brandColor={org.primaryColor ?? "#6366f1"}
                title={space.name}
                governanceHref={`/circles/${id}?tab=gouvernance`}
              />
            </div>
          )}

          {/* Création de sous-cercle */}
          {canManage && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                + Sous-cercle
              </p>
              <form action={createSpace} className="flex flex-wrap gap-3 items-end">
                <input type="hidden" name="parentId" value={space.id} />
                <input
                  type="text"
                  name="name"
                  required
                  placeholder={`Ex. ${space.name} — Communication`}
                  className="flex-1 min-w-48 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
                <select
                  name="type"
                  className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="circle">Cercle</option>
                  <option value="instance">Instance</option>
                  <option value="project">Projet</option>
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Créer
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ── GOUVERNANCE ─────────────────────────────────────────────────────── */}
      {tab === "gouvernance" && (
        <div className="space-y-6">
          {/* Purpose + Domains + Accountabilities */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Raison d&apos;être &amp; gouvernance du cercle
            </h2>
            {canManage ? (
              <form action={updateGovernance} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Raison d&apos;être</label>
                  <textarea
                    name="purpose"
                    defaultValue={space.purpose ?? ""}
                    rows={2}
                    placeholder="Pourquoi ce cercle existe…"
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Domaines <span className="font-normal text-gray-600">(un par ligne)</span>
                  </label>
                  <textarea
                    name="domains"
                    defaultValue={space.domains.join("\n")}
                    rows={3}
                    placeholder="Ex: Gestion du site web&#10;Contrats clients"
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Redevabilités <span className="font-normal text-gray-600">(une par ligne)</span>
                  </label>
                  <textarea
                    name="accountabilities"
                    defaultValue={space.accountabilities.join("\n")}
                    rows={4}
                    placeholder="Ex: Publier les comptes-rendus de réunion&#10;Maintenir la roadmap à jour"
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Enregistrer
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                {space.purpose ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Raison d&apos;être</p>
                    <p className="text-sm text-gray-300">{space.purpose}</p>
                  </div>
                ) : null}
                {space.domains.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Domaines</p>
                    <ul className="space-y-1">
                      {space.domains.map((d, i) => (
                        <li key={i} className="text-sm text-gray-300 flex gap-2">
                          <span className="text-gray-600 shrink-0">·</span>{d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {space.accountabilities.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Redevabilités</p>
                    <ul className="space-y-1">
                      {space.accountabilities.map((a, i) => (
                        <li key={i} className="text-sm text-gray-300 flex gap-2">
                          <span className="text-gray-600 shrink-0">·</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!space.purpose && space.domains.length === 0 && space.accountabilities.length === 0 && (
                  <p className="text-sm text-gray-600 italic">Aucune gouvernance définie.</p>
                )}
              </div>
            )}
          </div>

          {/* Roles */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Rôles ({space.roles.length})
              </h2>
            </div>

            {space.roles.length > 0 && (
              <div className="space-y-3 mb-4">
                {space.roles.map((role) => {
                  const assignedUserIds = new Set(role.assignments.map((a) => a.userId));
                  const assignableMembers = orgMembers.filter(
                    (m) => !assignedUserIds.has(m.userId)
                  );
                  const assignMember = assignRoleMember.bind(null, role.id);
                  const deleteThisRole = deleteRole.bind(null, role.id);
                  const updateThisRole = updateRole.bind(null, role.id);

                  return (
                    <div key={role.id} className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
                      {/* Role header */}
                      <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-gray-800/60">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-medium text-white text-sm">{role.name}</span>
                          {role.assignments.map((a) => (
                            <span key={a.id} className="inline-flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-900/30 border border-indigo-800/40 rounded-full px-2.5 py-0.5">
                              <Avatar name={a.user.name} image={a.user.image} size="xs" />
                              {a.user.name?.split(" ")[0]}
                              {canManage && (
                                <form action={removeRoleAssignment.bind(null, a.id)} className="inline">
                                  <button type="submit" className="ml-1 text-indigo-500 hover:text-red-400 transition-colors leading-none">×</button>
                                </form>
                              )}
                            </span>
                          ))}
                          {role.assignments.length === 0 && (
                            <span className="text-xs text-gray-600 italic">Non assigné</span>
                          )}
                        </div>
                        {canManage && (
                          <form action={deleteThisRole}>
                            <button type="submit" className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                              Supprimer
                            </button>
                          </form>
                        )}
                      </div>

                      {/* Role details */}
                      <div className="px-5 py-3 space-y-2">
                        {role.purpose && (
                          <p className="text-xs text-gray-400 italic">{role.purpose}</p>
                        )}
                        {role.domains.length > 0 && (
                          <div>
                            <span className="text-xs text-gray-600 font-medium">Domaines : </span>
                            <span className="text-xs text-gray-400">{role.domains.join(", ")}</span>
                          </div>
                        )}
                        {role.accountabilities.length > 0 && (
                          <div>
                            <span className="text-xs text-gray-600 font-medium">Redevabilités : </span>
                            <ul className="mt-1 space-y-0.5">
                              {role.accountabilities.map((a, i) => (
                                <li key={i} className="text-xs text-gray-400 flex gap-2">
                                  <span className="text-gray-600 shrink-0">·</span>{a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Assign member + edit form */}
                      {canManage && (
                        <div className="border-t border-gray-800/60 px-5 py-3 space-y-3">
                          {assignableMembers.length > 0 && (
                            <form action={assignMember} className="flex gap-2 flex-wrap items-center">
                              <span className="text-xs text-gray-500 shrink-0">Assigner :</span>
                              <select
                                name="userId"
                                className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 flex-1 min-w-0"
                              >
                                {assignableMembers.map((m) => (
                                  <option key={m.userId} value={m.userId}>
                                    {m.user.name ?? m.user.email}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="rounded-lg bg-indigo-900/50 border border-indigo-800 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900 transition-colors whitespace-nowrap"
                              >
                                Assigner
                              </button>
                            </form>
                          )}
                          <details className="group">
                            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors list-none flex items-center gap-1">
                              <span className="group-open:hidden">▸</span>
                              <span className="hidden group-open:inline">▾</span>
                              Modifier ce rôle
                            </summary>
                            <form action={updateThisRole} className="mt-3 space-y-3">
                              <input
                                name="name"
                                defaultValue={role.name}
                                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                                placeholder="Nom du rôle"
                              />
                              <textarea
                                name="purpose"
                                defaultValue={role.purpose ?? ""}
                                rows={2}
                                placeholder="Raison d'être du rôle…"
                                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                              />
                              <textarea
                                name="domains"
                                defaultValue={role.domains.join("\n")}
                                rows={2}
                                placeholder="Domaines (un par ligne)"
                                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                              />
                              <textarea
                                name="accountabilities"
                                defaultValue={role.accountabilities.join("\n")}
                                rows={3}
                                placeholder="Redevabilités (une par ligne)"
                                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                              />
                              <button
                                type="submit"
                                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                              >
                                Enregistrer
                              </button>
                            </form>
                          </details>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add role */}
            {canManage && (
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {space.roles.length === 0 ? "Créer le premier rôle" : "Ajouter un rôle"}
                </p>
                <form action={addRole} className="flex gap-3 flex-wrap items-end">
                  <input
                    name="name"
                    required
                    placeholder="Nom du rôle (ex: Dev Ops, Facilitateur…)"
                    className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors whitespace-nowrap"
                  >
                    + Créer
                  </button>
                </form>
              </div>
            )}

            {!canManage && space.roles.length === 0 && (
              <p className="text-sm text-gray-600 italic text-center py-4">
                Aucun rôle défini dans ce cercle.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── RÉUNIONS ─────────────────────────────────────────────────────────── */}
      {tab === "reunions" && (
        <div>
          {isAdmin && (
            <div className="mb-5 rounded-xl bg-gray-900 border border-gray-800 p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Confidentialité des réunions
                </p>
                <p className="text-xs text-gray-600">
                  {space.isPrivate
                    ? "CR réservés aux membres de ce cercle."
                    : "CR accessibles à tous les membres de l'organisation."}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={setPrivateFalse}>
                  <button type="submit" className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${!space.isPrivate ? "bg-green-900/50 text-green-300 border border-green-800" : "text-gray-500 border border-gray-700 hover:border-gray-600 hover:text-gray-300"}`}>
                    Public
                  </button>
                </form>
                <form action={setPrivateTrue}>
                  <button type="submit" className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${space.isPrivate ? "bg-orange-900/50 text-orange-300 border border-orange-800" : "text-gray-500 border border-gray-700 hover:border-gray-600 hover:text-gray-300"}`}>
                    Confidentiel
                  </button>
                </form>
              </div>
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {space.meetings.length} réunion{space.meetings.length !== 1 ? "s" : ""}
            </p>
            <Link href="/meetings" className="text-xs text-indigo-400 hover:text-indigo-300">
              + Nouvelle
            </Link>
          </div>

          {!canSeeMeetings ? (
            <div className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-8 text-center">
              <p className="text-sm text-gray-600">Réunions confidentielles — réservées aux membres.</p>
            </div>
          ) : space.meetings.length === 0 ? (
            <div className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-8 text-center">
              <p className="text-sm text-gray-600">Aucune réunion dans ce cercle.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {openMeetings.map((m) => <MeetingRow key={m.id} meeting={m} />)}
              {draftMeetings.map((m) => <MeetingRow key={m.id} meeting={m} />)}
              {closedMeetings.slice(0, 15).map((m) => <MeetingRow key={m.id} meeting={m} />)}
            </div>
          )}
        </div>
      )}

      {/* ── MEMBRES ──────────────────────────────────────────────────────────── */}
      {tab === "membres" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {space.members.length} membre{space.members.length !== 1 ? "s" : ""}
              </p>
            </div>
            {space.members.length > 0 ? (
              <div className="divide-y divide-gray-800">
                {space.members.map((m) => {
                  const remove = removeSpaceMember.bind(null, space.id, m.userId);
                  const makeLeader = updateSpaceMemberRole.bind(null, space.id, m.userId, "lead");
                  const makeMember = updateSpaceMemberRole.bind(null, space.id, m.userId, "member");
                  const isSelf = m.userId === session.user.id;
                  return (
                    <div key={m.id} className="flex items-center justify-between px-5 py-3 gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.user.name} image={m.user.image} size="md" />
                        <div>
                          <p className="text-sm font-medium text-white">
                            {m.user.name ?? "—"}
                            {isSelf && <span className="ml-2 text-xs text-gray-500">(vous)</span>}
                          </p>
                          <p className="text-xs text-gray-500">{m.user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <RoleBadge role={m.role} />
                        {canManage && !isSelf && (
                          <>
                            {m.role === "member" ? (
                              <form action={makeLeader}>
                                <button type="submit" className="text-xs text-gray-500 hover:text-indigo-400 transition-colors">
                                  → Leader
                                </button>
                              </form>
                            ) : (
                              <form action={makeMember}>
                                <button type="submit" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                                  → Membre
                                </button>
                              </form>
                            )}
                            <form action={remove}>
                              <button type="submit" className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                                Retirer
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-5 py-8 text-sm text-gray-600 text-center">Aucun membre dans ce cercle.</p>
            )}
          </div>

          {canManage && addableMembers.length > 0 && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
              <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ajouter un membre</h2>
              <form action={addMember} className="flex flex-wrap gap-3 items-end">
                <select
                  name="userId"
                  className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 flex-1"
                >
                  {addableMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name ?? m.user.email}
                    </option>
                  ))}
                </select>
                <select
                  name="role"
                  className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="member">Membre</option>
                  <option value="lead">Leader</option>
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Ajouter
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ── SYNCHRO ──────────────────────────────────────────────────────────── */}
      {tab === "synchro" && (
        <SyncSettingsTab
          spaceId={space.id}
          canManage={canManage}
          syncOverride={syncOverride}
          orgSyncEnabled={orgSyncEnabled}
          indicators={space.indicators.map((ind) => ({
            id: ind.id,
            name: ind.name,
            unit: ind.unit,
            frequency: ind.frequency,
            lastValue: ind.values[0]
              ? { value: ind.values[0].value, recordedAt: ind.values[0].recordedAt }
              : null,
          }))}
          checklistItems={space.checklistItems.map((c) => ({ id: c.id, title: c.title }))}
          projects={space.projects.map((p) => ({
            id: p.id, name: p.name, description: p.description, status: p.status,
          }))}
        />
      )}
    </AppShell>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function MeetingRow({ meeting: m }: {
  meeting: {
    id: string; title: string | null; date: Date; status: string;
    durationMinutes: number | null; isPrivate: boolean | null;
  };
}) {
  const dateLabel = m.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const displayName = m.title ?? `Triage · ${dateLabel}`;
  const statusColor: Record<string, string> = {
    open: "bg-green-500 animate-pulse", draft: "bg-yellow-500", closed: "bg-gray-600",
  };
  return (
    <Link
      href={`/meetings/${m.id}`}
      className="flex items-center justify-between rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 hover:border-gray-700 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor[m.status] ?? "bg-gray-600"}`} />
        <span className="text-sm text-gray-300 group-hover:text-white transition-colors truncate">{displayName}</span>
        {m.isPrivate && <span className="text-xs text-gray-600">🔒</span>}
      </div>
      <span className="text-xs text-gray-600 shrink-0 ml-3">{STATUS_LABELS[m.status] ?? m.status}</span>
    </Link>
  );
}

function Avatar({ name, image, size = "md" }: {
  name: string | null; image: string | null; size?: "xs" | "md";
}) {
  const sz = size === "xs" ? "h-4 w-4 text-[9px]" : "h-8 w-8 text-xs";
  const ini = name ? name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "?";
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name ?? ""} className={`${sz} rounded-full object-cover shrink-0`} />;
  }
  return (
    <span className={`${sz} rounded-full bg-indigo-800 text-indigo-200 font-semibold flex items-center justify-center shrink-0`}>
      {ini}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "lead") {
    return <span className="rounded-full border border-indigo-800 bg-indigo-900/40 px-2.5 py-0.5 text-xs font-medium text-indigo-300">Leader</span>;
  }
  return <span className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400">Membre</span>;
}
