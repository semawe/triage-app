/**
 * Harnais des tests d'intégration.
 *
 * Les gardes d'autorisation vivent dans des Server Actions et des helpers qui
 * lisent la session NextAuth et les cookies. On les exécute pour de vrai contre
 * une base PostgreSQL de test, en simulant la seule chose qu'on ne peut pas
 * fournir hors requête HTTP : l'identité de l'appelant et le cookie d'org.
 */
import { vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://aliocha@localhost:5432/triageapp_test";
process.env.AUTH_URL ??= "http://localhost:3000";
process.env.AUTH_SECRET ??= "test-secret";

/** Identité de l'appelant, réglée test par test via `actAs()`. */
export const currentSession: { userId: string | null; email: string | null } = {
  userId: null,
  email: null,
};

/** Cookies simulés (org active, jeton invité). */
export const currentCookies = new Map<string, string>();

export function actAs(user: { id: string; email: string } | null) {
  currentSession.userId = user?.id ?? null;
  currentSession.email = user?.email ?? null;
}

vi.mock("@/lib/auth", () => ({
  auth: async () =>
    currentSession.userId
      ? { user: { id: currentSession.userId, email: currentSession.email, name: "Test" } }
      : null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = currentCookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      currentCookies.set(name, value);
    },
    delete: (name: string) => {
      currentCookies.delete(name);
    },
  }),
  headers: async () => new Map(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "fr",
  getTranslations: async () => (key: string) => key,
}));

/**
 * `redirect()` lève dans Next : on reproduit le comportement pour pouvoir
 * distinguer « l'action a redirigé » de « l'action a écrit ».
 */
export class RedirectError extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async ({ to }: { to: string[] }) => {
    sentEmails.push(to);
    return { ok: true };
  }),
}));

/** Destinataires de chaque email envoyé pendant un test. */
export const sentEmails: string[][] = [];
