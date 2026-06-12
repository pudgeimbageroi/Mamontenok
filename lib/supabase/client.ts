"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client — для client components.
 * Использует anon key — RLS соблюдается.
 */
export function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
