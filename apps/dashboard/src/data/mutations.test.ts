import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import {
  annulerRejet,
  definirStatut,
  journaliserInteraction,
  rejeterRedaction,
} from './mutations.js';

/**
 * Client simulé : enregistre l'écriture construite, n'accède à rien.
 *
 * C'est le CÂBLAGE qu'on éprouve — quelle table, quel verbe, quelles colonnes.
 * Une erreur à ce niveau ne se voit pas autrement : Supabase répond sans
 * broncher à un `update` qui ne touche aucune ligne.
 */
function fakeClient(erreur: { message: string } | null = null) {
  const appels: { table: string; verbe: string; valeurs: unknown; filtre?: [string, string]; options?: unknown }[] = [];
  const reponse = Promise.resolve({ error: erreur });

  const client = {
    from(table: string) {
      return {
        update(valeurs: unknown) {
          const appel = { table, verbe: 'update', valeurs };
          appels.push(appel);
          return {
            eq(colonne: string, valeur: string) {
              (appel as Record<string, unknown>)['filtre'] = [colonne, valeur];
              return reponse;
            },
          };
        },
        upsert(valeurs: unknown, options?: unknown) {
          appels.push({ table, verbe: 'upsert', valeurs, options });
          return reponse;
        },
        insert(valeurs: unknown) {
          appels.push({ table, verbe: 'insert', valeurs });
          return reponse;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, appels };
}

describe('rejeterRedaction', () => {
  it('horodate le refus SANS effacer le contenu', () => {
    // La décision centrale du geste. Effacer `content` aurait suffi à faire
    // régénérer le prospect, mais on ne saurait plus ce qu'on a refusé — donc
    // rien de ce qui permet de corriger le prompt — ni distinguer « jamais
    // rédigé » de « rédigé puis refusé ».
    const { client, appels } = fakeClient();
    void rejeterRedaction(client, 'p1');

    expect(appels[0]?.table).toBe('prospect_site');
    const valeurs = appels[0]?.valeurs as Record<string, unknown>;
    expect(valeurs['content_rejected_at']).toEqual(expect.any(String));
    expect(valeurs).not.toHaveProperty('content');
  });

  it('ne touche que le prospect visé', async () => {
    const { client, appels } = fakeClient();
    await rejeterRedaction(client, 'p1');
    expect(appels[0]?.filtre).toEqual(['prospect_id', 'p1']);
  });

  it('rend le message d’erreur plutôt que de lever', async () => {
    // Une exception obligerait chaque appelant à un `try` ; une valeur de
    // retour se traite là où l'on sait quoi en afficher.
    const { client } = fakeClient({ message: 'RLS' });
    expect(await rejeterRedaction(client, 'p1')).toBe('RLS');
  });
});

describe('annulerRejet', () => {
  it('remet la date à null', async () => {
    // Le geste inverse doit exister : un refus est un clic, et un clic se fait
    // par erreur. Sans lui, revenir en arrière coûterait un appel payant.
    const { client, appels } = fakeClient();
    await annulerRejet(client, 'p1');
    expect((appels[0]?.valeurs as Record<string, unknown>)['content_rejected_at']).toBeNull();
  });
});

describe('definirStatut', () => {
  it('UPSERT, parce que la table est vide', async () => {
    // Mesuré le 2 septembre 2026 : `prospect_pipeline` ne contient aucune
    // ligne, faute d'écrivain. Un `update` ne toucherait rien — sans erreur —
    // et le premier clic sur chaque prospect serait silencieusement perdu.
    const { client, appels } = fakeClient();
    await definirStatut(client, 'p1', 'ne_pas_contacter', null);

    expect(appels[0]?.table).toBe('prospect_pipeline');
    expect(appels[0]?.verbe).toBe('upsert');
    expect(appels[0]?.options).toEqual({ onConflict: 'prospect_id' });
    expect(appels[0]?.valeurs).toMatchObject({
      prospect_id: 'p1',
      status: 'ne_pas_contacter',
      next_action_at: null,
    });
  });

  it('porte la date de relance quand il y en a une', async () => {
    const { client, appels } = fakeClient();
    await definirStatut(client, 'p1', 'relance', '2026-09-15');
    expect((appels[0]?.valeurs as Record<string, unknown>)['next_action_at']).toBe('2026-09-15');
  });
});

describe('journaliserInteraction', () => {
  it('EMPILE, parce qu’un journal ne se corrige pas', async () => {
    // Deux appels le même jour sont deux faits, pas une correction du premier.
    // C'est cette chronologie qui dira, dans six mois, ce qu'on avait tenté
    // avant de classer un prospect perdu.
    const { client, appels } = fakeClient();
    await journaliserInteraction(client, 'p1', 'appel', 'Pas de réponse');

    expect(appels[0]?.table).toBe('interaction');
    expect(appels[0]?.verbe).toBe('insert');
    expect(appels[0]?.valeurs).toMatchObject({ prospect_id: 'p1', kind: 'appel', body: 'Pas de réponse' });
  });

  it('accepte le canal SMS, que la migration de la tâche 5 a ajouté', async () => {
    // `interaction_kind` valait ('appel', 'whatsapp', 'email', 'note') : le
    // canal existait dans les messages générés et pas dans le journal.
    const { client, appels } = fakeClient();
    await journaliserInteraction(client, 'p1', 'sms', null);
    expect((appels[0]?.valeurs as Record<string, unknown>)['kind']).toBe('sms');
  });

  it('ne consigne pas une note vide', async () => {
    // Une chaîne vide occuperait une ligne du journal sans rien y dire, et
    // les espaces d'un champ qu'on a ouvert puis quitté ne valent pas mieux.
    const { client, appels } = fakeClient();
    await journaliserInteraction(client, 'p1', 'note', '   ');
    expect((appels[0]?.valeurs as Record<string, unknown>)['body']).toBeNull();
  });

  it('n’horodate pas depuis le navigateur', async () => {
    // `occurred_at` reste au défaut de la base. L'écrire ici exposerait
    // l'horloge du poste, qui peut être décalée de plusieurs minutes, et ferait
    // apparaître des échanges dans le désordre.
    const { client, appels } = fakeClient();
    await journaliserInteraction(client, 'p1', 'email', 'Relance envoyée');
    expect(appels[0]?.valeurs).not.toHaveProperty('occurred_at');
  });
});
