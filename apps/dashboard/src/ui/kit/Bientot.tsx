import type { ReactNode } from 'react';
import { useT } from '../preferences.js';
import { Badge } from './Badge.js';
import { Tooltip } from './Tooltip.js';
import styles from './Bientot.module.css';

interface Props {
  /** Pourquoi ce n'est pas encore là. Une phrase, affichée telle quelle. */
  raison: string;
  children: ReactNode;
}

/**
 * Ce que la maquette montre et que la base ne sait pas encore.
 *
 * Le composant est rendu, visible, mais inerte et annoncé comme tel. Trois
 * choix, chacun pour une raison :
 *
 * - **`inert`** retire tout le sous-arbre du parcours clavier et de l'arbre
 *   d'accessibilité. Sans lui, on tabule vers un bouton qui ne fait rien —
 *   une impasse silencieuse, pire qu'une absence.
 * - **La raison est obligatoire.** Un « indisponible » sans motif se lit comme
 *   une panne, et remonte comme un bug.
 * - **Le marqueur reste hors de la zone inerte**, sinon son infobulle serait
 *   elle aussi inatteignable — on annoncerait sans pouvoir être lu.
 *
 * Chaque usage doit avoir sa ligne dans `docs/design/HANDOFF.md`.
 */
export function Bientot({ raison, children }: Props) {
  const t = useT();
  return (
    <div className={styles.zone}>
      <div className={styles.contenu} aria-disabled="true" inert="">
        {children}
      </div>
      <span className={styles.marqueur}>
        <Tooltip intitule={t('bientot.aria')} contenu={raison}>
          <span tabIndex={0}>
            <Badge ton="info">{t('bientot.label')}</Badge>
          </span>
        </Tooltip>
      </span>
    </div>
  );
}
