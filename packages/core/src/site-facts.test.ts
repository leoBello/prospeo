import { describe, expect, it } from 'vitest';
import { assembleFacts, NOTE_MINIMALE_AFFICHABLE, SITE_FACT_KEYS } from './site-facts.js';
import type { SiteFactsInput } from './site-facts.js';

/**
 * Le prospect le mieux noté de la base au 1er septembre 2026, et le premier
 * de la chaîne (D7). Ses valeurs sont recopiées telles quelles depuis
 * Supabase : un test qui documente une décision doit le faire sur la donnée
 * réelle, sinon il documente une donnée inventée.
 */
const DOS_SERVICES: SiteFactsInput = {
  siret: '51000900400035',
  denomination: 'SOULEYMANE DOSSO (DOS SERVICES)',
  denominationUsuelle: 'DOS SERVICES',
  tradeSlug: 'plombier',
  address: '37 RUE JACQUES CARTIER 44300 NANTES',
  postalCode: '44300',
  city: 'NANTES',
  dateCreation: '2009-02-16',
  enrichment: {
    status: 'ok',
    matchedName: 'Dos-Services',
    phoneE164: '+33602002360',
    rating: 4.6,
    mapsUrl: 'https://www.google.com/maps/place/Dos-Services/@47.26,-1.57,17z',
  },
};

describe('assembleFacts', () => {
  it('ne rend que les champs de la liste close, et rien de plus', () => {
    const facts = assembleFacts(DOS_SERVICES);
    expect(facts).not.toBeNull();
    // Ce test est le garde-fou de la règle « pas d'invention » prise à sa
    // racine : ce que cette fonction ne rend pas ne peut pas atteindre le
    // prompt, donc ne peut pas atteindre le site. Ajouter un champ ici
    // oblige à venir écrire pourquoi la base sait le renseigner.
    expect(Object.keys(facts!).sort()).toEqual([...SITE_FACT_KEYS].sort());
  });

  it("n'expose aucun nombre d'avis, parce que la base n'en contient aucun", () => {
    // Mesuré le 1er septembre 2026 : `review_count` vaut null sur les 139
    // lignes, sans exception. Google ne publie plus ce nombre (§4.5 du spec
    // n°2, et le commentaire de `SCORING_RULESET.reviewsVolume` qui neutralise
    // la règle correspondante du barème).
    //
    // L'absence de ce champ n'est donc pas un oubli mais une condition : un
    // site qui afficherait « 4,6/5 sur 12 avis » inventerait le 12, et ce
    // chiffre-là est vérifiable en un clic par l'artisan comme par son client.
    // Le rendre inatteignable coûte moins cher que de faire confiance au
    // prompt.
    expect(SITE_FACT_KEYS).not.toContain('nombreAvis');
    const facts = assembleFacts(DOS_SERVICES);
    expect(JSON.stringify(facts)).not.toMatch(/avis/i);
  });

  it('préfère le nom sous lequel Google connaît l’entreprise', () => {
    // Sirene enregistre « SOULEYMANE DOSSO (DOS SERVICES) » : un état civil
    // accolé à une enseigne, illisible en titre de page. Google porte
    // « Dos-Services », déjà mis en forme, et c'est le nom sous lequel les
    // clients de l'artisan le trouvent. L'appariement a été validé à 0,89 de
    // confiance : ce n'est pas un nom deviné, c'est un nom vérifié.
    expect(assembleFacts(DOS_SERVICES)?.nomAffiche).toBe('Dos-Services');
  });

  it("se rabat sur l'enseigne Sirene quand Google n'a pas apparié", () => {
    const facts = assembleFacts({
      ...DOS_SERVICES,
      enrichment: { ...DOS_SERVICES.enrichment!, matchedName: null },
    });
    // Mise en forme, car Sirene stocke tout en capitales et un titre de page
    // en capitales se lit comme un cri.
    expect(facts?.nomAffiche).toBe('Dos Services');
  });

  it("découpe l'adresse et lui rend une casse lisible", () => {
    expect(assembleFacts(DOS_SERVICES)?.adresse).toEqual({
      rue: '37 Rue Jacques Cartier',
      codePostal: '44300',
      ville: 'Nantes',
    });
  });

  it('donne le téléphone deux fois : pour le lien et pour l’œil', () => {
    // Le lien `tel:` exige le E.164 ; l'affichage exige la forme française.
    // Dériver l'un de l'autre dans le gabarit ferait de la mise en forme une
    // affaire de présentation, alors que c'est une donnée : le jour où un
    // numéro étranger entre en base, c'est ici qu'on le verra.
    expect(assembleFacts(DOS_SERVICES)?.telephone).toEqual({
      e164: '+33602002360',
      affichage: '06 02 00 23 60',
    });
  });

  it('refuse un prospect sans téléphone', () => {
    // Le plan (tâche 1) classe le téléphone parmi les champs obligatoires, et
    // la mesure lui donne raison : une vitrine d'artisan sans numéro n'a pas
    // d'appel à l'action, donc rien à vendre et rien à mesurer. Mieux vaut
    // n'en générer aucun que d'en déployer un muet.
    //
    // Coût réel, mesuré sur la base : 2 des 22 cibles appariées, et aucune des
    // 3 du banc d'essai D7.
    const sansTel = {
      ...DOS_SERVICES,
      enrichment: { ...DOS_SERVICES.enrichment!, phoneE164: null },
    };
    expect(assembleFacts(sansTel)).toBeNull();
    expect(assembleFacts({ ...DOS_SERVICES, enrichment: null })).toBeNull();
  });

  it('rend null plutôt qu’une valeur de remplissage sur un fait manquant', () => {
    const facts = assembleFacts({
      ...DOS_SERVICES,
      dateCreation: null,
      enrichment: { ...DOS_SERVICES.enrichment!, rating: null, mapsUrl: null },
    });
    // Un facultatif absent doit faire disparaître une section, jamais
    // produire une phrase creuse (tâche 1). `null` est la seule valeur qui
    // laisse le gabarit décider ; 0 ou '' se rendraient à l'écran.
    expect(facts?.anneeCreation).toBeNull();
    expect(facts?.noteGoogle).toBeNull();
    expect(facts?.lienMaps).toBeNull();
    // Le reste tient debout sans eux.
    expect(facts?.nomAffiche).toBe('Dos-Services');
  });

  it('tait une note que l’artisan n’aurait pas envie de montrer', () => {
    // Décision prise avec l'utilisateur après la génération d'AQUATIO, dont la
    // note réelle est 3,4. Le site l'affichait telle quelle sur une vitrine
    // censée donner envie d'appeler — et le premier réflexe de l'artisan à qui
    // on montre sa maquette aurait été « pourquoi vous affichez ça ? ».
    //
    // Le seuil est celui du barème (`SCORING_RULESET.reputation.minRating`),
    // pas un nombre neuf : une note qui ne vaut pas de points ne vaut pas
    // d'être mise en avant, et faire diverger les deux obligerait à expliquer
    // pourquoi le même chiffre est bon d'un côté et mauvais de l'autre.
    expect(NOTE_MINIMALE_AFFICHABLE).toBe(4);

    const basse = { ...DOS_SERVICES, enrichment: { ...DOS_SERVICES.enrichment!, rating: 3.4 } };
    expect(assembleFacts(basse)?.noteGoogle).toBeNull();

    // Pile au seuil : affichée. Le barème lit `>= 4`, on lit pareil.
    const pile = { ...DOS_SERVICES, enrichment: { ...DOS_SERVICES.enrichment!, rating: 4 } };
    expect(assembleFacts(pile)?.noteGoogle).toBe(4);
    expect(assembleFacts(DOS_SERVICES)?.noteGoogle).toBe(4.6);
  });

  it('applique le seuil AVANT le prompt, et pas à l’affichage', () => {
    // La différence est tout le sujet. Filtrer dans le gabarit aurait laissé
    // la note basse atteindre le modèle, qui pouvait alors écrire « nos
    // clients nous notent 3,4 » dans sa prose — et la prose, elle, n'est pas
    // filtrée par le gabarit. Ce que `assembleFacts` ne renvoie pas ne peut
    // atteindre ni le prompt, ni la page.
    const basse = { ...DOS_SERVICES, enrichment: { ...DOS_SERVICES.enrichment!, rating: 2.6 } };
    expect(JSON.stringify(assembleFacts(basse))).not.toContain('2.6');
  });

  it("dérive l'année de création, et pas l'ancienneté en années", () => {
    // « Depuis 2009 » reste vrai indéfiniment ; « 17 ans d'expérience » est
    // faux l'année suivante. Le contenu généré est écrit une fois et déployé
    // pour des mois : il ne doit contenir aucune valeur qui se périme seule.
    // Même raisonnement que le §14 ter du spec sur les libellés cuits du
    // barème, qui figent « Créée il y a 13 ans » sans dire de quand.
    expect(assembleFacts(DOS_SERVICES)?.anneeCreation).toBe(2009);
  });

  it('porte le métier par son slug ET son libellé', () => {
    expect(assembleFacts(DOS_SERVICES)?.metier).toEqual({
      slug: 'plombier',
      label: 'Plombier',
    });
  });

  it('conserve la raison sociale pour les seules mentions légales', () => {
    // `nomAffiche` est commercial, `raisonSociale` est légal. Les mentions
    // légales nomment l'entreprise représentée telle que Sirene l'enregistre,
    // et le SIRET l'identifie sans ambiguïté.
    const facts = assembleFacts(DOS_SERVICES);
    expect(facts?.raisonSociale).toBe('SOULEYMANE DOSSO (DOS SERVICES)');
    expect(facts?.siret).toBe('51000900400035');
  });

  it('refuse un métier que le projet ne connaît pas', () => {
    // Sans métier connu, il n'y a pas de liste close de prestations : le
    // modèle n'aurait plus rien où puiser et comblerait le trou. Échouer ici
    // est le seul comportement sûr.
    expect(assembleFacts({ ...DOS_SERVICES, tradeSlug: 'couvreur' })).toBeNull();
  });
});
