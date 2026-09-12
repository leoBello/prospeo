import type { TranslationKey, TranslationParams } from '../i18n/translate.js';
import type { ProspectView, WorkList, WorkRow } from './prospect.js';

/**
 * Plafond d'affichage d'une liste de travail.
 *
 * L'écran sert à décider de la prochaine action, pas à parcourir la base :
 * au-delà d'une douzaine de lignes on ne choisit plus, on fait défiler.
 * Le nombre réel reste annoncé dans l'intitulé.
 */
export const MAX_ROWS_PER_LIST = 12;

/**
 * Statuts qui retirent définitivement un prospect des files de travail.
 *
 * `ne_pas_contacter` est une obligation de conformité (§11) : « respecté
 * immédiatement et définitivement ». `gagne` et `perdu` ferment le dossier.
 */
const STATUTS_CLOS = new Set(['ne_pas_contacter', 'gagne', 'perdu']);

/**
 * Statuts qui valent « jamais engagé ».
 *
 * La file des nouveaux, qui s'en servait pour se peupler, a disparu (elle
 * est devenue l'onglet « à contacter » de la table de veille, décision 1A).
 * Cette constante ne sert plus qu'à EXCLURE `a_contacter` de la file des
 * relances ci-dessous : un prospect qu'on n'a encore jamais engagé n'a rien
 * à « relancer ».
 */
const STATUTS_NON_ENGAGES = new Set(['a_contacter']);

export interface FollowUpReason {
  key: TranslationKey;
  params: TranslationParams;
}

/**
 * Nombre de jours civils entre deux instants, en heure locale.
 *
 * Exportée : `domain/deployment.ts` en a besoin pour la péremption des sites
 * (90 jours civils depuis `publishedAt`) et doit compter de la même façon —
 * un site publié hier à 23 h ne doit pas afficher un jour de moins qu'il n'en
 * reste parce qu'un appelant aurait soustrait des millisecondes à la place.
 */
export function joursCivils(de: Date, vers: Date): number {
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
 * Neutralise casse et diacritiques, pour que « nantes » retrouve « NANTES »
 * comme « Nântes » : la dénomination vient de sources externes (INSEE,
 * Google) qui ne garantissent aucune normalisation commune.
 */
function normalise(texte: string): string {
  return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Un prospect correspond-il au texte tapé dans la recherche de la barre du
 * haut ?
 *
 * Comparé à la dénomination et, quand il existe, au nom usuel : c'est ce
 * qu'un opérateur reconnaît en cherchant une fiche précise. Appliqué une
 * seule fois, dans `TodayScreen`, en amont de tout le reste : la bande des
 * relances dues comme la table de veille se composent ensuite du même jeu
 * filtré. Depuis que la table montre TOUTE la base (chantier « veille par
 * onglets »), cette recherche la couvre donc entièrement — ce qui n'était pas
 * le cas quand seules deux listes de douze lignes étaient affichées.
 */
export function matchesQuery(prospect: ProspectView, query: string): boolean {
  const cible = normalise(query.trim());
  if (cible === '') return true;
  return [prospect.denomination, prospect.denominationUsuelle ?? ''].some((texte) =>
    normalise(texte).includes(cible),
  );
}

export interface TodayLists {
  followUps: WorkList;
}

function liste(rows: WorkRow[]): WorkList {
  return { items: rows.slice(0, MAX_ROWS_PER_LIST), totalCount: rows.length };
}

function estClos(prospect: ProspectView): boolean {
  return prospect.pipeline !== null && STATUTS_CLOS.has(prospect.pipeline.status);
}

/**
 * Compose la file des relances dues — ce qui est ÉCHU, et rien d'autre.
 *
 * Elle ne compose plus qu'une liste. La seconde, « Nouveaux prospects à fort
 * score », plafonnait à douze lignes et cachait le reste ; la table de veille
 * (`domain/veille.ts`, `ui/TableVeille.tsx`) la remplace avec toute la base,
 * par onglets de statut et par pages.
 *
 * Ce qui reste ici est ce que la table ne dit pas : une ÉCHÉANCE n'est pas un
 * statut (décision 2A du 2026-09-10). Un prospect relancé figure donc dans
 * cette file ET dans son onglet, et c'est voulu — c'est l'écran qui
 * dédoublonne le parcours clavier (voir `ids`, `screens/TodayScreen.tsx`).
 */
export function buildToday(prospects: ProspectView[], now: Date): TodayLists {
  const followUps: Array<WorkRow & { echeance: number | null }> = [];

  for (const prospect of prospects) {
    if (estClos(prospect)) continue;

    const pipeline = prospect.pipeline;
    const echeanceDue =
      pipeline !== null &&
      (pipeline.nextActionAt === null ||
        joursCivils(new Date(pipeline.nextActionAt), now) >= 0) &&
      !STATUTS_NON_ENGAGES.has(pipeline.status);

    if (!echeanceDue) continue;

    const raison = followUpReason(pipeline.nextActionAt, now);
    followUps.push({
      prospect,
      reason: [{ kind: 'key', key: raison.key, params: raison.params }],
      // Les relances sans date passent après les échéances datées : elles
      // n'ont pas d'ancienneté à comparer, et les faire remonter en tête
      // reléguerait des engagements réellement en retard.
      echeance: pipeline.nextActionAt === null ? null : new Date(pipeline.nextActionAt).getTime(),
    });
  }

  followUps.sort((a, b) => {
    if (a.echeance === null) return b.echeance === null ? 0 : 1;
    if (b.echeance === null) return -1;
    return a.echeance - b.echeance;
  });

  return {
    followUps: liste(followUps.map(({ prospect, reason }) => ({ prospect, reason }))),
  };
}
