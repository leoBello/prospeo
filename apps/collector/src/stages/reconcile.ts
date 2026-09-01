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
}

export interface RunReconcileOptions {
  prospects: readonly ReconcileProspect[];
  fetchStatus: (siret: string) => Promise<SireneStatus>;
  remove: (prospectId: string) => Promise<void>;
  close: (prospectId: string) => Promise<void>;
  touch: (prospectId: string) => Promise<void>;
}

export async function runReconcile(options: RunReconcileOptions): Promise<ReconcileReport> {
  const report: ReconcileReport = { kept: 0, closed: 0, deleted: 0, failed: 0 };

  for (const prospect of options.prospects) {
    try {
      // Une erreur réseau ne doit jamais provoquer de suppression : elle est
      // indiscernable d'une absence, et la suppression est irréversible.
      const status = await options.fetchStatus(prospect.siret);
      const action = decideReconciliation(status);

      if (action === 'delete') {
        await options.remove(prospect.id);
        report.deleted += 1;
        continue;
      }
      if (action === 'close') {
        await options.close(prospect.id);
        report.closed += 1;
      } else {
        report.kept += 1;
      }
      await options.touch(prospect.id);
    } catch (error) {
      report.failed += 1;
      process.stderr.write(
        `reconcile: échec sur ${prospect.siret} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return report;
}
