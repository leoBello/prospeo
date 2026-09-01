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

/** Les sélecteurs sont regroupés ici : ce sont eux qui casseront en premier. */
const SELECTORS = {
  consent: 'button[aria-label*="Tout accepter"], button:has-text("Tout accepter")',
  feed: 'div[role="feed"]',
  card: 'div[role="feed"] > div > div[jsaction]',
  cardLink: 'a[href*="/maps/place/"]',
  cardName: '.qBF1Pd',
  cardRating: '.MW4etd',
  cardReviews: '.UY7F9',
  placeName: 'h1',
  placeCategory: 'button[jsaction*="category"]',
  placeAddress: 'button[data-item-id="address"]',
  placePhone: 'button[data-item-id^="phone"]',
  placeWebsite: 'a[data-item-id="authority"]',
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Google interpose /sorry/ ou une iframe reCAPTCHA quand il se méfie. */
function assertNotBlocked(url: string): void {
  if (url.includes('/sorry/') || url.includes('/recaptcha/')) throw new BlockedError(url);
}

/** `Locator` et `Page` exposent tous deux `locator()` : un seul helper suffit. */
async function textOf(scope: Page | Locator, selector: string): Promise<string | null> {
  return scope
    .locator(selector)
    .first()
    .textContent()
    .catch(() => null);
}

async function attrOf(
  scope: Page | Locator,
  selector: string,
  attribute: string,
): Promise<string | null> {
  return scope
    .locator(selector)
    .first()
    .getAttribute(attribute)
    .catch(() => null);
}

async function readPlacePanel(page: Page): Promise<RawMapsPlace | null> {
  const name = await textOf(page, SELECTORS.placeName);
  if (name === null) return null;
  return {
    name,
    address: await attrOf(page, SELECTORS.placeAddress, 'aria-label'),
    category: await textOf(page, SELECTORS.placeCategory),
    phone: await attrOf(page, SELECTORS.placePhone, 'aria-label'),
    website: await attrOf(page, SELECTORS.placeWebsite, 'href'),
    ratingText: await textOf(page, SELECTORS.cardRating),
    reviewCountText: await textOf(page, SELECTORS.cardReviews),
    placeUrl: page.url(),
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
    async search(query: string): Promise<MapsCandidate[]> {
      const ctx = await ensureContext();
      const page = await ctx.newPage();
      try {
        const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=fr`;
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

        // Résultat unique : Maps ouvre directement la fiche.
        if (page.url().includes('/maps/place/')) {
          const single = await readPlacePanel(page);
          if (single === null) return [];
          const candidate = toMapsCandidate(single);
          return candidate === null ? [] : [candidate];
        }

        await page.waitForSelector(SELECTORS.feed, { timeout: 15_000 }).catch(() => null);
        const cards = await page.locator(SELECTORS.card).all();

        const raws: RawMapsPlace[] = [];
        for (const card of cards.slice(0, settings.maxCandidates)) {
          const href = await attrOf(card, SELECTORS.cardLink, 'href');
          if (href === null) continue;
          raws.push({
            name: await textOf(card, SELECTORS.cardName),
            address: null,
            category: null,
            phone: null,
            website: null,
            ratingText: await textOf(card, SELECTORS.cardRating),
            reviewCountText: await textOf(card, SELECTORS.cardReviews),
            placeUrl: href,
          });
        }

        // Les cartes de résultat ne portent ni téléphone ni site : il faut
        // ouvrir chaque fiche. C'est le coût réel du run, et la raison du
        // plafond journalier.
        const candidates: MapsCandidate[] = [];
        for (const raw of raws) {
          await sleep(randomDelay());
          const detail = await openPlace(ctx, raw.placeUrl);
          // L'URL de la carte fait foi : celle de la fiche ouverte peut avoir
          // été réécrite par une redirection, et c'est d'elle qu'on tire les
          // coordonnées qui alimentent le filtre de distance.
          const candidate = toMapsCandidate({ ...(detail ?? raw), placeUrl: raw.placeUrl });
          if (candidate !== null) candidates.push(candidate);
        }
        return candidates;
      } finally {
        await page.close();
      }
    },

    async close(): Promise<void> {
      await context?.close();
      context = null;
    },
  };
}
