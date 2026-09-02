import { useState } from 'react';
import type { ScoreView } from '../domain/prospect.js';
import { groupBreakdown } from '../domain/score.js';
import type { TranslationKey } from '../i18n/translate.js';
import { Absent } from './kit/Card.js';
import { Tooltip } from './kit/Tooltip.js';
import { useT } from './preferences.js';
import styles from './ScoreCompact.module.css';

const CLE_GROUPE: Record<string, TranslationKey> = {
  presence: 'score.group.presence',
  vitalite: 'score.group.vitalite',
  joignabilite: 'score.group.joignabilite',
  disqualifiant: 'score.group.disqualifiant',
};

/** Plafond de chaque bloc au barème, pour donner une échelle aux barres. */
const PLAFOND: Record<string, number> = {
  presence: 30,
  vitalite: 35,
  joignabilite: 35,
  disqualifiant: 100,
};

const COULEUR: Record<string, string> = {
  presence: 'var(--color-seg-presence)',
  vitalite: 'var(--color-seg-vitalite)',
  joignabilite: 'var(--color-seg-joignabilite)',
  disqualifiant: 'var(--color-danger)',
};

const RAYON = 35;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/**
 * Le score : une jauge, trois groupes, et le reçu à la demande.
 *
 * **D2 du chantier n°6.** Le calcul ligne par ligne du §9.3 reste
 * intégralement accessible — c'est lui qui rend le barème réglable et
 * vérifiable. Il cesse seulement d'être déplié en permanence : sur un panneau
 * qui porte déjà trente champs, un reçu de douze lignes toujours ouvert est ce
 * qui rend l'ensemble illisible.
 *
 * Les trois barres donnent la composition d'un coup d'œil ; leur survol livre
 * le détail du groupe ; le reçu complet est à un clic.
 */
export function ScoreCompact({ score }: { score: ScoreView | null }) {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);

  // Un prospect non scoré n'est pas un prospect à zéro, et la distinction
  // remonte jusqu'à l'écran (§ doctrine du chantier 1).
  if (score === null) {
    return <Absent>{t('score.absent.hint')}</Absent>;
  }

  const groupes = groupBreakdown(score.breakdown);
  const remplissage = Math.max(0, Math.min(1, score.total / 100));

  return (
    <div className={styles.wrap}>
      <div className={styles.tete}>
        <div className={styles.jauge}>
          <svg
            width="84"
            height="84"
            viewBox="0 0 84 84"
            role="img"
            aria-label={t('score.gauge.aria', { total: score.total })}
          >
            <circle cx="42" cy="42" r={RAYON} fill="none" stroke="var(--color-seg-empty)" strokeWidth="8" />
            <circle
              cx="42"
              cy="42"
              r={RAYON}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCONFERENCE}
              strokeDashoffset={CIRCONFERENCE * (1 - remplissage)}
              transform="rotate(-90 42 42)"
            />
          </svg>
          <div className={styles.jaugeTexte}>
            <span className={styles.total}>{score.total}</span>
            <span className={styles.surCent}>{t('score.outOfShort')}</span>
          </div>
        </div>

        <div className={styles.groupes}>
          {groupes.map((groupe) => {
            const points = groupe.lines.reduce((somme, l) => somme + l.points, 0);
            const plafond = PLAFOND[groupe.group] ?? 100;
            const part = Math.max(0, Math.min(1, points / plafond));
            const detail = groupe.lines.map((l) => `${l.label} (${l.points >= 0 ? '+' : ''}${l.points})`).join(' · ');
            return (
              <Tooltip
                key={groupe.group}
                intitule={`${t(CLE_GROUPE[groupe.group] ?? 'score.group.presence')} · ${points} / ${plafond}`}
                contenu={detail}
              >
                <div className={styles.groupe} tabIndex={0}>
                  <div className={styles.groupeTete}>
                    <span className={styles.groupeNom}>
                      {t(CLE_GROUPE[groupe.group] ?? 'score.group.presence')}
                    </span>
                    <span className={styles.groupePoints}>{points}</span>
                  </div>
                  <div className={styles.piste}>
                    <div
                      className={styles.remplissage}
                      style={{ width: `${part * 100}%`, background: COULEUR[groupe.group] }}
                    />
                  </div>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <button type="button" className={styles.bascule} onClick={() => setOuvert(!ouvert)}>
        {ouvert ? t('score.receipt.close') : t('score.receipt.open')}
      </button>

      {ouvert ? (
        <div className={styles.recu}>
          {groupes.map((groupe) => (
            <div key={groupe.group} className={styles.recuGroupe}>
              <h4 className={styles.recuGroupeTitre}>
                {t(CLE_GROUPE[groupe.group] ?? 'score.group.presence')}
              </h4>
              {groupe.lines.map((ligne) => (
                <div key={ligne.code} className={styles.ligne}>
                  {/* Libellé du barème : une DONNÉE, affichée telle quelle. */}
                  <span>{ligne.label}</span>
                  <span className={ligne.points >= 0 ? styles.positif : styles.negatif}>
                    {ligne.points >= 0 ? '+' : ''}
                    {ligne.points}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
