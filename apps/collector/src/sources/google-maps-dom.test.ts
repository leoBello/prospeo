import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { toMapsCandidate } from './google-maps-normalize.js';
import {
  mergePlace,
  readCards,
  readPlacePanel,
  settleResultShape,
  stripAriaLabel,
} from './google-maps.js';

/**
 * Les sélecteurs de Google Maps sont éprouvés ici contre du HTML, dans un
 * vrai navigateur.
 *
 * Un test qui remplace la page par un faux objet `Locator` ne vérifierait que
 * le câblage entre nos propres fonctions — or ce n'est pas lui qui casse.
 * Ce qui casse, c'est la chaîne « ce sélecteur, sur ce HTML, rend cette
 * valeur », et elle n'existe qu'avec un moteur de rendu derrière. D'où le
 * navigateur, et d'où les fixtures.
 *
 * Ce que ces tests NE font pas, et qu'aucun test hors ligne ne peut faire :
 * détecter que Google a renommé une classe. Une fixture fige le HTML
 * d'hier. Contre ce risque-là, le garde-fou est ailleurs — dans le
 * disjoncteur de `runEnrich`, qui arrête un run dont les recherches
 * reviennent toutes vides au lieu d'écrire des « introuvables » en série.
 * Les deux sont complémentaires : la fixture protège contre nos régressions,
 * le disjoncteur contre celles de Google.
 */

const FEED = readFileSync(new URL('./fixtures/maps-feed.html', import.meta.url), 'utf8');
const PLACE = readFileSync(new URL('./fixtures/maps-place.html', import.meta.url), 'utf8');
const SINGLE = readFileSync(
  new URL('./fixtures/maps-single-result.html', import.meta.url),
  'utf8',
);

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/**
 * Sert une fixture sous une VRAIE URL Google.
 *
 * `page.setContent` laisserait l'URL à `about:blank`, et l'URL n'est pas
 * décorative ici : c'est d'elle que `toMapsCandidate` tire les coordonnées
 * qui alimentent le filtre de distance, et c'est sa réécriture tardive qui
 * distingue une fiche unique d'une liste vide. Une fixture servie hors URL
 * ne testerait donc pas la moitié de ce qui compte.
 */
async function serve(html: string, url: string): Promise<Page> {
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  );
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

describe('readCards', () => {
  it('lit les fiches du flux en ignorant les conteneurs sans lien', async () => {
    const page = await serve(FEED, 'https://www.google.com/maps/search/plombier+Nantes?hl=fr');
    const cards = await readCards(page, 20);
    await page.close();

    // Neuf enfants dans le flux, huit fiches : le neuvième est un bandeau
    // sans lien. Partir des conteneurs lui donnerait une place du quota.
    expect(cards).toHaveLength(8);
    expect(cards.map((c) => c.name)).toEqual([
      'Plomberie Allard',
      'RG Services',
      'Ouest Dépannage Plomberie',
      'H20 Plomberie',
      'AE Habitat',
      // Nom vide dans le DOM : rendu `null`, jamais chaîne vide. Une chaîne
      // vide passerait le `??` de `mergePlace` et écraserait le nom lu sur
      // la fiche, faisant disparaître le candidat sans trace.
      null,
      'Martin Dépannage',
      'SOS Plombier 44',
    ]);
  }, 30_000);

  it('lit la note sur la carte, et rend null quand la fiche n en a pas', async () => {
    const page = await serve(FEED, 'https://www.google.com/maps/search/plombier+Nantes?hl=fr');
    const cards = await readCards(page, 20);
    await page.close();

    // `.MW4etd` est le sélecteur des CARTES. Sur le panneau d'une fiche la
    // note vit dans `.F7nice`, et celui-ci n'y existe pas.
    expect(cards[0]?.ratingText).toBe('4,8');
    expect(cards[4]?.ratingText).toBeNull();
    // Google ne publie plus le nombre d'avis nulle part.
    expect(cards.every((c) => c.reviewCountText === null)).toBe(true);
  }, 30_000);

  it('borne le nombre de fiches retenues', async () => {
    const page = await serve(FEED, 'https://www.google.com/maps/search/plombier+Nantes?hl=fr');
    const cards = await readCards(page, 3);
    await page.close();

    // Chaque fiche retenue coûte une navigation vers Google : la borne est
    // ce qui empêche une recherche large de brûler le plafond journalier.
    expect(cards).toHaveLength(3);
  }, 30_000);

  it('garde une URL exploitable par la conversion en candidat', async () => {
    const page = await serve(FEED, 'https://www.google.com/maps/search/plombier+Nantes?hl=fr');
    const cards = await readCards(page, 1);
    await page.close();

    const candidate = toMapsCandidate(cards[0]!);
    // Les coordonnées viennent de `!3d!4d`, pas de `@lat,lng` : la seconde
    // forme désigne le centre de la vue, qui peut être à des centaines de
    // mètres du lieu. C'est le filtre de distance de l'appariement qui les
    // consomme.
    expect(candidate?.latitude).toBeCloseTo(47.2118, 4);
    expect(candidate?.longitude).toBeCloseTo(-1.5534, 4);
    expect(candidate?.placeId).toBe('ChIJAllard');
  }, 30_000);
});

describe('readPlacePanel', () => {
  it('lit la fiche et retire les libellés des aria-label', async () => {
    const page = await serve(
      PLACE,
      'https://www.google.com/maps/place/Plomberie+Allard/@47.2118,-1.5534,17z/data=!4m6!3m5!8m2!3d47.2118!4d-1.5534!19sChIJAllard',
    );
    const place = await readPlacePanel(page);
    await page.close();

    expect(place?.name).toBe('Plomberie Allard');
    expect(place?.category).toBe('Plombier');
    expect(place?.website).toBe('https://plomberie-allard.fr/');
    // Le préfixe « Numéro de téléphone: » partirait sinon tel quel dans le
    // message envoyé à l'artisan.
    expect(place?.phone).toBe('+33 2 85 52 26 00');
    // Adresse portant elle-même un deux-points : elle doit survivre entière.
    // Un préfixe coupé au premier deux-points en aurait mangé le début.
    expect(place?.address).toBe('ZA de la Distribution : Lot 12, 44200 Nantes, France');
    // Sur le panneau, la note est dans `.F7nice` — le sélecteur des cartes
    // n'existe pas ici.
    expect(place?.ratingText).toContain('4,8');
    // Aucun sélecteur ne peut fournir le nombre d'avis : Google ne l'affiche
    // plus, ni sur les cartes ni sur la fiche.
    expect(place?.reviewCountText).toBeNull();
  }, 30_000);
});

describe('settleResultShape', () => {
  it('reconnaît une liste de résultats', async () => {
    const page = await serve(FEED, 'https://www.google.com/maps/search/plombier+Nantes?hl=fr');
    expect(await settleResultShape(page)).toBe('feed');
    await page.close();
  }, 30_000);

  it('attend que Maps réécrive l URL vers une fiche unique', async () => {
    const page = await serve(
      SINGLE,
      'https://www.google.com/maps/search/%22OUEST+DEPANNAGE+PLOMBERIE%22+Nantes?hl=fr',
    );

    // À cet instant précis, la page porte encore une URL de recherche et ne
    // contient aucun flux. C'est exactement ce que voyait la version qui
    // tranchait tout de suite : elle en concluait « liste vide » et rendait
    // zéro candidat, sans la moindre erreur.
    expect(page.url()).toContain('/maps/search/');
    expect(await page.locator('div[role="feed"]').count()).toBe(0);

    const startedAt = Date.now();
    const shape = await settleResultShape(page);
    const elapsed = Date.now() - startedAt;

    expect(shape).toBe('place');
    // La course doit se résoudre sur la réécriture d'URL, pas sur
    // l'expiration du guetteur de flux : sans cela l'étage attendrait quinze
    // secondes à chaque recherche à résultat unique — le cas le plus fréquent
    // en interrogeant par raison sociale exacte.
    expect(elapsed).toBeLessThan(5_000);

    // Le panneau, lui, n'est rendu qu'après l'URL : le lire sans attendre son
    // titre rendrait `null` sur toute la fiche.
    const place = await readPlacePanel(page);
    await page.close();

    expect(place?.name).toBe('Ouest Dépannage Plomberie');
    expect(place?.phone).toBe('+33 2 40 00 00 00');
    // L'URL de la fiche est celle réécrite par Maps, coordonnées comprises.
    expect(toMapsCandidate(place!)?.latitude).toBeCloseTo(47.205, 4);
  }, 30_000);
});

describe('stripAriaLabel', () => {
  it('laisse intacte une valeur dont le libellé est inconnu', () => {
    // Comportement sûr : un préfixe non retiré coûte moins cher qu'une
    // adresse tronquée, qui serait fausse sans avoir l'air de l'être.
    expect(stripAriaLabel('Horaires: ouvert 24h/24')).toBe('Horaires: ouvert 24h/24');
  });

  it('rend null sur un libellé sans valeur', () => {
    expect(stripAriaLabel('Adresse: ')).toBeNull();
    expect(stripAriaLabel('   ')).toBeNull();
  });
});

describe('mergePlace', () => {
  const card = {
    name: 'Plomberie Allard',
    address: null,
    category: null,
    phone: null,
    website: null,
    ratingText: '4,8',
    reviewCountText: null,
    placeUrl: 'https://www.google.com/maps/place/A/@47.2,-1.5,17z/data=!3d47.2!4d-1.5',
  };

  it('garde la note de la carte quand la fiche n en porte pas', () => {
    const merged = mergePlace(card, { ...card, ratingText: null, phone: '02 85 52 26 00' });
    // Un remplacement en bloc perdrait la note : elle est lisible sur la
    // carte mais pas toujours sur la fiche, et la fiche apporte en échange le
    // téléphone, le site et la catégorie, absents de la carte.
    expect(merged.ratingText).toBe('4,8');
    expect(merged.phone).toBe('02 85 52 26 00');
  });

  it('retient l URL de la carte, pas celle de la fiche', () => {
    const merged = mergePlace(card, {
      ...card,
      placeUrl: 'https://www.google.com/maps/place/A?redirected=1',
    });
    // Une redirection peut avoir réécrit l'URL de la fiche en lui ôtant ses
    // coordonnées — celles qui alimentent le filtre de distance.
    expect(merged.placeUrl).toBe(card.placeUrl);
  });

  it('rend la carte telle quelle quand la fiche n a pas pu être lue', () => {
    expect(mergePlace(card, null)).toEqual(card);
  });
});
