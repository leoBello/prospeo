import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { describe, expect, it } from 'vitest';
import { fetchHeartbeat, toFaitsLigne, toFaitsProspect } from './campagne.js';

describe('toFaitsProspect', () => {
  it('lit un score absent comme null et jamais comme zero', () => {
    // `prospect_score` est une relation qui peut ne pas exister. La ramener a
    // 0 rendrait un prospect jamais score indistinguable d un prospect nul.
    const f = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      prospect_score: null,
      web_presence: { category: 'none' },
      prospect_pipeline: { status: 'a_contacter' },
      interaction: [],
      generated_message: [],
      prospect_site: null,
    });

    expect(f?.score).toBeNull();
  });

  it('lit une relation un-a-un rendue en tableau d un element', () => {
    // PostgREST rend ces relations tantot en objet, tantot en tableau selon
    // la requete : les deux formes doivent produire le meme fait.
    const f = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      prospect_score: [{ total: 86 }],
      web_presence: [{ category: 'dead_site' }],
      prospect_pipeline: [{ status: 'a_contacter' }],
      interaction: [],
      generated_message: [],
      prospect_site: null,
    });

    expect(f).toMatchObject({ score: 86, presence: 'dead_site', statut: 'a_contacter' });
  });

  it('traite un pipeline absent comme « a contacter », valeur par defaut de la base', () => {
    const f = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      prospect_score: { total: 50 },
      web_presence: null,
      prospect_pipeline: null,
      interaction: [],
      generated_message: [],
      prospect_site: null,
    });

    expect(f?.statut).toBe('a_contacter');
  });

  it('ne compte comme site publie qu une ligne avec published_at', () => {
    const enCours = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      prospect_score: { total: 50 },
      web_presence: null,
      prospect_pipeline: null,
      interaction: [],
      generated_message: [],
      prospect_site: { published_at: null, deployment_url: null },
    });

    expect(enCours?.sitePublie).toBe(false);
  });

  it('lit les trois faits dont depend la chaine, et non les seuls criteres de D3', () => {
    // `fetchSiteCandidates` (collector) refuse un etablissement cesse, un
    // metier hors catalogue et un telephone qu on ne saurait pas composer. Sans
    // ces trois faits ici, l ecran ne peut pas savoir ce qu il promet.
    const f = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      is_closed: false,
      prospect_score: { total: 70 },
      web_presence: { category: 'none' },
      prospect_pipeline: null,
      prospect_enrichment: { phone_e164: '+33612345678' },
      interaction: [],
      generated_message: [],
      prospect_site: null,
    });

    expect(f).toMatchObject({ estFerme: false, aTelephone: true, metierConnu: true });
  });

  it('ne compte pas comme joignable un numero que le normaliseur refuse', () => {
    // La colonne est censee porter du E.164, mais elle est alimentee par du
    // scraping — c est la raison pour laquelle `assembleFacts` la refait
    // passer par `normalizePhone`. Se fier a « la colonne n est pas nulle »
    // ferait entrer dans le lot un prospect que la chaine ecarterait ensuite.
    const f = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      is_closed: false,
      prospect_score: { total: 70 },
      web_presence: { category: 'none' },
      prospect_pipeline: null,
      prospect_enrichment: { phone_e164: '00' },
      interaction: [],
      generated_message: [],
      prospect_site: null,
    });

    expect(f?.aTelephone).toBe(false);
  });

  it('lit un etablissement cesse et un metier hors catalogue', () => {
    const f = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'astronaute',
      is_closed: true,
      prospect_score: { total: 70 },
      web_presence: { category: 'none' },
      prospect_pipeline: null,
      prospect_enrichment: null,
      interaction: [],
      generated_message: [],
      prospect_site: null,
    });

    expect(f).toMatchObject({ estFerme: true, metierConnu: false, aTelephone: false });
  });

  it('ecarte une ligne sans identifiant plutot que de la forcer', () => {
    // Meme doctrine que `typeDeTelephone` dans queries.ts : une ligne que la
    // base ne nomme pas ne peut pas peser sur un classement.
    expect(toFaitsProspect({ denomination: 'Sans id' })).toBeNull();
  });
});

describe('toFaitsLigne', () => {
  it('retient l evenement de deploiement le plus recent quand plusieurs sont embarques, meme hors ordre', () => {
    // Le tableau n EST PAS trie dans ce fixture : l evenement le plus recent
    // (en_ligne, 02) est place AVANT le plus ancien (build, 01) dans le
    // tableau. Si la fonction se contentait de prendre le premier element,
    // elle retiendrait le mauvais des deux ici comme la-bas.
    const f = toFaitsLigne(
      {
        id: 'p-1',
        prospect_site: null,
        prospect_contact: null,
        generated_message: [],
        deployment_event: [
          { step: 'build', outcome: 'reussi', detail: null, occurred_at: '2026-09-01T10:00:00Z' },
          { step: 'en_ligne', outcome: 'reussi', detail: null, occurred_at: '2026-09-02T08:00:00Z' },
        ],
        message_send: [],
      },
      null,
    );

    expect(f.derniereEtape).toMatchObject({ step: 'en_ligne', outcome: 'reussi' });
  });

  it('rend une absence reelle quand aucun evenement n est embarque, jamais une troncature', () => {
    // Un tableau VIDE, pas un tableau tronque a une limite globale : c est ce
    // que corrige l embarquement de `deployment_event` dans `CAMPAGNE_SELECT`
    // (D3, doctrine des absences).
    const f = toFaitsLigne(
      {
        id: 'p-1',
        prospect_site: null,
        prospect_contact: null,
        generated_message: [],
        deployment_event: [],
        message_send: [],
      },
      null,
    );

    expect(f.derniereEtape).toBeNull();
  });

  it('distingue un prospect avec un envoi d un prospect sans aucun envoi', () => {
    const avecEnvoi = toFaitsLigne(
      {
        id: 'p-1',
        prospect_site: null,
        prospect_contact: null,
        generated_message: [],
        deployment_event: [],
        message_send: [{ state: 'envoye', sent_at: '2026-09-02T09:00:00Z', started_at: '2026-09-02T08:59:00Z' }],
      },
      null,
    );
    const sansEnvoi = toFaitsLigne(
      {
        id: 'p-2',
        prospect_site: null,
        prospect_contact: null,
        generated_message: [],
        deployment_event: [],
        message_send: [],
      },
      null,
    );

    expect(avecEnvoi.envoi).toMatchObject({ state: 'envoye', sentAt: '2026-09-02T09:00:00Z' });
    expect(sansEnvoi.envoi).toBeNull();
  });
});

describe('fetchHeartbeat', () => {
  it('lit worker_heartbeat_utilisateur, jamais l ancien singleton', async () => {
    // LE DEFAUT QUE CE TEST FERME. Sans cette preuve, un renommage de table
    // resterait invisible : le dashboard continuerait de lire l'ancien
    // singleton, désormais mort, et afficherait « à l'arrêt » pour toujours
    // — indiscernable d'un vrai worker jamais démarré.
    const tables: string[] = [];
    const b = {
      select: () => b,
      maybeSingle: () => Promise.resolve({ data: { beat_at: '2026-09-05T10:00:00.000Z', in_flight: 2 }, error: null }),
    };
    const client = {
      from: (nom: string) => {
        tables.push(nom);
        return b;
      },
    } as unknown as SupabaseClient<Database>;

    const r = await fetchHeartbeat(client);

    expect(tables).toEqual(['worker_heartbeat_utilisateur']);
    expect(r).toEqual({ beatAt: '2026-09-05T10:00:00.000Z', inFlight: 2 });
  });

  it('rend null quand aucune ligne n existe — jamais demarre, pas en echec', async () => {
    const client = {
      from: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    } as unknown as SupabaseClient<Database>;

    expect(await fetchHeartbeat(client)).toBeNull();
  });
});
