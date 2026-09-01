import { minHeadcount } from '@prospeo/core';
import type { ProspectView } from '../domain/prospect.js';
import { dataWarnings } from '../domain/coherence.js';
import { groupBreakdown } from '../domain/score.js';
import type { TranslationKey } from '../i18n/translate.js';
import { WarningList } from './WarningList.js';
import { useT } from './preferences.js';
import styles from './ProspectPanel.module.css';

const CLE_GROUPE: Record<string, TranslationKey> = {
  presence: 'score.group.presence',
  vitalite: 'score.group.vitalite',
  joignabilite: 'score.group.joignabilite',
  disqualifiant: 'score.group.disqualifiant',
};

const CLE_ENRICHISSEMENT: Record<string, TranslationKey> = {
  ok: 'enrichment.ok',
  not_found: 'enrichment.not_found',
  ambiguous: 'enrichment.ambiguous',
  blocked: 'enrichment.blocked',
};

/**
 * Une donnée et son absence.
 *
 * `absentKey` nomme *pourquoi* la valeur manque, et les raisons ne se valent
 * pas : « pas encore collecté » désigne un étage qui n'est pas passé, « non
 * publié par la source » un fait acquis sur lequel il est inutile de
 * revenir. Un tiret unique confondrait les deux, et un champ vide se lirait
 * comme un défaut d'affichage.
 */
function Field({
  labelKey,
  value,
  absentKey,
}: {
  labelKey: TranslationKey;
  value: string | null;
  absentKey: TranslationKey;
}) {
  const t = useT();
  return (
    <div className={styles.field}>
      <dt className={styles.fieldLabel}>{t(labelKey)}</dt>
      <dd className={styles.fieldValue}>
        {value === null ? <span className={styles.absent}>{t(absentKey)}</span> : value}
      </dd>
    </div>
  );
}

interface Props {
  prospect: ProspectView | null;
  /** Rang affiché dans la file, pour situer le parcours au clavier. */
  position: { index: number; total: number } | null;
  currentRulesetVersion: string;
  onClose: () => void;
}

export function ProspectPanel({ prospect, position, currentRulesetVersion, onClose }: Props) {
  const t = useT();

  if (prospect === null) {
    return (
      <aside className={styles.panel} aria-label={t('panel.section.identity')}>
        <p className={styles.placeholder}>{t('panel.empty')}</p>
      </aside>
    );
  }

  const nom = prospect.denominationUsuelle ?? prospect.denomination;
  const enrichment = prospect.enrichment;
  const score = prospect.score;
  const warnings = dataWarnings(prospect, currentRulesetVersion);

  return (
    <aside className={styles.panel} aria-label={nom}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.name}>{nom}</h2>
          {position !== null ? (
            <span className={styles.position}>
              {t('panel.position', { index: position.index, total: position.total })}
            </span>
          ) : null}
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('panel.close')}>
          ×
        </button>
      </header>

      <WarningList warnings={warnings} />

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('panel.section.identity')}</h3>
        <dl className={styles.fields}>
          <Field labelKey="field.siret" value={prospect.siret} absentKey="value.unknown" />
          <Field
            labelKey="field.address"
            value={`${prospect.address}`}
            absentKey="value.unknown"
          />
          <Field
            labelKey="field.created"
            value={prospect.dateCreation}
            absentKey="value.unknown"
          />
          <Field
            labelKey="field.staff"
            value={
              // `minHeadcount` rend `null` pour les codes « unité non
              // employeuse » ou « inconnu » : les afficher « 0 salarié »
              // inventerait un fait que l'INSEE ne fournit pas.
              minHeadcount(prospect.effectifCode) === null
                ? null
                : t('unit.employees', { count: minHeadcount(prospect.effectifCode) ?? 0 })
            }
            absentKey="value.unknown"
          />
        </dl>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('panel.section.contact')}</h3>
        {enrichment === null ? (
          <p className={styles.absent}>{t('enrichment.absent')}</p>
        ) : (
          <>
            <p className={styles.status}>
              {t(CLE_ENRICHISSEMENT[enrichment.status] ?? 'enrichment.absent')}
            </p>
            <dl className={styles.fields}>
              <Field
                labelKey="field.phone"
                value={
                  enrichment.phoneE164 === null
                    ? null
                    : `${enrichment.phoneE164}${
                        enrichment.phoneKind === null
                          ? ''
                          : ` (${t(enrichment.phoneKind === 'mobile' ? 'value.mobile' : 'value.landline')})`
                      }`
                }
                absentKey="value.notCollected"
              />
              <Field
                labelKey="field.rating"
                value={enrichment.rating === null ? null : enrichment.rating.toFixed(1)}
                absentKey="value.notCollected"
              />
              <Field
                labelKey="field.reviewCount"
                value={enrichment.reviewCount === null ? null : String(enrichment.reviewCount)}
                // Google ne publie plus le nombre d'avis : ce n'est pas un
                // étage manquant, c'est une donnée que la source a retirée.
                absentKey="value.notPublished"
              />
              <Field
                labelKey="field.matchedName"
                value={enrichment.matchedName}
                absentKey="value.notCollected"
              />
              <Field
                labelKey="field.matchConfidence"
                // Affichée parce que `matchedName` ne vaut que ce qu'elle
                // vaut : sous le seuil haut, la fiche Google rattachée est un
                // pari, et c'est au téléphone qu'un faux appariement se paie
                // — l'interlocuteur appelé par le nom d'une autre entreprise.
                value={
                  enrichment.matchConfidence === null
                    ? null
                    : `${Math.round(enrichment.matchConfidence * 100)} %`
                }
                absentKey="value.notCollected"
              />
              <Field
                labelKey="field.declaredUrl"
                value={enrichment.declaredUrl}
                absentKey="value.notCollected"
              />
            </dl>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('panel.section.web')}</h3>
        {prospect.presence === null ? (
          <p className={styles.absent}>{t('presence.absent')}</p>
        ) : (
          <p className={styles.status}>
            {prospect.presence.category === null
              ? t('presence.absent')
              : t(`presence.${prospect.presence.category}`)}
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('panel.section.score')}</h3>
        {score === null ? (
          <p className={styles.absent}>{t('score.absent.hint')}</p>
        ) : (
          <>
            {/* Le reçu détaillé du §9.3 : le calcul ligne par ligne, groupé
                par bloc, points signés, total en pied. Le panneau sert à
                comprendre et à régler — l'argumentaire commercial relève du
                générateur de message. */}
            {groupBreakdown(score.breakdown).map((groupe) => (
              <div key={groupe.group} className={styles.scoreGroup}>
                <h4 className={styles.scoreGroupTitle}>
                  {t(CLE_GROUPE[groupe.group] ?? 'score.group.presence')}
                </h4>
                {groupe.lines.map((ligne) => (
                  <div key={ligne.code} className={styles.scoreLine}>
                    <span>{ligne.label}</span>
                    <span className={ligne.points >= 0 ? styles.positif : styles.negatif}>
                      {ligne.points >= 0 ? '+' : ''}
                      {ligne.points}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <div className={styles.scoreTotal}>
              <span>{t('score.total')}</span>
              <span>{t('score.outOf', { total: score.total })}</span>
            </div>
          </>
        )}
      </section>
    </aside>
  );
}
