import { describe, expect, it } from 'vitest';
import {
  REDACTION_LIMITS,
  SITE_CONTENT_VERSION,
  siteContentSchema,
  siteRedactionJsonSchema,
  siteRedactionSchema,
} from './site-content.js';
import { PALETTES, TYPOS } from './site-theme.js';
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
  theme: { palette: 'cuivre', typo: 'grotesk-serif', heros: 'plomberie-01' },
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
    expect(Object.keys(shape).sort()).toEqual([
      'accroche',
      'presentation',
      'prestations',
      'theme',
    ]);
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

describe('siteRedactionJsonSchema', () => {
  it('dit la même chose que le schéma zod', () => {
    // Deux encodages du même contrat : le zod valide la réponse reçue, le JSON
    // Schema dit à l'API ce qu'elle doit contraindre à l'écriture. Ils ne se
    // recopient pas — ils dérivent des mêmes constantes — mais rien
    // n'empêcherait quelqu'un de modifier l'un en oubliant l'autre. Ce test
    // est ce qui l'empêche.
    const js = siteRedactionJsonSchema(PLOMBIER) as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
      additionalProperties: boolean;
    };

    expect(Object.keys(js.properties).sort()).toEqual(
      Object.keys(siteRedactionSchema(PLOMBIER).shape).sort(),
    );
    expect(js.required.sort()).toEqual(['accroche', 'presentation', 'prestations', 'theme']);
    expect(js.additionalProperties).toBe(false);

    expect(js.properties['accroche']?.maxLength).toBe(REDACTION_LIMITS.accroche.max);
    expect(js.properties['presentation']?.minLength).toBe(REDACTION_LIMITS.presentation.min);
    expect(js.properties['prestations']?.minItems).toBe(REDACTION_LIMITS.prestations.min);
  });

  it('énumère exactement la liste close du métier', () => {
    const items = (siteRedactionJsonSchema(SERRURIER) as {
      properties: { prestations: { items: { enum: string[] } } };
    }).properties.prestations.items.enum;
    expect(items).toEqual(SERRURIER.prestations.map((p) => p.code));
    expect(items).not.toContain('chauffe-eau');
  });
});

describe('le passage en v2', () => {
  it('fait du thème une part de ce que le modèle produit', () => {
    // D10. Le bloc `theme` s'ajoute à la RÉDACTION et non à côté d'elle, et
    // ce choix suit la doctrine déjà posée : `redaction` est l'endroit où un
    // relecteur regarde pour voir ce qu'une génération a décidé. La palette,
    // la typographie et l'image en font partie exactement au même titre que
    // l'ordre des prestations — ce sont des choix, pas des faits.
    expect(SITE_CONTENT_VERSION).toBe('v2');
    expect(siteRedactionSchema(PLOMBIER).safeParse(REDACTION).success).toBe(true);
  });

  it('refuse une rédaction v1, restée sans thème', () => {
    // Un contenu écrit sous v1 vit dans un dépôt GitHub que le site v2 doit
    // encore savoir construire — ou refuser bruyamment. Il refuse : sans
    // thème, la page n'a ni couleurs ni police, et le build rendrait des
    // variables CSS vides plutôt que d'échouer. Mieux vaut le rejet ici, où
    // il coûte une régénération à quatre centimes.
    const { theme, ...v1 } = REDACTION;
    expect(theme).toBeDefined();
    expect(siteRedactionSchema(PLOMBIER).safeParse(v1).success).toBe(false);
  });

  it('dit la même chose du thème dans les deux encodages', () => {
    // Même raison que pour les prestations : le zod valide la réponse reçue,
    // le JSON Schema contraint son écriture. Rien n'empêcherait de modifier
    // l'un en oubliant l'autre — sinon ce test.
    const js = siteRedactionJsonSchema(PLOMBIER) as {
      properties: { theme: { properties: Record<string, { enum: string[] }>; required: string[] } };
    };
    const theme = js.properties.theme;

    expect(theme.required.sort()).toEqual(['heros', 'palette', 'typo']);
    expect(theme.properties['palette']?.enum).toEqual([...PALETTES]);
    expect(theme.properties['typo']?.enum).toEqual([...TYPOS]);
    // Les héros sont ceux DU MÉTIER : le schéma d'un plombier ne doit pas
    // laisser passer une image de serrurerie.
    expect(theme.properties['heros']?.enum).toEqual(PLOMBIER.heros.map((h) => h.code));
    expect(theme.properties['heros']?.enum).not.toContain(SERRURIER.heros[0]!.code);
  });
});
