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
 */
const HEROS_PLOMBIER: readonly HeroImage[] = [
  { code: 'plomberie-01', sujet: 'soudure au chalumeau sur un tube de cuivre, plan serré' },
  { code: 'plomberie-02', sujet: 'salle d’eau en chantier, carrelage encore nu' },
  { code: 'plomberie-03', sujet: 'outils de plomberie rangés sur un établi' },
  { code: 'plomberie-04', sujet: 'mitigeur neuf posé sur un plan de vasque' },
  { code: 'plomberie-05', sujet: 'chauffe-eau et ses raccords, en attente de mise en service' },
  { code: 'plomberie-06', sujet: 'faisceau de canalisations en cuivre le long d’un mur' },
  { code: 'plomberie-07', sujet: 'douche terminée, lumière rasante sur la robinetterie' },
  { code: 'plomberie-08', sujet: 'mains gantées serrant un raccord, aucun visage' },
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
