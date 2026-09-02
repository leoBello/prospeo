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
 * **Correctif de revue (tâche 7, second passage).** La première version de ce
 * fichier supposait que `evenementsPipeline`/`interactions` portaient
 * l'historique COMPLET, depuis toujours. `data/jeu.ts` ne peut plus fournir
 * cela sans relire les deux tables en entier à chaque chargement d'écran —
 * exactement ce qu'un arbitrage a exclu. Ce fichier reçoit désormais :
 * - `evenementsPipeline`/`interactions` : une FENÊTRE BORNÉE PAR DATE (voir
 *   `FENETRE_OBJECTIF_JOURS`), suffisante pour `objectifDuJour` et
 *   `serieDeJours`, qui n'ont jamais eu besoin de plus ;
 * - des COMPTES SERVEUR (`nombreSitesMisEnLigne`, `nombreRendezVousObtenus`)
 *   pour tout ce qui doit être cumulatif et ne jamais régresser — un `count`
 *   PostgREST ne transfère aucune ligne et ne peut pas mentir par troncature ;
 * - `relancesTenuesCumulees: Mesure<number>` — voir son docstring : `{connue:
 *   false}` tant qu'aucune source honnête n'existe pour ce cumul précis.
 *
 * `pipeline_event` (tâche 4) est désormais bien connue de
 * `database.types.ts` (la migration a été appliquée) ; ce fichier continue
 * néanmoins de définir ses propres types plutôt que d'importer
 * `Tables<'...'>`, par cohérence avec `domain/prospect.ts` et
 * `domain/deployment.ts`.
 *
 * **Second correctif de revue.** `{connue: false}` dans `EntreesJeu` disait
 * déjà honnêtement l'incomplétude EN ENTRÉE, mais elle se perdait avant
 * d'atteindre l'écran : `Palier` n'exposait rien, et `EtatBadge` réduisait
 * « pas encore obtenu » et « ne peut être obtenu par aucun geste » au même
 * booléen. `Palier.complet` et `EtatBadgeValeur` (trois états, pas deux)
 * portent maintenant cette distinction jusqu'à `Jeu` — voir leurs docstrings.
 */

/**
 * Les deux origines qu'une ligne de `pipeline_event` peut porter.
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
 * Une mesure qui peut manquer d'historique — ou de moyen honnête — pour être
 * fiable.
 *
 * Trois issues sont possibles pour une fonction du jeu, jamais deux : une
 * VALEUR connue — qui peut très bien être zéro, zéro relance tenue est un
 * fait mesuré — ou l'aveu explicite qu'il n'y a pas (encore, ou pas du tout
 * avec les moyens actuels) de quoi répondre. Rendre `0` pour ce second cas
 * ferait passer une absence de données pour un échec ; rendre `null`
 * retomberait dans le fourre-tout que la doctrine des absences distinctes du
 * dépôt (voir `ProspectView`, `domain/prospect.ts`) demande justement
 * d'éviter. `connue: false` est un état nommé, exploitable par l'écran sans
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
 *
 * **Portée depuis le correctif de revue.** Cette fonction reste pure et ne
 * change pas : elle croise ce qu'on lui donne. Ce qui change, c'est ce que
 * `data/jeu.ts` lui donne — une fenêtre bornée par date plutôt que
 * l'historique complet. Le résultat qu'elle rend n'est donc plus, en toute
 * rigueur, « toutes les relances tenues depuis toujours » mais « toutes les
 * relances tenues DANS LA FENÊTRE fournie ». `objectifDuJour` et
 * `serieDeJours`, ses deux seuls appelants, n'ont jamais eu besoin de plus —
 * voir leurs docstrings respectifs.
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
 * Le résultat de `serieDeJours` : un compte de jours, et un drapeau qui dit
 * si ce compte est EXACT ou seulement un plancher.
 *
 * Une série peut, en toute rigueur, dépasser la fenêtre de jours que
 * `data/jeu.ts` a pu fournir (voir `fenetreJours` dans `serieDeJours`) : nous
 * n'avons alors aucun moyen de savoir si elle continue au-delà. Rendre un
 * nombre nu dans ce cas ferait mentir par omission — un `14` qui prétend être
 * exact alors qu'il ne l'est pas. `borneAtteinte: true` nomme cette limite
 * plutôt que de la taire ; c'est à la tâche 8 de la traduire (« 14 jours ou
 * plus », par exemple), jamais à ce fichier de le dire en toutes lettres.
 */
export interface Serie {
  readonly jours: number;
  /** `true` : le décompte s'est arrêté au bord de la fenêtre fournie, pas sur un vrai jour manquant — la valeur réelle peut être plus grande. */
  readonly borneAtteinte: boolean;
}

/**
 * Série : nombre de jours civils consécutifs, en remontant depuis
 * aujourd'hui, avec au moins une relance tenue.
 *
 * Toujours une vraie valeur, jamais « pas assez d'historique » : une série
 * de zéro jour est un fait aussi valable qu'une série de dix, y compris le
 * tout premier jour de l'historique. Croisée avec `relancesTenues`, qui
 * exclut déjà les lignes amorcées : une base uniquement amorcée ne peut donc
 * produire qu'un zéro réel, jamais une série fabriquée sur une reconstitution.
 *
 * Aujourd'hui n'est compté QUE s'il porte déjà une relance tenue : la
 * journée n'étant pas terminée, son absence de relance ne casse pas la
 * série pour autant — le décompte reprend alors simplement à hier.
 *
 * `fenetreJours` borne le décompte : `relances` ne couvre de toute façon que
 * ce que `data/jeu.ts` a lu (une fenêtre par date, voir son docstring), donc
 * chercher au-delà serait chercher dans du vide. Si le décompte atteint
 * exactement `fenetreJours` — chaque jour de la fenêtre porte une relance,
 * sans le moindre trou observé — on ne peut pas savoir si la série s'arrête
 * réellement là ou continue plus loin : `borneAtteinte` le dit.
 */
export function serieDeJours(
  relances: readonly RelanceTenue[],
  maintenant: Date,
  fenetreJours: number,
): Serie {
  const joursAvecRelance = new Set<number>();
  for (const r of relances) {
    const decalage = decalageEnJours(r.occurredAt, maintenant);
    if (decalage === null || decalage < 0) continue;
    joursAvecRelance.add(decalage);
  }

  let decalage = joursAvecRelance.has(0) ? 0 : 1;
  let jours = 0;
  while (jours < fenetreJours && joursAvecRelance.has(decalage)) {
    jours += 1;
    decalage += 1;
  }
  // Le plafond a été atteint sans le moindre trou : on ignore ce qu'il y a
  // plus loin, faute de donnée — voir le docstring de `Serie`.
  return { jours, borneAtteinte: jours === fenetreJours };
}

/**
 * Le réalisé du jour : le nombre de relances tenues dont l'interaction est
 * survenue AUJOURD'HUI (jour civil courant) — le numérateur qui manquait à
 * l'anneau de la maquette (Main.dc.html ~114-124, « 12 / 15 ») : `Jeu` ne
 * portait jusqu'ici que le dénominateur (`objectifDuJour`), sans le réalisé
 * à mettre en face. Correctif de revue, tâche 8, second passage.
 *
 * Réutilise `decalageEnJours`, déjà éprouvé par `serieDeJours` : même
 * définition du « jour civil courant » des deux côtés, aucune règle
 * nouvelle. Un FAIT mesuré, jamais une `Mesure<number>` — comme
 * `serie.jours`, zéro le premier jour est aussi vrai et aussi affichable
 * qu'un objectif inconnu ; ce sont deux absences de nature différente (voir
 * le docstring de `BandeProgression`, tâche 8).
 */
function relancesTenuesAujourdHui(relances: readonly RelanceTenue[], maintenant: Date): number {
  let n = 0;
  for (const r of relances) {
    if (decalageEnJours(r.occurredAt, maintenant) === 0) n += 1;
  }
  return n;
}

/**
 * Fenêtre de la médiane de l'objectif du jour — §D5, la veille impose 14
 * jours. Réutilisée telle quelle comme plafond pour `serieDeJours` (voir son
 * docstring) et pour dimensionner la lecture bornée par date de
 * `data/jeu.ts` : les deux calculs à fenêtre n'ont jamais eu besoin de plus
 * que cette exigence-là, une seule lecture les sert donc tous les deux.
 */
export const FENETRE_OBJECTIF_JOURS = 14;

/** La date la plus ancienne parmi les lignes OBSERVÉES fournies, ou `null` s'il n'y en a aucune. */
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
 * `historiqueAuDelaDeLaFenetre` : depuis le correctif de revue,
 * `evenementsPipeline` ne couvre plus qu'une fenêtre bornée par date (voir
 * `data/jeu.ts`) — `premiereObservation` calculée dessus ne peut donc plus,
 * à elle seule, distinguer « l'historique a commencé il y a moins de
 * quatorze jours » de « l'historique est bien plus ancien, mais la fenêtre
 * lue ne le montre pas ». `data/jeu.ts` tranche cette ambiguïté par un
 * `count` séparé (borné, sans transfert de lignes) et la restitue ici sous
 * forme de drapeau : `true` fixe directement la fenêtre à quatorze jours
 * pleins, `false` laisse `premiereObservation` (exacte dans ce cas, puisque
 * tout l'historique tient alors dans la fenêtre lue) déterminer une fenêtre
 * plus courte.
 *
 * `{connue: false}` (voir `Mesure`) dès qu'AUCUN jour civil complet n'a
 * encore pu être observé — c'est-à-dire dès qu'aucune ligne `observe` de
 * `pipeline_event` n'existe encore (dans la fenêtre, et rien avant elle non
 * plus), ou que la plus ancienne date d'aujourd'hui même.
 *
 * Passé ce seuil, la médiane porte sur AUTANT de jours que l'historique en
 * fournit — un jour sans aucune relance tenue y entre avec un compte de
 * zéro, un vrai zéro mesuré et non une absence. Elle ne réclame jamais
 * quatorze jours pleins, pour ne pas transformer chaque semaine de mise en
 * service en `{connue: false}`.
 */
export function objectifDuJour(
  evenementsPipeline: readonly FaitPipeline[],
  relances: readonly RelanceTenue[],
  maintenant: Date,
  historiqueAuDelaDeLaFenetre: boolean,
): Mesure<number> {
  const debut = premiereObservation(evenementsPipeline);
  if (!historiqueAuDelaDeLaFenetre && debut === null) return { connue: false };

  const tailleFenetre = historiqueAuDelaDeLaFenetre
    ? FENETRE_OBJECTIF_JOURS
    : Math.min(FENETRE_OBJECTIF_JOURS, joursCivils(debut!, maintenant));
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
 *
 * `relanceTenue` reste défini bien qu'inutilisé tant que
 * `relancesTenuesCumulees` vaut `{connue: false}` (voir `calculerPalier`) —
 * le poids est déjà arrêté pour le jour où un cumul honnête existera.
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

/**
 * L'état du palier de points : le total, le seuil, le numéro du palier
 * atteint et la progression dans celui-ci.
 *
 * **`complet` — second correctif de revue.** Un `Mesure<number>` non connu
 * (voir `calculerPalier`) fait déjà contribuer zéro point à `points`, mais un
 * zéro qui n'a JAMAIS l'occasion de changer n'est pas la même absence qu'un
 * zéro vraiment mesuré — exactement la distinction que ce dépôt refuse de
 * réduire au même booléen ailleurs (`ProspectView`, `Mesure` lui-même).
 * `complet: false` porte cette distinction jusqu'à l'écran : `points` est
 * alors un PLANCHER, pas le score réel, parce qu'au moins une source
 * (aujourd'hui, seulement « relance tenue » — voir `calculerPalier`) reste
 * structurellement non mesurable. Un simple drapeau suffit tant qu'une seule
 * source peut se trouver dans ce cas ; s'il devait y en avoir plusieurs un
 * jour, une liste des sources deviendrait nécessaire, mais inventer cette
 * liste aujourd'hui pour une unique source serait de la prévoyance qui ne
 * sert personne.
 */
export interface Palier {
  readonly points: number;
  readonly seuil: number;
  /** Numérotés à partir de 1 : zéro point, c'est déjà le palier 1. */
  readonly numero: number;
  /** Points acquis dans le palier courant, entre 0 (inclus) et `seuil` (exclu). */
  readonly progression: number;
  /** `false` : `points` omet au moins une source structurellement non mesurable — voir le docstring de l'interface. */
  readonly complet: boolean;
}

/**
 * Calcule le palier à partir du nombre de faits observés de chaque source —
 * jamais du volume d'activité indifférencié.
 *
 * **Pourquoi `relancesTenues` est un `Mesure<number>` et non un simple
 * nombre.** Le palier ne doit jamais régresser — un badge ou des points
 * acquis ne se reprennent pas. `nombreSitesMisEnLigne` et
 * `nombreRendezVousObtenus` viennent d'un `count` serveur sur UNE table,
 * filtré une fois pour toutes (`step`/`outcome`, ou `status`/`origin`) : un
 * total qui ne peut que croître, jamais lu en entier côté client. « Relance
 * tenue » n'a pas cette chance : c'est un croisement de DEUX tables
 * (`pipeline_event.next_action_at` × `interaction.occurred_at`) qu'aucune
 * requête PostgREST ne réduit à un `count` — il faudrait une vue ou une
 * fonction SQL, une migration de plus sur une base réelle, décision qui ne
 * revient pas à cette tâche. Faute de mieux, le comptabiliser sur une fenêtre
 * bornée referait courir le risque exclu (un badge qui se reverrouille
 * quand la fenêtre glisse). `relancesTenues.connue === false` — la valeur
 * que `data/jeu.ts` fournit tant qu'aucune source honnête n'existe — fait
 * donc contribuer zéro point ici, plutôt que de fabriquer un chiffre qui
 * prétendrait mesurer un cumul qu'il ne mesure pas. **Ce zéro n'est cependant
 * pas silencieux** : `complet` (voir `Palier`) porte l'aveu jusqu'à l'écran.
 */
export function calculerPalier(
  relancesTenuesCumulees: Mesure<number>,
  nombreSitesMisEnLigne: number,
  nombreRendezVousObtenus: number,
): Palier {
  const pointsRelances = relancesTenuesCumulees.connue
    ? relancesTenuesCumulees.valeur * PARAMETRES_PALIER.points.relanceTenue
    : 0;
  const points =
    pointsRelances +
    nombreSitesMisEnLigne * PARAMETRES_PALIER.points.siteMisEnLigne +
    nombreRendezVousObtenus * PARAMETRES_PALIER.points.rendezVousObtenu;
  const seuil: number = PARAMETRES_PALIER.seuil;
  return {
    points,
    seuil,
    numero: Math.floor(points / seuil) + 1,
    progression: points % seuil,
    complet: relancesTenuesCumulees.connue,
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

/**
 * Les trois états qu'un badge peut porter — **second correctif de revue**,
 * en remplacement d'un simple `obtenu: boolean`.
 *
 * Un badge non obtenu peut se trouver dans deux situations que ce dépôt
 * refuse par doctrine de réduire au même booléen (absences distinctes,
 * `ProspectView`) : **`verrouille`**, atteignable par un geste réel de
 * l'opérateur (une relance de plus, un site de plus) ; **`non_mesurable`**,
 * où AUCUN geste ne peut le débloquer aujourd'hui, faute de source honnête
 * pour la mesure sous-jacente (voir `calculerPalier`). Confondre les deux
 * présenterait un badge comme un objectif poursuivable alors qu'il ne l'est
 * pas — l'affordance qui annonce un fait qu'aucun code ne peut rendre vrai.
 */
export type EtatBadgeValeur = 'obtenu' | 'verrouille' | 'non_mesurable';

/** L'état d'un badge : son identifiant, et lequel des trois états de `EtatBadgeValeur` il porte. */
export interface EtatBadge {
  readonly id: BadgeId;
  readonly etat: EtatBadgeValeur;
}

export interface JalonsAtteints {
  /** Voir le docstring de `calculerPalier` : `{connue: false}` tant qu'aucun cumul honnête n'existe. */
  readonly relancesTenuesCumulees: Mesure<number>;
  readonly nombreSitesMisEnLigne: number;
  readonly nombreRendezVousObtenus: number;
  readonly serie: Serie;
}

/** Seuil de série à partir duquel le badge de régularité se débloque. */
const SERIE_BADGE_JOURS = 7;

/**
 * `premiere_relance_tenue` porte `non_mesurable` — jamais `verrouille` —
 * tant que `relancesTenuesCumulees` vaut `{connue: false}` : rien ne
 * distingue AUJOURD'HUI un opérateur qui n'a encore tenu aucune relance d'un
 * opérateur qui en a tenu cent, faute de cumul honnête (voir
 * `calculerPalier`) — présenter ce badge comme « verrouillé » laisserait
 * croire qu'une relance de plus suffirait à le débloquer, ce qu'aucun geste
 * ne peut faire aujourd'hui. `serie_sept_jours`, lui, n'est PAS un jalon
 * cumulatif : une série en cours peut légitimement se rompre et redébloquer
 * plus tard, ce n'est pas la régression interdite par l'arbitrage (qui vise
 * les jalons « depuis toujours »), donc toujours `obtenu`/`verrouille`,
 * jamais `non_mesurable`. Le seuil (7) reste toujours en-deçà de
 * `FENETRE_OBJECTIF_JOURS` (14, le plafond de `serie.jours`) :
 * `serie.jours >= 7` reste une comparaison exacte même quand
 * `serie.borneAtteinte` est vrai, puisque la vraie série ne peut alors
 * qu'être PLUS longue que ce plafond, jamais plus courte.
 */
export function calculerBadges(jalons: JalonsAtteints): readonly EtatBadge[] {
  const etatMesure = (mesure: Mesure<number>, seuilAtteint: (valeur: number) => boolean): EtatBadgeValeur => {
    if (!mesure.connue) return 'non_mesurable';
    return seuilAtteint(mesure.valeur) ? 'obtenu' : 'verrouille';
  };
  const etatCompte = (valeur: number, seuil: number): EtatBadgeValeur => (valeur >= seuil ? 'obtenu' : 'verrouille');

  return [
    { id: 'premiere_relance_tenue', etat: etatMesure(jalons.relancesTenuesCumulees, (v) => v >= 1) },
    { id: 'premier_site_en_ligne', etat: etatCompte(jalons.nombreSitesMisEnLigne, 1) },
    { id: 'premier_rendez_vous', etat: etatCompte(jalons.nombreRendezVousObtenus, 1) },
    { id: 'serie_sept_jours', etat: etatCompte(jalons.serie.jours, SERIE_BADGE_JOURS) },
  ];
}

/**
 * Les faits bruts dont le jeu entier se dérive.
 *
 * `evenementsPipeline`/`interactions` : une fenêtre bornée par date (voir
 * `FENETRE_OBJECTIF_JOURS` et le docstring de `data/jeu.ts`), pour
 * `objectifDuJour`/`serieDeJours` seulement — plus l'historique complet.
 * `nombreSitesMisEnLigne`/`nombreRendezVousObtenus`/`relancesTenuesCumulees`
 * portent, eux, sur toute la durée de vie des données (voir
 * `calculerPalier`).
 */
export interface EntreesJeu {
  readonly maintenant: Date;
  readonly evenementsPipeline: readonly FaitPipeline[];
  readonly interactions: readonly FaitInteraction[];
  /** Voir le docstring d'`objectifDuJour`. */
  readonly historiqueAuDelaDeLaFenetre: boolean;
  /** Voir le docstring de `calculerPalier`. */
  readonly relancesTenuesCumulees: Mesure<number>;
  readonly nombreSitesMisEnLigne: number;
  readonly nombreRendezVousObtenus: number;
}

/** Le jeu assemblé — ce que `data/jeu.ts` (tâche 7) et l'écran (tâche 8) consomment. */
export interface Jeu {
  readonly objectifDuJour: Mesure<number>;
  /** Voir le docstring de `relancesTenuesAujourdHui` : le numérateur de l'anneau, jamais une `Mesure`. */
  readonly realiseAujourdHui: number;
  readonly serie: Serie;
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
  const realiseAujourdHui = relancesTenuesAujourdHui(relances, entrees.maintenant);
  const serie = serieDeJours(relances, entrees.maintenant, FENETRE_OBJECTIF_JOURS);
  const objectif = objectifDuJour(
    entrees.evenementsPipeline,
    relances,
    entrees.maintenant,
    entrees.historiqueAuDelaDeLaFenetre,
  );
  const palier = calculerPalier(
    entrees.relancesTenuesCumulees,
    entrees.nombreSitesMisEnLigne,
    entrees.nombreRendezVousObtenus,
  );
  const badges = calculerBadges({
    relancesTenuesCumulees: entrees.relancesTenuesCumulees,
    nombreSitesMisEnLigne: entrees.nombreSitesMisEnLigne,
    nombreRendezVousObtenus: entrees.nombreRendezVousObtenus,
    serie,
  });

  return { objectifDuJour: objectif, realiseAujourdHui, serie, palier, badges };
}
