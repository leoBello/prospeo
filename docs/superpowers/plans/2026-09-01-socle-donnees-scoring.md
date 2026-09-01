# Socle données et scoring — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une commande CLI qui remplit une base Supabase d'établissements artisanaux d'une ville, classés par un score explicable, sans jamais appeler Google.

**Architecture:** Monorepo pnpm. `packages/core` contient toute la logique métier sous forme de fonctions pures sans I/O — normalisation, classification de présence web, barème. `packages/db` porte le schéma Postgres et ses migrations. `apps/collector` est un CLI dont chaque étage (`discover`, `probe`, `classify`, `score`) est idempotent, ne traite que les enregistrements non encore traités, et écrit prospect par prospect.

**Tech Stack:** TypeScript strict, Node 20+, pnpm workspaces, Vitest, Supabase (Postgres + client JS), `undici` pour HTTP.

**Spec de référence :** `docs/superpowers/specs/2026-09-01-socle-prospection-design.md`

**Périmètre :** étapes 1 à 3 de l'ordre de livraison du spec. Le dashboard, l'enrichissement Google Maps et le générateur de message font l'objet d'un plan n°2.

## Global Constraints

- TypeScript en mode `strict`, `noUncheckedIndexedAccess` activé.
- Environnement vérifié du poste : Node v26.3.0, pnpm 11.24.0. Ne pas épingler d'autres versions.
- Sous pnpm 11, `pnpm --filter <pkg> start -- <args>` transmet le `--` littéralement à la commande. Écrire `pnpm --filter <pkg> start <args>`, sans séparateur.
- `packages/core` ne fait **aucune I/O** : ni réseau, ni fichier, ni base. Aucune dépendance runtime hors `zod`.
- Chaque étage du collector écrit **un prospect à la fois**, jamais par lot.
- Codes NAF au format API avec point : `43.22A`, jamais `4322A`.
- `per_page` de l'API Recherche d'entreprises est plafonné à **25**.
- Exclusion obligatoire : `statut_diffusion !== 'O'` ou `statut_diffusion_etablissement !== 'O'`.
- Exclusion obligatoire : `etat_administratif !== 'A'` sur l'établissement.
- Score borné à `0..100`.
- Version du barème : `v1`.
- Tous les messages de commit se terminent par la ligne `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `packages/core/src/types.ts` | types du domaine, aucun comportement |
| `packages/core/src/trades.ts` | configuration déclarative des métiers |
| `packages/core/src/normalize.ts` | normalisation des raisons sociales |
| `packages/core/src/phone.ts` | normalisation E.164 et mobile/fixe |
| `packages/core/src/effectif.ts` | tranche INSEE → effectif minimal |
| `packages/core/src/web-presence.ts` | santé d'un site et catégorie de présence |
| `packages/core/src/scoring.ts` | barème versionné et calcul décomposé |
| `packages/core/src/index.ts` | surface publique du paquet |
| `packages/db/migrations/0001_init.sql` | schéma, index, RLS |
| `apps/collector/src/config.ts` | lecture et validation de l'environnement |
| `apps/collector/src/supabase.ts` | client Supabase en `service_role` |
| `apps/collector/src/sources/recherche-entreprises.ts` | client de l'API, pagination, mapping |
| `apps/collector/src/stages/discover.ts` | étage 1 |
| `apps/collector/src/stages/probe.ts` | étage 2 |
| `apps/collector/src/stages/classify-score.ts` | étages 3 et 4 |
| `apps/collector/src/cli.ts` | point d'entrée |

---

## Task 1: Monorepo, outillage, et première fonction pure

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/src/normalize.ts`
- Test: `packages/core/src/normalize.test.ts`

**Interfaces:**
- Consumes: rien
- Produces: `normalizeCompanyName(raw: string): string`

- [ ] **Step 1: Créer les fichiers racine du monorepo**

`pnpm-workspace.yaml` :
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`package.json` :
```json
{
  "name": "prospeo",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^26.0.0"
  },
  "packageManager": "pnpm@11.24.0"
}
```

`tsconfig.base.json` :
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "verbatimModuleSyntax": true
  }
}
```

Ajouter à `.gitignore` (le fichier existe déjà et contient `.superpowers/`) :
```
node_modules/
dist/
.env
.env.local
```

- [ ] **Step 2: Créer le paquet core**

`packages/core/package.json` :
```json
{
  "name": "@prospeo/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

`packages/core/tsconfig.json` :
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src"]
}
```

`packages/core/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

Puis : `pnpm install`

- [ ] **Step 3: Écrire le test qui échoue**

`packages/core/src/normalize.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from './normalize.js';

describe('normalizeCompanyName', () => {
  it('met en minuscules et retire les accents', () => {
    expect(normalizeCompanyName('Plomberie Générale ÉTÉ')).toBe('plomberie generale ete');
  });

  it('retire les formes juridiques', () => {
    expect(normalizeCompanyName('SARL PLOMBERIE MARTIN')).toBe('plomberie martin');
    expect(normalizeCompanyName('Plomberie Martin SAS')).toBe('plomberie martin');
    expect(normalizeCompanyName('EURL DUPONT ET FILS')).toBe('dupont et fils');
  });

  it('normalise la ponctuation et les espaces multiples', () => {
    expect(normalizeCompanyName('  MARTIN  &   FILS  ')).toBe('martin et fils');
    expect(normalizeCompanyName('PLOMB-EXPRESS (44)')).toBe('plomb express 44');
  });

  it('ne supprime pas une forme juridique incluse dans un mot', () => {
    expect(normalizeCompanyName('SASSENAGE PLOMBERIE')).toBe('sassenage plomberie');
  });

  it('renvoie une chaîne vide pour une entrée vide', () => {
    expect(normalizeCompanyName('   ')).toBe('');
  });
});
```

- [ ] **Step 4: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/core test`
Expected: FAIL — `Failed to resolve import "./normalize.js"`

- [ ] **Step 5: Écrire l'implémentation minimale**

`packages/core/src/normalize.ts` :
```ts
const LEGAL_FORMS = new Set([
  'sarl', 'sas', 'sasu', 'eurl', 'sa', 'snc', 'sci', 'scop', 'scm',
  'ei', 'eirl', 'earl', 'gie', 'selarl', 'sel', 'etablissements', 'ets',
]);

/**
 * Réduit une raison sociale à une forme comparable :
 * minuscules, sans accents, sans forme juridique, ponctuation normalisée.
 */
export function normalizeCompanyName(raw: string): string {
  const deaccented = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritiques combinants
    .toLowerCase();

  const spaced = deaccented
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (spaced === '') return '';

  const kept = spaced.split(' ').filter((word) => !LEGAL_FORMS.has(word));
  return kept.join(' ');
}
```

- [ ] **Step 6: Lancer le test et vérifier qu'il passe**

Run: `pnpm --filter @prospeo/core test`
Expected: PASS — 5 tests

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: monorepo pnpm et normalisation des raisons sociales" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Types du domaine et configuration des métiers

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/trades.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/trades.test.ts`

**Interfaces:**
- Consumes: rien
- Produces: tous les types du domaine ; `TRADES: readonly Trade[]`, `getTrade(slug: string): Trade | undefined`

- [ ] **Step 1: Écrire les types du domaine**

`packages/core/src/types.ts` :
```ts
export interface Trade {
  slug: string;
  label: string;
  /** Codes NAF au format API, avec point : '43.22A'. */
  nafCodes: string[];
  /** Requêtes utilisées par l'enrichissement Google Maps (plan n°2). */
  mapsQueries: string[];
  /** Mots-clés de cohérence métier, utilisés à l'appariement. */
  keywords: string[];
}

export interface RawEstablishment {
  siret: string;
  siren: string;
  tradeSlug: string;
  denomination: string;
  denominationUsuelle: string | null;
  nafCode: string | null;
  address: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  /** Date ISO `YYYY-MM-DD`. */
  dateCreation: string | null;
  /** Code de tranche d'effectif INSEE, ex. '02', 'NN'. */
  effectifCode: string | null;
  isEntrepreneurIndividuel: boolean;
  isHeadOffice: boolean;
}

export type WebPresenceCategory =
  | 'none'
  | 'social_only'
  | 'directory_only'
  | 'dead_site'
  | 'has_site';

export interface ProbeResult {
  url: string;
  reachable: boolean;
  httpStatus: number | null;
  isHttps: boolean;
  finalUrl: string | null;
  hasViewportMeta: boolean;
  isParked: boolean;
}

export interface ClassifyInput {
  /** URL déclarée sur la fiche Google Maps, si connue. */
  declaredUrl: string | null;
  /** URLs de réseaux sociaux découvertes par ailleurs. */
  socialUrls: string[];
  /** Résultat de sonde ; `null` si l'URL déclarée n'a pas encore été sondée. */
  probe: ProbeResult | null;
}

export type PhoneKind = 'mobile' | 'landline';

export interface NormalizedPhone {
  e164: string;
  kind: PhoneKind;
}

export interface ScoreInput {
  category: WebPresenceCategory;
  rating: number | null;
  reviewCount: number | null;
  /** Date ISO du dernier contenu social public, si lisible. */
  lastSocialPostAt: string | null;
  effectifCode: string | null;
  dateCreation: string | null;
  phoneKind: PhoneKind | null;
  isClosed: boolean;
  isFranchise: boolean;
}

export interface ScoreLine {
  code: string;
  label: string;
  points: number;
  group: 'presence' | 'vitalite' | 'joignabilite' | 'disqualifiant';
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreLine[];
  rulesetVersion: string;
}
```

- [ ] **Step 2: Écrire le test qui échoue**

`packages/core/src/trades.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { TRADES, getTrade } from './trades.js';

describe('trades', () => {
  it('expose plombier et serrurier', () => {
    expect(TRADES.map((t) => t.slug).sort()).toEqual(['plombier', 'serrurier']);
  });

  it('retrouve un métier par son slug', () => {
    expect(getTrade('plombier')?.label).toBe('Plombier');
    expect(getTrade('inconnu')).toBeUndefined();
  });

  it('utilise des codes NAF au format API, avec point', () => {
    for (const trade of TRADES) {
      expect(trade.nafCodes.length).toBeGreaterThan(0);
      for (const code of trade.nafCodes) {
        expect(code).toMatch(/^\d{2}\.\d{2}[A-Z]$/);
      }
    }
  });

  it('associe le plombier au 43.22A et le serrurier au 43.32B', () => {
    expect(getTrade('plombier')?.nafCodes).toContain('43.22A');
    expect(getTrade('serrurier')?.nafCodes).toContain('43.32B');
  });
});
```

- [ ] **Step 3: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/core test`
Expected: FAIL — `Failed to resolve import "./trades.js"`

- [ ] **Step 4: Écrire l'implémentation**

`packages/core/src/trades.ts` :
```ts
import type { Trade } from './types.js';

/**
 * Ajouter un métier consiste à ajouter un objet ici.
 *
 * `nafCodes` est volontairement un tableau : la nomenclature NAF est en cours
 * de révision et l'API expose aussi un champ `activite_principale_naf25`.
 * Un code unique ferait disparaître silencieusement une part de la population.
 */
export const TRADES: readonly Trade[] = [
  {
    slug: 'plombier',
    label: 'Plombier',
    nafCodes: ['43.22A'],
    mapsQueries: ['plombier', 'plomberie'],
    keywords: ['plomberie', 'plombier', 'chauffagiste', 'sanitaire', 'chauffage'],
  },
  {
    slug: 'serrurier',
    label: 'Serrurier',
    nafCodes: ['43.32B'],
    mapsQueries: ['serrurier', 'serrurerie'],
    keywords: ['serrurerie', 'serrurier', 'blindage', 'metallerie', 'depannage'],
  },
];

export function getTrade(slug: string): Trade | undefined {
  return TRADES.find((trade) => trade.slug === slug);
}
```

- [ ] **Step 5: Créer la surface publique du paquet**

`packages/core/src/index.ts` :
```ts
export * from './types.js';
export * from './trades.js';
export * from './normalize.js';
```

- [ ] **Step 6: Lancer les tests et le typecheck**

Run: `pnpm --filter @prospeo/core test && pnpm --filter @prospeo/core typecheck`
Expected: PASS — 9 tests, aucune erreur de type

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: types du domaine et configuration des metiers" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Normalisation des téléphones et tranches d'effectif

**Files:**
- Create: `packages/core/src/phone.ts`
- Create: `packages/core/src/effectif.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/phone.test.ts`, `packages/core/src/effectif.test.ts`

**Interfaces:**
- Consumes: `PhoneKind`, `NormalizedPhone` de `types.ts`
- Produces: `normalizePhone(raw: string | null): NormalizedPhone | null`, `minHeadcount(code: string | null): number | null`

- [ ] **Step 1: Écrire les tests qui échouent**

`packages/core/src/phone.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it('reconnaît un mobile au format national', () => {
    expect(normalizePhone('06 12 34 56 78')).toEqual({ e164: '+33612345678', kind: 'mobile' });
    expect(normalizePhone('07.98.76.54.32')).toEqual({ e164: '+33798765432', kind: 'mobile' });
  });

  it('reconnaît un fixe', () => {
    expect(normalizePhone('02 40 12 34 56')).toEqual({ e164: '+33240123456', kind: 'landline' });
  });

  it('accepte le format international', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toEqual({ e164: '+33612345678', kind: 'mobile' });
    expect(normalizePhone('0033612345678')).toEqual({ e164: '+33612345678', kind: 'mobile' });
  });

  it('rejette les numéros invalides', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('06 12 34 56')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('rejette un numéro français ne commençant pas par 1-9 après le 0', () => {
    expect(normalizePhone('00 12 34 56 78')).toBeNull();
  });
});
```

`packages/core/src/effectif.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { minHeadcount } from './effectif.js';

describe('minHeadcount', () => {
  it('traduit les codes INSEE en effectif minimal', () => {
    expect(minHeadcount('00')).toBe(0);
    expect(minHeadcount('01')).toBe(1);
    expect(minHeadcount('02')).toBe(3);
    expect(minHeadcount('11')).toBe(10);
    expect(minHeadcount('42')).toBe(1000);
  });

  it('renvoie null pour un effectif non renseigné', () => {
    expect(minHeadcount('NN')).toBeNull();
    expect(minHeadcount(null)).toBeNull();
    expect(minHeadcount('zz')).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm --filter @prospeo/core test`
Expected: FAIL — imports `./phone.js` et `./effectif.js` non résolus

- [ ] **Step 3: Écrire l'implémentation des téléphones**

`packages/core/src/phone.ts` :
```ts
import type { NormalizedPhone } from './types.js';

/**
 * Normalise un numéro français en E.164 et détermine s'il est mobile.
 * Les préfixes 06 et 07 sont mobiles ; un mobile vaut davantage parce qu'il
 * joint l'artisan directement et ouvre la voie WhatsApp.
 */
export function normalizePhone(raw: string | null): NormalizedPhone | null {
  if (raw === null) return null;

  // Une etiquette AVANT le numero est toleree (« Tél : 06 ... »), frequente dans
  // les donnees scrapees. Une lettre A L'INTERIEUR ou APRES invalide l'entree :
  // un faux numero se paie par un appel a un inconnu.
  const start = raw.search(/[\d+]/);
  if (start === -1) return null;
  const body = raw.slice(start);
  if (/\p{L}/u.test(body)) return null;

  let digits = body.replace(/[^\d+]/g, '');

  if (digits.startsWith('+33')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('0033')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('33') && digits.length === 11) digits = `0${digits.slice(2)}`;

  if (!/^0[1-9]\d{8}$/.test(digits)) return null;

  const kind = digits.startsWith('06') || digits.startsWith('07') ? 'mobile' : 'landline';
  return { e164: `+33${digits.slice(1)}`, kind };
}
```

- [ ] **Step 4: Écrire l'implémentation des effectifs**

`packages/core/src/effectif.ts` :
```ts
/** Codes de tranche d'effectif INSEE → borne basse de la tranche. */
const TRANCHES: Record<string, number> = {
  '00': 0, '01': 1, '02': 3, '03': 6,
  '11': 10, '12': 20, '21': 50, '22': 100,
  '31': 200, '32': 250, '41': 500, '42': 1000,
  '51': 2000, '52': 5000, '53': 10000,
};

/** `null` quand l'effectif n'est pas renseigné (code 'NN' ou absent). */
export function minHeadcount(code: string | null): number | null {
  if (code === null) return null;
  return TRANCHES[code] ?? null;
}
```

- [ ] **Step 5: Étendre la surface publique**

Ajouter à `packages/core/src/index.ts` :
```ts
export * from './phone.js';
export * from './effectif.js';
```

- [ ] **Step 6: Lancer les tests**

Run: `pnpm --filter @prospeo/core test`
Expected: PASS — 16 tests

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: normalisation des telephones et tranches d effectif" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Classification de présence web

**Files:**
- Create: `packages/core/src/web-presence.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/web-presence.test.ts`

**Interfaces:**
- Consumes: `ClassifyInput`, `ProbeResult`, `WebPresenceCategory`
- Produces: `isHealthySite(probe: ProbeResult): boolean`, `classifyWebPresence(input: ClassifyInput): WebPresenceCategory | null`

Rappel du spec, section 5.2 : le mécanisme central est que le champ « site web » d'une fiche Google Maps contient très souvent une URL Facebook. La classification exploite cela directement.

- [ ] **Step 1: Écrire le test qui échoue**

`packages/core/src/web-presence.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { classifyWebPresence, isHealthySite } from './web-presence.js';
import type { ProbeResult } from './types.js';

const healthy: ProbeResult = {
  url: 'https://plomberie-martin.fr',
  reachable: true,
  httpStatus: 200,
  isHttps: true,
  finalUrl: 'https://plomberie-martin.fr/',
  hasViewportMeta: true,
  isParked: false,
};

describe('isHealthySite', () => {
  it('accepte un site joignable, en HTTPS, responsive et non parqué', () => {
    expect(isHealthySite(healthy)).toBe(true);
  });

  it('rejette un site injoignable, en 404, sans HTTPS, parqué ou non responsive', () => {
    expect(isHealthySite({ ...healthy, reachable: false })).toBe(false);
    expect(isHealthySite({ ...healthy, httpStatus: 404 })).toBe(false);
    expect(isHealthySite({ ...healthy, isHttps: false })).toBe(false);
    expect(isHealthySite({ ...healthy, isParked: true })).toBe(false);
    expect(isHealthySite({ ...healthy, hasViewportMeta: false })).toBe(false);
  });
});

describe('classifyWebPresence', () => {
  it('none quand rien n est declare ni trouve', () => {
    expect(classifyWebPresence({ declaredUrl: null, socialUrls: [], probe: null })).toBe('none');
  });

  it('social_only quand l URL declaree est une page Facebook', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://www.facebook.com/plomberiemartin',
        socialUrls: [],
        probe: null,
      }),
    ).toBe('social_only');
  });

  it('social_only quand aucune URL declaree mais un reseau social trouve', () => {
    expect(
      classifyWebPresence({
        declaredUrl: null,
        socialUrls: ['https://instagram.com/plomberiemartin'],
        probe: null,
      }),
    ).toBe('social_only');
  });

  it('directory_only quand l URL declaree est un annuaire', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://www.pagesjaunes.fr/pros/12345',
        socialUrls: [],
        probe: null,
      }),
    ).toBe('directory_only');
  });

  it('dead_site quand le domaine propre repond mal', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://plomberie-martin.fr',
        socialUrls: [],
        probe: { ...healthy, httpStatus: 404 },
      }),
    ).toBe('dead_site');
  });

  it('has_site quand le domaine propre est sain', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://plomberie-martin.fr',
        socialUrls: [],
        probe: healthy,
      }),
    ).toBe('has_site');
  });

  it('renvoie null quand un domaine propre n a pas encore ete sonde', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://plomberie-martin.fr',
        socialUrls: [],
        probe: null,
      }),
    ).toBeNull();
  });

  it('traite une URL illisible comme un domaine propre non sonde', () => {
    expect(
      classifyWebPresence({ declaredUrl: 'pas une url', socialUrls: [], probe: null }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/core test`
Expected: FAIL — `Failed to resolve import "./web-presence.js"`

- [ ] **Step 3: Écrire l'implémentation**

`packages/core/src/web-presence.ts` :
```ts
import type { ClassifyInput, ProbeResult, WebPresenceCategory } from './types.js';

const SOCIAL_DOMAINS = [
  'facebook.com', 'fb.com', 'fb.me', 'm.facebook.com',
  'instagram.com', 'linkedin.com', 'tiktok.com',
];

const DIRECTORY_DOMAINS = [
  'pagesjaunes.fr', 'yelp.com', 'yelp.fr', 'business.site',
  'wixsite.com', 'pages.jaunes.fr', 'solocal.com',
  'houzz.fr', 'starofservice.com', 'travaux.com',
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function matchesDomain(host: string, list: string[]): boolean {
  return list.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Un site est sain s'il est joignable, en HTTPS, responsive et non parqué. */
export function isHealthySite(probe: ProbeResult): boolean {
  if (!probe.reachable) return false;
  if (probe.httpStatus === null || probe.httpStatus < 200 || probe.httpStatus >= 400) return false;
  if (!probe.isHttps) return false;
  if (probe.isParked) return false;
  if (!probe.hasViewportMeta) return false;
  return true;
}

/**
 * Renvoie `null` lorsque la catégorie n'est pas encore déterminable :
 * un domaine propre est déclaré mais n'a pas été sondé. L'appelant doit
 * alors lancer l'étage `probe` avant de reclasser.
 */
export function classifyWebPresence(input: ClassifyInput): WebPresenceCategory | null {
  const { declaredUrl, socialUrls, probe } = input;

  if (declaredUrl === null) {
    return socialUrls.length > 0 ? 'social_only' : 'none';
  }

  const host = hostOf(declaredUrl);
  if (host !== null) {
    if (matchesDomain(host, SOCIAL_DOMAINS)) return 'social_only';
    if (matchesDomain(host, DIRECTORY_DOMAINS)) return 'directory_only';
  }

  if (probe === null) return null;
  return isHealthySite(probe) ? 'has_site' : 'dead_site';
}
```

- [ ] **Step 4: Étendre la surface publique**

Ajouter à `packages/core/src/index.ts` :
```ts
export * from './web-presence.js';
```

- [ ] **Step 5: Lancer les tests**

Run: `pnpm --filter @prospeo/core test`
Expected: PASS — 26 tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: classification de la presence web" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Barème et calcul de score décomposé

**Files:**
- Create: `packages/core/src/scoring.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/scoring.test.ts`

**Interfaces:**
- Consumes: `ScoreInput`, `ScoreLine`, `ScoreResult`, `minHeadcount`
- Produces: `SCORING_RULESET` (constante versionnée), `computeScore(input: ScoreInput, now?: Date): ScoreResult`

- [ ] **Step 1: Écrire le test qui échoue**

`packages/core/src/scoring.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { computeScore, SCORING_RULESET } from './scoring.js';
import type { ScoreInput } from './types.js';

const NOW = new Date('2026-09-01T00:00:00Z');

const base: ScoreInput = {
  category: 'none',
  rating: null,
  reviewCount: null,
  lastSocialPostAt: null,
  effectifCode: null,
  dateCreation: null,
  phoneKind: null,
  isClosed: false,
  isFranchise: false,
};

describe('computeScore', () => {
  it('expose la version du bareme', () => {
    expect(SCORING_RULESET.version).toBe('v1');
    expect(computeScore(base, NOW).rulesetVersion).toBe('v1');
  });

  it('attribue les points de presence web', () => {
    const line = (c: ScoreInput['category']) =>
      computeScore({ ...base, category: c, phoneKind: 'mobile' }, NOW)
        .breakdown.find((l) => l.group === 'presence')?.points;
    expect(line('social_only')).toBe(45);
    expect(line('dead_site')).toBe(40);
    expect(line('none')).toBe(35);
    expect(line('directory_only')).toBe(30);
    expect(line('has_site')).toBe(-100);
  });

  it('borne le total entre 0 et 100', () => {
    expect(computeScore({ ...base, category: 'has_site' }, NOW).total).toBe(0);
    const max = computeScore(
      {
        category: 'social_only',
        rating: 4.8,
        reviewCount: 42,
        lastSocialPostAt: '2026-08-20',
        effectifCode: '02',
        dateCreation: '2016-03-01',
        phoneKind: 'mobile',
        isClosed: false,
        isFranchise: false,
      },
      NOW,
    );
    expect(max.total).toBe(100);
  });

  it('recompense la reputation etablie', () => {
    const r = computeScore({ ...base, rating: 4.6, reviewCount: 23 }, NOW);
    expect(r.breakdown.find((l) => l.code === 'reputation')?.points).toBe(25);
    expect(r.breakdown.find((l) => l.code === 'reviews_volume')).toBeUndefined();
  });

  it('ajoute le volume d avis a partir de 30', () => {
    const r = computeScore({ ...base, rating: 4.6, reviewCount: 30 }, NOW);
    expect(r.breakdown.find((l) => l.code === 'reviews_volume')?.points).toBe(10);
  });

  it('ignore une bonne note avec trop peu d avis', () => {
    const r = computeScore({ ...base, rating: 4.9, reviewCount: 3 }, NOW);
    expect(r.breakdown.find((l) => l.code === 'reputation')).toBeUndefined();
  });

  it('recompense une activite sociale de moins de 90 jours', () => {
    expect(
      computeScore({ ...base, lastSocialPostAt: '2026-08-20' }, NOW)
        .breakdown.find((l) => l.code === 'social_fresh')?.points,
    ).toBe(15);
    expect(
      computeScore({ ...base, lastSocialPostAt: '2026-01-10' }, NOW)
        .breakdown.find((l) => l.code === 'social_fresh'),
    ).toBeUndefined();
  });

  it('traite l anciennete comme une fenetre de 3 a 20 ans', () => {
    const age = (d: string) =>
      computeScore({ ...base, dateCreation: d }, NOW).breakdown.find((l) => l.code === 'age');
    expect(age('2016-03-01')?.points).toBe(10);
    expect(age('2024-06-01')).toBeUndefined();
    expect(age('1995-01-01')).toBeUndefined();
  });

  it('recompense un effectif d au moins 3', () => {
    expect(
      computeScore({ ...base, effectifCode: '02' }, NOW).breakdown.find((l) => l.code === 'staff')
        ?.points,
    ).toBe(10);
    expect(
      computeScore({ ...base, effectifCode: '01' }, NOW).breakdown.find((l) => l.code === 'staff'),
    ).toBeUndefined();
  });

  it('note la joignabilite, y compris negativement', () => {
    const pts = (k: ScoreInput['phoneKind']) =>
      computeScore({ ...base, phoneKind: k }, NOW).breakdown.find((l) => l.group === 'joignabilite')
        ?.points;
    expect(pts('mobile')).toBe(20);
    expect(pts('landline')).toBe(10);
    expect(pts(null)).toBe(-25);
  });

  it('penalise une franchise', () => {
    expect(
      computeScore({ ...base, isFranchise: true }, NOW).breakdown.find(
        (l) => l.code === 'franchise',
      )?.points,
    ).toBe(-30);
  });

  it('disqualifie un etablissement ferme, sans autre ligne', () => {
    const r = computeScore({ ...base, category: 'social_only', isClosed: true }, NOW);
    expect(r.total).toBe(0);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0]?.code).toBe('closed');
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/core test`
Expected: FAIL — `Failed to resolve import "./scoring.js"`

- [ ] **Step 3: Écrire l'implémentation**

`packages/core/src/scoring.ts` :
```ts
import { minHeadcount } from './effectif.js';
import type { ScoreInput, ScoreLine, ScoreResult, WebPresenceCategory } from './types.js';

/**
 * Barème versionné. Modifier ces valeurs impose d'incrémenter `version`,
 * puis de rejouer l'étage `score` — l'opération est pure et gratuite.
 */
const PRESENCE_POINTS: Record<WebPresenceCategory, number> = {
  social_only: 45,
  dead_site: 40,
  none: 35,
  directory_only: 30,
  has_site: -100,
};

export const SCORING_RULESET = {
  version: 'v1',
  presence: PRESENCE_POINTS,
  reputation: { minRating: 4, minReviews: 10, points: 25 },
  reviewsVolume: { minReviews: 30, points: 10 },
  socialFresh: { maxAgeDays: 90, points: 15 },
  staff: { minHeadcount: 3, points: 10 },
  age: { minYears: 3, maxYears: 20, points: 10 },
  phone: { mobile: 20, landline: 10, none: -25 },
  franchise: -30,
} as const;

const PRESENCE_LABELS: Record<WebPresenceCategory, string> = {
  social_only: 'Page sociale, aucun site',
  dead_site: 'Site en panne ou obsolète',
  none: 'Aucune présence web',
  directory_only: 'Fiche annuaire uniquement',
  has_site: 'Site correct et vivant',
};

function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000);
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (24 * 3600 * 1000);
}

function parseDate(iso: string | null): Date | null {
  if (iso === null) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeScore(input: ScoreInput, now: Date = new Date()): ScoreResult {
  const R = SCORING_RULESET;

  if (input.isClosed) {
    return {
      total: 0,
      rulesetVersion: R.version,
      breakdown: [
        { code: 'closed', label: 'Établissement cessé', points: 0, group: 'disqualifiant' },
      ],
    };
  }

  const lines: ScoreLine[] = [
    {
      code: `presence_${input.category}`,
      label: PRESENCE_LABELS[input.category],
      points: R.presence[input.category],
      group: 'presence',
    },
  ];

  if (
    input.rating !== null &&
    input.reviewCount !== null &&
    input.rating >= R.reputation.minRating &&
    input.reviewCount >= R.reputation.minReviews
  ) {
    lines.push({
      code: 'reputation',
      label: `${input.rating.toFixed(1)} ★ sur ${input.reviewCount} avis`,
      points: R.reputation.points,
      group: 'vitalite',
    });
  }

  if (input.reviewCount !== null && input.reviewCount >= R.reviewsVolume.minReviews) {
    lines.push({
      code: 'reviews_volume',
      label: `${input.reviewCount} avis`,
      points: R.reviewsVolume.points,
      group: 'vitalite',
    });
  }

  const lastPost = parseDate(input.lastSocialPostAt);
  if (lastPost !== null) {
    // Borne basse indispensable : sans elle une date future satisfait `<= 90`
    // et produit un libelle absurde (« il y a -12 j »).
    const postAge = daysBetween(lastPost, now);
    if (postAge >= 0 && postAge <= R.socialFresh.maxAgeDays) {
      lines.push({
        code: 'social_fresh',
        label: `Publication il y a ${Math.round(postAge)} j`,
        points: R.socialFresh.points,
        group: 'vitalite',
      });
    }
  }

  const headcount = minHeadcount(input.effectifCode);
  if (headcount !== null && headcount >= R.staff.minHeadcount) {
    lines.push({
      code: 'staff',
      label: `Au moins ${headcount} salariés`,
      points: R.staff.points,
      group: 'vitalite',
    });
  }

  const created = parseDate(input.dateCreation);
  if (created !== null) {
    const age = yearsBetween(created, now);
    if (age >= R.age.minYears && age <= R.age.maxYears) {
      lines.push({
        code: 'age',
        label: `Créée il y a ${Math.floor(age)} ans`,
        points: R.age.points,
        group: 'vitalite',
      });
    }
  }

  if (input.phoneKind === 'mobile') {
    lines.push({ code: 'phone_mobile', label: 'Mobile trouvé', points: R.phone.mobile, group: 'joignabilite' });
  } else if (input.phoneKind === 'landline') {
    lines.push({ code: 'phone_landline', label: 'Fixe uniquement', points: R.phone.landline, group: 'joignabilite' });
  } else {
    lines.push({ code: 'phone_none', label: 'Aucun téléphone', points: R.phone.none, group: 'joignabilite' });
  }

  if (input.isFranchise) {
    lines.push({ code: 'franchise', label: 'Enseigne de réseau', points: R.franchise, group: 'disqualifiant' });
  }

  const raw = lines.reduce((sum, line) => sum + line.points, 0);
  return { total: Math.max(0, Math.min(100, raw)), breakdown: lines, rulesetVersion: R.version };
}
```

- [ ] **Step 4: Étendre la surface publique**

Ajouter à `packages/core/src/index.ts` :
```ts
export * from './scoring.js';
```

- [ ] **Step 5: Lancer les tests et le typecheck**

Run: `pnpm --filter @prospeo/core test && pnpm --filter @prospeo/core typecheck`
Expected: PASS — 39 tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: bareme versionne et score decompose" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Schéma de base et RLS

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/migrations/0001_init.sql`
- Create: `packages/db/README.md`

**Interfaces:**
- Consumes: rien
- Produces: tables `prospect`, `prospect_enrichment`, `web_presence`, `prospect_score`, `prospect_pipeline`, `interaction`, `generated_message`

RLS activée dès cette migration : la clé anonyme du dashboard part dans le bundle JavaScript, donc sans politiques la base serait lisible publiquement.

- [ ] **Step 1: Créer le paquet**

`packages/db/package.json` :
```json
{
  "name": "@prospeo/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "echo 'no tests' && exit 0",
    "typecheck": "echo 'no types' && exit 0"
  }
}
```

- [ ] **Step 2: Écrire la migration**

`packages/db/migrations/0001_init.sql` :
```sql
-- Prospeo — schéma initial du socle de prospection.

create type web_presence_category as enum
  ('none', 'social_only', 'directory_only', 'dead_site', 'has_site');

create type enrichment_status as enum ('ok', 'not_found', 'ambiguous', 'blocked');

create type pipeline_status as enum
  ('a_contacter', 'contacte', 'relance', 'interesse', 'gagne', 'perdu', 'ne_pas_contacter');

create type interaction_kind as enum ('appel', 'whatsapp', 'email', 'note');

create table prospect (
  id                          uuid primary key default gen_random_uuid(),
  siret                       text not null unique,
  siren                       text not null,
  trade_slug                  text not null,
  denomination                text not null,
  denomination_usuelle        text,
  naf_code                    text,
  address                     text not null,
  postal_code                 text not null,
  city                        text not null,
  latitude                    double precision,
  longitude                   double precision,
  date_creation               date,
  effectif_code               text,
  is_entrepreneur_individuel  boolean not null default false,
  is_head_office              boolean not null default false,
  discovered_at               timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index prospect_trade_idx on prospect (trade_slug);
create index prospect_city_idx  on prospect (postal_code, city);

create table prospect_enrichment (
  prospect_id       uuid primary key references prospect (id) on delete cascade,
  source            text not null,
  matched_name      text,
  match_confidence  real,
  phone_e164        text,
  phone_kind        text,
  declared_url      text,
  social_urls       jsonb not null default '[]'::jsonb,
  rating            real,
  review_count      integer,
  place_id          text,
  maps_url          text,
  screenshot_paths  jsonb not null default '[]'::jsonb,
  status            enrichment_status not null,
  enriched_at       timestamptz not null default now()
);

create table web_presence (
  prospect_id        uuid primary key references prospect (id) on delete cascade,
  -- Nullable : `probe` s'exécute avant `classify`, qui seul détermine la catégorie.
  category           web_presence_category,
  probed_url         text,
  http_status        integer,
  is_https           boolean,
  final_url          text,
  is_parked          boolean,
  has_viewport_meta  boolean,
  last_social_post_at date,
  domain_available   boolean,
  domain_candidates  jsonb not null default '[]'::jsonb,
  probed_at          timestamptz not null default now()
);

create table prospect_score (
  prospect_id      uuid primary key references prospect (id) on delete cascade,
  total            integer not null,
  breakdown        jsonb not null,
  ruleset_version  text not null,
  computed_at      timestamptz not null default now()
);

create index prospect_score_total_idx on prospect_score (total desc);

create table prospect_pipeline (
  prospect_id     uuid primary key references prospect (id) on delete cascade,
  status          pipeline_status not null default 'a_contacter',
  next_action_at  date,
  updated_at      timestamptz not null default now()
);

create index prospect_pipeline_next_idx on prospect_pipeline (next_action_at);

create table interaction (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references prospect (id) on delete cascade,
  kind         interaction_kind not null,
  body         text,
  occurred_at  timestamptz not null default now()
);

create index interaction_prospect_idx on interaction (prospect_id, occurred_at desc);

create table generated_message (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid not null references prospect (id) on delete cascade,
  channel         text not null,
  model           text not null,
  prompt_version  text not null,
  content         text not null,
  created_at      timestamptz not null default now()
);

-- RLS : obligatoire, la clé anonyme est publique par construction.
-- La clé service_role du collector contourne RLS nativement.
alter table prospect            enable row level security;
alter table prospect_enrichment enable row level security;
alter table web_presence        enable row level security;
alter table prospect_score      enable row level security;
alter table prospect_pipeline   enable row level security;
alter table interaction         enable row level security;
alter table generated_message   enable row level security;

create policy authenticated_all on prospect            for all to authenticated using (true) with check (true);
create policy authenticated_all on prospect_enrichment for all to authenticated using (true) with check (true);
create policy authenticated_all on web_presence        for all to authenticated using (true) with check (true);
create policy authenticated_all on prospect_score      for all to authenticated using (true) with check (true);
create policy authenticated_all on prospect_pipeline   for all to authenticated using (true) with check (true);
create policy authenticated_all on interaction         for all to authenticated using (true) with check (true);
create policy authenticated_all on generated_message   for all to authenticated using (true) with check (true);
```

- [ ] **Step 3: Documenter l'application de la migration**

`packages/db/README.md` :
```markdown
# @prospeo/db

Schéma Postgres du socle de prospection.

## Appliquer la migration

Dans le SQL Editor du projet Supabase, coller le contenu de
`migrations/0001_init.sql` et exécuter.

## Variables d'environnement

| Variable | Usage |
|---|---|
| `SUPABASE_URL` | URL du projet |
| `SUPABASE_SERVICE_ROLE_KEY` | collector uniquement — jamais dans le front |
| `VITE_SUPABASE_ANON_KEY` | dashboard — publique, protégée par RLS |

## RLS

Activée sur toutes les tables. La clé anonyme du dashboard est publique :
sans politiques, la base serait lisible par quiconque connaît l'URL.
```

- [ ] **Step 4: Vérifier que la migration s'applique**

Appliquer `migrations/0001_init.sql` dans le SQL Editor Supabase.
Expected: `Success. No rows returned`, et 7 tables visibles dans Table Editor.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: schema postgres et politiques RLS" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Squelette du collector

**Files:**
- Create: `apps/collector/package.json`, `apps/collector/tsconfig.json`, `apps/collector/vitest.config.ts`
- Create: `apps/collector/src/config.ts`
- Create: `apps/collector/src/supabase.ts`
- Create: `apps/collector/src/cli.ts`
- Create: `.env.example`
- Test: `apps/collector/src/config.test.ts`

**Interfaces:**
- Consumes: rien
- Produces: `loadConfig(env: NodeJS.ProcessEnv): Config`, `createClient(config: Config)`

- [ ] **Step 1: Créer le paquet**

`apps/collector/package.json` :
```json
{
  "name": "@prospeo/collector",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "prospeo": "./src/cli.ts" },
  "scripts": {
    "start": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@prospeo/core": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "undici": "^6.19.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "tsx": "^4.19.0"
  }
}
```

`apps/collector/tsconfig.json` :
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src"]
}
```

`apps/collector/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

`.env.example` (le fichier existe deja a la racine, cree en amont) :
```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
```

Puis : `pnpm install`

- [ ] **Step 2: Écrire le test qui échoue**

`apps/collector/src/config.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('lit une configuration complete', () => {
    const config = loadConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    });
    expect(config.supabaseUrl).toBe('https://x.supabase.co');
    expect(config.supabaseServiceRoleKey).toBe('secret');
  });

  it('echoue avec un message explicite si une variable manque', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it('refuse une URL invalide', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'pas-une-url', SUPABASE_SERVICE_ROLE_KEY: 'k' })).toThrow();
  });
});
```

- [ ] **Step 3: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/collector test`
Expected: FAIL — `Failed to resolve import "./config.js"`

- [ ] **Step 4: Écrire la configuration**

`apps/collector/src/config.ts` :
```ts
import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export interface Config {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuration invalide ou incomplète : ${missing}`);
  }
  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}
```

- [ ] **Step 5: Écrire le client Supabase**

`apps/collector/src/supabase.ts` :
```ts
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config.js';

/** Client en service_role : contourne RLS. Ne jamais exposer cette clé au front. */
export function createClient(config: Config): SupabaseClient {
  return createSupabaseClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 6: Écrire le point d'entrée CLI**

`apps/collector/src/cli.ts` :
```ts
import { loadConfig } from './config.js';

const USAGE = `
prospeo <commande> [options]

Commandes
  discover --trade <slug> --postal-code <cp>   Ingère les établissements Sirene
  probe                                        Sonde les URL déclarées
  score                                        Classe et note les prospects

Options
  --limit <n>   Plafond d'enregistrements traités
`;

/** Commandes reconnues. Les etages sont branches par les taches 9 a 11. */
const COMMANDS = ['discover', 'probe', 'score'] as const;

async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  // La commande est validee AVANT le chargement de la configuration : sinon une
  // simple faute de frappe repond « configuration invalide », ce qui envoie
  // chercher un probleme qui n'existe pas.
  if (!(COMMANDS as readonly string[]).includes(command)) {
    process.stderr.write(`Commande inconnue : ${command}\n${USAGE}`);
    return 1;
  }

  const config = loadConfig(process.env);

  switch (command) {
    default:
      process.stderr.write(`Commande non encore implementee : ${command}\n`);
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    // `exitCode` et non `process.exit()` : Node termine alors apres avoir vide
    // ses tampons de sortie. Un exit immediat peut tronquer stdout/stderr quand
    // la sortie part dans un tube, cas courant sous Windows.
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
```

- [ ] **Step 7: Lancer les tests et vérifier l'aide**

Run: `pnpm --filter @prospeo/collector test`
Expected: PASS — 3 tests

Run: `pnpm --filter @prospeo/collector start --help`
Expected: l'usage s'affiche, code de sortie 0

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: squelette du collector et configuration" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Client de l'API Recherche d'entreprises

**Files:**
- Create: `apps/collector/src/sources/recherche-entreprises.ts`
- Create: `apps/collector/src/sources/fixtures/search-43-22A.json`
- Test: `apps/collector/src/sources/recherche-entreprises.test.ts`

**Interfaces:**
- Consumes: `RawEstablishment`, `Trade` de `@prospeo/core`
- Produces: `mapSearchResponse(json: unknown, trade: Trade): RawEstablishment[]`, `searchEstablishments(opts): AsyncIterable<RawEstablishment>`

Comportements vérifiés sur l'API réelle, à respecter impérativement :

| Fait | Conséquence |
|---|---|
| `activite_principale` filtre l'**entreprise**, `code_postal` filtre l'**établissement** | lire `matching_etablissements`, jamais `siege` |
| Des établissements fermés sont renvoyés (`etat_administratif: 'F'`) | filtrer sur `'A'` |
| `per_page` est plafonné à 25 | pagination obligatoire |
| `statut_diffusion` et `statut_diffusion_etablissement` existent | exclusion légale des non-diffusibles |

- [ ] **Step 1: Créer la fixture**

`apps/collector/src/sources/fixtures/search-43-22A.json` :
```json
{
  "results": [
    {
      "siren": "111111111",
      "nom_complet": "SARL PLOMBERIE MARTIN",
      "nom_raison_sociale": "PLOMBERIE MARTIN",
      "statut_diffusion": "O",
      "date_creation": "2016-03-01",
      "tranche_effectif_salarie": "02",
      "complements": { "est_entrepreneur_individuel": false },
      "matching_etablissements": [
        {
          "siret": "11111111100017",
          "adresse": "12 RUE DE LA PAIX 44000 NANTES",
          "code_postal": "44000",
          "libelle_commune": "NANTES",
          "latitude": "47.2184",
          "longitude": "-1.5536",
          "activite_principale": "43.22A",
          "etat_administratif": "A",
          "statut_diffusion_etablissement": "O",
          "est_siege": true,
          "nom_commercial": "Plomberie Martin",
          "liste_enseignes": ["PLOMBERIE MARTIN"]
        }
      ]
    },
    {
      "siren": "222222222",
      "nom_complet": "PLOMBERIE FERMEE",
      "nom_raison_sociale": "PLOMBERIE FERMEE",
      "statut_diffusion": "O",
      "date_creation": "2010-01-01",
      "tranche_effectif_salarie": "NN",
      "complements": { "est_entrepreneur_individuel": true },
      "matching_etablissements": [
        {
          "siret": "22222222200011",
          "adresse": "5 RUE MORTE 44000 NANTES",
          "code_postal": "44000",
          "libelle_commune": "NANTES",
          "latitude": "47.21",
          "longitude": "-1.55",
          "activite_principale": "43.22A",
          "etat_administratif": "F",
          "statut_diffusion_etablissement": "O",
          "est_siege": true,
          "nom_commercial": null,
          "liste_enseignes": null
        }
      ]
    },
    {
      "siren": "333333333",
      "nom_complet": "PLOMBERIE MASQUEE",
      "nom_raison_sociale": "PLOMBERIE MASQUEE",
      "statut_diffusion": "P",
      "date_creation": "2012-01-01",
      "tranche_effectif_salarie": "01",
      "complements": { "est_entrepreneur_individuel": true },
      "matching_etablissements": [
        {
          "siret": "33333333300019",
          "adresse": "1 RUE SECRETE 44000 NANTES",
          "code_postal": "44000",
          "libelle_commune": "NANTES",
          "latitude": "47.22",
          "longitude": "-1.56",
          "activite_principale": "43.22A",
          "etat_administratif": "A",
          "statut_diffusion_etablissement": "O",
          "est_siege": true,
          "nom_commercial": null,
          "liste_enseignes": null
        }
      ]
    },
    {
      "siren": "444444444",
      "nom_complet": "ETS DIFFUSION ETAB MASQUEE",
      "nom_raison_sociale": "ETS DIFFUSION ETAB MASQUEE",
      "statut_diffusion": "O",
      "date_creation": "2014-01-01",
      "tranche_effectif_salarie": "01",
      "complements": { "est_entrepreneur_individuel": false },
      "matching_etablissements": [
        {
          "siret": "44444444400015",
          "adresse": "9 RUE CACHEE 44000 NANTES",
          "code_postal": "44000",
          "libelle_commune": "NANTES",
          "latitude": "47.23",
          "longitude": "-1.57",
          "activite_principale": "43.22A",
          "etat_administratif": "A",
          "statut_diffusion_etablissement": "N",
          "est_siege": true,
          "nom_commercial": null,
          "liste_enseignes": null
        }
      ]
    }
  ],
  "total_results": 4,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

- [ ] **Step 2: Écrire le test qui échoue**

`apps/collector/src/sources/recherche-entreprises.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTrade } from '@prospeo/core';
import { mapSearchResponse } from './recherche-entreprises.js';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/search-43-22A.json', import.meta.url)), 'utf8'),
) as unknown;

const plombier = getTrade('plombier')!;

describe('mapSearchResponse', () => {
  it('ne retient que l etablissement actif et diffusible', () => {
    const rows = mapSearchResponse(fixture, plombier);
    expect(rows.map((r) => r.siret)).toEqual(['11111111100017']);
  });

  it('mappe les champs du prospect', () => {
    const row = mapSearchResponse(fixture, plombier)[0]!;
    expect(row).toMatchObject({
      siret: '11111111100017',
      siren: '111111111',
      tradeSlug: 'plombier',
      denomination: 'SARL PLOMBERIE MARTIN',
      denominationUsuelle: 'Plomberie Martin',
      nafCode: '43.22A',
      postalCode: '44000',
      city: 'NANTES',
      dateCreation: '2016-03-01',
      effectifCode: '02',
      isEntrepreneurIndividuel: false,
      isHeadOffice: true,
    });
    expect(row.latitude).toBeCloseTo(47.2184, 4);
    expect(row.longitude).toBeCloseTo(-1.5536, 4);
  });

  it('exclut les entreprises non diffusibles', () => {
    const sirets = mapSearchResponse(fixture, plombier).map((r) => r.siret);
    expect(sirets).not.toContain('33333333300019');
  });

  it('exclut les etablissements non diffusibles', () => {
    const sirets = mapSearchResponse(fixture, plombier).map((r) => r.siret);
    expect(sirets).not.toContain('44444444400015');
  });

  it('exclut les etablissements fermes', () => {
    const sirets = mapSearchResponse(fixture, plombier).map((r) => r.siret);
    expect(sirets).not.toContain('22222222200011');
  });

  it('tolere une reponse vide sans lever', () => {
    expect(mapSearchResponse({ results: [] }, plombier)).toEqual([]);
    expect(mapSearchResponse({}, plombier)).toEqual([]);
  });
});
```

- [ ] **Step 3: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/collector test`
Expected: FAIL — `Failed to resolve import "./recherche-entreprises.js"`

- [ ] **Step 4: Écrire l'implémentation**

`apps/collector/src/sources/recherche-entreprises.ts` :
```ts
import { request } from 'undici';
import type { RawEstablishment, Trade } from '@prospeo/core';

const BASE_URL = 'https://recherche-entreprises.api.gouv.fr/search';
/** Plafond imposé par l'API. */
const MAX_PER_PAGE = 25;

interface Etablissement {
  siret?: unknown;
  adresse?: unknown;
  code_postal?: unknown;
  libelle_commune?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  activite_principale?: unknown;
  etat_administratif?: unknown;
  statut_diffusion_etablissement?: unknown;
  est_siege?: unknown;
  nom_commercial?: unknown;
  liste_enseignes?: unknown;
}

interface Entreprise {
  siren?: unknown;
  nom_complet?: unknown;
  statut_diffusion?: unknown;
  date_creation?: unknown;
  tranche_effectif_salarie?: unknown;
  complements?: { est_entrepreneur_individuel?: unknown } | null;
  matching_etablissements?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * L'API filtre `activite_principale` au niveau de l'entreprise et
 * `code_postal` au niveau de l'établissement : la vérité territoriale se
 * trouve dans `matching_etablissements`, jamais dans `siege`.
 */
export function mapSearchResponse(json: unknown, trade: Trade): RawEstablishment[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];

  const rows: RawEstablishment[] = [];

  for (const raw of results as Entreprise[]) {
    if (str(raw.statut_diffusion) !== 'O') continue;

    const siren = str(raw.siren);
    const denomination = str(raw.nom_complet);
    if (siren === null || denomination === null) continue;

    const etablissements = Array.isArray(raw.matching_etablissements)
      ? (raw.matching_etablissements as Etablissement[])
      : [];

    for (const etab of etablissements) {
      if (str(etab.etat_administratif) !== 'A') continue;
      if (str(etab.statut_diffusion_etablissement) !== 'O') continue;

      const siret = str(etab.siret);
      const address = str(etab.adresse);
      const postalCode = str(etab.code_postal);
      const city = str(etab.libelle_commune);
      if (siret === null || address === null || postalCode === null || city === null) continue;

      const enseignes = Array.isArray(etab.liste_enseignes) ? etab.liste_enseignes : [];
      const usuelle = str(etab.nom_commercial) ?? str(enseignes[0]);

      rows.push({
        siret,
        siren,
        tradeSlug: trade.slug,
        denomination,
        denominationUsuelle: usuelle,
        nafCode: str(etab.activite_principale),
        address,
        postalCode,
        city,
        latitude: num(etab.latitude),
        longitude: num(etab.longitude),
        dateCreation: str(raw.date_creation),
        effectifCode: str(raw.tranche_effectif_salarie),
        isEntrepreneurIndividuel: raw.complements?.est_entrepreneur_individuel === true,
        isHeadOffice: etab.est_siege === true,
      });
    }
  }

  return rows;
}

export interface SearchOptions {
  trade: Trade;
  postalCode: string;
  /** Injecté dans les tests. */
  fetchPage?: (url: string) => Promise<unknown>;
}

async function defaultFetchPage(url: string): Promise<unknown> {
  const response = await request(url, { headers: { accept: 'application/json' } });
  if (response.statusCode !== 200) {
    throw new Error(`API Recherche d'entreprises : HTTP ${response.statusCode}`);
  }
  return response.body.json();
}

/** Itère toutes les pages pour un métier et un code postal. */
export async function* searchEstablishments(
  options: SearchOptions,
): AsyncIterable<RawEstablishment> {
  const fetchPage = options.fetchPage ?? defaultFetchPage;
  const naf = options.trade.nafCodes.join(',');

  let page = 1;
  let totalPages: number | null = null;

  while (totalPages === null || page <= totalPages) {
    const url =
      `${BASE_URL}?activite_principale=${encodeURIComponent(naf)}` +
      `&code_postal=${encodeURIComponent(options.postalCode)}` +
      `&page=${page}&per_page=${MAX_PER_PAGE}`;

    const json = await fetchPage(url);

    if (totalPages === null) {
      // Le nombre de pages est arrete par la PREMIERE reponse et n'est plus
      // reevalue. Le reevaluer a chaque page ferait qu'une reponse intermediaire
      // malformee reduirait la borne et tronquerait la collecte en silence.
      const meta = json as { total_pages?: unknown };
      if (typeof meta.total_pages !== 'number' || !Number.isFinite(meta.total_pages)) {
        throw new Error(
          "API Recherche d'entreprises : total_pages absent ou invalide sur la premiere page",
        );
      }
      totalPages = meta.total_pages;
    }

    for (const row of mapSearchResponse(json, options.trade)) yield row;
    page += 1;
  }
}
```

- [ ] **Step 5: Lancer les tests**

Run: `pnpm --filter @prospeo/collector test`
Expected: PASS — 9 tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: client API Recherche d entreprises avec filtrage legal" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Étage discover

**Files:**
- Create: `apps/collector/src/stages/discover.ts`
- Modify: `apps/collector/src/cli.ts`
- Test: `apps/collector/src/stages/discover.test.ts`

**Interfaces:**
- Consumes: `searchEstablishments`, `RawEstablishment`
- Produces: `runDiscover(deps: DiscoverDeps): Promise<DiscoverReport>` avec `DiscoverReport = { seen: number; upserted: number }`

- [ ] **Step 1: Écrire le test qui échoue**

`apps/collector/src/stages/discover.test.ts` :
```ts
import { describe, expect, it, vi } from 'vitest';
import { getTrade, type RawEstablishment } from '@prospeo/core';
import { runDiscover } from './discover.js';

const row = (siret: string): RawEstablishment => ({
  siret,
  siren: siret.slice(0, 9),
  tradeSlug: 'plombier',
  denomination: 'PLOMBERIE MARTIN',
  denominationUsuelle: null,
  nafCode: '43.22A',
  address: '12 RUE DE LA PAIX 44000 NANTES',
  postalCode: '44000',
  city: 'NANTES',
  latitude: 47.2,
  longitude: -1.5,
  dateCreation: '2016-03-01',
  effectifCode: '02',
  isEntrepreneurIndividuel: false,
  isHeadOffice: true,
});

describe('runDiscover', () => {
  it('ecrit un prospect a la fois et rend un rapport', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const report = await runDiscover({
      trade: getTrade('plombier')!,
      postalCode: '44000',
      source: async function* () {
        yield row('11111111100017');
        yield row('22222222200011');
      },
      upsertProspect: upsert,
    });

    expect(report).toEqual({ seen: 2, upserted: 2 });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]?.[0]?.siret).toBe('11111111100017');
  });

  it('respecte le plafond de limit', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const report = await runDiscover({
      trade: getTrade('plombier')!,
      postalCode: '44000',
      limit: 1,
      source: async function* () {
        yield row('11111111100017');
        yield row('22222222200011');
      },
      upsertProspect: upsert,
    });

    expect(report).toEqual({ seen: 1, upserted: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('poursuit apres l echec d un enregistrement isole', async () => {
    const upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error('conflit'))
      .mockResolvedValue(undefined);

    const report = await runDiscover({
      trade: getTrade('plombier')!,
      postalCode: '44000',
      source: async function* () {
        yield row('11111111100017');
        yield row('22222222200011');
      },
      upsertProspect: upsert,
    });

    expect(report).toEqual({ seen: 2, upserted: 1 });
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/collector test`
Expected: FAIL — `Failed to resolve import "./discover.js"`

- [ ] **Step 3: Écrire l'implémentation**

`apps/collector/src/stages/discover.ts` :
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RawEstablishment, Trade } from '@prospeo/core';
import { searchEstablishments } from '../sources/recherche-entreprises.js';

export interface DiscoverReport {
  seen: number;
  upserted: number;
}

export interface DiscoverDeps {
  trade: Trade;
  postalCode: string;
  limit?: number;
  source?: () => AsyncIterable<RawEstablishment>;
  upsertProspect: (row: RawEstablishment) => Promise<void>;
}

/**
 * Idempotent : l'upsert se fait sur le SIRET, rejouer la commande ne duplique
 * rien. L'écriture est unitaire, un échec isolé ne compromet pas le reste.
 */
export async function runDiscover(deps: DiscoverDeps): Promise<DiscoverReport> {
  const iterate =
    deps.source ?? (() => searchEstablishments({ trade: deps.trade, postalCode: deps.postalCode }));

  let seen = 0;
  let upserted = 0;

  for await (const row of iterate()) {
    if (deps.limit !== undefined && seen >= deps.limit) break;
    seen += 1;
    try {
      await deps.upsertProspect(row);
      upserted += 1;
    } catch (error) {
      process.stderr.write(
        `discover: échec sur ${row.siret} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return { seen, upserted };
}

/** Écriture Supabase, séparée pour rester testable sans réseau. */
export function makeUpsertProspect(client: SupabaseClient) {
  return async (row: RawEstablishment): Promise<void> => {
    const { error } = await client.from('prospect').upsert(
      {
        siret: row.siret,
        siren: row.siren,
        trade_slug: row.tradeSlug,
        denomination: row.denomination,
        denomination_usuelle: row.denominationUsuelle,
        naf_code: row.nafCode,
        address: row.address,
        postal_code: row.postalCode,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
        date_creation: row.dateCreation,
        effectif_code: row.effectifCode,
        is_entrepreneur_individuel: row.isEntrepreneurIndividuel,
        is_head_office: row.isHeadOffice,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'siret' },
    );
    if (error) throw new Error(error.message);
  };
}
```

- [ ] **Step 4: Brancher la commande dans le CLI**

Remplacer le `switch` de `apps/collector/src/cli.ts` :
```ts
import { getTrade } from '@prospeo/core';
import { loadConfig } from './config.js';
import { createClient } from './supabase.js';
import { makeUpsertProspect, runDiscover } from './stages/discover.js';

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}
```

et le corps du `switch` :
```ts
    case 'discover': {
      const slug = flag(argv, 'trade');
      const postalCode = flag(argv, 'postal-code');
      if (slug === undefined || postalCode === undefined) {
        process.stderr.write('discover exige --trade et --postal-code\n');
        return 1;
      }
      const trade = getTrade(slug);
      if (trade === undefined) {
        process.stderr.write(`Métier inconnu : ${slug}\n`);
        return 1;
      }
      const limitRaw = flag(argv, 'limit');
      const client = createClient(config);
      const report = await runDiscover({
        trade,
        postalCode,
        limit: limitRaw === undefined ? undefined : Number.parseInt(limitRaw, 10),
        upsertProspect: makeUpsertProspect(client),
      });
      process.stdout.write(
        `discover ${trade.slug} ${postalCode} : ${report.upserted}/${report.seen} enregistrés\n`,
      );
      return 0;
    }
```

- [ ] **Step 5: Lancer les tests**

Run: `pnpm --filter @prospeo/collector test`
Expected: PASS — 12 tests

- [ ] **Step 6: Vérifier en conditions réelles**

Renseigner `.env` à partir de `.env.example`, puis :

Run: `pnpm --filter @prospeo/collector start discover --trade plombier --postal-code 44000 --limit 20`
Expected: `discover plombier 44000 : 20/20 enregistrés`

Relancer la même commande.
Expected: le même message, et **aucun doublon** dans la table `prospect` (`select count(*) from prospect;` reste stable).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: etage discover idempotent" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Étage probe

**Files:**
- Create: `apps/collector/src/stages/probe.ts`
- Modify: `apps/collector/src/cli.ts`
- Test: `apps/collector/src/stages/probe.test.ts`

**Interfaces:**
- Consumes: `ProbeResult` de `@prospeo/core`
- Produces: `detectParked(html: string): boolean`, `hasViewport(html: string): boolean`, `probeUrl(url, fetchImpl): Promise<ProbeResult>`, `domainCandidates(denomination: string): string[]`

- [ ] **Step 1: Écrire le test qui échoue**

`apps/collector/src/stages/probe.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { detectParked, domainCandidates, hasViewport, probeUrl } from './probe.js';

describe('hasViewport', () => {
  it('detecte la balise viewport', () => {
    expect(hasViewport('<meta name="viewport" content="width=device-width">')).toBe(true);
    expect(hasViewport("<META NAME='VIEWPORT' CONTENT='width=device-width'>")).toBe(true);
    expect(hasViewport('<html><body>rien</body></html>')).toBe(false);
  });
});

describe('detectParked', () => {
  it('repere les pages parquees', () => {
    expect(detectParked('<title>Ce domaine est à vendre</title>')).toBe(true);
    expect(detectParked('<p>This domain is for sale</p>')).toBe(true);
    expect(detectParked('<p>Site en construction</p>')).toBe(true);
    expect(detectParked('<h1>Plomberie Martin, dépannage 24h/24</h1>')).toBe(false);
  });
});

describe('probeUrl', () => {
  it('rend un verdict complet pour un site sain', async () => {
    const result = await probeUrl('https://plomberie-martin.fr', async () => ({
      status: 200,
      finalUrl: 'https://plomberie-martin.fr/',
      body: '<meta name="viewport" content="width=device-width"><h1>Plomberie</h1>',
    }));
    expect(result).toEqual({
      url: 'https://plomberie-martin.fr',
      reachable: true,
      httpStatus: 200,
      isHttps: true,
      finalUrl: 'https://plomberie-martin.fr/',
      hasViewportMeta: true,
      isParked: false,
    });
  });

  it('marque injoignable sans lever quand la requete echoue', async () => {
    const result = await probeUrl('https://mort.fr', async () => {
      throw new Error('ENOTFOUND');
    });
    expect(result.reachable).toBe(false);
    expect(result.httpStatus).toBeNull();
  });

  it('detecte l absence de HTTPS depuis l URL finale', async () => {
    const result = await probeUrl('http://vieux.fr', async () => ({
      status: 200,
      finalUrl: 'http://vieux.fr/',
      body: '<html></html>',
    }));
    expect(result.isHttps).toBe(false);
  });
});

describe('domainCandidates', () => {
  it('propose des variantes en .fr a partir de la raison sociale', () => {
    expect(domainCandidates('SARL PLOMBERIE MARTIN')).toEqual([
      'plomberie-martin.fr',
      'plomberiemartin.fr',
      'martin-plomberie.fr',
    ]);
  });

  it('renvoie une liste vide pour un nom d un seul mot', () => {
    expect(domainCandidates('MARTIN')).toEqual(['martin.fr']);
  });

  it('tolere un nom vide', () => {
    expect(domainCandidates('SARL')).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/collector test`
Expected: FAIL — `Failed to resolve import "./probe.js"`

- [ ] **Step 3: Écrire l'implémentation**

`apps/collector/src/stages/probe.ts` :
```ts
import { request } from 'undici';
import { normalizeCompanyName, type ProbeResult } from '@prospeo/core';

const PARKED_MARKERS = [
  'domaine est à vendre', 'domain is for sale', 'this domain',
  'en construction', 'under construction', 'coming soon',
  'parked domain', 'site en cours de création',
];

export function hasViewport(html: string): boolean {
  return /<meta[^>]+name\s*=\s*["']?viewport["']?/i.test(html);
}

export function detectParked(html: string): boolean {
  const text = html.toLowerCase();
  return PARKED_MARKERS.some((marker) => text.includes(marker));
}

export interface FetchedPage {
  status: number;
  finalUrl: string;
  body: string;
}

async function defaultFetch(url: string): Promise<FetchedPage> {
  const response = await request(url, {
    method: 'GET',
    maxRedirections: 5,
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; ProspeoBot/1.0)' },
  });
  const body = await response.body.text();
  return { status: response.statusCode, finalUrl: url, body: body.slice(0, 200_000) };
}

/** Ne lève jamais : une URL injoignable est un résultat, pas une erreur. */
export async function probeUrl(
  url: string,
  fetchImpl: (url: string) => Promise<FetchedPage> = defaultFetch,
): Promise<ProbeResult> {
  try {
    const page = await fetchImpl(url);
    return {
      url,
      reachable: true,
      httpStatus: page.status,
      isHttps: page.finalUrl.startsWith('https://'),
      finalUrl: page.finalUrl,
      hasViewportMeta: hasViewport(page.body),
      isParked: detectParked(page.body),
    };
  } catch {
    return {
      url,
      reachable: false,
      httpStatus: null,
      isHttps: url.startsWith('https://'),
      finalUrl: null,
      hasViewportMeta: false,
      isParked: false,
    };
  }
}

/**
 * Variantes de nom de domaine à tester. Heuristique assumée : l'absence
 * d'enregistrement DNS suggère fortement la disponibilité sans la garantir.
 */
export function domainCandidates(denomination: string): string[] {
  const words = normalizeCompanyName(denomination).split(' ').filter((w) => w.length > 1);
  if (words.length === 0) return [];
  if (words.length === 1) return [`${words[0]}.fr`];

  const [first, second] = words as [string, string];
  return [`${first}-${second}.fr`, `${first}${second}.fr`, `${second}-${first}.fr`];
}
```

- [ ] **Step 4: Brancher la commande probe dans le CLI**

Ajouter au `switch` de `apps/collector/src/cli.ts` :
```ts
    case 'probe': {
      const client = createClient(config);
      const { data, error } = await client
        .from('prospect_enrichment')
        .select('prospect_id, declared_url')
        .not('declared_url', 'is', null);
      if (error) throw new Error(error.message);

      let done = 0;
      for (const row of data ?? []) {
        const result = await probeUrl(row.declared_url as string);
        const { error: writeError } = await client.from('web_presence').upsert(
          {
            prospect_id: row.prospect_id,
            probed_url: result.url,
            http_status: result.httpStatus,
            is_https: result.isHttps,
            final_url: result.finalUrl,
            is_parked: result.isParked,
            has_viewport_meta: result.hasViewportMeta,
            probed_at: new Date().toISOString(),
          },
          { onConflict: 'prospect_id' },
        );
        if (writeError) {
          process.stderr.write(`probe: échec sur ${row.prospect_id} — ${writeError.message}\n`);
          continue;
        }
        done += 1;
      }
      process.stdout.write(`probe : ${done} URL sondées\n`);
      return 0;
    }
```

et l'import correspondant en tête de fichier :
```ts
import { probeUrl } from './stages/probe.js';
```

- [ ] **Step 5: Lancer les tests**

Run: `pnpm --filter @prospeo/collector test`
Expected: PASS — 21 tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: etage probe et candidats de nom de domaine" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Étages classify et score

**Files:**
- Create: `apps/collector/src/stages/classify-score.ts`
- Modify: `apps/collector/src/cli.ts`
- Test: `apps/collector/src/stages/classify-score.test.ts`

**Interfaces:**
- Consumes: `classifyWebPresence`, `computeScore`, `normalizePhone` de `@prospeo/core`
- Produces: `buildScoreRow(input: ScoreRowInput, now?: Date): ScoreRow | null`

`ScoreRowInput` rassemble ce que la base sait d'un prospect ; `buildScoreRow` renvoie `null` lorsque la catégorie n'est pas encore déterminable, c'est-à-dire lorsqu'un domaine propre attend d'être sondé.

- [ ] **Step 1: Écrire le test qui échoue**

`apps/collector/src/stages/classify-score.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { buildScoreRow, type ScoreRowInput } from './classify-score.js';

const NOW = new Date('2026-09-01T00:00:00Z');

const base: ScoreRowInput = {
  prospectId: 'p1',
  declaredUrl: null,
  socialUrls: [],
  probe: null,
  rating: null,
  reviewCount: null,
  lastSocialPostAt: null,
  effectifCode: null,
  dateCreation: null,
  phoneRaw: null,
  denomination: 'PLOMBERIE MARTIN',
  isClosed: false,
};

describe('buildScoreRow', () => {
  it('classe et note un prospect sans presence web', () => {
    const row = buildScoreRow(base, NOW)!;
    expect(row.category).toBe('none');
    expect(row.total).toBe(10); // 35 présence - 25 absence de téléphone
    expect(row.rulesetVersion).toBe('v1');
  });

  it('valorise une page Facebook avec mobile et bonne reputation', () => {
    const row = buildScoreRow(
      {
        ...base,
        declaredUrl: 'https://facebook.com/plomberiemartin',
        rating: 4.6,
        reviewCount: 23,
        phoneRaw: '06 12 34 56 78',
        dateCreation: '2016-03-01',
      },
      NOW,
    )!;
    expect(row.category).toBe('social_only');
    expect(row.total).toBe(100); // 45 + 25 + 10 + 20 = 100
    expect(row.phoneKind).toBe('mobile');
  });

  it('renvoie null quand un domaine propre n a pas encore ete sonde', () => {
    expect(buildScoreRow({ ...base, declaredUrl: 'https://plomberie-martin.fr' }, NOW)).toBeNull();
  });

  it('disqualifie un site sain', () => {
    const row = buildScoreRow(
      {
        ...base,
        declaredUrl: 'https://plomberie-martin.fr',
        phoneRaw: '02 40 12 34 56',
        probe: {
          url: 'https://plomberie-martin.fr',
          reachable: true,
          httpStatus: 200,
          isHttps: true,
          finalUrl: 'https://plomberie-martin.fr/',
          hasViewportMeta: true,
          isParked: false,
        },
      },
      NOW,
    )!;
    expect(row.category).toBe('has_site');
    expect(row.total).toBe(0);
  });

  it('detecte une enseigne de reseau', () => {
    const row = buildScoreRow({ ...base, denomination: 'SOS PLOMBIER FRANCHISE' }, NOW)!;
    expect(row.breakdown.some((l) => l.code === 'franchise')).toBe(true);
  });

  it('ignore un telephone illisible', () => {
    const row = buildScoreRow({ ...base, phoneRaw: '12345' }, NOW)!;
    expect(row.phoneKind).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/collector test`
Expected: FAIL — `Failed to resolve import "./classify-score.js"`

- [ ] **Step 3: Écrire l'implémentation**

`apps/collector/src/stages/classify-score.ts` :
```ts
import {
  classifyWebPresence,
  computeScore,
  normalizeCompanyName,
  normalizePhone,
  type PhoneKind,
  type ProbeResult,
  type ScoreLine,
  type WebPresenceCategory,
} from '@prospeo/core';

const FRANCHISE_MARKERS = ['franchise', 'reseau', 'groupe', 'sos ', 'allo ', '24h24'];

export interface ScoreRowInput {
  prospectId: string;
  declaredUrl: string | null;
  socialUrls: string[];
  probe: ProbeResult | null;
  rating: number | null;
  reviewCount: number | null;
  lastSocialPostAt: string | null;
  effectifCode: string | null;
  dateCreation: string | null;
  phoneRaw: string | null;
  denomination: string;
  isClosed: boolean;
}

export interface ScoreRow {
  prospectId: string;
  category: WebPresenceCategory;
  phoneKind: PhoneKind | null;
  total: number;
  breakdown: ScoreLine[];
  rulesetVersion: string;
}

function looksLikeFranchise(denomination: string): boolean {
  const normalized = `${normalizeCompanyName(denomination)} `;
  return FRANCHISE_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * `null` signifie « pas encore classable » : un domaine propre est déclaré
 * mais n'a pas été sondé. L'appelant doit lancer `probe` puis rejouer.
 */
export function buildScoreRow(input: ScoreRowInput, now: Date = new Date()): ScoreRow | null {
  const category = classifyWebPresence({
    declaredUrl: input.declaredUrl,
    socialUrls: input.socialUrls,
    probe: input.probe,
  });
  if (category === null) return null;

  const phone = normalizePhone(input.phoneRaw);
  const score = computeScore(
    {
      category,
      rating: input.rating,
      reviewCount: input.reviewCount,
      lastSocialPostAt: input.lastSocialPostAt,
      effectifCode: input.effectifCode,
      dateCreation: input.dateCreation,
      phoneKind: phone?.kind ?? null,
      isClosed: input.isClosed,
      isFranchise: looksLikeFranchise(input.denomination),
    },
    now,
  );

  return {
    prospectId: input.prospectId,
    category,
    phoneKind: phone?.kind ?? null,
    total: score.total,
    breakdown: score.breakdown,
    rulesetVersion: score.rulesetVersion,
  };
}
```

- [ ] **Step 4: Brancher la commande score dans le CLI**

Ajouter au `switch` de `apps/collector/src/cli.ts` :
```ts
    case 'score': {
      const client = createClient(config);
      const { data, error } = await client
        .from('prospect')
        .select(
          'id, denomination, date_creation, effectif_code, ' +
            'prospect_enrichment(declared_url, social_urls, phone_e164, rating, review_count), ' +
            'web_presence(category, probed_url, http_status, is_https, final_url, is_parked, has_viewport_meta, last_social_post_at)',
        );
      if (error) throw new Error(error.message);

      let scored = 0;
      let pending = 0;

      for (const p of data ?? []) {
        const enrichment = (Array.isArray(p.prospect_enrichment)
          ? p.prospect_enrichment[0]
          : p.prospect_enrichment) as Record<string, unknown> | null;
        const presence = (Array.isArray(p.web_presence)
          ? p.web_presence[0]
          : p.web_presence) as Record<string, unknown> | null;

        const row = buildScoreRow({
          prospectId: p.id as string,
          declaredUrl: (enrichment?.declared_url as string | null) ?? null,
          socialUrls: (enrichment?.social_urls as string[] | null) ?? [],
          probe:
            presence?.probed_url == null
              ? null
              : {
                  url: presence.probed_url as string,
                  reachable: presence.http_status !== null,
                  httpStatus: (presence.http_status as number | null) ?? null,
                  isHttps: presence.is_https === true,
                  finalUrl: (presence.final_url as string | null) ?? null,
                  hasViewportMeta: presence.has_viewport_meta === true,
                  isParked: presence.is_parked === true,
                },
          rating: (enrichment?.rating as number | null) ?? null,
          reviewCount: (enrichment?.review_count as number | null) ?? null,
          lastSocialPostAt: (presence?.last_social_post_at as string | null) ?? null,
          effectifCode: (p.effectif_code as string | null) ?? null,
          dateCreation: (p.date_creation as string | null) ?? null,
          phoneRaw: (enrichment?.phone_e164 as string | null) ?? null,
          denomination: p.denomination as string,
          // Toujours false : `discover` filtre déjà `etat_administratif !== 'A'`,
          // aucun établissement cessé n'entre en base.
          isClosed: false,
        });

        if (row === null) {
          pending += 1;
          continue;
        }

        await client
          .from('web_presence')
          .upsert(
            { prospect_id: row.prospectId, category: row.category, probed_at: new Date().toISOString() },
            { onConflict: 'prospect_id' },
          );

        const { error: scoreError } = await client.from('prospect_score').upsert(
          {
            prospect_id: row.prospectId,
            total: row.total,
            breakdown: row.breakdown,
            ruleset_version: row.rulesetVersion,
            computed_at: new Date().toISOString(),
          },
          { onConflict: 'prospect_id' },
        );
        if (scoreError) {
          process.stderr.write(`score: échec sur ${row.prospectId} — ${scoreError.message}\n`);
          continue;
        }
        scored += 1;
      }

      process.stdout.write(`score : ${scored} prospects notés, ${pending} en attente de sonde\n`);
      return 0;
    }
```

et l'import :
```ts
import { buildScoreRow } from './stages/classify-score.js';
```

- [ ] **Step 5: Lancer toute la suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS — 27 tests, aucune erreur de type

- [ ] **Step 6: Vérifier le pipeline complet en réel**

```bash
pnpm --filter @prospeo/collector start discover --trade plombier --postal-code 44000
pnpm --filter @prospeo/collector start probe
pnpm --filter @prospeo/collector start score
```

Expected: la troisième commande affiche `score : N prospects notés, 0 en attente de sonde`.

Vérifier dans Supabase :
```sql
select p.denomination, w.category, s.total
from prospect p
join prospect_score s on s.prospect_id = p.id
join web_presence  w on w.prospect_id = p.id
order by s.total desc
limit 10;
```
Expected: des prospects classés, les `social_only` et `dead_site` en tête.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: etages classify et score, pipeline complet" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Ce que ce plan ne couvre pas

Traité dans le plan n°2 :

- Étage `enrich` — Google Maps en headless, captures d'écran, file d'appariements.
- Appariement Sirene ↔ Google Maps (Jaro-Winkler, distance, seuils).
- Vérification RDAP de disponibilité des domaines — `domainCandidates` prépare le terrain.
- Lecture de la fraîcheur d'activité sociale.
- Dashboard React, i18n `fr`/`en`, thème sombre.
- Générateur de message via OpenRouter.

Tant que l'étage `enrich` n'existe pas, `prospect_enrichment` reste vide : tous les prospects sortent en `none` avec `-25` de joignabilité. **C'est le comportement attendu à ce stade** — le classement devient discriminant quand l'enrichissement arrive.
