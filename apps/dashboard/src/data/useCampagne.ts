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

/**
 * Période de relecture du battement du worker.
 *
 * **Pourquoi une relecture périodique existe.** Tout le reste de cet écran se
 * rafraîchit sur Realtime — un job qui bouge, un événement de déploiement qui
 * s'écrit. Or un worker mort n'émet AUCUN signal : c'est exactement la panne
 * silencieuse que `worker_heartbeat` existe pour rendre visible, et c'était le
 * seul fait de l'écran qu'aucun événement ne venait jamais corriger. L'écran
 * affichait « Collector à l'écoute » et un bouton actif dix minutes après sa
 * mort, et ne se reprenait qu'APRÈS le clic qu'il aurait dû empêcher.
 *
 * **Pourquoi 15 s.** Le worker bat toutes les 10 s et `SEUIL_WORKER_MORT_MS`
 * le déclare mort à 60 s de silence (`ui/BandeConditions.tsx`). Une période
 * plus courte que le battement lirait plusieurs fois la même valeur ; une
 * période proche du seuil laisserait l'écran mentir presque deux fois plus
 * longtemps que le seuil ne le promet. À 15 s, l'écran se corrige dans le
 * quart du seuil au pire, soit 75 s après la mort réelle — la borne annoncée
 * par la bande de conditions reste tenue.
 *
 * Cette relecture ne relit QUE le battement : refaire la lecture complète du
 * lot toutes les quinze secondes coûterait plusieurs requêtes paginées pour un
 * fait qui tient en une ligne.
 */
export const PERIODE_RELECTURE_BATTEMENT_MS = 15_000;

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

  /**
   * La relecture périodique du battement — voir
   * `PERIODE_RELECTURE_BATTEMENT_MS` pour le pourquoi et le choix de la
   * période.
   *
   * L'état est RÉÉCRIT à chaque tour, même quand le battement n'a pas bougé :
   * c'est ce nouvel objet qui provoque le rendu, et donc le recalcul du
   * `new Date()` de `CampagneScreen`. Sans lui, un battement figé resterait
   * comparé à un « maintenant » figé, et le franchissement du seuil ne se
   * verrait jamais.
   *
   * Une lecture ratée rend `null` — « on ne sait rien de lui », que
   * `BandeConditions` distingue de « il s'est tu il y a quatorze minutes ».
   * Elle ne fait pas basculer l'écran en erreur : même parti que la lecture
   * initiale ci-dessus.
   */
  useEffect(() => {
    if (!enabled) return;

    const battement = setInterval(() => {
      void fetchHeartbeat(client)
        .catch(() => null)
        .then((heartbeat) => {
          setState((precedent) =>
            precedent.status === 'ready' ? { ...precedent, heartbeat } : precedent,
          );
        });
    }, PERIODE_RELECTURE_BATTEMENT_MS);

    return () => clearInterval(battement);
  }, [client, enabled]);

  const reload = useCallback(() => setTentative((n) => n + 1), []);

  return { ...state, reload };
}
