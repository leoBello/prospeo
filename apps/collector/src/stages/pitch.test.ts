import { describe, expect, it, vi } from 'vitest';
import { assemblePitchFacts, PITCH_LIMITS, type PitchFactsInput } from '@prospeo/core';
import {
  consignesPitch,
  factsMessagePitch,
  runPitch,
  CANAUX,
  type PitchDeps,
} from './pitch.js';

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

/** Une réponse de modèle conforme, dont chaque test abîme une pièce. */
const reponse = {
  email: {
    objet: 'Une page de démonstration pour Dos-Services',
    corps:
      `Bonjour,\n\nJe m'appelle Léo Bello. J'ai réalisé de ma propre initiative une page ` +
      `de démonstration au nom de Dos-Services, à partir de ce qui est déjà public sur ` +
      `votre entreprise : ${URL_SITE}\n\nVous n'avez rien demandé et vous ne devez rien. ` +
      `Si cette page ne vous convient pas, répondez-moi et je la retire dans la journée. ` +
      `Le nom de domaine dos-services.fr est libre, je l'ai vérifié auprès du registre.` +
      `\n\nBien à vous,\nLéo Bello — leobello.wd@gmail.com`,
  },
  sms: `Bonjour, Léo Bello. J'ai réalisé une page de démonstration au nom de Dos-Services, de ma propre initiative : ${URL_SITE} — dites-moi si vous voulez que je la retire.`,
  appel:
    `Bonjour, je suis Léo Bello. Je vous appelle parce que j'ai réalisé une page de ` +
    `démonstration pour votre entreprise, de ma propre initiative, et je préfère vous ` +
    `en parler moi-même. Elle reprend ce qui est déjà public sur Dos-Services. Si vous ` +
    `voulez la voir, je vous envoie le lien par SMS tout de suite. Et si vous préférez ` +
    `que je la retire, dites-le-moi, ce sera fait dans la journée.`,
};

const usage = { input: 10, cacheWrite: 20, cacheRead: 30, output: 40 };

function deps(redaction: unknown = reponse): PitchDeps & { appels: string[][] } {
  const appels: string[][] = [];
  return {
    appels,
    async rediger(systeme, utilisateur) {
      appels.push([systeme, utilisateur]);
      return { redaction, usage };
    },
  };
}

describe('consignesPitch', () => {
  it('ne contient AUCUN fait de prospect', () => {
    // L'invariant de mise en cache, et il est plus fort ici que pour le site :
    // les consignes du site varient par métier — une entrée de cache par
    // métier —, celles du message ne varient pas du tout. Une seule écriture de
    // cache couvre donc le lot entier.
    //
    // Un nom d'entreprise glissé ici l'invaliderait à chaque appel,
    // SILENCIEUSEMENT : la réponse resterait correcte et seule la facture
    // bougerait.
    const c = consignesPitch();
    for (const fuite of ['Dos-Services', 'Nantes', '2009', '4,8', URL_SITE, 'dos-services.fr']) {
      expect(c, fuite).not.toContain(fuite);
    }
  });

  it('annonce au modèle les bornes de longueur, plutôt que de tronquer après', () => {
    // Le plan l'exige pour le SMS : « c'est une contrainte de rédaction à
    // passer au modèle, pas une troncature appliquée après coup ».
    const c = consignesPitch();
    expect(c).toContain(String(PITCH_LIMITS.sms.max));
    expect(c).toContain(String(PITCH_LIMITS.emailObjet.max));
  });

  it('impose de dire que la page n’a pas été commandée', () => {
    // La clause la moins négociable du prompt. Un site portant le nom d'une
    // entreprise réelle a été publié sans son accord (D5) : le message qui
    // l'annonce doit le dire, et donner le moyen de le faire retirer. Un
    // message qui laisserait croire à une commande antérieure serait
    // trompeur, et le §11 conformité ne s'en remettrait pas.
    const c = consignesPitch();
    expect(c).toContain('SANS');
    expect(c).toMatch(/RETRAIT/);
  });
});

describe('factsMessagePitch', () => {
  it('donne les faits, et l’URL exacte à recopier', () => {
    const m = factsMessagePitch(faits);
    expect(m).toContain(URL_SITE);
    expect(m).toContain('Dos-Services');
    expect(m).toContain('2009');
    expect(m).toContain('dos-services.fr');
  });

  it('n’écrit RIEN quand un fait est absent', () => {
    // Même règle que `factsMessage` pour le site : écrire « domaine libre :
    // non vérifié » serait une invitation. Le modèle voit la rubrique, la juge
    // attendue, et la comble. Ce que la base ignore ne doit pas apparaître du
    // tout — pas même en creux.
    const sans = assemblePitchFacts({ ...entree, domaineLibre: null })!;
    const m = factsMessagePitch(sans);
    expect(m).not.toMatch(/domaine/i);
  });

  it('dit POURQUOI ce prospect est démarché', () => {
    // `none` et `dead_site` appellent deux messages différents : à l'un on
    // explique qu'il est introuvable, à l'autre que le site qu'il a ne
    // fonctionne plus. Les confondre fait dire au message une chose que
    // l'artisan sait fausse dès la première ligne.
    expect(factsMessagePitch(faits)).toMatch(/aucun site/i);

    const mort = assemblePitchFacts({
      ...entree,
      presenceWeb: 'dead_site',
      domaineLibre: null,
    })!;
    expect(factsMessagePitch(mort)).toMatch(/ne fonctionne plus|hors service|inaccessible/i);
  });
});

describe('runPitch', () => {
  it('produit un message par canal, et rien d’autre', async () => {
    const d = deps();
    const r = await runPitch([{ prospectId: 'p1', faits }], d);

    expect(r.report.generated).toBe(1);
    expect(r.messages.map((m) => m.canal).sort()).toEqual([...CANAUX].sort());
    // Seul l'email porte un objet ; les deux autres canaux n'en ont pas, et
    // la colonne le dit par un `null` plutôt que par une chaîne vide.
    expect(r.messages.find((m) => m.canal === 'email')?.objet).toBe(reponse.email.objet);
    expect(r.messages.find((m) => m.canal === 'sms')?.objet).toBeNull();
    expect(r.messages.find((m) => m.canal === 'appel')?.objet).toBeNull();
  });

  it('n’appelle le modèle QU’UNE FOIS pour les trois canaux', async () => {
    // Trois appels coûteraient trois fois plus cher et laisseraient le script
    // d'appel affirmer ce que l'email n'affirme pas. Un artisan qui reçoit
    // l'email puis décroche doit entendre la même histoire.
    const d = deps();
    await runPitch([{ prospectId: 'p1', faits }], d);
    expect(d.appels).toHaveLength(1);
  });

  it('additionne les quatre compteurs de jetons séparément', async () => {
    const d = deps();
    const r = await runPitch(
      [
        { prospectId: 'p1', faits },
        { prospectId: 'p2', faits },
      ],
      d,
    );
    expect(r.report.usage).toEqual({ input: 20, cacheWrite: 40, cacheRead: 60, output: 80 });
  });

  it('rejette une réponse hors contrat', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await runPitch([{ prospectId: 'p1', faits }], deps({ email: { objet: 'trop court' } }));
    expect(r.report.rejected).toBe(1);
    expect(r.messages).toEqual([]);
    erreur.mockRestore();
  });

  it('rejette un message qui a perdu l’URL en route', async () => {
    // Le filtre qui justifie l'existence de `verifierCoherencePitch` dans la
    // boucle : la réponse est parfaitement bien FORMÉE — trois champs, bonnes
    // longueurs — et pourtant inutilisable, parce que son seul argument a
    // disparu. Aucun schéma ne peut voir ça.
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sansLien = {
      ...reponse,
      sms: reponse.sms.replace(URL_SITE, 'le lien que je vous envoie juste après ce message ici'),
    };
    const r = await runPitch([{ prospectId: 'p1', faits }], deps(sansLien));
    expect(r.report.rejected).toBe(1);
    expect(r.report.generated).toBe(0);
    erreur.mockRestore();
  });

  it('compte une panne d’appel à part d’un rejet', async () => {
    // Un 429 et un modèle qui invente ne se corrigent pas de la même façon :
    // l'un se rejoue tel quel, l'autre demande de revoir le prompt.
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d: PitchDeps = {
      async rediger() {
        throw new Error('429');
      },
    };
    const r = await runPitch([{ prospectId: 'p1', faits }], d);
    expect(r.report.failed).toBe(1);
    expect(r.report.rejected).toBe(0);
    erreur.mockRestore();
  });

  it('REFUSE d’écrire quoi que ce soit sans éditeur renseigné', async () => {
    // Un message non sollicité qui ne dit pas qui l'envoie ni comment le faire
    // cesser n'est pas un message maladroit : c'est du démarchage anonyme. Le
    // refus est ANTÉRIEUR à l'appel — on ne dépense pas pour un texte qu'on
    // n'aurait pas le droit d'envoyer.
    const d = deps();
    const r = await runPitch([{ prospectId: 'p1', faits }], d, {
      nom: 'À RENSEIGNER',
      contact: 'moi@example.com',
    });
    expect(r.messages).toEqual([]);
    expect(r.report.refusedEditeur).toBe(1);
    expect(d.appels).toHaveLength(0);
  });
});
