import { completeSyncPhase } from "@/actions/meeting";
import { logIndicatorValue } from "@/actions/indicator";
import { toggleChecklistCheck } from "@/actions/checklist";
import { Link } from "@/i18n/navigation";

type IndicatorRow = {
  id: string;
  name: string;
  unit: string | null;
  frequency: string | null;
  currentValue: { value: number; note: string | null } | null;
  previousValue: { value: number; recordedAt: Date } | null;
};

type ChecklistRow = {
  id: string;
  title: string;
  isDone: boolean;
  checkerName: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "on_hold" | "done";
};

const PROJECT_STATUS_BADGES: Record<ProjectRow["status"], { label: string; classes: string }> = {
  active: { label: "En cours", classes: "bg-green-900/40 text-green-400 border-green-800" },
  on_hold: { label: "En pause", classes: "bg-yellow-900/40 text-yellow-400 border-yellow-800" },
  done: { label: "Terminé", classes: "bg-gray-800 text-gray-400 border-gray-700" },
};

function formatValue(value: number, unit: string | null) {
  const num = Number.isInteger(value) ? value.toString() : value.toLocaleString("fr-FR");
  return unit ? `${num} ${unit}` : num;
}

/**
 * Phase de synchronisation (réunion tactique) : revue des indicateurs,
 * checklists et projets de l'espace, avant le démarrage du triage.
 */
export default function SyncPhase({
  meetingId,
  spaceId,
  spaceName,
  indicators,
  checklist,
  projects,
}: {
  meetingId: string;
  spaceId: string;
  spaceName: string;
  indicators: IndicatorRow[];
  checklist: ChecklistRow[];
  projects: ProjectRow[];
}) {
  const complete = completeSyncPhase.bind(null, meetingId);
  const isEmpty = indicators.length === 0 && checklist.length === 0 && projects.length === 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gray-900 border border-teal-900 p-6">
        <div className="text-xs font-medium text-teal-400/70 mb-1">Phase de synchronisation</div>
        <h2 className="text-2xl font-bold text-white leading-tight">Cockpit de {spaceName}</h2>
        <p className="mt-1 text-sm text-gray-500">
          Indicateurs, checklists et projets — passez le cockpit en revue avant de démarrer le triage.
        </p>
      </div>

      {isEmpty && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-sm text-gray-500">
          Rien à passer en revue pour cet espace. Les indicateurs, checklists et projets se
          définissent depuis{" "}
          <Link href={`/spaces/${spaceId}`} className="underline hover:text-gray-300">
            la page de l&apos;espace
          </Link>
          .
        </div>
      )}

      {/* Indicateurs */}
      {indicators.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">📊 Indicateurs</p>
          </div>
          <div className="divide-y divide-gray-800">
            {indicators.map((ind) => {
              const log = logIndicatorValue.bind(null, meetingId, ind.id);
              return (
                <div key={ind.id} className="px-4 py-3 flex items-center gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">
                      {ind.name}
                      {ind.frequency && (
                        <span className="ml-2 text-xs text-gray-600">({ind.frequency})</span>
                      )}
                    </p>
                    {ind.previousValue && (
                      <p className="text-xs text-gray-500">
                        Précédent : {formatValue(ind.previousValue.value, ind.unit)}
                        <span className="text-gray-700">
                          {" "}· {ind.previousValue.recordedAt.toLocaleDateString("fr-FR")}
                        </span>
                      </p>
                    )}
                  </div>
                  <form action={log} className="flex items-center gap-2 flex-wrap">
                    <input
                      name="value"
                      required
                      inputMode="decimal"
                      defaultValue={ind.currentValue?.value ?? ""}
                      placeholder={ind.unit ? `Valeur (${ind.unit})` : "Valeur"}
                      className="w-28 rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-600"
                    />
                    <input
                      name="note"
                      defaultValue={ind.currentValue?.note ?? ""}
                      placeholder="Note (optionnel)"
                      className="w-44 rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-600"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-teal-600 hover:text-white transition-colors"
                    >
                      {ind.currentValue ? "Corriger" : "Relever"}
                    </button>
                    {ind.currentValue && <span className="text-xs text-teal-500">✓</span>}
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Checklist */}
      {checklist.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">✅ Checklist</p>
          </div>
          <div className="divide-y divide-gray-800">
            {checklist.map((item) => {
              const toggle = toggleChecklistCheck.bind(null, meetingId, item.id);
              return (
                <form key={item.id} action={toggle}>
                  <button
                    type="submit"
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-800/50 transition-colors"
                  >
                    <span
                      className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center text-xs ${
                        item.isDone
                          ? "bg-teal-700 border-teal-600 text-white"
                          : "border-gray-600 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className={`flex-1 text-sm ${item.isDone ? "text-gray-500 line-through" : "text-gray-200"}`}>
                      {item.title}
                    </span>
                    {item.isDone && item.checkerName && (
                      <span className="text-xs text-gray-600">{item.checkerName}</span>
                    )}
                  </button>
                </form>
              );
            })}
          </div>
        </div>
      )}

      {/* Projets */}
      {projects.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">🚧 Projets</p>
            <Link
              href={`/spaces/${spaceId}`}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Gérer →
            </Link>
          </div>
          <div className="divide-y divide-gray-800">
            {projects.map((p) => {
              const badge = PROJECT_STATUS_BADGES[p.status];
              return (
                <div key={p.id} className="px-4 py-3 flex items-start gap-3">
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.classes}`}>
                    {badge.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <form action={complete}>
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-8 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Démarrer le triage →
          </button>
        </form>
      </div>
    </div>
  );
}
