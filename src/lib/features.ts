export type FeatureKey =
  | "actions"        // dashboard /actions + type action dans les outputs
  | "projects"       // dashboard /projects + type projet
  | "governance"     // type gouvernance (Holacracy)
  | "roles"          // gestion des rôles par espace
  | "confidentiality" // espaces/réunions privés
  | "pistes_panel"   // panneau 6 pistes GTD en réunion
  | "recap_email"    // bouton envoi CR email
  | "projector_mode" // mode projecteur
  | "circle_view";   // visualisation graphique des cercles et instances

export const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
  actions: true,
  projects: true,
  governance: true,
  roles: false,
  confidentiality: false,
  pistes_panel: true,
  recap_email: true,
  projector_mode: true,
  circle_view: true,
};

export const FEATURE_LABELS: Record<FeatureKey, { label: string; description: string }> = {
  actions: {
    label: "Actions",
    description: "Tableau de bord des actions assignées et type « Action » dans les outputs.",
  },
  projects: {
    label: "Projets",
    description: "Tableau de bord des projets ouverts et type « Projet » dans les outputs.",
  },
  governance: {
    label: "Gouvernance",
    description: "Type « Gouvernance » dans les outputs (spécifique Holacracy).",
  },
  roles: {
    label: "Gestion des rôles",
    description: "Rôles et attributions par espace (cercles, projets). Avancé Holacracy.",
  },
  confidentiality: {
    label: "Confidentialité",
    description: "Espaces et réunions en accès restreint aux membres.",
  },
  pistes_panel: {
    label: "Panneau 6 pistes",
    description: "Panneau GTD/Holacracy affiché pendant la facilitation.",
  },
  recap_email: {
    label: "Compte-rendu email",
    description: "Bouton d'envoi du compte-rendu par email à la fin d'une réunion.",
  },
  projector_mode: {
    label: "Mode projecteur",
    description: "Vue plein écran pour afficher la réunion en cours sur un écran partagé.",
  },
  circle_view: {
    label: "Vue en cercles",
    description: "Visualisation graphique des cercles et instances de l'organisation avec leurs leaders.",
  },
};

export function hasFeature(
  org: { features: unknown },
  key: FeatureKey
): boolean {
  const raw = org.features;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return FEATURE_DEFAULTS[key];
  }
  const val = (raw as Record<string, unknown>)[key];
  if (typeof val === "boolean") return val;
  return FEATURE_DEFAULTS[key];
}

export function getOrgFeatures(org: { features: unknown }): Record<FeatureKey, boolean> {
  return Object.fromEntries(
    (Object.keys(FEATURE_DEFAULTS) as FeatureKey[]).map((k) => [k, hasFeature(org, k)])
  ) as Record<FeatureKey, boolean>;
}
