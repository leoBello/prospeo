import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { FaitsLigne, Lot } from '../domain/campagne.js';
import { classerLot } from '../domain/campagne.js';
import { fetchCampagne, fetchHeartbeat } from './campagne.js';

/**
 * La taille du lot (D3 du spec) : les vingt prospects les mieux notés.
 *
 * Constante nommée plutôt que littéral disséminé — un chantier ultérieur la
 * rendra réglable, et un `20` écrit en dur ici se retrouverait mal le jour où
 * il faudrait le faire varier.
 */
const TAILLE_LOT = 20;

export type CampagneState =
  | { status: 'loading' }
  | {
      status: 'ready';
      lot: Lot;
      lignes: Map<string, FaitsLigne>;
      totalProspects: number;
      heartbeat: { beatAt: string; inFlight: number } | null;
    }
  | { status: 'error'; message: string };

/**
 * Charge l'écran de campagne (chantier n°7).
 *
 * Même patron que `useDeployments` : `enabled` évite la lecture Supabase tant
 * que l'écran « Campagne » n'est pas la vue affichée, trois états
 * `loading`/`ready`/`error`, et un `reload` qui déclenche une nouvelle passe.
 *
 * `fetchCampagne` et `fetchHeartbeat` sont lus en parallèle : le battement du
 * worker n'a aucune dépendance sur les prospects, les enchaîner doublerait
 * l'attente sans raison.
 *
 * **Un battement illisible n'empêche PAS l'affichage du lot.** Si
 * `fetchHeartbeat` échoue seul, l'écran ne doit pas disparaître pour une
 * information annexe — voir le `catch` séparé ci-dessous. `heartbeat: null`
 * fait dire à l'écran « à l'arrêt » (lecture prudente), jamais « en échec ».
 */
export function useCampagne(
  client: SupabaseClient<Database>,
  enabled: boolean,
): CampagneState & { reload: () => void } {
  const [state, setState] = useState<CampagneState>({ status: 'loading' });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let vivant = true;
    setState({ status: 'loading' });

    Promise.all([
      fetchCampagne(client),
      // Le battement est secondaire : une lecture ratée ici ne doit pas
      // faire échouer tout l'écran, seulement rendre `null` — voir le
      // docstring ci-dessus.
      fetchHeartbeat(client).catch(() => null),
    ])
      .then(([{ faits, lignes, totalProspects }, heartbeat]) => {
        if (!vivant) return;
        setState({
          status: 'ready',
          // Les prospects qu'on SUIT : ceux qui portent un job non annule.
          // Ils restent affiches meme quand D3 ne les accepte plus — voir le
          // docstring de `classerLot`. Sans cet ensemble, une ligne disparait
          // au moment precis ou son deploiement reussit.
          lot: classerLot(
            faits,
            TAILLE_LOT,
            new Set([...lignes].filter(([, l]) => l.job !== null).map(([id]) => id)),
          ),
          lignes,
          totalProspects,
          heartbeat,
        });
      })
      .catch((cause: unknown) => {
        if (vivant) {
          setState({
            status: 'error',
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });

    return () => {
      vivant = false;
    };
  }, [client, tentative, enabled]);

  /**
   * Le suivi sans rechargement.
   *
   * **Realtime plutôt qu'un sondage** : une campagne dure une quinzaine de
   * minutes, et interroger la base toutes les deux secondes pendant ce
   * temps-là multiplierait les lectures sans rien gagner en fraîcheur.
   *
   * **La relecture est COMPLÈTE, pas incrémentale.** Composer un état à
   * partir d'événements partiels rouvrirait la question de leur ordre
   * d'arrivée — un `INSERT` sur `deployment_event` peut précéder l'`UPDATE`
   * du job qui l'a produit — pour un lot de vingt lignes qui se relit en une
   * requête. On relit.
   *
   * Deux tables, parce qu'elles disent deux choses différentes :
   * `campaign_job` porte le passage en file puis en cours, `deployment_event`
   * l'avancée à l'intérieur d'un traitement. S'abonner à la première seule
   * figerait la ligne pendant toute la durée du déploiement.
   */
  useEffect(() => {
    if (!enabled) return;

    const canal = client
      .channel('campagne-ecran')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_job' }, () =>
        setTentative((n) => n + 1),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deployment_event' },
        () => setTentative((n) => n + 1),
      )
      .subscribe();

    return () => {
      void client.removeChannel(canal);
    };
  }, [client, enabled]);

  const reload = useCallback(() => setTentative((n) => n + 1), []);

  return { ...state, reload };
}
