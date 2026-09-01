import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';
import type { MapsCandidate } from '@prospeo/core';
import { toMapsCandidate, type RawMapsPlace } from './google-maps-normalize.js';

/**
 * Levée quand Google interpose un captcha ou un interstitiel.
 *
 * Elle interrompt le run entier, volontairement. Continuer reviendrait à
 * marteler une protection qui vient de se déclencher — ce qui la durcit, et
 * remplit la base de fiches vides indiscernables de vraies absences.
 */
export class BlockedError extends Error {
  constructor(url: string) {
    super(`Google a interposé une vérification : ${url}`);
    this.name = 'BlockedError';
    // Sans cette ligne, `instanceof BlockedError` peut échouer après passage
    // dans une chaîne de `catch` selon la cible de compilation. L'étage
    // `enrich` s'appuie dessus pour décider d'arrêter le run : le perdre
    // transformerait un blocage anti-bot en simple échec ignoré.
    Object.setPrototypeOf(this, BlockedError.prototype);
  }
}

export interface MapsSource {
  search(query: string): Promise<MapsCandidate[]>;
  close(): Promise<void>;
  /**
   * Pages Google chargées depuis la création de la source.
   *
   * C'est le volume réellement envoyé à Google, et il n'a rien d'égal au
   * nombre de prospects traités : un prospect coûte une navigation de
   * recherche, plus une par fiche ouverte. Le plafond journalier compte des
   * prospects, parce que lui seul se relit depuis la base après un
   * redémarrage ; ce compteur-ci rend le coût réel visible plutôt que deviné.
   *
   * En lecture seule : `close()` ne le remet pas à zéro, la source restant la
   * même après un cycle de fermeture.
   */
  readonly navigations: number;
}

export interface GoogleMapsOptions {
  /** Profil de navigateur persistant : c'est lui qui retient le consentement. */
  userDataDir: string;
  minDelayMs?: number;
  maxDelayMs?: number;
  headless?: boolean;
  /** Nombre maximal de fiches retenues par recherche. */
  maxCandidates?: number;
}

const DEFAULTS = { minDelayMs: 3000, maxDelayMs: 8000, headless: true, maxCandidates: 5 };

/**
 * Les sélecteurs sont regroupés ici : ce sont eux qui casseront en premier.
 *
 * Vérifiés sur une recherche réelle le 1er septembre 2026. Deux constats de
 * cette vérification méritent d'être notés, parce qu'ils ne se devinent pas :
 *
 * - la note vit dans `.MW4etd` sur une carte de résultat, mais dans `.F7nice`
 *   sur le panneau d'une fiche ; le premier sélecteur n'existe pas sur le
 *   second écran ;
 * - **le nombre d'avis n'est plus affiché nulle part.** Ni sur les cartes, ni
 *   sur la fiche : `.F7nice` ne contient que la note et l'image des étoiles,
 *   et le seul `aria-label` chiffré du feed est « 4,8 étoiles ». Aucun
 *   sélecteur ne peut donc le fournir, et `reviewCountText` reste `null`.
 */
const SELECTORS = {
  consent: 'button[aria-label*="Tout accepter"], button:has-text("Tout accepter")',
  feed: 'div[role="feed"]',
  cardLink: 'div[role="feed"] a[href*="/maps/place/"]',
  cardName: '.qBF1Pd',
  cardRating: '.MW4etd',
  placeName: 'h1',
  placeRating: '.F7nice',
  placeCategory: 'button[jsaction*="category"]',
  placeAddress: 'button[data-item-id="address"]',
  placePhone: 'button[data-item-id^="phone"]',
  placeWebsite: 'a[data-item-id="authority"]',
} as const;

/**
 * Retire le libellé que Google préfixe à ses `aria-label`.
 *
 * Une adresse s'y lit « Adresse: 25 Rue Petite Biesse, 44200 Nantes, France »
 * et un téléphone « Numéro de téléphone: +33 2 85 52 26 00 ». Conserver le
 * préfixe le ferait remonter tel quel dans la fiche de prospection, et
 * apparaître dans le message envoyé à l'artisan.
 *
 * On ancre sur les deux libellés réellement observés plutôt que sur un
 * préfixe borné en longueur avant le premier deux-points : une adresse comme
 * « ZA de la Distribution : Lot 12 » contient elle-même un deux-points, et un
 * préfixe générique y couperait le début. Un libellé inconnu laisse la
 * valeur intacte — le comportement sûr, un préfixe non retiré coûtant moins
 * qu'une adresse tronquée.
 */
export function stripAriaLabel(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value.replace(/^(?:Adresse|Numéro de téléphone)\s*:\s*/i, '').trim();
  return cleaned === '' ? null : cleaned;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Google interpose /sorry/ ou une iframe reCAPTCHA quand il se méfie. */
function assertNotBlocked(url: string): void {
  if (url.includes('/sorry/') || url.includes('/recaptcha/')) throw new BlockedError(url);
}

/**
 * Une chaîne vide, ou uniquement faite d'espaces, n'est pas une donnée :
 * c'est l'absence d'une donnée — typiquement un élément attaché au DOM mais
 * pas encore peuplé, la même course que `readPlacePanel` corrige déjà en
 * attendant `placeName`. Les confondre est dangereux plus loin : `mergePlace`
 * fait `detail.name ?? card.name`, et `??` ne rejette que `null` — une
 * chaîne vide écraserait donc silencieusement une valeur valide lue sur la
 * carte, `toMapsCandidate` rejetterait la fiche faute de nom, et le candidat
 * disparaîtrait sans trace. On coupe donc ce risque à la source, avant toute
 * fusion, plutôt qu'au symptôme.
 *
 * Équivalent local du `trimmed` de `google-maps-normalize.ts`, non exporté
 * par ce module pur : le dupliquer ici évite de coupler le module pilotant
 * Playwright à un détail interne du module de conversion.
 */
function emptyToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Attente accordée à UN champ absent, et la valeur compte.
 *
 * Sans timeout explicite, Playwright applique son défaut de trente secondes :
 * `textContent()` attend que l'élément soit attaché, et un élément qui
 * n'existe pas ne s'attache jamais. Or l'absence est ici le cas NORMAL, pas
 * l'exception — un artisan sans site n'a pas de `a[data-item-id="authority"]`
 * sur sa fiche, et c'est exactement la population que ce projet cherche. Le
 * défaut faisait donc payer trente secondes de pure attente par champ absent,
 * sur précisément les prospects qui nous intéressent : plusieurs heures de
 * blocage muet sur un run de Nantes, indiscernables d'une lenteur réseau.
 *
 * Trois secondes, et les champs sont lus EN PARALLÈLE : c'est ce qui permet
 * d'être large. Séquentiellement, une fiche sans site, sans téléphone et sans
 * catégorie aurait payé trois fois le délai ; en parallèle elle n'en paie
 * qu'un seul, quel que soit le nombre d'absents. On peut donc laisser à Maps
 * le temps d'hydrater son panneau — il ne rend pas tout d'un bloc avec le
 * titre — sans que l'absence coûte cher. Rater un téléphone présent mais
 * tardif rendrait le prospect inexploitable ; c'est l'erreur à ne pas
 * commettre, et trois secondes contre un étranglement anti-bot de trois à
 * huit secondes entre deux navigations ne se voient pas.
 *
 * Valeur raisonnée, non mesurée : le run de calibration est le moment de la
 * confronter au réel.
 */
const FIELD_TIMEOUT_MS = 3000;

/** `Locator` et `Page` exposent tous deux `locator()` : un seul helper suffit. */
async function textOf(scope: Page | Locator, selector: string): Promise<string | null> {
  const raw = await scope
    .locator(selector)
    .first()
    .textContent({ timeout: FIELD_TIMEOUT_MS })
    .catch(() => null);
  return emptyToNull(raw);
}

async function attrOf(
  scope: Page | Locator,
  selector: string,
  attribute: string,
): Promise<string | null> {
  const raw = await scope
    .locator(selector)
    .first()
    .getAttribute(attribute, { timeout: FIELD_TIMEOUT_MS })
    .catch(() => null);
  return emptyToNull(raw);
}

/**
 * Ce que Maps a fini par afficher : une fiche, ou une liste.
 *
 * Google décide APRÈS le chargement, et il réécrit alors l'URL en
 * `/maps/place/` — mesuré à cinq secondes sur une recherche réelle.
 * Trancher plus tôt fait prendre une fiche unique pour une liste vide : la
 * recherche renvoie zéro candidat sans lever la moindre erreur, et l'étage
 * conclut « introuvable » sur précisément les appariements les plus sûrs,
 * ceux dont le nom ne désigne qu'une entreprise.
 *
 * La course attend donc le premier des deux signaux, au lieu de supposer
 * lequel viendra.
 */
export async function settleResultShape(page: Page): Promise<'place' | 'feed'> {
  await Promise.race([
    page.waitForURL(/\/maps\/place\//, { timeout: 15_000 }),
    page.waitForSelector(SELECTORS.feed, { timeout: 15_000 }),
  ]).catch(() => null);
  return page.url().includes('/maps/place/') ? 'place' : 'feed';
}

/**
 * Les cartes de la liste de résultats, dans l'ordre où Maps les présente.
 *
 * On part des LIENS, pas des conteneurs : le flux contient aussi des
 * éléments de mise en page sans lien, qui consommeraient sinon une place du
 * quota de candidats sans jamais rien apporter. Constaté sur une recherche
 * réelle — neuf conteneurs pour huit fiches.
 *
 * Une carte ne porte ni téléphone, ni site, ni catégorie : seulement un nom,
 * une note et l'URL de sa fiche. Le reste vient de `readPlacePanel`, au prix
 * d'une navigation par fiche.
 */
export async function readCards(page: Page, maxCandidates: number): Promise<RawMapsPlace[]> {
  const links = await page.locator(SELECTORS.cardLink).all();

  // Toutes les cartes en parallèle, et tous les champs d'une carte avec.
  // Lire le DOM n'envoie aucune requête à Google — l'étranglement anti-bot
  // porte sur les navigations, pas sur les lectures — donc rien n'oblige à
  // les mettre à la file. Or une carte sans note paie `FIELD_TIMEOUT_MS` :
  // en série, cinq fiches récentes et sans avis auraient fait attendre
  // quinze secondes une page déjà entièrement chargée.
  const cards = await Promise.all(
    links.slice(0, maxCandidates).map(async (link): Promise<RawMapsPlace | null> => {
      const [href, name, ratingText] = await Promise.all([
        link.getAttribute('href').catch(() => null),
        textOf(link, SELECTORS.cardName),
        textOf(link, SELECTORS.cardRating),
      ]);
      // Sans URL de fiche, la carte n'est ni ouvrable ni localisable : elle
      // n'apporterait qu'un nom sans rien pour l'apparier.
      if (href === null) return null;
      return {
        name,
        address: null,
        category: null,
        phone: null,
        website: null,
        ratingText,
        // Google ne publie plus le nombre d'avis. Voir la note de `SELECTORS`.
        reviewCountText: null,
        placeUrl: href,
      };
    }),
  );

  // `Promise.all` préserve l'ordre des liens, donc celui dans lequel Maps
  // classe ses résultats — et c'est un signal : la première fiche est la
  // plus pertinente selon Google.
  return cards.filter((card): card is RawMapsPlace => card !== null);
}

export async function readPlacePanel(page: Page): Promise<RawMapsPlace | null> {
  // `domcontentloaded` ne suffit pas : le panneau d'une fiche est rendu après
  // coup, et lire les sélecteurs sans attendre rend `null` sur toute la fiche.
  // Ce n'est pas théorique — une recherche réelle a renvoyé zéro candidat pour
  // cette seule raison, sans lever la moindre erreur.
  await page.waitForSelector(SELECTORS.placeName, { timeout: 15_000 }).catch(() => null);

  const name = await textOf(page, SELECTORS.placeName);
  if (name === null) return null;

  // En parallèle, et c'est ce qui rend `FIELD_TIMEOUT_MS` abordable : un
  // champ absent fait attendre tous les autres en même temps que lui, au
  // lieu d'ajouter son délai à la file. Une fiche sans site ni téléphone —
  // le profil même que ce projet cherche — coûte ainsi un délai, pas quatre.
  const [address, category, phone, website, ratingText] = await Promise.all([
    attrOf(page, SELECTORS.placeAddress, 'aria-label'),
    textOf(page, SELECTORS.placeCategory),
    attrOf(page, SELECTORS.placePhone, 'aria-label'),
    attrOf(page, SELECTORS.placeWebsite, 'href'),
    textOf(page, SELECTORS.placeRating),
  ]);

  return {
    name,
    address: stripAriaLabel(address),
    category,
    phone: stripAriaLabel(phone),
    website,
    ratingText,
    // Google ne publie plus le nombre d'avis. Voir la note de `SELECTORS`.
    reviewCountText: null,
    placeUrl: page.url(),
  };
}

/**
 * Complète les champs de la carte par ceux de la fiche, champ par champ.
 *
 * Un remplacement en bloc perdrait la note : elle est lisible sur la carte
 * (`.MW4etd`) mais pas toujours sur la fiche, et la fiche apporte en échange
 * le téléphone, le site et la catégorie, absents de la carte.
 */
export function mergePlace(card: RawMapsPlace, detail: RawMapsPlace | null): RawMapsPlace {
  if (detail === null) return card;
  return {
    name: detail.name ?? card.name,
    address: detail.address ?? card.address,
    category: detail.category ?? card.category,
    phone: detail.phone ?? card.phone,
    website: detail.website ?? card.website,
    ratingText: detail.ratingText ?? card.ratingText,
    reviewCountText: detail.reviewCountText ?? card.reviewCountText,
    // L'URL de la carte fait foi : celle de la fiche peut avoir été réécrite
    // par une redirection, et c'est d'elle que viennent les coordonnées qui
    // alimentent le filtre de distance de l'appariement.
    placeUrl: card.placeUrl,
  };
}

export function createGoogleMapsSource(options: GoogleMapsOptions): MapsSource {
  // `{ ...DEFAULTS, ...options }` écraserait un défaut par un `undefined`
  // explicite, tous ces champs étant optionnels. On lit donc chaque option
  // avec `??`, qui ne retient que les valeurs réellement fournies.
  const settings = {
    userDataDir: options.userDataDir,
    minDelayMs: options.minDelayMs ?? DEFAULTS.minDelayMs,
    maxDelayMs: options.maxDelayMs ?? DEFAULTS.maxDelayMs,
    headless: options.headless ?? DEFAULTS.headless,
    maxCandidates: options.maxCandidates ?? DEFAULTS.maxCandidates,
  };

  let context: BrowserContext | null = null;

  function randomDelay(): number {
    const span = Math.max(1, settings.maxDelayMs - settings.minDelayMs);
    return settings.minDelayMs + Math.floor(Math.random() * span);
  }

  // `-Infinity` fait que le premier appel du processus calcule une attente
  // négative : la toute première navigation part donc immédiatement, sans
  // délai artificiel avant qu'aucune requête n'ait encore été envoyée.
  let lastNavigationAt = -Infinity;

  /** Incrémenté dans `throttleNavigation`, seul passage obligé avant un `goto`. */
  let navigations = 0;

  /**
   * Étrangle CHAQUE navigation vers Google — celle de `search()` comme celle
   * d'une fiche dans `openPlace()` — sur un seul et même compteur.
   *
   * Le rythme anti-bot se mesure aux requêtes envoyées à Google, pas aux
   * fiches retenues en sortie. Un délai placé seulement entre deux ouvertures
   * de fiche à l'intérieur d'une même recherche laisserait passer sans
   * aucune pause toute suite de recherches à résultat unique — le cas le
   * plus fréquent en interrogeant par raison sociale exacte — et l'étage
   * suivant enchaînerait alors des centaines de requêtes à pleine vitesse.
   * Un étranglement qui ne couvre qu'une partie des chemins ne protège de
   * rien.
   */
  async function throttleNavigation(): Promise<void> {
    const elapsed = Date.now() - lastNavigationAt;
    const wait = randomDelay() - elapsed;
    if (wait > 0) await sleep(wait);
    lastNavigationAt = Date.now();
    // Compté ici, donc avant le `goto` qui suit : le compteur mesure les
    // requêtes parties vers Google, et une navigation qui échoue en a bel et
    // bien produit une. La compter après coup sous-estimerait précisément le
    // volume envoyé les jours où Google répond mal — le moment où ce chiffre
    // compte le plus.
    navigations += 1;
  }

  async function ensureContext(): Promise<BrowserContext> {
    if (context !== null) return context;
    context = await chromium.launchPersistentContext(settings.userDataDir, {
      headless: settings.headless,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
    });
    return context;
  }

  async function openPlace(ctx: BrowserContext, placeUrl: string): Promise<RawMapsPlace | null> {
    const page = await ctx.newPage();
    try {
      await throttleNavigation();
      await page.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      assertNotBlocked(page.url());
      return await readPlacePanel(page);
    } catch (error) {
      // Un blocage doit remonter : lui seul arrête le run. Toute autre panne
      // sur une fiche isolée se traduit par une absence de détail, pas par
      // l'échec de la recherche entière.
      if (error instanceof BlockedError) throw error;
      return null;
    } finally {
      await page.close();
    }
  }

  return {
    // Accesseur plutôt que champ : un champ mutable public laisserait
    // l'appelant réécrire le compteur qu'il est censé lire.
    get navigations(): number {
      return navigations;
    },

    async search(query: string): Promise<MapsCandidate[]> {
      const ctx = await ensureContext();
      const page = await ctx.newPage();
      try {
        const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=fr`;
        await throttleNavigation();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        assertNotBlocked(page.url());

        // Le consentement n'apparaît qu'une fois par profil : le contexte
        // persistant conserve le cookie. Son retour à chaque run signale un
        // profil non réutilisé, pas une protection à contourner en boucle.
        const consent = page.locator(SELECTORS.consent).first();
        if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) {
          await consent.click();
          await page.waitForLoadState('domcontentloaded');
        }

        const shape = await settleResultShape(page);
        assertNotBlocked(page.url());

        // Résultat unique : Maps a ouvert directement la fiche.
        if (shape === 'place') {
          const single = await readPlacePanel(page);
          if (single === null) return [];
          const candidate = toMapsCandidate(single);
          return candidate === null ? [] : [candidate];
        }

        const raws = await readCards(page, settings.maxCandidates);

        // Les cartes de résultat ne portent ni téléphone ni site : il faut
        // ouvrir chaque fiche. C'est le coût réel du run, et la raison du
        // plafond journalier.
        const candidates: MapsCandidate[] = [];
        for (const raw of raws) {
          // Le délai lui-même est appliqué dans `openPlace`, par
          // `throttleNavigation`, juste avant son `page.goto` : c'est là,
          // et non ici, que la requête part réellement vers Google.
          const detail = await openPlace(ctx, raw.placeUrl);
          const candidate = toMapsCandidate(mergePlace(raw, detail));
          if (candidate !== null) candidates.push(candidate);
        }
        return candidates;
      } finally {
        await page.close();
      }
    },

    async close(): Promise<void> {
      // La source redevient utilisable après cet appel : `context` retombe à
      // `null`, et un `search()` ultérieur relancera silencieusement un
      // navigateur complet plutôt que d'échouer. Ce n'est pas un bug — juste
      // un coût, celui d'un démarrage de navigateur — mais un appelant qui
      // ferme en fin de run doit savoir qu'un appel égaré ne casse rien.
      await context?.close();
      context = null;
    },
  };
}
