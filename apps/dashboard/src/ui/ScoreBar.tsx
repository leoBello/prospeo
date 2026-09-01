import type { ScoreView } from '../domain/prospect.js';
import type { DataWarning } from '../domain/coherence.js';
import { SCORE_BAR_GROUPS, scoreSegments } from '../domain/score.js';
import type { ScoreBarGroup } from '../domain/score.js';
import { WarningBadge } from './WarningList.js';
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
  /**
   * Les écarts détectés sur ce prospect, calculés en amont.
   *
   * Passés en propriété plutôt que recalculés ici : la barre n'a accès qu'au
   * score, alors que les écarts se lisent en confrontant trois tables. Les
   * déduire d'ici obligerait à lui passer le prospect entier pour n'en
   * afficher qu'un chiffre.
   */
  warnings?: DataWarning[];
}

/**
 * La barre segmentée de la liste (§9.3) : de quoi un score est fait, et non
 * seulement combien il vaut.
 */
export function ScoreBar({ score, warnings = [] }: Props) {
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
      <WarningBadge warnings={warnings} />
    </span>
  );
}
