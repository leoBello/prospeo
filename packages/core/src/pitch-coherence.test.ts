import { describe, expect, it } from 'vitest';
import { assemblePitchFacts, type PitchFactsInput } from './pitch-facts.js';
import { verifierCoherencePitch } from './pitch-coherence.js';
import type { PitchRedaction } from './pitch-content.js';

const URL_SITE = 'https://dos-services-51000900400035.vercel.app';

const entree: PitchFactsInput = {
  prospect: {
    siret: '51000900400035',
    denomination: 'DOSSO SOULEYMANE',
    denominationUsuelle: 'DOS-SERVICES',
    tradeSlug: 'plombier',
    address: '37 RUE JACQUES CARTIER 44300 NANTES',
    postalCode: '44300',
    city: 'NANTES',
    dateCreation: '2009-04-01',
    latitude: 47.2603579,
    longitude: -1.5721302,
    enrichment: {
      status: 'ok',
      matchedName: 'Dos-Services',
      phoneE164: '+33602002360',
      rating: 4.8,
      mapsUrl: 'https://maps.google.com/?cid=1',
    },
  },
  site: { deploymentUrl: URL_SITE, unpublishedAt: null },
  presenceWeb: 'none',
  domaineLibre: 'dos-services.fr',
  pipelineStatus: 'a_contacter',
};

const faits = assemblePitchFacts(entree)!;

/** Un jeu de messages exact, dont chaque test abîme une pièce. */
const bon: PitchRedaction = {
  email: {
    objet: 'Une page de démonstration pour Dos-Services',
    corps:
      `Bonjour,\n\nJe m'appelle Léo Bello. J'ai remarqué que Dos-Services n'apparaît pas ` +
      `sur le web, et j'ai réalisé une page de démonstration à votre nom, de ma propre ` +
      `initiative : ${URL_SITE}\n\nElle reprend ce qui est déjà public sur votre ` +
      `entreprise. Vous n'avez rien demandé et vous ne devez rien : si elle ne vous ` +
      `convient pas, répondez-moi et je la retire dans la journée. Le nom de domaine ` +
      `dos-services.fr est libre, je l'ai vérifié.\n\nBien à vous,\nLéo Bello — ` +
      `leobello.wd@gmail.com`,
  },
  sms: `Bonjour, Léo Bello. J'ai fait une page de démonstration pour Dos-Services, sans que vous l'ayez demandée : ${URL_SITE} — dites-moi si vous voulez que je la retire.`,
  appel:
    `Bonjour, je suis Léo Bello. Je vous appelle parce que j'ai réalisé une page de ` +
    `démonstration pour votre entreprise, de ma propre initiative, et je voulais vous ` +
    `en parler avant que vous la découvriez autrement. Elle reprend ce qui est déjà ` +
    `public sur Dos-Services. Si vous voulez la voir, je vous envoie le lien par SMS ` +
    `tout de suite. Et si vous préférez que je la retire, dites-le-moi, c'est fait ` +
    `dans la journée.`,
};

describe('verifierCoherencePitch', () => {
  it('ne trouve rien à redire à un message exact', () => {
    expect(verifierCoherencePitch(faits, bon)).toEqual([]);
  });

  it('n’accuse pas le SIRET contenu dans l’URL d’être un faux numéro', () => {
    // Le piège que ce test existe pour tenir fermé. L'URL déployée contient le
    // SIRET — quatorze chiffres d'affilée — et le contrôle des numéros de
    // téléphone cherche « au moins neuf chiffres ». Sans neutraliser l'URL
    // AVANT de compter, tout message correct serait rejeté pour cause de
    // téléphone inventé, et le rejet serait d'autant plus déroutant que le
    // message serait juste.
    expect(verifierCoherencePitch(faits, bon)).toEqual([]);
  });

  it('REFUSE un message qui ne donne pas l’URL du site', () => {
    // Le message n'a qu'un argument : la page existe et elle est visible. Un
    // email qui l'oublie est un démarchage ordinaire, et un SMS qui l'oublie
    // ne veut rien dire du tout.
    const sansLien = {
      ...bon,
      email: { ...bon.email, corps: bon.email.corps.replace(URL_SITE, 'mon site') },
    };
    const ecarts = verifierCoherencePitch(faits, sansLien);
    expect(ecarts.map((e) => e.champ)).toContain('email.corps');
  });

  it('REFUSE une URL recopiée de travers', () => {
    // Le cas qui coûte le plus cher et se voit le moins : une URL presque
    // juste part dans un email, l'artisan clique, tombe sur une page d'erreur,
    // et n'écrira jamais pour signaler la faute de frappe. La vérification est
    // donc une égalité de chaîne, pas une ressemblance.
    const faute = {
      ...bon,
      sms: bon.sms.replace(URL_SITE, 'https://dos-service-51000900400035.vercel.app'),
    };
    const ecarts = verifierCoherencePitch(faits, faute);
    expect(ecarts.map((e) => e.champ)).toContain('sms');
  });

  it('REFUSE une seconde adresse web inventée', () => {
    // Un modèle qui rédige un message commercial propose spontanément
    // « rendez-vous sur www.dos-services.fr » — une adresse plausible, qui
    // n'existe pas, et vers laquelle l'artisan enverra ses propres clients.
    const inventee = {
      ...bon,
      email: {
        ...bon.email,
        corps: `${bon.email.corps}\n\nVous pouvez aussi voir mes réalisations sur www.mon-agence.fr`,
      },
    };
    const ecarts = verifierCoherencePitch(faits, inventee);
    expect(ecarts.map((e) => e.champ)).toContain('email.corps');
  });

  it('accepte le domaine libre quand la base le connaît, et lui seul', () => {
    // « J'ai vérifié, dos-services.fr est libre » est l'argument le plus
    // concret du chantier, et il ne vaut que si le nom est celui qui a
    // RÉELLEMENT été vérifié auprès du registre.
    expect(verifierCoherencePitch(faits, bon)).toEqual([]);

    const autre = {
      ...bon,
      email: { ...bon.email, corps: bon.email.corps.replace('dos-services.fr', 'dosservices.fr') },
    };
    expect(verifierCoherencePitch(faits, autre).length).toBeGreaterThan(0);
  });

  it('REFUSE tout nom de domaine quand aucun n’a été vérifié', () => {
    // Mesuré le 1er septembre 2026 : `domain_available` est nul sur 134 lignes
    // sur 134. C'est donc l'état de TOUS les prospects aujourd'hui, et le seul
    // où le modèle serait tenté de combler — « un nom à votre nom doit être
    // disponible » est une affirmation sur le registre qu'on n'a pas faite.
    const sansDomaine = assemblePitchFacts({ ...entree, domaineLibre: null })!;
    const ecarts = verifierCoherencePitch(sansDomaine, bon);
    expect(ecarts.map((e) => e.champ)).toContain('email.corps');
  });

  it('REFUSE un prix, quel qu’il soit', () => {
    // La base ne contient aucun tarif, et ce chantier n'en a jamais fixé : un
    // montant dans un message de vente est donc une invention pure. Et à la
    // différence d'une année fausse, celle-là ENGAGE — un artisan qui répond
    // « d'accord pour 490 € » a reçu une offre.
    for (const prix of ['490 €', '490€', '490 euros', 'à partir de 39 euros par mois']) {
      const avecPrix = { ...bon, appel: `${bon.appel} C'est ${prix}.` };
      expect(verifierCoherencePitch(faits, avecPrix).map((e) => e.champ), prix).toContain('appel');
    }
  });

  it('laisse passer l’adresse de l’éditeur, qui est le moyen de dire non', () => {
    // `EDITEUR.contact` n'est pas décoratif : c'est le mécanisme d'opposition
    // que le §11 conformité impose. La traiter comme une adresse étrangère
    // ferait rejeter précisément le message le plus honnête.
    expect(verifierCoherencePitch(faits, bon)).toEqual([]);
  });

  it('REFUSE une adresse électronique qui n’est pas celle de l’éditeur', () => {
    const usurpee = {
      ...bon,
      email: {
        ...bon.email,
        corps: bon.email.corps.replace('leobello.wd@gmail.com', 'contact@dos-services.fr'),
      },
    };
    expect(verifierCoherencePitch(faits, usurpee).length).toBeGreaterThan(0);
  });

  it('REFUSE une année que la base ne porte pas, dans n’importe quel canal', () => {
    // Le contrôle des chiffres est celui de `site-coherence`, réemployé et non
    // recopié. Ce test vérifie qu'il est bien branché sur les quatre champs,
    // pas qu'il fonctionne — c'est déjà éprouvé là-bas.
    const faux = { ...bon, appel: `${bon.appel} Vous êtes installé depuis 2003.` };
    expect(verifierCoherencePitch(faits, faux).map((e) => e.champ)).toContain('appel');
  });

  it('interdit l’URL dans l’objet de l’email', () => {
    // Un objet contenant une URL est le marqueur de spam le plus universel :
    // il fait classer le message avant qu'il soit lu, et l'artisan ne verra
    // jamais qu'on lui écrivait honnêtement.
    const objetAvecLien = { ...bon, email: { ...bon.email, objet: `Votre page : ${URL_SITE}` } };
    expect(verifierCoherencePitch(faits, objetAvecLien).map((e) => e.champ)).toContain(
      'email.objet',
    );
  });
});
