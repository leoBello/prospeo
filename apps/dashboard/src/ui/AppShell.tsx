import type { ReactNode } from 'react';
import { usePreferences } from './preferences.js';
import styles from './AppShell.module.css';

interface Props {
  /** La liste : elle ne disparaît jamais (§9.1). */
  list: ReactNode;
  /** Le panneau de détail, monté à droite de la liste et non par-dessus. */
  panel: ReactNode;
  onSignOut: () => void;
}

/**
 * La coquille applicative : en-tête, liste permanente, panneau latéral.
 *
 * Le dashboard sert deux gestes opposés — qualifier, qui exige de comparer
 * beaucoup de lignes, et appeler, qui exige de se concentrer sur une seule.
 * Ce patron est le seul des trois envisagés qui ne sacrifie ni l'un ni
 * l'autre, et il évite l'aller-retour vers une page de détail à chaque
 * prospect.
 */
export function AppShell({ list, panel, onSignOut }: Props) {
  const { t, theme, setTheme, locale, setLocale } = usePreferences();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>{t('app.name')}</span>
        <nav className={styles.nav} aria-label={t('app.name')}>
          <button type="button" className={`${styles.navItem} ${styles.navItemActive}`}>
            {t('nav.today')}
          </button>
        </nav>
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
      </header>

      <div className={styles.body}>
        <main className={styles.list}>{list}</main>
        {panel}
      </div>
    </div>
  );
}
