import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { App } from './App.js';

/**
 * Client Supabase minimal, juste assez pour monter `App` en entier.
 *
 * Repris du parti pris de `TodayScreen.test.tsx` (`fakeEventsClient*`) : un
 * faux client qui ne reproduit QUE la chaîne réellement appelée par le code
 * sous test, jamais `supabase-js`. Trois lectures sont sollicitées par ce
 * test sans qu'aucun écran consommateur de PROSPECTS ne soit ouvert :
 *
 * - `prospect`, lu deux fois avec deux `select` différents — `queries.ts`
 *   (`useProspects`, colonnes qui incluent `generated_message`) et
 *   `data/deployments.ts` (`useDeployments`, colonnes qui incluent
 *   `deployment_event`). On les distingue par la chaîne `select` reçue :
 *   seul moyen de faire échouer l'une sans faire échouer l'autre, condition
 *   même du bug (finding 3, relevé de revue).
 * - `site_template`, lu par `fetchDeployments` pour le gabarit affiché sur
 *   chaque ligne — sans rapport avec le test, une ligne absente suffit.
 */
function fakeAppClient() {
  function builder(reponse: { data: unknown; error: { message: string } | null }) {
    // Un client Supabase réel est un « thenable » : chaque méthode de chaîne
    // rend le même constructeur, et c'est `await`/`.then()` sur LUI qui
    // déclenche la requête. On imite ce contrat plutôt que Promise.resolve()
    // en amont, pour rester fidèle à la forme réellement consommée.
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      range: () => chain,
      eq: () => chain,
      limit: () => chain,
      maybeSingle: () => chain,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(reponse).then(onFulfilled, onRejected),
    };
    return chain;
  }

  const client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'jeton', user: { id: 'u1' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from(table: string) {
      return {
        select(colonnes: string) {
          if (table === 'prospect' && colonnes.includes('generated_message')) {
            // La lecture que `useProspects` déclenche : en échec, exprès —
            // c'est le cas que la garde de branchement doit survivre.
            return builder({ data: null, error: { message: 'Row level security violation' } });
          }
          if (table === 'prospect') {
            // La lecture que `useDeployments` déclenche (`DEPLOYMENT_SELECT`) :
            // vide, sans rapport avec ce que ce test vérifie.
            return builder({ data: [], error: null });
          }
          // `site_template` (gabarit actif) : aucune ligne, comme une base
          // dont la migration n'a pas encore tourné.
          return builder({ data: null, error: null });
        },
      };
    },
  };

  return client;
}

// `App.tsx` construit son client via `createDashboardClient(import.meta.env)`,
// sans possibilité de l'injecter par les props — seul point d'entrée pour lui
// en substituer un faux. `fakeClient` est assigné dans chaque `it`, avant
// `render(<App />)` : la fabrique ne le lit qu'au moment où `App` appelle
// réellement `createDashboardClient`, jamais avant.
let fakeClient: ReturnType<typeof fakeAppClient>;
vi.mock('./data/supabase.js', () => ({
  createDashboardClient: () => fakeClient,
}));

/** Laisse les `.then` des lectures simulées s'écouler avant de lire le DOM. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('App — l ordre des gardes de useProspects (releve de revue, lot 2)', () => {
  it('garde le rail et affiche l ecran Deploiements quand la lecture des prospects echoue', async () => {
    // Avant le correctif (891a68f), les gardes `loading`/`error` de
    // `useProspects` étaient placées AU-DESSUS des branches « Gabarit » et
    // « Déploiements », et rendaient un markup nu, sans rail : une lecture de
    // prospects en échec réduisait toute l'application à une boîte d'erreur,
    // rendant l'écran de déploiement — celui qu'on ouvre justement quand
    // quelque chose ne va pas — inatteignable. Un futur refactor pourrait
    // réintroduire cet ordre sans qu'aucun test ne le remarque : c'était le
    // cas, il n'y avait pas de `App.test.tsx`.
    window.location.hash = '#/deploiements';
    fakeClient = fakeAppClient();

    render(<App />);
    await flush();

    // Le rail a survécu, et pointe bien sur « Déploiements ».
    const rail = screen.getByRole('navigation', { name: 'Prospeo' });
    expect(within(rail).getByRole('button', { name: 'Déploiements' }).getAttribute('aria-current')).toBe(
      'page',
    );

    // L'écran réellement affiché est `DeploiementsScreen` — lui ne consomme
    // aucun prospect — et non la boîte d'erreur générique de `useProspects`.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Déploiements');
    expect(screen.getByText('Aucun déploiement')).toBeDefined();
    // La boîte d'erreur de `useProspects` (`app.error.title`) n'apparaît nulle
    // part : c'est elle qui, avant le correctif, remplaçait tout l'écran.
    expect(screen.queryByText('Lecture impossible')).toBeNull();
  });
});
