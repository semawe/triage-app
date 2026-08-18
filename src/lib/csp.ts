/**
 * La politique de sécurité de contenu — le texte, séparé du portier qui la pose.
 *
 * Elle vit dans son propre module pour une raison pratique : `src/proxy.ts` importe le
 * middleware de next-intl, qui ne se charge pas hors du runtime de Next. Une politique
 * inatteignable depuis un test serait une politique jamais vérifiée. `tests/csp.test.ts`
 * l'interroge ici, directive par directive.
 *
 * Le raisonnement — pourquoi elle ne vit pas dans `next.config.ts`, ce que le nonce
 * protège, ce qu'elle ne fait pas — est dans l'en-tête de `src/proxy.ts`.
 *
 * ## Les quatre assouplissements, et leur motif
 *
 * Ils se copient avec leur motif ou pas du tout. Une CSP recopiée sans eux devient, au premier
 * bug d'affichage, une CSP qu'on assouplit sans savoir pourquoi.
 *
 * 1. `style-src 'unsafe-inline'`. Un nonce ne couvre **pas** les attributs `style=` (CSP 3 les
 *    gouverne par `style-src-attr`, où les nonces n'ont aucun effet), et Tailwind comme
 *    `next/font` en posent. Le choix est explicite : une injection de CSS est un risque réel,
 *    mais d'un autre ordre qu'une injection de script — et `form-action`, `base-uri` et
 *    `frame-ancestors` ferment les usages détournés de CSS les plus cités.
 *
 * 2. `img-src` accepte `https:`. Propre à Triapp : l'admin d'une organisation renseigne le
 *    logo de son organisation par URL (`Organisation.logoUrl`, écran Paramètres), et les
 *    avatars des membres viennent de l'hébergeur d'images de Google via OAuth. Restreindre à
 *    `'self'` casserait les deux. Ce que ça concède : une image chargée depuis un hôte
 *    arbitraire peut servir de mouchard de consultation. Ce que ça ne concède pas : aucune
 *    exécution — `script-src` reste fermé.
 *
 * 3. `form-action` accepte les deux hôtes de paiement Stripe. Les boutons d'abonnement sont
 *    des `<form action={actionServeur}>` dont l'action redirige vers la page de paiement
 *    hébergée par Stripe. Quand le JavaScript a pris la main, cette redirection est une
 *    navigation et échappe à `form-action` ; mais Next dégrade ces formulaires en POST natif
 *    tant que la page n'est pas hydratée, et Chrome comme Safari appliquent `form-action` aux
 *    redirections qui suivent un POST de formulaire. Sans ces deux hôtes, le parcours
 *    d'abonnement casse pour qui clique vite — une panne intermittente, donc coûteuse à
 *    diagnostiquer.
 *
 * 4. `'unsafe-eval'` en développement seulement, où le rechargement à chaud de Next l'exige.
 *    La politique servie en production ne le contient pas ; c'est celle-là qu'il faut lire.
 *
 */

/** 128 bits tirés du générateur du runtime, encodés en base64 : imprévisible, et unique par réponse. */
export function nonceNeuf(): string {
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  return btoa(String.fromCharCode(...octets));
}

export function politique(nonce: string, enDeveloppement: boolean): string {
  return [
    "default-src 'self'",
    // `'strict-dynamic'` laisse les morceaux chargés par un script noncé s'exécuter à leur
    // tour, sans avoir à énumérer leurs adresses. En sa présence, les navigateurs conformes à
    // CSP 3 ignorent `'self'` dans cette directive : c'est le nonce, et lui seul, qui autorise.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${enDeveloppement ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // assouplissement 1
    "img-src 'self' data: https:", // assouplissement 2
    "font-src 'self'", // `next/font` héberge les fontes au build, rien à ouvrir
    // Les actions serveur, le flux d'événements de réunion et le rechargement à chaud parlent
    // à l'origine, à personne d'autre.
    `connect-src 'self'${enDeveloppement ? " ws:" : ""}`,
    "worker-src 'self'", // le service worker de `public/sw.js`
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com", // assouplissement 3
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
  ].join("; ");
}
