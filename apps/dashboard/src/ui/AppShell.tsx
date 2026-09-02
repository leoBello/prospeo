import type { ReactNode } from 'react';
import { BarreHaut } from './BarreHaut.js';
import styles from './AppShell.module.css';

interface Props {
  /** La liste : elle ne disparaît jamais (§9.1). */
  list: ReactNode;
  /** Le panneau de détail, monté à droite de la liste et non par-dessus. */
  panel: ReactNode;
  /**
   * Le rail de navigation entre écrans. `ReactNode`, comme `list` et
   * `panel` : la coquille l'affiche sans savoir combien de vues existent ni
   * lesquelles — c'est `Nav`, via `App`, qui porte cette liste. Optionnel
   * pour que les tests d'écran existants, qui montent `AppShell` sans lui,
   * continuent de passer sans rail.
   */
  nav?: ReactNode;
  /**
   * Le champ de recherche de la barre du haut, optionnel comme `nav` et pour
   * la même raison : seul l'écran appelant sait quoi filtrer et le construit
   * lui-même (aujourd'hui, `TodayScreen` seul). `AppShell` le transmet à
   * `BarreHaut` sans rien en connaître.
   */
  search?: ReactNode;
  /** Le compteur de série de la barre du haut (tâche 8, lot 3) — transmis à `BarreHaut` sans rien en connaître, même patron que `search`. */
  serie?: ReactNode;
  onSignOut: () => void;
}

/**
 * La coquille applicative : rail de navigation, en-tête, liste permanente,
 * panneau latéral.
 *
 * Le dashboard sert deux gestes opposés — qualifier, qui exige de comparer
 * beaucoup de lignes, et appeler, qui exige de se concentrer sur une seule.
 * Ce patron est le seul des trois envisagés qui ne sacrifie ni l'un ni
 * l'autre, et il évite l'aller-retour vers une page de détail à chaque
 * prospect.
 */
export function AppShell({ list, panel, nav, search, serie, onSignOut }: Props) {
  return (
    <div className={styles.shell}>
      {nav}
      <div className={styles.main}>
        <BarreHaut search={search} serie={serie} onSignOut={onSignOut} />

        <div className={styles.body}>
          <main className={styles.list}>{list}</main>
          {panel}
        </div>
      </div>
    </div>
  );
}
