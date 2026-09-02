import { minHeadcount } from '@prospeo/core';
import type { ProspectView } from '../../domain/prospect.js';
import { Absent, Card, Field } from '../kit/Card.js';
import { Badge } from '../kit/Badge.js';
import { Tooltip } from '../kit/Tooltip.js';
import { ScoreCompact } from '../ScoreCompact.js';
import { useT } from '../preferences.js';
import styles from '../ProspectPanel.module.css';

/**
 * L'onglet consulté avant d'appeler.
 *
 * Deux cartes de faits côte à côte, puis la composition du score. C'est
 * l'ordre du geste : on vérifie à qui on parle, on vérifie qu'on peut le
 * joindre, on se rappelle pourquoi il est dans la file.
 */
export function FicheTab({ prospect }: { prospect: ProspectView }) {
  const t = useT();
  const enrichment = prospect.enrichment;
  const effectif = minHeadcount(prospect.effectifCode);

  return (
    <div className={styles.grille}>
      <Card titre={t('panel.section.identity')}>
        <Field label={t('field.siret')}>{prospect.siret}</Field>
        <Field label={t('field.address')}>
          {`${prospect.address}, ${prospect.postalCode} ${prospect.city}`}
        </Field>
        <Field label={t('field.created')}>
          {prospect.dateCreation ?? <Absent>{t('value.unknown')}</Absent>}
        </Field>
        <Field label={t('field.staff')}>
          {/* `minHeadcount` rend `null` pour les codes « unité non employeuse »
              ou « inconnu » : afficher « 0 salarié » inventerait un fait que
              l'INSEE ne fournit pas. */}
          {effectif === null ? (
            <Absent>{t('value.unknown')}</Absent>
          ) : (
            t('unit.employees', { count: effectif })
          )}
        </Field>
      </Card>

      <Card
        titre={t('panel.section.contact')}
        extra={
          enrichment === null || enrichment.matchConfidence === null ? undefined : (
            <Tooltip
              intitule={t('field.matchConfidence')}
              contenu={t('enrichment.confidence.hint')}
            >
              <span tabIndex={0}>
                <Badge ton={enrichment.matchConfidence >= 0.9 ? 'succes' : 'alerte'}>
                  {`${Math.round(enrichment.matchConfidence * 100)} %`}
                </Badge>
              </span>
            </Tooltip>
          )
        }
      >
        {enrichment === null ? (
          <Absent>{t('enrichment.absent')}</Absent>
        ) : (
          <>
            <Field label={t('field.phone')}>
              {enrichment.phoneE164 === null ? (
                <Absent>{t('value.notCollected')}</Absent>
              ) : (
                enrichment.phoneE164
              )}
            </Field>
            <Field label={t('field.rating')}>
              {enrichment.rating === null ? (
                <Absent>{t('value.notCollected')}</Absent>
              ) : (
                enrichment.rating.toFixed(1)
              )}
            </Field>
            <Field label={t('field.reviewCount')}>
              {enrichment.reviewCount === null ? (
                // Google ne publie plus le nombre d'avis : ce n'est pas un
                // étage manquant, c'est une donnée que la source a retirée.
                // Confondre les deux ferait relancer un enrichissement qui ne
                // peut rien rapporter.
                <Tooltip intitule={t('value.notPublished')} contenu={t('enrichment.reviews.hint')}>
                  <span tabIndex={0}>
                    <Absent>{t('value.notPublished')}</Absent>
                  </span>
                </Tooltip>
              ) : (
                String(enrichment.reviewCount)
              )}
            </Field>
            <Field label={t('field.declaredUrl')}>
              {enrichment.declaredUrl === null ? (
                <Absent>{t('value.notCollected')}</Absent>
              ) : (
                enrichment.declaredUrl
              )}
            </Field>
          </>
        )}
      </Card>

      <div className={styles.pleineLargeur}>
        <Card titre={t('panel.section.score')}>
          <ScoreCompact score={prospect.score} />
        </Card>
      </div>
    </div>
  );
}
