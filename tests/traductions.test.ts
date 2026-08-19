/**
 * L'état réel de la traduction, mesuré plutôt que supposé.
 *
 * La revue adverse du 18/08/2026 a signalé que « l'essentiel des écrans est codé en
 * français malgré la route `/en` ». Vérifié : 2 pages sur 26 appelaient les
 * traductions, pour 78 clés. La route anglaise servait donc du français, ce que le
 * README annonce pourtant comme une interface bilingue.
 *
 * Ce fichier tient deux invariants. Le premier est trivial mais indispensable : les
 * deux catalogues ont exactement les mêmes clés. Le second compte les chaînes
 * visibles restées en dur, avec un plafond qui ne doit que descendre — c'est un
 * cliquet, pas une porte : on ne peut plus en ajouter, et chaque conversion
 * l'abaisse. Sans ce compteur, « traduire l'application » est un chantier dont
 * personne ne sait jamais où il en est.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = new URL("..", import.meta.url).pathname;

function aplatir(objet: unknown, prefixe = ""): string[] {
  if (typeof objet !== "object" || objet === null) return [prefixe];
  return Object.entries(objet as Record<string, unknown>).flatMap(([k, v]) =>
    aplatir(v, prefixe ? `${prefixe}.${k}` : k)
  );
}

const fr = JSON.parse(readFileSync(join(RACINE, "messages/fr.json"), "utf8"));
const en = JSON.parse(readFileSync(join(RACINE, "messages/en.json"), "utf8"));

describe("catalogues de traduction", () => {
  it("portent exactement les mêmes clés", () => {
    const clesFr = aplatir(fr).sort();
    const clesEn = aplatir(en).sort();
    const manquantesEn = clesFr.filter((k) => !clesEn.includes(k));
    const manquantesFr = clesEn.filter((k) => !clesFr.includes(k));
    expect(manquantesEn, "clés absentes de en.json").toEqual([]);
    expect(manquantesFr, "clés absentes de fr.json").toEqual([]);
  });

  it("n'ont aucune valeur vide", () => {
    const vides: string[] = [];
    const parcourir = (o: unknown, p = "", langue = "") => {
      if (typeof o === "string") {
        if (o.trim() === "") vides.push(`${langue}:${p}`);
        return;
      }
      if (typeof o === "object" && o !== null) {
        for (const [k, v] of Object.entries(o)) parcourir(v, p ? `${p}.${k}` : k, langue);
      }
    };
    parcourir(fr, "", "fr");
    parcourir(en, "", "en");
    expect(vides).toEqual([]);
  });

  it("ne laissent pas une valeur anglaise identique au français sur du texte de phrase", () => {
    // Un mot identique dans les deux langues est courant (« Notes », « Actions ») ;
    // une PHRASE identique est presque toujours une traduction oubliée.
    const suspectes: string[] = [];
    const comparer = (a: unknown, b: unknown, p = "") => {
      if (typeof a === "string" && typeof b === "string") {
        const mots = a.trim().split(/\s+/);
        // Une phrase, c'est au moins quatre mots ET des lettres : un exemple
        // numérique (« 123 456 789 00012 ») compte quatre groupes sans être du
        // texte, et n'a rien à traduire. Faux positif relevé le 19/08/2026.
        const estPhrase = mots.length >= 4 && mots.filter((m) => /[A-Za-zÀ-ÿ]{2}/.test(m)).length >= 3;
        if (estPhrase && a === b) suspectes.push(`${p} = « ${a} »`);
        return;
      }
      if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
        for (const k of Object.keys(a as object)) {
          comparer((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], p ? `${p}.${k}` : k);
        }
      }
    };
    comparer(fr, en);
    expect(suspectes, "phrase non traduite dans en.json").toEqual([]);
  });
});

/** Fichiers de l'interface, hors client Prisma généré. */
function fichiersInterface(): string[] {
  const sortie: string[] = [];
  const descendre = (rep: string) => {
    for (const e of readdirSync(rep)) {
      const chemin = join(rep, e);
      if (statSync(chemin).isDirectory()) {
        if (e === "generated") continue;
        descendre(chemin);
      } else if (e.endsWith(".tsx")) sortie.push(relative(RACINE, chemin));
    }
  };
  descendre(join(RACINE, "src"));
  return sortie.sort();
}

/**
 * Chaînes visibles laissées en dur dans un fichier.
 *
 * Approximation volontairement simple : le texte entre balises, et les attributs qui
 * atteignent l'utilisateur (`placeholder`, `aria-label`, `title`, `alt`). Elle ne
 * prétend pas être exacte — elle prétend être STABLE, pour que le compteur ait un
 * sens d'une exécution à l'autre.
 */
/**
 * Ce qui n'est pas traduisible, et qu'il serait donc faux de compter.
 *
 * Relevé le 19/08/2026 en convertissant : le nom de marque est coupé par un
 * `<span>` de mise en forme (`tri<span>app</span>`), et un identifiant de licence
 * n'a pas de traduction. La liste est courte et exacte — comparaison stricte, pas
 * une sous-chaîne — pour qu'elle n'excuse jamais une vraie phrase.
 */
const NON_TRADUISIBLES = [
  "app", "tri", "triapp", "Sémawé", "Holacracy", "AGPL-3.0",
  // Raisons sociales des mentions légales : opposables telles quelles.
  "Heterostasia", "OVH SAS",
];

export function chainesEnDur(source: string): string[] {
  const trouvees: string[] = [];

  // Texte entre deux balises : `>Ajouter un point<`.
  //
  // Le saut de ligne est autorisé dans la capture. Il ne l'était pas, et c'est ce
  // qui a laissé passer des titres et des paragraphes entiers écrits sur plusieurs
  // lignes — `<h2 …>\n  Éditeur du site\n</h2>`. Le compteur est tombé à zéro alors
  // qu'un tiers de la page des mentions légales était encore en français : trouvé
  // le 19/08/2026 en ouvrant `/en` dans un navigateur, pas en lisant le compteur.
  // La leçon vaut plus que la correction : un instrument qui rend vert doit être
  // confronté à la chose qu'il prétend mesurer.
  for (const m of source.matchAll(/(=?)>([^<>{}]{2,}?)</g)) {
    // `=>` suivi d'un type générique (`=> Promise<void>`) n'est pas du texte.
    if (m[1] === "=") continue;
    const t = m[2].replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (!/[A-Za-zÀ-ÿ]{2}/.test(t)) continue; // ni ponctuation seule, ni nombre
    if (/^[\d\s.,:/%-]+$/.test(t)) continue;
    // Un fragment multi-lignes se normalise avant comparaison et report.
    if (NON_TRADUISIBLES.includes(t)) continue;
    // Expression JavaScript prise entre deux chevrons de comparaison :
    // `remaining >= 0 && remaining < 5 * 60` produit un faux « >= 0 && remaining <ations ».
    if (/&&|\|\||=>|\?\?|===|!==/.test(t)) continue;
    // Fragment d'annotation de type pris entre le `>` d'un générique et le `<` du
    // suivant : `}>; searchParams: Promise<`. Le français typographie ses
    // deux-points précédés d'une espace, donc « Domaines : » n'est pas concerné.
    if (/\w+\??:\s*(string|number|boolean|Promise|Date|[A-Z]\w*)/.test(t)) continue;
    trouvees.push(t);
  }

  // Attributs destinés à l'utilisateur.
  for (const m of source.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]{2,})"/g)) {
    trouvees.push(m[1].trim());
  }

  return trouvees;
}

describe("chaînes visibles restées en dur", () => {
  const parFichier = fichiersInterface().map((c) => ({
    chemin: c,
    chaines: chainesEnDur(readFileSync(join(RACINE, c), "utf8")),
  }));
  const total = parFichier.reduce((a, f) => a + f.chaines.length, 0);

  /**
   * Cliquet. Baisser cette valeur à chaque conversion, jamais la remonter : une
   * hausse signifie qu'on a ajouté de l'écran non traduit, et le test la refuse.
   */
  const PLAFOND = 78;

  it(`n'en compte pas plus que le plafond (${PLAFOND})`, () => {
    const pires = [...parFichier]
      .sort((a, b) => b.chaines.length - a.chaines.length)
      .slice(0, 8)
      .map((f) => `${f.chemin} (${f.chaines.length})`);
    expect(
      total,
      `${total} chaînes en dur. Les plus chargés :\n  ${pires.join("\n  ")}`
    ).toBeLessThanOrEqual(PLAFOND);
  });

  it("détecte bien quelque chose (sinon le compteur est creux)", () => {
    expect(chainesEnDur('<p>Ajouter un point</p>')).toContain("Ajouter un point");
    expect(chainesEnDur('<input placeholder="Saisir l\'output…" />')).toContain("Saisir l'output…");
    expect(chainesEnDur('<button aria-label="Fermer" />')).toContain("Fermer");
    // Ce qu'il ne doit PAS compter.
    expect(chainesEnDur('<p>{t("titre")}</p>')).toEqual([]);
    expect(chainesEnDur('<span>42</span>')).toEqual([]);
    expect(chainesEnDur('<span>—</span>')).toEqual([]);
    // Faux positifs relevés en convertissant, et qu'il serait faux de compter.
    expect(chainesEnDur('  fn: (x: string) => Promise<void>;')).toEqual([]);
    expect(chainesEnDur('tri<span className="x">app</span>')).toEqual([]);
    expect(chainesEnDur('<span>AGPL-3.0</span>')).toEqual([]);
    expect(chainesEnDur('const w = remaining >= 0 && remaining < 300;')).toEqual([]);
    // Titre écrit sur plusieurs lignes : le cas que le détecteur ratait.
    expect(chainesEnDur('<h2 className="x">\n  Éditeur du site\n</h2>')).toContain("Éditeur du site");
    expect(chainesEnDur('params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }>')).toEqual([]);
    // Et le texte français à deux-points reste compté.
    expect(chainesEnDur('<span>Domaines :</span>')).toContain("Domaines :");
    // Mais la liste est stricte : une phrase qui CONTIENT un nom propre compte.
    expect(chainesEnDur('<p>Sémawé / Cercle principal</p>')).toContain("Sémawé / Cercle principal");
  });
});
