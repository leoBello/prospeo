import { describe, expect, it, vi } from 'vitest';
import { decideReconciliation, runReconcile } from './reconcile.js';

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
    });
    expect(remove).not.toHaveBeenCalled();
  });
});
