import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useT } from './preferences.js';
import type { TranslationKey } from '../i18n/translate.js';
import { Tooltip } from './kit/Tooltip.js';
import styles from './Nav.module.css';

/** Les trois écrans de l'application. Voir §« Pourquoi pas de routeur ». */
export type Vue = 'today' | 'deploiements' | 'gabarit';

const VUES: readonly Vue[] = ['today', 'deploiements', 'gabarit'];
const PREFIXE_FRAGMENT = '#/';

/**
 * Lit la vue depuis un fragment d'URL (`#/deploiements`).
 *
 * Un fragment absent, vide ou inconnu retombe sur `today` sans lever : une
 * URL erronée ou périmée (une ancienne vue supprimée, une faute de frappe
 * partagée par lien) ne doit pas produire un écran blanc.
 */
function lireVue(hash: string): Vue {
  const brut = hash.startsWith(PREFIXE_FRAGMENT) ? hash.slice(PREFIXE_FRAGMENT.length) : '';
  return (VUES as readonly string[]).includes(brut) ? (brut as Vue) : 'today';
}

/**
 * La vue courante, vécue dans le fragment d'URL plutôt qu'en mémoire seule.
 *
 * Deux évènements la font changer : `aller`, appelé depuis `Nav`, qui écrit
 * le fragment puis la vue ; et `hashchange`, qui rattrape tout ce que `aller`
 * ne couvre pas — un lien collé dans la barre d'adresse, et surtout les
 * boutons Précédent/Suivant du navigateur, qui changent le fragment sans
 * passer par `aller`.
 */
export function useVue(): { vue: Vue; aller: (v: Vue) => void } {
  const [vue, setVue] = useState<Vue>(() => lireVue(window.location.hash));

  useEffect(() => {
    const surChangement = () => setVue(lireVue(window.location.hash));
    window.addEventListener('hashchange', surChangement);
    return () => window.removeEventListener('hashchange', surChangement);
  }, []);

  const aller = useCallback((prochaine: Vue) => {
    window.location.hash = `${PREFIXE_FRAGMENT}${prochaine}`;
    // Le `hashchange` déclenché par la ligne précédente ramènerait à la même
    // valeur de toute façon ; on ne l'attend pas pour que le clic soit
    // immédiat plutôt que suspendu à un évènement asynchrone.
    setVue(prochaine);
  }, []);

  return { vue, aller };
}

const TRAIT = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
} as const;

/**
 * Trois icônes, un seul style : trait, grille de 20 px, jamais d'emoji. Les
 * tracés reprennent ceux du rail de `Main.dc.html`, pour que ce composant
 * rende la maquette plutôt qu'une réinterprétation.
 */
function IconeToday() {
  return (
    <svg {...TRAIT}>
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  );
}

function IconeDeploiements() {
  return (
    <svg {...TRAIT}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function IconeGabarit() {
  return (
    <svg {...TRAIT}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

interface Entree {
  vue: Vue;
  libelleKey: TranslationKey;
  Icone: () => ReactElement;
}

const ENTREES: readonly Entree[] = [
  { vue: 'today', libelleKey: 'nav.today', Icone: IconeToday },
  { vue: 'deploiements', libelleKey: 'nav.deploiements', Icone: IconeDeploiements },
  { vue: 'gabarit', libelleKey: 'nav.gabarit', Icone: IconeGabarit },
];

interface Props {
  vue: Vue;
  aller: (v: Vue) => void;
}

/**
 * Le rail vertical, à icônes, une entrée par écran.
 *
 * Ignorant de tout sauf de la vue courante et de la fonction pour en changer
 * — c'est `App` qui possède `useVue` et décide quel écran monter derrière.
 * L'entrée active se marque par `aria-current`, pas seulement par la
 * couleur ; chaque icône porte un nom accessible (`aria-label`) et une
 * infobulle, faute de quoi une icône seule ne dit rien.
 */
export function Nav({ vue, aller }: Props) {
  const t = useT();

  return (
    <nav className={styles.rail} aria-label={t('app.name')}>
      {ENTREES.map(({ vue: cible, libelleKey, Icone }) => {
        const actif = cible === vue;
        const libelle = t(libelleKey);
        return (
          <Tooltip key={cible} contenu={libelle}>
            <button
              type="button"
              className={actif ? `${styles.item} ${styles.itemActif}` : styles.item}
              aria-label={libelle}
              aria-current={actif ? 'page' : undefined}
              onClick={() => aller(cible)}
            >
              <Icone />
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
