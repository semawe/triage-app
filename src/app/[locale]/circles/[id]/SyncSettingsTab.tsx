import { updateSpaceFeature } from "@/actions/space";
import {
  createIndicator,
  updateIndicator,
  deleteIndicator,
} from "@/actions/indicator";
import {
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  reorderChecklistItem,
} from "@/actions/checklist";
import {
  createProject,
  updateProject,
  updateProjectStatus,
  deleteProject,
} from "@/actions/project";

type Indicator = {
  id: string;
  name: string;
  unit: string | null;
  frequency: string | null;
  lastValue: { value: number; recordedAt: Date } | null;
};
type ChecklistItem = { id: string; title: string };
type Project = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "on_hold" | "done";
};

const PROJECT_STATUS_LABELS: Record<Project["status"], string> = {
  active: "En cours",
  on_hold: "En pause",
  done: "Terminé",
};

const inputCls =
  "rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500";

/**
 * Onglet « Synchro » d'un espace : activation du module (override par espace)
 * et gestion des indicateurs, checklists et projets passés en revue pendant
 * la phase de synchronisation des réunions.
 */
export default function SyncSettingsTab({
  spaceId,
  canManage,
  syncOverride,
  orgSyncEnabled,
  indicators,
  checklistItems,
  projects,
}: {
  spaceId: string;
  canManage: boolean;
  syncOverride: boolean | null; // valeur de l'override espace, null = hérité
  orgSyncEnabled: boolean; // réglage au niveau de l'organisation
  indicators: Indicator[];
  checklistItems: ChecklistItem[];
  projects: Project[];
}) {
  const setInherit = updateSpaceFeature.bind(null, spaceId, "sync_phase", null);
  const setOn = updateSpaceFeature.bind(null, spaceId, "sync_phase", true);
  const setOff = updateSpaceFeature.bind(null, spaceId, "sync_phase", false);
  const addIndicator = createIndicator.bind(null, spaceId);
  const addChecklistItem = createChecklistItem.bind(null, spaceId);
  const addProject = createProject.bind(null, spaceId);

  const effective = syncOverride ?? orgSyncEnabled;

  return (
    <div className="space-y-6">
      {/* Module toggle (tri-état : hérité / activé / désactivé) */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Phase de synchro en réunion
          </p>
          <p className="text-xs text-gray-600">
            {effective
              ? "Les réunions de cet espace commencent par la revue des indicateurs, checklists et projets."
              : "Les réunions de cet espace démarrent directement sur le triage des points."}
          </p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <form action={setInherit}>
              <button
                type="submit"
                className={`px-2 py-0.5 rounded ${syncOverride === null ? "bg-gray-700 text-gray-300" : "hover:text-gray-400"}`}
                title={`Hérite du réglage de l'organisation (${orgSyncEnabled ? "activé" : "désactivé"})`}
              >
                Auto
              </button>
            </form>
            <form action={setOn}>
              <button
                type="submit"
                className={`px-2 py-0.5 rounded ${syncOverride === true ? "bg-green-900 text-green-300" : "hover:text-gray-400"}`}
              >
                Activé
              </button>
            </form>
            <form action={setOff}>
              <button
                type="submit"
                className={`px-2 py-0.5 rounded ${syncOverride === false ? "bg-orange-900 text-orange-300" : "hover:text-gray-400"}`}
              >
                Désactivé
              </button>
            </form>
          </div>
        ) : (
          <span className={`text-xs ${effective ? "text-green-500" : "text-gray-600"}`}>
            {effective ? "Activée" : "Désactivée"}
          </span>
        )}
      </div>

      {/* Indicateurs */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            📊 Indicateurs ({indicators.length})
          </p>
        </div>
        {indicators.length > 0 ? (
          <div className="divide-y divide-gray-800">
            {indicators.map((ind) => (
              <div key={ind.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {ind.name}
                      {ind.unit && <span className="ml-1.5 text-xs text-gray-500">({ind.unit})</span>}
                      {ind.frequency && (
                        <span className="ml-2 text-xs text-gray-600">{ind.frequency}</span>
                      )}
                    </p>
                    {ind.lastValue && (
                      <p className="text-xs text-gray-500">
                        Dernier relevé : {ind.lastValue.value.toLocaleString("fr-FR")}
                        {ind.unit ? ` ${ind.unit}` : ""}
                        <span className="text-gray-700">
                          {" "}· {ind.lastValue.recordedAt.toLocaleDateString("fr-FR")}
                        </span>
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <form action={deleteIndicator.bind(null, ind.id)}>
                      <button type="submit" className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                        Supprimer
                      </button>
                    </form>
                  )}
                </div>
                {canManage && (
                  <details className="group mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors list-none flex items-center gap-1">
                      <span className="group-open:hidden">▸</span>
                      <span className="hidden group-open:inline">▾</span>
                      Modifier
                    </summary>
                    <form action={updateIndicator.bind(null, ind.id)} className="mt-2 flex gap-2 flex-wrap items-end">
                      <input name="name" defaultValue={ind.name} placeholder="Nom" className={`${inputCls} flex-1 min-w-40`} />
                      <input name="unit" defaultValue={ind.unit ?? ""} placeholder="Unité" className={`${inputCls} w-24`} />
                      <input name="frequency" defaultValue={ind.frequency ?? ""} placeholder="Fréquence" className={`${inputCls} w-28`} />
                      <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
                        Enregistrer
                      </button>
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-gray-600 text-center">
            Aucun indicateur défini pour cet espace.
          </p>
        )}
        {canManage && (
          <div className="border-t border-gray-800 px-5 py-3">
            <form action={addIndicator} className="flex gap-2 flex-wrap items-end">
              <input name="name" required placeholder="Nouvel indicateur (ex: CA du mois)" className={`${inputCls} flex-1 min-w-40`} />
              <input name="unit" placeholder="Unité (€, %…)" className={`${inputCls} w-28`} />
              <input name="frequency" placeholder="Fréquence" className={`${inputCls} w-28`} />
              <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors whitespace-nowrap">
                + Ajouter
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Checklist */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            ✅ Checklist récurrente ({checklistItems.length})
          </p>
        </div>
        {checklistItems.length > 0 ? (
          <div className="divide-y divide-gray-800">
            {checklistItems.map((item, i) => (
              <div key={item.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                {canManage ? (
                  <>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <form action={reorderChecklistItem.bind(null, item.id, "up")}>
                        <button type="submit" disabled={i === 0} className="text-[10px] text-gray-600 hover:text-gray-300 disabled:opacity-30 leading-none">▲</button>
                      </form>
                      <form action={reorderChecklistItem.bind(null, item.id, "down")}>
                        <button type="submit" disabled={i === checklistItems.length - 1} className="text-[10px] text-gray-600 hover:text-gray-300 disabled:opacity-30 leading-none">▼</button>
                      </form>
                    </div>
                    <form action={updateChecklistItem.bind(null, item.id)} className="flex-1 flex gap-2 min-w-48">
                      <input name="title" defaultValue={item.title} className={`${inputCls} flex-1`} />
                      <button type="submit" className="text-xs text-gray-500 hover:text-indigo-400 transition-colors whitespace-nowrap">
                        Enregistrer
                      </button>
                    </form>
                    <form action={deleteChecklistItem.bind(null, item.id)}>
                      <button type="submit" className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                        Supprimer
                      </button>
                    </form>
                  </>
                ) : (
                  <span className="text-sm text-gray-300">{item.title}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-gray-600 text-center">
            Aucun item de checklist — les items définis ici sont recochés à chaque réunion.
          </p>
        )}
        {canManage && (
          <div className="border-t border-gray-800 px-5 py-3">
            <form action={addChecklistItem} className="flex gap-2 flex-wrap items-end">
              <input name="title" required placeholder="Nouvel item (ex: Factures du mois envoyées)" className={`${inputCls} flex-1 min-w-48`} />
              <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors whitespace-nowrap">
                + Ajouter
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Projets */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            🚧 Projets ({projects.length})
          </p>
        </div>
        {projects.length > 0 ? (
          <div className="divide-y divide-gray-800">
            {projects.map((p) => (
              <div key={p.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 flex-wrap">
                    {canManage ? (
                      <>
                        <div className="flex gap-1 text-xs">
                          {(Object.keys(PROJECT_STATUS_LABELS) as Project["status"][]).map((s) => (
                            <form key={s} action={updateProjectStatus.bind(null, p.id, s)}>
                              <button
                                type="submit"
                                className={`px-2 py-0.5 rounded ${
                                  p.status === s
                                    ? s === "active"
                                      ? "bg-green-900 text-green-300"
                                      : s === "on_hold"
                                        ? "bg-yellow-900 text-yellow-300"
                                        : "bg-gray-700 text-gray-300"
                                    : "text-gray-600 hover:text-gray-400"
                                }`}
                              >
                                {PROJECT_STATUS_LABELS[s]}
                              </button>
                            </form>
                          ))}
                        </div>
                        <form action={deleteProject.bind(null, p.id)}>
                          <button type="submit" className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                            Supprimer
                          </button>
                        </form>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">{PROJECT_STATUS_LABELS[p.status]}</span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <details className="group mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors list-none flex items-center gap-1">
                      <span className="group-open:hidden">▸</span>
                      <span className="hidden group-open:inline">▾</span>
                      Modifier
                    </summary>
                    <form action={updateProject.bind(null, p.id)} className="mt-2 space-y-2">
                      <input name="name" defaultValue={p.name} placeholder="Nom du projet" className={`${inputCls} w-full`} />
                      <textarea
                        name="description"
                        defaultValue={p.description ?? ""}
                        rows={2}
                        placeholder="Description (optionnel)"
                        className={`${inputCls} w-full resize-none`}
                      />
                      <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
                        Enregistrer
                      </button>
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-gray-600 text-center">
            Aucun projet suivi dans cet espace.
          </p>
        )}
        {canManage && (
          <div className="border-t border-gray-800 px-5 py-3">
            <form action={addProject} className="flex gap-2 flex-wrap items-end">
              <input name="name" required placeholder="Nouveau projet" className={`${inputCls} flex-1 min-w-40`} />
              <input name="description" placeholder="Description (optionnel)" className={`${inputCls} flex-1 min-w-40`} />
              <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors whitespace-nowrap">
                + Ajouter
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
