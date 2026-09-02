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

/**
 * L'attente à accorder à une infobulle ouverte au survol.
 *
 * Base UI n'ouvre pas avant 600 ms — c'est le délai qui empêche le
 * clignotement quand la souris ne fait que traverser. L'attente par défaut de
 * `findBy*` est de 1000 ms : elle suffit tout juste (mesuré à 714 ms sur une
 * machine au repos), ce qui est une mauvaise raison de passer. Une machine
 * chargée, un jour de CI lent, et le test échoue sans qu'aucun code n'ait
 * changé.
 *
 * Elle vit ici plutôt que dans `kit/Tooltip.test.tsx` pour une raison
 * mécanique : importer un fichier `.test.tsx` depuis un autre exécuterait ses
 * `describe` une seconde fois, sous le nom du fichier importateur.
 */
export const ATTENTE_SURVOL = { timeout: 3000 };
