import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { Config } from './config.js';

/** Client en service_role : contourne RLS. Ne jamais exposer cette clé au front. */
export function createClient(config: Config): SupabaseClient<Database> {
  return createSupabaseClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}

/**
 * Taille de page des lectures Supabase (PostgREST plafonne a max_rows = 1000).
 *
 * Elle vivait dans `cli.ts`, seul module qui paginait. Les lectures de la
 * chaine ayant rejoint `chaine.ts`, la garder la-bas aurait force soit un
 * import a rebours de la ligne de commande, soit un second 500 ailleurs — et
 * deux nombres censes etre le meme finissent toujours par diverger.
 */
export const PAGE_SIZE = 500;
