import { describe, expect, it } from 'vitest';
import { classerLot, etatLigne, type FaitsLigne, type FaitsProspect } from './campagne.js';

function fait(surcharges: Partial<FaitsProspect> = {}): FaitsProspect {
  return {
    prospectId: 'p-1',
    denomination: 'Aquatech Nantes',
    ville: 'Nantes',
    tradeSlug: 'plombier',
    score: 80,
    presence: 'none',
    statut: 'a_contacter',
    aInteraction: false,
    aMessage: false,
    sitePublie: false,
    estFerme: false,
    aTelephone: true,
    metierConnu: true,
    ...surcharges,
  };
}

describe('classerLot', () => {
  it('classe par score decroissant et borne a la taille demandee', () => {
    const lot = classerLot(
      [
        fait({ prospectId: 'a', score: 60 }),
        fait({ prospectId: 'b', score: 95 }),
        fait({ prospectId: 'c', score: 75 }),
      ],
      2,
    );

    expect(lot.lignes.map((l) => l.prospectId)).toEqual(['b', 'c']);
  });

  it('exclut et COMPTE les prospects jamais scores', () => {
    // Un prospect sans score n est pas un prospect a zero : un tri
    // decroissant le rangerait en bas comme s il l etait. Il sort du lot, et
    // son exclusion s affiche.
    const lot = classerLot(
      [fait({ prospectId: 'a', score: 60 }), fait({ prospectId: 'sans', score: null })],
      10,
    );

    expect(lot.lignes.map((l) => l.prospectId)).toEqual(['a']);
    expect(lot.sansScore).toBe(1);
  });

  it('ne compte pas comme « sans score » un prospect deja disqualifie par ailleurs', () => {
    // Le compte annonce « des prospects qu on pourrait recuperer en les
    // scorant ». Y verser un prospect en « ne pas contacter » promettrait une
    // remediation qui n existe pas.
    const lot = classerLot(
      [fait({ prospectId: 'x', score: null, statut: 'ne_pas_contacter' })],
      10,
    );

    expect(lot.lignes).toHaveLength(0);
    expect(lot.sansScore).toBe(0);
  });

  it.each([
    ['un statut deja avance', { statut: 'contacte' as const }],
    ['une interaction consignee', { aInteraction: true }],
    ['un message deja redige', { aMessage: true }],
    ['un site deja publie', { sitePublie: true }],
  ])('exclut un prospect avec %s', (_libelle, surcharge) => {
    const lot = classerLot([fait(surcharge)], 10);
    expect(lot.lignes).toHaveLength(0);
  });

  it.each([
    ['aucun telephone', { aTelephone: false }],
    ['une presence web deja correcte', { presence: 'has_site' as const }],
    ['une presence web jamais sondee', { presence: null }],
    ['un etablissement cesse', { estFerme: true }],
    ['un metier que le catalogue ne connait pas', { metierConnu: false }],
  ])('exclut un prospect que la chaine ne saurait pas traiter : %s', (_libelle, surcharge) => {
    // Ces criteres-la ne viennent pas de D3 mais de `fetchSiteCandidates`
    // (apps/collector/src/chaine.ts). Sans eux, l ecran proposait
    // « Deployer » sur un prospect que la chaine refuse en silence, et le job
    // revenait en echec sous un motif faux — « la redaction n a rien ecrit »,
    // alors qu elle n avait jamais ete tentee.
    const lot = classerLot([fait(surcharge)], 10);
    expect(lot.lignes).toHaveLength(0);
  });

  it('ne compte pas comme « sans score » un prospect que la chaine refuserait de toute facon', () => {
    // Meme promesse que pour « ne pas contacter » : le compte annonce des
    // prospects qu un scoring ferait entrer. Un prospect sans telephone n en
    // fait pas partie — le scorer ne lui en donnerait pas un.
    const lot = classerLot([fait({ prospectId: 'x', score: null, aTelephone: false })], 10);

    expect(lot.lignes).toHaveLength(0);
    expect(lot.sansScore).toBe(0);
  });
});

function ligne(surcharges: Partial<FaitsLigne> = {}): FaitsLigne {
  return {
    job: null,
    derniereEtape: null,
    siteEnLigne: false,
    mailRedige: false,
    adresse: null,
    envoi: null,
    ...surcharges,
  };
}

describe('etatLigne', () => {
  it('rend trois segments vides sur un prospect jamais touche', () => {
    const r = etatLigne(ligne());

    expect(r).toMatchObject({ site: 'vide', mail: 'vide', envoi: 'vide' });
    expect(r.etat).toEqual({ nom: 'jamais' });
  });

  it('nomme le rang d un job en file, sans rien allumer', () => {
    // L attente est un etat, pas un vide : sans elle, un clic sur Deployer
    // ne produirait aucun changement visible et donnerait a croire qu il n a
    // rien fait.
    const r = etatLigne(ligne({ job: { state: 'en_attente', lastError: null, rang: 3 } }));

    expect(r.site).toBe('vide');
    expect(r.etat).toEqual({ nom: 'en_file', rang: 3 });
  });

  it('allume le premier segment pendant le build', () => {
    const r = etatLigne(
      ligne({
        job: { state: 'en_cours', lastError: null, rang: 1 },
        derniereEtape: { step: 'build', outcome: 'demarre', detail: null },
      }),
    );

    expect(r.site).toBe('en_cours');
    expect(r.etat).toEqual({ nom: 'site_en_cours', etape: 'build' });
  });

  it('porte la cause d un echec DANS l etat, pas derriere un journal', () => {
    const r = etatLigne(
      ligne({
        job: { state: 'echoue', lastError: 'depot : nom deja pris', rang: 1 },
        derniereEtape: { step: 'depot', outcome: 'echoue', detail: 'nom deja pris' },
      }),
    );

    expect(r.site).toBe('echec');
    expect(r.etat).toEqual({ nom: 'site_echec', detail: 'nom deja pris' });
  });

  it('distingue BLOQUE de ECHOUE quand l adresse manque', () => {
    // Une adresse manquante n a rien rate : elle attend un humain. Les
    // confondre ferait chercher une remediation technique la ou il manque une
    // information.
    const r = etatLigne(ligne({ siteEnLigne: true, mailRedige: true, adresse: null }));

    expect(r).toMatchObject({ site: 'ok', mail: 'ok', envoi: 'bloque' });
    expect(r.etat).toEqual({ nom: 'adresse_manquante' });
  });

  it('annonce un mail a relire quand tout est pret', () => {
    const r = etatLigne(
      ligne({ siteEnLigne: true, mailRedige: true, adresse: 'contact@exemple.fr' }),
    );

    expect(r).toMatchObject({ site: 'ok', mail: 'ok', envoi: 'vide' });
    expect(r.etat).toEqual({ nom: 'mail_a_relire' });
  });

  it('rend « envoi incertain » sur une ligne restee en cours', () => {
    // Le troisieme etat honnete : la ligne message_send a ete ecrite, l appel
    // au fournisseur n a jamais rendu son verdict. Le presenter comme envoye
    // ou comme jamais envoye serait un mensonge dans les deux sens.
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        envoi: { state: 'en_cours', sentAt: null },
      }),
    );

    expect(r.envoi).toBe('en_cours');
    expect(r.etat).toEqual({ nom: 'envoi_incertain' });
  });

  it('allume les trois segments une fois le mail parti', () => {
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        envoi: { state: 'envoye', sentAt: '2026-09-03T14:02:00Z' },
      }),
    );

    expect(r).toMatchObject({ site: 'ok', mail: 'ok', envoi: 'ok' });
    expect(r.etat).toEqual({ nom: 'envoye', le: '2026-09-03T14:02:00Z' });
  });

  it('rend le segment envoi a « echec » avec un badge dedie, jamais « mail a relire »', () => {
    // Un envoi qui a echoue n est pas un mail jamais tente : les confondre
    // ferait disparaitre l echec derriere « mail a relire », alors que
    // SegmentEtat porte deja 'echec' pour exactement ce cas.
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        envoi: { state: 'echoue', sentAt: null },
      }),
    );

    expect(r).toMatchObject({ site: 'ok', mail: 'ok', envoi: 'echec' });
    expect(r.etat).toEqual({ nom: 'envoi_echec' });
  });

  it('garde le segment mail a « ok » quand un job echoue apres que le mail ait ete redige', () => {
    // Le mail existe deja : un rejeu de job qui echoue plus tard ne doit pas
    // effacer ce fait. Le site n est pas en ligne ici (siteEnLigne reste a
    // false) : c est bien le job qui porte l echec du segment site.
    const r = etatLigne(
      ligne({
        mailRedige: true,
        job: { state: 'echoue', lastError: 'pitch : timeout', rang: 1 },
        derniereEtape: { step: 'retrait', outcome: 'echoue', detail: 'timeout fournisseur' },
      }),
    );

    expect(r.mail).toBe('ok');
    expect(r.site).toBe('echec');
    expect(r.etat).toEqual({ nom: 'site_echec', detail: 'timeout fournisseur' });
  });

  it('garde le badge d echec de job au-dessus de « mail a relire », meme site en ligne', () => {
    // Choix assume : un job en echec reste l information la plus actionnable
    // et la plus recente, meme quand le site est deja en ligne et le mail
    // deja pret. Le segment `site` le dit honnetement a 'ok' — le badge, lui,
    // nomme la derniere tentative, pas l etat du site : les deux cohabitent
    // sans se contredire, l un ne pretend rien que l autre dementirait.
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        job: { state: 'echoue', lastError: 'depot : nom deja pris', rang: 1 },
        derniereEtape: { step: 'depot', outcome: 'echoue', detail: 'nom deja pris' },
      }),
    );

    expect(r.site).toBe('ok');
    expect(r.mail).toBe('ok');
    expect(r.etat).toEqual({ nom: 'site_echec', detail: 'nom deja pris' });
  });

  it('annonce le rang en file meme quand le site est deja en ligne et le mail redige', () => {
    // LE DEFAUT QUE CE TEST FERME. Une ligne « site en ligne + mail redige »
    // dont le job avait echoue affichait « Rejouer ». Au clic, le job repassait
    // `en_attente` : la branche « job echoue » ne s appliquait plus, et l etat
    // retombait sur « mail a relire » — SANS bouton. Le clic ne produisait donc
    // aucun retour visible, le rang n etait jamais annonce, et la demande ne
    // pouvait plus etre retiree.
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        job: { state: 'en_attente', lastError: null, rang: 2 },
      }),
    );

    expect(r.etat).toEqual({ nom: 'en_file', rang: 2 });
  });

  it('annonce le rang en file plutot qu une adresse manquante, sans jamais dire « echoue »', () => {
    // Un job actif dit ce qui se passe MAINTENANT. L adresse manquante, elle,
    // reste vraie et reapparaitra une fois le job clos : c est un fait acquis,
    // pas un evenement. Le segment `envoi` continue de la porter a 'bloque' —
    // « bloque » ne devient jamais « echoue ».
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: null,
        job: { state: 'en_attente', lastError: null, rang: 1 },
      }),
    );

    expect(r.envoi).toBe('bloque');
    expect(r.etat).toEqual({ nom: 'en_file', rang: 1 });
  });

  it('annonce « site en cours » meme quand le site precedent est deja en ligne', () => {
    // Un rejeu sur un prospect deja publie : ce qui tourne prime sur ce qui
    // est acquis, sinon la ligne resterait figee sur « mail a relire » pendant
    // toute la duree du traitement.
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        job: { state: 'en_cours', lastError: null, rang: 0 },
        derniereEtape: { step: 'build', outcome: 'demarre', detail: null },
      }),
    );

    expect(r.etat).toEqual({ nom: 'site_en_cours', etape: 'build' });
  });

  it('garde « envoye » au-dessus d un job actif', () => {
    // Un envoi parti est le fait le plus lourd de la ligne : rien ne le
    // recouvre, pas meme un job relance apres coup.
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        envoi: { state: 'envoye', sentAt: '2026-09-03T14:02:00Z' },
        job: { state: 'en_attente', lastError: null, rang: 4 },
      }),
    );

    expect(r.etat).toEqual({ nom: 'envoye', le: '2026-09-03T14:02:00Z' });
  });

  it.each([
    ['annule', 'annule' as const],
    ['termine', 'termine' as const],
  ])('retombe sur « jamais » pour un job %s qui n a fait avancer aucun fait', (_libelle, state) => {
    // Choix assume et verrouille : 'annule' et 'termine' sont des etats
    // terminaux du job, mais aucun n est porteur de sens a lui seul — ce sont
    // siteEnLigne / mailRedige / adresse / envoi qui disent ce qui a
    // vraiment avance. Sans qu aucun d eux ait bouge, nommer autre chose que
    // « jamais » inventerait un fait qu aucun code ne peut rendre vrai.
    const r = etatLigne(ligne({ job: { state, lastError: null, rang: 1 } }));

    expect(r.etat).toEqual({ nom: 'jamais' });
  });
});

describe('classerLot — ce qu on suit ne disparait pas', () => {
  it('garde un prospect suivi meme quand D3 l exclut desormais', () => {
    // LE DEFAUT QUE CE TEST FERME. Deployer un prospect lui fait ecrire un
    // `generated_message` et publier un site : deux criteres de D3 qui
    // l excluent aussitot. La ligne sur laquelle on venait de cliquer
    // disparaissait donc de l ecran — ce qui annule la moitie « suivre » de
    // « lancer et suivre une campagne ».
    const lot = classerLot(
      [
        fait({ prospectId: 'lance', score: 70, aMessage: true, sitePublie: true }),
        fait({ prospectId: 'neuf', score: 60 }),
      ],
      10,
      new Set(['lance']),
    );

    expect(lot.lignes.map((l) => l.prospectId)).toEqual(['lance', 'neuf']);
  });

  it('ne garde PAS un prospect suivi qu on a explicitement retire', () => {
    // Un job annule ne fait pas partie des suivis : retirer une demande doit
    // rendre la ligne a son etat d avant, pas la figer a l ecran.
    const lot = classerLot(
      [fait({ prospectId: 'retire', score: 70, aMessage: true, sitePublie: true })],
      10,
      new Set(),
    );

    expect(lot.lignes).toHaveLength(0);
  });

  it('ne compte pas un suivi dans les vingt places du lot', () => {
    // Les « vingt mieux notes que personne n a touches » restent vingt : un
    // prospect qu on suit deja n en occupe pas une place, sinon lancer une
    // campagne retrecirait le vivier a chaque clic.
    const lot = classerLot(
      [
        fait({ prospectId: 'suivi', score: 99, aMessage: true }),
        fait({ prospectId: 'a', score: 80 }),
        fait({ prospectId: 'b', score: 70 }),
      ],
      2,
      new Set(['suivi']),
    );

    expect(lot.lignes.map((l) => l.prospectId)).toEqual(['suivi', 'a', 'b']);
  });

  it('n ajoute pas deux fois un prospect a la fois suivi et eligible', () => {
    // Un job depose sur un prospect encore intact : il est dans les deux
    // ensembles. Une ligne en double casserait la cle de rendu de React.
    const lot = classerLot([fait({ prospectId: 'x', score: 70 })], 10, new Set(['x']));
    expect(lot.lignes.map((l) => l.prospectId)).toEqual(['x']);
  });

  it('garde un suivi sans score, en fin de liste, sans le compter comme ecarte', () => {
    // Un prospect lance par « Deployer la selection » peut n avoir aucun
    // score. Le cacher perdrait le suivi d un site en cours de publication ;
    // le compter parmi les ecartes promettrait qu un scoring le ferait
    // entrer, alors qu il est deja parti.
    const lot = classerLot(
      [fait({ prospectId: 'sans', score: null, aMessage: true }), fait({ prospectId: 'a', score: 50 })],
      10,
      new Set(['sans']),
    );

    expect(lot.lignes.map((l) => l.prospectId)).toEqual(['a', 'sans']);
    expect(lot.sansScore).toBe(0);
  });
});
