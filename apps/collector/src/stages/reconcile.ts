export type SireneStatus =
  | { kind: 'active' }
  | { kind: 'closed' }
  | { kind: 'undiffusible' }
  | { kind: 'absent' };

export type ReconcileAction = 'keep' | 'close' | 'delete';

/**
 * Un établissement absent de l'API et un établissement non diffusible sont
 * indiscernables de l'extérieur — l'API cesse de renvoyer les deux. On retient
 * l'hypothèse qui respecte l'obligation de conservation.
 *
 * Les quatre statuts sont écrits un par un et le `default` ne décide de rien :
 * il affecte le statut à un `never` et lève. Un `default: return 'delete'`
 * ferait pencher toute variante ajoutée plus tard à `SireneStatus` du côté de
 * la seule opération irréversible du projet, silencieusement et à l'exécution.
 * Ici, la variante oubliée échoue à la compilation.
 */
export function decideReconciliation(status: SireneStatus): ReconcileAction {
  switch (status.kind) {
    case 'active':
      return 'keep';
    case 'closed':
      return 'close';
    case 'undiffusible':
    case 'absent':
      return 'delete';
    default: {
      const inattendu: never = status;
      throw new Error(`reconcile : statut Sirene inconnu — ${JSON.stringify(inattendu)}`);
    }
  }
}

export interface ReconcileProspect {
  id: string;
  siret: string;
}

/** Décisions du premier temps, avant qu'une seule écriture ait eu lieu. */
export interface ReconcileDecisionCounts {
  keep: number;
  close: number;
  delete: number;
}

export interface ReconcileReport {
  /**
   * Ce que le run a **décidé**, indépendamment de ce qu'il a écrit. C'est ce
   * décompte que `--dry-run` affiche, et c'est lui qui distingue « rien à
   * faire » de « rien n'a pu être lu ».
   */
  decided: ReconcileDecisionCounts;
  kept: number;
  closed: number;
  deleted: number;
  /**
   * L'API n'a pas répondu : aucune décision n'a été prise sur ce prospect, et
   * son état reste celui du run précédent.
   */
  failedReads: number;
  /**
   * La décision était prise, l'écriture a échoué. Population disjointe de la
   * précédente : les additionner sous un seul `failed` faisait compter deux
   * fois le même prospect, une fois dans `kept` et une fois dans `failed`.
   */
  failedWrites: number;
  /**
   * Suppressions décidées puis refusées par le garde-fou. Non nul veut dire
   * que le run a délibérément laissé du travail en plan : l'appelant doit le
   * traiter comme un échec, pas comme un succès partiel.
   */
  refusedDeletions: number;
}

/** Part des décisions au-delà de laquelle une vague de suppressions est suspecte. */
export const DELETION_RATE_THRESHOLD = 0.1;

/**
 * Plancher en valeur absolue. Sans lui, le taux seul bloquerait des runs
 * minuscules et parfaitement légitimes : sur six prospects, une seule
 * suppression pèse déjà 17 %.
 */
export const DELETION_FLOOR = 5;

/**
 * Le garde-fou. La suppression est la **seule** opération irréversible du
 * projet : elle emporte en cascade les enrichissements, les scores, le suivi
 * et l'historique d'un prospect, et rien ne permet de les reconstruire.
 *
 * Le `catch` de `runReconcile` couvre les erreurs réseau et les codes HTTP
 * non-2xx, mais pas le scénario le plus destructeur : une API qui répondrait
 * correctement `200` en ne trouvant plus rien. Chaque SIRET serait alors lu
 * `absent`, donc supprimé, et la base entière partirait en une seule passe.
 *
 * D'où l'asymétrie assumée des coûts : un garde-fou qui se déclenche à tort
 * coûte un run à relancer avec `--force-deletions` ; une base perdue coûte
 * tout le reste. On refuse donc le doute plutôt que de l'arbitrer.
 *
 * Deux motifs indépendants :
 *
 * 1. **Toutes les décisions sont des suppressions.** Le plancher et le taux
 *    seuls laissaient une base de quatre prospects disparaître en entier sans
 *    un mot : quatre suppressions n'atteignent pas le plancher, quel que soit
 *    le taux. L'asymétrie est assumée dans l'autre sens ici — sur une base
 *    minuscule, une radiation légitime demandera une dérogation — mais 100 %
 *    des décisions en suppression n'est jamais un renouvellement ordinaire :
 *    c'est la signature d'une API qui ne trouve plus rien.
 * 2. **Le plancher et le taux, cumulés.** Un taux élevé sur trois suppressions
 *    n'est pas une panne d'API, c'est une petite base. Le taux se lit
 *    strictement au-dessus du seuil (10 % pile reste normal) et le plancher se
 *    lit atteint (cinq suppressions suffisent à ouvrir le doute).
 */
export function isDeletionWaveSuspect(deletions: number, decisions: number): boolean {
  return (
    (deletions === decisions && decisions > 0) ||
    (deletions >= DELETION_FLOOR && deletions > decisions * DELETION_RATE_THRESHOLD)
  );
}

/**
 * Intervalle minimal entre deux appels à l'API, mesuré depuis l'**envoi** de
 * la requête précédente. L'API publique tolère environ sept requêtes par
 * seconde et par adresse ; 150 ms plafonnent juste en dessous. La boucle est
 * séquentielle, mais séquentiel ne veut pas dire lent : sur des réponses de
 * quelques millisecondes, quelques centaines de SIRET partiraient bien
 * au-dessus de la limite.
 *
 * La cadence vit dans l'étage et non dans la source : `fetchStatusBySiret`
 * reste une fonction pure d'accès, et le rythme d'un run est une décision de
 * l'étage qui l'orchestre.
 */
export const MIN_REQUEST_INTERVAL_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RunReconcileOptions {
  prospects: readonly ReconcileProspect[];
  fetchStatus: (siret: string) => Promise<SireneStatus>;
  remove: (prospectId: string) => Promise<void>;
  /**
   * Pose **et retire** le drapeau de cessation, en une seule écriture avec
   * l'horodatage de vérification.
   *
   * Il est appelé sur `keep` comme sur `close`, et ce n'est pas une symétrie
   * décorative : tant que seul `true` était écrit, une cessation enregistrée
   * par erreur restait vraie pour toujours. L'entreprise faisait corriger sa
   * fiche Sirene, l'API la rendait de nouveau active, et le barème continuait
   * de rendre 0 avec le disqualifiant « fermée » — sans que rien, ni ici ni
   * dans `discover` dont l'upsert ne porte pas la colonne, ne puisse le
   * rattraper.
   */
  setClosed: (prospectId: string, closed: boolean) => Promise<void>;
  /**
   * Nombre **exact** de suppressions que l'opérateur déclare avoir constaté.
   *
   * Ce n'est pas un plafond : la dérogation ne couvre la vague que si le
   * compte décidé lui est rigoureusement égal, et tout écart — au-dessus comme
   * en dessous — rend la main au garde-fou. Un plafond généreux se colle une
   * fois dans une tâche planifiée et ne protège plus jamais : `999999`
   * désarmait la protection pour toujours, exactement comme le drapeau nu
   * qu'il remplaçait. Un nombre exact oblige à avoir regardé, et devient faux
   * dès que la situation change.
   *
   * Le nombre à déclarer se lit avec `dryRun`, qui décide sans écrire.
   *
   * `undefined` signifie « aucune dérogation », qui est le défaut.
   */
  forcedDeletionBudget?: number;
  /**
   * S'arrête après avoir décidé, avant toute écriture. Sert à obtenir le
   * décompte par action sans rien engager.
   */
  dryRun?: boolean;
  /** Injecté dans les tests, pour ne pas attendre réellement. */
  wait?: (ms: number) => Promise<void>;
}

interface ReconcileDecision {
  prospect: ReconcileProspect;
  action: ReconcileAction;
}

/**
 * Deux temps strictement séparés : on décide de tout avant d'écrire quoi que
 * ce soit. Décider et appliquer dans la même boucle rendait le garde-fou
 * impossible — quand la centième suppression révèle l'anomalie, les
 * quatre-vingt-dix-neuf premières sont déjà parties.
 */
export async function runReconcile(options: RunReconcileOptions): Promise<ReconcileReport> {
  const report: ReconcileReport = {
    decided: { keep: 0, close: 0, delete: 0 },
    kept: 0,
    closed: 0,
    deleted: 0,
    failedReads: 0,
    failedWrites: 0,
    refusedDeletions: 0,
  };
  const wait = options.wait ?? sleep;

  // ── Premier temps : décider, sans rien écrire. ──
  const decisions: ReconcileDecision[] = [];
  // Zéro laisse passer la première requête sans attente : `Date.now()` en est
  // très loin, l'intervalle est donc déjà écoulé.
  let lastRequestAt = 0;

  for (const prospect of options.prospects) {
    const remaining = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (remaining > 0) await wait(remaining);
    // Horodaté avant l'envoi, pas après la réponse : c'est la cadence des
    // départs que l'API compte, et une réponse lente ne donne aucun droit à
    // repartir aussitôt.
    lastRequestAt = Date.now();

    try {
      const status = await options.fetchStatus(prospect.siret);
      const action = decideReconciliation(status);
      decisions.push({ prospect, action });
      report.decided[action] += 1;
    } catch (error) {
      // Une erreur réseau ne doit jamais provoquer de suppression : elle est
      // indiscernable d'une absence, et la suppression est irréversible. Elle
      // ne produit donc aucune décision — ni ici, ni au compte des
      // suppressions qui alimente le garde-fou.
      report.failedReads += 1;
      process.stderr.write(
        `reconcile: échec de lecture sur ${prospect.siret} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  // Un run qui n'a rien pu décider n'est pas un run sans travail : c'est un run
  // aveugle. L'étage n'ayant pas de prédicat de fraîcheur, personne ne
  // remarquerait qu'il ne vérifie plus rien — une nuit entière de « 429 »
  // rendrait un rapport vide, et un succès.
  if (options.prospects.length > 0 && decisions.length === 0) {
    process.stderr.write(
      `reconcile: aucune décision prise sur ${options.prospects.length} prospects — ` +
        "l'API n'a répondu pour aucun SIRET. Rien n'a été vérifié : ce run ne vaut pas " +
        'contrôle de non-conservation.\n',
    );
  }

  if (options.dryRun === true) {
    process.stderr.write(
      `reconcile: --dry-run, aucune écriture — ${report.decided.keep} à conserver, ` +
        `${report.decided.close} à clore, ${report.decided.delete} à supprimer.\n`,
    );
    return report;
  }

  // ── Deuxième temps : contrôler, puis appliquer. ──
  const deletions = report.decided.delete;
  const budget = options.forcedDeletionBudget;
  // Deux régimes qui ne se mélangent pas. Sans budget déclaré, le garde-fou
  // arbitre. Avec un budget, il n'arbitre plus rien : le nombre déclaré est un
  // plafond dur, et la règle se lit d'une phrase — avec `--force-deletions n`,
  // il part exactement n suppressions, ou aucune. Tant que le budget n'était
  // consulté qu'au déclenchement du garde-fou, en passer un plus petit ne
  // protégeait de rien : quatre suppressions partaient sous un budget d'une.
  const guardTripped =
    budget === undefined ? isDeletionWaveSuspect(deletions, decisions.length) : deletions !== budget;

  if (guardTripped) {
    report.refusedDeletions = deletions;
    if (budget === undefined) {
      process.stderr.write(
        `reconcile: garde-fou déclenché — ${deletions} suppressions sur ${decisions.length} ` +
          "décisions, aucune n'est exécutée. Vérifier l'API, relancer avec --dry-run, puis " +
          '--force-deletions <nombre exact constaté> si la vague est légitime.\n',
      );
    } else {
      process.stderr.write(
        `reconcile: budget non tenu — ${deletions} suppressions décidées contre ${budget} ` +
          "déclarées par --force-deletions, aucune n'est exécutée. La dérogation couvre le " +
          'nombre exact constaté, jamais un plafond : relancer --dry-run pour le relever.\n',
      );
    }
  }

  for (const decision of decisions) {
    try {
      if (decision.action === 'delete') {
        // Suppression refusée : le prospect n'est pas horodaté non plus.
        // `reconciled_at` dit « vérifié et traité » ; le poser sur une décision
        // qu'on vient de laisser en suspens masquerait le travail restant.
        if (guardTripped) continue;
        await options.remove(decision.prospect.id);
        report.deleted += 1;
        continue;
      }
      // Drapeau de cessation et horodatage partent ensemble, en une écriture,
      // y compris sous garde-fou : ils sont réversibles, sans effet de cascade,
      // et rien ne justifie de perdre le travail de lecture déjà fait.
      await options.setClosed(decision.prospect.id, decision.action === 'close');
      // Les compteurs ne montent qu'après une écriture réussie. Les incrémenter
      // avant faisait compter un prospect deux fois — conservé *et* en échec —
      // et rendait la ligne de compte-rendu arithmétiquement fausse.
      if (decision.action === 'close') report.closed += 1;
      else report.kept += 1;
    } catch (error) {
      report.failedWrites += 1;
      process.stderr.write(
        `reconcile: échec d'écriture sur ${decision.prospect.siret} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return report;
}

/**
 * Code de sortie du run. Isolé ici parce que c'est une règle, pas de
 * l'affichage : une tâche planifiée ne lit pas stderr, elle lit ce nombre.
 *
 * Deux motifs d'échec, et le premier est le moins visible : un run qui n'a rien
 * pu décider alors qu'il avait des prospects à traiter n'a rien vérifié du
 * tout, et l'obligation de non-conservation cesse d'être remplie sans que rien
 * n'échoue.
 */
export function reconcileExitCode(report: ReconcileReport, prospectCount: number): number {
  const decisions = report.decided.keep + report.decided.close + report.decided.delete;
  if (prospectCount > 0 && decisions === 0) return 1;
  if (report.refusedDeletions > 0) return 1;
  // Un run qui a tout décidé sans rien écrire n'a pas plus vérifié qu'un run
  // qui n'a rien décidé : les cessations ne sont pas enregistrées, `is_closed`
  // et `reconciled_at` restent au passage précédent, et le barème continuera
  // de bien classer des entreprises fermées. La tâche planifiée doit le voir.
  if (report.failedWrites > 0) return 1;
  return 0;
}
