import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { makePanelActions } from './actions.js';

/** Client simulé : rend l'erreur fournie, n'accède à rien. */
function fakeClient(erreur: { message: string } | null) {
  const reponse = Promise.resolve({ error: erreur });
  return {
    from: () => ({
      update: () => ({ eq: () => reponse }),
      upsert: () => reponse,
      insert: () => reponse,
    }),
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
