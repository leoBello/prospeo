import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { Jeu } from '../domain/jeu.js';
import { fetchJeu } from './jeu.js';

export type JeuState =
  | { status: 'loading' }
  | { status: 'ready'; jeu: Jeu }
  | { status: 'error'; message: string };

/**
 * Charge le jeu (D5) — même patron que `useDeployments` : garde `vivant`,
 * `reload` par compteur, `enabled` pour ne lire que lorsque l'écran qui
 * l'affiche est monté.
 *
 * `now` n'est PAS un paramètre de ce hook, volontairement : `fetchJeu` lit
 * l'horloge elle-même (défaut `new Date()`) au moment de l'appel, comme
 * `fetchDeployments`. Un appelant qui passerait `new Date()` à chaque rendu
 * changerait de référence à chaque fois et relancerait l'effet en boucle —
 * le même écueil que `useDeployments` évite déjà en ne prenant pas `now` en
 * entrée.
 *
 * La garde `vivant` couvre deux cas distincts, tous deux réels pour cet
 * écran : un démontage (l'utilisateur quitte la vue avant la réponse) et un
 * `reload` qui relance l'effet avant que la lecture précédente n'ait fini —
 * dans les deux cas, la réponse en vol au moment du nettoyage ne doit plus
 * pouvoir écrire l'état courant.
 */
export function useJeu(
  client: SupabaseClient<Database>,
  enabled: boolean,
): JeuState & { reload: () => void } {
  const [state, setState] = useState<JeuState>({ status: 'loading' });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let vivant = true;
    setState({ status: 'loading' });

    fetchJeu(client)
      .then((jeu) => {
        // Voir le docstring du hook : un `reload` ou un démontage survenu
        // entre-temps a déjà mis `vivant` à faux avant que cette réponse
        // n'arrive.
        if (vivant) setState({ status: 'ready', jeu });
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
