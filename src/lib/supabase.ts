import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return url;
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return key;
}

// Server-side admin client (bypasses RLS)
let _supabaseAdmin: SupabaseClient | null = null;
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      getSupabaseUrl(),
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } }
    );
  }
  return _supabaseAdmin;
}

// Client-side Supabase (respects RLS)
let _supabase: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return _supabase;
}

// Create a server client with user's auth token for RLS
export function getSupabaseWithAuth(accessToken: string): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
