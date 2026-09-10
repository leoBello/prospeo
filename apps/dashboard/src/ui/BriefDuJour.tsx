import { useMemo } from 'react';
import { joursCivils } from '../domain/today.js';
import type { WorkList } from '../domain/prospect.js';
import type { JeuState } from '../data/useJeu.js';
import type { TranslationKey } from '../i18n/translate.js';
import { BandeProgression } from './BandeProgression.js';
import { WorkListSection } from './WorkListSection.js';
import { usePreferences, useT } from './preferences.js';
import styles from './BriefDuJour.module.css';

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

interface Props {
  /**
   * `JeuState` (`data/useJeu.ts`), importé nommément plutôt que recomposé en
   * `Parameters<typeof BandeProgression>[0]['jeu']` : le type existe déjà
   * sous un nom exporté, et un alias structurel n'aurait fait que le
   * dissimuler.
   */
  jeu: JeuState;
  relances: WorkList;
  selectedId: string | null;
  currentRulesetVersion: string;
  emptyKey: TranslationKey;
  now: Date;
  onSelect: (id: string) => void;
}

/**
 * Ce que la ligne repliée peut honnêtement dire de l'objectif du jour —
 * une lecture pure de `jeu`, sans le calcul de pourcentage/arc que fait
 * `BandeProgression` pour son anneau : seuls les deux chiffres déjà
 * visibles dans l'anneau (le réalisé, son dénominateur) sont repris ici.
 *
 * `null` quand `jeu` est `loading` ou `error` : ces deux états n'ont encore
 * RIEN observé sur l'objectif, ce n'est pas la même absence que « connu à
 * ce jour mais pas encore calculable » (`connu: false`) — la doctrine des
 * absences distinctes de ce dépôt s'applique aussi à ce résumé.
 */
type ResumeObjectif =
  | { connu: true; realise: number; cible: number }
  | { connu: false }
  | null;

function resumeObjectif(jeu: JeuState): ResumeObjectif {
  if (jeu.status !== 'ready') return null;
  const objectif = jeu.jeu.objectifDuJour;
  if (!objectif.connue) return { connu: false };
  return { connu: true, realise: jeu.jeu.realiseAujourdHui, cible: objectif.valeur };
}

/**
 * Le brief du jour : ce qu'on vise, et ce qui est dû.
 *
 * Repliable, et **le repli est retenu d'une visite à l'autre** (décision 3-1
 * du 2026-09-10) : c'est le seul réglage qui rende la table de veille tenable
 * sur un écran de portable, et le redemander chaque matin le rendrait inutile.
 *
 * Replié, le brief ne disparaît pas — il se résume, et ce qui est dû reste
 * compté. Un brief qui s'efface entièrement ferait manquer une relance en
 * retard le jour où l'on travaille sur un petit écran, c'est-à-dire le jour
 * où l'on a le plus de raisons de l'avoir replié.
 *
 * **L'objectif dans le résumé (divergence maquette/plan).** `VeilleCompacte.dc.html`
 * montre « Objectif pas encore connu » sur la ligne repliée ; le pseudo-code
 * du plan ne rendait que le compte de relances. La maquette gouverne, mais
 * sans `veille.brief.objectif` ni recalcul de l'anneau : `resumeObjectif`
 * relit `jeu.objectifDuJour`/`realiseAujourdHui`, et l'affichage réemploie
 * `jeu.objectif.titre` et `jeu.objectif.denominateur[.inconnu]`, les clés
 * mêmes que `BandeProgression` consomme déjà pour dire la même chose.
 */
export function BriefDuJour({
  jeu, relances, selectedId, currentRulesetVersion, emptyKey, now, onSelect,
}: Props) {
  const t = useT();
  const { briefReplie, setBriefReplie } = usePreferences();

  // Compté, jamais écrit en dur : c'est un fait sur les données du jour.
  const enRetard = useMemo(
    () =>
      relances.items.filter((row) => {
        const echeance = row.prospect.pipeline?.nextActionAt ?? null;
        if (echeance === null) return false;
        const date = new Date(echeance);
        return !Number.isNaN(date.getTime()) && joursCivils(date, now) > 0;
      }).length,
    [relances, now],
  );

  if (briefReplie) {
    const objectif = resumeObjectif(jeu);
    return (
      <div className={styles.replie}>
        <span className={styles.titre}>{t('veille.brief.titre')}</span>
        {objectif !== null ? (
          <>
            <span className={styles.resume}>
              {t('jeu.objectif.titre')}{' '}
              {objectif.connu ? (
                `${objectif.realise} ${t('jeu.objectif.denominateur', { objectif: objectif.cible })}`
              ) : (
                <span className={styles.absent}>{t('jeu.objectif.denominateur.inconnu')}</span>
              )}
            </span>
            <span className={styles.separateur} aria-hidden="true" />
          </>
        ) : null}
        <span className={styles.resume}>
          {relances.totalCount === 0
            ? t('veille.brief.relances.aucune')
            : t('veille.brief.relances', { count: relances.totalCount, retard: enRetard })}
        </span>
        <span className={styles.espace} />
        <button type="button" onClick={() => setBriefReplie(false)}>
          {t('veille.brief.deplier')}
          <svg {...CHEVRON}><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.brief}>
      <div className={styles.barreTitre}>
        <span className={styles.espace} />
        <button type="button" onClick={() => setBriefReplie(true)}>
          {t('veille.brief.replier')}
          <svg {...CHEVRON}><path d="m18 15-6-6-6 6" /></svg>
        </button>
      </div>

      <BandeProgression jeu={jeu} />

      <WorkListSection
        titleKey="today.section.followUps"
        emptyKey={emptyKey}
        list={relances}
        selectedId={selectedId}
        currentRulesetVersion={currentRulesetVersion}
        onSelect={onSelect}
      />
    </div>
  );
}
