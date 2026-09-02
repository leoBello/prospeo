import type { Enums } from '@prospeo/db';
import { minHeadcount } from '@prospeo/core';
import type { PhoneKind, WebPresenceCategory } from '@prospeo/core';
import type { ProspectView } from '../../domain/prospect.js';
import type { TranslationKey } from '../../i18n/translate.js';
import { Absent, Card, Field } from '../kit/Card.js';
import { Badge } from '../kit/Badge.js';
import type { BadgeTon } from '../kit/Badge.js';
import { Tooltip } from '../kit/Tooltip.js';
import { ScoreCompact } from '../ScoreCompact.js';
import { useT } from '../preferences.js';
import styles from '../ProspectPanel.module.css';
import cardStyles from '../kit/Card.module.css';

/**
 * Le ton de chaque catégorie de présence web.
 *
 * Tiré de `PRESENCE_POINTS` (`@prospeo/core`), pas inventé ici : un site mort
 * ou une simple page sociale rapporte plus de points qu'un site vivant, parce
 * que c'est une meilleure cible de prospection — `has_site` vaut -100 et
 * disqualifie presque le prospect. Le ton suit donc la valeur de vente, pas
 * un jugement de qualité du site.
 */
const TON_PRESENCE: Record<WebPresenceCategory, BadgeTon> = {
  social_only: 'succes',
  dead_site: 'succes',
  none: 'accent',
  directory_only: 'info',
  has_site: 'danger',
};

/** `Record` plutôt qu'une concaténation `'presence.' + category` : une
 * catégorie ajoutée à `WebPresenceCategory` sans son entrée ici fait échouer
 * la compilation au lieu de rendre une clé i18n absente en silence. */
const CLE_PRESENCE: Record<WebPresenceCategory, TranslationKey> = {
  none: 'presence.none',
  social_only: 'presence.social_only',
  directory_only: 'presence.directory_only',
  dead_site: 'presence.dead_site',
  has_site: 'presence.has_site',
};

/**
 * Mobile ou fixe, à côté du numéro.
 *
 * Ce n'est pas un ornement : `SCORING_RULESET.phone` paie 20 points un mobile
 * contre 10 un fixe, et c'est le MÊME écran qui affiche ce score et lance
 * l'appel. Montrer le score sans la distinction qui le fabrique laisse un
 * écart de dix points sans explication visible. Sur mobile on tombe sur
 * l'artisan ; sur un fixe d'atelier, sur personne — le geste n'est pas le
 * même, et il se décide ici.
 *
 * Même garde-fou que les autres `Record` de ce fichier : un type de numéro
 * ajouté à `PhoneKind` sans son entrée ici casse la compilation.
 */
const CLE_TYPE_TELEPHONE: Record<PhoneKind, TranslationKey> = {
  mobile: 'value.mobile',
  landline: 'value.landline',
};

type StatutEnrichissement = Enums<'enrichment_status'>;

const TON_ENRICHISSEMENT: Record<StatutEnrichissement, BadgeTon> = {
  ok: 'succes',
  not_found: 'neutre',
  ambiguous: 'alerte',
  blocked: 'danger',
};

/** Même garde-fou qu'au-dessus : un statut ajouté à l'énumération base sans
 * entrée ici est une erreur de compilation, pas un badge muet en prod. */
const CLE_ENRICHISSEMENT: Record<StatutEnrichissement, TranslationKey> = {
  ok: 'enrichment.ok',
  not_found: 'enrichment.not_found',
  ambiguous: 'enrichment.ambiguous',
  blocked: 'enrichment.blocked',
};

/**
 * L'onglet consulté avant d'appeler.
 *
 * Trois cartes de faits, puis la composition du score. C'est l'ordre du
 * geste : on vérifie à qui on parle, on vérifie qu'on peut le joindre, on se
 * rappelle pourquoi il est dans la file — la présence web est le motif de
 * qualification, le signal le plus lourd du barème.
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
          enrichment === null ? undefined : (
            // `cardStyles.extraGroup` (Card.module.css) aligne plusieurs
            // pastilles sur une ligne, avec repli — le statut
            // d'enrichissement et, quand elle existe, la confiance
            // d'appariement. Pas `styles.badges` (ProspectPanel.module.css) :
            // cette classe est dessinée pour l'en-tête du PANNEAU, bien plus
            // large qu'une carte, et porte un `margin-top` sans objet ici
            // (voir le commentaire de `.extraGroup`, Card.module.css).
            <span className={cardStyles.extraGroup}>
              <Badge ton={TON_ENRICHISSEMENT[enrichment.status]}>
                {t(CLE_ENRICHISSEMENT[enrichment.status])}
              </Badge>
              {enrichment.matchConfidence === null ? null : (
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
              )}
            </span>
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
                <span className={styles.telephone}>
                  {enrichment.phoneE164}
                  {/* `phoneKind` nul veut dire « type inconnu », pas « fixe » :
                      un numéro que la classification n'a pas tranché ne porte
                      aucune des deux étiquettes. Affirmer l'une des deux
                      inventerait un fait, et ferait mentir le score. */}
                  {enrichment.phoneKind === null ? null : (
                    <Badge>{t(CLE_TYPE_TELEPHONE[enrichment.phoneKind])}</Badge>
                  )}
                </span>
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
                <Tooltip intitule={t('field.reviewCount')} contenu={t('enrichment.reviews.hint')}>
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
            <Field label={t('field.matchedName')}>
              {enrichment.matchedName === null ? (
                <Absent>{t('value.notCollected')}</Absent>
              ) : (
                enrichment.matchedName
              )}
            </Field>
          </>
        )}
      </Card>

      <div className={styles.pleineLargeur}>
        {/* Le motif de qualification : pourquoi ce prospect est dans la
            file. `presence` est `null` sans ligne `web_presence` du tout ;
            `category` est `null` quand `probe` a tourné mais pas `classify`
            — deux préludes différents au même texte affiché, faute d'un état
            intermédiaire que l'écran doive distinguer (voir `PresenceView`
            dans `domain/prospect.ts`). */}
        <Card titre={t('panel.section.web')}>
          {prospect.presence === null || prospect.presence.category === null ? (
            <Absent>{t('presence.absent')}</Absent>
          ) : (
            <Badge ton={TON_PRESENCE[prospect.presence.category]}>
              {t(CLE_PRESENCE[prospect.presence.category])}
            </Badge>
          )}
        </Card>
      </div>

      <div className={styles.pleineLargeur}>
        <Card titre={t('panel.section.score')}>
          <ScoreCompact score={prospect.score} />
        </Card>
      </div>
    </div>
  );
}
