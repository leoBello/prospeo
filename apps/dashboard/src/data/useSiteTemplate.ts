import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { fetchSiteTemplateDetail, type SiteTemplateView } from './deployments.js';

export type SiteTemplateState =
  | { status: 'loading' }
  | { status: 'ready'; template: SiteTemplateView }
  | { status: 'error'; message: string };

/**
 * Charge l'écran du gabarit (D10).
 *
 * Même patron que `useDeployments` — non testé pour la même raison : un
 * mince branchement au-dessus de `fetchSiteTemplateDetail`, déjà couvert par
 * les tests de `data/mutations.ts` côté écriture et de `GabaritScreen.tsx`
 * côté rendu. `reload` sert à revenir lire la ligne juste après une
 * désignation, qu'`App.tsx` déclenche à la suite de `designerGabarit`.
 *
 * `enabled` évite la lecture tant que l'écran « Gabarit » n'est pas affiché,
 * comme `useDeployments` le fait pour « Déploiements ».
 */
export function useSiteTemplate(
  client: SupabaseClient<Database>,
  enabled: boolean,
): SiteTemplateState & {
  reload: () => void;
} {
  const [state, setState] = useState<SiteTemplateState>({ status: 'loading' });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let vivant = true;
    setState({ status: 'loading' });

    fetchSiteTemplateDetail(client)
      .then((template) => {
        if (vivant) setState({ status: 'ready', template });
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
