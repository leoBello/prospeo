import type { DataWarning } from '../domain/coherence.js';
import { useT } from './preferences.js';
import styles from './WarningList.module.css';

/**
 * Traduit un signalement en phrase.
 *
 * La fonction est exportée pour que la pastille compacte de la liste et le
 * bloc détaillé du panneau disent exactement la même chose : deux formulations
 * différentes du même écart obligeraient à comparer, et l'une des deux
 * finirait par ne plus être mise à jour.
 */
export function useWarningText(): (warning: DataWarning) => string {
  const t = useT();
  return (warning) => {
    switch (warning.kind) {
      case 'presence_contradicted':
        return t('warning.presenceContradicted', { url: warning.declaredUrl });
      case 'score_predates_enrichment':
        return t('warning.scorePredatesEnrichment');
      case 'score_stale_ruleset':
        return t('warning.staleRuleset', { stored: warning.stored, current: warning.current });
    }
  };
}

/** La pastille de bout de ligne : compacte, mais jamais muette au survol. */
export function WarningBadge({ warnings }: { warnings: DataWarning[] }) {
  const t = useT();
  const texte = useWarningText();
  if (warnings.length === 0) return null;

  const detail = warnings.map(texte).join(' ');

  return (
    <span
      className={styles.badge}
      // Le titre porte le détail au survol ; `aria-label` le porte pour les
      // lecteurs d'écran. Une pastille qui n'énoncerait que « ! » serait une
      // alerte sans contenu, c'est-à-dire une décoration inquiétante.
      title={detail}
      aria-label={`${t('warning.badge', { count: warnings.length })} : ${detail}`}
      role="img"
    >
      !
    </span>
  );
}

/** Le bloc détaillé du panneau : une phrase par écart, et ce qu'on en fait. */
export function WarningList({ warnings }: { warnings: DataWarning[] }) {
  const t = useT();
  const texte = useWarningText();
  if (warnings.length === 0) return null;

  return (
    <section className={styles.block} aria-label={t('warning.title')}>
      <h3 className={styles.title}>{t('warning.title')}</h3>
      <ul className={styles.list}>
        {warnings.map((warning) => (
          <li key={warning.kind}>{texte(warning)}</li>
        ))}
      </ul>
      <p className={styles.hint}>{t('warning.hint')}</p>
    </section>
  );
}
