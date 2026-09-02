import type { ReactNode } from 'react';
import { usePreferences } from './preferences.js';
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
export function AppShell({ list, panel, nav, onSignOut }: Props) {
  const { t, theme, setTheme, locale, setLocale } = usePreferences();

  return (
    <div className={styles.shell}>
      {nav}
      <div className={styles.main}>
        <header className={styles.header}>
          <span className={styles.brand}>{t('app.name')}</span>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
            >
              {t('locale.switch')}
            </button>
            <button type="button" className={styles.action} onClick={onSignOut}>
              {t('nav.signOut')}
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <main className={styles.list}>{list}</main>
          {panel}
        </div>
      </div>
    </div>
  );
}
