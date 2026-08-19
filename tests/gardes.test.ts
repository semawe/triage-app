/**
 * L'invariant du contrôle d'accès — vérifié sur le code, pas sur la mémoire.
 *
 * `src/proxy.ts` ne vérifie aucune identité, et c'est délibéré : il tourne sur le
 * runtime edge, sans accès à la base, donc il ne peut ni lire une session ni
 * constater une révocation (même raisonnement que l'Académie, qui cite la faille
 * de contournement des middlewares d'authentification de Next). L'autorité est
 * donc AILLEURS : dans chaque page, chaque action serveur et chaque route d'API,
 * une par une.
 *
 * Une règle « une par une » ne tient que si quelque chose la compte. Écrite en
 * commentaire, elle tient jusqu'au prochain fichier ajouté un vendredi soir : le
 * fichier non gardé ne casse rien, ne lève rien, et rend une page ouverte à
 * l'anonyme sans qu'aucun test n'en parle. Ce fichier-ci est ce quelque chose.
 *
 * Il énumère les points d'entrée réels du dépôt et exige de chacun qu'il atteigne
 * une garde nommée, directement ou par un helper local du même fichier. Ce qui ne
 * peut pas en atteindre est inscrit dans `PORTES_PUBLIQUES` avec son motif écrit :
 * la liste est courte, elle se relit, et une entrée qu'on y ajoute est un geste
 * visible en revue — c'est tout ce qu'on demande à cet invariant.
 *
 * Ce qu'il ne prouve pas : que la garde atteinte soit LA BONNE. Qu'un point de
 * gouvernance exige le lead du cercle et pas seulement l'appartenance à l'org,
 * seul un test de comportement l'établit — `confidentialite.test.ts`,
 * `autorisations.test.ts`, `facturation.test.ts` s'en chargent. Celui-ci répond à
 * une question plus étroite et plus facile à perdre de vue : « reste-t-il une
 * porte sans serrure ? »
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = new URL("..", import.meta.url).pathname;

/**
 * Les gardes nommées du dépôt : les fonctions qui établissent réellement
 * l'identité de l'appelant, chacune en interrogeant la base.
 *
 *  - `requireAuth` / `requireOrg` / `requireOrgForBilling` / `requireMeetingAccess`
 *    / `requireSuperAdmin` — src/lib/session.ts, membre authentifié ;
 *  - `requireBillingAdmin` — src/lib/session.ts, administrateur d'une organisation
 *    NOMMÉE : les écrans de facturation sont multi-organisations, et l'organisation
 *    visée doit venir de l'écran, jamais du cookie d'organisation active ;
 *  - `canManageSpace` — src/lib/authz.ts, admin d'org ou lead de cercle ;
 *  - `resolveParticipant` / `getGuestForMeeting` / `getGuestByToken` — src/lib/guest.ts,
 *    porteur d'un jeton d'invité valide, la seule identité sans session ;
 *  - `auth` — l'appel NextAuth brut. Il établit l'identité mais AUCUNE
 *    autorisation : les quelques appelants qui s'en servent (src/actions/org.ts,
 *    les pages d'accueil et d'adhésion) enchaînent à la main sur une recherche
 *    d'appartenance. Il compte comme garde pour cet invariant, pas comme modèle.
 *  - `constructEvent` — la vérification de signature d'un webhook Stripe. Autre
 *    mécanisme, même fonction : établir qui parle avant d'écrire.
 */
const GARDES = [
  "requireAuth",
  "requireOrg",
  "requireOrgForBilling",
  "requireBillingAdmin",
  "requireMeetingAccess",
  "requireSuperAdmin",
  "canManageSpace",
  "resolveParticipant",
  "getGuestForMeeting",
  "getGuestByToken",
  "auth",
  "constructEvent",
];

/**
 * Les portes qui n'atteignent aucune garde, et pourquoi. Toute entrée porte un
 * motif : une porte publique sans motif écrit est un oubli déguisé en décision.
 *
 * Attention particulière aux `layout.tsx` : ils rendent à chaque requête, et le
 * jour où l'un d'eux lira une donnée d'organisation, son motif ci-dessous
 * deviendra faux sans que rien ne le signale. Un layout qui touche à la base sort
 * de cette liste et prend une garde.
 */
const PORTES_PUBLIQUES: Record<string, string> = {
  "src/app/[locale]/login/page.tsx":
    "Écran de connexion : son visiteur n'a par définition pas de session. Composant client, il n'accorde rien et n'affiche aucune donnée.",
  "src/app/[locale]/mentions-legales/page.tsx":
    "Mentions légales : contenu statique, public par obligation réglementaire.",
  "src/app/[locale]/spaces/page.tsx":
    "Redirection pure vers /circles (les espaces ont fusionné avec les cercles). Ne lit ni n'écrit aucune donnée ; la garde est sur la cible.",
  "src/app/[locale]/spaces/[id]/page.tsx":
    "Redirection pure vers /circles/[id]. Même motif : la garde est sur la page canonique.",
  "src/app/layout.tsx":
    "Layout racine : il pose <html>, les fontes et la balise d'enregistrement du service worker, et lit `x-nonce` dans les en-têtes. Il ne touche pas à la base et ne rend aucune donnée d'organisation.",
  "src/app/[locale]/layout.tsx":
    "Layout de langue : il valide la langue de l'URL et charge les traductions, qui sont les mêmes pour tout le monde. Aucun accès à la base, aucune donnée d'organisation. Les pages qu'il enveloppe portent chacune leur garde.",
  "src/app/api/health/route.ts":
    "Sonde du déploiement bleu/vert, interrogée avant que le proxy ne bascule. Ne révèle que le nom de l'application et n'accède pas à la base : la lui fermer rendrait le déploiement dépendant d'une session.",
  "src/app/api/auth/[...nextauth]/route.ts":
    "Point d'entrée d'authentification lui-même : c'est lui qui établit la session. Le handler NextAuth porte ses propres contrôles (état OAuth, PKCE, CSRF).",
};

/**
 * Les noms de fichiers par lesquels Next.js fait entrer une requête dans du code
 * à nous. `page` et `route` sont les évidents ; `layout` et `template` rendent à
 * chaque requête et peuvent lire la base tout autant, `default` sert les routes
 * parallèles. Toutes les extensions que Next accepte sont ici, pas seulement
 * celles employées aujourd'hui : au premier `page.jsx` du dépôt, un marcheur qui
 * ne connaît que `page.tsx` cesse silencieusement de voir la porte.
 */
const ENTREES_NEXT = ["page", "layout", "template", "default", "route"];
const EXTENSIONS = ["tsx", "ts", "jsx", "js", "mjs"];

/** Le fichier est-il un point d'entrée Next, quel que soit son suffixe ? */
export function estEntreeNext(nomDeFichier: string): boolean {
  const m = /^([^.]+)\.([^.]+)$/.exec(nomDeFichier);
  if (!m) return false;
  return ENTREES_NEXT.includes(m[1]) && EXTENSIONS.includes(m[2]);
}

function fichiersSous(dossier: string, garde: (f: string) => boolean): string[] {
  const absolu = join(RACINE, dossier);
  const sortie: string[] = [];
  const descendre = (rep: string) => {
    for (const entree of readdirSync(rep)) {
      const chemin = join(rep, entree);
      if (statSync(chemin).isDirectory()) descendre(chemin);
      else if (garde(entree)) sortie.push(relative(RACINE, chemin));
    }
  };
  descendre(absolu);
  return sortie.sort();
}

/**
 * Retire commentaires et littéraux de chaîne avant analyse.
 *
 * Sans ça, la phrase « Même garde que createProject » d'un commentaire de
 * src/actions/project.ts suffirait à faire passer un fichier pour gardé : le
 * détecteur validerait la documentation de la garde au lieu de la garde. Le
 * cas est vérifié en négatif plus bas.
 */
export function codeSeul(source: string): string {
  let sortie = "";
  let i = 0;
  type Etat = "code" | "ligne" | "bloc" | "guillemets" | "apostrophes" | "gabarit";
  let etat: Etat = "code";
  while (i < source.length) {
    const c = source[i];
    const suivant = source[i + 1];
    if (etat === "code") {
      if (c === "/" && suivant === "/") { etat = "ligne"; i += 2; continue; }
      if (c === "/" && suivant === "*") { etat = "bloc"; i += 2; continue; }
      if (c === '"') { etat = "guillemets"; i += 1; sortie += " "; continue; }
      if (c === "'") { etat = "apostrophes"; i += 1; sortie += " "; continue; }
      if (c === "`") { etat = "gabarit"; i += 1; sortie += " "; continue; }
      sortie += c;
      i += 1;
      continue;
    }
    if (etat === "ligne") {
      if (c === "\n") { etat = "code"; sortie += "\n"; }
      i += 1;
      continue;
    }
    if (etat === "bloc") {
      if (c === "*" && suivant === "/") { etat = "code"; i += 2; sortie += " "; continue; }
      if (c === "\n") sortie += "\n";
      i += 1;
      continue;
    }
    // Dans une chaîne : on saute l'échappement, et on garde les substitutions
    // `${...}` d'un gabarit, qui sont du code exécuté.
    if (c === "\\") { i += 2; continue; }
    if (etat === "gabarit" && c === "$" && suivant === "{") {
      let profondeur = 1;
      i += 2;
      while (i < source.length && profondeur > 0) {
        if (source[i] === "{") profondeur += 1;
        else if (source[i] === "}") profondeur -= 1;
        if (profondeur > 0) sortie += source[i];
        i += 1;
      }
      continue;
    }
    if ((etat === "guillemets" && c === '"') || (etat === "apostrophes" && c === "'") || (etat === "gabarit" && c === "`")) {
      etat = "code";
    }
    i += 1;
  }
  return sortie;
}

type Declaration = {
  nom: string;
  exportee: boolean;
  defaut: boolean;
  corps: string;
  /** Ce qui sépare la parenthèse fermante de l'accolade du corps. */
  annotation: string;
};

/**
 * Les déclarations de fonction de premier niveau, corps délimité par accolades.
 *
 * L'annotation de type de retour doit être sautée avant de chercher le corps :
 * sur `): Promise<{ ok: boolean }> {`, la première accolade rencontrée après la
 * parenthèse fermante appartient au TYPE, pas au corps. Le détecteur analysait
 * alors le type comme s'il était le corps — donc n'y voyait aucune garde, donc
 * accusait à tort quatre actions qui en portent une (relevé du 18/08). Le cas
 * est éprouvé en négatif plus bas.
 */
export function declarations(code: string): Declaration[] {
  const sortie: Declaration[] = [];
  const motif = /(export\s+)?(default\s+)?(async\s+)?function\s+([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(code))) {
    // Ferme la liste de paramètres.
    let i = motif.lastIndex;
    let parentheses = 1;
    while (i < code.length && parentheses > 0) {
      if (code[i] === "(") parentheses += 1;
      else if (code[i] === ")") parentheses -= 1;
      i += 1;
    }
    const finParametres = i;
    // Saute l'annotation de retour : on cherche l'accolade du corps, c'est-à-dire
    // la première qui ne soit ni dans un générique `<…>`, ni dans une parenthèse,
    // ni dans un crochet.
    let chevrons = 0;
    let crochets = 0;
    parentheses = 0;
    while (i < code.length) {
      const c = code[i];
      if (c === "<") chevrons += 1;
      else if (c === ">") chevrons = Math.max(0, chevrons - 1);
      else if (c === "(") parentheses += 1;
      else if (c === ")") parentheses = Math.max(0, parentheses - 1);
      else if (c === "[") crochets += 1;
      else if (c === "]") crochets = Math.max(0, crochets - 1);
      else if (c === "{" && chevrons === 0 && parentheses === 0 && crochets === 0) break;
      i += 1;
    }
    let accolades = 0;
    const debut = i;
    while (i < code.length) {
      if (code[i] === "{") accolades += 1;
      else if (code[i] === "}") {
        accolades -= 1;
        if (accolades === 0) { i += 1; break; }
      }
      i += 1;
    }
    sortie.push({
      nom: m[4],
      exportee: !!m[1],
      defaut: !!m[2],
      corps: code.slice(debut, i),
      annotation: code.slice(finParametres, debut),
    });
  }
  return sortie;
}

/** Les identifiants appelés dans un corps de fonction. */
function appels(corps: string): string[] {
  const noms = new Set<string>();
  const motif = /([A-Za-z0-9_$]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(corps))) noms.add(m[1]);
  // `stripe.webhooks.constructEvent(...)` : la propriété appelée suffit.
  return [...noms];
}

/**
 * Une garde est-elle atteinte depuis ce corps, éventuellement via un helper
 * local du même fichier ? Suit les helpers (`authForProject`,
 * `requireGuestManager`) qui portent la garde pour plusieurs actions.
 */
export function atteintUneGarde(
  corps: string,
  locales: Map<string, string>,
  vus = new Set<string>()
): boolean {
  const nommes = appels(corps);
  if (nommes.some((n) => GARDES.includes(n))) return true;
  for (const n of nommes) {
    if (vus.has(n)) continue;
    const corpsLocal = locales.get(n);
    if (!corpsLocal) continue;
    vus.add(n);
    if (atteintUneGarde(corpsLocal, locales, vus)) return true;
  }
  return false;
}

/** Les points d'entrée d'un fichier, et si chacun atteint une garde. */
function pointsDEntree(chemin: string): { nom: string; garde: boolean }[] {
  const code = codeSeul(readFileSync(join(RACINE, chemin), "utf8"));
  const decls = declarations(code);
  const locales = new Map(decls.map((d) => [d.nom, d.corps]));

  const estRoute = chemin.includes("/api/");
  const estAction = chemin.startsWith("src/actions/");

  const entrees = decls.filter((d) => {
    if (!d.exportee) return false;
    if (estAction) return true;
    if (estRoute) return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(d.nom);
    return d.defaut; // page : le composant exporté par défaut
  });

  return entrees.map((d) => ({
    nom: d.nom,
    garde: atteintUneGarde(d.corps, locales),
  }));
}

/**
 * Formes d'export que le détecteur ne sait pas lire, et qui pourraient pourtant
 * être des points d'entrée. Un `export const GET = handlers.GET` ou un
 * `export default async () => {}` traverse l'analyse sans être vu : l'invariant
 * s'effondrerait alors en silence, ce qui est pire que de ne pas exister. On
 * échoue donc sur la forme inconnue, au lieu de la déclarer gardée par défaut.
 *
 * Les réglages de module (`export const dynamic`, `runtime`, `metadata`,
 * `config`) ne sont pas des points d'entrée et ne sont pas visés. Les fichiers
 * inscrits dans `PORTES_PUBLIQUES` non plus : ils ont été lus à la main, et leur
 * motif écrit vaut la lecture que le détecteur ne sait pas faire.
 */
const FORMES_NON_LUES = [
  // Un handler de route, ou une action, posé sur une variable.
  /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/,
  /export\s+const\s+[A-Za-z0-9_$]+\s*(:[^=]*)?=\s*(async\s*)?(\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/,
  // Un export par défaut qui n'est pas une déclaration de fonction nommée.
  /export\s+default\s+(?!(async\s+)?function\s+[A-Za-z0-9_$])/,
];

/** La source porte-t-elle une forme d'export que l'analyse ne sait pas lire ? */
export function formeNonLue(source: string): boolean {
  const code = codeSeul(source);
  return FORMES_NON_LUES.some((motif) => motif.test(code));
}

/**
 * Annotation de retour en type objet nu (`): { ok: boolean } {`). Son accolade
 * ouvrante est indiscernable de celle du corps sans analyseur TypeScript
 * complet : on refuse la forme plutôt que de risquer de la lire de travers.
 * Aucune n'existe aujourd'hui — `Promise<{ … }>`, la forme employée, ne pose
 * pas le problème puisque son accolade vit dans un générique.
 *
 * Le contrôle porte sur l'annotation extraite par `declarations()`, jamais sur
 * le fichier entier : un `? (x as T)\n : {}` d'un ternaire produirait sinon un
 * faux positif (relevé sur src/actions/org.ts au premier jet).
 */
function retourObjetNu(code: string): string[] {
  return declarations(code)
    .filter((d) => {
      const a = d.annotation.trim();
      if (!a.startsWith(":")) return false;
      // L'annotation s'arrête juste après le deux-points : l'accolade prise pour
      // celle du corps était donc la première du type.
      return a.replace(/^:/, "").trim() === "";
    })
    .map((d) => d.nom);
}

/**
 * Les actions serveur **inline** — une fonction portant `"use server"` dans son
 * corps, déclarée hors de `src/actions/`, typiquement dans une page.
 *
 * L'invariant les ignorait complètement : il cherchait les actions dans
 * `src/actions/*.ts` et les pages par leur export par défaut. Une action inline
 * n'est ni l'un ni l'autre, donc elle traversait l'analyse sans être vue — alors
 * que c'est un endpoint POST public au même titre que les autres. Trouvé par une
 * revue adverse le 18/08/2026, qui en a exhibé une (`join-request/page.tsx`).
 * Elle était correctement gardée ; l'angle mort, lui, était réel.
 */
export function actionsInline(source: string): string[] {
  // La directive se cherche dans la source BRUTE : `codeSeul()` remplace les
  // chaînes par un espace, donc `"use server"` y a déjà disparu. C'est la panne
  // qu'a immédiatement révélée l'assertion de non-vacuité de ce test, au premier
  // jet — un détecteur qui ne trouvait rien, sur un dépôt qui en contient une.
  const noms: string[] = [];
  const motif = /(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{\s*["']use server["']/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(source))) noms.push(m[1]);
  return noms;
}

/**
 * Les fonctions importées depuis `src/actions/` comptent comme gardées quand une
 * action inline leur délègue : chacune est elle-même soumise à l'invariant plus
 * bas. Sans cette résolution, une délégation légitime — le cas normal — passerait
 * pour une porte nue.
 */
export function nomsImportesDActions(source: string): string[] {
  // Sur la source BRUTE, comme `actionsInline` : le chemin du module est une
  // chaîne, et `codeSeul()` l'aurait effacé. Deuxième occurrence du même piège.
  const noms: string[] = [];
  const motif = /import\s*\{([^}]*)\}\s*from\s*["'](?:@\/actions\/|\.\.?\/[^"']*actions\/)[^"']*["']/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(source))) {
    for (const brut of m[1].split(",")) {
      const nom = brut.trim().split(/\s+as\s+/).pop()?.trim();
      if (nom) noms.push(nom);
    }
  }
  return noms;
}

/** Tous les fichiers de `src/app`, pour pouvoir affirmer qu'aucun n'échappe au tri. */
const TOUT_APP = fichiersSous("src/app", () => true);

const ENTREES_APP = TOUT_APP.filter((c) => estEntreeNext(c.split("/").pop()!));
const ROUTES = ENTREES_APP.filter((c) => /\/route\.[^./]+$/.test(c));
const PAGES = ENTREES_APP.filter((c) => !/\/route\.[^./]+$/.test(c));
const ACTIONS = fichiersSous("src/actions", (f) => f.endsWith(".ts"));

/** Fichiers hors `src/actions/` portant la directive `"use server"`. */
const PORTEURS_INLINE = [...fichiersSous("src/app", (f) => /\.(tsx|ts|jsx|js)$/.test(f)),
                         ...fichiersSous("src/components", (f) => /\.(tsx|ts|jsx|js)$/.test(f))]
  .filter((c) => /["']use server["']/.test(readFileSync(join(RACINE, c), "utf8")));

describe("chaque porte d'entrée atteint une garde", () => {
  /**
   * Ce contrôle-ci a d'abord été écrit comme un plancher — « au moins 26 pages » —
   * c'est-à-dire exactement la faute que la doctrine du chantier nomme : un
   * comptage qui rend vert sur une anomalie réelle. Un plancher ne voit pas le
   * marcheur qui trouve 26 fichiers là où il y en a 30. Il est donc remplacé par
   * une exhaustivité : tout fichier de `src/app` est soit un point d'entrée
   * analysé, soit un fichier qui n'en est pas un, et rien ne tombe entre les deux.
   */
  it("n'ignore aucun fichier de src/app", () => {
    const analyses = new Set(ENTREES_APP);
    const orphelins = TOUT_APP.filter((c) => {
      if (analyses.has(c)) return false;
      const nom = c.split("/").pop()!;
      // Un composant, une feuille de style, une icône : pas une porte d'entrée.
      // Ce qui porte un nom réservé de Next en est une, et doit être analysé.
      return ENTREES_NEXT.includes(nom.split(".")[0]);
    });
    expect(orphelins, "fichier au nom réservé de Next non analysé").toEqual([]);
    // Et le marcheur trouve bien quelque chose : une liste vide rendrait tous les
    // `it.each` ci-dessous vacants, donc la suite verte sans rien vérifier.
    expect(PAGES.length).toBeGreaterThan(0);
    expect(ROUTES.length).toBeGreaterThan(0);
    expect(ACTIONS.length).toBeGreaterThan(0);
  });

  it.each([...PAGES, ...ROUTES])("%s", (chemin) => {
    const motif = PORTES_PUBLIQUES[chemin];
    const entrees = pointsDEntree(chemin);
    if (motif) {
      expect(motif.length).toBeGreaterThan(40); // un motif, pas un « ok »
      return;
    }
    expect(entrees.length).toBeGreaterThan(0);
    for (const e of entrees) {
      expect(e.garde, `${chemin} › ${e.nom} n'atteint aucune garde nommée`).toBe(true);
    }
  });

  it.each(ACTIONS)("%s — toutes les actions exportées", (chemin) => {
    const entrees = pointsDEntree(chemin);
    expect(entrees.length).toBeGreaterThan(0);
    const nues = entrees.filter((e) => !e.garde).map((e) => e.nom);
    expect(nues, `actions sans garde dans ${chemin} : ${nues.join(", ")}`).toEqual([]);
  });

  it("garde aussi les actions serveur déclarées en ligne dans une page", () => {
    const nues: string[] = [];
    let comptees = 0;
    for (const chemin of PORTEURS_INLINE) {
      const source = readFileSync(join(RACINE, chemin), "utf8");
      const code = codeSeul(source);
      const decls = declarations(code);
      const locales = new Map(decls.map((d) => [d.nom, d.corps]));
      // Une délégation vers `src/actions/` compte : cette action est vérifiée ailleurs.
      const deleguees = nomsImportesDActions(source);
      for (const nom of actionsInline(source)) {
        comptees += 1;
        const corps = locales.get(nom);
        expect(corps, `corps introuvable pour l'action inline ${chemin} › ${nom}`).toBeDefined();
        const garde =
          atteintUneGarde(corps!, locales) ||
          deleguees.some((n) => new RegExp(`\\b${n}\\s*\\(`).test(corps!));
        if (!garde) nues.push(`${chemin} › ${nom}`);
      }
    }
    expect(nues, "action serveur inline n'atteignant aucune garde").toEqual([]);
    // Non-vacuité : si le détecteur cessait d'en trouver, le contrôle deviendrait creux.
    expect(comptees, "aucune action inline détectée — le détecteur voit-il encore ?").toBeGreaterThan(0);
  });

  it("ne laisse aucun point d'entrée sous une forme d'export non analysée", () => {
    const suspects = [...PAGES, ...ROUTES, ...ACTIONS]
      .filter((c) => !PORTES_PUBLIQUES[c])
      .filter((c) => formeNonLue(readFileSync(join(RACINE, c), "utf8")));
    expect(suspects, "forme d'export que le détecteur ne sait pas lire").toEqual([]);
  });

  it("ne laisse aucune signature dont le corps serait mal délimité", () => {
    const suspects = [...PAGES, ...ROUTES, ...ACTIONS].flatMap((c) =>
      retourObjetNu(codeSeul(readFileSync(join(RACINE, c), "utf8"))).map((n) => `${c} › ${n}`)
    );
    expect(suspects, "annotation de retour en type objet nu").toEqual([]);
  });

  it("n'inscrit aucune porte publique devenue inutile", () => {
    const inconnues = Object.keys(PORTES_PUBLIQUES).filter(
      (c) => ![...PAGES, ...ROUTES, ...ACTIONS].includes(c)
    );
    expect(inconnues, "entrée de PORTES_PUBLIQUES sans fichier correspondant").toEqual([]);
  });
});

/**
 * Le détecteur, éprouvé en négatif.
 *
 * Un détecteur qui rend vert sur tout est indistinguable d'un détecteur qui
 * marche, et c'est précisément la panne du 17/08 sur le runbook de reprise :
 * un contrôle vert pendant des semaines sur une anomalie réelle. On lui donne
 * donc des sources dont on connaît la réponse, y compris les trois pièges où il
 * pourrait rendre vert à tort.
 */
describe("le détecteur voit ce qu'il doit voir", () => {
  const analyse = (source: string, estAction = true) => {
    const code = codeSeul(source);
    const decls = declarations(code);
    const locales = new Map(decls.map((d) => [d.nom, d.corps]));
    return decls
      .filter((d) => d.exportee && (estAction || d.defaut))
      .map((d) => ({ nom: d.nom, garde: atteintUneGarde(d.corps, locales) }));
  };

  it("refuse une action sans garde", () => {
    expect(
      analyse(`"use server";
        export async function supprimeTout(id: string) {
          await prisma.organisation.delete({ where: { id } });
        }`)
    ).toEqual([{ nom: "supprimeTout", garde: false }]);
  });

  it("accepte une action gardée", () => {
    expect(
      analyse(`"use server";
        export async function supprimeTout(id: string) {
          const { ok } = await canManageSpace(id);
          if (!ok) return;
          await prisma.organisation.delete({ where: { id } });
        }`)
    ).toEqual([{ nom: "supprimeTout", garde: true }]);
  });

  it("suit la garde portée par un helper local", () => {
    expect(
      analyse(`"use server";
        async function autorise(id: string) {
          const a = await canManageSpace(id);
          return a.ok ? a : null;
        }
        export async function ecrit(id: string) {
          if (!(await autorise(id))) return;
        }`).find((e) => e.nom === "ecrit")
    ).toEqual({ nom: "ecrit", garde: true });
  });

  it("ne se laisse pas berner par une garde citée en commentaire", () => {
    expect(
      analyse(`"use server";
        /** Même garde que createProject : requireOrg() puis canManageSpace(). */
        export async function ecrit(id: string) {
          // On appelle bien requireAuth() ailleurs.
          await prisma.project.delete({ where: { id } });
        }`)
    ).toEqual([{ nom: "ecrit", garde: false }]);
  });

  it("ne se laisse pas berner par une garde citée dans une chaîne", () => {
    expect(
      analyse(`"use server";
        export async function ecrit(id: string) {
          console.log("requireOrg() a été appelée");
          await prisma.project.delete({ where: { id } });
        }`)
    ).toEqual([{ nom: "ecrit", garde: false }]);
  });

  it("ne compte pas la garde d'une action voisine du même fichier", () => {
    const r = analyse(`"use server";
      export async function gardee(id: string) {
        await requireSuperAdmin();
      }
      export async function nue(id: string) {
        await prisma.organisation.delete({ where: { id } });
      }`);
    expect(r).toEqual([
      { nom: "gardee", garde: true },
      { nom: "nue", garde: false },
    ]);
  });

  it("voit une page sans garde, et une page gardée", () => {
    expect(
      analyse(`export default async function Page() {
        const orgs = await prisma.organisation.findMany();
        return <div>{orgs.length}</div>;
      }`, false)
    ).toEqual([{ nom: "Page", garde: false }]);
    expect(
      analyse(`export default async function Page() {
        const { org } = await requireOrg();
        return <div>{org.name}</div>;
      }`, false)
    ).toEqual([{ nom: "Page", garde: true }]);
  });

  it("repère la forme d'export que l'analyse ne lit pas", () => {
    expect(formeNonLue("export const GET = handlers.GET;")).toBe(true);
    expect(formeNonLue("export default async () => {};")).toBe(true);
    expect(formeNonLue("export const supprime = async (id: string) => {};")).toBe(true);
    expect(formeNonLue("export async function GET() {}")).toBe(false);
    expect(formeNonLue("export default async function Page() {}")).toBe(false);
    // Réglages de module : pas des points d'entrée, pas visés.
    expect(formeNonLue('export const dynamic = "force-dynamic";')).toBe(false);
    expect(formeNonLue('export const runtime = "nodejs";')).toBe(false);
    expect(formeNonLue("export const metadata: Metadata = { title: 1 };")).toBe(false);
    expect(formeNonLue("export const config = { matcher: [1] };")).toBe(false);
  });

  it("voit la garde derrière une annotation de retour générique", () => {
    // La panne du détecteur au premier jet : l'accolade de `Promise<{…}>` était
    // prise pour celle du corps, et quatre actions gardées passaient pour nues.
    expect(
      analyse(`"use server";
        export async function requestJoin(orgId: string): Promise<{ ok: boolean; error?: string }> {
          const session = await requireAuth();
          return { ok: true };
        }`)
    ).toEqual([{ nom: "requestJoin", garde: true }]);
    expect(
      analyse(`"use server";
        export async function requestJoin(orgId: string): Promise<{ ok: boolean }> {
          return { ok: true };
        }`)
    ).toEqual([{ nom: "requestJoin", garde: false }]);
  });

  it("refuse l'annotation de retour en type objet nu, qu'il ne sait pas délimiter", () => {
    expect(retourObjetNu(codeSeul("export function f(): { ok: boolean } { return { ok: true }; }"))).toEqual(["f"]);
    expect(retourObjetNu(codeSeul("export function f(): Promise<{ ok: boolean }> { }"))).toEqual([]);
    expect(retourObjetNu(codeSeul("export function f(): void { }"))).toEqual([]);
    // Le ternaire qui produisait un faux positif quand le contrôle portait sur
    // le fichier entier plutôt que sur l'annotation.
    expect(
      retourObjetNu(
        codeSeul(`export function f() {
          const c = (typeof o.f === "object" && o.f)
            ? (o.f as Record<string, boolean>)
            : {};
          return c;
        }`)
      )
    ).toEqual([]);
  });
});
