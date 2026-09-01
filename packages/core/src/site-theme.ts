import { z } from 'zod';
import type { Trade } from './types.js';

/**
 * La variante visuelle d'un site — trois choix, tous dans des listes closes.
 *
 * **Le principe économique du chantier n°5, rendu mécanique.** Le gabarit
 * complet — mise en page, animations, images, carte, CSS — est écrit une fois
 * et voyage par la copie de dépôt que `publish` fait déjà. Ce que le modèle
 * produit par prospect ne doit donc pas être un site : ce sont les quelques
 * champs par lesquels un site diffère du suivant.
 *
 * **Il ne compose pas, il choisit.** C'est exactement la construction de
 * `trades.ts` et de `siteRedactionSchema`, appliquée à l'apparence. La
 * garantie qui en découle est structurelle et non verbale : le modèle ne PEUT
 * pas produire une couleur au contraste illisible, une police absente du
 * dépôt, ni une image qui n'existe pas — le schéma rejette avant qu'aucun
 * fichier ne soit écrit. Un prompt qui demanderait « choisis des couleurs
 * lisibles » serait une consigne ; ceci est une porte.
 *
 * **Où vivent les valeurs, et pourquoi pas ici.** Ce fichier ne porte que des
 * identifiants. Les couleurs réelles sont dans
 * `apps/site-template/src/styles/palettes.css`, parce que le dépôt modèle est
 * copié vers 22 dépôts que Vercel construit seuls : une dépendance
 * `"@prospeo/core": "workspace:*"` y ferait échouer `npm install` avant même
 * le build (§8 des pièges déjà payés). Le gabarit doit tenir debout sans rien
 * connaître de ce monorepo.
 *
 * Les deux côtés ne peuvent pas diverger en silence pour autant : un test du
 * collector lit la feuille de style du gabarit et la confronte à ces listes,
 * suivant la convention déjà posée par `CHEMIN_CONTENU`.
 */

/**
 * Les cinq palettes, éprouvées au contraste une fois pour toutes.
 *
 * D6 exige qu'elles soient conformes WCAG AA à l'écriture du gabarit, et non
 * à la relecture : personne ne relira vingt-deux sites au colorimètre. Les
 * sept paires de chaque palette — encre, encre douce et accent sur le fond
 * comme sur la surface, plus le texte du bouton sur l'accent — sont calculées
 * par un test du gabarit, qui rougit si une seule descend sous 4,5:1.
 *
 * L'ordre n'a aucune portée fonctionnelle, mais il est stable : ces jetons
 * partent dans le prompt, et le préfixe mis en cache ne doit pas bouger d'un
 * appel à l'autre pour des raisons cosmétiques.
 */
export const PALETTES = ['ardoise', 'cuivre', 'nuit', 'terracotta', 'foret'] as const;

/**
 * Les trois appariements de polices, auto-hébergés (D5).
 *
 * Un jeton désigne une PAIRE — titres et texte — et non une police : laisser
 * le modèle apparier deux familles librement rouvrirait exactement la porte
 * que la liste close ferme. Les trois voix sont volontairement distinctes,
 * faute de quoi le choix n'en serait pas un :
 *
 * - `grotesk-serif` : titres en grotesque serré, texte en serif de labeur.
 *   Éditorial ; c'est le défaut.
 * - `humanist` : une seule famille humaniste, très lisible à petite taille.
 *   Le choix sobre.
 * - `geometrique` : titres géométriques, texte neutre. Contemporain.
 *
 * Les familles réelles sont déclarées dans la feuille de style du gabarit,
 * pour la même raison que les couleurs.
 */
export const TYPOS = ['grotesk-serif', 'humanist', 'geometrique'] as const;

export type PaletteSlug = (typeof PALETTES)[number];
export type TypoSlug = (typeof TYPOS)[number];

/**
 * Ce que chaque palette évoque, en une ligne — à destination du prompt.
 *
 * Sans ces phrases, le modèle choisirait `terracotta` sans savoir ce que
 * `terracotta` donne à l'écran, c'est-à-dire au hasard : D6 ne serait plus
 * qu'un tirage déguisé en choix. Avec elles, la palette peut s'accorder au
 * texte qu'il vient d'écrire et à l'image qu'il retient.
 *
 * **`Record` sur l'union, et non un objet libre.** TypeScript exige alors une
 * entrée par palette : ajouter `ocre` à `PALETTES` sans l'y décrire ne
 * compile pas. La liste et sa description ne peuvent donc pas diverger — ce
 * qui, autrement, produirait un jeton que le modèle peut choisir mais dont il
 * ignore tout.
 */
export const PALETTES_DECRITES: Record<PaletteSlug, string> = {
  ardoise: 'gris-bleu froid, accent acier — sobre et technique',
  cuivre: 'papier chaud, accent cuivre — la matière même de la plomberie',
  nuit: 'fond sombre, accent laiton — le rendu le plus haut de gamme',
  terracotta: 'terre cuite et brique — chaleureux, artisanal, méditerranéen',
  foret: 'vert profond, accent bouteille — entretien, durable, végétal',
};

/** Même doctrine, pour les appariements de polices. */
export const TYPOS_DECRITES: Record<TypoSlug, string> = {
  'grotesk-serif': 'titres en grotesque serré, texte en serif — éditorial, presse',
  humanist: 'une seule famille humaniste — sobre, chaleureux, très lisible',
  geometrique: 'titres géométriques, texte neutre — contemporain, net',
};

/**
 * L'état d'ouverture : ce que porte le fichier d'exemple du dépôt modèle.
 *
 * Ce n'est pas un repli d'exécution — le schéma exige les trois champs, donc
 * aucun contenu généré n'arrive sans thème. C'est la variante que montre le
 * dépôt modèle lui-même, celle qu'on regarde quand on ouvre le gabarit sans
 * avoir rien généré.
 *
 * `cuivre` parce que c'est la matière du métier et que son accent est déjà
 * celui du seul site en ligne ; `grotesk-serif` parce que c'est le seul des
 * trois appariements qui ne donne pas l'impression d'un gabarit de
 * plateforme. Le héros n'y figure pas : il dépend du métier, et le fichier
 * d'exemple prend le premier de la liste de son métier.
 */
export const THEME_DEFAUT = { palette: 'cuivre', typo: 'grotesk-serif' } as const;

/**
 * Le thème, sous sa forme validable, construit POUR un métier.
 *
 * Le métier est un argument et non une option : c'est lui qui porte la liste
 * des héros. Un schéma qui accepterait n'importe quel héros pour n'importe
 * quel métier laisserait un chantier de plomberie ouvrir le site d'un
 * serrurier — un mensonge visuel sur une page qui porte le nom d'une
 * entreprise réelle, et précisément ce que la liste close doit rendre
 * impossible.
 */
export function themeSchema(trade: Trade) {
  // Même garde que `siteRedactionSchema` : un métier sans image est une
  // erreur de configuration, et mieux vaut échouer ici, à la construction du
  // schéma, qu'au premier appel payant.
  if (trade.heros.length === 0) {
    throw new Error(`Le métier « ${trade.slug} » n'a aucune image de héros : voir trades.ts.`);
  }

  return z
    .object({
      palette: z.enum(PALETTES),
      typo: z.enum(TYPOS),
      heros: z.enum(trade.heros.map((h) => h.code) as [string, ...string[]]),
    })
    .strict();
}

export type SiteTheme = z.infer<ReturnType<typeof themeSchema>>;

/**
 * Le même contrat, en JSON Schema.
 *
 * Second encodage obligatoire, pour la raison déjà documentée dans
 * `site-content.ts` : `zodOutputFormat` réclame `zod/v4` et ce dépôt est en
 * zod 3. Les deux encodages dérivent des MÊMES constantes, si bien qu'aucune
 * valeur n'est recopiée et qu'aucune ne peut diverger — un test les compare
 * champ par champ.
 */
export function themeJsonSchema(trade: Trade): Record<string, unknown> {
  if (trade.heros.length === 0) {
    throw new Error(`Le métier « ${trade.slug} » n'a aucune image de héros : voir trades.ts.`);
  }
  return {
    type: 'object',
    properties: {
      palette: { type: 'string', enum: [...PALETTES] },
      typo: { type: 'string', enum: [...TYPOS] },
      heros: { type: 'string', enum: trade.heros.map((h) => h.code) },
    },
    required: ['palette', 'typo', 'heros'],
    additionalProperties: false,
  };
}
