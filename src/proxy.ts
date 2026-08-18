/**
 * Portier d'entrée — routage des langues — et politique de sécurité de contenu à nonces.
 *
 * ## Ce que ce fichier n'est pas
 *
 * Il n'est **pas la barrière d'authentification**, et il ne doit jamais le devenir. Il
 * s'exécute sur le runtime edge, sans accès à la base : il ne peut ni lire une session ni
 * constater une révocation. Un cookie présent mais forgé, expiré ou révoqué passerait ici
 * sans encombre. C'est la conclusion à laquelle l'Académie est arrivée de son côté, en citant
 * la faille de contournement des middlewares d'authentification de Next — deux applications
 * du parc y aboutissent séparément, le raisonnement est solide.
 *
 * L'autorité vit donc dans chaque page, chaque action serveur et chaque route d'API, une par
 * une, par les gardes de `src/lib/session.ts`, `src/lib/authz.ts` et `src/lib/guest.ts`. Ce
 * n'est pas une convention orale : `tests/gardes.test.ts` énumère les points d'entrée du dépôt
 * et échoue sur celui qui n'atteint aucune garde. Lire son en-tête avant d'ajouter une page.
 *
 * Triapp n'a pas de redirection de routage à faire ici, contrairement à l'ERP et à
 * l'Académie : elle n'a pas de cookie de session à elle (NextAuth pose le sien sous un nom
 * qui varie avec l'environnement) et ses gardes redirigent déjà vers `/login`. Un tri
 * approximatif sur la présence d'un cookie n'apporterait qu'un risque de boucle de
 * redirection — celle que l'ERP documente à sa ligne 101. On s'abstient.
 *
 * ## Pourquoi la CSP vit ici et non dans `next.config.ts`
 *
 * Un nonce n'a de valeur que s'il est **imprévisible et unique par réponse** : une valeur
 * écrite dans un fichier de configuration serait constante, donc strictement équivalente à
 * `'unsafe-inline'`. Le portier est le seul endroit qui voie chaque requête. Il pose le nonce
 * à deux endroits :
 *
 *  - dans un en-tête de **requête** `Content-Security-Policy`, que Next lit pour apposer
 *    l'attribut `nonce` sur les balises `<script>` qu'il génère lui-même (amorçage, chargement
 *    des morceaux, charge utile d'hydratation) ;
 *  - dans `x-nonce`, que lit la seule balise `<script>` écrite à la main du dépôt —
 *    l'enregistrement du service worker dans `src/app/layout.tsx`.
 *
 * `next.config.ts` garde les en-têtes qui ne dépendent pas de la requête (cadrage, sniffing,
 * référent) : ils couvrent aussi les chemins que le `matcher` ci-dessous exclut.
 *
 * ## Les quatre assouplissements
 *
 * Ils sont écrits, un par un et avec leur motif, dans `src/lib/csp.ts` — où la politique
 * vit, et où `tests/csp.test.ts` l'interroge. Ils se copient avec leur motif ou pas du tout.
 *
 * ## Ce que la CSP ne fait pas
 *
 * Elle n'empêche pas un XSS, elle en réduit l'exploitation. La défense de premier rang reste
 * l'échappement par React, et la seule balise du dépôt qui l'outrepasse
 * (`dangerouslySetInnerHTML` dans `src/app/layout.tsx`) porte une constante littérale.
 *
 * Provenance : copie consciente du 18/08/2026, dans le cadre de l'alignement des applications
 * internes de Sémawé. La structure de la politique et le raisonnement sur le portier viennent
 * d'une application interne du parc qui les avait déjà résolus ; les assouplissements 2 et 3
 * sont propres à Triapp et n'existent pas là-bas. Ce dépôt est public : les chemins de la
 * référence interne ne sont pas cités ici, ils sont dans le message du commit correspondant.
 */

import createMiddleware from "next-intl/middleware"; // next-intl v4 — convention « proxy » (Next.js 16+)
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { nonceNeuf, politique } from "./lib/csp";

const routageLangues = createMiddleware(routing);

export default function proxy(req: NextRequest) {
  const nonce = nonceNeuf();
  const csp = politique(nonce, process.env.NODE_ENV !== "production");

  // Sur la REQUÊTE : c'est ce que Next lit pour nonce ses propres balises `<script>`, et ce que
  // `headers()` rend visible au layout. Sans cette moitié, `'strict-dynamic'` bloquerait
  // l'amorçage de Next lui-même — l'application entière en page blanche.
  //
  // Les en-têtes sont posés sur la requête reçue, en place, plutôt que sur une copie : le
  // routage de next-intl fait `new Headers(request.headers)` avant de les repasser à
  // `NextResponse.rewrite({ request: { headers } })`, donc il les transporte de lui-même. Une
  // requête reconstruite (`new NextRequest(req, …)`) serait le seul autre chemin, et elle
  // recopierait le corps de chaque POST d'action serveur pour rien.
  req.headers.set("x-nonce", nonce);
  req.headers.set("Content-Security-Policy", csp);

  // next-intl décide du routage de langue (réécriture vers /[locale], ou redirection). On pose
  // la politique sur la réponse qu'il produit, quelle qu'elle soit.
  const reponse = routageLangues(req);
  reponse.headers.set("Content-Security-Policy", csp);
  return reponse;
}

export const config = {
  // Routes d'API, fichiers statiques et internes de Next exclus.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
