import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { templateRepoFor, type Trade } from '@prospeo/core';

/**
 * Le repli de niveau 2 et 3 de `templateRepoFor` (tâche 6, lot 2).
 *
 * `templateRepoFor` lui-même ne change pas : le métier prime toujours sur ce
 * que rend cette fonction. Elle ne calcule QUE ce qu'il reçoit en `defaut`
 * quand le métier n'a rien déclaré — le gabarit actif en base
 * (`site_template.repo_full_name`), et à défaut la variable d'environnement
 * `PROSPEO_GITHUB_TEMPLATE_REPO`. C'est la ligne unique que `cli.ts` emploie
 * pour construire `deps.templateRepoDefaut`.
 */
export function gabaritDefautPourPublication(
  gabaritBase: string | undefined,
  envDefaut: string | undefined,
): string | undefined {
  return gabaritBase ?? envDefaut;
}

/**
 * Les trois niveaux de résolution assemblés — pour les tests, uniquement.
 *
 * En production, ce ne sont jamais deux appels côte à côte : `cli.ts` calcule
 * `gabaritDefautPourPublication(...)` une seule fois pour tout le lot, et
 * c'est `runPublish` (apps/collector/src/stages/publish.ts, inchangé) qui
 * appelle `templateRepoFor(trade, deps.templateRepoDefaut)` séparément, pour
 * CHAQUE prospect selon son propre métier. Cette fonction rejoue les deux à
 * la suite pour permettre à un seul test de prouver que l'ensemble respecte
 * la priorité du métier — le point que `cli.ts`, non testé, ne peut pas
 * garantir lui-même.
 */
export function resoudreTemplateRepo(
  trade: Trade,
  gabaritBase: string | undefined,
  envDefaut: string | undefined,
): string {
  return templateRepoFor(trade, gabaritDefautPourPublication(gabaritBase, envDefaut));
}

/**
 * Lit le gabarit actif désigné en base — lecteur mince pour `cli.ts`.
 *
 * `site_template` est une table à ligne unique (tâche 2), sa ligne `id = 1`
 * créée dès la migration. Une lecture qui ne trouve rien n'est donc jamais
 * « aucun gabarit désigné » — cet état-là est une COLONNE nulle sur une ligne
 * bien présente — mais un problème d'infrastructure (migration non jouée,
 * ligne supprimée à la main) qu'il faut signaler, pas absorber en silence
 * derrière la variable d'environnement.
 */
export async function lireGabaritActif(
  client: SupabaseClient<Database>,
): Promise<string | undefined> {
  const { data, error } = await client
    .from('site_template')
    .select('repo_full_name')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    throw new Error(`site_template : lecture impossible — ${error.message}`);
  }
  if (data === null) {
    throw new Error(
      'site_template : ligne singleton (id=1) introuvable — migration non jouée ou ligne supprimée.',
    );
  }
  return data.repo_full_name ?? undefined;
}
