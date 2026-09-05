import type { HeroImage, Prestation, Trade } from './types.js';

/**
 * Prestations du plombier.
 *
 * Chaque description est écrite pour tenir sur n'importe quelle entreprise du
 * métier, parce qu'elle sera publiée sans que personne n'ait vérifié
 * l'activité réelle de celle-ci. On y décrit donc un CHAMP D'INTERVENTION, et
 * jamais une promesse : ni délai (« en 30 minutes »), ni disponibilité
 * (« 24h/24 »), ni qualification (« certifié RGE »), ni garantie. Ces quatre
 * familles-là sont exactement ce qu'un artisan se fait reprocher au téléphone
 * quand c'est faux, et la base ne sait rien d'aucune des quatre.
 *
 * Cinq à sept entrées suffisent : le schéma en fait choisir trois à cinq, et
 * une liste plus longue ne ferait qu'élargir la surface à relire.
 */
const PRESTATIONS_PLOMBIER: readonly Prestation[] = [
  {
    code: 'depannage',
    label: 'Dépannage',
    description: 'Fuite, robinet qui coule, panne d’eau chaude, engorgement.',
  },
  {
    code: 'chauffe-eau',
    label: 'Chauffe-eau et ballon',
    description: 'Remplacement, entretien et réparation de chauffe-eau.',
  },
  {
    code: 'sanitaire',
    label: 'Sanitaire',
    description: 'Pose et remplacement de lavabo, WC, douche et robinetterie.',
  },
  {
    code: 'chauffage',
    label: 'Chauffage',
    description: 'Installation et entretien de radiateurs et de chaudières.',
  },
  {
    code: 'salle-de-bain',
    label: 'Salle de bain',
    description: 'Rénovation complète, de la dépose à la mise en eau.',
  },
  {
    code: 'canalisation',
    label: 'Canalisations',
    description: 'Débouchage, recherche de fuite et remplacement de tuyauterie.',
  },
];

/**
 * Prestations du serrurier.
 *
 * Écrites avant que la base ne contienne le moindre serrurier — c'est
 * précisément l'objet de D1 : le métier est un champ de contenu, pas une
 * structure. Le jour où `discover --trade serrurier` tourne, la chaîne de
 * vente fonctionne sans qu'une ligne du site change.
 *
 * L'interdiction de promettre vaut ici plus encore qu'ailleurs : l'ouverture
 * de porte est le terrain des arnaques au dépannage, et une accroche sur le
 * délai ou le prix rangerait le site du mauvais côté.
 */
const PRESTATIONS_SERRURIER: readonly Prestation[] = [
  {
    code: 'ouverture-porte',
    label: 'Ouverture de porte',
    description: 'Porte claquée ou clé perdue, ouverture sans dégât quand c’est possible.',
  },
  {
    code: 'changement-serrure',
    label: 'Changement de serrure',
    description: 'Remplacement de cylindre ou de serrure complète, toutes marques.',
  },
  {
    code: 'blindage',
    label: 'Blindage de porte',
    description: 'Pose de blocs-portes et de blindages sur porte existante.',
  },
  {
    code: 'cle',
    label: 'Clés',
    description: 'Reproduction de clés et remise en état de cylindre.',
  },
  {
    code: 'rideau-metallique',
    label: 'Rideaux métalliques',
    description: 'Dépannage et remplacement de rideaux et grilles de commerce.',
  },
  {
    code: 'metallerie',
    label: 'Métallerie',
    description: 'Garde-corps, grilles de défense et ouvrages métalliques sur mesure.',
  },
];

/**
 * Les huit héros du plombier.
 *
 * Sujets choisis sous la règle de D3 : chantiers, outils, matériaux, matière,
 * intérieurs. **Aucun visage reconnaissable présenté comme l'équipe** — les
 * autorisations de modèle ne sont pas garanties sur Unsplash, et une photo
 * d'inconnu légendée « notre artisan » sur le site d'une entreprise réelle
 * est un problème pour deux personnes à la fois.
 *
 * Huit et non trois : le motif de vente est « voici VOTRE site ». Deux
 * plombiers nantais démarchés la même semaine qui reçoivent la même
 * photographie sous le même bandeau cassent ce motif en une seconde. Croisées
 * aux cinq palettes et aux trois appariements de polices, elles donnent 120
 * variantes pour 37 prospects éligibles — mesuré en base le 2 septembre 2026.
 *
 * **Les `sujet` décrivent ce que l'image montre RÉELLEMENT.** Ils ont été
 * écrits après avoir regardé les huit fichiers, et non d'après le texte
 * alternatif de la banque d'images — lequel s'est révélé faux sur trois des
 * huit (une « main en gros plan » qui est une conduite le long d'un mur). Un
 * sujet inexact ferait choisir le modèle sur une description mensongère,
 * c'est-à-dire au hasard, et D6 ne serait plus qu'un tirage déguisé.
 */
const HEROS_PLOMBIER: readonly HeroImage[] = [
  { code: 'plomberie-01', sujet: 'bec de cuivre courbé, une goutte au bord, fond ocre uni, très serré' },
  { code: 'plomberie-02', sujet: 'salle d’eau terminée, carrelage pierre, miroir rond, meuble bois' },
  { code: 'plomberie-03', sujet: 'outils, serre-joint et boulons sur un établi, en noir et blanc' },
  { code: 'plomberie-04', sujet: 'mitigeur inox brossé sur une vasque blanche, fond très clair' },
  { code: 'plomberie-05', sujet: 'faisceau dense de tubes de cuivre et de gaines sur une machine' },
  { code: 'plomberie-06', sujet: 'deux tubes de cuivre neufs dans une cloison ouverte, bois apparent' },
  { code: 'plomberie-07', sujet: 'salle de bain claire, baignoire îlot, lumière du matin en diagonale' },
  { code: 'plomberie-08', sujet: 'conduite rouge le long d’un mur de béton brut, lumière rasante' },
] as const;

/**
 * Les huit héros du serrurier.
 *
 * Écrits avant que la base ne contienne le moindre serrurier, comme ses
 * prestations et pour la même raison (D1) : le métier est un champ de
 * contenu. Le jour où `discover --trade serrurier` tourne, la seule chose qui
 * manquera sera les fichiers eux-mêmes.
 */
const HEROS_SERRURIER: readonly HeroImage[] = [
  { code: 'serrurerie-01', sujet: 'cylindre européen en gros plan, laiton brossé' },
  { code: 'serrurerie-02', sujet: 'porte blindée entrouverte, tranche et points de fermeture' },
  { code: 'serrurerie-03', sujet: 'établi de serrurier, limes et clés brutes' },
  { code: 'serrurerie-04', sujet: 'trousseau de clés fraîchement taillées' },
  { code: 'serrurerie-05', sujet: 'pose d’une serrure multipoints sur un montant' },
  { code: 'serrurerie-06', sujet: 'rideau métallique de commerce, à demi relevé' },
  { code: 'serrurerie-07', sujet: 'garde-corps en fer forgé, détail d’assemblage' },
  { code: 'serrurerie-08', sujet: 'mains gantées sur un cylindre, aucun visage' },
] as const;

/**
 * Les métiers du bâtiment, au sens de la voie adresse.
 *
 * **Une donnée, pas une constante cachée** (A3 du spec de l'appariement par
 * adresse). Elle vit ici, avec les `Trade`, parce qu'elle se relit et se
 * complète au même moment qu'eux.
 *
 * Elle est délibérément **plus large que l'union des `categoryLabels`** : à
 * l'adresse exacte, la question n'est plus « est-ce le métier cherché ? »
 * mais « est-ce *un* métier du bâtiment ? ». C'est ce qui sépare les deux cas
 * mesurés du 5 septembre 2026 : une boulangerie à l'adresse d'un plombier est
 * un autre commerce dans le même immeuble ; un artisan classé « Serrurier »
 * quand on cherchait un plombier est le bon artisan sous une étiquette
 * voisine — et l'artisan multi-métiers est la norme.
 *
 * Trois mots sont écartés exprès, parce qu'ils ne discriminent rien :
 * « depannage », qui qualifie aussi bien l'électroménager que l'automobile
 * (voir `matchesCategory`) ; « peinture », qui vaut pour un magasin ou une
 * carrosserie, quand « peintre » désigne bien un artisan ; « travaux », qui
 * n'est un métier de personne.
 *
 * Les entrées sont **déjà normalisées** — minuscules, sans accents, un seul
 * mot — parce qu'elles sont comparées mot à mot à un libellé Google lui aussi
 * réduit. Une entrée accentuée ne serait jamais retrouvée, et le manque
 * serait silencieux.
 */
export const CATEGORIES_BATIMENT: readonly string[] = [
  'plombier', 'plomberie', 'chauffagiste', 'chauffage', 'climatisation', 'sanitaire',
  'serrurier', 'serrurerie', 'metallier', 'metallerie',
  'electricien', 'electricite',
  'couvreur', 'couverture', 'zingueur', 'zinguerie',
  'macon', 'maconnerie',
  'menuisier', 'menuiserie', 'charpentier', 'charpente',
  'carreleur', 'carrelage', 'platrier', 'platrerie', 'plaquiste',
  'peintre', 'vitrier', 'vitrerie',
  'isolation', 'etancheite', 'ravalement', 'terrassement',
  'renovation', 'batiment',
];

/**
 * Ajouter un métier consiste à ajouter un objet ici.
 *
 * `nafCodes` est volontairement un tableau : la nomenclature NAF est en cours
 * de révision et l'API expose aussi un champ `activite_principale_naf25`.
 * Un code unique ferait disparaître silencieusement une part de la population.
 */
export const TRADES: readonly Trade[] = [
  {
    slug: 'plombier',
    label: 'Plombier',
    nafCodes: ['43.22A'],
    mapsQueries: ['plombier', 'plomberie'],
    // « depannage » qualifie exactement autant un plombier qu'un serrurier,
    // et il figurait pourtant dans les seuls mots-clés du second. Mesuré sur
    // le lot de calibration : « OUEST DEPANNAGE PLOMBERIE » obtenait 1,00
    // face à « AMS Services - Spécialiste en Dépannage Plomberie… » sur ce
    // seul mot. Il reste en QUEUE de liste : `keywords[0]` compose les noms
    // de domaine proposés, où l'on veut « plomberie ».
    keywords: ['plomberie', 'plombier', 'chauffagiste', 'sanitaire', 'chauffage', 'depannage'],
    categoryLabels: ['plombier', 'plomberie', 'chauffagiste'],
    prestations: PRESTATIONS_PLOMBIER,
    heros: HEROS_PLOMBIER,
    templateRepo: 'plombier',
  },
  {
    slug: 'serrurier',
    label: 'Serrurier',
    nafCodes: ['43.32B'],
    mapsQueries: ['serrurier', 'serrurerie'],
    keywords: ['serrurerie', 'serrurier', 'blindage', 'metallerie', 'depannage'],
    categoryLabels: ['serrurier', 'serrurerie', 'metallerie'],
    prestations: PRESTATIONS_SERRURIER,
    heros: HEROS_SERRURIER,
    templateRepo: 'serrurier',
  },
];

export function getTrade(slug: string): Trade | undefined {
  return TRADES.find((trade) => trade.slug === slug);
}

/**
 * Le dépôt modèle à employer pour un métier.
 *
 * Trois niveaux, du plus précis au plus général :
 *
 * 1. ce que le métier déclare dans `trades.ts` ;
 * 2. à défaut, `PROSPEO_GITHUB_TEMPLATE_REPO` — le repli, qui permettra à une
 *    interface de gestion de trancher sans toucher au code ;
 * 3. et si ni l'un ni l'autre, un échec franc : publier depuis un modèle
 *    inconnu créerait des dépôts au nom d'entreprises réelles à partir d'on ne
 *    sait quoi.
 */
export function templateRepoFor(trade: Trade, defaut: string | undefined): string {
  const choisi = trade.templateRepo ?? defaut;
  if (choisi === undefined || choisi.trim() === '') {
    throw new Error(
      `Aucun dépôt modèle pour le métier « ${trade.slug} » : renseignez ` +
        '`templateRepo` dans trades.ts ou PROSPEO_GITHUB_TEMPLATE_REPO dans .env.',
    );
  }
  return choisi;
}
