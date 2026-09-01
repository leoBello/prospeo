import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';
import {
  annulerRejet,
  definirStatut,
  journaliserInteraction,
  rejeterRedaction,
} from '../data/mutations.js';

/**
 * Les écritures de la fiche, sous la forme que l'interface consomme.
 *
 * Un objet de rappels plutôt qu'un client passé aux composants, pour une
 * raison qui a déjà servi ailleurs dans ce dépôt : un composant qui fabrique
 * lui-même son accès à la base ne peut plus se rendre sans réseau, et l'écran
 * entier cesse d'être éprouvable. C'est le même parti que `DomainDeps` dans le
 * collector et que l'injection de `fetch` dans `github.ts`.
 *
 * Chaque rappel rend `null` en cas de succès et le message d'erreur sinon —
 * jamais d'exception, que chaque bouton devrait alors rattraper.
 */
export interface PanelActions {
  rejeterRedaction(prospectId: string): Promise<string | null>;
  annulerRejet(prospectId: string): Promise<string | null>;
  definirStatut(
    prospectId: string,
    status: Enums<'pipeline_status'>,
    nextActionAt: string | null,
  ): Promise<string | null>;
  journaliser(
    prospectId: string,
    kind: Enums<'interaction_kind'>,
    body: string | null,
  ): Promise<string | null>;
}

/**
 * Branche les écritures sur le client, et relit après chaque succès.
 *
 * **La relecture n'est pas un confort.** L'écran entier dérive d'une seule
 * lecture — les indicateurs, les files de travail et la fiche décrivent le
 * même instantané, c'est ce que `loadProspects` garantit. Muter sans relire
 * laisserait la fiche affirmer une chose et la file d'à côté son contraire :
 * un prospect passé à `ne_pas_contacter` resterait compté parmi les relances
 * dues.
 *
 * On ne relit qu'après un SUCCÈS : une écriture refusée n'a rien changé, et
 * relire alors ferait clignoter tout l'écran pour rien tout en effaçant le
 * message d'erreur que l'utilisateur n'a pas encore lu.
 */
export function makePanelActions(
  client: SupabaseClient<Database>,
  reload: () => void,
): PanelActions {
  const puisRelire = async (
    ecriture: Promise<string | null>,
  ): Promise<string | null> => {
    const erreur = await ecriture;
    if (erreur === null) reload();
    return erreur;
  };

  return {
    rejeterRedaction: (id) => puisRelire(rejeterRedaction(client, id)),
    annulerRejet: (id) => puisRelire(annulerRejet(client, id)),
    definirStatut: (id, status, nextActionAt) =>
      puisRelire(definirStatut(client, id, status, nextActionAt)),
    journaliser: (id, kind, body) => puisRelire(journaliserInteraction(client, id, kind, body)),
  };
}
