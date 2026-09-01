import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { ProspectView } from '../domain/prospect.js';
import { loadProspects, prospectRangeReader } from './queries.js';

export type ProspectsState =
  | { status: 'loading' }
  | { status: 'ready'; prospects: ProspectView[] }
  | { status: 'error'; message: string };

/**
 * Charge la totalité des prospects, pagination comprise.
 *
 * L'échec est un état affiché et non une exception avalée : une lecture
 * interrompue en cours de pagination rendrait une liste partielle
 * indiscernable d'une liste complète, ce que `fetchAllRows` refuse déjà de
 * faire. Encore faut-il que l'écran le dise.
 */
export function useProspects(client: SupabaseClient<Database>): ProspectsState & {
  reload: () => void;
} {
  const [state, setState] = useState<ProspectsState>({ status: 'loading' });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    let vivant = true;
    setState({ status: 'loading' });

    loadProspects(prospectRangeReader(client))
      .then((prospects) => {
        // La garde évite d'écrire dans un composant démonté — au retour d'une
        // déconnexion, par exemple, où la requête était déjà partie.
        if (vivant) setState({ status: 'ready', prospects });
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
  }, [client, tentative]);

  const reload = useCallback(() => setTentative((n) => n + 1), []);

  return { ...state, reload };
}
