import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PreferencesProvider } from './ui/preferences.js';

/**
 * Monte un composant dans le contexte de préférences.
 *
 * Aucun composant ne peut être rendu sans lui : tout le texte affiché passe
 * par `t()`, et c'est voulu — un composant qui se rendrait sans le fournisseur
 * serait un composant qui écrit ses chaînes en dur.
 */
export function renderWithPreferences(ui: ReactElement): RenderResult {
  return render(<PreferencesProvider>{ui}</PreferencesProvider>);
}
