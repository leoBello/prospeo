import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';

/** Une ligne du journal `deployment_event` — un fait, pas une décision. */
export interface DeploymentEvent {
  prospectId: string;
  step: Enums<'deployment_step'>;
  outcome: Enums<'deployment_outcome'>;
  detail?: string | null;
  durationMs?: number | null;
}

export interface EventSink {
  emit(e: DeploymentEvent): Promise<void>;
}

/**
 * Écrit une ligne dans `deployment_event`, sans jamais interrompre l'étage
 * qui journalise.
 *
 * Journaliser est un effet de bord D'OBSERVATION : perdre une ligne de
 * journal est un désagrément, interrompre `publish` au milieu de vingt-deux
 * dépôts GitHub en est un autre. Que l'échec vienne du réseau, de RLS, ou
 * d'une colonne absente après une migration incomplète, `emit` ne doit
 * JAMAIS rejeter — d'où le `try/catch` qui entoure l'appel réseau en plus du
 * `error` déjà rendu par le SDK Supabase (les deux formes d'échec existent).
 *
 * En contrepartie, l'échec est signalé sur stderr : un journal qui se tait
 * sur ses propres trous ferait croire à un journal complet, ce qui est pire
 * que l'absence de journal.
 */
export function createEventSink(client: SupabaseClient<Database>): EventSink {
  return {
    async emit(e: DeploymentEvent): Promise<void> {
      try {
        // Aucun filtre a poser : `e.prospectId` vient de l'etage qui
        // journalise, dont le lot est issu d'une lecture filtree sur le
        // proprietaire. Un `insert` ne se filtre pas sur une relation
        // embarquee, et un parametre `Proprietaire` inutilise annoncerait
        // ici un cloisonnement que cette ligne ne fait pas.
        const { error } = await client.from('deployment_event').insert({
          prospect_id: e.prospectId,
          step: e.step,
          outcome: e.outcome,
          detail: e.detail ?? null,
          duration_ms: e.durationMs ?? null,
        });
        if (error) {
          process.stderr.write(`events: écriture échouée — ${error.message}\n`);
        }
      } catch (err) {
        process.stderr.write(
          `events: écriture échouée — ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    },
  };
}

/**
 * Puits qui ne fait rien : permet aux tests d'étage (et à tout appelant qui
 * n'a pas de client sous la main) de satisfaire un champ `events`
 * obligatoire sans fabriquer de client Supabase.
 */
// Gelé : c'est un singleton partagé par les tests d'étage — un appelant qui
// réassignerait `NULL_SINK.emit` ferait fuir ce changement vers tous les
// autres consommateurs.
export const NULL_SINK: EventSink = Object.freeze({
  async emit(): Promise<void> {
    // Intentionnellement vide.
  },
});
