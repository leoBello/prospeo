import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import {
  chaineDeps,
  decideDeploiement,
  decideGeneration,
  decidePublication,
  decideRedaction,
  fetchPitchCandidates,
  fetchSiteCandidates,
  fetchSiteRows,
  traiterProspect,
  type ChaineDeps,
} from './chaine.js';
import { proprietaire } from './proprietaire.js';

/**
 * Le proprietaire pour le compte duquel la chaine simulee travaille.
 *
 * Passe par la garde plutot qu'ecrit `as Proprietaire` : un transtypage
 * laisserait un uuid invalide entrer dans les tests sans qu'aucun ne le dise,
 * et le marquage de type existe precisement pour interdire ce raccourci.
 */
const PROPRIETAIRE = proprietaire('131ab48e-055a-4a15-af4b-79ed7a2e4465');

function deps(surcharges: Partial<ChaineDeps> = {}): ChaineDeps {
  return {
    generer: async () => 0.02,
    publier: async () => {},
    deployer: async () => {},
    rediger: async () => 0.01,
    ...surcharges,
  };
}

describe('traiterProspect', () => {
  it('enchaine les quatre etapes dans l ordre', async () => {
    const ordre: string[] = [];
    await traiterProspect(
      'p-1',
      deps({
        generer: async () => {
          ordre.push('generate');
          return null;
        },
        publier: async () => {
          ordre.push('publish');
        },
        deployer: async () => {
          ordre.push('deploy');
        },
        rediger: async () => {
          ordre.push('pitch');
          return null;
        },
      }),
    );

    // L ordre est une dependance de donnees, pas une convention : publier
    // avant d avoir genere pousserait un depot vide.
    expect(ordre).toEqual(['generate', 'publish', 'deploy', 'pitch']);
  });

  it('s arrete au premier echec et nomme l etape fautive', async () => {
    const rediger = vi.fn(async () => null);
    const resultat = await traiterProspect(
      'p-1',
      deps({
        publier: async () => {
          throw new Error('nom deja pris');
        },
        rediger,
      }),
    );

    expect(resultat.echec).toEqual({ etape: 'publish', message: 'nom deja pris' });
    expect(resultat.termine).toEqual(['generate']);
    // Rediger un mail qui citerait une URL inexistante produirait un message
    // faux : la chaine s arrete, elle ne saute pas l etape.
    expect(rediger).not.toHaveBeenCalled();
  });

  it('somme les couts connus', async () => {
    const resultat = await traiterProspect('p-1', deps({ generer: async () => 0.02, rediger: async () => 0.01 }));

    expect(resultat.coutEur).toBeCloseTo(0.03, 5);
  });

  it('rend un cout nul quand aucune etape ne sait ce qu elle a coute', async () => {
    // `null` n est pas zero : « je ne sais pas » et « c etait gratuit » sont
    // deux faits differents, et l ecran doit pouvoir les distinguer.
    const resultat = await traiterProspect(
      'p-1',
      deps({ generer: async () => null, rediger: async () => null }),
    );

    expect(resultat.coutEur).toBeNull();
  });

  it('somme ce qui est connu meme quand une etape l ignore', async () => {
    const resultat = await traiterProspect(
      'p-1',
      deps({ generer: async () => 0.02, rediger: async () => null }),
    );

    // Un total partiel, pas un total faux. Traiter le `null` comme zero
    // sous-declarerait la depense sans que rien ne le signale.
    expect(resultat.coutEur).toBeCloseTo(0.02, 5);
  });
});

describe('decideGeneration', () => {
  it('rend faire quand rien n a encore ete ecrit', () => {
    expect(decideGeneration(undefined)).toEqual({ faire: true });
  });

  it('refuse de repayer un contenu deja ecrit et non rejete', () => {
    const decision = decideGeneration({ content: { titre: 'x' }, content_rejected_at: null });

    expect(decision).toEqual({ faire: false, motif: 'deja_fait' });
  });

  it('refait un contenu ecrit puis rejete a la relecture', () => {
    // Un contenu REJETE n est pas « deja fait » : c est precisement le cas que
    // le bouton du dashboard doit pouvoir relancer sans --force.
    const decision = decideGeneration({
      content: { titre: 'x' },
      content_rejected_at: '2026-09-01T00:00:00Z',
    });

    expect(decision).toEqual({ faire: true });
  });
});

describe('decidePublication', () => {
  it('rend faire quand rien n a ete retire', () => {
    expect(decidePublication({ unpublished_at: null })).toEqual({ faire: true });
    expect(decidePublication(undefined)).toEqual({ faire: true });
  });

  it('refuse un site retire par un humain', () => {
    // Le point grave du correctif : un site depublie (ne_pas_contacter, perdu)
    // ne doit jamais etre republie au nom d une entreprise qui a demande son
    // retrait. Ce n est pas un « rien a faire » silencieux.
    const decision = decidePublication({ unpublished_at: '2026-09-01T00:00:00Z' });

    expect(decision).toEqual({ faire: false, motif: 'retire' });
  });
});

describe('decideDeploiement', () => {
  it('rend faire quand rien n est ni deploye ni retire', () => {
    expect(decideDeploiement({ unpublished_at: null, deployment_url: null })).toEqual({
      faire: true,
    });
  });

  it('ne redeploie pas un site deja en ligne', () => {
    const decision = decideDeploiement({
      unpublished_at: null,
      deployment_url: 'https://x.vercel.app',
    });

    expect(decision).toEqual({ faire: false, motif: 'deja_fait' });
  });

  it('refuse un site retire, meme s il n a pas encore d URL', () => {
    const decision = decideDeploiement({
      unpublished_at: '2026-09-01T00:00:00Z',
      deployment_url: null,
    });

    expect(decision).toEqual({ faire: false, motif: 'retire' });
  });

  it('le retrait l emporte sur « deja en ligne » quand les deux sont vrais', () => {
    // C est le cas qu un booleen ne peut pas distinguer : ici, deux motifs de
    // silence sont vrais a la fois, et un seul doit lever.
    const decision = decideDeploiement({
      unpublished_at: '2026-09-01T00:00:00Z',
      deployment_url: 'https://x.vercel.app',
    });

    expect(decision).toEqual({ faire: false, motif: 'retire' });
  });
});

describe('decideRedaction', () => {
  it('rend faire quand aucun message n a encore ete redige', () => {
    expect(decideRedaction(false)).toEqual({ faire: true });
  });

  it('refuse de reecrire un message deja redige', () => {
    // L ecriture est un insert, pas un upsert : rejouer sans cette garde
    // empile des generated_message en double sur le meme prospect.
    expect(decideRedaction(true)).toEqual({ faire: false, motif: 'deja_fait' });
  });
});

/**
 * Une requête telle que `clientSimule` l'a vue construire : la table visée,
 * le littéral passé à `select`, et chaque `.eq(colonne, valeur)` enchaîné.
 *
 * C'est le CÂBLAGE qu'on éprouve pour le correctif n°1 — quelle colonne,
 * quelle valeur, quelle relation — pas la forme du résultat : un `.eq()` qui
 * n'enregistre rien laisse la garde `service_role` sans témoin, comme
 * `fetchSiteCandidates` avait perdu la sienne avant ce correctif.
 */
interface AppelRequete {
  table: string;
  select?: string;
  filtres: [string, string][];
}

/**
 * Un client simulé réduit à ce que `generer` lit : la liste des prospects et
 * celle des lignes `prospect_site`.
 *
 * Aucun réseau, aucune base : ce qu'on éprouve ici est la DÉCISION de `generer`
 * quand le prospect n'est pas candidat, pas la forme des requêtes — celle-ci
 * est déjà couverte par les étages eux-mêmes.
 *
 * `appels` rend visible ce que `eq` et `select` reçoivent réellement : sans
 * cet enregistrement, un `.eq('owner_id', proprietaire)` retiré du code de
 * production ne ferait rougir aucun test — `service_role` ne lève pas, il
 * rend simplement plus de lignes.
 */
function clientSimule(
  prospects: unknown[],
  sites: unknown[] = [],
): { client: SupabaseClient<Database>; appels: AppelRequete[] } {
  const appels: AppelRequete[] = [];
  const table = (nom: string, lignes: unknown[]): Record<string, unknown> => {
    const appel: AppelRequete = { table: nom, filtres: [] };
    appels.push(appel);
    const b: Record<string, unknown> = {
      select: (colonnes: string) => {
        appel.select = colonnes;
        return b;
      },
      order: () => b,
      eq: (colonne: string, valeur: string) => {
        appel.filtres.push([colonne, valeur]);
        return b;
      },
      limit: () => Promise.resolve({ data: lignes, error: null }),
      range: () => Promise.resolve({ data: lignes, error: null }),
      upsert: () => Promise.resolve({ error: null }),
    };
    return b;
  };
  const client = {
    from: (nom: string) => table(nom, nom === 'prospect' ? prospects : sites),
  } as unknown as SupabaseClient<Database>;
  return { client, appels };
}

/** Un prospect que `fetchSiteCandidates` accepte : les cas de refus le dérivent. */
function prospectCandidat(surcharges: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p-1',
    siret: '12345678900012',
    denomination: 'AQUATECH',
    denomination_usuelle: null,
    trade_slug: 'plombier',
    address: '37 RUE JACQUES CARTIER 44300 NANTES',
    postal_code: '44300',
    city: 'NANTES',
    date_creation: '2015-04-01',
    latitude: 47.2,
    longitude: -1.55,
    is_closed: false,
    prospect_enrichment: { status: 'matched', matched_name: null, phone_e164: '+33612345678', rating: null, maps_url: null },
    web_presence: { category: 'none' },
    prospect_score: { total: 70 },
    ...surcharges,
  };
}

describe('chaineDeps.generer', () => {
  // `loadGenerateConfig` exige cette variable AVANT toute lecture : sans elle,
  // le test échouerait sur la configuration et n'éprouverait rien.
  const cle = process.env['ANTHROPIC_API_KEY'];
  beforeEach(() => {
    process.env['ANTHROPIC_API_KEY'] = 'cle-de-test';
  });
  afterEach(() => {
    if (cle === undefined) delete process.env['ANTHROPIC_API_KEY'];
    else process.env['ANTHROPIC_API_KEY'] = cle;
  });

  it.each([
    ['sans telephone joignable', { prospect_enrichment: null }],
    ['deja pourvu d un site correct', { web_presence: { category: 'has_site' } }],
    ['cesse', { is_closed: true }],
  ])('leve en nommant la cause pour un prospect %s', async (_libelle, surcharge) => {
    // LE DEFAUT QUE CE TEST FERME. `generer` rendait `null` en silence, puis
    // `publier` levait « aucun contenu a publier — la redaction n a rien
    // ecrit » : la ligne affichait un motif FAUX, et « Rejouer » proposait de
    // recommencer un echec certain, indefiniment.
    const { client } = clientSimule([prospectCandidat(surcharge)]);

    // Motif lu dans `chaine.ts`, jamais reecrit de memoire : c est ce texte-la
    // que le worker ecrit dans `campaign_job.last_error` et que la ligne de
    // l ecran affiche.
    await expect(chaineDeps(client, PROPRIETAIRE).generer('p-1')).rejects.toThrow(
      /hors des critères de la chaîne/,
    );
  });

  it('se tait, sans lever, quand le contenu existe deja', async () => {
    // `decideGeneration` → `deja_fait` : un contenu ecrit et non rejete n est
    // pas une erreur, c est un rejeu qui n a rien a repayer. Le confondre avec
    // le refus ci-dessus ferait echouer un job qui n avait rien a faire.
    const { client } = clientSimule(
      [prospectCandidat()],
      [{ prospect_id: 'p-1', content: { titre: 'x' }, content_rejected_at: null }],
    );

    await expect(chaineDeps(client, PROPRIETAIRE).generer('p-1')).resolves.toBeNull();
  });
});

/**
 * Le correctif n°1 de la revue finale : ce que `service_role` ne refusera
 * jamais, un test doit le prouver lui-même.
 *
 * `service_role` contourne RLS par construction — un `.eq('owner_id', …)`
 * retiré du code ne fait lever aucune erreur, il rend simplement plus de
 * lignes. Les trois lectures ci-dessous sont donc éprouvées sur la requête
 * CONSTRUITE (`appels`), pas sur son résultat : c'est le seul endroit où ce
 * cloisonnement se voit.
 */
describe('cloisonnement des lectures', () => {
  it('fetchSiteCandidates filtre sur le proprietaire recu, pas sur une valeur inventee', async () => {
    const { client, appels } = clientSimule([]);

    await fetchSiteCandidates(client, PROPRIETAIRE, undefined);

    const appel = appels.find((a) => a.table === 'prospect');
    expect(appel?.filtres).toContainEqual(['owner_id', PROPRIETAIRE]);
  });

  it('fetchPitchCandidates filtre sur le proprietaire recu, pas sur une valeur inventee', async () => {
    const { client, appels } = clientSimule([]);

    await fetchPitchCandidates(client, PROPRIETAIRE);

    const appel = appels.find((a) => a.table === 'prospect');
    expect(appel?.filtres).toContainEqual(['owner_id', PROPRIETAIRE]);
  });

  it('fetchSiteRows filtre sur le proprietaire via la relation, ET la jointure est INNER', async () => {
    // Les deux gardes sont distinctes. Sans `.eq('prospect.owner_id', …)`, le
    // filtre n'existe pas. Sans `!inner` dans le `select`, PostgREST ne
    // restreint pas les lignes de `prospect_site` : il vide seulement la
    // relation embarquée et rend TOUTES les lignes, `prospect: null`. Mesuré
    // contre l'instance le 3 septembre 2026 — sans `!inner`, 2 lignes sur 2
    // pour un propriétaire étranger ; avec, 0.
    const { client, appels } = clientSimule([], []);

    await fetchSiteRows(client, PROPRIETAIRE);

    const appel = appels.find((a) => a.table === 'prospect_site');
    expect(appel?.filtres).toContainEqual(['prospect.owner_id', PROPRIETAIRE]);
    expect(appel?.select).toContain('prospect!inner()');
  });
});
