import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client for the web app.
 * SERVER ONLY. Bypasses RLS — never import from a client component.
 *
 * Used by the run viewer pages until user auth is wired (then we'll switch
 * to the user-scoped server client in `./server.ts`).
 */
export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() must only be called server-side");
  }
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Return a short-lived signed URL for a screenshot stored in the bucket. */
export async function signedScreenshotUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.storage
    .from("screenshots")
    .createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

/** Return a short-lived signed URL for a Playwright trace.zip. */
export async function signedTraceUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.storage
    .from("traces")
    .createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}
