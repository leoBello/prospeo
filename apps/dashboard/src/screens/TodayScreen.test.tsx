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

/**
 * Quinze prospects scorés, sans aucune ligne de suivi : ils tombent donc tous
 * dans « à contacter » (décision 1A), et l'onglet compte plus que les dix
 * lignes d'une page. C'est le cas que l'ancienne liste plafonnée à douze
 * lignes ne savait pas montrer.
 */
function quinzeProspectsScores(): ProspectView[] {
  return Array.from({ length: 15 }, (_, i) => vue(`p${i}`, { score: score(90 - i) }));
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

  it('traverse la frontiere entre la bande des relances et la table sans reprendre la souris', async () => {
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
    // L'assertion « et l'ecart est visible sans ouvrir le panneau » a ete
    // retiree ici : elle portait sur la pastille « ! » de `ProspectRow`, et ce
    // prospect ne passe plus par cette rangee-la — sans ligne de suivi, il est
    // dans la TABLE, dont les six colonnes (tache 6) ne portent pas ce
    // signalement. Correctif de revue (tache 9) : ce fichier n'a JAMAIS eu
    // d'assertion sur la pastille — dit ici a tort dans une version anterieure
    // de ce commentaire. Le calcul de l'ecart est couvert par
    // `domain/coherence.test.ts`, le rendu de la pastille par
    // `ui/ScoreBar.test.tsx`, et le CABLAGE `ProspectRow -> dataWarnings ->
    // ScoreBar` par `ui/ProspectRow.test.tsx` (cas ajoute au meme correctif).
    // Reserve reportee au rapport de la tache 9.
  });
});

describe('TodayScreen — la table de veille remplace la liste plafonnee (tache 9)', () => {
  it('montre la table par onglets a la place de l ancienne liste plafonnee', () => {
    // L'ancienne liste s'arretait a douze lignes et annoncait le reste par
    // « N de plus, non affiches ici » (`list.overflow`). C'est le defaut que
    // ce chantier corrige POUR LA TABLE : quinze prospects scores tiennent
    // desormais sur deux pages, aucun n'est annonce sans etre atteignable.
    //
    // Correctif de revue (tache 9) : sur la seule fixture `quinzeProspectsScores`
    // (aucune ligne de suivi, donc aucune relance due), le texte ne pouvait
    // de toute facon jamais apparaitre nulle part — la bande des relances
    // etant vide de naissance, l'assertion etait incapable de rougir. Elle
    // porte maintenant sur une fixture qui AJOUTE quatorze relances en
    // retard : la bande (WorkListSection, inchangee par cette tache) plafonne
    // toujours et affiche bien le texte — la ligne suivante le prouve avant
    // de verifier qu'il reste absent de LA TABLE precisement.
    rendre([
      ...quinzeProspectsScores(),
      ...Array.from({ length: 14 }, (_, i) =>
        vue(`r${i}`, {
          score: score(50 - i),
          pipeline: { status: 'relance', nextActionAt: '2026-08-20T10:00:00', updatedAt: '2026-08-20T10:00:00Z' },
        }),
      ),
    ]);
    expect(screen.getByRole('tablist', { name: 'Statut de suivi' })).toBeDefined();
    expect(screen.getAllByRole('tab')).toHaveLength(8);
    // La bande porte bien le texte : preuve que la fixture atteint le seuil
    // et que l'assertion suivante teste quelque chose de reel.
    expect(screen.getByText(/de plus, non affichés ici/)).toBeDefined();
    const table = screen.getByRole('region', { name: 'Toute la veille' });
    expect(within(table).queryByText(/de plus, non affichés ici/)).toBeNull();
  });

  it('ne descend jamais sous dix lignes affichees quand l onglet en contient plus', () => {
    rendre(quinzeProspectsScores());
    expect(screen.getByText('1–10 sur 15')).toBeDefined();
  });

  it('ne titre nulle part « Toute la veille » : c est le nom accessible de la section, et rien d autre', () => {
    // Decision du 2026-09-10. La maquette titre la section par le nom de
    // l'onglet ouvert ; « Toute la veille » ne designe pas un onglet mais
    // l'assemblage entier, et l'ecrire a l'ecran ferait deux titres pour une
    // seule chose.
    rendre(quinzeProspectsScores());
    expect(screen.getByRole('region', { name: 'Toute la veille' })).toBeDefined();
    expect(screen.queryByText('Toute la veille')).toBeNull();
  });

  it('parcourt les relances puis la table sans buter sur un prospect present dans les deux', async () => {
    // Decision 2A : la bande « Relances dues » et l'onglet « Relance » se
    // recouvrent, et le MEME prospect figure dans les deux. Sans
    // dedoublonnage des `ids`, `indexOf` ramenerait toujours a sa premiere
    // occurrence et la fleche resterait bloquee sur lui, sans jamais
    // atteindre la ligne suivante de la table.
    const user = userEvent.setup();
    rendre([
      vue('due', {
        score: score(90),
        pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' },
      }),
      // Echeance a venir : dans l'onglet « Relance », jamais dans la bande.
      vue('a-venir', {
        score: score(80),
        pipeline: { status: 'relance', nextActionAt: '2026-09-10T10:00:00', updatedAt: '2026-08-30T10:00:00Z' },
      }),
    ]);

    await user.click(screen.getByRole('tab', { name: 'Relancé : 2 prospects' }));

    // Premiere fleche : la ligne de relance, en tete de la bande.
    await user.keyboard('{ArrowDown}');
    expect(document.getElementById('prospect-due')?.getAttribute('aria-current')).toBe('true');

    // Seconde fleche : la ligne SUIVANTE de la table, et non un retour sur
    // « due » — qui figure pourtant aussi dans l'onglet ouvert. Prefixe
    // `veille-prospect-` : c'est la ligne de `RangeeVeille`, jamais celle de
    // `ProspectRow` (constat de revue, tache 9 — deux noeuds ne peuvent
    // partager un meme id).
    await user.keyboard('{ArrowDown}');
    expect(document.getElementById('veille-prospect-a-venir')?.getAttribute('aria-current')).toBe('true');
  });

  it('pose deux identifiants distincts quand le meme prospect figure dans la bande et la table', async () => {
    // Decision 2A, cas nominal : un prospect relance figure a la fois dans
    // la bande (`ProspectRow`, id `prospect-<id>`) et dans son onglet
    // (`RangeeVeille`, id `veille-prospect-<id>`). Deux noeuds ne peuvent
    // legitimement partager un meme `id` (HTML invalide) : la preuve porte
    // sur les DEUX identifiants, chacun unique dans le document.
    const user = userEvent.setup();
    rendre([
      vue('due', {
        score: score(90),
        pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' },
      }),
    ]);

    await user.click(screen.getByRole('tab', { name: 'Relancé : 1 prospect' }));

    const ligneBande = document.getElementById('prospect-due');
    const ligneTable = document.getElementById('veille-prospect-due');
    expect(ligneBande).not.toBeNull();
    expect(ligneTable).not.toBeNull();
    expect(ligneBande).not.toBe(ligneTable);
    expect(document.querySelectorAll('[id="prospect-due"]')).toHaveLength(1);
    expect(document.querySelectorAll('[id="veille-prospect-due"]')).toHaveLength(1);
  });

  it('revient a la premiere page quand l onglet change', async () => {
    // `pageVeille` borne deja la page rendue : ce que ce geste corrige, c'est
    // l'ETAT, qui resterait sinon sur un numero que plus rien ne justifie —
    // une page 2 heritee d'un autre onglet, ouverte au milieu du classement.
    const user = userEvent.setup();
    rendre([
      ...quinzeProspectsScores(),
      ...Array.from({ length: 12 }, (_, i) =>
        vue(`c${i}`, {
          score: score(70 - i),
          pipeline: { status: 'contacte', nextActionAt: null, updatedAt: '2026-08-25T10:00:00Z' },
        }),
      ),
    ]);

    await user.click(screen.getByRole('button', { name: 'Page 2 sur 2' }));
    expect(screen.getByText('11–15 sur 15')).toBeDefined();

    await user.click(screen.getByRole('tab', { name: 'Contacté : 12 prospects' }));
    expect(screen.getByText('1–10 sur 12')).toBeDefined();
  });

  it('revient a la premiere page quand l ordre change', async () => {
    const user = userEvent.setup();
    rendre(quinzeProspectsScores());

    await user.click(screen.getByRole('button', { name: 'Page 2 sur 2' }));
    expect(screen.getByText('11–15 sur 15')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Tri : score décroissant' }));
    expect(screen.getByText('1–10 sur 15')).toBeDefined();
  });

  it('revient a la premiere page quand la recherche change', async () => {
    const user = userEvent.setup();
    rendre(quinzeProspectsScores());

    await user.click(screen.getByRole('button', { name: 'Page 2 sur 2' }));
    expect(screen.getByText('11–15 sur 15')).toBeDefined();

    // « ENTREPRISE » les retient tous les quinze : la page 2 existe toujours,
    // et c'est bien l'etat qui doit revenir a 1, pas le bornage.
    await user.type(screen.getByRole('searchbox'), 'entreprise');
    expect(screen.getByText('1–10 sur 15')).toBeDefined();
  });

  it('distingue un onglet vide par la recherche d un onglet vide de naissance', async () => {
    // `ongletPleinSansRecherche` se calcule sur `prospects`, jamais sur les
    // prospects filtres : sur ces derniers il vaudrait zero au moment precis
    // ou il sert, et l'ecran attribuerait au vide une cause qui n'est pas la
    // sienne.
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) }), vue('b', { score: score(80) })]);

    await user.type(screen.getByRole('searchbox'), 'aucune-entreprise-ne-porte-ce-nom');

    expect(screen.getByText('Aucune ligne ne correspond à votre recherche')).toBeDefined();
    expect(screen.queryByText('Aucun prospect à contacter')).toBeNull();
    // Et la sortie proposee efface la recherche plutot que de laisser l'ecran
    // dans un vide sans issue.
    await user.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(screen.getByText('1–2 sur 2')).toBeDefined();
  });

  it('garde le texte d un onglet vide de naissance, meme pendant une recherche', async () => {
    // L'onglet « a contacter » n'a jamais rien contenu ici : le seul prospect
    // porte une ligne de suivi « relance ». Lui attribuer le vide de la
    // recherche mentirait sur la cause.
    const user = userEvent.setup();
    rendre([
      vue('r', {
        score: score(90),
        pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' },
      }),
    ]);

    await user.type(screen.getByRole('searchbox'), 'aucune-entreprise-ne-porte-ce-nom');

    expect(screen.getByText('Aucun prospect à contacter')).toBeDefined();
    expect(screen.queryByText('Aucune ligne ne correspond à votre recherche')).toBeNull();
  });
});

describe('TodayScreen — le bouton de repli du brief est sur la ligne de titre (constat de revue 4 et 5)', () => {
  it('pose « Replier le brief » sur la ligne du titre « Aujourd hui », pas dans une rangée séparée', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) })]);

    const titre = screen.getByRole('heading', { level: 1, name: 'Aujourd\'hui' });
    const bouton = screen.getByRole('button', { name: 'Replier le brief' });
    // Même parent : c'est la preuve, indépendante de toute mise en page, que
    // le bouton est sur LA MÊME LIGNE que le titre — et non sous l'intro,
    // dans une rangée à lui seul (relevé de revue, constat 4).
    expect(bouton.parentElement).toBe(titre.parentElement);

    // Il fonctionne réellement depuis là, et la préférence partagée avec
    // `BriefDuJour` (`usePreferences`) bascule bien vers le résumé replié.
    await user.click(bouton);
    expect(screen.queryByRole('button', { name: 'Replier le brief' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Déplier' })).toBeDefined();
  });

  it('efface le bouton de la ligne de titre une fois le brief replié : « Déplier » reste dans le résumé, jamais dans le titre', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) })]);

    const titre = screen.getByRole('heading', { level: 1, name: 'Aujourd\'hui' });
    await user.click(screen.getByRole('button', { name: 'Replier le brief' }));

    const deplier = screen.getByRole('button', { name: 'Déplier' });
    expect(deplier.parentElement).not.toBe(titre.parentElement);
  });

  it('donne une classe aux deux boutons du brief, jamais le bouton nu du navigateur (constat de revue 5)', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) })]);

    const replier = screen.getByRole('button', { name: 'Replier le brief' });
    expect(replier.className).not.toBe('');

    await user.click(replier);
    expect(screen.getByRole('button', { name: 'Déplier' }).className).not.toBe('');
  });
});

describe('TodayScreen — les nombres qui disent « en base » restent vrais pendant une recherche (constat de revue 2)', () => {
  it('garde les deux nombres de l onglet « Toutes » sur la meme population — la base entiere — meme sous recherche', async () => {
    const user = userEvent.setup();
    rendre([
      vue('alpha', { denomination: 'PLOMBERIE ALPHA', score: score(90) }),
      vue('beta', { denomination: 'SERRURERIE BETA', score: score(80) }),
      vue('gamma', { denomination: 'ENTREPRISE GAMMA', score: null }),
    ]);

    // Le nom accessible de l'onglet porte aussi son compte
    // (`veille.onglet.compte.aria`) : « Toutes » seul ne correspond à rien.
    await user.click(screen.getByRole('tab', { name: /^Toutes/ }));
    await user.type(screen.getByRole('searchbox'), 'alpha');

    // Avant le correctif : « 1 classables, sur 3 prospects en base » — le
    // numerateur filtre par la recherche (seul alpha la contient), le
    // denominateur non — une fraction qui pretend que seul 1 prospect sur 3
    // serait classable dans TOUTE la base, alors que 2 le sont reellement
    // (alpha et beta). Les deux nombres doivent decrire la MEME population :
    // la base entiere, insensible a la recherche.
    expect(screen.getByText('2 classables, sur 3 prospects en base')).toBeDefined();
  });

  it('dit vrai sur « en base », a contacter aussi : le denominateur ignore la recherche, le numerateur continue de montrer ce qui est affiche', async () => {
    const user = userEvent.setup();
    rendre([
      vue('alpha', { denomination: 'PLOMBERIE ALPHA', score: score(90) }), // sans ligne de suivi
      vue('beta', { denomination: 'SERRURERIE BETA', score: score(80) }), // sans ligne de suivi
    ]);

    await user.type(screen.getByRole('searchbox'), 'alpha');

    // Sans le correctif : « 1 classables, sur 1 sans aucune ligne de suivi en
    // base » — les deux nombres etaient filtres (alpha seul), et le second
    // pretendait pourtant decrire la base entiere (qui compte deux prospects
    // sans ligne de suivi, alpha ET beta). Le correctif ne touche que le
    // denominateur : le numerateur reste ce que la recherche montre.
    expect(screen.getByText('1 classables, sur 2 sans aucune ligne de suivi en base')).toBeDefined();
  });

  it('garde le badge des jamais scores sur son compte reel de la base, meme sous recherche', async () => {
    const user = userEvent.setup();
    rendre([
      vue('alpha', { denomination: 'PLOMBERIE ALPHA', score: score(90) }),
      vue('gamma', { denomination: 'ENTREPRISE GAMMA', score: null }),
    ]);

    await user.type(screen.getByRole('searchbox'), 'alpha');

    // La recherche « alpha » exclut gamma des prospects filtres : si le
    // badge se recalculait sur cette liste filtree (comme avant ce
    // correctif), il disparaitrait alors que le prospect jamais score existe
    // toujours en base.
    expect(screen.getByText('1 jamais scoré, non classable')).toBeDefined();
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

    const champ = screen.getByRole('searchbox', { name: /Filtrer les relances dues et la table de statuts/ });
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

  it('dit qu aucune relance ne correspond a la recherche, distinctement d une bande vide pour une autre raison', async () => {
    // `today.empty.search` garde son consommateur : la recherche filtre
    // encore la bande des relances dues. Le prospect porte donc ici une
    // echeance echue — sans elle, la bande serait vide de naissance et ce
    // n'est pas ce que ce cas verifie.
    const user = userEvent.setup();
    rendre([
      vue('a', {
        score: score(90),
        pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' },
      }),
    ]);

    const champ = screen.getByRole('searchbox');
    await user.type(champ, 'aucune-entreprise-ne-porte-ce-nom');

    expect(screen.getByText('Aucune ligne ne correspond à votre recherche.')).toBeDefined();
    // Distinct du texte d'un vide "naturel" (aucune ligne de suivi en base) :
    // la recherche ne doit pas emprunter ce message-la, ni l'inverse.
    expect(screen.queryByText(/la table de suivi ne contient encore aucune ligne/)).toBeNull();
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
