import { z } from 'zod';
import { HEROS_DISPONIBLES } from './images.js';

/**
 * Le contrat du fichier de contenu, tel que le gabarit le lit.
 *
 * **Pourquoi ce fichier ne dépend pas de `@prospeo/core`.** Le dépôt modèle
 * est copié par GitHub vers un dépôt par prospect (D3), que Vercel construit
 * seul. Une dépendance `"@prospeo/core": "workspace:*"` y ferait échouer
 * l'installation avant même le build : le protocole `workspace:` n'existe que
 * dans un monorepo pnpm. Le gabarit doit donc tenir debout sans rien connaître
 * du dépôt qui l'a produit.
 *
 * **Pourquoi ce n'est pas un doublon du schéma de `packages/core`.** Les deux
 * schémas ne gardent pas la même porte, et c'est pour cela qu'ils diffèrent
 * légitimement :
 *
 * - `siteRedactionSchema` (core) contraint ce que le MODÈLE a le droit de
 *   produire. C'est lui qui porte la liste close des prestations, sous forme
 *   d'énumération : le modèle choisit un code ou échoue.
 * - Le schéma ci-dessous garde ce que le BUILD a le droit de rendre. À ce
 *   stade, le choix a déjà eu lieu et a déjà été contraint ; les prestations
 *   arrivent résolues, libellé et description compris. Réimposer ici la liste
 *   close obligerait le gabarit à embarquer `trades.ts`, c'est-à-dire à
 *   redevenir dépendant du monorepo — pour vérifier une seconde fois ce qui
 *   ne peut plus varier.
 *
 * La garantie « aucune prestation inventée » est donc acquise en amont, à la
 * génération. Ici on vérifie seulement qu'une page complète peut être rendue.
 *
 * La cohérence de la prose avec les faits (« depuis 2005 » sur une entreprise
 * créée en 2009) relève de la même logique : elle est vérifiée par
 * `verifierCoherence` dans `packages/core`, au moment où l'étage `publish`
 * écrit ce fichier. Rien d'autre n'écrit ces dépôts.
 *
 * **Le thème est l'exception, et elle est instructive.** Sur les prestations,
 * ce schéma-ci ne réimpose PAS la liste close : le choix a déjà eu lieu en
 * amont et la revalider obligerait le gabarit à embarquer `trades.ts`. Sur le
 * héros, au contraire, il l'impose — mais contre une liste que lui seul
 * connaît : les fichiers réellement présents dans `src/assets/heros/`.
 *
 * Ce n'est donc pas une seconde vérification de la même chose. `core` valide
 * une INTENTION — ce héros appartient-il au métier ; le gabarit valide une
 * PRÉSENCE — ce fichier est-il dans ce dépôt-ci. La seconde attrape ce que la
 * première ne peut pas voir : un dépôt modèle dont on a retiré une image, ou
 * un contenu de plombier écrit dans un dépôt de serrurier.
 */

/**
 * Les listes closes du thème, redites ici.
 *
 * Doublon **volontaire**, exactement comme le reste de ce fichier : le gabarit
 * ne peut pas importer `@prospeo/core`, dont le protocole `workspace:` ferait
 * échouer `npm install` sur Vercel pour les 22 dépôts.
 *
 * Les deux côtés ne peuvent pas diverger en silence pour autant. Ces valeurs
 * sont les CLÉS des blocs de `palettes.css` et `typos.css` — un jeton ajouté
 * ici sans sa règle CSS donnerait une page sans couleurs — et un test du
 * collector confronte les trois sources : ce fichier, les feuilles de style, et
 * les constantes de `packages/core`. C'est la convention déjà posée par
 * `CHEMIN_CONTENU`, qui relie de la même façon `publish` et `index.astro`.
 */
const PALETTES = ['ardoise', 'cuivre', 'nuit', 'terracotta', 'foret'] as const;
const TYPOS = ['grotesk-serif', 'humanist', 'geometrique'] as const;

const prestationSchema = z
  .object({
    code: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

export const contenuPublieSchema = z
  .object({
    version: z
      .object({
        schema: z.literal('v2'),
        promptVersion: z.string().min(1),
        model: z.string().min(1),
      })
      .strict(),
    /**
     * L'éditeur réel du site — nous, pas l'artisan.
     *
     * Exigé par le schéma, donc absent = build rouge. Un site publié au nom
     * d'un tiers sans éditeur identifiable ni moyen d'en demander le retrait
     * est exactement ce que le §11 conformité interdit.
     */
    editeur: z
      .object({ nom: z.string().min(1), contact: z.string().min(1) })
      .strict(),
    faits: z
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
          .object({ e164: z.string().regex(/^\+\d{6,15}$/), affichage: z.string().min(1) })
          .strict(),
        anneeCreation: z.number().int().min(1800).max(2100).nullable(),
        // Bornée à l'échelle Google : une note de 12 trahirait une erreur de
        // collecte, et la page l'afficherait sans sourciller.
        noteGoogle: z.number().min(0).max(5).nullable(),
        lienMaps: z.string().url().nullable(),
        // Le point de la carte. Bornées au domaine terrestre : une longitude
        // de 191 vient d'une erreur de collecte et rendrait une carte vide.
        coordonnees: z
          .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
          .strict()
          .nullable(),
        raisonSociale: z.string().min(1),
        siret: z.string().regex(/^\d{14}$/),
      })
      .strict(),
    redaction: z
      .object({
        accroche: z.string().min(1),
        presentation: z.string().min(1),
        /**
         * La variante visuelle, en jetons.
         *
         * `palette` et `typo` sont validées contre les listes que
         * `palettes.css` et `typos.css` déclarent réellement : une valeur hors
         * liste ne poserait aucune variable CSS, et la page rendrait du texte
         * sans couleurs ni police — un défaut qu'un build ne signale pas et
         * qu'on ne découvre qu'à l'œil, sur une page déjà déployée.
         *
         * `heros` est validé contre les fichiers présents (voir `images.ts`).
         */
        theme: z
          .object({
            palette: z.enum(PALETTES),
            typo: z.enum(TYPOS),
            heros: z.enum(HEROS_DISPONIBLES as [string, ...string[]]),
          })
          .strict(),
        // Trois à cinq : en deçà la section a l'air d'un site inachevé,
        // au-delà elle devient une liste de courses et ne dit plus rien.
        prestations: z.array(prestationSchema).min(3).max(5),
      })
      .strict(),
  })
  .strict();

export type ContenuPublie = z.infer<typeof contenuPublieSchema>;
export type Prestation = z.infer<typeof prestationSchema>;
