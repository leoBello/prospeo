import { describe, expect, it, vi } from 'vitest';
import {
  decideReconciliation,
  isDeletionWaveSuspect,
  MIN_REQUEST_INTERVAL_MS,
  runReconcile,
  type ReconcileProspect,
  type SireneStatus,
} from './reconcile.js';

/** Cadence neutralisée : aucun test ne doit attendre réellement. */
const noWait = async (): Promise<void> => undefined;

function makeProspects(count: number): ReconcileProspect[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    siret: String(index + 1),
  }));
}

describe('decideReconciliation', () => {
  it('conserve un établissement actif et diffusible', () => {
    expect(decideReconciliation({ kind: 'active' })).toBe('keep');
  });

  it('clôt un établissement cessé sans le supprimer', () => {
    // La cessation n'est pas un motif juridique de suppression, et
    // l'historique de prospection garde sa valeur.
    expect(decideReconciliation({ kind: 'closed' })).toBe('close');
  });

  it('supprime un établissement non diffusible', () => {
    expect(decideReconciliation({ kind: 'undiffusible' })).toBe('delete');
  });

  it('supprime un SIRET devenu absent de l API', () => {
    // Absent et non diffusible sont indiscernables de l'extérieur ; on
    // retient l'hypothèse qui respecte l'obligation de conservation.
    expect(decideReconciliation({ kind: 'absent' })).toBe('delete');
  });
});

describe('isDeletionWaveSuspect', () => {
  it('exige le plancher absolu ET le taux', () => {
    // Quatre suppressions sur quatre décisions : taux maximal, plancher non
    // atteint. Une base minuscule ne doit pas bloquer sur son propre ménage.
    expect(isDeletionWaveSuspect(4, 4)).toBe(false);
    // Cinq sur dix : les deux conditions sont réunies.
    expect(isDeletionWaveSuspect(5, 10)).toBe(true);
    // Cinq sur cinquante : plancher atteint, mais 10 % pile n'est pas un
    // dépassement — c'est le taux de renouvellement ordinaire.
    expect(isDeletionWaveSuspect(5, 50)).toBe(false);
    expect(isDeletionWaveSuspect(6, 50)).toBe(true);
  });

  it('ne se déclenche pas sans suppression', () => {
    expect(isDeletionWaveSuspect(0, 0)).toBe(false);
  });
});

describe('runReconcile', () => {
  it('applique une action par prospect', async () => {
    const remove = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const touch = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: [
        { id: 'p1', siret: '1' },
        { id: 'p2', siret: '2' },
        { id: 'p3', siret: '3' },
      ],
      fetchStatus: async (siret) =>
        siret === '1' ? { kind: 'active' } : siret === '2' ? { kind: 'closed' } : { kind: 'absent' },
      remove,
      close,
      touch,
      wait: noWait,
    });

    expect(report).toMatchObject({ kept: 1, closed: 1, deleted: 1, failed: 0 });
    expect(remove).toHaveBeenCalledWith('p3');
    expect(close).toHaveBeenCalledWith('p2');
  });

  it('poursuit malgré un échec réseau isolé', async () => {
    const report = await runReconcile({
      prospects: [
        { id: 'p1', siret: '1' },
        { id: 'p2', siret: '2' },
      ],
      fetchStatus: async (siret) => {
        if (siret === '1') throw new Error('réseau');
        return { kind: 'active' };
      },
      remove: async () => undefined,
      close: async () => undefined,
      touch: async () => undefined,
      wait: noWait,
    });
    expect(report.failed).toBe(1);
    expect(report.kept).toBe(1);
  });

  it('ne supprime rien sur une erreur réseau', async () => {
    const remove = vi.fn(async () => undefined);
    await runReconcile({
      prospects: [{ id: 'p1', siret: '1' }],
      fetchStatus: async () => {
        throw new Error('réseau');
      },
      remove,
      close: async () => undefined,
      touch: async () => undefined,
      wait: noWait,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('espace les requêtes de l intervalle minimal', async () => {
    const waits: number[] = [];
    await runReconcile({
      prospects: makeProspects(3),
      fetchStatus: async () => ({ kind: 'active' }),
      remove: async () => undefined,
      close: async () => undefined,
      touch: async () => undefined,
      wait: async (ms) => {
        waits.push(ms);
      },
    });

    // La première requête part sans attendre ; les deux suivantes patientent.
    expect(waits).toHaveLength(2);
    for (const ms of waits) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(MIN_REQUEST_INTERVAL_MS);
    }
  });
});

describe('runReconcile — garde-fou anti-suppression massive', () => {
  /** Quinze absents, trois actifs, deux cessés. */
  function statusOfFifteenAbsent(siret: string): SireneStatus {
    const index = Number(siret) - 1;
    if (index < 15) return { kind: 'absent' };
    if (index < 18) return { kind: 'active' };
    return { kind: 'closed' };
  }

  it('refuse une vague de suppressions mais applique fermetures et horodatages', async () => {
    const remove = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const touch = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) => statusOfFifteenAbsent(siret),
      remove,
      close,
      touch,
      wait: noWait,
    });

    // Aucune suppression exécutée : c'est la seule opération irréversible.
    expect(remove).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
    expect(report.refusedDeletions).toBe(15);

    // Le reste du travail est appliqué : réversible et sans cascade.
    expect(close).toHaveBeenCalledTimes(2);
    expect(touch).toHaveBeenCalledTimes(5);
    expect(report).toMatchObject({ kept: 3, closed: 2, failed: 0 });
  });

  it('exécute la même vague sous force', async () => {
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) => statusOfFifteenAbsent(siret),
      remove,
      close: async () => undefined,
      touch: async () => undefined,
      force: true,
      wait: noWait,
    });

    expect(remove).toHaveBeenCalledTimes(15);
    expect(report.deleted).toBe(15);
    expect(report.refusedDeletions).toBe(0);
  });

  it('laisse passer deux suppressions sur vingt décisions', async () => {
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) =>
        Number(siret) <= 2 ? { kind: 'absent' } : { kind: 'active' },
      remove,
      close: async () => undefined,
      touch: async () => undefined,
      wait: noWait,
    });

    expect(remove).toHaveBeenCalledTimes(2);
    expect(report.deleted).toBe(2);
    expect(report.refusedDeletions).toBe(0);
  });

  it('laisse passer trois suppressions sur six : le taux dépasse, pas le plancher', async () => {
    // 50 % de suppressions, très au-dessus des 10 % — mais trois suppressions
    // sur une base de six ne ressemblent pas à une panne d'API, et bloquer ici
    // rendrait le garde-fou inutilisable sur les petits périmètres.
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(6),
      fetchStatus: async (siret) =>
        Number(siret) <= 3 ? { kind: 'absent' } : { kind: 'active' },
      remove,
      close: async () => undefined,
      touch: async () => undefined,
      wait: noWait,
    });

    expect(remove).toHaveBeenCalledTimes(3);
    expect(report.deleted).toBe(3);
    expect(report.refusedDeletions).toBe(0);
  });

  it('ne compte pas les échecs dans le taux de suppressions', async () => {
    // Une API muette produit des échecs, pas des décisions : elle ne doit ni
    // gonfler le dénominateur ni déclencher le garde-fou par elle-même.
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) => {
        const index = Number(siret);
        if (index <= 14) throw new Error('réseau');
        if (index <= 19) return { kind: 'absent' };
        return { kind: 'active' };
      },
      remove,
      close: async () => undefined,
      touch: async () => undefined,
      wait: noWait,
    });

    // Cinq suppressions sur six décisions : plancher atteint et taux dépassé.
    expect(report.failed).toBe(14);
    expect(report.refusedDeletions).toBe(5);
    expect(remove).not.toHaveBeenCalled();
  });
});
