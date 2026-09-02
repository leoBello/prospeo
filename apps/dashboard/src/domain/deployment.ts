import type { Enums } from '@prospeo/db';
import { joursCivils } from './today.js';

/**
 * L'état d'un déploiement, tel que l'écran de suivi le montre.
 *
 * `retire` prime sur tout le reste — une ligne conserve son
 * `deployment_url` après dépublication, et le tester seul afficherait
 * « en ligne » pour un site retiré. C'est l'erreur exacte que le lot
 * précédent a déjà dû corriger une fois.
 */
export type DeploymentEtat = 'jamais' | 'en_cours' | 'echec' | 'en_ligne' | 'retire';

/**
 * Une ligne de `deployment_event`, réduite à ce dont la dérivation dépend.
 */
export interface DeploymentEventView {
  step: Enums<'deployment_step'>;
  outcome: Enums<'deployment_outcome'>;
  /** Porte la cause d'un échec ; peut aussi documenter un succès ou un « ignoré ». */
  detail: string | null;
  durationMs: number | null;
  occurredAt: string;
}

/**
 * Les trois faits de `prospect_site` dont l'état d'un déploiement dépend.
 *
 * Un type minimal et non `SiteView` (domain/prospect.ts) : la fonction pure
 * n'a besoin de rien d'autre, et des fixtures de test à trois champs restent
 * lisibles là où `SiteView` en imposerait huit sans rapport avec l'état.
 */
export interface DeploymentSite {
  deploymentUrl: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
}

/** Vue consommée par l'écran de suivi du déploiement — une ligne par prospect. */
export interface DeploymentView {
  prospectId: string;
  nom: string;
  tradeSlug: string;
  city: string;
  score: number | null;
  /** Le gabarit actif en base (`site_template.repo_full_name`) — un seul, pour toutes les lignes. */
  gabarit: string | null;
  etat: DeploymentEtat;
  etapeCourante: Enums<'deployment_step'> | null;
  detail: string | null;
  durationMs: number | null;
  deploymentUrl: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  peremptionDans: number | null;
}

/**
 * L'ordre réel du pipeline (D5, lot 2).
 *
 * `projet` peut être absent : aucun événement n'est écrit pour un travail que
 * personne n'a fait (le projet Vercel existait déjà). L'ordre sert donc à
 * trouver l'étape la plus avancée qui PORTE un événement, pas à vérifier
 * qu'aucune étape ne manque.
 */
const ORDRE_ETAPES: readonly Enums<'deployment_step'>[] = [
  'redaction',
  'depot',
  'projet',
  'build',
  'en_ligne',
  'retrait',
];

/**
 * Le dernier événement de l'étape la plus avancée du pipeline qui en porte un.
 *
 * Deux précautions, dictées par ce que le collector écrit réellement :
 *
 * 1. « Dernier » se calcule PAR ÉTAPE, sur l'horodatage, jamais en comptant
 *    des paires démarré/terminé — `build` peut porter plusieurs `demarre`
 *    sans `reussi` intercalé (une build encore en cours à la fin d'un run
 *    laisse la ligne au run suivant), et un `reussi` peut apparaître sans
 *    `demarre` dans le même lot d'événements (le travail a franchi la
 *    frontière entre deux exécutions du CLI).
 * 2. L'« étape courante » est la plus avancée dans l'ORDRE du pipeline parmi
 *    celles qui portent un événement — pas celle à l'horodatage le plus
 *    récent. Ça laisse `projet` absente sans faire tomber la recherche
 *    d'`build` ou d'`en_ligne` trouvées plus loin.
 *
 * Ne suppose pas le tableau trié : compare les horodatages elle-même.
 */
export function dernierEvenementPipeline(
  events: readonly DeploymentEventView[],
): DeploymentEventView | null {
  const derniers = new Map<Enums<'deployment_step'>, DeploymentEventView>();
  for (const e of events) {
    const actuel = derniers.get(e.step);
    if (actuel === undefined) {
      derniers.set(e.step, e);
      continue;
    }
    const tActuel = new Date(actuel.occurredAt).getTime();
    const tCandidat = new Date(e.occurredAt).getTime();
    if (Number.isNaN(tCandidat)) continue; // horodatage illisible : jamais retenu comme « le dernier ».
    // À égalité, le dernier du tableau l'emporte — choix arbitraire mais
    // stable, le cas ne se présentant pas dans les faits rapportés par le
    // collector.
    if (Number.isNaN(tActuel) || tCandidat >= tActuel) {
      derniers.set(e.step, e);
    }
  }

  for (let i = ORDRE_ETAPES.length - 1; i >= 0; i -= 1) {
    const e = derniers.get(ORDRE_ETAPES[i]!);
    if (e !== undefined) return e;
  }
  return null;
}

/**
 * Dérive l'état d'un déploiement de ses événements et de `prospect_site`.
 *
 * Fonction pure : aucun accès réseau, aucune horloge — tout ce dont elle a
 * besoin lui est passé en argument. C'est de l'arithmétique sur des faits
 * datés, testable sans base.
 *
 * Ordre de décision, et pourquoi :
 * 1. `retire` — dès que `unpublishedAt` est renseignée, quoi que disent les
 *    événements ou l'URL. Voir le docstring de `DeploymentEtat`.
 * 2. `en_cours` / `echec` — décidés par le dernier événement de l'étape la
 *    plus avancée. Ils priment sur `en_ligne` : un site déjà publié dont on
 *    relance le build doit montrer le build en cours (ou en échec), pas
 *    l'ancienne URL comme si de rien n'était.
 * 3. `en_ligne` — `deploymentUrl` présente (et `unpublishedAt` déjà exclue
 *    à l'étape 1).
 * 4. Des événements existent mais rien de ce qui précède n'a tranché — la
 *    dernière étape connue est `reussi` ou `ignore` sans qu'une URL n'ait
 *    encore été enregistrée. Le pipeline a avancé, il n'est pas fini : c'est
 *    encore `en_cours`, pas `jamais` — ce mot est réservé à l'ABSENCE totale
 *    de fait.
 * 5. `jamais` — dernier repli, seulement atteint sans événement et sans URL.
 */
export function etatDepuisEvenements(
  events: readonly DeploymentEventView[],
  site: DeploymentSite,
): DeploymentEtat {
  if (site.unpublishedAt !== null) return 'retire';

  const dernier = dernierEvenementPipeline(events);

  if (dernier !== null) {
    if (dernier.outcome === 'echoue') return 'echec';
    if (dernier.outcome === 'demarre') return 'en_cours';
  }

  if (site.deploymentUrl !== null) return 'en_ligne';

  if (dernier !== null) return 'en_cours';

  return 'jamais';
}

/** Délai avant péremption d'un site publié — §D5, 90 jours civils. */
const DELAI_PEREMPTION_JOURS = 90;

/**
 * Jours restants avant péremption (90 jours civils depuis la publication).
 *
 * `null` sur `publishedAt` nul : un site jamais publié n'a pas de date
 * d'origine, et rendre 90 par défaut laisserait croire à une échéance là où
 * il n'y en a aucune.
 *
 * Compte en dates CIVILES via `joursCivils` (domain/today.ts), pas en
 * tranches de 24 h — un site publié hier à 23 h afficherait sinon un jour de
 * moins qu'il n'en reste.
 */
export function joursAvantPeremption(publishedAt: string | null, maintenant: Date): number | null {
  if (publishedAt === null) return null;
  const publication = new Date(publishedAt);
  if (Number.isNaN(publication.getTime())) return null;
  return DELAI_PEREMPTION_JOURS - joursCivils(publication, maintenant);
}
