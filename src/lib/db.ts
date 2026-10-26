import { createClient } from "@supabase/supabase-js";

// Service-role client: server-only. Every query below filters by the signed-in user's id.
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
