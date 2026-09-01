import { useCallback, useEffect, useRef, useState } from 'react';
import { NAVIGATION_KEYS, navigate, shouldIgnoreKeyboard } from './list-navigation.js';
import type { NavigationKey } from './list-navigation.js';

export interface ListNavigation {
  selectedId: string | null;
  panelOpen: boolean;
  select: (id: string) => void;
  close: () => void;
}

/**
 * Branche le parcours clavier sur la fenêtre.
 *
 * L'écoute est posée sur `window` et non sur la liste : le focus se trouve
 * souvent dans le panneau de détail — c'est même le cas nominal, puisqu'on y
 * lit une fiche — et un écouteur local cesserait alors de répondre. Or c'est
 * précisément là que les flèches doivent continuer de fonctionner (§9.1).
 */
export function useListNavigation(ids: string[]): ListNavigation {
  const [selection, setSelection] = useState<{ selectedId: string | null; panelOpen: boolean }>({
    selectedId: null,
    panelOpen: false,
  });

  // Une référence, et non une dépendance de l'effet : les listes sont
  // reconstruites à chaque rafraîchissement des données, et réabonner
  // l'écouteur à chaque fois ferait perdre des touches entre le retrait et la
  // repose.
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!NAVIGATION_KEYS.includes(event.key)) return;
      if (shouldIgnoreKeyboard(event.target)) return;
      // Sans cela, les flèches font défiler la page en même temps qu'elles
      // changent de prospect, et la ligne sélectionnée sort de l'écran.
      event.preventDefault();
      setSelection((courant) =>
        navigate({ ids: idsRef.current, ...courant }, event.key as NavigationKey),
      );
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const select = useCallback((id: string) => setSelection({ selectedId: id, panelOpen: true }), []);
  const close = useCallback(
    () => setSelection((courant) => ({ ...courant, panelOpen: false })),
    [],
  );

  return { selectedId: selection.selectedId, panelOpen: selection.panelOpen, select, close };
}
