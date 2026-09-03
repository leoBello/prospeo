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
});
