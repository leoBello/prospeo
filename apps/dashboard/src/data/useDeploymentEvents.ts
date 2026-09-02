import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { DeploymentEventView } from '../domain/deployment.js';
import { fetchEventsFor } from './deployments.js';

export type DeploymentEventsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; events: DeploymentEventView[] }
  | { status: 'error'; message: string };

/**
 * Charge le journal de déploiement d'UN prospect — l'onglet Historique.
 *
 * Même patron que `useDeployments` et `useSiteTemplate` (garde `vivant`,
 * `reload` par compteur), mais avec deux différences qu'eux n'ont pas :
 *
 * 1. Ici c'est l'IDENTITÉ du prospect qui commande la lecture, pas un simple
 *    bouton « écran affiché ou non ». `prospectId` fait donc partie des
 *    dépendances de l'effet : passer de A à B relance l'effet, ce qui à la
 *    fois déclenche la nouvelle lecture ET invalide l'ancienne via le nettoyage
 *    (`vivant = false`) avant que sa réponse ne puisse s'écrire sur B. C'est
 *    le même mécanisme que la garde de montage des hooks voisins, réutilisé
 *    pour une bascule de sélection plutôt que pour un démontage.
 *
 * 2. `client` peut être `null` — pas seulement `prospectId`. `useDeployments`
 *    et `useSiteTemplate` reçoivent toujours un vrai client, parce que
 *    `App.tsx` ne les appelle qu'après l'avoir construit ; `TodayScreen`, lui,
 *    se rend aussi dans des tests qui ne fabriquent aucun client (comme il se
 *    rend déjà sans `actions`). Un client absent revient donc au même que
 *    l'absence de sélection : `status: 'idle'`, aucune lecture.
 *
 * `status: 'idle'` distinct de `'loading'` : contrairement aux deux hooks
 * voisins, dont le seul état avant la première réponse EST un chargement en
 * cours, celui-ci passe le plus clair de son temps sans rien à charger — le
 * panneau est fermé la plupart du temps. Un onglet qui lirait `'loading'`
 * comme une raison d'afficher un sablier alors qu'aucune requête n'est même
 * partie mentirait sur ce qui se passe.
 */
export function useDeploymentEvents(
  client: SupabaseClient<Database> | null,
  prospectId: string | null,
): DeploymentEventsState & { reload: () => void } {
  const [state, setState] = useState<DeploymentEventsState>({ status: 'idle' });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    if (client === null || prospectId === null) {
      setState({ status: 'idle' });
      return;
    }
    let vivant = true;
    setState({ status: 'loading' });

    fetchEventsFor(client, prospectId)
      .then((events) => {
        // La garde évite qu'une réponse tardive pour un prospect déjà quitté
        // ne s'écrive dans l'état du suivant — voir le point 1 ci-dessus.
        if (vivant) setState({ status: 'ready', events });
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
  }, [client, prospectId, tentative]);

  const reload = useCallback(() => setTentative((n) => n + 1), []);

  return { ...state, reload };
}
