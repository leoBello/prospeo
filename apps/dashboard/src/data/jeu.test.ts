import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import {
  fetchEntreesJeu,
  fetchJeu,
  interactionRangeReader,
  pipelineEventRangeReader,
  sitesMisEnLigneRangeReader,
  toFaitsInteraction,
  toFaitsMiseEnLigne,
  toFaitsPipeline,
} from './jeu.js';

/**
 * Constructeur de table simulée : enregistre les appels (`select`, `eq`,
 * `order`, `range`) et répond selon `reponses`, un lecteur de tranche au sens
 * de `paginate.ts`. Générique plutôt que calqué sur une chaîne PostgREST
 * précise : ce dont les tests ci-dessous ont besoin, c'est de PROUVER quelles
 * colonnes de filtre et de tri partent, et combien de tranches sont demandées
 * — pas de reproduire la forme exacte de la chaîne.
 */
function fakeTable(reponses: (from: number, to: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>) {
  const appels = {
    selects: [] as string[],
    eqs: [] as [string, unknown][],
    orders: [] as [string, boolean | undefined][],
    ranges: [] as [number, number][],
  };
  const builder = {
    select(colonnes: string) {
      appels.selects.push(colonnes);
      return builder;
    },
    eq(colonne: string, valeur: unknown) {
      appels.eqs.push([colonne, valeur]);
      return builder;
    },
    order(colonne: string, options?: { ascending?: boolean }) {
      appels.orders.push([colonne, options?.ascending]);
      return builder;
    },
    range(from: number, to: number) {
      appels.ranges.push([from, to]);
      return reponses(from, to);
    },
  };
  return { builder, appels };
}

/** Une table qui rend toujours `pages`, une tranche à la fois, comme `fakeServer` de `paginate.test.ts`. */
function tablePaginee(pages: unknown[][]) {
  let page = 0;
  return fakeTable(async () => {
    const data = pages[page] ?? [];
    page += 1;
    return { data, error: null };
  });
}

/** Une table dont la lecture échoue toujours — pour distinguer un échec d'un résultat vide. */
function tableEnErreur(message: string) {
  return fakeTable(async () => ({ data: null, error: { message } }));
}

/** Une table qui ne rend jamais de page incomplète : force `fetchAllRows` à boucler jusqu'au `hardLimit`. */
function tableSansFin(tailleLigne: () => unknown) {
  return fakeTable(async (from, to) => {
    const largeur = to - from + 1;
    return { data: Array.from({ length: largeur }, tailleLigne), error: null };
  });
}

function fakeClient(tables: {
  pipeline_event?: ReturnType<typeof fakeTable>['builder'];
  interaction?: ReturnType<typeof fakeTable>['builder'];
  deployment_event?: ReturnType<typeof fakeTable>['builder'];
}) {
  const vide = fakeTable(async () => ({ data: [], error: null })).builder;
  return {
    from(table: string) {
      if (table === 'pipeline_event') return tables.pipeline_event ?? vide;
      if (table === 'interaction') return tables.interaction ?? vide;
      if (table === 'deployment_event') return tables.deployment_event ?? vide;
      throw new Error(`table inattendue dans le test : ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
}

const ligneObservee = {
  prospect_id: 'p1',
  status: 'relance',
  next_action_at: '2026-08-20',
  origin: 'observe',
  occurred_at: '2026-08-20T09:00:00Z',
};

describe('toFaitsPipeline', () => {
  it('garde une ligne valide, next_action_at compris', () => {
    expect(toFaitsPipeline([ligneObservee])).toEqual([
      {
        prospectId: 'p1',
        status: 'relance',
        nextActionAt: '2026-08-20',
        origin: 'observe',
        occurredAt: '2026-08-20T09:00:00Z',
      },
    ]);
  });

  it('garde next_action_at a null — une echeance absente est un fait, pas un defaut a combler', () => {
    const [fait] = toFaitsPipeline([{ ...ligneObservee, next_action_at: null }]);
    expect(fait!.nextActionAt).toBeNull();
  });

  it('ecarte un statut hors enumeration plutot que de le forcer', () => {
    expect(toFaitsPipeline([{ ...ligneObservee, status: 'statut_inconnu' }])).toEqual([]);
  });

  it('ecarte une origine hors enumeration plutot que de la forcer', () => {
    expect(toFaitsPipeline([{ ...ligneObservee, origin: 'origine_inconnue' }])).toEqual([]);
  });

  it('ecarte une ligne sans occurred_at, qui ne peut nourrir aucun calcul date', () => {
    expect(toFaitsPipeline([{ ...ligneObservee, occurred_at: null }])).toEqual([]);
  });

  it('ecarte une ligne sans prospect_id', () => {
    expect(toFaitsPipeline([{ ...ligneObservee, prospect_id: null }])).toEqual([]);
  });

  it('rend un tableau vide sur une entree qui n est pas un tableau', () => {
    expect(toFaitsPipeline(null)).toEqual([]);
  });
});

describe('toFaitsInteraction', () => {
  it('garde une ligne valide', () => {
    expect(toFaitsInteraction([{ prospect_id: 'p1', occurred_at: '2026-08-20T09:00:00Z' }])).toEqual([
      { prospectId: 'p1', occurredAt: '2026-08-20T09:00:00Z' },
    ]);
  });

  it('ecarte une ligne sans occurred_at', () => {
    expect(toFaitsInteraction([{ prospect_id: 'p1', occurred_at: null }])).toEqual([]);
  });
});

describe('toFaitsMiseEnLigne', () => {
  it('garde une ligne valide', () => {
    expect(toFaitsMiseEnLigne([{ prospect_id: 'p1', occurred_at: '2026-08-20T09:00:00Z' }])).toEqual([
      { prospectId: 'p1', occurredAt: '2026-08-20T09:00:00Z' },
    ]);
  });

  it('ecarte une ligne sans prospect_id', () => {
    expect(toFaitsMiseEnLigne([{ prospect_id: null, occurred_at: '2026-08-20T09:00:00Z' }])).toEqual([]);
  });
});

describe('pipelineEventRangeReader / interactionRangeReader', () => {
  it('ordonnent sur la cle primaire, sans quoi la pagination peut relire ou sauter des lignes', async () => {
    const { builder, appels } = tablePaginee([[]]);
    await pipelineEventRangeReader(fakeClient({ pipeline_event: builder }))(0, 999);
    expect(appels.orders).toEqual([['id', true]]);
  });

  it('interactionRangeReader ordonne aussi sur id', async () => {
    const { builder, appels } = tablePaginee([[]]);
    await interactionRangeReader(fakeClient({ interaction: builder }))(0, 999);
    expect(appels.orders).toEqual([['id', true]]);
  });
});

describe('sitesMisEnLigneRangeReader', () => {
  it('filtre sur step=en_ligne et outcome=reussi cote serveur — c est la definition donnee, pas une decision de ce fichier', async () => {
    const { builder, appels } = tablePaginee([[]]);
    await sitesMisEnLigneRangeReader(fakeClient({ deployment_event: builder }))(0, 999);
    expect(appels.eqs).toEqual([
      ['step', 'en_ligne'],
      ['outcome', 'reussi'],
    ]);
  });
});

describe('fetchEntreesJeu — la borne sur les lectures qui grandissent', () => {
  it('lit TOUTES les lignes au-dela d une seule page, sans les tronquer a la premiere tranche', async () => {
    // Preuve positive de la borne choisie : `fetchAllRows` (pagination
    // complete, garde-fou `hardLimit`) plutot qu'un `.limit(N)` fixe. Un
    // plafond en nombre de lignes couperait la fenetre de jours du jeu
    // (objectif, serie) en plein milieu sans le signaler ; une lecture
    // integrale, elle, ne perd aucune ligne — seul un volume vraiment
    // aberrant (hardLimit, teste plus bas) fait echouer la lecture.
    const pages = [[ligneObservee], [{ ...ligneObservee, prospect_id: 'p2' }]];
    const { builder, appels } = tablePaginee(pages);
    const entrees = await fetchEntreesJeu(
      fakeClient({ pipeline_event: builder }),
      new Date('2026-09-02T00:00:00Z'),
      { pageSize: 1 },
    );
    // Une troisieme tranche est demandee : la deuxieme page, pleine (1 ligne
    // pour pageSize:1), ne prouve rien a elle seule — voir `fetchAllRows`
    // (paginate.ts), "une page pleine ne prouve pas la fin des donnees".
    expect(appels.ranges).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(entrees.evenementsPipeline).toHaveLength(2);
  });

  it('echoue plutot que de boucler sans fin sur une table qui ne rend jamais de page incomplete', async () => {
    // La seule vraie borne posee ici : `hardLimit`. Elle ne coupe ni une
    // fenetre de jours ni un historique cumule (voir docstring de
    // `fetchEntreesJeu`) — elle protege seulement contre un volume qui ne
    // finit jamais, en echouant bruyamment plutot qu'en rendant une page
    // partielle pour complete.
    const { builder } = tableSansFin(() => ligneObservee);
    await expect(
      fetchEntreesJeu(fakeClient({ pipeline_event: builder }), new Date(), {
        pageSize: 10,
        hardLimit: 25,
      }),
    ).rejects.toThrow(/25/);
  });

  it('la meme garde protege la lecture d interaction', async () => {
    const { builder } = tableSansFin(() => ({ prospect_id: 'p1', occurred_at: '2026-08-20T09:00:00Z' }));
    await expect(
      fetchEntreesJeu(fakeClient({ interaction: builder }), new Date(), {
        pageSize: 10,
        hardLimit: 25,
      }),
    ).rejects.toThrow(/25/);
  });

  it('la meme garde protege la lecture de deployment_event', async () => {
    const { builder } = tableSansFin(() => ({ prospect_id: 'p1', occurred_at: '2026-08-20T09:00:00Z' }));
    await expect(
      fetchEntreesJeu(fakeClient({ deployment_event: builder }), new Date(), {
        pageSize: 10,
        hardLimit: 25,
      }),
    ).rejects.toThrow(/25/);
  });
});

describe('fetchEntreesJeu — un echec de lecture distinct d un resultat vide', () => {
  it('trois tables vides rendent des entrees vides, sans lever — le cas normal juste apres la migration', async () => {
    await expect(fetchEntreesJeu(fakeClient({}), new Date())).resolves.toEqual({
      maintenant: expect.any(Date),
      evenementsPipeline: [],
      interactions: [],
      sitesMisEnLigne: [],
    });
  });

  it('un echec sur pipeline_event est nomme et distinct d un vide', async () => {
    const { builder } = tableEnErreur('RLS a refuse la lecture');
    await expect(
      fetchEntreesJeu(fakeClient({ pipeline_event: builder }), new Date()),
    ).rejects.toThrow(/pipeline_event.*RLS a refuse la lecture/);
  });

  it('un echec sur interaction est nomme et distinct d un vide', async () => {
    const { builder } = tableEnErreur('connexion perdue');
    await expect(
      fetchEntreesJeu(fakeClient({ interaction: builder }), new Date()),
    ).rejects.toThrow(/interaction.*connexion perdue/);
  });

  it('un echec sur deployment_event est nomme et distinct d un vide', async () => {
    const { builder } = tableEnErreur('timeout');
    await expect(
      fetchEntreesJeu(fakeClient({ deployment_event: builder }), new Date()),
    ).rejects.toThrow(/deployment_event.*timeout/);
  });
});

describe('fetchJeu', () => {
  it('assemble le jeu complet a partir des trois sources', async () => {
    const pipeline = tablePaginee([[ligneObservee, { ...ligneObservee, status: 'interesse', next_action_at: null }]]);
    const interaction = tablePaginee([[{ prospect_id: 'p1', occurred_at: '2026-08-20T10:00:00Z' }]]);
    const jeu = await fetchJeu(
      fakeClient({ pipeline_event: pipeline.builder, interaction: interaction.builder }),
      new Date('2026-09-02T00:00:00Z'),
    );
    // Une relance tenue (p1, 20/08) + un rendez-vous obtenu (statut interesse) :
    // 40 + 200 = 240 points, palier 1 encore en cours.
    expect(jeu.palier.points).toBe(240);
    expect(jeu.palier.numero).toBe(1);
  });

  it('sur une base entierement vide, rend un jeu au repos plutot que d echouer', async () => {
    const jeu = await fetchJeu(fakeClient({}), new Date('2026-09-02T00:00:00Z'));
    expect(jeu.objectifDuJour).toEqual({ connue: false });
    expect(jeu.serie).toBe(0);
    expect(jeu.palier).toEqual({ points: 0, seuil: 500, numero: 1, progression: 0 });
    expect(jeu.badges.every((b) => !b.obtenu)).toBe(true);
  });
});
