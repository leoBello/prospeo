import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';
import {
  annulerRejet,
  definirStatut,
  journaliserInteraction,
  rejeterRedaction,
} from '../data/mutations.js';
import type { EchecDefinirStatut } from '../data/mutations.js';

/** Réexporté pour que l'écran (`PipelineSection.tsx`) n'ait jamais à importer `data/` directement. */
export type { EchecDefinirStatut };

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
 * jamais d'exception, que chaque bouton devrait alors rattraper. `definirStatut`
 * fait exception à la forme (pas au principe) : voir `EchecDefinirStatut`.
 */
export interface PanelActions {
  rejeterRedaction(prospectId: string): Promise<string | null>;
  annulerRejet(prospectId: string): Promise<string | null>;
  /**
   * Rend `null` en cas de succès total, sinon un `EchecDefinirStatut` —
   * jamais une chaîne : `data/mutations.ts` explique pourquoi une chaîne
   * composée par l'application serait un texte d'interface écrit en dur.
   * C'est ici, à la frontière ui/données, que `etape` doit être traduit.
   */
  definirStatut(
    prospectId: string,
    status: Enums<'pipeline_status'>,
    nextActionAt: string | null,
  ): Promise<EchecDefinirStatut | null>;
  journaliser(
    prospectId: string,
    kind: Enums<'interaction_kind'>,
    body: string | null,
  ): Promise<string | null>;
}

/**
 * Branche les écritures sur le client, et relit dès que l'ÉTAT a changé.
 *
 * **La relecture n'est pas un confort.** L'écran entier dérive d'une seule
 * lecture — les indicateurs, les files de travail et la fiche décrivent le
 * même instantané, c'est ce que `loadProspects` garantit. Muter sans relire
 * laisserait la fiche affirmer une chose et la file d'à côté son contraire :
 * un prospect passé à `ne_pas_contacter` resterait compté parmi les relances
 * dues.
 *
 * Pour `rejeterRedaction`, `annulerRejet` et `journaliser`, la règle reste
 * celle d'origine : on ne relit qu'après un SUCCÈS, car une écriture refusée
 * n'y change RIEN — chacune n'écrit qu'une seule table, en un seul appel.
 *
 * **`definirStatut` ne suit plus cette règle**, et c'est délibéré : depuis la
 * tâche 5, cette écriture en touche DEUX (`prospect_pipeline` puis
 * `pipeline_event`), et un `EchecDefinirStatut` dont l'`etape` est
 * `'historique'` signifie que la PREMIÈRE a déjà réussi — l'état en base a
 * changé, quand bien même la fonction rend un échec. Ne relire que sur `null`
 * laisserait alors la fiche afficher l'ANCIEN statut alors que la base porte
 * le NOUVEAU : un fait qu'aucun code ne rendrait vrai, exactement ce que ce
 * lot proscrit. Relire dans ce cas ne fait donc que rattraper la fiche sur un
 * changement déjà survenu ; le message d'erreur, lui, est toujours rendu à
 * l'appelant, qui reste libre de l'afficher — relire n'efface rien.
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

  const definirStatutPuisRelire = async (
    prospectId: string,
    status: Enums<'pipeline_status'>,
    nextActionAt: string | null,
  ): Promise<EchecDefinirStatut | null> => {
    const echec = await definirStatut(client, prospectId, status, nextActionAt);
    // Succès total, ou échec de la seule ligne d'historique : dans les deux
    // cas `prospect_pipeline` a déjà été écrit, et la fiche doit le refléter.
    if (echec === null || echec.etape === 'historique') reload();
    return echec;
  };

  return {
    rejeterRedaction: (id) => puisRelire(rejeterRedaction(client, id)),
    annulerRejet: (id) => puisRelire(annulerRejet(client, id)),
    definirStatut: definirStatutPuisRelire,
    journaliser: (id, kind, body) => puisRelire(journaliserInteraction(client, id, kind, body)),
  };
}
