import { Tooltip as Base } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface Props {
  /** Nomme la nature de l'explication. Optionnel. */
  intitule?: string;
  contenu: ReactNode;
  /** L'élément déclencheur. Base UI y pose les attributs ARIA. */
  children: ReactElement;
}

/**
 * L'infobulle.
 *
 * **Ce qu'elle porte, et ce qu'elle ne porte pas.** Elle explique le *pourquoi*
 * — pourquoi un champ est vide, pourquoi une confiance d'appariement compte.
 * Elle ne porte jamais une information dont la décision dépend : ce qui compte
 * reste visible sans geste.
 *
 * Base UI plutôt qu'une implémentation maison : le placement qui évite les
 * bords, le délai qui empêche le clignotement au passage de la souris, la
 * révélation au clavier et la sémantique ARIA sont exactement ce qu'on écrit
 * mal quand on l'écrit soi-même.
 */
export function Tooltip({ intitule, contenu, children }: Props) {
  return (
    <Base.Root>
      <Base.Trigger render={children} />
      <Base.Portal>
        <Base.Positioner sideOffset={8}>
          <Base.Popup className={styles.popup}>
            {intitule === undefined ? null : <span className={styles.intitule}>{intitule}</span>}
            {contenu}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
