import type { SiteContent } from './site-content.js';

/**
 * Un écart entre ce que la prose affirme et ce que la base sait.
 */
export interface IncoherenceContenu {
  /** Chemin du champ fautif, pour que le message dise où regarder. */
  champ: 'redaction.accroche' | 'redaction.presentation';
  message: string;
}

/**
 * Vérifie que la prose n'avance aucun chiffre que les faits ne portent pas.
 *
 * **Le trou que cette fonction bouche.** Le §3 du plan sépare les faits, tirés
 * de la base, de la rédaction, produite par le modèle. Cette séparation
 * garantit qu'une génération ne peut pas altérer un numéro de téléphone ou une
 * note : le modèle n'a jamais la main sur ces champs. Mais elle ne garantit
 * rien sur la PROSE, où le modèle écrit librement — et où il lui suffit
 * d'écrire « depuis 2005 » pour publier une invention sur un site portant le
 * nom d'une entreprise réelle.
 *
 * C'était le dernier endroit du contenu où la règle « pas d'invention » ne
 * tenait que par le prompt. Un prompt est une consigne ; ceci est une
 * vérification.
 *
 * **Ce qu'elle ne fait pas.** Elle ne juge pas la véracité d'une affirmation
 * qualitative — « artisan sérieux », « travail soigné » — parce que rien en
 * base ne permettrait de la trancher. Elle s'en tient aux CHIFFRES, qui sont
 * exactement la classe d'affirmations que la base peut confirmer ou démentir,
 * et accessoirement celle qu'un client vérifie en un coup d'œil.
 *
 * La signature ne réclame que `faits` et `redaction` — les deux seules parties
 * qu'elle lit. Exiger un `SiteContent` entier obligerait `generate` à
 * fabriquer un bloc `version` qui ne sert à rien ici, et masquerait ce dont la
 * fonction dépend réellement.
 */
export function verifierCoherence(
  contenu: Pick<SiteContent, 'faits' | 'redaction'>,
): IncoherenceContenu[] {
  const ecarts: IncoherenceContenu[] = [];
  const champs = [
    { champ: 'redaction.accroche' as const, texte: contenu.redaction.accroche },
    { champ: 'redaction.presentation' as const, texte: contenu.redaction.presentation },
  ];

  for (const { champ, texte } of champs) {
    for (const message of ecartsDe(texte, contenu.faits)) ecarts.push({ champ, message });
  }
  return ecarts;
}

/**
 * Les chiffres d'un texte confrontés aux faits, dans l'ordre où on les lit.
 *
 * L'ordre des trois familles est celui des tests, et n'a pas d'importance
 * fonctionnelle : l'appelant reçoit tous les écarts d'un coup, parce qu'un
 * étage `generate` qui relancerait le modèle sur un seul écart par tour
 * multiplierait les appels payants.
 */
function ecartsDe(texte: string, faits: SiteContent['faits']): string[] {
  const messages: string[] = [];

  // --- Années -------------------------------------------------------------
  //
  // `\b` de part et d'autre : sans lui, « 44300 » livrerait « 4430 », et un
  // code postal nantais ferait échouer un contenu exact. Les bornes 19xx/20xx
  // écartent aussi les nombres qui ne prétendent pas être des dates —
  // « plus de 10 ans » n'est pas une affirmation datée, et ce n'est pas à
  // cette fonction de juger si elle est vraie.
  for (const found of texte.matchAll(/\b(?:19|20)\d{2}\b/g)) {
    const annee = found[0];
    if (faits.anneeCreation === null) {
      messages.push(
        `« ${annee} » est avancé alors que la base ne connaît aucune date de création.`,
      );
    } else if (annee !== String(faits.anneeCreation)) {
      messages.push(`« ${annee} » contredit l'année de création connue (${faits.anneeCreation}).`);
    }
  }

  // --- Note Google --------------------------------------------------------
  //
  // Un nombre de 0 à 5 avec une décimale : la forme d'une note. Le séparateur
  // peut être une virgule ou un point, parce que le modèle rédige en français
  // mais pense en anglais assez souvent pour que les deux arrivent.
  for (const found of texte.matchAll(/\b([0-5])[.,](\d)\b/g)) {
    const brut = found[0];
    const valeur = Number.parseFloat(`${found[1]}.${found[2]}`);
    if (faits.noteGoogle === null) {
      messages.push(`« ${brut} » ressemble à une note alors que la base n'en connaît aucune.`);
    } else if (Math.abs(valeur - faits.noteGoogle) > 1e-9) {
      messages.push(`« ${brut} » contredit la note Google connue (${faits.noteGoogle}).`);
    }
  }

  // --- Numéros de téléphone ----------------------------------------------
  //
  // Neuf chiffres au moins, éventuellement séparés par des espaces, points ou
  // tirets : la forme d'un numéro français quelle que soit la ponctuation
  // choisie. La comparaison se fait sur les seuls chiffres, sans quoi
  // « 06.02.00.23.60 » serait déclaré faux alors qu'il est exact.
  const attendus = new Set([faits.telephone.e164.replace(/\D/g, ''), chiffresNationaux(faits)]);
  for (const found of texte.matchAll(/\+?\d(?:[\s.\-]?\d){8,}/g)) {
    const brut = found[0].trim();
    const chiffres = brut.replace(/\D/g, '');
    if (!attendus.has(chiffres)) {
      messages.push(
        `« ${brut} » ressemble à un numéro de téléphone qui n'est pas celui de la base ` +
          `(${faits.telephone.affichage}).`,
      );
    }
  }

  return messages;
}

/** `+33602002360` → `0602002360`, la forme sous laquelle un Français l'écrit. */
function chiffresNationaux(faits: SiteContent['faits']): string {
  const e164 = faits.telephone.e164;
  return e164.startsWith('+33') ? `0${e164.slice(3)}` : e164.replace(/\D/g, '');
}
