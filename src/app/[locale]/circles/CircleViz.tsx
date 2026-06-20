"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type VizSpace = {
  id: string;
  name: string;
  type: "circle" | "instance" | "project";
  leader: { id: string; name: string | null; image: string | null } | null;
  childCount: number;
  roleCount: number;
};

const PALETTE: Record<"circle" | "instance" | "project", string[]> = {
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
  user: VizSpace["leader"]; isMe: boolean; color: string;
}) {
  const clipId = `clip-${cx.toFixed(0)}-${cy.toFixed(0)}`;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={r + 1.5} fill={isMe ? color : "#1e293b"} opacity={isMe ? 0.6 : 1} />
      <circle cx={cx} cy={cy} r={r} fill={user ? `${color}33` : "#0f172a"} />
      {user?.image ? (
        <>
          <defs><clipPath id={clipId}><circle cx={cx} cy={cy} r={r} /></clipPath></defs>
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
  space, x, y, r, color, isMe, onEnter, onLeave, onClick,
}: {
  space: VizSpace; x: number; y: number; r: number; color: string;
  isMe: boolean; onEnter: () => void; onLeave: () => void; onClick: () => void;
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
    <g onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ cursor: "pointer" }}>
      {/* Dashed outer ring = a des sous-espaces */}
      {hasChildren && (
        <circle cx={x} cy={y} r={r + 6}
          fill="none" stroke={color} strokeWidth={1}
          strokeDasharray="4 3" opacity={0.35}
        />
      )}
      <circle cx={x} cy={y} r={r} fill={`${color}1a`} stroke={color} strokeWidth={1.5} />

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
        {space.type === "instance" ? "Instance" : "Cercle"}
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

export default function CircleViz({
  spaces, currentUserId, brandColor, orgName, parentId,
}: {
  spaces: VizSpace[];
  currentUserId: string;
  brandColor: string;
  orgName: string;
  parentId: string | null;
}) {
  const [hovered, setHovered] = useState<VizSpace | null>(null);
  const router = useRouter();

  const circles = spaces.filter((s) => s.type === "circle");
  const instances = spaces.filter((s) => s.type === "instance");
  const n = spaces.length;
  const { ringR, itemR } = computeLayout(n);

  const colorMap = new Map<string, string>();
  let ci = 0, ii = 0;
  for (const s of spaces) {
    if (s.type === "circle") colorMap.set(s.id, getColor(s, ci++));
    else if (s.type === "instance") colorMap.set(s.id, getColor(s, ii++));
    else colorMap.set(s.id, getColor(s, 0));
  }

  const positions = spaces.map((_, i) => {
    if (n <= 1) return { x: 250, y: 250 };
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: 250 + ringR * Math.cos(angle), y: 250 + ringR * Math.sin(angle) };
  });

  function handleClick(space: VizSpace) {
    if (space.childCount > 0) {
      router.push(`/circles?parent=${space.id}`);
    } else {
      router.push(`/spaces/${space.id}`);
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <div className="w-48 shrink-0 border-r border-gray-800 overflow-y-auto bg-gray-900/40 p-3">
        {parentId && (
          <a href="/circles"
            className="flex items-center gap-1.5 px-2 py-1.5 mb-3 rounded-lg text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
            ← Racine
          </a>
        )}
        {circles.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-1 px-1">Cercles</p>
            {circles.map((s) => (
              <button key={s.id} onClick={() => handleClick(s)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors text-left">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorMap.get(s.id) }} />
                <span className="truncate flex-1">{s.name}</span>
                {s.childCount > 0 && <span className="text-xs text-gray-600 shrink-0">{s.childCount}↗</span>}
              </button>
            ))}
          </>
        )}
        {instances.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 px-1">Instances</p>
            {instances.map((s) => (
              <button key={s.id} onClick={() => handleClick(s)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors text-left">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorMap.get(s.id) }} />
                <span className="truncate flex-1">{s.name}</span>
                {s.childCount > 0 && <span className="text-xs text-gray-600 shrink-0">{s.childCount}↗</span>}
              </button>
            ))}
          </>
        )}
      </div>

      {/* SVG canvas */}
      <div className="flex-1 relative flex items-center justify-center p-4 min-w-0 min-h-0">
        <svg viewBox="0 0 500 500"
          style={{ width: "min(500px, 100%)", height: "min(500px, calc(100vh - 220px))" }}>
          <circle cx={250} cy={250} r={238}
            fill={`${brandColor}06`} stroke={`${brandColor}25`} strokeWidth={1.5} />
          <text x={250} y={484} textAnchor="middle" fill={`${brandColor}33`} fontSize={9}
            fontFamily="-apple-system,BlinkMacSystemFont,sans-serif">{orgName}</text>

          {spaces.map((space, i) => (
            <SpaceNode key={space.id} space={space}
              x={positions[i].x} y={positions[i].y} r={itemR}
              color={colorMap.get(space.id)!}
              isMe={space.leader?.id === currentUserId}
              onEnter={() => setHovered(space)}
              onLeave={() => setHovered(null)}
              onClick={() => handleClick(space)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-center pointer-events-none whitespace-nowrap">
            <p className="text-sm font-semibold text-white">{hovered.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {hovered.type === "instance" ? "Instance" : "Cercle"}
              {hovered.leader ? ` · Leader : ${hovered.leader.name}` : " · Sans leader"}
              {hovered.childCount > 0 ? ` · ${hovered.childCount} sous-espace${hovered.childCount > 1 ? "s" : ""} → cliquer pour explorer` : " → cliquer pour ouvrir"}
              {hovered.roleCount > 0 ? ` · ${hovered.roleCount} rôle${hovered.roleCount > 1 ? "s" : ""}` : ""}
            </p>
          </div>
        )}

        {/* Mini legend */}
        <div className="absolute top-3 right-3 text-[10px] text-gray-700 space-y-0.5 text-right">
          <p>- - anneau = sous-espaces</p>
          <p>clic = explorer ou ouvrir</p>
        </div>
      </div>
    </div>
  );
}
