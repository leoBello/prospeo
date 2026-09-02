import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { DeploymentView } from '../domain/deployment.js';
import { fetchDeployments } from './deployments.js';

export type DeploymentsState =
  | { status: 'loading' }
  | { status: 'ready'; deployments: DeploymentView[] }
  | { status: 'error'; message: string };

/**
 * Charge l'écran de suivi des déploiements (D9).
 *
 * Même patron que `useProspects` — non testé pour la même raison : c'est un
 * mince branchement au-dessus de `fetchDeployments`, déjà couvert par
 * `data/deployments.test.ts` et `domain/deployment.test.ts`. Rien d'autre à
 * y vérifier qu'un rechargement sur reconnexion, que `useProspects` ne teste
 * pas davantage.
 *
 * `enabled` évite la lecture tant que l'écran « Déploiements » n'est pas la
 * vue affichée : `App` appelle ce hook sans condition (règle des hooks),
 * mais rien n'oblige à interroger Supabase à chaque passage sur
 * « Aujourd'hui ».
 */
export function useDeployments(
  client: SupabaseClient<Database>,
  enabled: boolean,
): DeploymentsState & {
  reload: () => void;
} {
  const [state, setState] = useState<DeploymentsState>({ status: 'loading' });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let vivant = true;
    setState({ status: 'loading' });

    fetchDeployments(client)
      .then((deployments) => {
        if (vivant) setState({ status: 'ready', deployments });
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

  const reload = useCallback(() => setTentative((n) => n + 1), []);

  return { ...state, reload };
}
