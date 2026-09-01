import type { ScoreLine } from '@prospeo/core';
import type { TranslationKey, TranslationParams } from '../i18n/translate.js';
import type { ProspectView, ReasonFragment, WorkList, WorkRow } from './prospect.js';

/**
 * Plafond d'affichage d'une liste de travail.
 *
 * L'écran sert à décider de la prochaine action, pas à parcourir la base :
 * au-delà d'une douzaine de lignes on ne choisit plus, on fait défiler.
 * Le nombre réel reste annoncé dans l'intitulé.
 */
export const MAX_ROWS_PER_LIST = 12;

/** Nombre de signaux repris dans la raison d'un prospect à fort score. */
const MAX_REASON_LINES = 3;

/**
 * Statuts qui retirent définitivement un prospect des files de travail.
 *
 * `ne_pas_contacter` est une obligation de conformité (§11) : « respecté
 * immédiatement et définitivement ». `gagne` et `perdu` ferment le dossier.
 */
const STATUTS_CLOS = new Set(['ne_pas_contacter', 'gagne', 'perdu']);

/** Statuts qui valent « jamais engagé », donc éligibles à la file des nouveaux. */
const STATUTS_NON_ENGAGES = new Set(['a_contacter']);

export interface FollowUpReason {
  key: TranslationKey;
  params: TranslationParams;
}

/** Nombre de jours civils entre deux instants, en heure locale. */
function joursCivils(de: Date, vers: Date): number {
  const jour = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((jour(vers) - jour(de)) / 86_400_000);
}

/**
 * Dit pourquoi une relance figure dans la file, et depuis quand.
 *
 * Le décompte est en dates civiles et non en tranches de vingt-quatre heures :
 * une relance prévue hier à 23 h est en retard d'un jour, pas de zéro. Une
 * soustraction de millisecondes afficherait « aujourd'hui » pour un engagement
 * déjà tenu en retard.
 */
export function followUpReason(nextActionAt: string | null, now: Date): FollowUpReason {
  if (nextActionAt === null) {
    return { key: 'today.reason.followUp.undated', params: {} };
  }
  const echeance = new Date(nextActionAt);
  if (Number.isNaN(echeance.getTime())) {
    return { key: 'today.reason.followUp.undated', params: {} };
  }

  const jours = joursCivils(echeance, now);
  if (jours === 0) return { key: 'today.reason.followUp.today', params: {} };
  if (jours > 0) {
    return { key: 'today.reason.followUp.late', params: { days: jours, count: jours } };
  }
  const dans = -jours;
  return { key: 'today.reason.followUp.future', params: { days: dans, count: dans } };
}

/**
 * Les signaux qui justifient un score, du plus lourd au plus léger.
 *
 * La présence web ouvre toujours la liste, quel que soit son poids : c'est le
 * motif de qualification du prospect, et le reste n'est qu'un renfort. Une
 * ligne à points négatifs ou nuls est écartée — une raison de figurer dans la
 * file ne se justifie pas par un manque.
 */
export function highlightLines(breakdown: ScoreLine[], max = MAX_REASON_LINES): ScoreLine[] {
  const positives = breakdown.filter((l) => l.points > 0);
  const presence = positives.filter((l) => l.group === 'presence');
  const autres = positives
    .filter((l) => l.group !== 'presence')
    .sort((a, b) => b.points - a.points);
  return [...presence, ...autres].slice(0, max);
}

/**
 * Statuts qui prouvent qu'un échange a réellement eu lieu.
 *
 * `a_contacter` en est exclu : c'est une intention, pas un contact. L'y
 * inclure gonflerait le seul indicateur qui mesure l'activité réelle, et le
 * ferait au moment précis où l'on cherche à savoir si la prospection a
 * démarré.
 */
const STATUTS_CONTACTES = new Set(['contacte', 'relance', 'interesse', 'gagne', 'perdu']);

export interface Kpis {
  inBase: number;
  /**
   * Prospects portant un `prospect_score`.
   *
   * Cet indicateur remplace le taux de réponse du §9.2, qui n'est pas
   * mesurable : `interaction` enregistre le canal d'un échange, jamais son
   * sens, et le numérateur d'un taux de réponse n'existe donc pas dans le
   * schéma. Une tuile inerte à demeure valait moins que le seul chiffre qui
   * dise où en est vraiment la base : 25 sur 139 au 1er septembre 2026.
   */
  qualified: number;
  contacted: number;
  interested: number;
}

/**
 * La bande d'indicateurs du §9.2.
 *
 * Dérivée du même instantané que les listes, donc toujours cohérente avec
 * elles. La spec annonçait que ces chiffres seraient proches de zéro les
 * premières semaines ; ils y sont, et l'écran l'affiche plutôt que de le
 * maquiller.
 */
export function computeKpis(prospects: ProspectView[]): Kpis {
  let qualified = 0;
  let contacted = 0;
  let interested = 0;
  for (const p of prospects) {
    if (p.score !== null) qualified += 1;
    if (p.pipeline === null) continue;
    if (STATUTS_CONTACTES.has(p.pipeline.status)) contacted += 1;
    if (p.pipeline.status === 'interesse') interested += 1;
  }
  return { inBase: prospects.length, qualified, contacted, interested };
}

export interface TodayLists {
  followUps: WorkList;
  newHighScore: WorkList;
}

function liste(rows: WorkRow[]): WorkList {
  return { items: rows.slice(0, MAX_ROWS_PER_LIST), totalCount: rows.length };
}

function estClos(prospect: ProspectView): boolean {
  return prospect.pipeline !== null && STATUTS_CLOS.has(prospect.pipeline.status);
}

/**
 * Compose les deux listes de travail du §9.2.
 *
 * Les prospects sans score n'y figurent pas. Ils sont pourtant les quatre
 * cinquièmes de la base, et ce n'est pas un oubli : une ligne sans score
 * n'offre aucune action, et douze d'entre elles en tête d'écran coûteraient
 * douze arrêts aux flèches pour rien. Ce qui compte de ces prospects, c'est
 * leur *nombre* — porté par l'indicateur « qualifiés », qui met l'écart 25 /
 * 139 sous les yeux. Leur parcours relèvera de l'écran Exploration.
 */
export function buildToday(prospects: ProspectView[], now: Date): TodayLists {
  const followUps: Array<WorkRow & { echeance: number | null }> = [];
  const newHighScore: WorkRow[] = [];

  for (const prospect of prospects) {
    if (estClos(prospect)) continue;

    const pipeline = prospect.pipeline;
    const echeanceDue =
      pipeline !== null &&
      (pipeline.nextActionAt === null ||
        joursCivils(new Date(pipeline.nextActionAt), now) >= 0) &&
      !STATUTS_NON_ENGAGES.has(pipeline.status);

    if (echeanceDue) {
      const raison = followUpReason(pipeline.nextActionAt, now);
      followUps.push({
        prospect,
        reason: [{ kind: 'key', key: raison.key, params: raison.params }],
        // Les relances sans date passent après les échéances datées : elles
        // n'ont pas d'ancienneté à comparer, et les faire remonter en tête
        // reléguerait des engagements réellement en retard.
        echeance: pipeline.nextActionAt === null ? null : new Date(pipeline.nextActionAt).getTime(),
      });
      continue;
    }

    const jamaisEngage = pipeline === null || STATUTS_NON_ENGAGES.has(pipeline.status);

    if (prospect.score !== null && jamaisEngage) {
      newHighScore.push({ prospect, reason: reasonForScore(prospect) });
    }
  }

  followUps.sort((a, b) => {
    if (a.echeance === null) return b.echeance === null ? 0 : 1;
    if (b.echeance === null) return -1;
    return a.echeance - b.echeance;
  });

  newHighScore.sort((a, b) => (b.prospect.score?.total ?? 0) - (a.prospect.score?.total ?? 0));

  return {
    followUps: liste(followUps.map(({ prospect, reason }) => ({ prospect, reason }))),
    newHighScore: liste(newHighScore),
  };
}

/**
 * La raison d'un prospect scoré : sa catégorie de présence, puis ses meilleurs
 * signaux.
 *
 * La catégorie est reprise de `web_presence` quand elle existe, et non du
 * libellé stocké dans le barème : elle est alors une valeur d'énumération,
 * donc traduisible, là où le libellé du barème est du texte figé en français.
 */
function reasonForScore(prospect: ProspectView): ReasonFragment[] {
  const lignes = highlightLines(prospect.score?.breakdown ?? []);
  const categorie = prospect.presence?.category ?? null;

  const fragments = lignes.map((ligne): ReasonFragment => {
    if (ligne.group === 'presence' && categorie !== null) {
      return { kind: 'key', key: `presence.${categorie}` };
    }
    return { kind: 'raw', text: ligne.label };
  });

  // Un score sans aucune ligne positive existe : `has_site` vaut −100 et rien
  // ne le compense. La ligne reste dans la file avec sa catégorie pour seule
  // raison, plutôt qu'avec une raison vide.
  if (fragments.length === 0 && categorie !== null) {
    return [{ kind: 'key', key: `presence.${categorie}` }];
  }
  return fragments;
}
