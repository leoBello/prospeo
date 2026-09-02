import type { Enums } from '@prospeo/db';
import { joursCivils } from './today.js';

/**
 * Le jeu : des fonctions pures sur des faits déjà datés.
 *
 * Aucun accès réseau, aucune horloge lue ici — tout est reçu en argument,
 * comme `domain/deployment.ts`. Les lectures Supabase vivent dans
 * `data/jeu.ts` (tâche 7), l'affichage dans `BandeProgression` (tâche 8) :
 * ce fichier ne produit et ne doit produire AUCUNE chaîne d'interface,
 * seulement des valeurs et des identifiants que la tâche 8 traduira.
 *
 * `pipeline_event` (tâche 4) n'est pas encore appliquée à la base réelle :
 * `database.types.ts` généré ne la connaît pas, et `Tables<'pipeline_event'>`
 * ne se résout pas. Ce fichier de domaine ne doit de toute façon jamais
 * dépendre d'un type généré — voir `domain/prospect.ts` et
 * `domain/deployment.ts`, qui définissent déjà leurs propres vues plutôt que
 * d'importer `Tables<'...'>`. Seuls `Enums<'pipeline_status'>` et
 * `Enums<'interaction_kind'>` sont importés : ces énumérations existent déjà
 * dans le socle.
 */

/**
 * Les deux origines qu'une ligne de `pipeline_event` peut porter.
 *
 * Recopiée ici plutôt qu'importée : l'énumération SQL `pipeline_event_origin`
 * (migration de la tâche 4) n'existe pas encore dans le type généré, la
 * migration n'ayant pas été appliquée. C'est sans conséquence : cette union
 * est la donnée qui compte le plus dans tout ce fichier, puisque c'est elle
 * qui distingue un fait observé d'une reconstitution.
 *
 * - `observe` : écrite au moment réel du changement de statut (tâche 5).
 * - `amorcage` : reconstituée une seule fois, à la création de la table,
 *   depuis le dernier `prospect_pipeline.updated_at` connu. Elle ignore les
 *   changements de statut antérieurs (écrasés par l'`upsert` qui les a
 *   précédés) et la `next_action_at` qui a pu être en vigueur avant elle.
 *   Une ligne amorcée n'atteste donc d'AUCUN engagement pris à une date
 *   précise, et ne doit jamais nourrir un calcul qui se présente comme une
 *   observation — c'est le point de doctrine central de cette tâche.
 */
export type OrigineEvenementPipeline = 'observe' | 'amorcage';

/**
 * Une ligne de `pipeline_event`, réduite à ce dont ce fichier a besoin.
 *
 * `nextActionAt` est la valeur EN VIGUEUR AVEC ce changement de statut
 * précis, colonne `date` (pas `timestamptz`) — voir le commentaire de la
 * migration. C'est elle qui rend « relance tenue » calculable.
 */
export interface FaitPipeline {
  readonly prospectId: string;
  readonly status: Enums<'pipeline_status'>;
  readonly nextActionAt: string | null;
  readonly origin: OrigineEvenementPipeline;
  readonly occurredAt: string;
}

/** Une ligne d'`interaction`, réduite à ce dont ce fichier a besoin. */
export interface FaitInteraction {
  readonly prospectId: string;
  readonly occurredAt: string;
}

/**
 * Un site passé en ligne — `deployment_event` (lot 2) filtré en amont sur
 * `step: 'en_ligne'` et `outcome: 'reussi'` par `data/jeu.ts` (tâche 7).
 *
 * Un type propre à ce fichier plutôt que `DeploymentEventView`
 * (`domain/deployment.ts`) : ce module n'a besoin de rien d'autre que le
 * fait et sa date, et importer la vue générique de l'autre domaine
 * couplerait ce fichier à des colonnes (`step`, `outcome`, `detail`,
 * `durationMs`) qui ne servent à rien ici.
 */
export interface FaitMiseEnLigne {
  readonly prospectId: string;
  readonly occurredAt: string;
}

/**
 * Une mesure qui peut manquer d'historique pour être fiable.
 *
 * Trois issues sont possibles pour une fonction du jeu, jamais deux : une
 * VALEUR connue — qui peut très bien être zéro, zéro relance tenue est un
 * fait mesuré — ou l'aveu explicite qu'il n'y a pas encore assez
 * d'observations pour répondre. Rendre `0` pour ce second cas ferait
 * passer une absence de données pour un échec ; rendre `null` retomberait
 * dans le fourre-tout que la doctrine des absences distinctes du dépôt
 * (voir `ProspectView`, `domain/prospect.ts`) demande justement d'éviter.
 * `historique_insuffisant` est un état nommé, exploitable par l'écran sans
 * qu'il ait à réinterpréter un nombre.
 */
export type Mesure<T> =
  | { readonly connue: true; readonly valeur: T }
  | { readonly connue: false };

/**
 * Une relance tenue : une interaction survenue le jour où une
 * `next_action_at` était due, ou avant.
 *
 * Datée sur l'interaction elle-même (et non sur l'échéance qu'elle honore) :
 * c'est le jour où l'action a réellement eu lieu qui doit compter pour la
 * série et pour l'objectif, pas le jour où elle était prévue.
 */
export interface RelanceTenue {
  readonly prospectId: string;
  readonly occurredAt: string;
}

/** Un `FaitPipeline` observé et portant une échéance — la seule matière valable pour une relance tenue. */
function aUneEcheanceObservee(
  e: FaitPipeline,
): e is FaitPipeline & { nextActionAt: string } {
  return e.origin === 'observe' && e.nextActionAt !== null;
}

/**
 * Les relances effectivement tenues, croisant `pipeline_event` et
 * `interaction.occurred_at`.
 *
 * Une interaction est retenue si, pour son prospect, il existe une échéance
 * (`nextActionAt`) qu'elle honore : posée avant elle (ou le jour même — une
 * relance immédiate compte) et pas encore dépassée (le jour même de
 * l'échéance, ou avant). Une interaction antérieure à la POSE de l'échéance
 * est ignorée : elle ne peut pas répondre à un engagement qui n'existait pas
 * encore. Une seule et même interaction ne compte jamais deux fois, même si
 * elle honore plusieurs échéances à la fois — ce qui s'est produit une fois,
 * c'est UNE relance tenue, pas autant que d'échéances en attente.
 *
 * Seules les lignes `origin: 'observe'` sont prises en compte : une ligne
 * amorcée ne dit rien d'une échéance réellement en vigueur (voir
 * `OrigineEvenementPipeline`), et la retenir fabriquerait une relance tenue
 * sur une reconstitution plutôt que sur un fait.
 */
export function relancesTenues(
  evenementsPipeline: readonly FaitPipeline[],
  interactions: readonly FaitInteraction[],
): readonly RelanceTenue[] {
  const echeancesParProspect = new Map<string, Array<FaitPipeline & { nextActionAt: string }>>();
  for (const e of evenementsPipeline) {
    if (!aUneEcheanceObservee(e)) continue;
    const liste = echeancesParProspect.get(e.prospectId);
    if (liste) liste.push(e);
    else echeancesParProspect.set(e.prospectId, [e]);
  }
  if (echeancesParProspect.size === 0) return [];

  const tenues: RelanceTenue[] = [];
  for (const interaction of interactions) {
    const echeances = echeancesParProspect.get(interaction.prospectId);
    if (echeances === undefined) continue;

    const jourInteraction = new Date(interaction.occurredAt);
    if (Number.isNaN(jourInteraction.getTime())) continue;

    const honoreUneEcheance = echeances.some((echeance) => {
      const pose = new Date(echeance.occurredAt);
      const dueLe = new Date(echeance.nextActionAt);
      if (Number.isNaN(pose.getTime()) || Number.isNaN(dueLe.getTime())) return false;
      // Posée avant (ou le jour même) l'interaction, ET pas encore dépassée
      // (le jour même de l'échéance, ou avant) : les deux bornes sont
      // inclusives, ce que `joursCivils(...) >= 0` exprime dans les deux sens.
      return joursCivils(pose, jourInteraction) >= 0 && joursCivils(jourInteraction, dueLe) >= 0;
    });

    if (honoreUneEcheance) {
      tenues.push({ prospectId: interaction.prospectId, occurredAt: interaction.occurredAt });
    }
  }
  return tenues;
}

/** Un rendez-vous obtenu : le passage OBSERVÉ du statut à « intéressé ». */
export interface RendezVousObtenu {
  readonly prospectId: string;
  readonly occurredAt: string;
}

/**
 * Les rendez-vous obtenus : chaque ligne `pipeline_event` observée portant
 * le statut `interesse`.
 *
 * `pipeline_event` écrit une ligne à CHAQUE changement de statut (tâche 5) :
 * une ligne `status: 'interesse'` représente donc exactement l'instant où le
 * statut y est devenu. Un prospect qui repasse par « intéressé » plusieurs
 * fois compte plusieurs rendez-vous — chacun est un jalon réel distinct.
 *
 * Seules les lignes `origin: 'observe'` comptent, pour la même raison que
 * `relancesTenues` : une ligne amorcée reconstitue un état courant, elle ne
 * dit pas QUAND le statut est devenu « intéressé ».
 */
export function rendezVousObtenus(
  evenementsPipeline: readonly FaitPipeline[],
): readonly RendezVousObtenu[] {
  return evenementsPipeline
    .filter((e) => e.origin === 'observe' && e.status === 'interesse')
    .map((e) => ({ prospectId: e.prospectId, occurredAt: e.occurredAt }));
}

/**
 * Le décalage en jours civils entre un horodatage et « maintenant » —
 * 0 pour aujourd'hui, 1 pour hier, etc. `null` sur un horodatage illisible,
 * pour que les appelants l'écartent plutôt que de le traiter comme
 * aujourd'hui par défaut.
 */
function decalageEnJours(occurredAt: string, maintenant: Date): number | null {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return null;
  return joursCivils(date, maintenant);
}

/**
 * Série : nombre de jours civils consécutifs, en remontant depuis
 * aujourd'hui, avec au moins une relance tenue.
 *
 * Toujours une vraie valeur, jamais « pas assez d'historique » : une série
 * de zéro jour est un fait aussi valable qu'une série de dix, y compris le
 * tout premier jour de l'historique (voir le brief de la tâche : « la série
 * vaudra zéro, ce n'est pas une erreur »). Croisée avec `relancesTenues`, qui
 * exclut déjà les lignes amorcées : une base uniquement amorcée ne peut donc
 * produire qu'un zéro réel, jamais une série fabriquée sur une reconstitution.
 *
 * Aujourd'hui n'est compté QUE s'il porte déjà une relance tenue : la
 * journée n'étant pas terminée, son absence de relance ne casse pas la
 * série pour autant — le décompte reprend alors simplement à hier.
 */
export function serieDeJours(relances: readonly RelanceTenue[], maintenant: Date): number {
  const joursAvecRelance = new Set<number>();
  for (const r of relances) {
    const decalage = decalageEnJours(r.occurredAt, maintenant);
    if (decalage === null || decalage < 0) continue;
    joursAvecRelance.add(decalage);
  }

  let decalage = joursAvecRelance.has(0) ? 0 : 1;
  let jours = 0;
  while (joursAvecRelance.has(decalage)) {
    jours += 1;
    decalage += 1;
  }
  return jours;
}

/** Fenêtre de la médiane de l'objectif du jour — §D5, la veille impose 14 jours. */
const FENETRE_OBJECTIF_JOURS = 14;

/** La date la plus ancienne parmi les lignes OBSERVÉES, ou `null` s'il n'y en a aucune. */
function premiereObservation(evenementsPipeline: readonly FaitPipeline[]): Date | null {
  let premiere: Date | null = null;
  for (const e of evenementsPipeline) {
    if (e.origin !== 'observe') continue;
    const date = new Date(e.occurredAt);
    if (Number.isNaN(date.getTime())) continue;
    if (premiere === null || date < premiere) premiere = date;
  }
  return premiere;
}

/** La médiane d'une liste de nombres, moyenne des deux valeurs centrales si la liste est paire. */
function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  if (triees.length % 2 === 1) return triees[milieu]!;
  return (triees[milieu - 1]! + triees[milieu]!) / 2;
}

/**
 * Objectif du jour : la médiane du nombre de relances tenues par jour, sur
 * les quatorze jours civils COMPLETS précédents (aujourd'hui exclu — la
 * journée n'est pas terminée, son compte n'est pas définitif).
 *
 * `historique_insuffisant` (voir `Mesure`) dès qu'AUCUN jour civil complet
 * n'a encore pu être observé — c'est-à-dire dès qu'aucune ligne `observe` de
 * `pipeline_event` n'existe encore, ou que la plus ancienne date d'aujourd'hui
 * même. C'est exactement le cas courant au jour de la livraison : la table
 * vient d'être créée, ou d'être amorcée (l'amorçage ne compte pas comme une
 * observation — voir `OrigineEvenementPipeline`).
 *
 * Passé ce seuil, la médiane porte sur AUTANT de jours que l'historique en
 * fournit — un jour sans aucune relance tenue y entre avec un compte de
 * zéro, un vrai zéro mesuré et non une absence. Elle ne réclame jamais
 * quatorze jours pleins : la tâche l'exige explicitement, pour ne pas
 * transformer chaque semaine de mise en service en `historique_insuffisant`.
 */
export function objectifDuJour(
  evenementsPipeline: readonly FaitPipeline[],
  relances: readonly RelanceTenue[],
  maintenant: Date,
): Mesure<number> {
  const debut = premiereObservation(evenementsPipeline);
  if (debut === null) return { connue: false };

  const joursEcoules = joursCivils(debut, maintenant);
  const tailleFenetre = Math.min(FENETRE_OBJECTIF_JOURS, joursEcoules);
  if (tailleFenetre <= 0) return { connue: false };

  const comptesParJour = new Map<number, number>();
  for (const r of relances) {
    const decalage = decalageEnJours(r.occurredAt, maintenant);
    // Hors fenêtre (avant la fenêtre de 14 jours, ou aujourd'hui même,
    // décalage 0) : ne participe pas à la médiane.
    if (decalage === null || decalage < 1 || decalage > tailleFenetre) continue;
    comptesParJour.set(decalage, (comptesParJour.get(decalage) ?? 0) + 1);
  }

  const valeurs: number[] = [];
  for (let decalage = 1; decalage <= tailleFenetre; decalage += 1) {
    valeurs.push(comptesParJour.get(decalage) ?? 0);
  }

  return { connue: true, valeur: mediane(valeurs) };
}

/**
 * Les poids et le seuil du jeu, en un seul endroit — §D5 : « pondérer, c'est
 * dire ce qui compte », et ce sont des valeurs d'attente assumées, à régler
 * à l'usage. Ne pas les disséminer ailleurs dans ce fichier.
 */
export const PARAMETRES_PALIER = {
  points: {
    /** Poids le plus faible : c'est le geste le plus fréquent. */
    relanceTenue: 40,
    /** Un jalon plus rare que la relance, donc pesé davantage. */
    siteMisEnLigne: 120,
    /** Le jalon le plus rare et le plus qualifiant du pipeline. */
    rendezVousObtenu: 200,
  },
  /** Points nécessaires pour franchir un palier — valeur de la maquette. */
  seuil: 500,
} as const;

/** L'état du palier de points : le total, le seuil, le numéro du palier atteint et la progression dans celui-ci. */
export interface Palier {
  readonly points: number;
  readonly seuil: number;
  /** Numérotés à partir de 1 : zéro point, c'est déjà le palier 1. */
  readonly numero: number;
  /** Points acquis dans le palier courant, entre 0 (inclus) et `seuil` (exclu). */
  readonly progression: number;
}

/**
 * Calcule le palier à partir du nombre de faits observés de chaque source —
 * jamais du volume d'activité indifférencié (voir le tableau de la veille,
 * brief de la tâche). Les comptes fournis doivent déjà exclure les lignes
 * amorcées : c'est `relancesTenues` et `rendezVousObtenus` qui s'en chargent
 * en amont, ce calcul est de la seule arithmétique.
 */
export function calculerPalier(
  nombreRelancesTenues: number,
  nombreSitesMisEnLigne: number,
  nombreRendezVousObtenus: number,
): Palier {
  const points =
    nombreRelancesTenues * PARAMETRES_PALIER.points.relanceTenue +
    nombreSitesMisEnLigne * PARAMETRES_PALIER.points.siteMisEnLigne +
    nombreRendezVousObtenus * PARAMETRES_PALIER.points.rendezVousObtenu;
  const seuil: number = PARAMETRES_PALIER.seuil;
  return {
    points,
    seuil,
    numero: Math.floor(points / seuil) + 1,
    progression: points % seuil,
  };
}

/**
 * Les badges du jeu, liés à des jalons réels — §D5 : « un badge qui ne
 * correspond à rien qu'on ait fait est une image ». Un identifiant, jamais
 * un libellé : la tâche 8 le traduit par `t()`.
 *
 * Un badge non obtenu reste dans la liste rendue par `calculerBadges`,
 * jamais retiré : c'est ce qui permet à l'écran d'en montrer au moins un
 * VERROUILLÉ mais visible, comme l'exige la tâche, plutôt que de ne montrer
 * que ce qui est déjà acquis.
 */
export type BadgeId =
  | 'premiere_relance_tenue'
  | 'premier_site_en_ligne'
  | 'premier_rendez_vous'
  | 'serie_sept_jours';

/** L'état d'un badge : son identifiant, et s'il est obtenu ou encore verrouillé. */
export interface EtatBadge {
  readonly id: BadgeId;
  readonly obtenu: boolean;
}

export interface JalonsAtteints {
  readonly nombreRelancesTenues: number;
  readonly nombreSitesMisEnLigne: number;
  readonly nombreRendezVousObtenus: number;
  readonly serie: number;
}

/** Seuil de série à partir duquel le badge de régularité se débloque. */
const SERIE_BADGE_JOURS = 7;

export function calculerBadges(jalons: JalonsAtteints): readonly EtatBadge[] {
  return [
    { id: 'premiere_relance_tenue', obtenu: jalons.nombreRelancesTenues >= 1 },
    { id: 'premier_site_en_ligne', obtenu: jalons.nombreSitesMisEnLigne >= 1 },
    { id: 'premier_rendez_vous', obtenu: jalons.nombreRendezVousObtenus >= 1 },
    { id: 'serie_sept_jours', obtenu: jalons.serie >= SERIE_BADGE_JOURS },
  ];
}

/** Les faits bruts dont le jeu entier se dérive. */
export interface EntreesJeu {
  readonly maintenant: Date;
  readonly evenementsPipeline: readonly FaitPipeline[];
  readonly interactions: readonly FaitInteraction[];
  readonly sitesMisEnLigne: readonly FaitMiseEnLigne[];
}

/** Le jeu assemblé — ce que `data/jeu.ts` (tâche 7) et l'écran (tâche 8) consomment. */
export interface Jeu {
  readonly objectifDuJour: Mesure<number>;
  readonly serie: number;
  readonly palier: Palier;
  readonly badges: readonly EtatBadge[];
}

/**
 * Assemble le jeu complet à partir des faits bruts.
 *
 * Simple composition des fonctions ci-dessus : aucune règle nouvelle n'est
 * introduite ici, pour que chaque définition reste testable et lisible
 * séparément.
 */
export function construireJeu(entrees: EntreesJeu): Jeu {
  const relances = relancesTenues(entrees.evenementsPipeline, entrees.interactions);
  const rendezVous = rendezVousObtenus(entrees.evenementsPipeline);
  const serie = serieDeJours(relances, entrees.maintenant);
  const objectif = objectifDuJour(entrees.evenementsPipeline, relances, entrees.maintenant);
  const palier = calculerPalier(relances.length, entrees.sitesMisEnLigne.length, rendezVous.length);
  const badges = calculerBadges({
    nombreRelancesTenues: relances.length,
    nombreSitesMisEnLigne: entrees.sitesMisEnLigne.length,
    nombreRendezVousObtenus: rendezVous.length,
    serie,
  });

  return { objectifDuJour: objectif, serie, palier, badges };
}
