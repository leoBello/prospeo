import type { Enums } from '@prospeo/db';
import type { ProspectView } from '../../domain/prospect.js';
import type { DeploymentEventView } from '../../domain/deployment.js';
import type { TranslationKey } from '../../i18n/translate.js';
import { Badge } from '../kit/Badge.js';
import type { BadgeTon } from '../kit/Badge.js';
import { Card } from '../kit/Card.js';
import { EmptyState } from '../kit/EmptyState.js';
import { useT } from '../preferences.js';
import styles from './HistoriqueTab.module.css';

/** `2026-09-01T14:22:00Z` → `01/09/2026`. */
function jour(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/**
 * `92000` ms → `{ min: 1, sec: '32' }`.
 *
 * Dupliqué de `DeploiementsScreen.tsx` à dessein — même parti pris que `jour`
 * ci-dessus, dont le docstring d'origine expliquait déjà pourquoi deux petites
 * fonctions pures ne valent pas un import croisé entre écrans sans rapport.
 */
function dureeParts(ms: number | null): { min: number; sec: string } | null {
  if (ms === null) return null;
  const totalSecondes = Math.round(ms / 1000);
  return { min: Math.floor(totalSecondes / 60), sec: String(totalSecondes % 60).padStart(2, '0') };
}

/** Les six étapes réelles du pipeline (D5, lot 2) — voir `ORDRE_ETAPES`, domain/deployment.ts. */
const CLE_ETAPE: Record<Enums<'deployment_step'>, TranslationKey> = {
  redaction: 'deploiements.etape.redaction',
  depot: 'deploiements.etape.depot',
  projet: 'deploiements.etape.projet',
  build: 'deploiements.etape.build',
  en_ligne: 'deploiements.etape.en_ligne',
  retrait: 'deploiements.etape.retrait',
};

const CLE_ISSUE: Record<Enums<'deployment_outcome'>, TranslationKey> = {
  demarre: 'histo.issue.demarre',
  reussi: 'histo.issue.reussi',
  echoue: 'histo.issue.echoue',
  ignore: 'histo.issue.ignore',
};

const TON_ISSUE: Record<Enums<'deployment_outcome'>, BadgeTon> = {
  demarre: 'accent',
  reussi: 'succes',
  echoue: 'danger',
  ignore: 'neutre',
};

/**
 * Le texte de détail d'une ligne, ou `null` si aucun n'est à montrer.
 *
 * `detail` porte trois sens distincts (docstring de `DeploymentEventView`,
 * domain/deployment.ts) : la cause d'un échec, une note sur un succès, ou le
 * motif d'un `ignore`. On l'affiche donc dès qu'il existe, quelle que soit
 * l'issue — mais un échec SANS détail enregistré n'est pas pour autant un
 * échec muet : le texte de repli le dit, plutôt que de laisser la ligne sans
 * aucune explication.
 */
function texteDetail(t: (cle: TranslationKey) => string, e: DeploymentEventView): string | null {
  if (e.outcome === 'echoue') return e.detail ?? t('deploiements.row.echecSansDetail');
  return e.detail;
}

/**
 * La frise des jalons connus, plus le journal détaillé des événements réels.
 *
 * **Ce qui a changé depuis le lot précédent.** La table `deployment_event`
 * n'existait pas encore ; ce composant annonçait le journal sous `Bientot`.
 * Elle existe désormais (tâche 7) — mais les jalons de `prospect_site`
 * restent affichés À CÔTÉ, pas remplacés : ils portent des faits que les
 * événements ne rejouent pas pour les sites déployés avant cette migration.
 *
 * **Le cas le plus fréquent au jour un n'est pas un cas particulier.** Les
 * vingt-deux sites déjà en ligne n'ont aucun événement, la table venant
 * d'être créée. Une frise d'événements vide pour eux serait une régression
 * par rapport à l'existant — d'où l'`EmptyState` dédié plutôt qu'un simple
 * vide, et le repère daté qu'il affiche (le dernier jalon connu).
 *
 * **Le flux d'événements est brouillon, et ce composant ne prétend pas le
 * contraire** (rapporté par le collector) : `build/demarre` peut se répéter
 * sans `reussi` intercalé, un `reussi` peut apparaître sans `demarre` dans le
 * même lot, et `projet` peut manquer entièrement si le projet Vercel
 * existait déjà. On affiche donc CHAQUE événement, trié par horodatage, sans
 * tenter de les apparier en paires démarré/terminé.
 *
 * **Une lecture en échec n'est pas un prospect sans historique** (tâche 11,
 * relevé de revue) : `erreurEvenements` prend le pas sur l'`EmptyState`
 * ci-dessus et affiche le message d'`useDeploymentEvents` sous `app.error.*`
 * — même clé que l'écran entier pour une lecture ratée. Sans ça, une panne
 * réseau ou un refus RLS se lirait comme le même vide daté qu'un vrai
 * prospect sans événement, exactement l'ambiguïté que l'app évite ailleurs.
 */
export function HistoriqueTab({
  prospect,
  events,
  erreurEvenements = null,
  onReessayerEvenements,
}: {
  prospect: ProspectView;
  /**
   * Les événements de déploiement de ce prospect (tâche 7, `fetchEventsFor`).
   *
   * Injectés plutôt que récupérés ici : le panneau qui monte cet onglet
   * possède déjà les concerns de lecture des données (voir `ProspectPanel`,
   * `actions` en écriture), et un composant qui irait chercher son propre
   * client Supabase serait plus dur à tester et à re-rendre — il faudrait
   * mocker un réseau pour chaque rendu au lieu de passer un tableau.
   *
   * Optionnel, replié sur `[]` : un appelant qui ne fournit pas encore les
   * événements (le panneau ne les câble pas dans cette tâche) obtient
   * exactement le même rendu qu'un prospect qui n'en a réellement aucun —
   * les jalons seuls. C'est la bonne réponse dans les deux cas, pas une
   * commodité de compilation.
   */
  events?: DeploymentEventView[];
  /**
   * Le message d'une lecture d'événements en échec (`useDeploymentEvents`,
   * `status: 'error'`), ou `null`/absent si la lecture a réussi ou n'a pas
   * encore eu lieu.
   *
   * Distinct de `events` à dessein : `events: undefined` — le repli en
   * `[]` juste au-dessus — se lit exactement comme un prospect qui n'a
   * réellement aucun événement, et c'est le rendu voulu tant qu'aucune
   * réponse n'est arrivée. Une lecture qui a ÉCHOUÉ (réseau, RLS) n'est pas
   * ce cas-là : la confondre avec un vide daté ferait passer une panne pour
   * un fait établi sur ce prospect, ce que la doctrine de l'app (un vide
   * nommé, jamais une absence blanchie) interdit ailleurs — `app.error.*`,
   * déjà utilisé par `App.tsx` pour les mêmes lectures en échec.
   */
  erreurEvenements?: string | null;
  /**
   * Rejoue la lecture des événements après un échec (`useDeploymentEvents.reload`).
   *
   * Optionnel : un appelant qui ne câble pas encore de réseau (les tests de
   * ce composant, par exemple) n'a rien à rejouer, et le bouton ne s'affiche
   * simplement pas plutôt que d'appeler une fonction absente.
   */
  onReessayerEvenements?: () => void;
}) {
  const t = useT();
  const site = prospect.site;
  const evenements = events ?? [];

  const jalons: { cle: TranslationKey; date: string }[] = [
    { cle: 'histo.discovered', date: prospect.discoveredAt },
  ];
  if (site?.generatedAt != null) jalons.push({ cle: 'histo.generated', date: site.generatedAt });
  if (site?.publishedAt != null) jalons.push({ cle: 'histo.published', date: site.publishedAt });
  if (site?.contentRejectedAt != null) {
    jalons.push({ cle: 'histo.rejected', date: site.contentRejectedAt });
  }
  if (site?.unpublishedAt != null) {
    jalons.push({ cle: 'histo.unpublished', date: site.unpublishedAt });
  }

  jalons.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Chronologique, du plus ancien au plus récent — même lecture que la frise
  // des jalons ci-dessus. `fetchEventsFor` trie déjà ainsi côté base, mais ce
  // composant ne suppose pas l'ordre de ce qu'on lui passe (les tests, par
  // exemple, n'ont aucune raison de le respecter).
  const evenementsTries = [...evenements].sort((a, b) =>
    a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0,
  );

  return (
    <div>
      <div className={styles.frise}>
        {jalons.map((jalon, i) => (
          <div key={jalon.cle} className={styles.evenement}>
            <div className={styles.colonne}>
              <span className={styles.puce} />
              {i === jalons.length - 1 ? null : <span className={styles.trait} />}
            </div>
            <div className={styles.corps}>
              <span className={styles.titre}>{t(jalon.cle)}</span>
              <span className={styles.date}>{jour(jalon.date)}</span>
            </div>
          </div>
        ))}
      </div>

      <Card titre={t('histo.events.title')}>
        {erreurEvenements != null ? (
          // Un vide nommé DIFFÉREMMENT du cas « zéro événement » ci-dessous :
          // `role="alert"` l'annonce, et le message d'`useDeploymentEvents`
          // dit la cause plutôt que de laisser croire à un prospect sans
          // historique.
          <div className={styles.erreur} role="alert">
            <p className={styles.erreurTitre}>{t('app.error.title')}</p>
            <p className={styles.erreurDetail}>{erreurEvenements}</p>
            {onReessayerEvenements === undefined ? null : (
              <button type="button" onClick={onReessayerEvenements}>
                {t('app.error.retry')}
              </button>
            )}
          </div>
        ) : evenementsTries.length === 0 ? (
          <EmptyState
            titre={t('histo.events.empty.titre')}
            detail={t('histo.events.empty.detail', { date: jour(jalons[jalons.length - 1]!.date) })}
          />
        ) : (
          <ul className={styles.journal}>
            {evenementsTries.map((e, i) => {
              const duree = dureeParts(e.durationMs);
              const detail = texteDetail(t, e);
              return (
                // eslint-disable-next-line react/no-array-index-key -- le flux d'événements n'a pas d'identifiant propre, et cette liste n'est jamais réordonnée après montage.
                <li key={i} className={styles.ligneJournal}>
                  <Badge ton={TON_ISSUE[e.outcome]}>{t(CLE_ISSUE[e.outcome])}</Badge>
                  <span className={styles.etapeJournal}>{t(CLE_ETAPE[e.step])}</span>
                  <span className={styles.dateJournal}>{jour(e.occurredAt)}</span>
                  {duree === null ? null : (
                    <span className={styles.dureeJournal}>
                      {t('deploiements.row.duree', { min: duree.min, sec: duree.sec })}
                    </span>
                  )}
                  {detail === null ? null : (
                    <span className={styles.detailJournal} data-echec={e.outcome === 'echoue' ? 'true' : undefined}>
                      {detail}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
