import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client — для использования в server components, route handlers, server actions.
 * Использует service role key — пропускает RLS. Используй ОСТОРОЖНО только когда нужен admin доступ.
 */
export async function createSupabaseAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: async () => (await cookies()).getAll(),
        setAll: () => { /* no-op для service role */ },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
