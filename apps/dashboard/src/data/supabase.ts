import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { readConfig } from '../config.js';

/**
 * Client du dashboard, en clé publiable.
 *
 * Aucun secret n'est en jeu : la clé part dans le bundle, c'est sa raison
 * d'être. Ce qui protège les données, ce sont les politiques
 * `authenticated_all` de la première migration, qui n'ouvrent les sept tables
 * qu'au rôle `authenticated` — donc à une session ouverte. Sans connexion,
 * cette même clé ne lit rien.
 *
 * `readConfig` refuse au passage une clé `service_role`, qui contournerait
 * tout cela.
 */
export function createDashboardClient(
  env: Record<string, string | undefined>,
): SupabaseClient<Database> {
  const config = readConfig(env);
  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      // La session est conservée d'un chargement à l'autre : c'est un outil de
      // travail quotidien, redemander le mot de passe à chaque rafraîchissement
      // pousserait à choisir un mot de passe faible.
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
