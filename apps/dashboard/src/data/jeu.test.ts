import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import {
  fetchEntreesJeu,
  fetchJeu,
  interactionRangeReader,
  pipelineEventRangeReader,
  toFaitsInteraction,
  toFaitsPipeline,
} from './jeu.js';

type SelectOptions = { count?: 'exact'; head?: boolean };

/**
 * Un "builder" de lecture DE LIGNES, paginée — comme `fakeServer` de
 * `paginate.test.ts`. `select` n'attend jamais d'options : c'est ce qui le
 * distingue d'un builder de compte pour le routeur `fakeClient` plus bas.
 */
function tablePaginee(pages: unknown[][]) {
  const appels = {
    selects: [] as [string, SelectOptions | undefined][],
    gtes: [] as [string, unknown][],
    ors: [] as string[],
    orders: [] as [string, boolean | undefined][],
    ranges: [] as [number, number][],
  };
  let page = 0;
  const builder = {
    select(colonnes: string, options?: SelectOptions) {
      appels.selects.push([colonnes, options]);
      return builder;
    },
    gte(colonne: string, valeur: unknown) {
      appels.gtes.push([colonne, valeur]);
      return builder;
    },
    or(filtre: string) {
      appels.ors.push(filtre);
      return builder;
    },
    order(colonne: string, options?: { ascending?: boolean }) {
      appels.orders.push([colonne, options?.ascending]);
      return builder;
    },
    range(from: number, to: number) {
      appels.ranges.push([from, to]);
      const data = pages[page] ?? [];
      page += 1;
      return Promise.resolve({ data, error: null });
    },
  };
  return { builder, appels };
}

/** Une lecture DE LIGNES qui échoue toujours — pour distinguer un échec d'un résultat vide. */
function tableRangeEnErreur(message: string) {
  const appels = { ranges: [] as [number, number][] };
  const builder = {
    select() { return builder; },
    gte() { return builder; },
    or() { return builder; },
    order() { return builder; },
    range(from: number, to: number) {
      appels.ranges.push([from, to]);
      return Promise.resolve({ data: null, error: { message } });
    },
  };
  return { builder, appels };
}

/** Une lecture DE LIGNES qui ne rend jamais de page incomplète : force `fetchAllRows` à boucler jusqu'au `hardLimit`. */
function tableSansFin(ligne: () => unknown) {
  const appels = { ranges: [] as [number, number][] };
  const builder = {
    select() { return builder; },
    gte() { return builder; },
    or() { return builder; },
    order() { return builder; },
    range(from: number, to: number) {
      appels.ranges.push([from, to]);
      const largeur = to - from + 1;
      return Promise.resolve({ data: Array.from({ length: largeur }, ligne), error: null });
    },
  };
  return { builder, appels };
}

/**
 * Un builder de COMPTE PostgREST — `select('*', { count, head })`, puis des
 * `.eq`/`.lt`, jamais de `.range()` : c'est directement `await`-é, comme le
 * fait `lireCompte` (`data/jeu.ts`). `then` le rend "thenable".
 */
function compte(reglage: { n?: number; erreur?: { message: string } | null } = {}) {
  const appels = {
    selects: [] as [string, SelectOptions | undefined][],
    eqs: [] as [string, unknown][],
    lts: [] as [string, unknown][],
    nots: [] as [string, string, unknown][],
  };
  const builder = {
    select(colonnes: string, options?: SelectOptions) {
      appels.selects.push([colonnes, options]);
      return builder;
    },
    eq(colonne: string, valeur: unknown) {
      appels.eqs.push([colonne, valeur]);
      return builder;
    },
    lt(colonne: string, valeur: unknown) {
      appels.lts.push([colonne, valeur]);
      return builder;
    },
    not(colonne: string, operateur: string, valeur: unknown) {
      appels.nots.push([colonne, operateur, valeur]);
      return builder;
    },
    then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
      const erreur = reglage.erreur ?? null;
      Promise.resolve({ data: null, error: erreur, count: erreur === null ? (reglage.n ?? 0) : null }).then(
        resolve,
        reject,
      );
    },
  };
  return { builder, appels };
}

// `unknown` plutot qu'une union precise : `tablePaginee`, `tableRangeEnErreur`
// et `tableSansFin` rendent des formes de reponse differentes (donnees vides,
// erreur, page pleine) qui n'ont pas a s'unifier structurellement — seul le
// contrat runtime (les methodes appelees par `data/jeu.ts`) compte ici, et il
// est de toute facon verifie par un cast au retour de `fakeClient`.
type Builder = unknown;

/**
 * Client simulé.
 *
 * `pipeline_event` sert TROIS rôles bien distincts dans `fetchEntreesJeu`
 * (lecture de lignes bornée par date, compte "historique au-delà", compte
 * "rendez-vous obtenus") — et `client.from('pipeline_event')` est rappelé À
 * CHAQUE PAGE pour le premier rôle (fermeture de `pipelineEventRangeReader`,
 * une par appel de `fetchAllRows`), donc un simple compteur d'appels à
 * `.from` ne peut pas les distinguer. Le routeur ci-dessous distingue plutôt
 * sur la FORME de l'appel : `select(colonnes)` SANS options → lecture de
 * lignes ; `select('*', { count, head })` → un compte, le premier `.eq` posé
 * ensuite disant lequel (`status` → rendez-vous, sinon → historique au-delà).
 * C'est exactement la forme que `data/jeu.ts` produit réellement.
 */
/** Le seul contrat dont le routeur `fakeClient` a besoin pour le rôle "lecture de lignes". */
interface LigneBuilder {
  select(colonnes: string): unknown;
}

function fakeClient(config: {
  pipelineLignes?: LigneBuilder;
  pipelineAuDela?: ReturnType<typeof compte>['builder'];
  pipelineRdv?: ReturnType<typeof compte>['builder'];
  interaction?: Builder;
  prospectSite?: ReturnType<typeof compte>['builder'];
}) {
  const pipelineLignes = config.pipelineLignes ?? tablePaginee([[]]).builder;
  const pipelineAuDela = config.pipelineAuDela ?? compte().builder;
  const pipelineRdv = config.pipelineRdv ?? compte().builder;
  const interaction = config.interaction ?? tablePaginee([[]]).builder;
  const prospectSite = config.prospectSite ?? compte().builder;

  return {
    from(table: string) {
      if (table === 'interaction') return interaction;
      if (table === 'prospect_site') return prospectSite;
      if (table !== 'pipeline_event') throw new Error(`table inattendue dans le test : ${table}`);
      return {
        select(colonnes: string, options?: SelectOptions) {
          if (options === undefined) return pipelineLignes.select(colonnes);
          // Compte : on ne sait pas encore lequel avant le premier `.eq`.
          let cible: ReturnType<typeof compte>['builder'] | null = null;
          return {
            eq(colonne: string, valeur: unknown) {
              if (cible === null) cible = colonne === 'status' ? pipelineRdv : pipelineAuDela;
              return cible.eq(colonne, valeur);
            },
          };
        },
      };
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

describe('pipelineEventRangeReader / interactionRangeReader — la borne PAR DATE', () => {
  it('pipelineEventRangeReader retient une ligne des que occurred_at OU next_action_at tombe dans la fenetre, et ordonne sur id', async () => {
    // Second correctif de revue : un simple `gte('occurred_at', …)`
    // manquerait une echeance posee avant la fenetre mais due dedans — voir
    // le docstring de `pipelineEventRangeReader`.
    const { builder, appels } = tablePaginee([[]]);
    const lecteur = pipelineEventRangeReader(
      { from: () => builder } as unknown as SupabaseClient<Database>,
      '2026-08-19T00:00:00.000Z',
    );
    await lecteur(0, 999);
    expect(appels.ors).toEqual(['occurred_at.gte.2026-08-19T00:00:00.000Z,next_action_at.gte.2026-08-19']);
    expect(appels.orders).toEqual([['id', true]]);
  });

  it('interactionRangeReader filtre et ordonne de meme', async () => {
    const { builder, appels } = tablePaginee([[]]);
    const lecteur = interactionRangeReader(
      { from: () => builder } as unknown as SupabaseClient<Database>,
      '2026-08-19T00:00:00.000Z',
    );
    await lecteur(0, 999);
    expect(appels.gtes).toEqual([['occurred_at', '2026-08-19T00:00:00.000Z']]);
    expect(appels.orders).toEqual([['id', true]]);
  });
});

describe('fetchEntreesJeu — les comptes serveur ne transferent aucune ligne', () => {
  /**
   * Les sites en ligne se comptent sur `prospect_site`, PAS sur
   * `deployment_event` : cette derniere ne connait que ce qui a ete deploye
   * depuis sa creation, et un site publie avant elle rapportait donc zero
   * point sous une bande qui annonce « +120 pts · site mis en ligne ».
   * `published_at` non nul, sans regarder `unpublished_at` : un retrait ne
   * defait pas le jalon, et le compter ferait regresser un badge acquis.
   */
  it('compte les sites mis en ligne sur prospect_site, par published_at non nul, sans transferer de ligne', async () => {
    const { builder, appels } = compte({ n: 3 });
    const entrees = await fetchEntreesJeu(fakeClient({ prospectSite: builder }), new Date('2026-09-02T00:00:00Z'));
    expect(appels.selects).toEqual([['*', { count: 'exact', head: true }]]);
    expect(appels.nots).toEqual([['published_at', 'is', null]]);
    // Aucun filtre sur `unpublished_at` : un site retire garde son jalon.
    expect(appels.eqs).toEqual([]);
    expect(entrees.nombreSitesMisEnLigne).toBe(3);
  });

  it('demande un count filtre sur status=interesse et origin=observe pour les rendez-vous obtenus', async () => {
    const { builder, appels } = compte({ n: 5 });
    const entrees = await fetchEntreesJeu(fakeClient({ pipelineRdv: builder }), new Date('2026-09-02T00:00:00Z'));
    expect(appels.eqs).toEqual([
      ['status', 'interesse'],
      ['origin', 'observe'],
    ]);
    expect(entrees.nombreRendezVousObtenus).toBe(5);
  });

  it('le compte "au-dela de la fenetre" filtre sur origin=observe et occurred_at < la coupure', async () => {
    const coupureAttendue = new Date('2026-08-18T00:00:00.000Z'); // 2026-09-02 - (14+1) jours
    const { builder, appels } = compte({ n: 1 });
    const entrees = await fetchEntreesJeu(fakeClient({ pipelineAuDela: builder }), new Date('2026-09-02T00:00:00Z'));
    expect(appels.eqs).toEqual([['origin', 'observe']]);
    expect(appels.lts).toEqual([['occurred_at', coupureAttendue.toISOString()]]);
    expect(entrees.historiqueAuDelaDeLaFenetre).toBe(true);
  });

  it('relancesTenuesCumulees reste honnetement non mesurable — aucune requete ne pretend le contraire', async () => {
    const entrees = await fetchEntreesJeu(fakeClient({}), new Date('2026-09-02T00:00:00Z'));
    expect(entrees.relancesTenuesCumulees).toEqual({ connue: false });
  });
});

describe('fetchEntreesJeu — la borne PAR DATE sur les lectures qui grandissent', () => {
  it('lit TOUTES les lignes de la fenetre au-dela d une seule page, sans les tronquer a la premiere tranche', async () => {
    // Preuve positive : `fetchAllRows` (pagination complete a l'INTERIEUR de
    // la fenetre bornee par date) plutot qu'un `.limit(N)` fixe qui pourrait
    // couper la fenetre elle-meme en plein milieu d'une journee chargee.
    const pages = [[ligneObservee], [{ ...ligneObservee, prospect_id: 'p2' }]];
    const { builder, appels } = tablePaginee(pages);
    const entrees = await fetchEntreesJeu(fakeClient({ pipelineLignes: builder }), new Date('2026-09-02T00:00:00Z'), {
      pageSize: 1,
    });
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

  it('echoue plutot que de boucler sans fin sur une table qui ne rend jamais de page incomplete (pipeline_event)', async () => {
    const { builder } = tableSansFin(() => ligneObservee);
    await expect(
      fetchEntreesJeu(fakeClient({ pipelineLignes: builder }), new Date(), { pageSize: 10, hardLimit: 25 }),
    ).rejects.toThrow(/25/);
  });

  it('la meme garde protege la lecture d interaction', async () => {
    const { builder } = tableSansFin(() => ({ prospect_id: 'p1', occurred_at: '2026-08-20T09:00:00Z' }));
    await expect(
      fetchEntreesJeu(fakeClient({ interaction: builder }), new Date(), { pageSize: 10, hardLimit: 25 }),
    ).rejects.toThrow(/25/);
  });
});

describe('fetchEntreesJeu — un echec de lecture distinct d un resultat vide', () => {
  it('des tables vides et des comptes a zero rendent des entrees au repos, sans lever — le cas normal juste apres la migration', async () => {
    await expect(fetchEntreesJeu(fakeClient({}), new Date())).resolves.toEqual({
      maintenant: expect.any(Date),
      evenementsPipeline: [],
      interactions: [],
      historiqueAuDelaDeLaFenetre: false,
      relancesTenuesCumulees: { connue: false },
      nombreSitesMisEnLigne: 0,
      nombreRendezVousObtenus: 0,
    });
  });

  it('un echec sur la lecture (lignes) de pipeline_event est nomme et distinct d un vide', async () => {
    const { builder } = tableRangeEnErreur('RLS a refuse la lecture');
    await expect(fetchEntreesJeu(fakeClient({ pipelineLignes: builder }), new Date())).rejects.toThrow(
      /pipeline_event.*RLS a refuse la lecture/,
    );
  });

  it('un echec sur la lecture (lignes) d interaction est nomme et distinct d un vide', async () => {
    const { builder } = tableRangeEnErreur('connexion perdue');
    await expect(fetchEntreesJeu(fakeClient({ interaction: builder }), new Date())).rejects.toThrow(
      /interaction.*connexion perdue/,
    );
  });

  it('un echec sur le COUNT de prospect_site est nomme et distinct d un vide', async () => {
    const { builder } = compte({ erreur: { message: 'timeout' } });
    await expect(fetchEntreesJeu(fakeClient({ prospectSite: builder }), new Date())).rejects.toThrow(
      /prospect_site.*timeout/,
    );
  });

  it('un echec sur le COUNT "rendez-vous obtenus" (pipeline_event) est nomme distinctement du compte "historique au-dela", et distinct d un vide', async () => {
    // Mineur (revue) : les deux comptes portent sur la meme table mais ne
    // doivent pas partager le meme nom d'erreur, sans quoi l'un est
    // indiscernable de l'autre a la lecture du message.
    const { builder } = compte({ erreur: { message: 'rejete' } });
    await expect(fetchEntreesJeu(fakeClient({ pipelineRdv: builder }), new Date())).rejects.toThrow(
      /pipeline_event \(rendez-vous obtenus\).*rejete/,
    );
  });

  it('un echec sur le COUNT "historique au-dela" (pipeline_event) est nomme distinctement du compte "rendez-vous obtenus", et distinct d un vide', async () => {
    const { builder } = compte({ erreur: { message: 'indisponible' } });
    await expect(fetchEntreesJeu(fakeClient({ pipelineAuDela: builder }), new Date())).rejects.toThrow(
      /pipeline_event \(historique au-delà de la fenêtre\).*indisponible/,
    );
  });
});

describe('fetchJeu', () => {
  it('assemble le jeu complet a partir des cinq sources', async () => {
    // Echeance posee le 20/08 mais due le jour meme de `now` (02/09) :
    // l'interaction qui l'honore CE jour-la forme une serie d'un jour — une
    // relance posee puis honoree loin dans le passe (comme `ligneObservee`
    // partagee plus haut, due elle aussi le 20/08) ne compterait pour aucune
    // serie en cours, `serieDeJours` ne remontant que depuis aujourd'hui.
    const echeanceDueAujourdhui = { ...ligneObservee, next_action_at: '2026-09-02' };
    const pipelineLignes = tablePaginee([[echeanceDueAujourdhui]]).builder;
    const interaction = tablePaginee([[{ prospect_id: 'p1', occurred_at: '2026-09-02T10:00:00Z' }]]).builder;
    const jeu = await fetchJeu(
      fakeClient({
        pipelineLignes,
        interaction,
        pipelineRdv: compte({ n: 1 }).builder,
        prospectSite: compte({ n: 1 }).builder,
      }),
      new Date('2026-09-02T00:00:00Z'),
    );
    // Une relance tenue dans la fenetre (contribue a la serie, pas au
    // palier — voir le correctif de revue) + 1 site en ligne (compte
    // serveur) + 1 rendez-vous obtenu (compte serveur) : 120 + 200 = 320
    // points. La relance tenue ne pese pas ici : `relancesTenuesCumulees`
    // reste `{connue: false}`, faute de cumul honnete depuis toujours.
    expect(jeu.palier.points).toBe(320);
    expect(jeu.serie.jours).toBe(1);
  });

  it('compte une relance tenue meme quand l echeance a ete posee bien avant le debut de la fenetre, tant que sa date d echeance y tombe', async () => {
    // Second correctif de revue, point 2 : sans le filtre `.or(...)` de
    // `pipelineEventRangeReader`, cette ligne (posee 52 jours avant `now`,
    // hors de toute fenetre par `occurred_at`) n'aurait jamais ete lue, et la
    // relance tenue le jour meme aurait ete silencieusement manquee.
    const echeanceAncienne = {
      prospect_id: 'p1',
      status: 'relance',
      next_action_at: '2026-09-02',
      origin: 'observe',
      occurred_at: '2026-07-12T09:00:00Z', // 52 jours avant `now`, tres hors fenetre
    };
    const pipelineLignes = tablePaginee([[echeanceAncienne]]).builder;
    const interaction = tablePaginee([[{ prospect_id: 'p1', occurred_at: '2026-09-02T10:00:00Z' }]]).builder;
    const jeu = await fetchJeu(
      fakeClient({ pipelineLignes, interaction }),
      new Date('2026-09-02T00:00:00Z'),
    );
    expect(jeu.serie).toEqual({ jours: 1, borneAtteinte: false });
  });

  it('sur une base entierement vide, rend un jeu au repos plutot que d echouer', async () => {
    const jeu = await fetchJeu(fakeClient({}), new Date('2026-09-02T00:00:00Z'));
    expect(jeu.objectifDuJour).toEqual({ connue: false });
    expect(jeu.serie).toEqual({ jours: 0, borneAtteinte: false });
    expect(jeu.palier).toEqual({ points: 0, seuil: 500, numero: 1, progression: 0, complet: false });
    expect(jeu.badges.every((b) => b.etat !== 'obtenu')).toBe(true);
  });
});
