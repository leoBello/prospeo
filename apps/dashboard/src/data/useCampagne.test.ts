import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { PERIODE_RELECTURE_BATTEMENT_MS, useCampagne } from './useCampagne.js';

/**
 * Un client simulé réduit à ce dont `useCampagne` dépend : des collections
 * vides, un battement que le test fait varier, et un canal Realtime qui ne
 * publie JAMAIS rien.
 *
 * C'est ce silence qui donne son sens aux tests ci-dessous : un worker mort
 * n'émet aucun signal, et c'est précisément le cas où l'écran doit se
 * corriger tout seul.
 */
function clientSimule(battement: () => { beat_at: string; in_flight: number } | null): {
  client: SupabaseClient<Database>;
  lectures: () => number;
} {
  let lectures = 0;
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    in: () => b,
    order: () => b,
    limit: () => b,
    range: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => {
      lectures += 1;
      return Promise.resolve({ data: battement(), error: null });
    },
  };
  const canal: Record<string, unknown> = { on: () => canal, subscribe: () => canal };

  return {
    client: {
      from: () => b,
      channel: () => canal,
      removeChannel: () => Promise.resolve('ok'),
    } as unknown as SupabaseClient<Database>,
    lectures: () => lectures,
  };
}

/** Laisse la file de microtâches s'écouler, horloge simulée comprise. */
async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useCampagne — le battement se relit tout seul', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('relit le battement sans qu aucun evenement Realtime ne survienne', async () => {
    // LE DEFAUT QUE CE TEST FERME. La relecture n etait declenchee que par un
    // evenement de `campaign_job` ou `deployment_event`. Or un worker mort
    // n emet AUCUN signal : l ecran affichait « Collector a l ecoute » et un
    // bouton actif dix minutes apres sa mort, et ne se corrigeait qu apres le
    // clic qu il aurait du empecher.
    vi.useFakeTimers();
    let courant = { beat_at: '2026-09-03T10:00:00.000Z', in_flight: 0 };
    const { client } = clientSimule(() => courant);

    const { result } = renderHook(() => useCampagne(client, true));
    await flush();
    expect(result.current.status).toBe('ready');
    expect((result.current as { heartbeat: { beatAt: string } }).heartbeat.beatAt).toBe(
      '2026-09-03T10:00:00.000Z',
    );

    courant = { beat_at: '2026-09-03T10:00:20.000Z', in_flight: 1 };
    await flush(PERIODE_RELECTURE_BATTEMENT_MS);

    expect((result.current as { heartbeat: { beatAt: string } }).heartbeat.beatAt).toBe(
      '2026-09-03T10:00:20.000Z',
    );
  });

  it('cesse de relire une fois demonte', async () => {
    // Un intervalle non nettoye survit a l ecran : il continuerait de lire la
    // base depuis un composant que plus personne ne regarde.
    vi.useFakeTimers();
    const { client, lectures } = clientSimule(() => ({
      beat_at: '2026-09-03T10:00:00.000Z',
      in_flight: 0,
    }));

    const { unmount } = renderHook(() => useCampagne(client, true));
    await flush();
    const apresMontage = lectures();

    unmount();
    await flush(PERIODE_RELECTURE_BATTEMENT_MS * 3);

    expect(lectures()).toBe(apresMontage);
  });
});
