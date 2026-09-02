import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getTrade } from '@prospeo/core';
import type { DeploymentEtat, DeploymentView } from '../domain/deployment.js';
import type { TranslationKey, TranslationParams } from '../i18n/translate.js';
import { AppShell } from '../ui/AppShell.js';
import { EtapesPiste, libellePisteEtat } from '../ui/EtapesPiste.js';
import { Badge } from '../ui/kit/Badge.js';
import type { BadgeTon } from '../ui/kit/Badge.js';
import { Absent } from '../ui/kit/Card.js';
import { EmptyState } from '../ui/kit/EmptyState.js';
import { Tooltip } from '../ui/kit/Tooltip.js';
import { useT } from '../ui/preferences.js';
import styles from './DeploiementsScreen.module.css';

type Traducteur = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * Seuil de la péremption « qui approche », en jours civils avant retrait.
 *
 * Sert deux fois : à compter le 4ᵉ chiffre de la bande d'état, et à décider
 * quand le badge de péremption remplace le badge d'état générique sur une
 * ligne. Les deux DOIVENT s'accorder — d'où la constante unique.
 */
const SEUIL_PEREMPTION_JOURS = 7;

type Filtre = 'tous' | 'en_cours' | 'echec' | 'jamais';

const FILTRES: readonly { valeur: Filtre; libelleKey: TranslationKey }[] = [
  { valeur: 'tous', libelleKey: 'deploiements.filtre.tous' },
  { valeur: 'en_cours', libelleKey: 'deploiements.filtre.enCours' },
  { valeur: 'echec', libelleKey: 'deploiements.filtre.echec' },
  { valeur: 'jamais', libelleKey: 'deploiements.filtre.jamais' },
];

function correspond(d: DeploymentView, filtre: Filtre): boolean {
  return filtre === 'tous' || d.etat === filtre;
}

/**
 * `2026-09-01T20:17:31Z` → `01/09/2026`.
 *
 * Dupliqué à dessein plutôt que partagé : `SiteSection.tsx` et
 * `HistoriqueTab.tsx` portent chacun la même fonction sans la mutualiser non
 * plus. Trois lignes ne valent pas un import croisé entre écrans sans
 * rapport.
 */
function jour(iso: string | null): string {
  if (iso === null) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/** `92400` ms → `{ min: 1, sec: '32' }`. `null` si aucune durée n'est connue. */
function dureeParts(ms: number | null): { min: number; sec: string } | null {
  if (ms === null) return null;
  const totalSecondes = Math.round(ms / 1000);
  return { min: Math.floor(totalSecondes / 60), sec: String(totalSecondes % 60).padStart(2, '0') };
}

/** Le nom d'hôte seul : `plomberie-guerin-812.vercel.app`, pas l'URL entière. */
function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function libellePeremption(t: Traducteur, jours: number): string {
  if (jours <= 0) return t('deploiements.peremption.today');
  return t('deploiements.peremption.badge', { days: jours, count: jours });
}

const TON_ETAT: Record<DeploymentEtat, BadgeTon> = {
  jamais: 'neutre',
  en_cours: 'accent',
  echec: 'danger',
  en_ligne: 'succes',
  retire: 'neutre',
};

/**
 * Le badge d'état d'une ligne.
 *
 * Le compteur de péremption (§D5, chantier n°4) PRIME sur le badge générique
 * « En ligne » dès qu'il approche : ce n'est pas un ajout à côté, c'est un
 * remplacement — l'obligation de retrait passe devant le simple constat
 * « en ligne ». Voir le docstring du composant `DeploiementsScreen`.
 */
interface BadgeEtatInfo {
  ton: BadgeTon;
  texte: string;
  /** `true` : le badge affiché EST le badge de péremption — voir `Ligne`, qui y accroche l'infobulle « pourquoi ». */
  peremption: boolean;
}

function badgeEtat(t: Traducteur, d: DeploymentView): BadgeEtatInfo {
  if (d.etat === 'en_ligne' && d.peremptionDans !== null && d.peremptionDans <= SEUIL_PEREMPTION_JOURS) {
    return { ton: 'alerte', texte: libellePeremption(t, d.peremptionDans), peremption: true };
  }
  return { ton: TON_ETAT[d.etat], texte: libellePisteEtat(t, d.etat, d.etapeCourante), peremption: false };
}

/** L'adresse en ligne — ou son absence, jamais un lien mort. */
function celluleAdresse(t: Traducteur, d: DeploymentView): ReactNode {
  // Prime sur tout : `deployment_url` SURVIT à la dépublication (voir le
  // docstring de `DeploymentEtat`, domain/deployment.ts). Un lien laisserait
  // croire qu'un site retiré répond encore.
  if (d.etat === 'retire') {
    return <span className={styles.horsLigne}>{t('deploiements.row.horsLigne')}</span>;
  }
  if (d.deploymentUrl === null) {
    return <Absent>{t('deploiements.row.adresseAbsente')}</Absent>;
  }
  return (
    <a className={styles.lien} href={d.deploymentUrl} target="_blank" rel="noreferrer">
      {hostname(d.deploymentUrl)}
    </a>
  );
}

/** La ligne d'identité secondaire : la cause d'un échec prime sur tout le reste. */
function celluleIdentiteSecondaire(t: Traducteur, d: DeploymentView, trade: string): ReactNode {
  // Parti pris central de D9 : la cause est ICI, pas derrière un journal.
  if (d.etat === 'echec') {
    return <span className={styles.cause}>{d.detail ?? t('deploiements.row.echecSansDetail')}</span>;
  }
  if (d.etat === 'retire') {
    return <span className={styles.detailLigne}>{t('site.unpublished', { date: jour(d.unpublishedAt) })}</span>;
  }
  const score = d.score === null ? t('score.absent') : t('deploiements.row.score', { score: d.score });
  return (
    <span className={styles.detailLigne}>
      {trade} · {d.city} · {score}
    </span>
  );
}

function BadgeEtatCell({ t, d }: { t: Traducteur; d: DeploymentView }) {
  const info = badgeEtat(t, d);
  const badge = (
    <Badge ton={info.ton} point>
      {info.texte}
    </Badge>
  );
  // Seul le badge de péremption porte une infobulle : c'est là qu'est le
  // « pourquoi » (§D5, chantier n°4) — les autres badges se suffisent.
  if (!info.peremption) return badge;
  return (
    <Tooltip
      intitule={t('deploiements.kpi.peremption.tipTitre')}
      contenu={t('deploiements.peremption.tipDetail', { date: jour(d.publishedAt) })}
    >
      <span tabIndex={0}>{badge}</span>
    </Tooltip>
  );
}

function Ligne({ d }: { d: DeploymentView }) {
  const t = useT();
  const trade = getTrade(d.tradeSlug)?.label ?? d.tradeSlug;
  const duree = dureeParts(d.durationMs);

  return (
    <li className={styles.ligne} data-etat={d.etat}>
      <div className={styles.identite}>
        <span className={d.etat === 'retire' ? `${styles.nom} ${styles.nomRetire}` : styles.nom}>{d.nom}</span>
        {celluleIdentiteSecondaire(t, d, trade)}
      </div>

      <div className={styles.colGabarit}>
        {d.gabarit === null ? (
          <Absent>{t('deploiements.row.gabaritAbsent')}</Absent>
        ) : (
          <Badge ton="info">{d.gabarit}</Badge>
        )}
      </div>

      <div className={styles.colPiste}>
        <EtapesPiste etape={d.etapeCourante} etat={d.etat} />
      </div>

      <div className={styles.colEtat}>
        <BadgeEtatCell t={t} d={d} />
      </div>

      <div className={styles.colDuree}>
        {duree === null ? (
          <Absent>{t('value.unknown')}</Absent>
        ) : (
          <span className={styles.duree}>{t('deploiements.row.duree', { min: duree.min, sec: duree.sec })}</span>
        )}
      </div>

      <div className={styles.colAdresse}>{celluleAdresse(t, d)}</div>
    </li>
  );
}

function Tuile({ tone, valeur, labelKey }: { tone: BadgeTon; valeur: number; labelKey: TranslationKey }) {
  const t = useT();
  return (
    <div className={styles.tuile} data-tone={tone}>
      <b className={styles.tuileValeur}>{valeur}</b>
      <span className={styles.tuileLabel}>{t(labelKey)}</span>
    </div>
  );
}

/**
 * Le 4ᵉ chiffre de la bande, à part des trois autres : ce n'est pas une
 * statistique d'usage, c'est une échéance de conformité (§D5, chantier n°4 —
 * un site publié au nom d'un tiers est retiré automatiquement). L'infobulle
 * ne s'affiche que si le compte est positif : au repos, il n'y a rien à
 * expliquer.
 */
function TuilePeremption({ compte }: { compte: number }) {
  const t = useT();
  const tuile = (
    <div className={styles.tuile} data-tone={compte > 0 ? 'alerte' : 'neutre'}>
      <b className={styles.tuileValeur}>{compte}</b>
      <span className={styles.tuileLabel}>
        {t('deploiements.kpi.peremption', { days: SEUIL_PEREMPTION_JOURS })}
      </span>
    </div>
  );
  if (compte === 0) return tuile;
  return (
    <Tooltip
      intitule={t('deploiements.kpi.peremption.tipTitre')}
      contenu={t('deploiements.kpi.peremption.hint', { count: compte, days: SEUIL_PEREMPTION_JOURS })}
    >
      {tuile}
    </Tooltip>
  );
}

interface Props {
  deployments: DeploymentView[];
  onSignOut?: () => void;
  /** Le rail de navigation, fourni par `App` — voir `TodayScreen` pour le même patron. */
  nav?: ReactNode;
}

/**
 * L'écran de suivi des déploiements (D9).
 *
 * Vingt-deux sites publiés au nom de vraies entreprises ; jusqu'ici, le seul
 * moyen de voir ce que le pipeline leur avait fait était un terminal. Deux
 * partis pris, non décoratifs :
 *
 * 1. **La cause d'un échec vit dans la ligne** (`celluleIdentiteSecondaire`),
 *    pas derrière un journal qu'il faudrait ouvrir.
 * 2. **La péremption à 90 jours est un indicateur de premier rang**
 *    (`badgeEtat`, `TuilePeremption`) : elle remplace le badge « En ligne »
 *    dès qu'elle approche, plutôt que de s'y ajouter en petit.
 *
 * Le cas majoritaire au premier jour — vingt-deux sites en ligne sans le
 * moindre événement, la table venant d'être créée — n'est PAS un cas
 * particulier ici : `etapeCourante === null` avec `etat === 'en_ligne'` rend
 * une piste pleine et un badge « En ligne » comme n'importe quelle autre
 * ligne en ligne (voir `EtapesPiste`).
 */
export function DeploiementsScreen({ deployments, onSignOut = () => {}, nav }: Props) {
  const t = useT();
  const [filtre, setFiltre] = useState<Filtre>('tous');

  const lignes = useMemo(() => deployments.filter((d) => correspond(d, filtre)), [deployments, filtre]);

  const compte = useMemo(() => {
    let enLigne = 0;
    let enCours = 0;
    let echec = 0;
    let peremptionProche = 0;
    for (const d of deployments) {
      if (d.etat === 'en_ligne') {
        enLigne += 1;
        if (d.peremptionDans !== null && d.peremptionDans <= SEUIL_PEREMPTION_JOURS) peremptionProche += 1;
      }
      if (d.etat === 'en_cours') enCours += 1;
      if (d.etat === 'echec') echec += 1;
    }
    return { enLigne, enCours, echec, peremptionProche };
  }, [deployments]);

  return (
    <AppShell
      onSignOut={onSignOut}
      nav={nav}
      panel={null}
      list={
        <>
          <div className={styles.intro}>
            <h1 className={styles.title}>{t('deploiements.title')}</h1>
            <p className={styles.subtitle}>{t('deploiements.subtitle')}</p>
          </div>

          <div className={styles.bande}>
            <Tuile tone="succes" valeur={compte.enLigne} labelKey="deploiements.kpi.enLigne" />
            <Tuile tone="accent" valeur={compte.enCours} labelKey="deploiements.kpi.enCours" />
            <Tuile tone="danger" valeur={compte.echec} labelKey="deploiements.kpi.enEchec" />
            <TuilePeremption compte={compte.peremptionProche} />
          </div>

          <div className={styles.filtres} role="group" aria-label={t('deploiements.colonnes.etat')}>
            {FILTRES.map(({ valeur, libelleKey }) => {
              const n = deployments.filter((d) => correspond(d, valeur)).length;
              const actif = valeur === filtre;
              return (
                <button
                  key={valeur}
                  type="button"
                  className={actif ? `${styles.filtre} ${styles.filtreActif}` : styles.filtre}
                  aria-pressed={actif}
                  onClick={() => setFiltre(valeur)}
                >
                  {t(libelleKey)} <span className={styles.filtreCompte}>{n}</span>
                </button>
              );
            })}
          </div>

          {deployments.length === 0 ? (
            <EmptyState titre={t('deploiements.empty.titre')} detail={t('deploiements.empty.detail')} />
          ) : lignes.length === 0 ? (
            <EmptyState titre={t('deploiements.empty.filtre.titre')} detail={t('deploiements.empty.filtre.detail')} />
          ) : (
            // `.tableau` : les six colonnes ne descendent jamais sous ~825px
            // (cinq d'entre elles sont des largeurs fixes) — ce wrapper leur
            // donne un défilement horizontal propre sous 1024px de fenêtre
            // plutôt que de laisser le tableau déborder de la colonne de
            // liste (voir le commentaire de `.tableau`, DeploiementsScreen.module.css).
            <div className={styles.tableau}>
              <div className={styles.entetes} aria-hidden="true">
                <span className={styles.enteteProspect}>{t('deploiements.colonnes.prospect')}</span>
                <span className={styles.enteteGabarit}>{t('deploiements.colonnes.gabarit')}</span>
                <span className={styles.entetePiste}>{t('deploiements.colonnes.piste')}</span>
                <span className={styles.enteteEtat}>{t('deploiements.colonnes.etat')}</span>
                <span className={styles.enteteDuree}>{t('deploiements.colonnes.duree')}</span>
                <span className={styles.enteteAdresse}>{t('deploiements.colonnes.adresse')}</span>
              </div>
              <ul className={styles.liste}>
                {lignes.map((d) => (
                  <Ligne key={d.prospectId} d={d} />
                ))}
              </ul>
            </div>
          )}
        </>
      }
    />
  );
}
