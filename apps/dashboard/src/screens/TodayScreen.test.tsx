import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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
 * Client simulé pour `deployment_event` — tâche 11, le câblage du journal.
 *
 * Reproduit uniquement la chaîne que `fetchEventsFor` (data/deployments.ts)
 * appelle : `from('deployment_event').select(...).eq('prospect_id', id)
 * .order('occurred_at', ...)`. `appels` enregistre chaque table demandée,
 * pour la preuve négative (aucune lecture sans sélection).
 */
function fakeEventsClient(lignes: Record<string, unknown>[]) {
  const appels: string[] = [];
  const client = {
    from(table: string) {
      appels.push(table);
      return {
        select() {
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
  it('rend l ecart entre prospects decouverts et prospects juges lisible sans lister ces derniers', () => {
    // Sur la base reelle, 114 prospects sur 139 n'ont aucun score. Ils n'ont
    // pas de ligne — aucune action n'est possible dessus — mais l'ecart doit
    // sauter aux yeux, sans quoi l'ecran laisse croire que la base compte
    // deux entreprises.
    rendre([vue('a'), vue('b', { score: score(30) })]);
    const bande = screen.getByText('Qualifiés').closest('div');
    expect(bande?.textContent).toContain('1');
    expect(screen.getByText('En base').closest('div')?.textContent).toContain('2');
    // Le prospect sans score n'apparait dans aucune file de travail.
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
});
