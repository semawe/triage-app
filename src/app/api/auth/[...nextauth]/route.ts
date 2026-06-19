import { handlers } from "@/lib/auth";

// NextAuth v5 beta / Next.js 16 type compatibility workaround
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = handlers.GET as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = handlers.POST as any;
