import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTon = 'neutre' | 'accent' | 'succes' | 'alerte' | 'danger' | 'info';

interface Props {
  ton?: BadgeTon;
  /** Double la couleur d'un point. Ne remplace jamais le libellé. */
  point?: boolean;
  /** Trait discontinu : distingue une obligation d'une étape du parcours. */
  discontinu?: boolean;
  children: ReactNode;
}

/**
 * La pastille d'état.
 *
 * `data-ton` porte le ton plutôt qu'une classe composée : le style se lit
 * depuis le CSS, et le test peut affirmer sur l'état sans dépendre du nom
 * généré par les CSS Modules, qui change à chaque build.
 */
export function Badge({ ton = 'neutre', point = false, discontinu = false, children }: Props) {
  return (
    <span
      className={`${styles.badge} ${discontinu ? styles.discontinu : ''}`}
      data-ton={ton}
      data-discontinu={discontinu ? 'true' : undefined}
    >
      {point ? <span className={styles.point} /> : null}
      {children}
    </span>
  );
}
