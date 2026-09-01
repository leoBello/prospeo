import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config.js';

/** Client en service_role : contourne RLS. Ne jamais exposer cette clé au front. */
export function createClient(config: Config): SupabaseClient {
  return createSupabaseClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
