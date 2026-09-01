import { describe, expect, it, vi } from 'vitest';
import {
  decideReconciliation,
  isDeletionWaveSuspect,
  MIN_REQUEST_INTERVAL_MS,
  reconcileExitCode,
  runReconcile,
  type ReconcileProspect,
  type ReconcileReport,
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

  it('lève sur un statut inconnu plutôt que de supprimer par défaut', () => {
    // Le garde-fou de compilation ne couvre que ce que le compilateur voit.
    // À l'exécution, une variante non prévue doit faire du bruit, jamais
    // tomber sur la seule opération irréversible du projet.
    const inconnu = { kind: 'radié' } as unknown as SireneStatus;
    expect(() => decideReconciliation(inconnu)).toThrow(/statut Sirene inconnu/);
  });
});

describe('isDeletionWaveSuspect', () => {
  it('déclenche quand toutes les décisions sont des suppressions', () => {
    // Quatre suppressions sur quatre décisions : le plancher de 5 n'est pas
    // atteint, mais une base entière qui disparaît n'est jamais un
    // renouvellement ordinaire. Sans cette condition, une base de quatre
    // prospects n'était protégée par rien.
    expect(isDeletionWaveSuspect(4, 4)).toBe(true);
    expect(isDeletionWaveSuspect(1, 1)).toBe(true);
  });

  it('exige le plancher absolu ET le taux quand la vague est partielle', () => {
    // Quatre suppressions sur cinq décisions : taux très au-dessus du seuil,
    // plancher non atteint, et il reste un prospect. Une base minuscule ne
    // doit pas bloquer sur son propre ménage.
    expect(isDeletionWaveSuspect(4, 5)).toBe(false);
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
    const setClosed = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: [
        { id: 'p1', siret: '1' },
        { id: 'p2', siret: '2' },
        { id: 'p3', siret: '3' },
      ],
      fetchStatus: async (siret) =>
        siret === '1' ? { kind: 'active' } : siret === '2' ? { kind: 'closed' } : { kind: 'absent' },
      remove,
      setClosed,
      wait: noWait,
    });

    expect(report).toMatchObject({
      kept: 1,
      closed: 1,
      deleted: 1,
      failedReads: 0,
      failedWrites: 0,
    });
    expect(remove).toHaveBeenCalledWith('p3');
    expect(setClosed).toHaveBeenCalledWith('p2', true);
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
      setClosed: async () => undefined,
      wait: noWait,
    });
    expect(report.failedReads).toBe(1);
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
      setClosed: async () => undefined,
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
      setClosed: async () => undefined,
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

describe('runReconcile — drapeau de cessation', () => {
  it('retire le drapeau quand l établissement est redevenu actif', async () => {
    // Une cessation enregistrée par erreur puis corrigée dans Sirene : sans
    // écriture sur la branche « conserver », `is_closed` restait vrai pour
    // toujours et le barème rendait 0 avec le disqualifiant « fermée ».
    const setClosed = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: [{ id: 'p1', siret: '1' }],
      fetchStatus: async () => ({ kind: 'active' }),
      remove: async () => undefined,
      setClosed,
      wait: noWait,
    });

    expect(setClosed).toHaveBeenCalledWith('p1', false);
    expect(report.kept).toBe(1);
  });

  it('écrit une seule fois par prospect conservé', async () => {
    // Drapeau et horodatage dans le même `update` : deux allers-retours par
    // prospect conservé n'apportaient rien qu'une écriture de plus.
    const setClosed = vi.fn(async () => undefined);

    await runReconcile({
      prospects: makeProspects(3),
      fetchStatus: async () => ({ kind: 'active' }),
      remove: async () => undefined,
      setClosed,
      wait: noWait,
    });

    expect(setClosed).toHaveBeenCalledTimes(3);
  });
});

describe('runReconcile — comptes séparés des échecs', () => {
  it('ne compte pas un prospect à la fois conservé et en échec', async () => {
    // Vingt prospects actifs dont l'écriture échoue : `kept: 20` et
    // `failed: 20` faisaient quarante lignes pour vingt prospects.
    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async () => ({ kind: 'active' }),
      remove: async () => undefined,
      setClosed: async () => {
        throw new Error('permission denied');
      },
      wait: noWait,
    });

    expect(report.kept).toBe(0);
    expect(report.failedWrites).toBe(20);
    expect(report.failedReads).toBe(0);
    // Les décisions, elles, ont bien été prises : le run n'était pas aveugle.
    expect(report.decided).toEqual({ keep: 20, close: 0, delete: 0 });
  });
});

describe('runReconcile — dry-run', () => {
  it('décide, compte, et n écrit rien', async () => {
    const remove = vi.fn(async () => undefined);
    const setClosed = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) => {
        const index = Number(siret);
        if (index <= 15) return { kind: 'absent' };
        if (index <= 18) return { kind: 'active' };
        return { kind: 'closed' };
      },
      remove,
      setClosed,
      dryRun: true,
      wait: noWait,
    });

    expect(remove).not.toHaveBeenCalled();
    expect(setClosed).not.toHaveBeenCalled();
    // C'est ce décompte que l'opérateur reporte dans `--force-deletions`.
    expect(report.decided).toEqual({ keep: 3, close: 2, delete: 15 });
    expect(report).toMatchObject({ kept: 0, closed: 0, deleted: 0, refusedDeletions: 0 });
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
    const setClosed = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) => statusOfFifteenAbsent(siret),
      remove,
      setClosed,
      wait: noWait,
    });

    // Aucune suppression exécutée : c'est la seule opération irréversible.
    expect(remove).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
    expect(report.refusedDeletions).toBe(15);

    // Le reste du travail est appliqué : réversible et sans cascade.
    expect(setClosed).toHaveBeenCalledTimes(5);
    expect(report).toMatchObject({ kept: 3, closed: 2, failedReads: 0, failedWrites: 0 });
  });

  it('exécute la vague quand le budget déclaré est exactement le sien', async () => {
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) => statusOfFifteenAbsent(siret),
      remove,
      setClosed: async () => undefined,
      forcedDeletionBudget: 15,
      wait: noWait,
    });

    expect(remove).toHaveBeenCalledTimes(15);
    expect(report.deleted).toBe(15);
    expect(report.refusedDeletions).toBe(0);
  });

  it('reprend la main quand la vague dépasse le budget déclaré', async () => {
    // C'est ce qui sépare un garde-fou d'une protection de façade : collée une
    // fois dans une tâche planifiée, une dérogation sans borne ne protégerait
    // plus jamais. Ici l'opérateur a vérifié 3 suppressions, il en survient 15,
    // et le garde-fou reprend la main.
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) => statusOfFifteenAbsent(siret),
      remove,
      setClosed: async () => undefined,
      forcedDeletionBudget: 3,
      wait: noWait,
    });

    expect(remove).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
    expect(report.refusedDeletions).toBe(15);
  });

  it('refuse la vague quand le budget déclaré est plus large que le constat', async () => {
    // Le trou que la dérogation chiffrée prétendait fermer : un plafond
    // confortable collé une fois désarmait la protection à jamais, comme le
    // drapeau nu qu'il remplaçait. Cinquante absents sous un budget de 999999
    // ne partent pas — le nombre déclaré doit être le nombre constaté.
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(50),
      fetchStatus: async () => ({ kind: 'absent' }),
      remove,
      setClosed: async () => undefined,
      forcedDeletionBudget: 999999,
      wait: noWait,
    });

    expect(remove).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
    expect(report.refusedDeletions).toBe(50);
  });

  it('traite le budget comme un plafond dur même sous le seuil du garde-fou', async () => {
    // Quatre suppressions sur vingt décisions : le garde-fou ne se déclenche
    // pas de lui-même, et le budget n'était donc jamais consulté — quatre
    // suppressions partaient sous un budget déclaré à une. Avec l'égalité
    // stricte, il part exactement n suppressions, ou aucune.
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) => (Number(siret) <= 4 ? { kind: 'absent' } : { kind: 'active' }),
      remove,
      setClosed: async () => undefined,
      forcedDeletionBudget: 1,
      wait: noWait,
    });

    expect(remove).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
    expect(report.refusedDeletions).toBe(4);
  });

  it('refuse la disparition intégrale d une base minuscule', async () => {
    // Quatre prospects, tous rendus absents : sous le seul plancher de 5, la
    // base entière disparaissait sans un mot.
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(4),
      fetchStatus: async () => ({ kind: 'absent' }),
      remove,
      setClosed: async () => undefined,
      wait: noWait,
    });

    expect(remove).not.toHaveBeenCalled();
    expect(report.refusedDeletions).toBe(4);
  });

  it('laisse passer deux suppressions sur vingt décisions', async () => {
    const remove = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: makeProspects(20),
      fetchStatus: async (siret) => (Number(siret) <= 2 ? { kind: 'absent' } : { kind: 'active' }),
      remove,
      setClosed: async () => undefined,
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
      fetchStatus: async (siret) => (Number(siret) <= 3 ? { kind: 'absent' } : { kind: 'active' }),
      remove,
      setClosed: async () => undefined,
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
      setClosed: async () => undefined,
      wait: noWait,
    });

    // Cinq suppressions sur six décisions : plancher atteint et taux dépassé.
    expect(report.failedReads).toBe(14);
    expect(report.refusedDeletions).toBe(5);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('reconcileExitCode', () => {
  function report(overrides: Partial<ReconcileReport> = {}): ReconcileReport {
    return {
      decided: { keep: 0, close: 0, delete: 0 },
      kept: 0,
      closed: 0,
      deleted: 0,
      failedReads: 0,
      failedWrites: 0,
      refusedDeletions: 0,
      ...overrides,
    };
  }

  it('sort en échec quand aucune décision n a pu être prise', () => {
    // L'API a répondu « 429 » toute la nuit : le rapport ne porte que des
    // échecs, rien n'a été vérifié, et l'étage n'a pas de prédicat de
    // fraîcheur pour qu'on s'en aperçoive au run suivant.
    expect(reconcileExitCode(report({ failedReads: 500 }), 500)).toBe(1);
  });

  it('sort en succès sur une base vide', () => {
    // Zéro décision pour zéro prospect n'est pas une panne.
    expect(reconcileExitCode(report(), 0)).toBe(0);
  });

  it('sort en échec quand des suppressions ont été refusées', () => {
    const refus = report({ decided: { keep: 5, close: 0, delete: 15 }, refusedDeletions: 15 });
    expect(reconcileExitCode(refus, 20)).toBe(1);
  });

  it('sort en succès sur un run ordinaire', () => {
    const ordinaire = report({ decided: { keep: 19, close: 1, delete: 0 }, kept: 19, closed: 1 });
    expect(reconcileExitCode(ordinaire, 20)).toBe(0);
  });
});

describe('reconcileExitCode — echecs d ecriture', () => {
  const rapport = (over: Partial<ReconcileReport> = {}): ReconcileReport => ({
    decided: { keep: 0, close: 0, delete: 0 },
    kept: 0,
    closed: 0,
    deleted: 0,
    failedReads: 0,
    failedWrites: 0,
    refusedDeletions: 0,
    ...over,
  });

  it('sort en 1 quand tout a ete decide mais rien ecrit', () => {
    // Un run qui a tout decide sans rien ecrire n a pas plus verifie qu un run
    // qui n a rien decide : les cessations ne sont pas enregistrees, et le
    // bareme continuera de bien classer des entreprises fermees.
    expect(
      reconcileExitCode(rapport({ decided: { keep: 17, close: 3, delete: 0 }, failedWrites: 20 }), 20),
    ).toBe(1);
  });

  it('sort en 0 quand tout a ete decide et ecrit', () => {
    expect(
      reconcileExitCode(rapport({ decided: { keep: 20, close: 0, delete: 0 }, kept: 20 }), 20),
    ).toBe(0);
  });
});
