/**
 * Parcours de la liste au clavier.
 *
 * La logique est séparée du composant et sans dépendance au DOM : c'est une
 * clause du contrat (§9.1, « la navigation au clavier fait partie du contrat,
 * pas des finitions ») et une clause se vérifie. Enfouie dans un gestionnaire
 * d'événements, elle ne se testerait qu'en simulant un navigateur.
 */

export interface NavigationState {
  /** Les prospects affichés, dans l'ordre où ils apparaissent à l'écran. */
  ids: string[];
  selectedId: string | null;
  panelOpen: boolean;
}

export type NavigationKey = 'ArrowDown' | 'ArrowUp' | 'Escape';

export const NAVIGATION_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Escape'];

export function navigate(state: NavigationState, key: NavigationKey): NavigationState {
  if (key === 'Escape') {
    // La sélection survit à la fermeture : rouvrir le panneau doit revenir au
    // prospect qu'on regardait, pas à la tête de liste.
    return { ...state, panelOpen: false };
  }

  if (state.ids.length === 0) return { ...state, selectedId: null, panelOpen: false };

  const courant = state.selectedId === null ? -1 : state.ids.indexOf(state.selectedId);

  // `indexOf` rend −1 aussi bien pour « rien de sélectionné » que pour « la
  // ligne sélectionnée a disparu ». Les données se rafraîchissent pendant
  // qu'on navigue, ce second cas est donc réel : sans ce repli, les flèches
  // resteraient sans effet et rien ne l'expliquerait à l'écran.
  if (courant === -1) {
    const cible = key === 'ArrowDown' ? 0 : state.ids.length - 1;
    return { ...state, selectedId: state.ids[cible] ?? null, panelOpen: true };
  }

  // Bornage strict plutôt que rebouclage : dans une file d'appels, repasser de
  // la dernière ligne à la première fait rappeler quelqu'un qu'on vient de
  // traiter.
  const suivant = Math.min(state.ids.length - 1, Math.max(0, courant + (key === 'ArrowDown' ? 1 : -1)));

  return {
    ...state,
    selectedId: state.ids[suivant] ?? null,
    // Le panneau reste ouvert : c'est exactement ce que le patron liste +
    // panneau achète, comparé à un aller-retour vers une page de détail.
    panelOpen: true,
  };
}

const BALISES_DE_SAISIE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Le raccourci doit-il céder la place à la frappe en cours ?
 *
 * Sans cette garde, taper dans un champ de recherche ferait défiler la liste à
 * chaque flèche et le curseur ne bougerait jamais dans le texte.
 */
export function shouldIgnoreKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (BALISES_DE_SAISIE.has(target.tagName)) return true;

  // `closest` et non `isContentEditable` : le focus atterrit sur le nœud
  // profond où se trouve le curseur, pas sur le bloc qui porte l'attribut.
  // Tester le seul élément visé laisserait donc passer les flèches dès que la
  // frappe a lieu à l'intérieur d'un paragraphe éditable.
  const editable = target.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
}
