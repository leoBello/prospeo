import type { ScoreView } from '../domain/prospect.js';
import { SCORE_BAR_GROUPS, isScoreStale, scoreSegments } from '../domain/score.js';
import type { ScoreBarGroup } from '../domain/score.js';
import { useT } from './preferences.js';
import styles from './ScoreBar.module.css';

const COULEUR: Record<ScoreBarGroup, string> = {
  presence: 'var(--color-seg-presence)',
  vitalite: 'var(--color-seg-vitalite)',
  joignabilite: 'var(--color-seg-joignabilite)',
};

const CLE_GROUPE = {
  presence: 'score.group.presence',
  vitalite: 'score.group.vitalite',
  joignabilite: 'score.group.joignabilite',
} as const;

interface Props {
  /** `null` quand aucun `prospect_score` n'existe — pas quand le total vaut 0. */
  score: ScoreView | null;
  /** Version du barème de `packages/core`, pour détecter un score périmé. */
  currentRulesetVersion: string;
}

/**
 * La barre segmentée de la liste (§9.3) : de quoi un score est fait, et non
 * seulement combien il vaut.
 */
export function ScoreBar({ score, currentRulesetVersion }: Props) {
  const t = useT();

  if (score === null) {
    // Ni zéro, ni tiret, ni ligne absente : un libellé qui dit l'état réel.
    // Un tiret se lit comme « valeur nulle » et ne se distingue pas d'une
    // colonne vide par erreur.
    return (
      <span className={styles.absent} title={t('score.absent.hint')}>
        {t('score.absent')}
      </span>
    );
  }

  const segments = scoreSegments(score.breakdown, score.total);
  const perime = isScoreStale(score.rulesetVersion, currentRulesetVersion);

  // La description sonore remplace la barre pour qui ne la voit pas : la
  // couleur ne porte jamais seule une information (§ accessibilité).
  const detail = SCORE_BAR_GROUPS.map((g) => {
    const points = segments.find((s) => s.group === g)?.points ?? 0;
    return `${t(CLE_GROUPE[g])} ${points > 0 ? '+' : ''}${points}`;
  }).join(', ');

  return (
    <span className={styles.wrap}>
      <span
        className={styles.track}
        role="img"
        aria-label={t('score.bar.label', { total: score.total, detail })}
      >
        {segments
          // Un segment de largeur nulle n'est pas dessiné : c'est le bloc
          // manquant qui doit se voir, pas un trait d'un pixel qui suggère
          // une contribution.
          .filter((segment) => segment.widthPercent > 0)
          .map((segment) => (
            <span
              key={segment.group}
              data-segment={segment.group}
              className={styles.segment}
              style={{ width: `${segment.widthPercent}%`, background: COULEUR[segment.group] }}
            />
          ))}
      </span>
      <span className={styles.total}>{score.total}</span>
      {perime ? (
        <span className={styles.stale} title={t('score.stale.hint')}>
          {t('score.stale', { stored: score.rulesetVersion, current: currentRulesetVersion })}
        </span>
      ) : null}
    </span>
  );
}
