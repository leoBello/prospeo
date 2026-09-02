import { useState } from 'react';
import { SCORING_RULESET } from '@prospeo/core';
import type { ScoreView } from '../domain/prospect.js';
import { SCORE_BAR_GROUPS, groupBreakdown } from '../domain/score.js';
import type { ScoreBarGroup } from '../domain/score.js';
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

/**
 * Plafond de chaque bloc, dérivé du barème réel (`SCORING_RULESET`) plutôt que
 * ressaisi à la main — un plafond ressaisi dérive à la première évolution des
 * règles : l'ancien plafond « presence » disait 30, alors que le barème
 * attribue 45 à `social_only`.
 *
 * - `presence` : une seule ligne de présence est jamais posée par
 *   `computeScore` ; le plafond est le maximum des points du barème
 *   `presence` (les valeurs négatives, comme `has_site`, ne peuvent pas être
 *   le maximum).
 * - `joignabilite` : une seule ligne de téléphone est jamais posée ; même
 *   logique sur le barème `phone`.
 * - `vitalite` : plusieurs lignes peuvent se cumuler (réputation, volume
 *   d'avis, fraîcheur sociale, effectif, ancienneté) ; le plafond en est la
 *   somme. Deux de ces règles sont actuellement INERTES faute de donnée
 *   source (voir les commentaires du barème) — les compter quand même rend le
 *   plafond correct le jour où la donnée revient, sans toucher ce fichier.
 */
const R = SCORING_RULESET;
const PLAFOND: Record<ScoreBarGroup, number> = {
  presence: Math.max(...Object.values(R.presence)),
  vitalite: R.reputation.points + R.reviewsVolume.points + R.socialFresh.points + R.staff.points + R.age.points,
  joignabilite: Math.max(R.phone.mobile, R.phone.landline),
};

const COULEUR: Record<ScoreBarGroup, string> = {
  presence: 'var(--color-seg-presence)',
  vitalite: 'var(--color-seg-vitalite)',
  joignabilite: 'var(--color-seg-joignabilite)',
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
  // remonte jusqu'à l'écran (§ doctrine du chantier 1). Le libellé court reste
  // visible — c'est l'état de 114 prospects sur 139 — et la phrase longue
  // passe en survol, comme le résout déjà ScoreBar pour la même raison.
  if (score === null) {
    return (
      <Absent>
        <Tooltip contenu={t('score.absent.hint')}>
          <span tabIndex={0}>{t('score.absent')}</span>
        </Tooltip>
      </Absent>
    );
  }

  // Le reçu garde les QUATRE groupes du barème, `disqualifiant` compris : ses
  // points comptent dans le total, et les perdre casserait la raison d'être
  // du reçu (§ binding constraint « le reçu ne perd rien »).
  const groupesRecu = groupBreakdown(score.breakdown);
  const parGroupe = new Map(groupesRecu.map((g) => [g.group, g]));
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
          {/*
           * Le résumé, lui, affiche TOUJOURS les trois mêmes blocs, dans le
           * même ordre — `SCORE_BAR_GROUPS`, pas `groupesRecu`. Un
           * établissement fermé n'a qu'une ligne `disqualifiant` : dérivé de
           * `groupBreakdown()`, le résumé n'aurait affiché qu'une seule barre.
           * Une franchise en aurait affiché quatre. Un groupe sans ligne
           * affiche 0, il ne disparaît pas — c'est ce qui rend deux
           * prospects à 71 comparables d'un coup d'œil (§ commentaire de
           * `SCORE_BAR_GROUPS`).
           */}
          {SCORE_BAR_GROUPS.map((group) => {
            const groupe = parGroupe.get(group);
            const lignes = groupe?.lines ?? [];
            const points = groupe?.subtotal ?? 0;
            const plafond = PLAFOND[group];
            const part = Math.max(0, Math.min(1, points / plafond));
            const detail = lignes.map((l) => `${l.label} (${l.points >= 0 ? '+' : ''}${l.points})`).join(' · ');
            return (
              <Tooltip key={group} intitule={`${t(CLE_GROUPE[group] ?? 'score.group.presence')} · ${points} / ${plafond}`} contenu={detail}>
                <div className={styles.groupe} tabIndex={0} data-groupe={group}>
                  <div className={styles.groupeTete}>
                    <span className={styles.groupeNom}>{t(CLE_GROUPE[group] ?? 'score.group.presence')}</span>
                    <span className={styles.groupePoints}>{points}</span>
                  </div>
                  <div className={styles.piste}>
                    <div
                      className={styles.remplissage}
                      style={{ width: `${part * 100}%`, background: COULEUR[group] }}
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
        <div className={styles.recu} data-testid="score-recu">
          {groupesRecu.map((groupe) => (
            <div key={groupe.group} className={styles.recuGroupe} data-recu-groupe={groupe.group}>
              <h4 className={styles.recuGroupeTitre}>{t(CLE_GROUPE[groupe.group] ?? 'score.group.presence')}</h4>
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
