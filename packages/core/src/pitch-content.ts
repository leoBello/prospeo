import { z } from 'zod';

/**
 * Version du format des messages.
 *
 * Même doctrine que `SITE_CONTENT_VERSION` et `SCORING_RULESET.version` : un
 * message archivé dans `generated_message` et relu dans six mois doit dire
 * sous quelle règle il a été écrit.
 */
export const PITCH_CONTENT_VERSION = 'v1';

/**
 * Le jeu de caractères GSM 03.38, celui qu'un SMS encode sur 7 bits.
 *
 * Recopié plutôt que dérivé parce qu'il n'existe nulle part en JavaScript, et
 * qu'il est figé depuis 1998. Ce qui compte ici n'est pas ce qu'il contient
 * mais ce qu'il OMET : « ç » minuscule, les circonflexes, l'apostrophe
 * typographique « ’ » et « œ » n'y sont pas, alors qu'un modèle qui rédige en
 * français les produit spontanément. Les accents graves — è, é, ù, à, ì, ò —
 * y sont, eux : les croire absents ferait rejeter du français ordinaire.
 */
const GSM7_BASE =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/**
 * La table d'extension : présents, mais facturés deux septets chacun.
 *
 * L'euro en fait partie. Un message calibré au caractère près déborde donc
 * sans que sa longueur apparente ait bougé.
 */
const GSM7_EXTENSION = '^{}\\[~]|€';

/** Un SMS isolé, en alphabet 7 bits. */
const SMS_GSM7_SEUL = 160;
/**
 * Un segment de message concaténé : les 7 octets d'en-tête qui recollent les
 * morceaux amputent chaque segment de sept caractères.
 */
const SMS_GSM7_CONCAT = 153;
/** Les mêmes, en UCS-2 — l'alphabet de repli dès qu'un caractère sort du jeu GSM. */
const SMS_UCS2_SEUL = 70;
const SMS_UCS2_CONCAT = 67;

/**
 * Nombre de segments qu'on s'autorise.
 *
 * Un seul segment ne suffit pas, et le calcul est vite fait : l'URL déployée
 * pèse à elle seule 46 caractères (mesuré sur
 * `https://dos-services-51000900400035.vercel.app`), soit 29 % d'un SMS isolé.
 * Il resterait 114 caractères pour se présenter, dire pourquoi cette page
 * existe, et donner le moyen de la faire retirer. Ce qui sauterait en premier
 * dans 114 caractères, c'est la dernière de ces trois choses — c'est-à-dire
 * exactement celle qu'on ne doit pas couper.
 */
export const SMS_SEGMENTS_MAX = 2;

/**
 * Bornes de longueur, par canal.
 *
 * Ce ne sont pas des préférences de style. Chaque borne répond à une contrainte
 * du support : un objet d'email au-delà de 80 caractères est tronqué par les
 * clients de messagerie, un corps de 1 100 caractères dépasse ce qu'on lit
 * dans un message non sollicité, un script d'appel de trois lignes ne tient pas
 * une conversation.
 *
 * Les planchers comptent autant que les plafonds : un corps d'email de deux
 * phrases n'a pas la place de dire à la fois qui écrit, pourquoi cette page
 * existe et comment la faire retirer — et c'est cette dernière partie qui
 * disparaîtrait.
 *
 * Exportées pour que les tests s'appuient sur les valeurs plutôt que de les
 * recopier, et pour que le prompt les annonce au modèle : une contrainte de
 * rédaction se donne à l'écriture, elle ne se rattrape pas par troncature.
 */
export const PITCH_LIMITS = {
  emailObjet: { min: 20, max: 80 },
  emailCorps: { min: 350, max: 1100 },
  sms: { min: 120, max: SMS_GSM7_CONCAT * SMS_SEGMENTS_MAX },
  appel: { min: 300, max: 900 },
} as const;

export interface MesureSms {
  /** Longueur en caractères Unicode, telle qu'on la lit. */
  caracteres: number;
  /** Longueur en unités facturables : les caractères d'extension comptent double. */
  unites: number;
  alphabet: 'gsm7' | 'ucs2';
  segments: number;
  /** Les caractères qui ont fait basculer en UCS-2, sans doublon. */
  horsGsm7: string[];
}

/**
 * Ce que ce SMS coûtera réellement à envoyer.
 *
 * **C'est une mesure, pas une contrainte.** Le schéma borne le SMS en
 * CARACTÈRES, parce que c'est ce qui gouverne sa lisibilité ; le nombre de
 * segments, lui, dépend de l'alphabet, et rejeter un message parce qu'il
 * contient « ê » serait absurde en français.
 *
 * Mais sans cette fonction, le plafond de 306 caractères serait un chiffre
 * incantatoire. Il ne vaut que dans l'alphabet GSM : une seule apostrophe
 * typographique fait passer le message en UCS-2, où le même texte tient en
 * cinq segments au lieu de deux. L'opérateur qui copie le message doit
 * pouvoir le voir — d'où `horsGsm7`, qui nomme les coupables plutôt que de se
 * contenter d'annoncer le verdict.
 */
export function segmentsSms(texte: string): MesureSms {
  const caracteres = [...texte];
  const horsGsm7: string[] = [];
  let unites = 0;

  for (const c of caracteres) {
    if (GSM7_BASE.includes(c)) unites += 1;
    else if (GSM7_EXTENSION.includes(c)) unites += 2;
    else {
      unites += 1;
      if (!horsGsm7.includes(c)) horsGsm7.push(c);
    }
  }

  const gsm7 = horsGsm7.length === 0;
  // En UCS-2 le décompte se fait en unités de code UTF-16, et non en points de
  // code : un emoji hors du plan de base occupe deux unités. `texte.length` est
  // exactement cela — la seule fois où la longueur naïve d'une chaîne
  // JavaScript est la bonne mesure.
  const total = gsm7 ? unites : texte.length;
  const seul = gsm7 ? SMS_GSM7_SEUL : SMS_UCS2_SEUL;
  const concat = gsm7 ? SMS_GSM7_CONCAT : SMS_UCS2_CONCAT;

  const segments = total === 0 ? 0 : total <= seul ? 1 : Math.ceil(total / concat);

  return {
    caracteres: caracteres.length,
    unites: total,
    alphabet: gsm7 ? 'gsm7' : 'ucs2',
    segments,
    horsGsm7,
  };
}

/**
 * Ce que le modèle produit — trois messages, et rien d'autre.
 *
 * **Un seul appel pour les trois canaux, et c'est délibéré.** Les trois disent
 * la même chose à trois longueurs : les faire écrire séparément multiplierait
 * le coût par trois et laisserait le script d'appel affirmer ce que l'email
 * n'affirme pas. Un artisan qui reçoit l'email puis décroche doit entendre la
 * même histoire.
 *
 * **L'URL n'est pas un champ.** Contrairement au site, où le §3 du plan sépare
 * les faits de la rédaction, un message est de la prose de bout en bout :
 * l'URL doit se trouver DANS la phrase, et l'y injecter par un gabarit
 * produirait « ... votre page : https://... . » avec la ponctuation en
 * travers. Le modèle la recopie donc, et `verifierCoherencePitch` vérifie
 * ensuite, caractère pour caractère, qu'elle est exacte et qu'aucune autre
 * adresse n'a été inventée. La garantie est déplacée, pas abandonnée.
 *
 * `.strict()` sert deux fois, comme pour le site : il ferme la porte au modèle
 * qui livrerait spontanément un `whatsapp` ou un `linkedin`, et il produit
 * `additionalProperties: false`, que les sorties structurées exigent.
 */
export function pitchRedactionSchema() {
  return z
    .object({
      email: z
        .object({
          objet: z.string().min(PITCH_LIMITS.emailObjet.min).max(PITCH_LIMITS.emailObjet.max),
          corps: z.string().min(PITCH_LIMITS.emailCorps.min).max(PITCH_LIMITS.emailCorps.max),
        })
        .strict(),
      sms: z.string().min(PITCH_LIMITS.sms.min).max(PITCH_LIMITS.sms.max),
      /** Un script parlé, pas un texte à lire : c'est l'appelant qui l'improvise autour. */
      appel: z.string().min(PITCH_LIMITS.appel.min).max(PITCH_LIMITS.appel.max),
    })
    .strict();
}

export type PitchRedaction = z.infer<ReturnType<typeof pitchRedactionSchema>>;

/**
 * Le même contrat, en JSON Schema.
 *
 * Second encodage pour la raison exacte de `siteRedactionJsonSchema` : les
 * sorties structurées attendent un JSON Schema, le helper `zodOutputFormat` du
 * SDK n'accepte que des schémas `zod/v4`, et ce dépôt est écrit contre zod 3.
 *
 * Ce n'est pas une duplication : les deux encodages dérivent des mêmes
 * `PITCH_LIMITS`, aucune valeur n'est recopiée, et un test les compare champ
 * par champ. Le zod reste l'autorité — c'est lui qui valide la réponse REÇUE ;
 * le JSON Schema ne fait que dire à l'API ce qu'elle doit contraindre à
 * l'écriture.
 */
export function pitchRedactionJsonSchema(): Record<string, unknown> {
  const borne = (l: { min: number; max: number }) => ({
    type: 'string',
    minLength: l.min,
    maxLength: l.max,
  });

  return {
    type: 'object',
    properties: {
      email: {
        type: 'object',
        properties: {
          objet: borne(PITCH_LIMITS.emailObjet),
          corps: borne(PITCH_LIMITS.emailCorps),
        },
        required: ['objet', 'corps'],
        additionalProperties: false,
      },
      sms: borne(PITCH_LIMITS.sms),
      appel: borne(PITCH_LIMITS.appel),
    },
    required: ['email', 'sms', 'appel'],
    additionalProperties: false,
  };
}
