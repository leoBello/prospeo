import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { balayer, creerSuiviBackoff, decouvrirEligiblesReel, type SuperviseurDeps } from './superviseur.js';

function deps(surcharges: Partial<SuperviseurDeps> = {}): SuperviseurDeps {
  return {
    decouvrirEligibles: async () => new Set(),
    suivis: () => new Set(),
    demarrer: () => {},
    arreterProprement: () => {},
    tuerSansGrace: () => {},
    dernierBattement: async () => null,
    maintenant: () => new Date('2026-09-05T10:00:00.000Z'),
    ...surcharges,
  };
}

describe('balayer', () => {
  it('demarre un utilisateur eligible non encore suivi', async () => {
    const demarrer = vi.fn();
    await balayer(deps({ decouvrirEligibles: async () => new Set(['u-1']), demarrer }));
    expect(demarrer).toHaveBeenCalledWith('u-1');
  });

  it('ne redemarre pas un utilisateur deja suivi', async () => {
    const demarrer = vi.fn();
    await balayer(
      deps({ decouvrirEligibles: async () => new Set(['u-1']), suivis: () => new Set(['u-1']), demarrer }),
    );
    expect(demarrer).not.toHaveBeenCalled();
  });

  it('arrete proprement un utilisateur suivi devenu inelligible', async () => {
    const arreterProprement = vi.fn();
    await balayer(
      deps({
        decouvrirEligibles: async () => new Set(),
        suivis: () => new Set(['u-1']),
        arreterProprement,
      }),
    );
    expect(arreterProprement).toHaveBeenCalledWith('u-1');
  });

  it('tue sans grace un utilisateur suivi, eligible, dont le battement depasse 90s', async () => {
    const tuerSansGrace = vi.fn();
    await balayer(
      deps({
        decouvrirEligibles: async () => new Set(['u-1']),
        suivis: () => new Set(['u-1']),
        dernierBattement: async () => new Date('2026-09-05T09:58:00.000Z'), // 120s plus tot
        tuerSansGrace,
      }),
    );
    expect(tuerSansGrace).toHaveBeenCalledWith('u-1');
  });

  it('ne tue pas un utilisateur suivi au battement frais', async () => {
    const tuerSansGrace = vi.fn();
    await balayer(
      deps({
        decouvrirEligibles: async () => new Set(['u-1']),
        suivis: () => new Set(['u-1']),
        dernierBattement: async () => new Date('2026-09-05T09:59:30.000Z'), // 30s plus tot
        tuerSansGrace,
      }),
    );
    expect(tuerSansGrace).not.toHaveBeenCalled();
  });

  it('ne tue jamais un utilisateur dont le battement est null — jamais demarre n est pas perime', async () => {
    // LE DEFAUT QUE CE TEST FERME. Juste apres `demarrer()`, un utilisateur
    // est suivi mais n a pas encore ecrit son premier battement : `null` et
    // « perime » sont deux absences de nature differente, et confondre les
    // deux tuerait en boucle un worker sain qui vient a peine de partir.
    const tuerSansGrace = vi.fn();
    await balayer(
      deps({
        decouvrirEligibles: async () => new Set(['u-1']),
        suivis: () => new Set(['u-1']),
        dernierBattement: async () => null,
        tuerSansGrace,
      }),
    );
    expect(tuerSansGrace).not.toHaveBeenCalled();
  });
});

describe('creerSuiviBackoff', () => {
  it('rend 5s au premier redemarrage', () => {
    const suivi = creerSuiviBackoff();
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(5_000);
  });

  it('augmente le delai a chaque sortie rapprochee, jusqu au plafond de 60s', () => {
    const suivi = creerSuiviBackoff();
    const debut = new Date('2026-09-05T10:00:00.000Z');
    suivi.enregistrerDemarrage('u-1', debut);
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 1_000)); // crash immediat
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(10_000);

    suivi.enregistrerDemarrage('u-1', new Date(debut.getTime() + 11_000));
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 12_000));
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(20_000);

    suivi.enregistrerDemarrage('u-1', new Date(debut.getTime() + 32_000));
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 33_000));
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(60_000);

    suivi.enregistrerDemarrage('u-1', new Date(debut.getTime() + 93_000));
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 94_000));
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(60_000); // plafonne, ne depasse pas
  });

  it('reinitialise le compteur apres 60s de fonctionnement sain', () => {
    const suivi = creerSuiviBackoff();
    const debut = new Date('2026-09-05T10:00:00.000Z');
    suivi.enregistrerDemarrage('u-1', debut);
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 1_000)); // crash
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(10_000);

    suivi.enregistrerDemarrage('u-1', new Date(debut.getTime() + 11_000));
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 11_000 + 61_000)); // 61s sain
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(5_000); // repart a zero
  });
});

describe('decouvrirEligiblesReel', () => {
  function clientAvecConnexions(lignes: { owner_id: string; plateforme: string }[]): SupabaseClient<Database> {
    const b = { select: () => b, eq: () => b, in: () => Promise.resolve({ data: lignes, error: null }) };
    return { from: () => b } as unknown as SupabaseClient<Database>;
  }

  it('ne retient que les proprietaires avec github ET vercel actifs', async () => {
    const client = clientAvecConnexions([
      { owner_id: 'u-1', plateforme: 'github' },
      { owner_id: 'u-1', plateforme: 'vercel' },
      { owner_id: 'u-2', plateforme: 'github' }, // vercel manquant
    ]);
    expect(await decouvrirEligiblesReel(client)).toEqual(new Set(['u-1']));
  });
});
