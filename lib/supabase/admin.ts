import { createClient } from "@supabase/supabase-js";

/**
 * Admin client using service role key.
 * Bypasses RLS - use only for server-side operations like:
 * - Scoring pipeline
 * - Creating schools/teachers during signup
 * - Seeding data
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
