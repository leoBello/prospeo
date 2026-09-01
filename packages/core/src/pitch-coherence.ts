import { ecartsChiffres } from './site-coherence.js';
import { EDITEUR, type Editeur } from './site-publie.js';
import type { PitchFacts } from './pitch-facts.js';
import type { PitchRedaction } from './pitch-content.js';

/** Le champ fautif, pour que le message de rejet dise où regarder. */
export type ChampPitch = 'email.objet' | 'email.corps' | 'sms' | 'appel';

export interface IncoherencePitch {
  champ: ChampPitch;
  message: string;
}

/**
 * Les extensions qu'on reconnaît comme des noms de domaine.
 *
 * Liste close plutôt qu'expression générique : `\w+\.\w{2,}` prendrait
 * « M.Dupont » et « etc.Une » pour des domaines et rejetterait des messages
 * parfaitement corrects. On préfère laisser passer un `.xyz` exotique — que le
 * modèle n'a aucune raison d'écrire — plutôt que de rejeter du français.
 */
const TLD_RECONNUS = 'fr|com|net|org|eu|io|site|pro|bzh|paris|shop';

/**
 * Vérifie qu'un message n'affirme rien que la base ne porte pas — et qu'il
 * affirme ce qu'il doit.
 *
 * **Pourquoi ce contrôle est plus dur que celui du site.** Le §3 du plan
 * protège le site en séparant les faits de la rédaction : le modèle n'a jamais
 * la main sur le téléphone ou la note, donc il ne peut pas les altérer. Un
 * message ne se prête pas à cette séparation — c'est de la prose de bout en
 * bout, et l'URL doit se trouver DANS la phrase. Tout ce que le site obtenait
 * par construction, le message doit l'obtenir par vérification.
 *
 * Et l'enjeu est plus vif : le lecteur du site est un client de passage, celui
 * du message est l'artisan lui-même. C'est la seule personne au monde qui
 * repérera immédiatement un détail faux sur son entreprise, et le §10 du spec
 * du socle dit ce qu'il en advient — « un message contenant un détail inventé
 * se retourne contre l'appelant dans les premières secondes de l'échange ».
 *
 * Cinq familles de contrôles, dans l'ordre où elles apparaissent ci-dessous :
 * les chiffres (réemployés du site), l'URL du site, les autres adresses web,
 * les adresses électroniques, et l'argent.
 */
export function verifierCoherencePitch(
  faits: PitchFacts,
  redaction: PitchRedaction,
  editeur: Editeur = EDITEUR,
): IncoherencePitch[] {
  const ecarts: IncoherencePitch[] = [];
  const ajoute = (champ: ChampPitch, message: string): void => {
    ecarts.push({ champ, message });
  };

  const champs: { champ: ChampPitch; texte: string }[] = [
    { champ: 'email.objet', texte: redaction.email.objet },
    { champ: 'email.corps', texte: redaction.email.corps },
    { champ: 'sms', texte: redaction.sms },
    { champ: 'appel', texte: redaction.appel },
  ];

  // --- L'URL doit être là, et exacte ---------------------------------------
  //
  // Deux canaux la portent : l'email et le SMS. Le script d'appel en est
  // dispensé — personne ne dicte quarante-six caractères au téléphone, et le
  // prompt lui fait plutôt proposer d'envoyer le lien par SMS.
  //
  // La vérification est une égalité de chaîne, pas une ressemblance. Une URL
  // presque juste est le défaut le plus coûteux et le moins visible de tout ce
  // chantier : l'artisan clique, tombe sur une erreur, et n'écrira jamais pour
  // signaler la faute de frappe.
  for (const champ of ['email.corps', 'sms'] as const) {
    const texte = champ === 'sms' ? redaction.sms : redaction.email.corps;
    if (!texte.includes(faits.urlSite)) {
      ajoute(champ, `l'URL du site (${faits.urlSite}) n'y figure pas, ou pas telle quelle.`);
    }
  }

  // Un objet d'email contenant une URL est le marqueur de spam le plus
  // universel : il fait classer le message avant qu'il soit lu.
  if (redaction.email.objet.includes(faits.urlSite) || /https?:\/\//i.test(redaction.email.objet)) {
    ajoute('email.objet', "un objet d'email ne doit pas contenir d'adresse web.");
  }

  for (const { champ, texte } of champs) {
    // Ce qui est LÉGITIME est retiré avant de chercher ce qui ne l'est pas :
    // l'URL du site, le domaine libre quand la base en connaît un, et
    // l'adresse de l'éditeur. Ce qui reste ne peut donc être qu'inventé.
    //
    // L'ordre n'est pas indifférent. L'URL déployée contient le SIRET —
    // quatorze chiffres d'affilée — et le contrôle des numéros de téléphone
    // cherche « au moins neuf chiffres » : sans neutralisation préalable, tout
    // message correct serait rejeté pour cause de téléphone inventé.
    const propre = neutralise(texte, faits, editeur);

    // Les adresses électroniques se cherchent AVANT que le domaine libre soit
    // retiré : `contact@dos-services.fr` contient le nom vérifié, et le retirer
    // laisserait un `contact@` que plus aucune expression ne reconnaît. Une
    // adresse est un jeton entier — on la juge entière.
    const sansEditeur = texte.split(editeur.contact).join(' ');

    for (const message of ecartsChiffres(propre, faits.entreprise)) ajoute(champ, message);

    // --- Les autres adresses web -----------------------------------------
    //
    // Un modèle qui rédige un message commercial propose spontanément
    // « rendez-vous sur www.entreprise.fr » : une adresse plausible, qui
    // n'existe pas, et vers laquelle l'artisan enverra ses propres clients.
    //
    // Quand la base ne connaît AUCUN domaine libre — l'état des 134 lignes
    // mesurées le 1er septembre 2026 —, aucun nom de domaine n'est tolérable :
    // « un nom à votre nom doit être disponible » est une affirmation sur le
    // registre que personne n'a vérifiée.
    const domaines = new RegExp(`\\b[a-z0-9][a-z0-9-]*\\.(?:${TLD_RECONNUS})\\b`, 'gi');
    for (const trouve of propre.matchAll(domaines)) {
      ajoute(
        champ,
        `« ${trouve[0]} » est une adresse web que la base ne connaît pas` +
          (faits.domaineLibre === null
            ? ' — aucun nom de domaine n’a été vérifié pour ce prospect.'
            : ` (le seul nom vérifié libre est ${faits.domaineLibre}).`),
      );
    }
    if (/https?:\/\/|\bwww\./i.test(propre)) {
      ajoute(champ, "une adresse web autre que celle du site généré y figure.");
    }

    // --- Les adresses électroniques ---------------------------------------
    //
    // Celle de l'éditeur a été retirée plus haut : c'est le mécanisme
    // d'opposition qu'impose le §11 conformité, et le message le plus honnête
    // est celui qui la porte. Toute autre est fabriquée — le modèle devine
    // volontiers `contact@nom-de-l-entreprise.fr`, qui a toutes les chances de
    // n'exister pas et de faire passer le message pour une usurpation.
    for (const trouve of sansEditeur.matchAll(/[^\s@,;()<>]+@[^\s@,;()<>]+\.[a-z]{2,}/gi)) {
      ajoute(champ, `« ${trouve[0]} » n'est pas l'adresse de l'éditeur (${editeur.contact}).`);
    }

    // --- L'argent ---------------------------------------------------------
    //
    // La base ne contient aucun tarif et ce chantier n'en a jamais fixé : un
    // montant est donc une invention pure. Et à la différence d'une année
    // fausse, celle-là ENGAGE — un artisan qui répond « d'accord pour 490 € »
    // a reçu une offre, et c'est nous qui la lui avons faite.
    //
    // Volontairement large : toute mention d'euros, chiffrée ou non. Aucune
    // formulation légitime de ces messages n'a de raison d'en parler, et le
    // faux positif coûte une régénération quand le faux négatif coûte un
    // engagement.
    if (/€|\beuros?\b/i.test(texte)) {
      ajoute(champ, "un montant y est avancé alors qu'aucun tarif n'existe en base.");
    }
  }

  return ecarts;
}

/**
 * Retire du texte tout ce qui a le droit d'y être, pour que ce qui reste
 * puisse être jugé inventé sans autre examen.
 *
 * Trois retraits, et un seul mécanisme : le remplacement par une espace plutôt
 * que par rien, sans quoi « ...page : URL — dites-moi » recollerait ses deux
 * bords en un mot qui n'existe dans aucune langue.
 */
function neutralise(texte: string, faits: PitchFacts, editeur: Editeur): string {
  let propre = texte.split(faits.urlSite).join(' ');
  propre = propre.split(editeur.contact).join(' ');
  if (faits.domaineLibre !== null) propre = propre.split(faits.domaineLibre).join(' ');
  return propre;
}
