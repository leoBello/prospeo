import { useT } from '../preferences.js';
import { Badge } from './Badge.js';
import styles from './Pagination.module.css';

const CHEVRON = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
} as const;

/**
 * Les numéros de page à montrer : les deux extrémités, les voisines de la
 * page courante, et un saut ailleurs.
 *
 * Treize boutons de page tiendraient dans la largeur ; deux cents non. La
 * règle est écrite ici, séparée du rendu, parce que c'est la seule partie du
 * composant qui décide quelque chose — le reste dessine.
 */
export function numerosDePage(page: number, pages: number): Array<number | 'saut'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const autour = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
  const retenus = [1, ...autour, pages];

  const sortie: Array<number | 'saut'> = [];
  let precedent = 0;
  for (const n of retenus) {
    if (n - precedent > 1) sortie.push('saut');
    sortie.push(n);
    precedent = n;
  }
  return sortie;
}

interface Props {
  page: number;
  pages: number;
  premier: number;
  dernier: number;
  total: number;
  /** La taille de page, affichée telle quelle : elle est constante et l'écran le dit. */
  taille: number;
  onAller: (page: number) => void;
}

/**
 * La barre de pagination : ce qu'on voit, sur combien, et comment aller ailleurs.
 *
 * À une seule page, les boutons disparaissent mais **l'étendue reste** : elle
 * est le seul endroit qui dise combien de lignes l'onglet contient, et la
 * masquer avec eux retirerait un fait pour une raison de mise en page.
 */
export function Pagination({ page, pages, premier, dernier, total, taille, onAller }: Props) {
  const t = useT();

  return (
    <nav className={styles.barre} aria-label={t('pagination.aria')}>
      <span className={styles.etendue}>{t('pagination.etendue', { premier, dernier, total })}</span>
      <Badge ton="neutre" taille="compacte" discontinu>
        {t('pagination.taille', { count: taille })}
      </Badge>

      <span className={styles.espace} />

      {pages <= 1 ? (
        <span className={styles.unePage}>{t('pagination.unePage')}</span>
      ) : (
        <div className={styles.pages}>
          <button
            type="button"
            className={`${styles.bouton} ${styles.nav}`}
            disabled={page <= 1}
            onClick={() => onAller(page - 1)}
          >
            <svg {...CHEVRON}><path d="m15 18-6-6 6-6" /></svg>
            {t('pagination.precedentes')}
          </button>

          {numerosDePage(page, pages).map((n, i) =>
            n === 'saut' ? (
              // Un texte et non un bouton : il ne mène nulle part, et un
              // bouton inerte est une affordance qui ment.
              <span key={`saut-${i}`} className={styles.saut} aria-hidden="true">…</span>
            ) : (
              <button
                key={n}
                type="button"
                className={styles.bouton}
                aria-current={n === page ? 'page' : undefined}
                aria-label={t('pagination.page.aria', { page: n, pages })}
                onClick={() => onAller(n)}
              >
                {n}
              </button>
            ),
          )}

          <button
            type="button"
            className={`${styles.bouton} ${styles.nav}`}
            disabled={page >= pages}
            onClick={() => onAller(page + 1)}
          >
            {t('pagination.suivantes')}
            <svg {...CHEVRON}><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      )}
    </nav>
  );
}
