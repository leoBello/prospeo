import { normalizePhone } from './phone.js';
import { getTrade } from './trades.js';

/**
 * Les faits d'un prospect, tels que la base les connaît — et rien d'autre.
 *
 * Cette interface est le contrat central du chantier n°4. Le §4 du plan pose
 * la règle : « le modèle ne reçoit que des faits vérifiés issus de la base, et
 * le prompt lui interdit d'en inventer ». `assembleFacts` en est le garde-fou
 * TECHNIQUE, par opposition au prompt qui n'en est que le garde-fou verbal :
 * ce que cette fonction ne renvoie pas ne peut pas atteindre le prompt, donc
 * ne peut pas atteindre un site publié au nom d'une entreprise réelle.
 *
 * Ce qui n'y figure pas, et pourquoi — mesuré sur les 139 lignes de la base
 * nantaise le 1er septembre 2026 :
 *
 * - **nombre d'avis** : `review_count` est nul sur 139 lignes sur 139. Google
 *   ne le publie plus. Un champ optionnel serait ici un piège, parce qu'il
 *   serait vide à jamais tout en laissant croire qu'il peut se remplir.
 * - **réseaux sociaux** : `social_urls` est vide sur 139 lignes sur 139.
 *   Aucun étage ne l'alimente.
 * - **effectif** : renseigné, mais vaut `NN` (non communiqué) sur la
 *   population qui nous intéresse — des entrepreneurs individuels. Un site
 *   qui annonce « 3 salariés » sur cette base se tromperait.
 * - **horaires, zone d'intervention en kilomètres, années d'expérience,
 *   certifications, tarifs** : la base ne les a jamais contenus et aucune
 *   source n'est prévue pour les produire.
 */
export interface SiteFacts {
  /** Nom commercial, celui qui s'affiche en titre. */
  nomAffiche: string;
  metier: { slug: string; label: string };
  adresse: { rue: string; codePostal: string; ville: string };
  /**
   * Deux formes du même numéro : `e164` fait le lien `tel:`, `affichage`
   * s'imprime. Les séparer ici plutôt que dans le gabarit fait de la mise en
   * forme une donnée et non une affaire de présentation — le jour où un
   * numéro non français entre en base, c'est ici qu'on le verra.
   */
  telephone: { e164: string; affichage: string };
  /**
   * Année, et non ancienneté.
   *
   * « Depuis 2009 » reste vrai indéfiniment ; « 17 ans d'expérience » est faux
   * l'année suivante. Le contenu est généré une fois et déployé pour des mois.
   * Le §14 ter du spec du socle documente exactement ce piège sur les libellés
   * du barème, qui figent « Créée il y a 13 ans » sans dire de quand.
   */
  anneeCreation: number | null;
  /** Note Google, sans jamais le nombre d'avis qui la fonderait. */
  noteGoogle: number | null;
  lienMaps: string | null;
  /** Dénomination Sirene brute, réservée aux mentions légales. */
  raisonSociale: string;
  siret: string;
}

/**
 * Les clés de `SiteFacts`, énumérées pour être testables.
 *
 * Un test compare cette liste aux clés réellement produites. Le but n'est pas
 * la couverture : c'est qu'ajouter un fait au site oblige à passer par ici, et
 * donc à écrire d'où la base le tire. Un champ ajouté en douce dans le
 * gabarit Astro n'aurait aucune source ; celui-ci fait échouer la suite.
 */
export const SITE_FACT_KEYS = [
  'nomAffiche',
  'metier',
  'adresse',
  'telephone',
  'anneeCreation',
  'noteGoogle',
  'lienMaps',
  'raisonSociale',
  'siret',
] as const;

/** Ce que la base fournit, à plat : une ligne `prospect` et son enrichissement. */
export interface SiteFactsInput {
  siret: string;
  denomination: string;
  denominationUsuelle: string | null;
  tradeSlug: string;
  address: string;
  postalCode: string;
  city: string;
  /** Date ISO `YYYY-MM-DD`. */
  dateCreation: string | null;
  enrichment: {
    status: 'ok' | 'not_found' | 'ambiguous' | 'blocked';
    matchedName: string | null;
    phoneE164: string | null;
    rating: number | null;
    mapsUrl: string | null;
  } | null;
}

/**
 * Met une chaîne Sirene en casse de titre.
 *
 * Sirene stocke tout en capitales. Un titre de page en capitales se lit comme
 * un cri, et c'est la première chose que voit l'artisan à qui l'on montre
 * « son » site. Le traitement est volontairement simple — première lettre de
 * chaque mot, y compris après un tiret pour « CHAUFFE-EAU » — parce qu'une
 * règle typographique française complète (particules, sigles) rendrait des
 * résultats moins prévisibles sur des noms qui sont souvent des patronymes.
 */
function casseDeTitre(raw: string): string {
  return raw
    .toLocaleLowerCase('fr-FR')
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, avant: string, lettre: string) => {
      return `${avant}${lettre.toLocaleUpperCase('fr-FR')}`;
    });
}

/**
 * Le nom sous lequel l'entreprise se présente au public.
 *
 * Ordre de préférence, du plus vérifié au moins vérifié :
 *
 * 1. **Le nom apparié sur Google**, quand l'enrichissement a conclu. Ce n'est
 *    pas un nom deviné : l'appariement a franchi le seuil de confiance de
 *    `MATCHING_CONFIG`, et c'est le nom sous lequel les clients de l'artisan
 *    le trouvent déjà. Il arrive de surcroît correctement mis en forme.
 * 2. **L'enseigne Sirene** (`denomination_usuelle`), mise en casse de titre.
 *    Elle énumère parfois plusieurs enseignes séparées par des virgules —
 *    « NANTES CHAUFFE-EAU, PLOMBERIE ALADIN, DEPANN'HOTEL » — auquel cas la
 *    première fait office de nom principal ; en afficher quatre en titre
 *    donnerait une page illisible.
 * 3. **La dénomination légale**, privée de ses parenthèses et de ce qui suit
 *    un tiret entouré d'espaces. « AQUATIO - VINCENT COMBE » désigne
 *    l'enseigne puis le gérant : c'est « Aquatio » qu'on veut en titre. Ce
 *    découpage est celui que `nameVariants` documente et applique déjà pour
 *    l'appariement ; il est refait ici sur la chaîne BRUTE parce que
 *    `nameVariants` normalise — minuscules, sans accents — ce qui convient à
 *    une comparaison et jamais à un affichage.
 */
function nomAffiche(input: SiteFactsInput): string {
  const matched = input.enrichment?.matchedName;
  if (matched !== null && matched !== undefined && matched.trim() !== '') return matched.trim();

  const source = input.denominationUsuelle ?? input.denomination;
  const premier = source
    .replace(/\([^)]*\)/g, ' ')
    .split(/,|\/|\s+-\s+/)[0]
    ?.trim();

  // La dénomination amputée de ses parenthèses peut être vide — c'est le cas
  // quand tout le nom tient DANS la parenthèse. On retombe alors sur la
  // chaîne d'origine plutôt que de rendre un titre vide.
  const retenu = premier !== undefined && premier !== '' ? premier : source;
  return casseDeTitre(retenu.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Sépare la voie du code postal et de la ville.
 *
 * `prospect.address` agglutine les trois — « 37 RUE JACQUES CARTIER 44300
 * NANTES ». Les afficher tels quels sur une seule ligne fonctionne, mais
 * empêche de composer une adresse postale correcte, et surtout laisse le code
 * postal au milieu d'une phrase. Le découpage s'appuie sur `postalCode`, déjà
 * en base et donc fiable, plutôt que sur une expression régulière à cinq
 * chiffres qui couperait au mauvais endroit dès qu'un numéro de voie en
 * compte cinq.
 */
function decoupeAdresse(input: SiteFactsInput): SiteFacts['adresse'] {
  const index = input.address.lastIndexOf(input.postalCode);
  const rue = index === -1 ? input.address : input.address.slice(0, index);
  return {
    rue: casseDeTitre(rue.replace(/\s+/g, ' ').trim()),
    codePostal: input.postalCode,
    ville: casseDeTitre(input.city.trim()),
  };
}

/** `+33602002360` → `06 02 00 23 60`, la forme que l'on lit à voix haute. */
function affichageTelephone(e164: string): string {
  const national = `0${e164.slice(3)}`;
  return national.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

/**
 * Assemble les faits publiables d'un prospect, ou `null` s'il n'est pas
 * éligible à un site.
 *
 * Deux causes de refus, toutes deux volontaires :
 *
 * - **Métier inconnu du projet.** Sans métier, il n'existe pas de liste close
 *   de prestations : le modèle n'aurait rien où puiser et comblerait le trou.
 * - **Aucun téléphone.** Le plan (tâche 1) le range parmi les champs
 *   obligatoires, et la mesure lui donne raison : une vitrine d'artisan sans
 *   numéro n'a pas d'appel à l'action, donc rien à vendre. Coût réel de cette
 *   sévérité, mesuré sur la base nantaise : 2 des 22 cibles appariées, et
 *   aucune des 3 du banc d'essai D7.
 *
 * Rendre `null` plutôt que lever suit `buildScoreRow` : l'appelant compte les
 * prospects écartés et poursuit son lot, au lieu d'interrompre un run entier
 * sur une ligne incomplète.
 */
export function assembleFacts(input: SiteFactsInput): SiteFacts | null {
  const trade = getTrade(input.tradeSlug);
  if (trade === undefined) return null;

  // `normalizePhone` plutôt qu'une reprise telle quelle : la colonne est
  // censée contenir du E.164, mais elle est alimentée par du scraping. Faire
  // repasser la valeur par le normaliseur coûte un appel et garantit qu'un
  // lien `tel:` cassé ne part pas dans un site déployé.
  const phone = normalizePhone(input.enrichment?.phoneE164 ?? null);
  if (phone === null) return null;

  const anneeCreation =
    input.dateCreation === null ? null : Number.parseInt(input.dateCreation.slice(0, 4), 10);

  return {
    nomAffiche: nomAffiche(input),
    metier: { slug: trade.slug, label: trade.label },
    adresse: decoupeAdresse(input),
    telephone: { e164: phone.e164, affichage: affichageTelephone(phone.e164) },
    anneeCreation: anneeCreation !== null && Number.isFinite(anneeCreation) ? anneeCreation : null,
    noteGoogle: input.enrichment?.rating ?? null,
    lienMaps: input.enrichment?.mapsUrl ?? null,
    raisonSociale: input.denomination,
    siret: input.siret,
  };
}
