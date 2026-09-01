import { describe, expect, it } from 'vitest';
import {
  REDACTION_LIMITS,
  SITE_CONTENT_VERSION,
  siteContentSchema,
  siteRedactionSchema,
} from './site-content.js';
import { getTrade } from './trades.js';

const PLOMBIER = getTrade('plombier')!;
const SERRURIER = getTrade('serrurier')!;

/** Une rédaction valide, dont les tests ci-dessous dérivent leurs variantes. */
const REDACTION = {
  accroche: 'Plombier à Nantes, dépannage et installation',
  presentation:
    'Dos-Services intervient à Nantes pour vos dépannages de plomberie comme ' +
    'pour vos installations. Vous joignez directement l’artisan au téléphone, ' +
    'et il se déplace chez vous.',
  prestations: ['depannage', 'chauffe-eau', 'sanitaire'],
};

describe('siteRedactionSchema', () => {
  it('ne demande au modèle que ce qu’il doit rédiger', () => {
    // C'est la décision d'architecture du §3 du plan, rendue mécanique : le
    // modèle ne produit PAS le fichier de contenu, il produit la seule part
    // rédactionnelle. Les faits y sont recollés après coup, tels que la base
    // les donne.
    //
    // Conséquence directe : aucune génération ne peut altérer un numéro de
    // téléphone, une note Google ou une année de création, puisque le modèle
    // n'a jamais eu la main dessus. Le prompt n'est plus le seul rempart —
    // il n'est même plus un rempart, juste une consigne de style.
    const shape = siteRedactionSchema(PLOMBIER).shape;
    expect(Object.keys(shape).sort()).toEqual(['accroche', 'presentation', 'prestations']);
  });

  it('accepte une rédaction conforme', () => {
    expect(siteRedactionSchema(PLOMBIER).safeParse(REDACTION).success).toBe(true);
  });

  it('rejette une prestation hors de la liste close du métier', () => {
    // La liste vit dans `trades.ts`, écrite à la main. Le modèle choisit et
    // ordonne ; il n'invente pas. « Intervention en 30 minutes » et
    // « certifié RGE » sont exactement ce que la base ignore et que le §4 du
    // plan interdit — ici, ils ne passent pas la validation, ils ne
    // dépendent pas de la docilité du modèle.
    const r = siteRedactionSchema(PLOMBIER).safeParse({
      ...REDACTION,
      prestations: ['depannage', 'intervention-30-minutes', 'sanitaire'],
    });
    expect(r.success).toBe(false);
  });

  it('rejette la prestation d’un autre métier', () => {
    // Le schéma est construit POUR un métier. Un serrurier ne pose pas de
    // chauffe-eau, et le site étant neutre en métier (D1), rien d'autre que
    // cette contrainte ne l'empêcherait.
    expect(
      siteRedactionSchema(SERRURIER).safeParse({
        ...REDACTION,
        prestations: ['depannage', 'chauffe-eau', 'sanitaire'],
      }).success,
    ).toBe(false);
  });

  it('rejette un champ que le schéma ne prévoit pas', () => {
    // `.strict()` sert deux fois. Il ferme la porte au modèle qui ajouterait
    // spontanément « anneesExperience: 20 » — sa pente naturelle quand une
    // rubrique lui semble manquer. Et il produit `additionalProperties: false`
    // dans le JSON Schema, ce que les sorties structurées de l'API exigent.
    const r = siteRedactionSchema(PLOMBIER).safeParse({
      ...REDACTION,
      anneesExperience: 20,
    });
    expect(r.success).toBe(false);
  });

  it('borne l’accroche et la présentation', () => {
    const schema = siteRedactionSchema(PLOMBIER);
    // Trop court : le gabarit affiche un titre vide, ce qui ne se voit qu'à
    // l'œil, une fois déployé.
    expect(schema.safeParse({ ...REDACTION, accroche: 'Plombier' }).success).toBe(false);
    // Trop long : l'accroche déborde sur mobile, là où se trouvent les
    // clients de l'artisan (D2).
    expect(
      schema.safeParse({ ...REDACTION, accroche: 'x'.repeat(REDACTION_LIMITS.accroche.max + 1) })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...REDACTION,
        presentation: 'x'.repeat(REDACTION_LIMITS.presentation.max + 1),
      }).success,
    ).toBe(false);
  });

  it('exige entre trois et cinq prestations, sans doublon', () => {
    const schema = siteRedactionSchema(PLOMBIER);
    // Deux : la section a l'air d'un site inachevé. Six : elle devient une
    // liste de courses et ne dit plus rien.
    expect(schema.safeParse({ ...REDACTION, prestations: ['depannage', 'sanitaire'] }).success).toBe(
      false,
    );
    // Un doublon afficherait deux fois la même carte : le modèle qui remplit
    // un quota plutôt que de choisir doit échouer, pas produire une page
    // bègue.
    expect(
      schema.safeParse({ ...REDACTION, prestations: ['depannage', 'depannage', 'sanitaire'] })
        .success,
    ).toBe(false);
  });
});

describe('siteContentSchema', () => {
  it('assemble faits et rédaction, et porte de quoi retracer la génération', () => {
    // `promptVersion` suit la même doctrine que `MATCHING_CONFIG.version` et
    // `SCORING_RULESET.version` : un contenu relu dans six mois doit dire
    // sous quelles consignes et par quel modèle il a été écrit, sans quoi une
    // évolution du prompt rend tout l'existant inexplicable.
    const shape = siteContentSchema(PLOMBIER).shape;
    expect(Object.keys(shape).sort()).toEqual(['faits', 'redaction', 'version']);
  });

  it('refuse un contenu dont les faits ne sont pas ceux du contrat', () => {
    const schema = siteContentSchema(PLOMBIER);
    const r = schema.safeParse({
      version: { schema: SITE_CONTENT_VERSION, promptVersion: 'v1', model: 'claude-opus-4-8' },
      faits: { nomAffiche: 'Dos-Services' }, // amputé
      redaction: REDACTION,
    });
    expect(r.success).toBe(false);
  });
});
