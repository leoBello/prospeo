import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { chiffrer, lireCleMaitresse } from '@prospeo/coffre';
import { ecrireConnexionGithub, ecrireConnexionVercel } from './connexions.js';

const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));

/**
 * Client simulé minimal : une lecture (`select().eq().eq().maybeSingle()`)
 * suivie d'une écriture (`insert()` OU `update().eq()`), selon que la
 * lecture a trouvé une ligne. Chaque test configure `ligneExistante` et
 * enregistre les appels dans `appels`.
 */
function fakeClient(ligneExistante: { id: string } | null) {
  const appels: { methode: string; table: string; valeurs?: unknown }[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { async maybeSingle() { return { data: ligneExistante, error: null }; } };
                },
                async maybeSingle() {
                  // connexion_secret n'a qu'un seul .eq()
                  return { data: ligneExistante, error: null };
                },
              };
            },
          };
        },
        insert(valeurs: unknown) {
          appels.push({ methode: 'insert', table, valeurs });
          return {
            async then(resolve: (v: { data: null; error: null }) => void) {
              resolve({ data: null, error: null });
            },
            select() {
              return {
                async single() {
                  return { data: { id: 'cx-nouvelle' }, error: null };
                },
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

describe('ecrireConnexionGithub', () => {
  it('insère une nouvelle connexion quand aucune n existe', async () => {
    const { client, appels } = fakeClient(null);
    await ecrireConnexionGithub(client, 'owner-1', '999', 'mon-org');

    const insertion = appels.find((a) => a.methode === 'insert' && a.table === 'connexion_plateforme');
    expect(insertion).toBeDefined();
    const valeurs = insertion?.valeurs as Record<string, unknown>;
    expect(valeurs.owner_id).toBe('owner-1');
    expect(valeurs.plateforme).toBe('github');
    expect(valeurs.reference).toBe('999');
    expect(valeurs.compte_libelle).toBe('mon-org');
    expect(valeurs.etat).toBe('active');
  });

  it('met à jour la connexion existante plutôt que d en créer une seconde', async () => {
    const { client, appels } = fakeClient({ id: 'cx-existante' });
    await ecrireConnexionGithub(client, 'owner-1', '999', 'mon-org');

    const maj = appels.find((a) => a.methode === 'update' && a.table === 'connexion_plateforme');
    expect(maj).toBeDefined();
    expect(appels.some((a) => a.methode === 'insert')).toBe(false);
  });
});

describe('ecrireConnexionVercel', () => {
  it('insère la connexion PUIS le secret chiffré, jamais le clair', async () => {
    const { client, appels } = fakeClient(null);
    const scelle = chiffrer('jeton-vercel-en-clair', CLE);
    await ecrireConnexionVercel(client, 'owner-1', 'mon-equipe', scelle);

    const secret = appels.find((a) => a.table === 'connexion_secret');
    expect(secret).toBeDefined();
    const valeurs = secret?.valeurs as Record<string, unknown>;
    expect(String(valeurs.chiffre)).not.toContain('jeton-vercel-en-clair');
    expect(valeurs.connexion_id).toBe('cx-nouvelle');
  });
});
