/**
 * La politique de sécurité de contenu, éprouvée sur ce qu'elle refuse.
 *
 * Une CSP est un texte : elle ne lève rien, ne casse rien, et une directive
 * effacée par erreur ne se remarque pas. Ces tests portent donc sur les
 * propriétés qui la rendent utile plutôt que sur sa chaîne exacte — et d'abord
 * sur la seule qui, perdue, la vide entièrement de son sens sans qu'il n'y
 * paraisse : `'unsafe-inline'` dans `script-src`, qui autorise à nouveau
 * n'importe quelle balise injectée.
 *
 * Vérifié à la main le 18/08/2026 dans un navigateur, sous la politique de
 * production servie par le build : un script en ligne portant le bon nonce
 * s'exécute, un script sans nonce est refusé, un script au nonce inventé est
 * refusé (« The action has been blocked » au journal). Les 12 balises `<script>`
 * de la page d'entrée invité portaient toutes le nonce de la réponse, et le
 * parcours complet — page publique, action serveur, cookie, redirection —
 * fonctionnait sous cette politique.
 *
 * Une limite, faute de mieux : le navigateur intégré utilisé pour la
 * vérification ne sait pas enregistrer de service worker, y compris sur une page
 * témoin servie sans aucune CSP. `worker-src 'self'` est donc raisonné et non
 * observé.
 */
import { describe, it, expect } from "vitest";
import { politique, nonceNeuf } from "@/lib/csp";

const PROD = politique("NONCE-DE-TEST", false);
const DEV = politique("NONCE-DE-TEST", true);

/** Le contenu d'une directive, ou null si elle est absente. */
function directive(csp: string, nom: string): string | null {
  const trouvee = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === nom || d.startsWith(`${nom} `));
  return trouvee === undefined ? null : trouvee.slice(nom.length).trim();
}

describe("politique de sécurité de contenu", () => {
  it("n'autorise jamais le script en ligne sans nonce", () => {
    for (const csp of [PROD, DEV]) {
      expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
      expect(directive(csp, "script-src")).toContain("'nonce-NONCE-DE-TEST'");
      expect(directive(csp, "script-src")).toContain("'strict-dynamic'");
    }
  });

  it("ne sert `unsafe-eval` qu'en développement", () => {
    expect(directive(PROD, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(DEV, "script-src")).toContain("'unsafe-eval'");
  });

  it("n'ouvre la connexion au websocket qu'en développement", () => {
    expect(directive(PROD, "connect-src")).toBe("'self'");
    expect(directive(DEV, "connect-src")).toContain("ws:");
  });

  it("porte un nonce différent à chaque réponse", () => {
    expect(politique("A", false)).not.toBe(politique("B", false));
    expect(politique("A", false)).toContain("'nonce-A'");
  });

  it("tire un nonce imprévisible, et jamais deux fois le même", () => {
    // Un nonce constant est exactement équivalent à `'unsafe-inline'` : la
    // propriété qui compte n'est pas sa présence, c'est son renouvellement.
    const tirages = new Set(Array.from({ length: 200 }, () => nonceNeuf()));
    expect(tirages.size).toBe(200);
    // 128 bits en base64 : 24 caractères, dont deux de remplissage.
    for (const n of tirages) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("interdit l'encadrement, les objets et la réécriture de base", () => {
    expect(directive(PROD, "frame-ancestors")).toBe("'none'");
    expect(directive(PROD, "frame-src")).toBe("'none'");
    expect(directive(PROD, "object-src")).toBe("'none'");
    expect(directive(PROD, "base-uri")).toBe("'self'");
    expect(directive(PROD, "default-src")).toBe("'self'");
  });

  /**
   * Les quatre assouplissements sont documentés dans l'en-tête de `src/proxy.ts`.
   * On les épingle ici pour qu'un cinquième ne s'ajoute pas en silence : ajouter
   * une permission demande de toucher à ce test, donc de l'écrire quelque part.
   */
  it("n'ouvre que les quatre assouplissements documentés", () => {
    expect(directive(PROD, "style-src")).toBe("'self' 'unsafe-inline'");
    expect(directive(PROD, "img-src")).toBe("'self' data: https:");
    expect(directive(PROD, "form-action")).toBe(
      "'self' https://checkout.stripe.com https://billing.stripe.com"
    );
    // Le quatrième, `'unsafe-eval'` en développement, est éprouvé plus haut.

    // Aucune autre directive n'accepte d'hôte distant.
    for (const nom of ["default-src", "script-src", "font-src", "connect-src", "worker-src", "manifest-src"]) {
      const valeur = directive(PROD, nom) ?? "";
      expect(valeur, `${nom} accepte un hôte distant`).not.toMatch(/https?:\/\//);
    }
  });

  it("couvre le service worker et le manifeste de l'application", () => {
    expect(directive(PROD, "worker-src")).toBe("'self'");
    expect(directive(PROD, "manifest-src")).toBe("'self'");
  });

  it("ne laisse aucune directive vide", () => {
    for (const bloc of PROD.split(";")) {
      expect(bloc.trim(), `directive vide dans « ${PROD} »`).not.toBe("");
    }
  });
});
