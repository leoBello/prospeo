import { describe, expect, it } from 'vitest';
import { toFaitsProspect } from './campagne.js';

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
