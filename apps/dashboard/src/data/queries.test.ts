import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { PROSPECT_SELECT, loadProspects, prospectRangeReader, toProspectView } from './queries.js';

/**
 * Client simulé : enregistre la requête construite et rend les lignes fournies.
 * Aucun accès réseau — c'est le câblage de la requête qu'on éprouve.
 */
function fakeClient(pages: unknown[][]) {
  const appels = { table: '', select: '', order: '', ascending: true, ranges: [] as Array<[number, number]> };
  let page = 0;
  const client = {
    from(table: string) {
      appels.table = table;
      return {
        select(columns: string) {
          appels.select = columns;
          return {
            order(column: string, options?: { ascending?: boolean }) {
              appels.order = column;
              appels.ascending = options?.ascending ?? true;
              return {
                range(from: number, to: number) {
                  appels.ranges.push([from, to]);
                  const data = pages[page] ?? [];
                  page += 1;
                  return Promise.resolve({ data, error: null });
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

const dtoMinimal = {
  id: 'p1',
  siret: '78994813000032',
  denomination: 'SARL ALLARD',
  denomination_usuelle: null,
  trade_slug: 'plombier',
  address: '5 RUE LE NOTRE 44000 NANTES',
  postal_code: '44000',
  city: 'NANTES',
  date_creation: '2012-12-15',
  effectif_code: '02',
  is_closed: false,
  discovered_at: '2026-09-01T01:38:07Z',
  prospect_score: null,
  web_presence: null,
  prospect_enrichment: null,
  prospect_pipeline: null,
  prospect_site: null,
  generated_message: [],
};

describe('prospectRangeReader', () => {
  it('ordonne sur la cle primaire, sans quoi la pagination peut relire ou sauter des lignes', async () => {
    // PostgREST n'impose aucun ordre par défaut. Deux lignes de même rang
    // peuvent alors changer de place entre deux requêtes : l'une serait lue
    // deux fois, l'autre jamais, et le résultat aurait la bonne taille tout en
    // étant faux.
    const { client, appels } = fakeClient([[]]);
    await prospectRangeReader(client)(0, 999);
    expect(appels.order).toBe('id');
    expect(appels.table).toBe('prospect');
    expect(appels.ranges).toEqual([[0, 999]]);
  });

  it('demande les quatre satellites dans la meme requete, pour un instantane coherent', () => {
    for (const table of ['prospect_score', 'web_presence', 'prospect_enrichment', 'prospect_pipeline']) {
      expect(PROSPECT_SELECT).toContain(table);
    }
  });
});

describe('toProspectView', () => {
  it('conserve un satellite absent en null, et ne le remplace pas par un objet vide', () => {
    // Un `web_presence` vide se lirait comme « sondé, rien trouvé » ; l'absence
    // de ligne veut dire « pas encore sondé ». Ce ne sont pas les mêmes faits.
    const vue = toProspectView(dtoMinimal);
    expect(vue.score).toBeNull();
    expect(vue.presence).toBeNull();
    expect(vue.enrichment).toBeNull();
    expect(vue.pipeline).toBeNull();
  });

  it('accepte une relation un-a-un rendue sous forme de tableau', () => {
    // Selon la version de PostgREST et la façon dont la clé unique est
    // déclarée, une relation 1:1 revient tantôt en objet, tantôt en tableau
    // d'un élément. Traiter le tableau comme un objet perdrait silencieusement
    // le score de tous les prospects.
    const vue = toProspectView({
      ...dtoMinimal,
      prospect_score: [
        { total: 30, ruleset_version: 'v1', computed_at: '2026-09-01T00:00:00Z', breakdown: [] },
      ],
    });
    expect(vue.score?.total).toBe(30);
  });

  it('traite un tableau vide comme une absence de ligne', () => {
    expect(toProspectView({ ...dtoMinimal, web_presence: [] }).presence).toBeNull();
  });

  it('n invente pas un type de telephone que la base ne nomme pas', () => {
    // `phone_kind` est une colonne texte libre : une valeur inattendue doit
    // rester une absence, pas devenir « fixe » par défaut.
    const vue = toProspectView({
      ...dtoMinimal,
      prospect_enrichment: {
        status: 'ok',
        phone_e164: '+33612345678',
        phone_kind: 'satellite',
        rating: 4.6,
        review_count: null,
        declared_url: null,
        matched_name: 'Aquatio',
        match_confidence: 0.99,
        enriched_at: '2026-09-01T00:00:00Z',
      },
    });
    expect(vue.enrichment?.phoneKind).toBeNull();
    expect(vue.enrichment?.phoneE164).toBe('+33612345678');
  });

  it('lit le detail du bareme stocke en jsonb', () => {
    const vue = toProspectView({
      ...dtoMinimal,
      prospect_score: {
        total: 30,
        ruleset_version: 'v1',
        computed_at: '2026-09-01T00:00:00Z',
        breakdown: [
          { code: 'presence_none', group: 'presence', label: 'Aucune présence web', points: 35 },
        ],
      },
    });
    expect(vue.score?.breakdown).toHaveLength(1);
    expect(vue.score?.rulesetVersion).toBe('v1');
  });
});

describe('loadProspects', () => {
  it('parcourt toutes les pages, la base depassant deja le plafond d une lecture nue a terme', async () => {
    const page = (n: number, debut: number) =>
      Array.from({ length: n }, (_, i) => ({ ...dtoMinimal, id: `p${debut + i}` }));
    const read = vi
      .fn()
      .mockResolvedValueOnce({ data: page(3, 0), error: null })
      .mockResolvedValueOnce({ data: page(1, 3), error: null });

    const vues = await loadProspects(read, { pageSize: 3 });
    expect(vues.map((v) => v.id)).toEqual(['p0', 'p1', 'p2', 'p3']);
  });
});

describe('site et messages generes', () => {
  const contenu = {
    version: { schema: 'v1', promptVersion: 'v3', model: 'claude-opus-4-8' },
    editeur: { nom: 'Léo Bello', contact: 'leobello.wd@gmail.com' },
    faits: { nomAffiche: 'Dos-Services' },
    redaction: {
      accroche: 'Dépannage et installation sanitaire',
      presentation: 'Un paragraphe.',
      prestations: [
        { code: 'depannage', label: 'Dépannage', description: 'x' },
        { code: 'chauffe_eau', label: 'Chauffe-eau', description: 'y' },
      ],
    },
  };

  it('demande le site et les messages dans la MEME requete que le prospect', () => {
    // Meme raison que pour les quatre satellites d'origine : deux lectures
    // prises a des instants differents decriraient deux etats de la base. Ici
    // l'ecart serait visible — un site publie sans son message, ou un message
    // citant une URL que la fiche n'affiche pas encore.
    expect(PROSPECT_SELECT).toContain('prospect_site(');
    expect(PROSPECT_SELECT).toContain('generated_message(');
  });

  it('n affiche du contenu publie que ce que le MODELE a decide', () => {
    // Les faits sont deja ailleurs sur la fiche, tires des memes colonnes. Les
    // repeter ici laisserait croire qu'il en existe deux versions, et surtout
    // noierait la seule chose qu'un relecteur doit examiner : ce qui a pu etre
    // invente.
    const vue = toProspectView({
      ...dtoMinimal,
      prospect_site: {
        repo_url: 'https://github.com/prospeo/dos',
        deployment_url: 'https://dos.vercel.app',
        prompt_version: 'v3',
        model: 'claude-opus-4-8',
        generated_at: '2026-09-01T20:00:00Z',
        published_at: '2026-09-01T20:17:31Z',
        unpublished_at: null,
        content_rejected_at: null,
        content: contenu,
      },
    });

    expect(vue.site?.deploymentUrl).toBe('https://dos.vercel.app');
    expect(vue.site?.redaction?.accroche).toBe('Dépannage et installation sanitaire');
    // Les libelles, pas les codes : `depannage` ne se lit pas, « Dépannage »
    // si. L'ordre est conserve, c'est le seul degre de liberte du modele.
    expect(vue.site?.redaction?.prestations).toEqual(['Dépannage', 'Chauffe-eau']);
  });

  it('laisse la redaction vide plutot que de faire tomber l ecran', () => {
    // Un contenu ecrit sous un schema futur, ou une ligne a moitie ecrite. Le
    // `jsonb` a ete valide A L ECRITURE par `runGenerate` ; la couche
    // d'affichage n'a pas qualite a declarer invalide un contenu deja publie
    // sous le nom d'une entreprise. Elle n'affiche que ce qu'elle reconnait.
    const vue = toProspectView({
      ...dtoMinimal,
      prospect_site: { deployment_url: 'https://x.vercel.app', content: { redaction: {} } },
    });
    expect(vue.site?.redaction).toBeNull();
    expect(vue.site?.deploymentUrl).toBe('https://x.vercel.app');
  });

  it('ne garde que le dernier message de chaque canal', () => {
    // `generated_message` ARCHIVE : `pitch --force` ajoute trois lignes sans
    // effacer les precedentes, et un prospect rejoue trois fois en porte neuf.
    // Les afficher toutes noierait le texte a copier sous ses brouillons.
    const vue = toProspectView({
      ...dtoMinimal,
      generated_message: [
        { channel: 'email', subject: 'Vieux', content: 'v1', created_at: '2026-09-01T10:00:00Z', prompt_version: 'v1-v1', model: 'm' },
        { channel: 'sms', subject: null, content: 'sms recent', created_at: '2026-09-02T10:00:00Z', prompt_version: 'v1-v1', model: 'm' },
        { channel: 'email', subject: 'Recent', content: 'v2', created_at: '2026-09-02T10:00:00Z', prompt_version: 'v1-v2', model: 'm' },
      ],
    });

    expect(vue.messages).toHaveLength(2);
    expect(vue.messages.find((m) => m.channel === 'email')?.subject).toBe('Recent');
    // Le plus recent d'abord, tous canaux confondus.
    expect(vue.messages[0]?.createdAt).toBe('2026-09-02T10:00:00Z');
  });

  it('rend une liste VIDE quand aucun message n existe, jamais null', () => {
    expect(toProspectView(dtoMinimal).messages).toEqual([]);
    expect(toProspectView({ ...dtoMinimal, generated_message: null }).messages).toEqual([]);
  });

  it('distingue une redaction rejetee d une redaction jamais relue', () => {
    // Le refus est un horodatage, pas un effacement : on doit pouvoir lire CE
    // QU ON A REFUSE pour corriger le prompt, plutot que de retirer la meme
    // chose au hasard.
    const vue = toProspectView({
      ...dtoMinimal,
      prospect_site: { content: contenu, content_rejected_at: '2026-09-02T09:00:00Z' },
    });
    expect(vue.site?.contentRejectedAt).toBe('2026-09-02T09:00:00Z');
    expect(vue.site?.redaction?.accroche).toBe('Dépannage et installation sanitaire');
  });
});
