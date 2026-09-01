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
 */
export function decideReconciliation(status: SireneStatus): ReconcileAction {
  switch (status.kind) {
    case 'active':
      return 'keep';
    case 'closed':
      return 'close';
    default:
      return 'delete';
  }
}

export interface ReconcileProspect {
  id: string;
  siret: string;
}

export interface ReconcileReport {
  kept: number;
  closed: number;
  deleted: number;
  failed: number;
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
 * Les deux conditions se cumulent — un taux élevé sur trois suppressions n'est
 * pas une panne d'API, c'est une petite base. Le taux se lit strictement
 * au-dessus du seuil (10 % pile reste normal) et le plancher se lit atteint
 * (cinq suppressions suffisent à ouvrir le doute).
 */
export function isDeletionWaveSuspect(deletions: number, decisions: number): boolean {
  return deletions >= DELETION_FLOOR && deletions > decisions * DELETION_RATE_THRESHOLD;
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
  close: (prospectId: string) => Promise<void>;
  touch: (prospectId: string) => Promise<void>;
  /**
   * Passe outre le garde-fou anti-suppression massive. Réservé à l'opérateur
   * qui a vérifié que la vague est légitime — jamais un défaut.
   */
  force?: boolean;
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
    kept: 0,
    closed: 0,
    deleted: 0,
    failed: 0,
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
      decisions.push({ prospect, action: decideReconciliation(status) });
    } catch (error) {
      // Une erreur réseau ne doit jamais provoquer de suppression : elle est
      // indiscernable d'une absence, et la suppression est irréversible. Elle
      // ne produit donc aucune décision — ni ici, ni au compte des
      // suppressions qui alimente le garde-fou.
      report.failed += 1;
      process.stderr.write(
        `reconcile: échec sur ${prospect.siret} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  // ── Deuxième temps : contrôler, puis appliquer. ──
  const deletions = decisions.filter((decision) => decision.action === 'delete').length;
  const guardTripped = options.force !== true && isDeletionWaveSuspect(deletions, decisions.length);

  if (guardTripped) {
    report.refusedDeletions = deletions;
    process.stderr.write(
      `reconcile: garde-fou déclenché — ${deletions} suppressions sur ${decisions.length} ` +
        "décisions, aucune n'est exécutée. Vérifier l'API, puis relancer avec " +
        '--force-deletions si la vague est légitime.\n',
    );
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
      // Fermetures et horodatages s'appliquent même sous garde-fou : ils sont
      // réversibles, sans effet de cascade, et rien ne justifie de perdre le
      // travail de lecture déjà fait.
      if (decision.action === 'close') {
        await options.close(decision.prospect.id);
        report.closed += 1;
      } else {
        report.kept += 1;
      }
      await options.touch(decision.prospect.id);
    } catch (error) {
      report.failed += 1;
      process.stderr.write(
        `reconcile: échec sur ${decision.prospect.siret} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return report;
}
