import { z } from 'zod';
import type { Trade } from './types.js';

/**
 * Version du format du fichier de contenu.
 *
 * Même doctrine que `MATCHING_CONFIG.version` et `SCORING_RULESET.version` :
 * ce qui est stocké et relu plus tard doit dire sous quelle règle il a été
 * produit. Ici l'enjeu est concret — un contenu écrit sous v1 vit dans un
 * dépôt GitHub que le site v2 devra encore savoir construire, ou refuser
 * bruyamment.
 */
export const SITE_CONTENT_VERSION = 'v1';

/**
 * Bornes de longueur de la part rédigée.
 *
 * Ce ne sont pas des préférences de style : ce sont les deux seuls endroits
 * où le modèle écrit librement, et une chaîne non bornée casse la mise en
 * page d'un site qu'on ne relira pas avant de l'envoyer à un artisan. Le
 * plancher compte autant que le plafond — une accroche de huit caractères
 * laisse un titre qui a l'air vide, et ça ne se voit qu'une fois déployé.
 *
 * Exportées pour que les tests s'appuient sur les valeurs plutôt que de les
 * recopier, et pour que le prompt de la tâche 2 les annonce au modèle : une
 * contrainte de rédaction se donne à l'écriture, elle ne se rattrape pas par
 * troncature après coup.
 */
export const REDACTION_LIMITS = {
  accroche: { min: 20, max: 80 },
  presentation: { min: 120, max: 400 },
  prestations: { min: 3, max: 5 },
} as const;

/**
 * Ce que le modèle produit — et c'est tout.
 *
 * C'est la décision d'architecture du §3 du plan, rendue mécanique. Le modèle
 * ne rédige PAS le fichier de contenu : il rédige trois champs. Les faits lui
 * sont donnés en entrée et recollés en sortie par le code, tels que la base
 * les fournit.
 *
 * La conséquence est structurelle, pas incantatoire : une génération ne peut
 * pas altérer un numéro de téléphone, une note Google ou une année de
 * création, puisque le modèle n'a jamais eu la main dessus. Le prompt cesse
 * d'être un rempart pour redevenir ce qu'il doit être — une consigne de
 * style.
 *
 * Bénéfice secondaire, mais réel : le schéma de sortie structurée envoyé à
 * l'API tient en trois champs. Un schéma de trente champs multiplierait les
 * occasions de réponse invalide, donc de reprise, donc de coût.
 *
 * `.strict()` sert deux fois. Il ferme la porte au modèle qui ajouterait
 * spontanément `anneesExperience: 20` — sa pente naturelle dès qu'une
 * rubrique lui paraît manquer. Et il produit `additionalProperties: false`
 * dans le JSON Schema, ce que les sorties structurées de l'API exigent.
 */
export function siteRedactionSchema(trade: Trade) {
  const codes = trade.prestations.map((p) => p.code);
  // `z.enum` réclame un tuple non vide au niveau du type. Un métier sans
  // prestation est une erreur de configuration, pas un cas à gérer : mieux
  // vaut échouer ici, à la construction du schéma, qu'au premier appel API.
  if (codes.length === 0) {
    throw new Error(`Le métier « ${trade.slug} » n'a aucune prestation : voir trades.ts.`);
  }
  const codeEnum = z.enum(codes as [string, ...string[]]);

  return z
    .object({
      accroche: z
        .string()
        .min(REDACTION_LIMITS.accroche.min)
        .max(REDACTION_LIMITS.accroche.max),
      presentation: z
        .string()
        .min(REDACTION_LIMITS.presentation.min)
        .max(REDACTION_LIMITS.presentation.max),
      /**
       * Des codes, jamais des libellés.
       *
       * Le modèle sélectionne et ordonne dans la liste close de `trades.ts` ;
       * `label` et `description` vont à l'écran sans passer par lui. Une
       * prestation inventée n'est donc pas rattrapée à la relecture : elle
       * fait échouer la validation.
       *
       * L'unicité n'est pas cosmétique : un doublon afficherait deux fois la
       * même carte. Un modèle qui remplit un quota au lieu de choisir doit
       * échouer, pas produire une page bègue.
       */
      prestations: z
        .array(codeEnum)
        .min(REDACTION_LIMITS.prestations.min)
        .max(REDACTION_LIMITS.prestations.max)
        .refine((liste) => new Set(liste).size === liste.length, {
          message: 'Deux fois la même prestation.',
        }),
    })
    .strict();
}

export type SiteRedaction = z.infer<ReturnType<typeof siteRedactionSchema>>;

/**
 * Les faits, sous leur forme validable.
 *
 * Doublon apparent de l'interface `SiteFacts` — et doublon assumé. Le fichier
 * de contenu fait l'aller-retour par un dépôt GitHub : il est écrit par le
 * collector, relu par le build Astro, et potentiellement édité à la main
 * entre les deux. Le type TypeScript ne survit à aucun de ces trajets ; le
 * schéma, si. C'est lui qui fait échouer un build plutôt que de déployer une
 * page au téléphone manquant.
 */
const faitsSchema = z
  .object({
    nomAffiche: z.string().min(1),
    metier: z.object({ slug: z.string().min(1), label: z.string().min(1) }).strict(),
    adresse: z
      .object({
        rue: z.string().min(1),
        codePostal: z.string().regex(/^\d{5}$/),
        ville: z.string().min(1),
      })
      .strict(),
    telephone: z
      .object({
        e164: z.string().regex(/^\+\d{6,15}$/),
        affichage: z.string().min(1),
      })
      .strict(),
    anneeCreation: z.number().int().min(1800).max(2100).nullable(),
    // Bornée à l'échelle Google. Une note de 12 trahirait une erreur de
    // collecte, et un site l'afficherait sans sourciller.
    noteGoogle: z.number().min(0).max(5).nullable(),
    lienMaps: z.string().url().nullable(),
    raisonSociale: z.string().min(1),
    siret: z.string().regex(/^\d{14}$/),
  })
  .strict();

/**
 * Le fichier de contenu complet, tel qu'il est écrit dans le dépôt du
 * prospect et lu par le site.
 *
 * Trois blocs séparés, et la séparation est le sujet : `faits` vient de la
 * base, `redaction` vient du modèle, `version` dit sous quelles règles. Un
 * relecteur sait donc en un coup d'œil ce qui a été inventé par une machine
 * et ce qui ne pouvait pas l'être — c'est ce qui rend la revue humaine tenable
 * en une minute, comme l'annonce le §3 du plan.
 */
export function siteContentSchema(trade: Trade) {
  return z
    .object({
      version: z
        .object({
          schema: z.literal(SITE_CONTENT_VERSION),
          /** Version des consignes, traçable comme le barème. */
          promptVersion: z.string().min(1),
          model: z.string().min(1),
        })
        .strict(),
      faits: faitsSchema,
      redaction: siteRedactionSchema(trade),
    })
    .strict();
}

export type SiteContent = z.infer<ReturnType<typeof siteContentSchema>>;

/**
 * Le même contrat, en JSON Schema.
 *
 * **Pourquoi un second encodage.** Les sorties structurées de l'API attendent
 * un JSON Schema. Le helper `zodOutputFormat` du SDK n'accepte que des schémas
 * `zod/v4`, quand ce dépôt est écrit contre l'API classique de zod 3 — la
 * convertir partout pour un seul appel serait un chantier sans rapport avec
 * celui-ci, et toucherait `config.ts` du dashboard comme du collector.
 *
 * **Ce n'est pas une duplication.** Les deux encodages dérivent des MÊMES
 * constantes : `REDACTION_LIMITS` pour les bornes, `trade.prestations` pour la
 * liste close. Aucune valeur n'est recopiée, donc aucune ne peut diverger — un
 * test compare d'ailleurs les deux encodages champ par champ.
 *
 * Le zod reste l'autorité : c'est lui qui valide la réponse REÇUE. Le JSON
 * Schema ne fait que dire à l'API ce qu'elle doit contraindre à l'écriture.
 * Une contrainte que l'API n'appliquerait pas est donc rattrapée derrière,
 * jamais laissée passer.
 */
export function siteRedactionJsonSchema(trade: Trade): Record<string, unknown> {
  const codes = trade.prestations.map((p) => p.code);
  if (codes.length === 0) {
    throw new Error(`Le métier « ${trade.slug} » n'a aucune prestation : voir trades.ts.`);
  }
  return {
    type: 'object',
    properties: {
      accroche: {
        type: 'string',
        minLength: REDACTION_LIMITS.accroche.min,
        maxLength: REDACTION_LIMITS.accroche.max,
      },
      presentation: {
        type: 'string',
        minLength: REDACTION_LIMITS.presentation.min,
        maxLength: REDACTION_LIMITS.presentation.max,
      },
      prestations: {
        type: 'array',
        items: { type: 'string', enum: codes },
        minItems: REDACTION_LIMITS.prestations.min,
        maxItems: REDACTION_LIMITS.prestations.max,
      },
    },
    required: ['accroche', 'presentation', 'prestations'],
    // Exigé par les sorties structurées, et c'est aussi ce qui ferme la porte
    // au modèle qui ajouterait spontanément « anneesExperience ».
    additionalProperties: false,
  };
}
