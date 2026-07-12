"use client";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

let searchClient: SupabaseClient | null = null;

export function getSupabaseSearchClient() {
  if (searchClient) {
    return searchClient;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or Supabase public browser key."
    );
  }

  searchClient = createClient(
    supabaseUrl,
    supabaseKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  return searchClient;
}