import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { useJeu } from './useJeu.js';

/**
 * Un builder permissif générique : répond immédiatement, vide, à n'importe
 * quelle chaîne (lecture de lignes terminée par `.range`, ou lecture de
 * compte terminée par un simple `await`). Les FORMES exactes des requêtes
 * (colonnes, filtres) sont déjà éprouvées par `data/jeu.test.ts` — ce fichier
 * ne teste que la machine à états du hook et sa garde `vivant`, donc un seul
 * mock générique par table suffit ici.
 */
/**
 * `compte()` est appelé DANS `select()`, donc SYNCHRONE au moment où la
 * requête est construite — jamais dans `.then()`. `.then()` reste différé
 * (microtâche), comme toute résolution de promesse/thenable réelle, mais la
 * VALEUR qu'il rendra est déjà figée avant même que la moindre microtâche ne
 * s'exécute. Sans ça, un compte lu paresseusement dans `.then()` verrait la
 * valeur CORRESPONDANT AU MOMENT DE LA RÉSOLUTION plutôt qu'au moment de la
 * requête — exactement ce qui rendait la premiere version de ce mock
 * incapable de distinguer un cycle de lecture perime d'un cycle courant : les
 * deux comptes finissaient par lire la MEME valeur, celle du dernier cycle,
 * quel que soit le cycle interroge.
 */
function builderImmediat(compte: () => number = () => 0) {
  const base = {
    select(_colonnes?: string, _options?: unknown) {
      const n = compte();
      const fige = {
        select() { return fige; },
        eq() { return fige; },
        gte() { return fige; },
        lt() { return fige; },
        or() { return fige; },
        order() { return fige; },
        range() { return Promise.resolve({ data: [], error: null }); },
        then(resolve: (v: unknown) => void) { resolve({ data: null, error: null, count: n }); },
      };
      return fige;
    },
  };
  return base;
}

/** Même chose, mais qui échoue toujours — la lecture ou le compte, peu importe. */
function builderEnErreur(message: string) {
  const b = {
    select() { return b; },
    eq() { return b; },
    gte() { return b; },
    lt() { return b; },
    or() { return b; },
    order() { return b; },
    range() { return Promise.resolve({ data: null, error: { message } }); },
    then(resolve: (v: unknown) => void) { resolve({ data: null, error: { message }, count: null }); },
  };
  return b;
}

function fakeClientToutVaBien() {
  const b = builderImmediat();
  return { from: () => b } as unknown as SupabaseClient<Database>;
}

function fakeClientEnErreur(message: string) {
  const b = builderEnErreur(message);
  return { from: () => b } as unknown as SupabaseClient<Database>;
}

/**
 * Client simulé dont la lecture DE LIGNES de `pipeline_event` (fenêtre
 * bornée) reste EN SUSPENS tant qu'un test n'appelle pas `resolve`
 * explicitement — même besoin que `fakeEventsClientControlee` de
 * `TodayScreen.test.tsx` : observer un ordre de réponse différé de l'ordre
 * des requêtes est le seul moyen de prouver la garde `vivant`.
 *
 * `ronde` distingue le jeu produit par CHAQUE cycle de lecture, sans dépendre
 * de l'horloge réelle (`useJeu` appelle `fetchJeu` sans lui fixer `now`) :
 * elle s'incrémente au moment où la lecture de lignes DÉMARRE (donc avant que
 * les trois comptes de ce même cycle ne répondent), et ces comptes répondent
 * `ronde` — premier cycle : sites = rendez-vous = 1 (points = 320) ; second
 * cycle (après `reload`) : sites = rendez-vous = 2 (points = 640). Deux
 * valeurs de palier distinctes, indépendantes de la date du jour, prouvent
 * sans ambiguïté laquelle des deux réponses a fini par s'écrire.
 */
function fakeClientControlable() {
  const attentes: { resolve: (lignes: unknown[]) => void }[] = [];
  let ronde = 0;
  const immediat = builderImmediat(() => ronde);
  const pipeline: {
    select: (colonnes: string, options?: { count?: string; head?: boolean }) => unknown;
    gte: () => unknown;
    or: () => unknown;
    order: () => unknown;
    range: () => Promise<unknown>;
  } = {
    select(colonnes: string, options?: { count?: string; head?: boolean }) {
      // `immediat.select(...)` — pas `immediat` seul — pour que la valeur de
      // `ronde` soit bien figee ICI, synchrone, voir le docstring de
      // `builderImmediat`.
      if (options !== undefined) return immediat.select(colonnes);
      ronde += 1;
      return pipeline;
    },
    gte() { return pipeline; },
    or() { return pipeline; },
    order() { return pipeline; },
    range() {
      return new Promise((resolve) => {
        attentes.push({ resolve: (lignes) => resolve({ data: lignes, error: null }) });
      });
    },
  };
  const client = {
    from(table: string) {
      return table === 'pipeline_event' ? pipeline : immediat;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, attentes };
}

/** Laisse la file de microtâches s'écouler jusqu'au bout, comme `flush` de `TodayScreen.test.tsx`. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('useJeu', () => {
  it('demarre en chargement puis passe a ready avec le jeu assemble', async () => {
    // Le client DOIT être construit une seule fois, hors du callback de
    // `renderHook` : en recréer un à chaque rendu changerait sa référence,
    // que l'effet du hook surveille (`[client, tentative, enabled]`) — la
    // lecture repartirait à chaque rendu, dans une boucle sans fin.
    const client = fakeClientToutVaBien();
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

    // La reponse du SECOND cycle (correcte) arrive d'abord.
    attentes[1]!.resolve([]);
    await flush();
    expect(result.current.status).toBe('ready');
    const jeuApresSeconde = (result.current as { status: 'ready'; jeu: { palier: { points: number } } }).jeu;
    expect(jeuApresSeconde.palier.points).toBe(640); // 2 sites * 120 + 2 rendez-vous * 200

    // La reponse PERIMEE (premier cycle) arrive en dernier. Si la garde ne
    // tenait pas, c'est ELLE qui gagnerait puisqu'elle resout apres la
    // seconde — remplacant 640 par 320.
    attentes[0]!.resolve([]);
    await flush();
    expect(result.current.status).toBe('ready');
    const jeuFinal = (result.current as { status: 'ready'; jeu: { palier: { points: number } } }).jeu;
    expect(jeuFinal.palier.points).toBe(640); // inchange : la reponse perimee n'a rien pu ecrire
  });

  /**
   * Le démontage exécute la MÊME fermeture de nettoyage (`vivant = false`)
   * que le `reload` ci-dessus — un seul point du code pose la garde. Ce
   * test-ci ne la revérifie donc pas : il vérifie seulement qu'une réponse
   * tardive après démontage ne fait rien planter. Une version antérieure
   * tentait d'observer un `console.error` de React sur un `setState`
   * post-démontage : recherché directement dans le bundle `react-dom` 18.3,
   * ce message n'existe plus pour les composants fonctionnels — une telle
   * assertion ne pouvait donc jamais échouer pour la bonne raison, et a été
   * retirée plutôt que gardée comme fausse preuve.
   */
  it('une reponse qui arrive apres le demontage ne fait rien planter', async () => {
    const { client, attentes } = fakeClientControlable();
    const { unmount } = renderHook(() => useJeu(client, true));
    expect(attentes).toHaveLength(1);
    unmount();

    expect(() => {
      attentes[0]!.resolve([]);
    }).not.toThrow();
    await flush();
  });
});
