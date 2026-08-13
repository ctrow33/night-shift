import { createClient } from "@supabase/supabase-js";

// These two are public by design (protected by Row Level Security in Supabase).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
