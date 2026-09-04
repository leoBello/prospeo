import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { chiffrer, lireCleMaitresse } from '@prospeo/coffre';
import { proprietaire } from './proprietaire.js';
import { creerCoffreDeps, creerCoffreGithubDeps, lireCompteLibelle } from './coffre-supabase.js';

const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));
const PROPRIETAIRE = proprietaire('131ab48e-055a-4a15-af4b-79ed7a2e4465');

/** Un `bytea` Postgres tel que PostgREST le rend : `\x` suivi d'hexadécimal. */
function versBytea(buffer: Buffer): string {
  return `\\x${buffer.toString('hex')}`;
}

/**
 * Client simulé minimal : une lecture (`select().eq()...maybeSingle()`) et,
 * pour `marquerEtat`, une écriture (`update().eq()`). Chaque test configure
 * `ligne` et lit `appels` pour vérifier ce qui a été construit.
 */
function fakeClient(ligne: Record<string, unknown> | null) {
  const appels: { methode: string; table: string; valeurs?: unknown }[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { async maybeSingle() { return { data: ligne, error: null }; } };
                },
                async maybeSingle() { return { data: ligne, error: null }; },
              };
            },
          };
        },
        update(valeurs: unknown) {
          appels.push({ methode: 'update', table, valeurs });
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, appels };
}

describe('creerCoffreDeps', () => {
  it('lireConnexion rend id et etat depuis connexion_plateforme', async () => {
    const { client } = fakeClient({ id: 'cx-1', etat: 'active' });
    const deps = creerCoffreDeps(client, CLE);
    const r = await deps.lireConnexion(PROPRIETAIRE, 'vercel');
    expect(r).toEqual({ id: 'cx-1', etat: 'active' });
  });

  it('lireConnexion rend null quand aucune ligne n existe', async () => {
    const { client } = fakeClient(null);
    const deps = creerCoffreDeps(client, CLE);
    expect(await deps.lireConnexion(PROPRIETAIRE, 'vercel')).toBeNull();
  });

  it('lireSecret convertit le bytea hexadecimal en Buffer, pour les trois champs', async () => {
    const scelle = chiffrer('jeton-vercel-secret', CLE);
    const { client } = fakeClient({
      chiffre: versBytea(scelle.chiffre),
      vecteur: versBytea(scelle.vecteur),
      etiquette: versBytea(scelle.etiquette),
      cle_id: scelle.cleId,
    });
    const deps = creerCoffreDeps(client, CLE);
    const r = await deps.lireSecret('cx-1');
    expect(r).toEqual(scelle);
  });

  it('marquerEtat ecrit etat et etat_constate_at sur connexion_plateforme', async () => {
    const { client, appels } = fakeClient(null);
    const deps = creerCoffreDeps(client, CLE);
    await deps.marquerEtat('cx-1', 'indechiffrable');

    const maj = appels.find((a) => a.methode === 'update' && a.table === 'connexion_plateforme');
    expect(maj).toBeDefined();
    expect((maj?.valeurs as Record<string, unknown>).etat).toBe('indechiffrable');
  });
});

describe('creerCoffreGithubDeps', () => {
  it('lireInstallation rend connexionId, etat et installationId (reference)', async () => {
    const { client } = fakeClient({ id: 'cx-2', etat: 'active', reference: '999' });
    const deps = creerCoffreGithubDeps(client, { creerJetonInstallation: vi.fn() });
    const r = await deps.lireInstallation(PROPRIETAIRE);
    expect(r).toEqual({ connexionId: 'cx-2', etat: 'active', installationId: '999' });
  });

  it('delegue creerJetonInstallation au client GitHub App fourni', async () => {
    const creerJetonInstallation = vi.fn(async () => ({ ok: true as const, token: 'ghs_xxx' }));
    const { client } = fakeClient(null);
    const deps = creerCoffreGithubDeps(client, { creerJetonInstallation });
    await deps.creerJetonInstallation('999');
    expect(creerJetonInstallation).toHaveBeenCalledWith('999');
  });
});

describe('lireCompteLibelle', () => {
  it('rend compte_libelle pour la plateforme demandee', async () => {
    const { client } = fakeClient({ compte_libelle: 'mon-org' });
    expect(await lireCompteLibelle(client, PROPRIETAIRE, 'github')).toBe('mon-org');
  });

  it('rend null quand aucune connexion n existe', async () => {
    const { client } = fakeClient(null);
    expect(await lireCompteLibelle(client, PROPRIETAIRE, 'github')).toBeNull();
  });
});
