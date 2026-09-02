import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { useJeu } from './useJeu.js';

/**
 * Client simulé dont la lecture `pipeline_event` reste EN SUSPENS tant qu'un
 * test n'appelle pas `resolve` explicitement — même besoin que
 * `fakeEventsClientControlee` de `TodayScreen.test.tsx` : observer un ordre
 * de réponse différé de l'ordre des requêtes est le seul moyen de prouver la
 * garde `vivant`. `interaction` et `deployment_event` répondent tout de
 * suite, vides : seul `pipeline_event` sert de sonde de contrôle ici, `useJeu`
 * n'ayant qu'un client et un drapeau `enabled`, pas d'identifiant à faire
 * varier comme `useDeploymentEvents`.
 */
function fakeClientControlable() {
  const attentes: { resolve: (lignes: unknown[]) => void }[] = [];
  const appels: string[] = [];
  const immediat = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    range() { return Promise.resolve({ data: [], error: null }); },
  };
  const client = {
    from(table: string) {
      appels.push(table);
      if (table !== 'pipeline_event') return immediat;
      return {
        select() { return this; },
        order() { return this; },
        range() {
          return new Promise((resolve) => {
            attentes.push({ resolve: (lignes) => resolve({ data: lignes, error: null }) });
          });
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, attentes, appels };
}

/** Laisse la file de microtâches s'écouler jusqu'au bout, comme `flush` de `TodayScreen.test.tsx`. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('useJeu', () => {
  it('demarre en chargement puis passe a ready avec le jeu assemble', async () => {
    const { client } = fakeClientControlableResolueImmediatement();
    const { result } = renderHook(() => useJeu(client, true));
    expect(result.current.status).toBe('loading');
    await flush();
    expect(result.current.status).toBe('ready');
  });

  it('passe a error sur une lecture en echec, distinct d un jeu vide', async () => {
    const client = fakeClientEnErreur('RLS a refuse');
    const { result } = renderHook(() => useJeu(client, true));
    await flush();
    expect(result.current.status).toBe('error');
    expect((result.current as { status: 'error'; message: string }).message).toMatch(/RLS a refuse/);
  });

  it('n ecrase pas l etat courant avec une reponse perimee arrivee apres un reload', async () => {
    const { client, attentes } = fakeClientControlable();
    const { result } = renderHook(() => useJeu(client, true));

    // Premiere lecture partie, encore en vol.
    expect(attentes).toHaveLength(1);

    // `reload` relance l'effet : la garde `vivant` du PREMIER effet doit
    // devenir fausse au nettoyage, avant que sa reponse n'arrive.
    act(() => {
      result.current.reload();
    });
    expect(attentes).toHaveLength(2);

    // La reponse PERIMEE (premiere requete) arrive en dernier. Si la garde ne
    // tenait pas, c'est ELLE qui gagnerait puisqu'elle resout apres la
    // seconde — et l'etat resterait bloque sur une lecture qu'un reload a
    // pourtant remplacee.
    attentes[1]!.resolve([
      { prospect_id: 'p1', status: 'interesse', next_action_at: null, origin: 'observe', occurred_at: '2026-09-01T00:00:00Z' },
    ]);
    await flush();
    expect(result.current.status).toBe('ready');
    const jeuApresSeconde = (result.current as { status: 'ready'; jeu: { palier: { points: number } } }).jeu;
    expect(jeuApresSeconde.palier.points).toBe(200); // un rendez-vous obtenu : 200 points

    attentes[0]!.resolve([
      { prospect_id: 'p2', status: 'interesse', next_action_at: null, origin: 'observe', occurred_at: '2026-09-01T00:00:00Z' },
      { prospect_id: 'p3', status: 'interesse', next_action_at: null, origin: 'observe', occurred_at: '2026-09-01T00:00:00Z' },
    ]);
    await flush();
    // Toujours l'etat de la SECONDE lecture : la premiere, perimee, n'a rien ecrase.
    expect(result.current.status).toBe('ready');
    const jeuFinal = (result.current as { status: 'ready'; jeu: { palier: { points: number } } }).jeu;
    expect(jeuFinal.palier.points).toBe(200);
  });

  /**
   * Le démontage exécute la MÊME fermeture de nettoyage (`vivant = false`)
   * que le `reload` testé ci-dessus — il n'y a qu'un seul point du code qui
   * pose la garde, partagé par les deux causes de nettoyage. Ce test-ci ne
   * vérifie donc pas la garde une seconde fois : il vérifie seulement qu'une
   * réponse qui arrive après démontage ne fait rien planter.
   *
   * Une version antérieure de ce test tentait d'observer un
   * `console.error` de React sur un `setState` post-démontage — vérifié
   * absent du bundle `react-dom` 18.3 (recherché directement dans les
   * sources) : React 18 abandonne silencieusement une mise à jour d'état sur
   * un composant démonté, sans avertissement ni effet, guard ou pas. Une
   * telle assertion ne peut donc JAMAIS échouer pour la bonne raison — elle a
   * été retirée plutôt que gardée comme fausse preuve.
   */
  it('une reponse qui arrive apres le demontage ne fait rien planter', async () => {
    const { client, attentes } = fakeClientControlable();
    const { unmount } = renderHook(() => useJeu(client, true));
    expect(attentes).toHaveLength(1);
    unmount();

    expect(() => {
      attentes[0]!.resolve([
        { prospect_id: 'p1', status: 'interesse', next_action_at: null, origin: 'observe', occurred_at: '2026-09-01T00:00:00Z' },
      ]);
    }).not.toThrow();
    await flush();
  });
});

function fakeClientControlableResolueImmediatement() {
  const immediat = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    range() { return Promise.resolve({ data: [], error: null }); },
  };
  const client = {
    from() { return immediat; },
  };
  return { client: client as unknown as SupabaseClient<Database> };
}

function fakeClientEnErreur(message: string) {
  const enErreur = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    range() { return Promise.resolve({ data: null, error: { message } }); },
  };
  const client = {
    from() { return enErreur; },
  };
  return client as unknown as SupabaseClient<Database>;
}
