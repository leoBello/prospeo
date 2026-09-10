import type { ReactNode } from 'react';
import { joursCivils } from '../domain/today.js';
import type { ProspectView } from '../domain/prospect.js';
import type { OngletVeille } from '../domain/veille.js';
import type { TranslationKey, TranslationParams } from '../i18n/translate.js';
import { Badge } from './kit/Badge.js';
import { StatusBadge } from './kit/StatusBadge.js';
import { useT } from './preferences.js';
import styles from './RangeeVeille.module.css';

/** Les onglets où la dernière colonne porte une échéance : ceux d'un engagement en cours. */
const ENGAGEMENT: readonly OngletVeille[] = ['contacte', 'relance', 'interesse'];

const COULEUR_SEGMENT = [
  'var(--color-seg-presence)',
  'var(--color-seg-vitalite)',
  'var(--color-seg-joignabilite)',
] as const;

/** Le seuil au-delà duquel le score se met à l'accent. Repris de la maquette. */
const SCORE_FORT = 70;

/**
 * L'état du site, en trois mots.
 *
 * `Dépublié` est PLEIN et ambre là où « Jamais déployé » est discontinu : un
 * site retiré est un fait établi, pas une donnée manquante. C'est la même
 * distinction que le trait discontinu porte partout ailleurs dans ce
 * vocabulaire.
 */
function celluleSite(site: ProspectView['site'], t: ReturnType<typeof useT>): ReactNode {
  if (site === null || site.generatedAt === null) {
    return <Badge ton="neutre" taille="compacte" discontinu>{t('deploiements.etat.jamais')}</Badge>;
  }
  if (site.unpublishedAt !== null) {
    return <Badge ton="alerte" taille="compacte">{t('deploiements.etat.retire')}</Badge>;
  }
  if (site.deploymentUrl !== null && site.publishedAt !== null) {
    return <Badge ton="succes" taille="compacte" point>{t('deploiements.etat.enLigne')}</Badge>;
  }
  return <Badge ton="accent" taille="compacte">{t('deploiements.etape.redaction')}</Badge>;
}

/**
 * La colonne contextuelle.
 *
 * Elle change de sens selon l'onglet — c'est ce qui évite d'afficher une
 * colonne vide sur cinq onglets sur huit. Dans « à contacter », elle porte le
 * SUIVI, et c'est là que « jamais contacté » (aucune ligne en base) reste
 * distinct de « à contacter » (une ligne posée) malgré l'onglet commun.
 */
function celluleContexte(
  prospect: ProspectView,
  onglet: OngletVeille,
  now: Date,
  t: ReturnType<typeof useT>,
): ReactNode {
  if (onglet === 'toutes' || onglet === 'a_contacter') {
    return <StatusBadge status={prospect.pipeline?.status ?? null} taille="compacte" />;
  }

  if (ENGAGEMENT.includes(onglet)) {
    const echeance = prospect.pipeline?.nextActionAt ?? null;
    if (echeance === null) return <span className={styles.absent}>{t('veille.echeance.absente')}</span>;
    const date = new Date(echeance);
    if (Number.isNaN(date.getTime())) {
      return <span className={styles.absent}>{t('veille.echeance.absente')}</span>;
    }
    const jours = joursCivils(date, now);
    const cle: TranslationKey =
      jours === 0 ? 'veille.echeance.aujourdhui' : jours > 0 ? 'veille.echeance.retard' : 'veille.echeance.future';
    // Annotée explicitement : sans elle, TS unifie les deux branches en
    // `{ days?: undefined; count?: undefined } | { days: number; count: number }`
    // et rejette la première contre la signature d'index de `TranslationParams`.
    const params: TranslationParams = jours === 0 ? {} : { days: Math.abs(jours), count: Math.abs(jours) };
    return (
      <span className={styles.echeance} data-retard={jours > 0 ? 'true' : undefined}>
        {t(cle, params)}
      </span>
    );
  }

  // Onglets fermés : `updated_at` de la ligne de suivi, la seule date que la
  // table porte pour un dossier clos. Rien n'enregistre encore la date de
  // fermeture elle-même, et l'écrire ici serait l'inventer.
  const maj = prospect.pipeline?.updatedAt ?? null;
  if (maj === null) return <span className={styles.absent}>{t('veille.depuis.absente')}</span>;
  const jours = Math.max(0, joursCivils(new Date(maj), now));
  return <span className={styles.echeance}>{t('veille.depuis', { days: jours, count: jours })}</span>;
}

interface Props {
  prospect: ProspectView;
  onglet: OngletVeille;
  selectionne: boolean;
  now: Date;
  onSelect: (id: string) => void;
}

/**
 * Une rangée de la veille : six colonnes, la dernière contextuelle.
 *
 * C'est un `<button>` et non un `<div role="button">` : la sémantique native
 * apporte le focus, l'activation à Entrée et l'annonce correcte, et l'une des
 * trois serait oubliée en les réimplémentant.
 */
export function RangeeVeille({ prospect, onglet, selectionne, now, onSelect }: Props) {
  const t = useT();
  const nom = prospect.denominationUsuelle ?? prospect.denomination;
  const total = prospect.score?.total ?? null;
  const categorie = prospect.presence?.category ?? null;
  const telephone = prospect.enrichment?.phoneE164 ?? null;
  const type = prospect.enrichment?.phoneKind ?? null;

  return (
    <button
      type="button"
      id={`prospect-${prospect.id}`}
      className={`${styles.rangee} ${selectionne ? styles.selectionnee : ''}`}
      aria-current={selectionne ? 'true' : undefined}
      onClick={() => onSelect(prospect.id)}
    >
      <span className={styles.score}>
        {/* `pageVeille` n'admet que des prospects scorés : `total` ne peut pas
            être nul ici. La garde reste, parce qu'un composant ne se repose
            pas sur l'invariant d'un appelant qu'il ne contrôle pas. */}
        <span className={styles.total} data-fort={total !== null && total >= SCORE_FORT ? 'true' : undefined}>
          {total ?? '—'}
        </span>
        <span className={styles.segments} aria-hidden="true">
          {COULEUR_SEGMENT.map((couleur, i) => (
            <span key={i} className={styles.segment} style={{ width: 11 - i * 2, background: couleur }} />
          ))}
        </span>
      </span>

      <span className={styles.identite}>
        <span className={styles.nom}>{nom}</span>
        <Badge ton="neutre" taille="compacte">{t(`trade.${prospect.tradeSlug}` as TranslationKey)}</Badge>
      </span>

      <span>
        {/* Ton NEUTRE, toujours : « aucune présence web » est le meilleur signal
            du barème, et un vert le ferait lire comme « site correct ».
            L'information est dans le mot. Seule l'absence de sondage porte le
            trait discontinu. */}
        <Badge ton="neutre" taille="compacte" discontinu={categorie === null}>
          {t(categorie === null ? 'presence.absent' : (`presence.${categorie}` as TranslationKey))}
        </Badge>
      </span>

      <span className={styles.telephone}>
        {telephone === null ? (
          <>
            <span className={styles.absent}>{t('veille.telephone.absent')}</span>
            <span className={styles.detailAbsent}>{t('veille.telephone.absent.detail')}</span>
          </>
        ) : (
          <>
            <span className={styles.numero}>{telephone}</span>
            <span className={styles.type}>
              {t(type === 'mobile' ? 'veille.telephone.mobile' : 'veille.telephone.fixe')}
            </span>
          </>
        )}
      </span>

      <span>{celluleSite(prospect.site, t)}</span>
      <span>{celluleContexte(prospect, onglet, now, t)}</span>
    </button>
  );
}
