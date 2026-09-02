import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { makePanelActions } from './actions.js';

/**
 * Client simulé : rend l'erreur fournie, n'accède à rien.
 *
 * `erreurParTable` cible l'échec sur UNE table précise, sans toucher aux
 * autres — nécessaire pour distinguer un échec de `prospect_pipeline` (l'état)
 * d'un échec de `pipeline_event` (l'historique seul), qui n'ont pas le même
 * effet sur la relecture (relevé de revue, tâche 5). Même convention que
 * `data/mutations.test.ts`.
 */
function fakeClient(
  erreur: { message: string } | null,
  erreurParTable: Record<string, { message: string }> = {},
) {
  return {
    from: (table: string) => {
      const reponse = Promise.resolve({ error: erreurParTable[table] ?? erreur });
      return {
        update: () => ({ eq: () => reponse }),
        upsert: () => reponse,
        insert: () => reponse,
      };
    },
  } as unknown as SupabaseClient<Database>;
}

describe('makePanelActions', () => {
  it('relit après une écriture réussie', async () => {
    // L'écran entier dérive d'une seule lecture : indicateurs, files de travail
    // et fiche décrivent le même instantané. Muter sans relire laisserait la
    // fiche affirmer une chose et la file d'à côté son contraire — un prospect
    // passé à `ne_pas_contacter` resterait compté parmi les relances dues.
    const reload = vi.fn();
    const actions = makePanelActions(fakeClient(null), reload);

    expect(await actions.definirStatut('p1', 'interesse', null)).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('NE relit PAS après un échec', async () => {
    // Une écriture refusée n'a rien changé : relire ferait clignoter tout
    // l'écran pour rien, et effacerait au passage le message d'erreur que
    // l'utilisateur n'a pas encore lu.
    const reload = vi.fn();
    const actions = makePanelActions(fakeClient({ message: 'RLS' }), reload);

    expect(await actions.rejeterRedaction('p1')).toBe('RLS');
    expect(reload).not.toHaveBeenCalled();
  });

  it('relit MÊME quand seul l’historique échoue — l’état, lui, a déjà été écrit', async () => {
    // Depuis la tâche 5, `definirStatut` écrit DEUX tables. Un échec de la
    // seule `pipeline_event` signifie que `prospect_pipeline` a déjà changé :
    // ne pas relire laisserait la fiche afficher l'ANCIEN statut alors que la
    // base porte le NOUVEAU (relevé de revue).
    const reload = vi.fn();
    const actions = makePanelActions(
      fakeClient(null, { pipeline_event: { message: 'HS' } }),
      reload,
    );

    const resultat = await actions.definirStatut('p1', 'interesse', null);
    expect(resultat).toEqual({ etape: 'historique', message: 'HS' });
    expect(reload).toHaveBeenCalledOnce();
  });

  it('NE relit PAS quand l’état lui-même a échoué — rien n’a changé', async () => {
    const reload = vi.fn();
    const actions = makePanelActions(
      fakeClient(null, { prospect_pipeline: { message: 'RLS' } }),
      reload,
    );

    const resultat = await actions.definirStatut('p1', 'interesse', null);
    expect(resultat).toEqual({ etape: 'etat', message: 'RLS' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('branche les quatre écritures', async () => {
    const reload = vi.fn();
    const actions = makePanelActions(fakeClient(null), reload);

    await actions.rejeterRedaction('p1');
    await actions.annulerRejet('p1');
    await actions.definirStatut('p1', 'perdu', '2026-10-01');
    await actions.journaliser('p1', 'sms', 'envoyé');
    expect(reload).toHaveBeenCalledTimes(4);
  });
});
