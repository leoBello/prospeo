import { describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView } from '../domain/prospect.js';
import { TodayScreen } from './TodayScreen.js';

const AUJOURDHUI = new Date('2026-09-01T09:00:00');

function vue(id: string, patch: Partial<ProspectView> = {}): ProspectView {
  return {
    id,
    siret: `1111111110${id}`,
    denomination: `ENTREPRISE ${id}`,
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '5 RUE LE NOTRE 44000 NANTES',
    postalCode: '44000',
    city: 'NANTES',
    dateCreation: '2012-12-15',
    effectifCode: '02',
    isClosed: false,
    discoveredAt: '2026-09-01T01:38:07Z',
    score: null,
    presence: null,
    enrichment: null,
    pipeline: null,
    site: null,
    messages: [],
    ...patch,
  };
}

const score = (total: number, version = 'v2') => ({
  total,
  rulesetVersion: version,
  computedAt: '2026-09-01T00:00:00Z',
  breakdown: [
    { code: 'presence_none', label: 'Aucune présence web', points: 35, group: 'presence' as const },
    { code: 'phone_none', label: 'Aucun téléphone', points: -25, group: 'joignabilite' as const },
  ],
});

/**
 * Un builder inerte, poli avec toute requête qu'il ne lui appartient pas de
 * connaître — depuis la tâche 8, `TodayScreen` appelle aussi `useJeu` avec le
 * même client que ces tests fabriquent pour `deployment_event` seul (comme
 * `Authenticated` le fait déjà en production, un seul client réel pour tout
 * l'écran). Sans ce filet, les requêtes `pipeline_event`/`interaction` du jeu
 * heurteraient un builder taillé pour une seule chaîne bien plus étroite.
 * Chaîne quelconque, résolution vide ou nulle : le jeu retombe alors sur un
 * historique au repos, sans jamais fausser les tests qui portent, eux, sur le
 * journal de déploiement d'un prospect précis.
 */
function builderJeuNeutre(): unknown {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    gte() {
      return builder;
    },
    lt() {
      return builder;
    },
    or() {
      return builder;
    },
    order() {
      return builder;
    },
    range() {
      return Promise.resolve({ data: [], error: null });
    },
    then(resolve: (v: unknown) => void) {
      resolve({ data: null, error: null, count: 0 });
    },
  };
  return builder;
}

/**
 * Client simulé pour `deployment_event` — tâche 11, le câblage du journal.
 *
 * Reproduit uniquement la chaîne que `fetchEventsFor` (data/deployments.ts)
 * appelle : `from('deployment_event').select(...).eq('prospect_id', id)
 * .order('occurred_at', ...)`. `appels` enregistre chaque table demandée pour
 * cette chaîne précise, pour la preuve négative (aucune lecture sans
 * sélection) — les requêtes du jeu (tâche 8), de forme différente
 * (`select('*', {count, head})`), sont détournées vers `builderJeuNeutre` et
 * n'y figurent jamais (voir son docstring).
 */
function fakeEventsClient(lignes: Record<string, unknown>[]) {
  const appels: string[] = [];
  const client = {
    from(table: string) {
      if (table !== 'deployment_event') return builderJeuNeutre();
      return {
        select(_colonnes?: string, options?: unknown) {
          if (options !== undefined) return builderJeuNeutre(); // le compte "sites en ligne" du jeu.
          appels.push(table);
          return {
            eq() {
              return {
                order() {
                  return Promise.resolve({ data: lignes, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, appels };
}

const evenementBuildReussi = {
  step: 'build',
  outcome: 'reussi',
  detail: null,
  duration_ms: 92000,
  occurred_at: '2026-09-01T14:20:32Z',
};

/**
 * Variante controlee de `fakeEventsClient` ci-dessus : la lecture ne
 * s'acheve pas toute seule — chaque `order()` en attente reste suspendu tant
 * qu'un test n'appelle pas `resolve` explicitement, dans l'ordre de son
 * choix. Necessaire pour la garde anti-reponse-tardive (finding 1, relevé de
 * revue) et pour prouver qu'une fermeture ne laisse rien en suspens
 * (finding 2) : un simple `Promise.resolve()` immediat, comme
 * `fakeEventsClient`, ne permettrait jamais d'observer un ordre de reponse
 * differe de l'ordre des requetes.
 */
function fakeEventsClientControlee() {
  const appels: string[] = [];
  const attentes: { prospectId: string; resolve: (lignes: Record<string, unknown>[]) => void }[] = [];
  const client = {
    from(table: string) {
      if (table !== 'deployment_event') return builderJeuNeutre();
      return {
        select(_colonnes?: string, options?: unknown) {
          if (options !== undefined) return builderJeuNeutre(); // le compte "sites en ligne" du jeu.
          appels.push(table);
          return {
            eq(_colonne: string, prospectId: string) {
              return {
                order() {
                  return new Promise<{ data: Record<string, unknown>[]; error: null }>((resolve) => {
                    attentes.push({ prospectId, resolve: (lignes) => resolve({ data: lignes, error: null }) });
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, appels, attentes };
}

/**
 * Client simulé dont la lecture `deployment_event` échoue toujours —
 * finding 4 (relevé de revue) : la même erreur que `fetchEventsFor` produit
 * réellement pour une RLS refusée ou un réseau perdu.
 */
function fakeEventsClientErreur(message: string) {
  const appels: string[] = [];
  const client = {
    from(table: string) {
      if (table !== 'deployment_event') return builderJeuNeutre();
      return {
        select(_colonnes?: string, options?: unknown) {
          if (options !== undefined) return builderJeuNeutre(); // le compte "sites en ligne" du jeu.
          appels.push(table);
          return {
            eq() {
              return {
                order() {
                  return Promise.resolve({ data: null, error: { message } });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, appels };
}

/**
 * Laisse la file de microtaches (les `.then` de `fetchEventsFor` puis du
 * hook) s'écouler jusqu'au bout avant de lire le DOM — `resolve()` seul ne
 * suffit pas : `act` doit envelopper l'attente pour que React committe le
 * `setState` qui en résulte.
 */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function rendre(prospects: ProspectView[]) {
  return renderWithPreferences(
    <TodayScreen
      prospects={prospects}
      currentRulesetVersion="v2"
      now={AUJOURDHUI}
      onSignOut={vi.fn()}
    />,
  );
}

describe('TodayScreen', () => {
  it('n inscrit pas un prospect sans score dans une file de travail', () => {
    // Sur la base reelle, 10 prospects sur 139 n'ont aucun score (releve du
    // 2 septembre 2026). Ils n'ont
    // pas de ligne — aucune action n'est possible dessus. L'ancien couple
    // « Qualifies » / « En base » qui portait cet ecart a ete retire de la
    // bande de progression (voir le rapport de la tache 8, alignement sur la
    // largeur reelle) : plus rien sur cet ecran ne compte ces prospects, mais
    // le fait qu'un prospect non score reste invisible dans les FILES DE
    // TRAVAIL, lui, continue d'etre verifie ici, et l'est aussi au niveau du
    // domaine (`today.test.ts`, « n inscrit un prospect sans score dans
    // aucune file de travail »).
    rendre([vue('a'), vue('b', { score: score(30) })]);
    expect(screen.queryByText('ENTREPRISE a')).toBeNull();
  });

  it('dit pourquoi la file de relances est vide, plutot que de rester muette', () => {
    rendre([vue('a')]);
    expect(screen.getByText(/la table de suivi ne contient encore aucune ligne/)).toBeDefined();
  });

  it('n affiche aucun taux, le schema ne permettant pas d en calculer un', () => {
    // `interaction` enregistre le canal d'un echange, jamais son sens : le
    // numerateur d'un taux de reponse n'existe pas. Mieux vaut un compteur
    // vrai qu'une moyenne inventee ou une tuile inerte a demeure.
    rendre([vue('a')]);
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/taux de réponse/i)).toBeNull();
  });

  it('ouvre le panneau a la premiere fleche et y parcourt les prospects', async () => {
    const user = userEvent.setup();
    rendre([vue('haut', { score: score(90) }), vue('bas', { score: score(50) })]);

    expect(screen.queryByRole('complementary')).toBeNull();

    await user.keyboard('{ArrowDown}');
    const panneau = screen.getByRole('complementary');
    expect(within(panneau).getByRole('heading', { level: 2 }).textContent).toBe('ENTREPRISE haut');

    await user.keyboard('{ArrowDown}');
    // Le panneau n'a pas été quitté : c'est tout l'intérêt du patron (§9.1).
    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent)
      .toBe('ENTREPRISE bas');

    await user.keyboard('{ArrowUp}');
    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent)
      .toBe('ENTREPRISE haut');
  });

  it('ferme le panneau sur Echap sans faire disparaitre la liste', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) })]);

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('complementary')).toBeDefined();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).toBeNull();
    // La liste n'a jamais disparu.
    expect(screen.getByText('ENTREPRISE a')).toBeDefined();
  });

  it('traverse la frontiere entre les deux listes sans reprendre la souris', async () => {
    // Une relance due, puis un prospect neuf : deux sections distinctes, un
    // seul parcours. Buter en fin de section obligerait a reprendre la souris
    // a chaque titre.
    const user = userEvent.setup();
    rendre([
      vue('neuf', { score: score(90) }),
      vue('relance', {
        score: score(50),
        pipeline: {
          status: 'relance',
          nextActionAt: '2026-08-30T10:00:00',
          updatedAt: '2026-08-30T10:00:00Z',
        },
      }),
    ]);

    await user.keyboard('{ArrowDown}');
    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent)
      .toBe('ENTREPRISE relance');

    await user.keyboard('{ArrowDown}');
    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent)
      .toBe('ENTREPRISE neuf');
  });

  it('situe le prospect dans la file, pour qu on sache ou l on en est', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) }), vue('b', { score: score(50) })]);

    await user.keyboard('{ArrowDown}');
    expect(within(screen.getByRole('complementary')).getByText('1 sur 2')).toBeDefined();
  });

  it('signale dans le panneau un score calcule avec un bareme perime', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(30, 'v1') })]);

    await user.keyboard('{ArrowDown}');
    expect(
      within(screen.getByRole('complementary')).getByText(/barème v1, quand le barème en vigueur/),
    ).toBeDefined();
  });

  it('signale une categorie de presence dementie par le site declare', async () => {
    // Le cas d'AUBERT SERVICES en base : categorie « aucune presence web »
    // valant +35, alors que l'enrichissement rapporte un vrai site. Sans ce
    // signalement, la premiere ligne de la file de travail est un prospect
    // disqualifie presente comme le meilleur.
    const user = userEvent.setup();
    rendre([
      vue('a', {
        score: score(30),
        presence: {
          category: 'none',
          finalUrl: null,
          httpStatus: null,
          domainAvailable: null,
          probedAt: null,
        },
        enrichment: {
          status: 'ok',
          phoneE164: null,
          phoneKind: null,
          rating: null,
          reviewCount: null,
          declaredUrl: 'https://aubert-services.fr/serrurier-nantes/',
          matchedName: 'Aubert Services',
          matchConfidence: 0.99,
          enrichedAt: '2026-09-01T14:02:45Z',
        },
      }),
    ]);

    await user.keyboard('{ArrowDown}');
    const panneau = screen.getByRole('complementary');
    expect(within(panneau).getByText(/démentie par le site déclaré/)).toBeDefined();
    // Et l'ecart est visible sans ouvrir le panneau.
    expect(screen.getAllByText('!').length).toBeGreaterThan(0);
  });
});

describe('TodayScreen — la recherche de la barre du haut (lot 3, tache 2)', () => {
  it('filtre reellement les listes de travail affichees', async () => {
    const user = userEvent.setup();
    rendre([
      vue('alpha', { denomination: 'PLOMBERIE ALPHA', score: score(90) }),
      vue('beta', { denomination: 'SERRURERIE BETA', score: score(80) }),
    ]);

    expect(screen.getByText('PLOMBERIE ALPHA')).toBeDefined();
    expect(screen.getByText('SERRURERIE BETA')).toBeDefined();

    const champ = screen.getByRole('searchbox', { name: /Filtrer les listes du jour/ });
    await user.type(champ, 'alpha');

    expect(screen.getByText('PLOMBERIE ALPHA')).toBeDefined();
    expect(screen.queryByText('SERRURERIE BETA')).toBeNull();
  });

  it('le raccourci clavier donne reellement le focus au champ de recherche', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) })]);

    const champ = screen.getByRole('searchbox');
    expect(document.activeElement).not.toBe(champ);

    await user.keyboard('{Control>}k{/Control}');

    expect(document.activeElement).toBe(champ);
  });

  it('affiche le raccourci qui fonctionne reellement sur la plateforme detectee', () => {
    rendre([vue('a', { score: score(90) })]);
    // `⌘K` sur macOS, `Ctrl+K` ailleurs (ui/plateforme.ts) : jamais l'un a la
    // place de l'autre, et jamais un texte different des deux.
    expect(screen.getByText(/^(⌘K|Ctrl\+K)$/)).toBeDefined();
  });

  it('taper dans le champ ne deplace pas la selection de la liste et ne ferme pas le panneau', async () => {
    const user = userEvent.setup();
    rendre([vue('haut', { score: score(90) }), vue('bas', { score: score(50) })]);

    await user.keyboard('{ArrowDown}');
    expect(
      within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent,
    ).toBe('ENTREPRISE haut');

    const champ = screen.getByRole('searchbox');
    await user.click(champ);
    // `shouldIgnoreKeyboard` (ui/list-navigation.ts) ignore deja les fleches
    // et Echap venant d'un <input> ; ce test prouve que ca tient depuis le
    // vrai champ de recherche, et pas seulement en theorie.
    await user.keyboard('{ArrowDown}{Escape}');

    expect(
      within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent,
    ).toBe('ENTREPRISE haut');
  });

  it('dit qu aucune ligne ne correspond a la recherche, distinctement d une liste vide pour une autre raison', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) })]);

    const champ = screen.getByRole('searchbox');
    await user.type(champ, 'aucune-entreprise-ne-porte-ce-nom');

    expect(screen.getByText('Aucune ligne ne correspond à votre recherche.')).toBeDefined();
    // Distinct du texte d'un vide "naturel" (aucun prospect score) : la
    // recherche ne doit pas emprunter ce message-la, ni l'inverse.
    expect(screen.queryByText('Aucun prospect scoré pour le moment.')).toBeNull();
  });

  it('garde le texte d un vide naturel quand la recherche est vide, sans jamais parler de recherche', () => {
    // Aucune relance due, aucune frappe dans le champ : le vide vient de
    // l'etat reel de la base, pas d'une recherche qui l'aurait cause.
    rendre([vue('a')]);
    expect(screen.queryByText('Aucune ligne ne correspond à votre recherche.')).toBeNull();
  });
});

describe('TodayScreen — le panneau reste coherent avec la recherche (correctif de revue, lot 3 tache 2)', () => {
  it('garde le panneau ouvert sur le prospect selectionne quand la recherche l exclut, et nomme l absence de rang', async () => {
    const user = userEvent.setup();
    rendre([
      vue('alpha', { denomination: 'PLOMBERIE ALPHA', score: score(90) }),
      vue('beta', { denomination: 'SERRURERIE BETA', score: score(80) }),
    ]);

    // Selectionne alpha (score le plus haut, premier de la liste).
    await user.keyboard('{ArrowDown}');
    const panneauAvant = screen.getByRole('complementary');
    expect(within(panneauAvant).getByRole('heading', { level: 2 }).textContent).toBe('PLOMBERIE ALPHA');
    expect(within(panneauAvant).getByText('1 sur 2')).toBeDefined();

    // La recherche exclut alpha (mais laisse beta) : la ligne selectionnee
    // disparait de la liste affichee sans que la selection ne bouge.
    const champ = screen.getByRole('searchbox');
    await user.type(champ, 'beta');

    // Le panneau reste monte et affiche toujours la meme fiche — taper dans
    // la recherche ne detruit pas la fiche qu'on lisait.
    const panneauApres = screen.getByRole('complementary');
    expect(within(panneauApres).getByRole('heading', { level: 2 }).textContent).toBe('PLOMBERIE ALPHA');
    // Le rang n'a plus de sens relativement a une liste qui ne contient plus
    // la ligne : aucun texte de la forme "N sur M" ne doit rester.
    expect(within(panneauApres).queryByText(/^\d+ sur \d+$/)).toBeNull();
    // Et l'absence se nomme, plutot que de laisser un trou silencieux.
    expect(within(panneauApres).getByText('Hors du filtre de recherche en cours')).toBeDefined();
  });

  it('n affiche nulle part 0 sur 0 quand le filtre du prospect ouvert ne laisse plus aucune ligne', async () => {
    const user = userEvent.setup();
    rendre([vue('alpha', { denomination: 'PLOMBERIE ALPHA', score: score(90) })]);

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('complementary')).toBeDefined();

    const champ = screen.getByRole('searchbox');
    await user.type(champ, 'aucune-entreprise-ne-porte-ce-nom');

    const panneau = screen.getByRole('complementary');
    expect(within(panneau).getByRole('heading', { level: 2 }).textContent).toBe('PLOMBERIE ALPHA');
    // Nulle part sur l'ecran, ni dans le panneau ni ailleurs.
    expect(screen.queryByText('0 sur 0')).toBeNull();
    expect(within(panneau).queryByText(/^\d+ sur \d+$/)).toBeNull();
    expect(within(panneau).getByText('Hors du filtre de recherche en cours')).toBeDefined();
  });

  it('rend un rang correct, relatif a la liste filtree, quand le prospect ouvert y figure toujours', async () => {
    const user = userEvent.setup();
    rendre([
      vue('alpha', { denomination: 'PLOMBERIE ALPHA', score: score(90) }),
      vue('beta', { denomination: 'SERRURERIE BETA', score: score(80) }),
    ]);

    await user.keyboard('{ArrowDown}');
    const champ = screen.getByRole('searchbox');
    // Exclut beta, laisse alpha : la liste filtree ne contient plus qu une
    // ligne, et le prospect ouvert y figure toujours.
    await user.type(champ, 'alpha');

    const panneau = screen.getByRole('complementary');
    expect(within(panneau).getByRole('heading', { level: 2 }).textContent).toBe('PLOMBERIE ALPHA');
    // "1 sur 1", relatif a la liste FILTREE — pas "1 sur 2" de la liste
    // complete.
    expect(within(panneau).getByText('1 sur 1')).toBeDefined();
    expect(within(panneau).queryByText('Hors du filtre de recherche en cours')).toBeNull();
  });
});

describe('TodayScreen — le journal de deploiement (tache 11)', () => {
  it('ne lit aucun evenement tant qu aucun prospect n est ouvert', () => {
    // La table ne doit jamais etre interrogee si le panneau n'est pas
    // affiche : ni au montage, ni pour un prospect present dans une liste
    // mais non selectionne.
    const { client, appels } = fakeEventsClient([]);
    renderWithPreferences(
      <TodayScreen
        prospects={[vue('a', { score: score(90) })]}
        currentRulesetVersion="v2"
        now={AUJOURDHUI}
        onSignOut={vi.fn()}
        client={client}
      />,
    );
    expect(appels).toEqual([]);
  });

  it('affiche les evenements reels du prospect ouvert, une fois la lecture aboutie', async () => {
    const { client } = fakeEventsClient([evenementBuildReussi]);
    const user = userEvent.setup();
    renderWithPreferences(
      <TodayScreen
        prospects={[vue('a', { score: score(90) })]}
        currentRulesetVersion="v2"
        now={AUJOURDHUI}
        onSignOut={vi.fn()}
        client={client}
      />,
    );

    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('tab', { name: /Historique/ }));

    // `findByText` attend la resolution de la promesse simulee : c'est la
    // preuve que l'evenement traverse bien hook -> TodayScreen -> ProspectPanel
    // -> HistoriqueTab, et non une valeur deja presente au premier rendu.
    expect(await screen.findByText('Réussi')).toBeDefined();
    expect(screen.getByText('Build')).toBeDefined();
    // 92000 ms = 1 min 32 s, meme conversion que HistoriqueTab.test.tsx.
    expect(screen.getByText('1 m 32')).toBeDefined();
  });

  it('un prospect avec des jalons mais sans evenement affiche quand meme ses jalons', async () => {
    // Le cas des vingt-deux sites deja en ligne : la lecture reseau aboutit
    // reellement (contrairement au defaut `events={[]}` teste par
    // HistoriqueTab.test.tsx), et rend un tableau vide — la frise des jalons
    // ne doit pas en souffrir.
    const { client } = fakeEventsClient([]);
    const user = userEvent.setup();
    renderWithPreferences(
      <TodayScreen
        prospects={[
          vue('a', {
            score: score(90),
            site: {
              repoUrl: 'https://github.com/prospeo/x',
              deploymentUrl: 'https://x.vercel.app',
              promptVersion: 'v4',
              model: 'claude-opus-5',
              generatedAt: '2026-09-01T14:18:00Z',
              publishedAt: '2026-09-01T14:22:00Z',
              unpublishedAt: null,
              contentRejectedAt: null,
              redaction: null,
            },
          }),
        ]}
        currentRulesetVersion="v2"
        now={AUJOURDHUI}
        onSignOut={vi.fn()}
        client={client}
      />,
    );

    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('tab', { name: /Historique/ }));

    expect(await screen.findByText(/Site publié/)).toBeDefined();
    expect(screen.getByText('Aucun événement enregistré')).toBeDefined();
  });

  it('ignore une reponse tardive du prospect quitte (garde anti-reponse-tardive)', async () => {
    // Finding 1 du relevé de revue. A est ouvert en premier ; on bascule
    // vers B avant que la lecture de A n'aboutisse ; B répond d'abord ; la
    // réponse de A, tardive, ne doit jamais s'écrire dans le panneau — déjà
    // sur B au moment où elle arrive.
    const user = userEvent.setup();
    const { client, attentes } = fakeEventsClientControlee();
    renderWithPreferences(
      <TodayScreen
        prospects={[vue('a', { score: score(90) }), vue('b', { score: score(50) })]}
        currentRulesetVersion="v2"
        now={AUJOURDHUI}
        onSignOut={vi.fn()}
        client={client}
      />,
    );

    // Ouvre A (le score le plus haut est selectionne en premier — meme ordre
    // que le test de navigation clavier ci-dessus) : une lecture part.
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('tab', { name: /Historique/ }));
    expect(attentes).toHaveLength(1);
    expect(attentes[0]!.prospectId).toBe('a');

    // Bascule vers B avant que A ne reponde : deuxieme lecture en attente.
    // L'onglet Historique reste actif — c'est le meme `ProspectPanel` monte,
    // seules ses props changent (voir TodayScreen.tsx).
    await user.keyboard('{ArrowDown}');
    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent)
      .toBe('ENTREPRISE b');
    expect(attentes).toHaveLength(2);
    expect(attentes[1]!.prospectId).toBe('b');

    // B répond d'abord.
    attentes[1]!.resolve([
      { step: 'en_ligne', outcome: 'reussi', detail: null, duration_ms: null, occurred_at: '2026-09-01T14:22:00Z' },
    ]);
    expect(await screen.findByText('Mise en ligne')).toBeDefined();

    // A répond ensuite, en retard : `evenementBuildReussi` porte l'étape
    // « Build », absente de la réponse de B — un marqueur sans ambiguïté.
    attentes[0]!.resolve([evenementBuildReussi]);
    await flush();

    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent)
      .toBe('ENTREPRISE b');
    expect(screen.queryByText('Build')).toBeNull();
    expect(screen.getByText('Mise en ligne')).toBeDefined();
  });

  it('reinitialise la lecture a la fermeture, sans laisser une reponse tardive s ecrire au silence', async () => {
    // Finding 2 du relevé de revue. Fermer garde `selectedId` mais retombe
    // `prospectId` à `null` (`panelOpen ? selectedId : null`, TodayScreen.tsx) :
    // une réponse qui arrive panneau fermé ne doit rien afficher, et rouvrir
    // le même prospect doit relire pour de vrai, pas rejouer une réponse
    // déjà en poche.
    const user = userEvent.setup();
    const { client, attentes } = fakeEventsClientControlee();
    renderWithPreferences(
      <TodayScreen
        prospects={[vue('a', { score: score(90) })]}
        currentRulesetVersion="v2"
        now={AUJOURDHUI}
        onSignOut={vi.fn()}
        client={client}
      />,
    );

    // Ouvre : une lecture part.
    await user.keyboard('{ArrowDown}');
    expect(attentes).toHaveLength(1);

    // Ferme AVANT que la réponse n'arrive.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).toBeNull();

    // La réponse arrive tardivement, panneau fermé : rien ne doit planter,
    // et rien ne s'affiche puisqu'aucun panneau n'est monté.
    attentes[0]!.resolve([evenementBuildReussi]);
    await flush();
    expect(screen.queryByRole('complementary')).toBeNull();

    // Rouvre le MÊME prospect : si la fermeture avait vraiment coupé la
    // lecture (et pas seulement cessé de l'afficher), une lecture fraîche
    // repart — deuxième appel réseau, distinct du premier.
    await user.keyboard('{ArrowDown}');
    expect(attentes).toHaveLength(2);
    await user.click(screen.getByRole('tab', { name: /Historique/ }));
    // Tant que cette seconde lecture n'a pas répondu, la réponse de la
    // première (pourtant déjà résolue plus haut) n'a rien laissé fuiter dans
    // ce nouveau montage.
    expect(screen.queryByText('Réussi')).toBeNull();

    attentes[1]!.resolve([evenementBuildReussi]);
    expect(await screen.findByText('Réussi')).toBeDefined();
  });

  it('n affirme pas « aucun evenement » pendant que la lecture est en vol', async () => {
    // La lecture reste suspendue : c'est exactement l'etat traverse a chaque
    // ouverture de panneau. L'onglet y affichait « Aucun evenement enregistre
    // — le dernier fait connu remonte au ... », une affirmation POSITIVE sur
    // l'histoire du prospect, enoncee avant qu'aucune reponse ne soit
    // arrivee, et fausse pour tout prospect qui a des evenements.
    const user = userEvent.setup();
    const { client, attentes } = fakeEventsClientControlee();
    renderWithPreferences(
      <TodayScreen
        prospects={[vue('a', { score: score(90) })]}
        currentRulesetVersion="v2"
        now={AUJOURDHUI}
        onSignOut={vi.fn()}
        client={client}
      />,
    );

    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('tab', { name: /Historique/ }));
    expect(attentes).toHaveLength(1);

    // En vol : ni vide date, ni erreur.
    expect(screen.queryByText('Aucun événement enregistré')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Chargement…')).toBeDefined();

    // La reponse arrive : le chargement cede la place aux faits reels.
    attentes[0]!.resolve([evenementBuildReussi]);
    expect(await screen.findByText('Réussi')).toBeDefined();
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  it('signale un echec de lecture au lieu de le confondre avec un prospect sans historique', async () => {
    // Finding 4 du relevé de revue.
    const user = userEvent.setup();
    const { client, appels } = fakeEventsClientErreur('Row level security violation');
    renderWithPreferences(
      <TodayScreen
        prospects={[vue('a', { score: score(90) })]}
        currentRulesetVersion="v2"
        now={AUJOURDHUI}
        onSignOut={vi.fn()}
        client={client}
      />,
    );

    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('tab', { name: /Historique/ }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText('Lecture impossible')).toBeDefined();
    // Le message vient de `fetchEventsFor` (data/deployments.ts), pas
    // inventé ici.
    expect(
      screen.getByText('deployment_event : lecture impossible pour a — Row level security violation'),
    ).toBeDefined();
    // Distinct du vide daté d'un prospect sans événement : la panne ne dit
    // rien sur l'historique réel de ce prospect.
    expect(screen.queryByText('Aucun événement enregistré')).toBeNull();

    const appelsAvantReessai = appels.length;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(appels.length).toBeGreaterThan(appelsAvantReessai);
  });
});
