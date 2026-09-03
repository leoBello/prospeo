import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';

/**
 * Client en `service_role` : contourne RLS par construction, comme celui du
 * collector (`apps/collector/src/supabase.ts`). C'est ce qui permet au
 * relais d'écrire `connexion_plateforme`/`connexion_secret`, que
 * `authenticated` ne peut jamais atteindre en écriture (étape 2).
 */
export function createClient(config: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}): SupabaseClient<Database> {
  return createSupabaseClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
