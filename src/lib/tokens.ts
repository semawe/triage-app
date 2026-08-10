import { randomBytes } from "node:crypto";

/**
 * Jeton porteur (invitation d'organisation, accès invité à une réunion).
 *
 * Les jetons étaient des `cuid()` : horodatage + compteur + empreinte machine
 * + quelques caractères aléatoires. C'est un identifiant, pas un secret — il
 * n'est pas conçu pour résister à la devinette. Ici : 256 bits d'aléa CSPRNG.
 */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}
