import { Popover } from '@base-ui/react/popover';
import type { ReactNode } from 'react';
import { usePreferences } from './preferences.js';
import styles from './BarreHaut.module.css';

interface Props {
  /**
   * Le champ de recherche de l'écran courant, s'il en fournit un.
   *
   * Optionnel comme `nav` sur `AppShell`, et pour la même raison : seul
   * l'écran appelant (aujourd'hui, `TodayScreen`) sait quoi filtrer — les
   * listes de travail déjà chargées en mémoire — et construit lui-même le
   * champ, son état et le raccourci qui lui donne le focus. `BarreHaut`
   * l'affiche sans rien connaître de son fonctionnement ; sur les écrans qui
   * n'en fournissent pas (Déploiements, Gabarit), rien n'apparaît à sa place —
   * pas un champ inerte qui ressemble à un champ actif.
   */
  search?: ReactNode;
  /**
   * Le compteur de série (tâche 8, lot 3) : optionnel comme `search`, et pour
   * la même raison — `BarreHaut` l'affiche sans rien connaître du jeu.
   * `TodayScreen` en rend `null` tant que l'historique ne permet pas de
   * trancher (voir `SerieEnTete`, `ui/BandeProgression.tsx`) ; rien
   * n'apparaît alors à sa place, comme pour `search` sur les écrans qui n'en
   * fournissent pas.
   */
  serie?: ReactNode;
  onSignOut: () => void;
}

const TRAIT = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
} as const;

/** Silhouette générique : aucune initiale, rien ici ne connaît qui est connecté. */
function IconeCompte() {
  return (
    <svg {...TRAIT}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

/**
 * La barre du haut : nom de l'application, recherche de l'écran courant s'il
 * en fournit une, et préférences repliées derrière un bouton de compte.
 *
 * Thème, langue et déconnexion vivaient ici en trois boutons de texte nu,
 * ce que la maquette ne montre pas. Ils rejoignent un `Popover` de Base UI —
 * plutôt qu'un panneau écrit à la main — parce que c'est la raison d'être de
 * cette dépendance (D8), et parce que son déclencheur pose lui-même
 * `aria-haspopup="dialog"`, `aria-expanded` et `aria-controls` (vérifié dans
 * `PopoverTrigger.js` de `@base-ui/react` 1.7.0) : exactement le câblage
 * qu'un bouton-panneau écrit à la main devrait poser à la main. Chaque
 * commande garde un nom accessible traduit ; aucune initiale de compte n'est
 * inventée, rien ici ne connaissant l'identité de la personne connectée
 * (décision du pilote, lot 3 tâche 2).
 */
export function BarreHaut({ search, serie, onSignOut }: Props) {
  const { t, theme, setTheme, locale, setLocale } = usePreferences();
  const libelleCompte = t('account.button');

  return (
    <header className={styles.barre}>
      <span className={styles.marque}>{t('app.name')}</span>
      <div className={styles.espace} />
      {search}
      {serie}
      <Popover.Root>
        <Popover.Trigger className={styles.compte} aria-label={libelleCompte}>
          <IconeCompte />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={8} align="end">
            <Popover.Popup className={styles.popup} aria-label={libelleCompte}>
              <button
                type="button"
                className={styles.item}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
              </button>
              <button
                type="button"
                className={styles.item}
                onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
              >
                {t('locale.switch')}
              </button>
              <button type="button" className={styles.item} onClick={onSignOut}>
                {t('nav.signOut')}
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </header>
  );
}
