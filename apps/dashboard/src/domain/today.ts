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
 * Les étages de qualification qui manquent encore, dans l'ordre du pipeline.
 *
 * C'est la raison d'être de la troisième liste. Sans elle, 114 prospects sur
 * 139 n'apparaîtraient nulle part : ni relance, ni score, donc invisibles —
 * et l'écran laisserait croire que la base compte vingt-cinq entreprises.
 */
export function qualificationGaps(prospect: ProspectView): TranslationKey[] {
  const manques: TranslationKey[] = [];
  if (prospect.enrichment === null) manques.push('today.reason.missing.enrichment');
  if (prospect.presence === null) manques.push('today.reason.missing.presence');
  if (prospect.score === null) manques.push('today.reason.missing.score');
  return manques;
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

export type Measure =
  | { known: true; value: number }
  | { known: false; reason: TranslationKey };

/**
 * Taux de réponse — indisponible aujourd'hui, et pour deux raisons distinctes.
 *
 * La première est conjoncturelle : sans prospect contacté, le dénominateur est
 * nul. « 0 % » se lirait comme un échec commercial là où il n'y a simplement
 * pas encore eu de prospection.
 *
 * La seconde est structurelle : `interaction` porte un type d'échange
 * (appel / whatsapp / email / note) mais pas son sens. Rien dans le schéma ne
 * distingue un appel passé d'un appel reçu, donc le numérateur n'est pas
 * mesurable — d'où `replied: null`, qui est une absence de mesure et non un
 * zéro de mesure.
 */
export function responseRate(input: { contacted: number; replied: number | null }): Measure {
  if (input.replied === null) {
    return { known: false, reason: 'today.kpi.unavailable.notModelled' };
  }
  if (input.contacted <= 0) {
    return { known: false, reason: 'today.kpi.unavailable.noPipeline' };
  }
  return { known: true, value: input.replied / input.contacted };
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
  contacted: number;
  interested: number;
  responseRate: Measure;
}

/**
 * La bande d'indicateurs du §9.2, dérivée du même instantané que les listes.
 *
 * Les trois premiers comptent des lignes réelles. Le quatrième reste
 * indisponible : voir `responseRate`. La spec annonçait que ces chiffres
 * seraient proches de zéro les premières semaines ; ils y sont, et l'écran le
 * dit plutôt que de le maquiller.
 */
export function computeKpis(prospects: ProspectView[]): Kpis {
  let contacted = 0;
  let interested = 0;
  for (const p of prospects) {
    if (p.pipeline === null) continue;
    if (STATUTS_CONTACTES.has(p.pipeline.status)) contacted += 1;
    if (p.pipeline.status === 'interesse') interested += 1;
  }
  return {
    inBase: prospects.length,
    contacted,
    interested,
    // `replied: null` et non `0` : le schéma ne permet pas de compter les
    // réponses, ce qui n'est pas la même chose que n'en avoir reçu aucune.
    responseRate: responseRate({ contacted, replied: null }),
  };
}

export interface TodayLists {
  followUps: WorkList;
  newHighScore: WorkList;
  awaiting: WorkList;
}

function liste(rows: WorkRow[]): WorkList {
  return { items: rows.slice(0, MAX_ROWS_PER_LIST), totalCount: rows.length };
}

function estClos(prospect: ProspectView): boolean {
  return prospect.pipeline !== null && STATUTS_CLOS.has(prospect.pipeline.status);
}

/**
 * Compose les trois listes de l'écran « Aujourd'hui ».
 *
 * Les deux premières sont celles du §9.2. La troisième ne figure pas dans la
 * spec et la complète pour une raison factuelle : sur la base réelle, les
 * quatre cinquièmes des prospects n'ont aucun score, et un écran bâti sur les
 * deux seules premières listes serait vide à 80 % sans jamais dire pourquoi.
 * Montrer ces prospects avec leur étape manquante rend l'état d'avancement du
 * pipeline lisible depuis l'écran d'ouverture.
 */
export function buildToday(prospects: ProspectView[], now: Date): TodayLists {
  const followUps: Array<WorkRow & { echeance: number | null }> = [];
  const newHighScore: WorkRow[] = [];
  const awaiting: WorkRow[] = [];

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
      continue;
    }

    if (prospect.score === null && jamaisEngage) {
      awaiting.push({
        prospect,
        reason: qualificationGaps(prospect).map((key) => ({ kind: 'key', key })),
      });
    }
  }

  followUps.sort((a, b) => {
    if (a.echeance === null) return b.echeance === null ? 0 : 1;
    if (b.echeance === null) return -1;
    return a.echeance - b.echeance;
  });

  newHighScore.sort((a, b) => (b.prospect.score?.total ?? 0) - (a.prospect.score?.total ?? 0));

  awaiting.sort(
    (a, b) =>
      new Date(a.prospect.discoveredAt).getTime() - new Date(b.prospect.discoveredAt).getTime(),
  );

  return {
    followUps: liste(followUps.map(({ prospect, reason }) => ({ prospect, reason }))),
    newHighScore: liste(newHighScore),
    awaiting: liste(awaiting),
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
