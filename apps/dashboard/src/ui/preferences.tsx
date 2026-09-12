import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LOCALES, translate } from '../i18n/translate.js';
import type { Locale, TranslationKey, TranslationParams } from '../i18n/translate.js';

export type Theme = 'dark' | 'light';

export interface Preferences {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /**
   * Le brief du jour est-il replié ?
   *
   * Persisté, et non tenu en état de session : c'est le seul réglage qui rende
   * la table de veille tenable sur un écran de portable (décision 3-1 du
   * 2026-09-10), et le redemander à chaque visite le rendrait inutile.
   */
  briefReplie: boolean;
  setBriefReplie: (replie: boolean) => void;
  /** Traduit dans la locale courante. Aucun composant n'écrit de chaîne en dur. */
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const CLE_LOCALE = 'prospeo.locale';
const CLE_THEME = 'prospeo.theme';
const CLE_BRIEF = 'prospeo.briefReplie';

const PreferencesContext = createContext<Preferences | null>(null);

/**
 * Lit une préférence persistée.
 *
 * L'accès à `localStorage` est enveloppé : il lève, et non rend `null`, quand
 * le navigateur refuse le stockage — navigation privée sur certains moteurs,
 * cookies tiers bloqués. Une exception ici ferait échouer le premier rendu de
 * toute l'application pour une préférence d'affichage.
 */
function lire<T extends string>(cle: string, valides: readonly T[], defaut: T): T {
  try {
    const brut = window.localStorage.getItem(cle);
    return valides.includes(brut as T) ? (brut as T) : defaut;
  } catch {
    return defaut;
  }
}

function ecrire(cle: string, valeur: string): void {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    // Sans persistance, la préférence vaut pour la session : dégradation
    // acceptable, contrairement à un écran blanc.
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  // Thème sombre par défaut (§9.4), thème clair en bascule.
  const [theme, setThemeState] = useState<Theme>(() => lire(CLE_THEME, ['dark', 'light'], 'dark'));
  const [locale, setLocaleState] = useState<Locale>(() => lire(CLE_LOCALE, LOCALES, 'fr'));
  const [briefReplie, setBriefReplieState] = useState<boolean>(
    () => lire(CLE_BRIEF, ['true', 'false'] as const, 'false') === 'true',
  );

  useEffect(() => {
    // Le thème s'applique sur `documentElement` et non sur un conteneur React :
    // le fond de page déborde du point de montage, et le laisser au thème du
    // navigateur ferait un liseré clair autour d'une application sombre.
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  useEffect(() => {
    // Sans `lang` à jour, les lecteurs d'écran prononcent le français avec la
    // phonétique anglaise, et la coupure de mots suit les règles de la
    // mauvaise langue.
    document.documentElement.lang = locale;
  }, [locale]);

  const setTheme = useCallback((valeur: Theme) => {
    setThemeState(valeur);
    ecrire(CLE_THEME, valeur);
  }, []);

  const setLocale = useCallback((valeur: Locale) => {
    setLocaleState(valeur);
    ecrire(CLE_LOCALE, valeur);
  }, []);

  const setBriefReplie = useCallback((replie: boolean) => {
    setBriefReplieState(replie);
    ecrire(CLE_BRIEF, String(replie));
  }, []);

  const value = useMemo<Preferences>(
    () => ({
      locale,
      setLocale,
      theme,
      setTheme,
      briefReplie,
      setBriefReplie,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale, theme, setTheme, briefReplie, setBriefReplie],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const value = useContext(PreferencesContext);
  if (value === null) {
    throw new Error('usePreferences hors de PreferencesProvider.');
  }
  return value;
}

/** Raccourci pour le seul besoin courant : traduire. */
export function useT(): Preferences['t'] {
  return usePreferences().t;
}
