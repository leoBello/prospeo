import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTon = 'neutre' | 'accent' | 'succes' | 'alerte' | 'danger' | 'info';

/**
 * `compacte` sert la ligne de liste (maquette, méthode `ligne()` :
 * `height: 19px; font-size: 10px`, contre 22px/11px dans le panneau). La
 * taille par défaut reste `normale` pour tous les appelants existants — le
 * panneau, les tableaux — dont aucun ne doit changer de rendu pour ce seul
 * ajout.
 */
export type BadgeTaille = 'normale' | 'compacte';

interface Props {
  ton?: BadgeTon;
  taille?: BadgeTaille;
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
 * généré par les CSS Modules, qui change à chaque build. `data-taille` suit
 * le même principe.
 */
export function Badge({
  ton = 'neutre',
  taille = 'normale',
  point = false,
  discontinu = false,
  children,
}: Props) {
  return (
    <span
      className={`${styles.badge} ${discontinu ? styles.discontinu : ''}`}
      data-ton={ton}
      data-taille={taille}
      data-discontinu={discontinu ? 'true' : undefined}
    >
      {point ? <span className={styles.point} /> : null}
      {children}
    </span>
  );
}
