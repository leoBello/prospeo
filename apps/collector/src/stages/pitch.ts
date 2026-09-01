import {
  editeurRenseigne,
  EDITEUR,
  PITCH_CONTENT_VERSION,
  PITCH_LIMITS,
  pitchRedactionSchema,
  verifierCoherencePitch,
  type Editeur,
  type PitchFacts,
  type PitchRedaction,
} from '@prospeo/core';
import { MODEL, type Usage } from './generate.js';

/**
 * Version des consignes du message.
 *
 * Distincte de celle du site : les deux prompts évoluent séparément, et
 * `generated_message.prompt_version` doit dire lequel a produit le texte
 * qu'on relit. Toute modification du texte ci-dessous impose de l'incrémenter.
 */
export const PITCH_PROMPT_VERSION = 'v1';

/**
 * Les trois canaux, dans l'ordre où on les emploie.
 *
 * Le plan les fixe : email, SMS, script d'appel. Le spec du socle (§10)
 * écrivait « WhatsApp » là où le plan écrit « SMS » — le plan tranche, et il
 * emporte la migration qui manquait à `interaction_kind`. WhatsApp reste dans
 * l'énumération du journal : on peut consigner un échange par ce canal sans
 * qu'un texte soit rédigé pour lui.
 */
export const CANAUX = ['email', 'sms', 'appel'] as const;
export type Canal = (typeof CANAUX)[number];

/**
 * Les consignes — la partie STABLE du prompt.
 *
 * **Elles ne varient pour personne.** C'est la différence avec `generate`,
 * dont les consignes portent la liste des prestations et changent donc par
 * métier : ici, une seule entrée de cache couvre le lot entier, et tous les
 * appels après le premier se paient au dixième du tarif d'entrée.
 *
 * Un nom d'entreprise, une ville ou une URL glissés ici invalideraient le
 * cache à chaque appel — silencieusement, puisque la réponse resterait
 * correcte et que seule la facture bougerait. Un test le vérifie.
 *
 * **Le passage central n'est pas celui qui interdit d'inventer, c'est celui
 * qui impose de dire la vérité de la situation.** Une page portant le nom
 * d'une entreprise réelle a été publiée sans son accord (D5) ; le message qui
 * l'annonce doit le reconnaître et donner le moyen de la faire retirer. Un
 * message qui laisserait croire à une commande antérieure serait trompeur, et
 * c'est le premier reproche que l'artisan formulerait.
 */
export function consignesPitch(editeur: Editeur = EDITEUR): string {
  return `Tu rédiges trois messages de prospection commerciale, en français, pour le compte
de ${editeur.nom}.

LA SITUATION, QUE TU DOIS COMPRENDRE AVANT D'ÉCRIRE
${editeur.nom} a réalisé, DE SA PROPRE INITIATIVE et sans que personne le lui
demande, une page vitrine au nom d'un artisan qui n'en a pas. Cette page est
déjà en ligne. Les messages que tu écris servent à le prévenir et à lui
proposer de la reprendre à son compte.

L'artisan n'a rien demandé, ne doit rien, et découvre tout en te lisant.

CE QUE TU DOIS DIRE, DANS L'EMAIL COMME DANS LE SCRIPT D'APPEL
  - que la page a été faite SANS qu'il l'ait demandée, à l'initiative de
    ${editeur.nom} ;
  - qu'elle s'appuie sur ce qui est déjà public sur son entreprise ;
  - qu'il peut demander son RETRAIT, et que ce sera fait.

Ces trois points ne sont pas de la politesse : ils sont la seule chose qui
distingue ce message d'une usurpation. Ne les édulcore pas, ne les reporte pas
à la fin, et ne les remplace pas par « je me permets de vous contacter ».

Le SMS est trop court pour les trois : il doit au minimum dire que la page
existe, qu'elle n'a pas été demandée, et qui écrit.

SIGNATURE
Signe l'email « ${editeur.nom} » et donne l'adresse ${editeur.contact} comme
moyen de réponse. N'invente aucune autre coordonnée, aucun numéro, aucun site.

RÈGLE ABSOLUE — N'INVENTE RIEN SUR L'ARTISAN.
Tu ne disposes que des faits qui te seront donnés dans le message suivant.
Tout ce qui n'y figure pas, tu l'ignores, et tu ne dois ni le supposer, ni le
suggérer, ni le contourner par une formule vague.

Il lira ces messages lui-même. C'est la seule personne au monde qui repérera
un détail faux sur son entreprise, et il le repérera dans la première phrase.

CE QUE TU NE SAIS PAS, ET QUE TU NE DOIS DONC JAMAIS ÉCRIRE :
  - ses horaires, sa disponibilité, ses délais d'intervention ;
  - ses certifications, ses labels, ses assurances ;
  - sa clientèle : particuliers, professionnels, syndics. On ne sait pas pour
    qui il travaille ;
  - son effectif, son chiffre d'affaires, son nombre de clients ou de chantiers ;
  - le nombre d'avis qu'il a reçus ;
  - sa zone d'intervention au-delà de la ville qui te sera donnée ;
  - ce qu'il pense, ce qu'il cherche, ce dont il a besoin. « Vous cherchez sans
    doute à développer votre activité » est une invention comme une autre.

CE QUE TU NE DOIS RIEN PROMETTRE
  - AUCUN PRIX, aucun tarif, aucun montant, aucune gratuité, aucun « sans
    engagement ». Rien n'a été décidé sur ce point, et un artisan qui répond
    « d'accord » à un prix a reçu une offre ;
  - aucun délai, aucune échéance, aucune disponibilité ;
  - aucun RÉSULTAT : pas de « plus de clients », pas de « premier sur Google »,
    pas de « meilleure visibilité » chiffrée. C'est le mensonge habituel de ce
    métier, et c'est précisément ce que l'artisan a déjà entendu dix fois ;
  - aucune pression : pas d'urgence, pas d'offre limitée, pas de « je n'en
    propose qu'à trois artisans ». Si le message a besoin de ça, il est mauvais.

N'ÉCRIS AUCUN CHIFFRE qui ne figure pas dans les faits donnés. Une année, une
note, un numéro ou un montant que tu inventerais seront détectés et la
génération sera rejetée.

L'ADRESSE DE LA PAGE
Elle te sera donnée. RECOPIE-LA CARACTÈRE POUR CARACTÈRE, sans rien ajouter,
sans la raccourcir, sans la mettre entre chevrons ni entre parenthèses.

  - dans le CORPS de l'email : une fois, sur sa propre ligne ;
  - dans le SMS : une fois ;
  - dans l'OBJET de l'email : jamais — une URL dans un objet fait classer le
    message en indésirable avant qu'il soit lu ;
  - dans le SCRIPT D'APPEL : jamais. On ne dicte pas quarante caractères au
    téléphone. Propose plutôt d'envoyer le lien par SMS pendant l'appel.

N'écris aucune autre adresse web que celle-là, et aucun autre nom de domaine
que celui qui te sera éventuellement donné comme libre.

CE QUE TU PRODUIS — trois messages, et rien d'autre :

1. email.objet
   De ${PITCH_LIMITS.emailObjet.min} à ${PITCH_LIMITS.emailObjet.max} caractères. Il doit annoncer honnêtement de quoi il
   s'agit. Pas de question rhétorique, pas de « Re: », pas de majuscules
   d'insistance, pas d'emoji.

2. email.corps
   De ${PITCH_LIMITS.emailCorps.min} à ${PITCH_LIMITS.emailCorps.max} caractères, au vouvoiement, en paragraphes courts
   séparés par une ligne vide. Termine par la signature.

3. sms
   De ${PITCH_LIMITS.sms.min} à ${PITCH_LIMITS.sms.max} caractères, TOUT COMPRIS — l'adresse de la page en occupe à
   elle seule une quarantaine. C'est une contrainte d'écriture : compose court
   dès le départ plutôt que d'écrire long et de couper. Une seule phrase ou
   deux, pas de formule de politesse, pas de saut de ligne.

4. appel
   De ${PITCH_LIMITS.appel.min} à ${PITCH_LIMITS.appel.max} caractères. C'est ce que ${editeur.nom} DIT en décrochant,
   pas un texte qu'il lit. Phrases parlées, courtes, sans jargon. Il doit tenir
   les vingt premières secondes, jusqu'à la première réaction de l'artisan.

TON
Sobre, direct, sans flatterie. Écris comme quelqu'un qui a fait quelque chose
d'inhabituel et qui l'explique simplement. Évite le vocabulaire d'agence :
« solutions », « accompagnement », « sur-mesure », « à l'écoute de vos
besoins », « opportunité », « je me permets ».`;
}

/**
 * Les faits d'un prospect — la partie VOLATILE du prompt, après le point de
 * césure du cache.
 *
 * **Un fait absent ne produit aucune ligne.** Même règle que `factsMessage`
 * pour le site : écrire « domaine libre : non vérifié » serait une invitation.
 * Le modèle voit la rubrique, la juge attendue, et la comble. Ce que la base
 * ignore ne doit pas apparaître du tout — pas même en creux.
 *
 * Mesuré le 1er septembre 2026 : `domain_available` est nul sur 134 lignes sur
 * 134, l'étage `domains` n'ayant jamais tourné. L'absence de domaine est donc
 * le cas NORMAL aujourd'hui, pas le cas limite.
 */
export function factsMessagePitch(faits: PitchFacts): string {
  const e = faits.entreprise;
  const lignes = [
    `Nom commercial : ${e.nomAffiche}`,
    `Métier : ${e.metier.label}`,
    `Ville : ${e.adresse.ville}`,
  ];
  if (e.anneeCreation !== null) lignes.push(`Année de création : ${e.anneeCreation}`);
  if (e.noteGoogle !== null) {
    lignes.push(`Note Google : ${e.noteGoogle.toLocaleString('fr-FR')} sur 5`);
  }
  lignes.push(`Adresse de la page déjà en ligne : ${faits.urlSite}`);
  lignes.push(`Situation web constatée : ${SITUATION[faits.presenceWeb]}`);
  if (faits.domaineLibre !== null) {
    lignes.push(
      `Nom de domaine vérifié LIBRE auprès du registre : ${faits.domaineLibre} — ` +
        `tu peux le citer, c'est un fait vérifié.`,
    );
  }

  return `Voici les seuls faits connus sur cet artisan.\n\n${lignes.join('\n')}`;
}

/**
 * Pourquoi ce prospect est démarché, en clair.
 *
 * Ce n'est pas un détail de contexte : c'est ce qui change le message. À un
 * `none` on explique qu'il est introuvable ; à un `dead_site` que le site
 * qu'il a ne fonctionne plus. Confondre les deux fait dire au message une
 * chose que l'artisan sait fausse dès la première ligne — et il a un site,
 * donc il le sait très bien.
 */
const SITUATION: Record<PitchFacts['presenceWeb'], string> = {
  none: "aucun site web n'a été trouvé pour cette entreprise.",
  dead_site: "l'entreprise a un site, mais il ne fonctionne plus (il ne répond pas).",
  social_only: "l'entreprise n'a qu'une page sur un réseau social, pas de site.",
  directory_only:
    "l'entreprise n'apparaît que dans des annuaires professionnels, pas sur un site à elle.",
};

/** Un message prêt à être archivé dans `generated_message`. */
export interface MessagePitch {
  prospectId: string;
  canal: Canal;
  /** Seul l'email en a un ; `null` ailleurs, plutôt qu'une chaîne vide. */
  objet: string | null;
  contenu: string;
}

export interface PitchDeps {
  rediger(systeme: string, utilisateur: string): Promise<{ redaction: unknown; usage: Usage }>;
}

export interface PitchInput {
  prospectId: string;
  faits: PitchFacts;
}

export interface PitchReport {
  /** Prospects pour lesquels les trois messages ont été écrits. */
  generated: number;
  /** Réponses refusées : hors contrat, ou avançant ce que la base ne porte pas. */
  rejected: number;
  /** Pannes d'appel : réseau, 429, 5xx. */
  failed: number;
  /** Prospects écartés faute d'éditeur renseigné — avant tout appel payant. */
  refusedEditeur: number;
  usage: Usage;
}

export interface PitchResult {
  messages: MessagePitch[];
  report: PitchReport;
}

/**
 * Rédige les trois messages d'un lot de prospects.
 *
 * **Un seul appel par prospect, pas trois.** Les trois canaux disent la même
 * chose à trois longueurs : les faire écrire séparément multiplierait le coût
 * par trois et laisserait le script d'appel affirmer ce que l'email n'affirme
 * pas. Un artisan qui reçoit l'email puis décroche doit entendre la même
 * histoire.
 *
 * Deux filtres successifs, et aucun ne rattrape — ils rejettent, comme dans
 * `runGenerate` :
 *
 * 1. `pitchRedactionSchema` — la réponse a-t-elle la forme convenue, et les
 *    longueurs tenues ?
 * 2. `verifierCoherencePitch` — le texte avance-t-il ce que la base ne porte
 *    pas, et porte-t-il l'URL exacte ? C'est ici qu'un email parfaitement bien
 *    formé mais ayant perdu son lien est arrêté : aucun schéma ne peut voir ça.
 *
 * Le §4 du plan veut « un échec franc, pas un contenu approximatif qu'on
 * rattrape à la main ». Régénérer coûte un appel ; relire vingt-deux messages
 * en cherchant l'inexactitude coûte l'après-midi, et on en laisse passer une.
 */
export async function runPitch(
  inputs: readonly PitchInput[],
  deps: PitchDeps,
  editeur: Editeur = EDITEUR,
): Promise<PitchResult> {
  const messages: MessagePitch[] = [];
  const report: PitchReport = {
    generated: 0,
    rejected: 0,
    failed: 0,
    refusedEditeur: 0,
    usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
  };

  // Le refus est ANTÉRIEUR au premier appel. Un message non sollicité qui ne
  // dit pas qui l'envoie ni comment le faire cesser n'est pas maladroit : c'est
  // du démarchage anonyme. `publish` refuse déjà de créer un dépôt dans le même
  // cas, pour la même raison — sauf qu'ici, on éviterait en plus de payer pour
  // un texte qu'on n'aurait pas le droit d'envoyer.
  if (!editeurRenseigne(editeur)) {
    console.error(
      "pitch : aucun message écrit — l'éditeur n'est pas renseigné (voir EDITEUR dans " +
        'packages/core/src/site-publie.ts). Un message non sollicité doit dire qui ' +
        "l'envoie et comment le faire cesser.",
    );
    report.refusedEditeur = inputs.length;
    return { messages, report };
  }

  const systeme = consignesPitch(editeur);

  for (const { prospectId, faits } of inputs) {
    try {
      const { redaction, usage } = await deps.rediger(systeme, factsMessagePitch(faits));
      report.usage.input += usage.input;
      report.usage.cacheWrite += usage.cacheWrite;
      report.usage.cacheRead += usage.cacheRead;
      report.usage.output += usage.output;

      const parsed = pitchRedactionSchema().safeParse(redaction);
      if (!parsed.success) {
        console.error(
          `pitch : ${prospectId} rejeté — réponse hors contrat : ` +
            parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; '),
        );
        report.rejected += 1;
        continue;
      }

      const ecarts = verifierCoherencePitch(faits, parsed.data as PitchRedaction, editeur);
      if (ecarts.length > 0) {
        console.error(
          `pitch : ${prospectId} rejeté — ${ecarts
            .map((e) => `[${e.champ}] ${e.message}`)
            .join(' ; ')}`,
        );
        report.rejected += 1;
        continue;
      }

      const r = parsed.data as PitchRedaction;
      messages.push(
        { prospectId, canal: 'email', objet: r.email.objet, contenu: r.email.corps },
        { prospectId, canal: 'sms', objet: null, contenu: r.sms },
        { prospectId, canal: 'appel', objet: null, contenu: r.appel },
      );
      report.generated += 1;
    } catch (erreur) {
      console.error(
        `pitch : échec sur ${prospectId} — ${
          erreur instanceof Error ? erreur.message : String(erreur)
        }`,
      );
      report.failed += 1;
    }
  }

  return { messages, report };
}

/**
 * Ce qu'on archive avec chaque message, pour qu'il puisse se relire.
 *
 * Même doctrine que `prospect_score.ruleset_version` : un texte retrouvé dans
 * six mois doit dire par quel modèle et sous quelles consignes il a été écrit.
 * La version du format s'y ajoute, parce que c'est elle qui dira un jour
 * comment le relire.
 */
export const PITCH_TRACE = {
  model: MODEL,
  promptVersion: `${PITCH_CONTENT_VERSION}-${PITCH_PROMPT_VERSION}`,
} as const;
