import { describe, expect, it } from 'vitest';
import { toFaitsLigne, toFaitsProspect } from './campagne.js';

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
