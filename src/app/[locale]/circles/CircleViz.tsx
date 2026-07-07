"use client";

import { useEffect, useState } from "react";
import { useRouter, Link } from "@/i18n/navigation";

export type VizUser = { id: string; name: string | null; image: string | null };

export type VizSpace = {
  id: string;
  name: string;
  type: "circle" | "instance" | "project";
  purpose: string | null;
  leader: VizUser | null;
  childCount: number;
  roleCount: number;
};

export type VizRole = {
  id: string;
  name: string;
  purpose: string | null;
  domains: string[];
  accountabilities: string[];
  holders: VizUser[];
};

type Selection =
  | { kind: "space"; space: VizSpace }
  | { kind: "role"; role: VizRole }
  | null;

const ROLE_COLOR = "#f59e0b"; // ambre — distingue les rôles des cercles/instances

const TYPE_LABELS: Record<VizSpace["type"], string> = {
  circle: "Cercle",
  instance: "Instance",
  project: "Projet",
};

const PALETTE: Record<VizSpace["type"], string[]> = {
  circle:   ["#6366f1","#8b5cf6","#a855f7","#7c3aed","#4f46e5","#6d28d9"],
  instance: ["#0ea5e9","#14b8a6","#06b6d4","#0284c7","#0891b2","#0d9488"],
  project:  ["#10b981","#22c55e","#84cc16","#16a34a","#15803d","#166534"],
};

function getColor(space: VizSpace, indexInType: number): string {
  return PALETTE[space.type][indexInType % PALETTE[space.type].length];
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function splitLines(name: string, maxChar: number): string[] {
  const words = name.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length + w.length > maxChar && cur) { lines.push(cur); cur = w; }
    else { cur += (cur ? " " : "") + w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function computeLayout(n: number): { ringR: number; itemR: number } {
  if (n <= 1) return { ringR: 0, itemR: 160 };
  if (n === 2) return { ringR: 120, itemR: 100 };
  if (n <= 3) return { ringR: 138, itemR: 88 };
  if (n <= 4) return { ringR: 150, itemR: 80 };
  if (n <= 5) return { ringR: 157, itemR: 73 };
  if (n <= 6) return { ringR: 162, itemR: 65 };
  if (n <= 8) return { ringR: 170, itemR: 55 };
  return { ringR: 176, itemR: 46 };
}

function AvatarCircle({
  cx, cy, r, user, isMe, color,
}: {
  cx: number; cy: number; r: number;
  user: VizUser | null; isMe: boolean; color: string;
}) {
  const clipId = `clip-${cx.toFixed(0)}-${cy.toFixed(0)}`;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={r + 1.5} fill={isMe ? color : "#1e293b"} opacity={isMe ? 0.6 : 1} />
      <circle cx={cx} cy={cy} r={r} fill={user ? `${color}33` : "#0f172a"} />
      {user?.image ? (
        <>
          <defs><clipPath id={clipId}><circle cx={cx} cy={cy} r={r} /></clipPath></defs>
          <image href={user.image} x={cx - r} y={cy - r} width={r * 2} height={r * 2} clipPath={`url(#${clipId})`} />
        </>
      ) : user ? (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill={isMe ? "#c7d2fe" : "#cbd5e1"} fontSize={r * 0.65} fontWeight="700"
          fontFamily="-apple-system,BlinkMacSystemFont,sans-serif">
          {initials(user.name)}
        </text>
      ) : (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill="#475569" fontSize={r * 1.1}
          fontFamily="-apple-system,BlinkMacSystemFont,sans-serif">+</text>
      )}
    </g>
  );
}

function SpaceNode({
  space, x, y, r, color, isMe, isSelected, onClick, onOpen,
}: {
  space: VizSpace; x: number; y: number; r: number; color: string;
  isMe: boolean; isSelected: boolean; onClick: () => void; onOpen: () => void;
}) {
  const hasChildren = space.childCount > 0;
  const lines = splitLines(space.name, r > 80 ? 13 : r > 65 ? 11 : 9);
  const lh = r > 80 ? 13 : 11;
  const totalH = lines.length * lh;
  const nameTopY = y - totalH / 2 - (r > 70 ? 12 : 8);
  const typeY = nameTopY + totalH + (r > 70 ? 6 : 4);
  const avCy = y + r - (r > 70 ? 24 : 18);
  const avR = r > 70 ? 12 : 9;
  const firstName = space.leader?.name?.split(" ")[0] ?? "";

  return (
    <g onClick={onClick} onDoubleClick={onOpen} style={{ cursor: "pointer" }}>
      {/* Dashed outer ring = a des sous-espaces */}
      {hasChildren && (
        <circle cx={x} cy={y} r={r + 6}
          fill="none" stroke={color} strokeWidth={1}
          strokeDasharray="4 3" opacity={0.35}
        />
      )}
      <circle cx={x} cy={y} r={r} fill={`${color}${isSelected ? "33" : "1a"}`}
        stroke={color} strokeWidth={isSelected ? 3 : 1.5} />

      {lines.map((line, li) => (
        <text key={li} x={x} y={nameTopY + li * lh}
          textAnchor="middle" dominantBaseline="hanging"
          fill={color} fontSize={r > 80 ? 11 : r > 65 ? 10 : 9} fontWeight="600"
          fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" pointerEvents="none">
          {line}
        </text>
      ))}

      <text x={x} y={typeY} textAnchor="middle" dominantBaseline="hanging"
        fill={`${color}55`} fontSize={7}
        fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" pointerEvents="none">
        {TYPE_LABELS[space.type]}
        {hasChildren ? `  ·  ${space.childCount}↗` : ""}
      </text>

      <AvatarCircle cx={x} cy={avCy} r={avR} user={space.leader} isMe={isMe} color={color} />
      {firstName && (
        <text x={x} y={avCy + avR + 5} textAnchor="middle" dominantBaseline="hanging"
          fill={`${color}88`} fontSize={7}
          fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" pointerEvents="none">
          {firstName}
        </text>
      )}
    </g>
  );
}

function RoleNode({
  role, x, y, r, isMe, isSelected, onClick,
}: {
  role: VizRole; x: number; y: number; r: number;
  isMe: boolean; isSelected: boolean; onClick: () => void;
}) {
  const showText = r >= 16;
  const showAvatar = r >= 22 && role.holders.length > 0;
  const lines = showText ? splitLines(role.name, r > 34 ? 10 : 8) : [];
  const lh = 9;
  const totalH = lines.length * lh;
  const avR = r > 34 ? 9 : 7;
  const avCy = y + r - avR - 3;
  const nameTopY = y - totalH / 2 - (showAvatar ? 5 : 0);

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      {/* Zone de clic confortable pour les petites pastilles */}
      {r < 8 && <circle cx={x} cy={y} r={8} fill="transparent" />}
      <circle cx={x} cy={y} r={r}
        fill={isMe || isSelected ? `${ROLE_COLOR}40` : `${ROLE_COLOR}14`}
        stroke={ROLE_COLOR} strokeWidth={isSelected ? 2.5 : r < 8 ? 1 : 1.2} />
      {lines.map((line, li) => (
        <text key={li} x={x} y={nameTopY + li * lh}
          textAnchor="middle" dominantBaseline="hanging"
          fill={ROLE_COLOR} fontSize={r > 34 ? 8.5 : 7.5} fontWeight="600"
          fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" pointerEvents="none">
          {line}
        </text>
      ))}
      {showAvatar && (
        <AvatarCircle cx={x} cy={avCy} r={avR} user={role.holders[0]} isMe={isMe} color={ROLE_COLOR} />
      )}
    </g>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
      title="Copier le lien vers cette fiche"
    >
      {copied ? "✓ Copié" : "⧉ Copier le lien"}
    </button>
  );
}

function DrawerAvatar({ user }: { user: VizUser }) {
  if (user.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.image} alt={user.name ?? ""} className="h-6 w-6 rounded-full object-cover shrink-0" />;
  }
  return (
    <span className="h-6 w-6 rounded-full bg-indigo-800 text-indigo-200 text-[10px] font-semibold flex items-center justify-center shrink-0">
      {initials(user.name)}
    </span>
  );
}

export default function CircleViz({
  spaces, roles, currentUserId, brandColor, title, governanceHref, upHref,
  initialSelection = null,
}: {
  spaces: VizSpace[];
  roles: VizRole[];
  currentUserId: string;
  brandColor: string;
  title: string;
  governanceHref: string | null;
  upHref: string | null;
  initialSelection?: { kind: "space" | "role"; id: string } | null;
}) {
  const [selected, setSelected] = useState<Selection>(() => {
    if (initialSelection?.kind === "space") {
      const space = spaces.find((s) => s.id === initialSelection.id);
      if (space) return { kind: "space", space };
    } else if (initialSelection?.kind === "role") {
      const role = roles.find((r) => r.id === initialSelection.id);
      if (role) return { kind: "role", role };
    }
    return null;
  });
  const router = useRouter();

  // La sélection est reflétée dans l'URL (?circle= / ?role=) : un rôle ou un
  // cercle sélectionné devient un lien partageable, sans navigation.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("circle");
    url.searchParams.delete("role");
    if (selected?.kind === "space") url.searchParams.set("circle", selected.space.id);
    if (selected?.kind === "role") url.searchParams.set("role", selected.role.id);
    window.history.replaceState(null, "", url.toString());
  }, [selected]);

  const circles = spaces.filter((s) => s.type === "circle");
  const instances = spaces.filter((s) => s.type === "instance");
  const projects = spaces.filter((s) => s.type === "project");
  const nS = spaces.length;
  const nR = roles.length;
  const { ringR, itemR } = computeLayout(nS);

  // Les rôles occupent un anneau intérieur (ou l'anneau principal si le
  // cercle n'a pas de sous-espaces). Leur taille s'adapte au nombre : avec
  // beaucoup de rôles ils deviennent des pastilles, le nom passe dans le panneau.
  const roleRingR = nS === 0 ? (nR <= 6 ? 120 : 150) : Math.max(64, ringR - itemR - 36);
  const roleR = Math.min(
    nS === 0 ? 56 : 30,
    Math.max(4, (2 * Math.PI * roleRingR) / (2.6 * Math.max(nR, 1)))
  );

  const colorMap = new Map<string, string>();
  let ci = 0, ii = 0, pi = 0;
  for (const s of spaces) {
    if (s.type === "circle") colorMap.set(s.id, getColor(s, ci++));
    else if (s.type === "instance") colorMap.set(s.id, getColor(s, ii++));
    else colorMap.set(s.id, getColor(s, pi++));
  }

  const positions = spaces.map((_, i) => {
    if (nS <= 1) return { x: 250, y: 250 };
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / nS;
    return { x: 250 + ringR * Math.cos(angle), y: 250 + ringR * Math.sin(angle) };
  });

  const rolePositions = roles.map((_, i) => {
    if (nR <= 1 && nS === 0) return { x: 250, y: 250 };
    // Décalage angulaire d'un demi-pas pour ne pas s'aligner sur les sous-espaces
    const angle = -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / Math.max(nR, 1);
    return { x: 250 + roleRingR * Math.cos(angle), y: 250 + roleRingR * Math.sin(angle) };
  });

  function openSpace(space: VizSpace) {
    router.push(`/circles/${space.id}`);
  }

  const selectedSpaceId = selected?.kind === "space" ? selected.space.id : null;
  const selectedRoleId = selected?.kind === "role" ? selected.role.id : null;

  // 1er clic = sélection (panneau de détail), 2e clic sur le même nœud = entrer.
  function handleSpaceClick(space: VizSpace) {
    if (selectedSpaceId === space.id) openSpace(space);
    else setSelected({ kind: "space", space });
  }

  function handleRoleClick(role: VizRole) {
    if (selectedRoleId === role.id && governanceHref) router.push(governanceHref);
    else setSelected({ kind: "role", role });
  }

  // Membrane : referme le panneau s'il est ouvert, sinon remonte d'un niveau.
  function handleMembraneClick() {
    if (selected) setSelected(null);
    else if (upHref) router.push(upHref);
  }

  const sidebarSections: { label: string; items: VizSpace[] }[] = [
    { label: "Cercles", items: circles },
    { label: "Instances", items: instances },
    { label: "Projets", items: projects },
  ];

  return (
    <div className="flex h-full min-h-0 relative">
      {/* Sidebar — liste de navigation */}
      <div className="w-48 shrink-0 border-r border-gray-800 overflow-y-auto bg-gray-900/40 p-3 hidden md:block">
        {sidebarSections.map(({ label, items }) => items.length > 0 && (
          <div key={label}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-1 px-1">{label}</p>
            {items.map((s) => (
              <button key={s.id} onClick={() => handleSpaceClick(s)}
                onDoubleClick={() => openSpace(s)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left ${
                  selectedSpaceId === s.id ? "bg-gray-800 text-gray-100" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorMap.get(s.id) }} />
                <span className="truncate flex-1">{s.name}</span>
                {s.childCount > 0 && <span className="text-xs text-gray-600 shrink-0">{s.childCount}↗</span>}
              </button>
            ))}
          </div>
        ))}
        {roles.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 px-1">Rôles</p>
            {roles.map((r) => (
              <button key={r.id} onClick={() => handleRoleClick(r)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left ${
                  selectedRoleId === r.id ? "bg-gray-800 text-gray-100" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROLE_COLOR }} />
                <span className="truncate flex-1">{r.name}</span>
                {r.holders[0] && <span className="text-xs text-gray-600 shrink-0 truncate max-w-16">{r.holders[0].name?.split(" ")[0]}</span>}
              </button>
            ))}
          </>
        )}
      </div>

      {/* SVG canvas */}
      <div className="flex-1 relative flex items-center justify-center p-4 min-w-0 min-h-0">
        <svg viewBox="0 0 500 500"
          style={{ width: "min(500px, 100%)", height: "min(500px, calc(100vh - 260px))" }}>
          {/* Membrane du cercle courant : referme le panneau, sinon remonte d'un niveau */}
          <circle cx={250} cy={250} r={238}
            fill={`${brandColor}06`} stroke={`${brandColor}25`} strokeWidth={1.5}
            onClick={handleMembraneClick}
            style={!selected && upHref ? { cursor: "zoom-out" } : undefined}
          />
          <text x={250} y={484} textAnchor="middle" fill={`${brandColor}33`} fontSize={9}
            fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" pointerEvents="none">{title}</text>

          {nS === 0 && nR === 0 && (
            <text x={250} y={250} textAnchor="middle" dominantBaseline="middle"
              fill="#475569" fontSize={11}
              fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" pointerEvents="none">
              Aucun sous-cercle ni rôle
            </text>
          )}

          {spaces.map((space, i) => (
            <SpaceNode key={space.id} space={space}
              x={positions[i].x} y={positions[i].y} r={itemR}
              color={colorMap.get(space.id)!}
              isMe={space.leader?.id === currentUserId}
              isSelected={selectedSpaceId === space.id}
              onClick={() => handleSpaceClick(space)}
              onOpen={() => openSpace(space)}
            />
          ))}

          {roles.map((role, ri) => (
            <RoleNode key={role.id} role={role}
              x={rolePositions[ri].x} y={rolePositions[ri].y} r={roleR}
              isMe={role.holders.some((h) => h.id === currentUserId)}
              isSelected={selectedRoleId === role.id}
              onClick={() => handleRoleClick(role)}
            />
          ))}
        </svg>

        {/* Mini legend */}
        {!selected && (
          <div className="absolute top-3 right-3 text-[10px] text-gray-700 space-y-0.5 text-right pointer-events-none">
            <p>- - anneau = sous-cercles</p>
            {roles.length > 0 && <p><span style={{ color: `${ROLE_COLOR}88` }}>●</span> = rôle de ce cercle</p>}
            <p>1ᵉʳ clic = détails · 2ᵉ clic = entrer</p>
            {upHref && <p>clic sur la membrane = remonter</p>}
          </div>
        )}
      </div>

      {/* Panneau de détail */}
      {selected && (
        <div className="w-72 shrink-0 border-l border-gray-800 bg-gray-900 overflow-y-auto
          max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-10 max-md:shadow-2xl max-md:shadow-black/50">
          <div className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-2">
              {selected.kind === "space" ? (
                <span
                  className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    color: colorMap.get(selected.space.id),
                    borderColor: `${colorMap.get(selected.space.id)}55`,
                    background: `${colorMap.get(selected.space.id)}1a`,
                  }}
                >
                  {TYPE_LABELS[selected.space.type]}
                </span>
              ) : (
                <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  style={{ color: ROLE_COLOR, borderColor: `${ROLE_COLOR}55`, background: `${ROLE_COLOR}1a` }}>
                  Rôle
                </span>
              )}
              <div className="flex items-center gap-3">
                <CopyLinkButton />
                <button onClick={() => setSelected(null)}
                  className="text-gray-600 hover:text-gray-300 transition-colors leading-none text-lg" title="Fermer">
                  ×
                </button>
              </div>
            </div>

            <h3 className="text-base font-semibold text-white leading-snug">
              {selected.kind === "space" ? selected.space.name : selected.role.name}
            </h3>

            {selected.kind === "space" ? (
              <>
                {selected.space.purpose && (
                  <p className="text-xs text-gray-400 italic leading-relaxed">{selected.space.purpose}</p>
                )}
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Leader</p>
                  {selected.space.leader ? (
                    <div className="flex items-center gap-2">
                      <DrawerAvatar user={selected.space.leader} />
                      <span className="text-sm text-gray-300">{selected.space.leader.name}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 italic">Sans leader</p>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {selected.space.childCount} sous-cercle{selected.space.childCount !== 1 ? "s" : ""}
                  {" · "}
                  {selected.space.roleCount} rôle{selected.space.roleCount !== 1 ? "s" : ""}
                </p>
                <button
                  onClick={() => openSpace(selected.space)}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Entrer dans {selected.space.type === "circle" ? "le cercle" : selected.space.type === "instance" ? "l'instance" : "le projet"} →
                </button>
                <p className="text-[11px] text-gray-600 text-center">
                  ou cliquer une 2ᵉ fois sur le cercle dans la carte
                </p>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">
                    Titulaire{selected.role.holders.length > 1 ? "s" : ""}
                  </p>
                  {selected.role.holders.length > 0 ? (
                    <div className="space-y-1.5">
                      {selected.role.holders.map((h) => (
                        <div key={h.id} className="flex items-center gap-2">
                          <DrawerAvatar user={h} />
                          <span className="text-sm text-gray-300">{h.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 italic">Non attribué</p>
                  )}
                </div>
                {selected.role.purpose && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Raison d&apos;être</p>
                    <p className="text-xs text-gray-400 italic leading-relaxed">{selected.role.purpose}</p>
                  </div>
                )}
                {selected.role.domains.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Domaines</p>
                    <ul className="space-y-0.5">
                      {selected.role.domains.map((d, i) => (
                        <li key={i} className="text-xs text-gray-400 flex gap-2">
                          <span className="text-gray-600 shrink-0">·</span>{d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.role.accountabilities.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Redevabilités</p>
                    <ul className="space-y-0.5">
                      {selected.role.accountabilities.map((a, i) => (
                        <li key={i} className="text-xs text-gray-400 flex gap-2">
                          <span className="text-gray-600 shrink-0">·</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {governanceHref && (
                  <Link
                    href={governanceHref}
                    className="block w-full rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-500 hover:text-white transition-colors text-center"
                  >
                    Gérer dans la gouvernance →
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
