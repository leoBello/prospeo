# Enrichissement, appariement et réconciliation — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUISE — utiliser
> superpowers:subagent-driven-development (recommandé) ou
> superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les
> étapes utilisent la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** donner au socle la matière qui lui manque — téléphone, site
déclaré, réseaux sociaux, avis — en appariant chaque établissement Sirene à
sa fiche Google Maps, puis garantir que cette matière reste vraie.

**Architecture :** la logique d'appariement est pure et vit dans
`packages/core` ; le pilotage du navigateur vit dans `apps/collector` derrière
l'interface `EnrichmentSource` déjà posée au socle. Trois étages
supplémentaires (`enrich`, `reconcile`, `domains`) et une commande manuelle
(`review`) rejoignent le pipeline existant.

**Pile :** TypeScript strict, Node 26, pnpm 11, Vitest, Playwright,
Supabase.

**Spec :** `docs/superpowers/specs/2026-09-01-enrichissement-appariement-design.md`

## Contraintes globales

Elles s'appliquent implicitement à **toutes** les tâches.

- `packages/core` reste **pur** : aucune I/O, aucun accès réseau, aucune
  lecture d'environnement. Sa seule dépendance de production est `zod`.
- TypeScript `strict` **et** `noUncheckedIndexedAccess`. Un accès indexé
  rend `T | undefined` et doit être traité.
- **Écriture prospect par prospect, jamais par lot.** Aucun échec partiel ne
  doit pouvoir corrompre la base.
- **Toute lecture Supabase est paginée.** PostgREST plafonne les réponses à
  `max_rows` (1000). `PAGE_SIZE = 500`, avec `.order()` explicite pour rendre
  les pages déterministes.
- **Ne jamais écrire en base une valeur sciemment fausse ou périmée.** Cette
  règle a déjà coûté deux correctifs au socle (`web_presence.category`, puis
  `probed_at`). Une absence se dit `null`, jamais par une valeur plausible.
- Les regex de désaccentuation s'écrivent en **séquences d'échappement
  littérales** : `/[̀-ͯ]/g`. Un caractère combinant brut est
  invisible dans le fichier et échoue silencieusement.
- Libellés utilisateur, messages d'erreur et commentaires **en français**.
- TDD : le test échoue d'abord, on vérifie qu'il échoue, puis on implémente.
- Commits fréquents, un par étape de commit du plan.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `packages/core/src/name-match.ts` | similarité de noms — Jaro-Winkler, inclusion de jetons, variantes |
| `packages/core/src/matching.ts` | géodistance, barème d'appariement, sélection du candidat |
| `packages/core/src/domain-name.ts` | dérivation des noms de domaine candidats |
| `packages/core/src/naf.ts` | cohérence entre le NAF d'un établissement et son métier |
| `apps/collector/src/sources/google-maps-normalize.ts` | conversion pure des champs bruts extraits d'une fiche |
| `apps/collector/src/sources/google-maps.ts` | pilotage Playwright — la seule partie non testable sans navigateur |
| `apps/collector/src/stages/enrich.ts` | sélection, appariement, écriture, plafond journalier |
| `apps/collector/src/stages/review.ts` | fonction de décision pure de la revue manuelle |
| `apps/collector/src/stages/reconcile.ts` | rerequête Sirene par SIRET, suppression ou clôture |
| `apps/collector/src/stages/domains.ts` | disponibilité DNS puis RDAP |

Le découpage suit une ligne unique : **tout ce qui décide est pur et testé ;
tout ce qui parle au monde extérieur est mince et injecté.** Les sélecteurs
DOM de Google Maps sont la seule exception assumée — ils ne se testent pas
sans navigateur, et on les garde donc réduits à des expressions d'une ligne.

---

## Tâche 1 : Corrections du socle

Deux défauts que le premier run de `enrich` rendrait nuisibles. Ils se
corrigent avant lui, pas après.

**Fichiers :**
- Modifier : `apps/collector/src/stages/classify-score.ts`
- Modifier : `apps/collector/src/stages/probe.ts`
- Modifier : `apps/collector/src/cli.ts`
- Test : `apps/collector/src/stages/classify-score.test.ts`
- Test : `apps/collector/src/stages/probe.test.ts`

**Interfaces :**
- Consomme : `buildScoreRow(input, now?)` et `ScoreRowInput`, déjà exportés
  par `stages/classify-score.ts`.
- Produit : `planScoreWrite(input, now?): ScoreWrite` et
  `shouldProbe(probedAt, now, force): boolean`, consommés par `cli.ts`.

### Contexte

`score` ne porte aucun prédicat de fraîcheur : il renote déjà toute la base à
chaque exécution, et c'est voulu. Le trou est ailleurs. Quand `buildScoreRow`
renvoie `null` — un domaine propre est déclaré mais pas encore sondé — le
code compte le prospect en attente puis `continue` **sans rien écrire**. La
ligne `prospect_score` du passage précédent survit donc, avec sa catégorie,
et rien ne la distingue d'un score frais.

Inerte aujourd'hui, parce que `pending` vaut toujours 0. Dès le premier
`enrich`, des prospects notés `none` à 20 points recevront un `declared_url`
et conserveront ces 20 points en attendant la sonde.

- [ ] **Étape 1 : écrire les tests qui échouent pour `planScoreWrite`**

Ajouter à `apps/collector/src/stages/classify-score.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { planScoreWrite, type ScoreRowInput } from './classify-score.js';

/** Entrée minimale valide, surchargée cas par cas. */
function input(over: Partial<ScoreRowInput> = {}): ScoreRowInput {
  return {
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
    ...over,
  };
}

describe('planScoreWrite', () => {
  it('demande une écriture de score quand le prospect est classable', () => {
    const write = planScoreWrite(input());
    expect(write.kind).toBe('score');
    if (write.kind !== 'score') throw new Error('inattendu');
    expect(write.row.category).toBe('none');
  });

  it('demande un effacement quand un domaine propre attend la sonde', () => {
    // `declaredUrl` sur un domaine propre et `probe` à null : c'est
    // exactement le cas que `enrich` va créer en masse.
    const write = planScoreWrite(input({ declaredUrl: 'https://exemple.fr' }));
    expect(write).toEqual({ kind: 'erase', prospectId: 'p1' });
  });

  it('ne demande pas d effacement pour une URL sociale, classable sans sonde', () => {
    const write = planScoreWrite(input({ declaredUrl: 'https://facebook.com/plomberie' }));
    expect(write.kind).toBe('score');
  });
});
```

- [ ] **Étape 2 : vérifier l'échec**

```
pnpm --filter @prospeo/collector test
```

Attendu : ÉCHEC, `planScoreWrite is not a function`.

- [ ] **Étape 3 : implémenter `planScoreWrite`**

Ajouter à la fin de `apps/collector/src/stages/classify-score.ts` :

```ts
/**
 * Ce que `score` doit écrire pour un prospect.
 *
 * `erase` existe parce qu'un prospect qui redevient « en attente de sonde »
 * conserverait sinon le score du passage précédent, sans rien qui le
 * distingue d'un score frais. Une absence de score se dit par son absence.
 */
export type ScoreWrite =
  | { kind: 'score'; row: ScoreRow }
  | { kind: 'erase'; prospectId: string };

export function planScoreWrite(input: ScoreRowInput, now: Date = new Date()): ScoreWrite {
  const row = buildScoreRow(input, now);
  return row === null ? { kind: 'erase', prospectId: input.prospectId } : { kind: 'score', row };
}
```

- [ ] **Étape 4 : vérifier le succès**

```
pnpm --filter @prospeo/collector test
```

Attendu : SUCCÈS.

- [ ] **Étape 5 : écrire le test qui échoue pour `shouldProbe`**

Ajouter à `apps/collector/src/stages/probe.test.ts` :

```ts
import { shouldProbe } from './probe.js';

describe('shouldProbe', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('sonde une URL jamais sondée', () => {
    expect(shouldProbe(null, now, false)).toBe(true);
  });

  it('ne resonde pas dans la fenêtre de fraîcheur', () => {
    expect(shouldProbe('2026-08-28T12:00:00Z', now, false)).toBe(false);
  });

  it('resonde au-delà de la fenêtre', () => {
    expect(shouldProbe('2026-08-20T12:00:00Z', now, false)).toBe(true);
  });

  it('resonde toujours sous --force', () => {
    expect(shouldProbe('2026-08-31T12:00:00Z', now, true)).toBe(true);
  });

  it('sonde quand l horodatage est illisible plutôt que de le supposer frais', () => {
    expect(shouldProbe('pas une date', now, false)).toBe(true);
  });
});
```

- [ ] **Étape 6 : vérifier l'échec, puis implémenter**

```
pnpm --filter @prospeo/collector test
```

Attendu : ÉCHEC. Ajouter alors à `apps/collector/src/stages/probe.ts` :

```ts
/** Fenêtre au-delà de laquelle une sonde est considérée périmée. */
export const PROBE_FRESHNESS_DAYS = 7;

/**
 * Resonder est voulu — un site meurt entre deux runs, c'est précisément ce
 * qu'on cherche. Mais tout resonder à chaque passage retéléchargerait une
 * centaine de sites pour reconstater l'évidence dès que `enrich` aura rempli
 * `declared_url`.
 *
 * Un horodatage illisible fait sonder : supposer une sonde fraîche sur une
 * donnée qu'on ne sait pas lire reviendrait à inventer une observation.
 */
export function shouldProbe(probedAt: string | null, now: Date, force: boolean): boolean {
  if (force || probedAt === null) return true;
  const previous = new Date(probedAt).getTime();
  if (Number.isNaN(previous)) return true;
  const ageDays = (now.getTime() - previous) / 86_400_000;
  // Un horodatage futur donne un age negatif, donc toujours sous la
  // fenetre : le prospect serait fige comme fraichement sonde jusqu'a ce que
  // l'horloge rattrape cette date. Une date impossible ne vaut pas mieux
  // qu'une date absente.
  return ageDays < 0 || ageDays >= PROBE_FRESHNESS_DAYS;
}
```

- [ ] **Étape 7 : vérifier le succès**

```
pnpm --filter @prospeo/collector test
```

Attendu : SUCCÈS.

- [ ] **Étape 8 : brancher `planScoreWrite` dans le CLI**

Dans `apps/collector/src/cli.ts`, remplacer l'appel à `buildScoreRow` et le
bloc `if (row === null)` par :

```ts
        const write = planScoreWrite({
          // …mêmes champs qu'aujourd'hui, inchangés…
        });

        if (write.kind === 'erase') {
          // Effacer plutôt que laisser en place : le score précédent a été
          // calculé sans connaître l'URL qu'on vient de découvrir.
          const { error: eraseScoreError } = await client
            .from('prospect_score')
            .delete()
            .eq('prospect_id', write.prospectId);
          const { error: eraseCategoryError } = await client
            .from('web_presence')
            .update({ category: null })
            .eq('prospect_id', write.prospectId);
          const failure = eraseScoreError ?? eraseCategoryError;
          if (failure) {
            process.stderr.write(
              `score: échec d'effacement sur ${write.prospectId} — ${failure.message}\n`,
            );
            // `pending` ne compte que les prospects reellement sortis du
            // classement. Compter ici ferait croire a un etat propre qui n'a
            // pas ete verifie.
            eraseFailed += 1;
            continue;
          }
          pending += 1;
          continue;
        }

        const row = write.row;
```

Mettre à jour l'import en tête de fichier : `planScoreWrite` remplace
`buildScoreRow`.

Declarer `let eraseFailed = 0;` aux cotes de `scored` et `pending`, et
n'ajouter la ligne au compte-rendu que si le compteur est non nul.

**L'ordre des deux ecritures est delibere.** Supprimer le score en premier
sort le prospect du classement le temps que la sonde passe. L'ordre inverse
protegerait la categorie, qui ne pilote rien, en exposant le score perime,
c'est-a-dire precisement ce qui remonte en tete de liste et fait decrocher le
telephone.

- [ ] **Étape 9 : brancher `shouldProbe` dans le CLI**

Dans le `case 'probe'`, `probed_at` vit sur `web_presence` et l'URL déclarée
sur `prospect_enrichment` : deux lectures paginées, jointes en mémoire. Un
`join` PostgREST franchirait deux relations et rendrait l'inférence de type
fragile pour un gain nul sur quelques centaines de lignes.

```ts
      const force = argv.includes('--force');
      const now = new Date();

      // Deuxième lecture paginée : les horodatages de sonde.
      const probedAt = new Map<string, string | null>();
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('web_presence')
          .select('prospect_id, probed_at')
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) probedAt.set(row.prospect_id, row.probed_at);
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      let skipped = 0;
      // …dans la boucle, avant le try :
        if (!shouldProbe(probedAt.get(row.prospect_id) ?? null, now, force)) {
          skipped += 1;
          continue;
        }
```

Et le compte-rendu final :

```ts
      process.stdout.write(`probe : ${done} URL sondées, ${skipped} encore fraîches\n`);
```

Ajouter `--force` à la section Options de `USAGE`.

- [ ] **Étape 10 : vérifier l'ensemble**

```
pnpm test
pnpm typecheck
```

Attendu : toute la suite passe, aucune erreur de typage.

- [ ] **Étape 11 : commit**

```bash
git add apps/collector/src
git commit -m "fix: effacer le score en attente et poser une fenêtre de fraîcheur de sonde"
```

---

## Tâche 2 : Similarité de noms

Le cœur du chantier. Sans cette tâche, l'appariement échoue silencieusement
sur un cinquième de la population.

**Fichiers :**
- Créer : `packages/core/src/name-match.ts`
- Créer : `packages/core/src/name-match.test.ts`
- Modifier : `packages/core/src/index.ts`

**Interfaces :**
- Consomme : `normalizeCompanyName(raw: string): string` depuis
  `packages/core/src/normalize.ts`.
- Produit : `nameVariants`, `significantTokens`, `jaroWinkler`,
  `tokenContainment`, `bestNameMatch`, et le type `NameMatch`. La tâche 3
  n'utilise que `bestNameMatch` et `NameMatch`.

### Contexte

Sur les 25 prospects réels, 5 sont des entrepreneurs individuels dont la
dénomination légale n'a aucun rapport avec le nom commercial :

```
"GHAITH RAHALI (RGSERVICES)"    usuelle : "RGSERVICES"    Maps : "RG Services"
"ERIC ESCAPIN"                  usuelle : "H20"           Maps : "H2O Plomberie"
```

Trois mécanismes se combinent pour les rattraper : essayer **plusieurs
variantes de nom** par prospect, comparer aussi **sans les espaces**, et
mesurer l'**inclusion de jetons** en écartant les jetons génériques du métier.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `packages/core/src/name-match.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  bestNameMatch,
  jaroWinkler,
  nameVariants,
  significantTokens,
  tokenContainment,
} from './name-match.js';

describe('jaroWinkler', () => {
  it('vaut 1 pour deux chaînes identiques', () => {
    expect(jaroWinkler('martin', 'martin')).toBe(1);
  });

  it('vaut 0 pour deux chaînes sans lettre commune', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });

  it('récompense un préfixe commun', () => {
    expect(jaroWinkler('h20', 'h2o')).toBeGreaterThan(0.85);
  });

  it('traite la chaîne vide sans exploser', () => {
    expect(jaroWinkler('', 'martin')).toBe(0);
    expect(jaroWinkler('', '')).toBe(1);
  });
});

describe('significantTokens', () => {
  it('retire les jetons génériques du métier', () => {
    expect(significantTokens('plomberie martin', ['plomberie'])).toEqual(['martin']);
  });

  it('retire les jetons trop courts pour identifier', () => {
    expect(significantTokens('ets du martin', [])).toEqual(['martin']);
  });

  it('ne renvoie rien quand tout est générique', () => {
    expect(significantTokens('plomberie chauffage', ['plomberie', 'chauffage'])).toEqual([]);
  });
});

describe('tokenContainment', () => {
  it('vaut 1 quand tous les jetons significatifs sont présents', () => {
    expect(tokenContainment('martin', 'plomberie martin fils', ['plomberie'])).toBe(1);
  });

  it('vaut 0 sans jeton significatif commun', () => {
    expect(tokenContainment('escapin', 'plomberie martin', ['plomberie'])).toBe(0);
  });

  it('vaut 0 quand la source n a aucun jeton significatif', () => {
    // « Plomberie » face à « SOS Plomberie » ne doit pas valoir 1 : sinon
    // deux entreprises sans rapport s apparient sur un mot de métier.
    expect(tokenContainment('plomberie', 'sos plomberie', ['plomberie'])).toBe(0);
  });
});

describe('nameVariants', () => {
  it('sépare la dénomination de ses parenthèses', () => {
    expect(nameVariants('GHAITH RAHALI (RGSERVICES)', 'RGSERVICES')).toEqual(
      expect.arrayContaining(['ghaith rahali', 'rgservices']),
    );
  });

  it('découpe les segments séparés par une barre oblique', () => {
    const variants = nameVariants(
      'PHILIPPE DELAITRE (POPO LES BONS TUYAUX / PHILIPPE DELAITRE)',
      'POPO LES BONS TUYAUX / PHILIPPE DELAITRE',
    );
    expect(variants).toEqual(expect.arrayContaining(['popo les bons tuyaux', 'philippe delaitre']));
  });

  it('retient la dénomination usuelle même sans rapport avec la légale', () => {
    expect(nameVariants('ERIC ESCAPIN', 'H20')).toEqual(
      expect.arrayContaining(['eric escapin', 'h20']),
    );
  });

  it('ne renvoie ni doublon ni chaîne vide', () => {
    const variants = nameVariants('SARL ALLARD (ALLARD)', 'ALLARD');
    expect(variants).toEqual([...new Set(variants)]);
    expect(variants).not.toContain('');
  });
});

describe('bestNameMatch — les cas réels de la base', () => {
  const generic = ['plomberie', 'plombier', 'chauffage', 'depannage'];

  it('rattrape « ERIC ESCAPIN » via sa dénomination usuelle « H20 »', () => {
    const match = bestNameMatch(nameVariants('ERIC ESCAPIN', 'H20'), 'H2O Plomberie', generic);
    expect(match.score).toBeGreaterThan(0.85);
    expect(match.variant).toBe('h20');
  });

  it('rattrape « RGSERVICES » face à « RG Services » malgré l espace', () => {
    const match = bestNameMatch(
      nameVariants('GHAITH RAHALI (RGSERVICES)', 'RGSERVICES'),
      'RG Services',
      generic,
    );
    expect(match.score).toBeGreaterThan(0.9);
  });

  it('rattrape un patronyme noyé dans un nom commercial', () => {
    const match = bestNameMatch(nameVariants('SARL ALLARD', null), 'Allard Plomberie', generic);
    expect(match.score).toBeGreaterThan(0.85);
  });

  it('ne rapproche pas deux entreprises que seul le métier réunit', () => {
    const match = bestNameMatch(nameVariants('SARL ALLARD', null), 'Plomberie Dupont', generic);
    expect(match.score).toBeLessThan(0.55);
  });

  it('renvoie un score nul sans variante', () => {
    expect(bestNameMatch([], 'Plomberie Dupont', generic)).toEqual({ score: 0, variant: null });
  });
});
```

- [ ] **Étape 2 : vérifier l'échec**

```
pnpm --filter @prospeo/core test
```

Attendu : ÉCHEC, module `./name-match.js` introuvable.

- [ ] **Étape 3 : implémenter**

Créer `packages/core/src/name-match.ts` :

```ts
import { normalizeCompanyName } from './normalize.js';

/** En deçà, un jeton n'identifie rien : « du », « et », « 44 ». */
const MIN_TOKEN_LENGTH = 3;

/** Poids du préfixe commun dans l'ajustement Winkler, valeur usuelle. */
const WINKLER_SCALE = 0.1;

/** Longueur maximale du préfixe commun pris en compte, valeur usuelle. */
const WINKLER_MAX_PREFIX = 4;

export interface NameMatch {
  /** 0 à 1. */
  score: number;
  /** La variante qui a obtenu le meilleur score, `null` s'il n'y en avait aucune. */
  variant: string | null;
}

/** Similarité de Jaro, sans l'ajustement de préfixe. */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatched[j] === true) continue;
      if (a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (aMatched[i] !== true) continue;
    while (bMatched[k] !== true) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  const half = transpositions / 2;
  return (matches / a.length + matches / b.length + (matches - half) / matches) / 3;
}

/** Jaro, majoré selon la longueur du préfixe commun. */
export function jaroWinkler(a: string, b: string): number {
  const base = jaro(a, b);
  if (base === 0) return 0;

  let prefix = 0;
  const max = Math.min(WINKLER_MAX_PREFIX, a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix += 1;

  return base + prefix * WINKLER_SCALE * (1 - base);
}

/**
 * Jetons porteurs d'identité : ni trop courts, ni génériques du métier.
 *
 * Retirer les génériques est indispensable. Sans cela « Plomberie » serait
 * intégralement contenu dans « SOS Plomberie », et deux entreprises que rien
 * ne relie s'appariéraient sur leur corps de métier.
 */
export function significantTokens(name: string, generic: readonly string[]): string[] {
  const banned = new Set(generic.map((word) => normalizeCompanyName(word)));
  return name
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !banned.has(token));
}

/**
 * Plafond appliqué quand le nom source ne tient qu'à un seul jeton
 * significatif.
 *
 * Un patronyme n'est pas une identité. Quand tout ce qui distingue une
 * entreprise se réduit à un nom de famille — « Martin », une fois le métier
 * retiré — la coïncidence avec un candidat qui porte ce même patronyme est
 * trop banale pour emporter seule la décision : « Martin » est aussi courant
 * qu'homonyme, et le cas doit revenir à un humain plutôt que fusionner
 * automatiquement. 0,80 est une valeur de calibrage, choisie pour rester sous
 * le seuil de fusion automatique ; elle est destinée à être revue sur données
 * réelles.
 */
const SINGLE_TOKEN_CAP = 0.8;

/**
 * Plafond appliqué quand le nom source ne tient qu'à un seul jeton
 * significatif.
 *
 * Un patronyme n'est pas une identité. Quand tout ce qui distingue une
 * entreprise se réduit à un nom de famille — « Martin », une fois le métier
 * retiré — la coïncidence avec un candidat qui porte ce même patronyme est
 * trop banale pour emporter seule la décision : « Martin » est aussi courant
 * qu'homonyme, et le cas doit revenir à un humain plutôt que fusionner
 * automatiquement. 0,80 est une valeur de calibrage, choisie pour rester sous
 * le seuil de fusion automatique ; elle est destinée à être revue sur données
 * réelles.
 */
const SINGLE_TOKEN_CAP = 0.8;

export function tokenContainment(a: string, b: string, generic: readonly string[]): number {
  const tokens = significantTokens(a, generic);
  if (tokens.length === 0) return 0;
  const target = new Set(normalizeCompanyName(b).split(' '));
  const found = tokens.filter((token) => target.has(token)).length;
  const ratio = found / tokens.length;
  return tokens.length === 1 ? Math.min(ratio, SINGLE_TOKEN_CAP) : ratio;
}

/**
 * Toutes les façons dont un établissement peut se nommer.
 *
 * Sirene enregistre une dénomination légale qui, chez un entrepreneur
 * individuel, est un état civil — « ERIC ESCAPIN ». Google Maps connaît
 * l'enseigne — « H2O ». Sans essayer chaque variante séparément,
 * l'appariement échoue sur un cinquième de la population.
 */
export function nameVariants(denomination: string, denominationUsuelle: string | null): string[] {
  const raw: string[] = [];

  // La dénomination privée de ses parenthèses, puis chaque parenthèse.
  raw.push(denomination.replace(/\([^)]*\)/g, ' '));
  for (const found of denomination.matchAll(/\(([^)]*)\)/g)) {
    if (found[1] !== undefined) raw.push(found[1]);
  }
  if (denominationUsuelle !== null) raw.push(denominationUsuelle);

  // Chaque segment séparé par une barre oblique est un nom à part entière.
  const split = raw.flatMap((value) => value.split('/'));

  const seen = new Set<string>();
  for (const value of split) {
    const normalized = normalizeCompanyName(value);
    if (normalized !== '') seen.add(normalized);
  }
  return [...seen];
}

/** Retire les espaces : « rgservices » et « rg services » désignent la même enseigne. */
function despace(value: string): string {
  return value.replace(/ /g, '');
}

/**
 * En deçà de ce ratio de longueurs, comparer deux chaînes entières lettre à
 * lettre n'a plus de sens : la fenêtre de recherche de Jaro croît avec la
 * plus longue chaîne, ce qui rend la mesure trop permissive quand une courte
 * chaîne se retrouve par hasard partiellement contenue dans une bien plus
 * longue. Exemple réel : « allard » obtient ~0.57 face à « plomberie
 * dupont », deux entreprises sans aucun rapport. En dessous du seuil, seules
 * les mesures par jeton restent sollicitées.
 */
const MIN_LENGTH_RATIO = 0.5;

/** Proportion, entre 0 et 1, de la plus courte longueur sur la plus longue. */
function lengthRatio(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  return Math.min(a.length, b.length) / Math.max(a.length, b.length);
}

/**
 * Jaro-Winkler entre deux chaînes entières, neutralisé quand leurs longueurs
 * sont trop disparates (voir `MIN_LENGTH_RATIO`) pour éviter le faux positif
 * d'une courte chaîne noyée par hasard dans une bien plus longue.
 */
function wholeStringScore(a: string, b: string): number {
  if (lengthRatio(a, b) < MIN_LENGTH_RATIO) return 0;
  return jaroWinkler(a, b);
}

/**
 * Écart de longueur, en caractères, au-delà duquel deux jetons ne sont plus
 * comparés lettre à lettre (voir `bestTokenScore`).
 */
const MAX_TOKEN_LENGTH_DIFF = 1;

/**
 * Meilleure similarité Jaro-Winkler entre jetons significatifs pris un à un.
 *
 * Complète `tokenContainment`, qui exige une égalité stricte entre jetons :
 * ici « h20 » peut se rapprocher de « h2o » même sans être identique,
 * indépendamment des autres mots — génériques ou non — du nom candidat.
 *
 * La comparaison n'est admise que si les deux jetons ont des longueurs qui ne
 * s'écartent pas de plus d'un caractère (`MAX_TOKEN_LENGTH_DIFF`). Une mesure
 * jeton à jeton sert à rattraper les variantes d'écriture d'un même nom, pas
 * les noms qui se prolongent. Jaro-Winkler récompense généreusement une
 * extension de préfixe : « martin » face à « martinez » atteint 0.95, un
 * score de nom plus haut que « h20 » face à « h2o » — alors que ce sont deux
 * situations sans rapport. « h2o »/« h20 » est une substitution à longueur
 * égale, une variante de transcription du même nom. « martin »/« martinez »
 * est une extension, c'est-à-dire un autre patronyme, comme allard/allardin
 * ou dupont/dupontel. Deux jetons dont les longueurs s'écartent de deux
 * caractères ou plus sont des noms différents : s'il s'agissait vraiment de
 * la même entreprise, la comparaison de chaînes entières ou l'inclusion de
 * jetons l'auraient déjà rattrapée.
 *
 * Une égalité stricte entre l'unique jeton significatif de la source et un
 * jeton du candidat n'est pas une variante d'écriture : c'est exactement ce
 * que `tokenContainment` mesure déjà, plafond compris (voir
 * `SINGLE_TOKEN_CAP`). La laisser remonter ici — Jaro-Winkler d'un jeton avec
 * lui-même vaut toujours 1 — annulerait silencieusement ce plafond par la
 * porte à côté : « martin » de « SARL MARTIN SERRURERIE » retrouverait son
 * 1,00 face à « Martin Dépannage » dès que « serrurerie » et « dépannage »
 * ont tous deux été retirés comme génériques du métier. Cette exclusion ne
 * change rien pour les jetons qui se ressemblent sans être identiques,
 * comme « h20 »/« h2o » : c'est précisément le cas que cette fonction sert à
 * couvrir.
 */
function bestTokenScore(a: string, b: string, generic: readonly string[]): number {
  const aTokens = significantTokens(a, generic);
  const bTokens = significantTokens(b, generic);
  let best = 0;
  for (const aToken of aTokens) {
    for (const bToken of bTokens) {
      if (Math.abs(aToken.length - bToken.length) > MAX_TOKEN_LENGTH_DIFF) continue;
      if (aTokens.length === 1 && aToken === bToken) continue;
      best = Math.max(best, jaroWinkler(aToken, bToken));
    }
  }
  return best;
}

/**
 * Meilleure correspondance entre les variantes d'un prospect et un nom Maps.
 *
 * Quatre mesures sont confrontées et la plus favorable l'emporte. Jaro-Winkler
 * couvre les fautes et abréviations, sa variante sans espaces couvre les
 * enseignes agglutinées, et l'inclusion de jetons — dans les deux sens —
 * couvre les noms qui se contiennent sans se ressembler.
 */
export function bestNameMatch(
  variants: readonly string[],
  candidateName: string,
  generic: readonly string[],
): NameMatch {
  const target = normalizeCompanyName(candidateName);
  let best: NameMatch = { score: 0, variant: null };

  for (const variant of variants) {
    const score = Math.max(
      wholeStringScore(variant, target),
      wholeStringScore(despace(variant), despace(target)),
      tokenContainment(variant, target, generic),
      tokenContainment(target, variant, generic),
      bestTokenScore(variant, target, generic),
    );
    if (score > best.score) best = { score, variant };
  }
  return best;
}
```

- [ ] **Étape 4 : exporter et vérifier**

Ajouter à `packages/core/src/index.ts` :

```ts
export * from './name-match.js';
```

Puis :

```
pnpm --filter @prospeo/core test
pnpm typecheck
```

Attendu : SUCCÈS sur les 17 tests de `name-match`, typage propre.

- [ ] **Étape 5 : commit**

```bash
git add packages/core/src
git commit -m "feat: similarite de noms tolerante aux enseignes et aux patronymes"
```

---

## Tâche 3 : Appariement Sirene ↔ Maps

**Fichiers :**
- Créer : `packages/core/src/matching.ts`
- Créer : `packages/core/src/matching.test.ts`
- Modifier : `packages/core/src/index.ts`

**Interfaces :**
- Consomme : `bestNameMatch`, `nameVariants` (tâche 2) ; le type `Trade`
  depuis `types.ts`.

> **Prerequis de schema :** cette tache ajoute `readonly categoryLabels:
> readonly string[]` au type `Trade` (`packages/core/src/types.ts`) et le
> renseigne dans `trades.ts` : `['plombier', 'plomberie', 'chauffagiste']`
> pour le plombier, `['serrurier', 'serrurerie', 'metallerie']` pour le
> serrurier. `matchesCategory` lit ce champ et non `keywords`, qui reste
> reserve au retrait des jetons generiques et a la construction des requetes.
- Produit : `MapsCandidate`, `MatchLine`, `MatchScore`, `MatchOutcome`,
  `MATCHING_CONFIG`, `haversineMeters`, `scoreCandidate`, `selectMatch`.
  Les tâches 4, 6 et 7 en dépendent.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `packages/core/src/matching.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  haversineMeters,
  MATCHING_CONFIG,
  scoreCandidate,
  selectMatch,
  type MapsCandidate,
  type MatchSubject,
} from './matching.js';
import { getTrade } from './trades.js';

const plombier = getTrade('plombier');
if (plombier === undefined) throw new Error('métier plombier absent de la configuration');

const subject: MatchSubject = {
  denomination: 'SARL ALLARD',
  denominationUsuelle: null,
  latitude: 47.2213,
  longitude: -1.5601,
};

function candidate(over: Partial<MapsCandidate> = {}): MapsCandidate {
  return {
    name: 'Allard Plomberie',
    address: '11 rue Auguste Brizeux, 44000 Nantes',
    latitude: 47.2214,
    longitude: -1.5602,
    category: 'Plombier',
    phone: '02 40 00 00 00',
    website: null,
    rating: 4.6,
    reviewCount: 31,
    placeId: 'abc',
    mapsUrl: 'https://maps.google.com/?cid=1',
    ...over,
  };
}

describe('haversineMeters', () => {
  it('vaut 0 pour un point sur lui-même', () => {
    expect(haversineMeters(47.2213, -1.5601, 47.2213, -1.5601)).toBe(0);
  });

  it('mesure une centaine de mètres entre deux points voisins', () => {
    const d = haversineMeters(47.2213, -1.5601, 47.2222, -1.5601);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });
});

describe('scoreCandidate', () => {
  it('note haut un candidat proche, homonyme et du bon métier', () => {
    const score = scoreCandidate(subject, candidate(), plombier, MATCHING_CONFIG);
    expect(score.confidence).toBeGreaterThan(MATCHING_CONFIG.highThreshold);
    expect(score.categoryMatch).toBe(true);
    expect(score.distanceM).toBeLessThan(50);
  });

  it('produit des lignes d explication lisibles', () => {
    const score = scoreCandidate(subject, candidate(), plombier, MATCHING_CONFIG);
    expect(score.lines.map((l) => l.code)).toEqual(['nom', 'distance', 'categorie']);
    expect(score.lines[0]?.label).toContain('nom');
  });

  it('rend une distance nulle et une contribution nulle sans coordonnées', () => {
    const score = scoreCandidate(
      { ...subject, latitude: null, longitude: null },
      candidate(),
      plombier,
      MATCHING_CONFIG,
    );
    expect(score.distanceM).toBeNull();
    expect(score.confidence).toBeLessThan(1);
  });
});

describe('selectMatch', () => {
  it('fusionne automatiquement au-dessus du seuil haut', () => {
    const outcome = selectMatch(subject, [candidate()], plombier, MATCHING_CONFIG);
    expect(outcome.kind).toBe('ok');
  });

  it('élimine un candidat au-delà de la distance maximale', () => {
    // Même nom exact, mais à l autre bout de la ville : deux entreprises.
    const far = candidate({ latitude: 47.2600, longitude: -1.5601 });
    expect(selectMatch(subject, [far], plombier, MATCHING_CONFIG).kind).toBe('not_found');
  });

  it('renvoie not_found sans candidat', () => {
    expect(selectMatch(subject, [], plombier, MATCHING_CONFIG).kind).toBe('not_found');
  });

  it('renvoie ambiguous entre les deux seuils', () => {
    // Le bon nom, la bonne catégorie, mais à 200 m : confiance 0,833, sous le
    // seuil haut. C'est exactement le cas qu'un humain doit trancher — deux
    // établissements du même artisan, ou deux artisans homonymes du quartier ?
    const loin = candidate({ latitude: 47.2231, longitude: -1.5601 });
    const outcome = selectMatch(subject, [loin], plombier, MATCHING_CONFIG);
    expect(outcome.kind).toBe('ambiguous');
  });

  it('refuse de trancher quand deux candidats passent le seuil haut', () => {
    // La confiance élevée des deux est le symptôme du problème, pas sa
    // résolution : un faux appariement se paie au téléphone.
    const outcome = selectMatch(
      subject,
      [candidate(), candidate({ placeId: 'def', name: 'Allard Plomberie Nantes' })],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('ambiguous');
    if (outcome.kind !== 'ambiguous') throw new Error('inattendu');
    expect(outcome.scored).toHaveLength(2);
  });

  it('classe les candidats ambigus du plus probable au moins probable', () => {
    // Deux candidats dans la bande ambiguë, à 200 m et 267 m : confiances
    // 0,833 et 0,778. Le plus proche doit sortir en tête.
    const outcome = selectMatch(
      subject,
      [
        candidate({ placeId: 'loin', latitude: 47.2237, longitude: -1.5601 }),
        candidate({ placeId: 'proche', latitude: 47.2231, longitude: -1.5601 }),
      ],
      plombier,
      MATCHING_CONFIG,
    );
    if (outcome.kind !== 'ambiguous') throw new Error('inattendu');
    expect(outcome.scored).toHaveLength(2);
    const [first, second] = outcome.scored;
    expect(first?.candidate.placeId).toBe('proche');
    expect(first?.score.confidence).toBeGreaterThanOrEqual(second?.score.confidence ?? 0);
  });

  it('ignore un candidat sous le seuil bas', () => {
    const outcome = selectMatch(
      subject,
      [candidate({ name: 'Boulangerie Dupont', category: 'Boulangerie' })],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('not_found');
  });

  it('écarte un homonyme voisin dont le nom ne fait que prolonger le sien', () => {
    // « Allardin » prolonge « Allard » : la mesure jeton à jeton refuse la
    // paire, et la proximité seule ne suffit pas à franchir le seuil bas.
    const outcome = selectMatch(
      subject,
      [candidate({ name: 'Allardin Chauffage' })],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('not_found');
  });
});
```

- [ ] **Étape 2 : vérifier l'échec**

```
pnpm --filter @prospeo/core test
```

Attendu : ÉCHEC, module `./matching.js` introuvable.

- [ ] **Étape 3 : implémenter**

Créer `packages/core/src/matching.ts` :

```ts
import { bestNameMatch, nameVariants } from './name-match.js';
import { normalizeCompanyName } from './normalize.js';
import type { Trade } from './types.js';

/** Rayon moyen de la Terre, en mètres. */
const EARTH_RADIUS_M = 6_371_000;

/** Ce dont l'appariement a besoin, côté Sirene. */
export interface MatchSubject {
  denomination: string;
  denominationUsuelle: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Une fiche Google Maps, telle qu'extraite et normalisée. */
export interface MapsCandidate {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  placeId: string | null;
  mapsUrl: string;
}

/** Une ligne de justification, affichable telle quelle. */
export interface MatchLine {
  code: 'nom' | 'distance' | 'categorie';
  label: string;
  /** Contribution effective à la confiance, déjà pondérée. */
  points: number;
}

export interface MatchScore {
  /** 0 à 1. */
  confidence: number;
  nameSimilarity: number;
  /** La variante de nom qui a emporté la décision. */
  matchedVariant: string | null;
  /** `null` quand une des deux positions manque. */
  distanceM: number | null;
  categoryMatch: boolean;
  lines: MatchLine[];
}

export interface ScoredCandidate {
  candidate: MapsCandidate;
  score: MatchScore;
}

export type MatchOutcome =
  | { kind: 'ok'; candidate: MapsCandidate; score: MatchScore }
  | { kind: 'ambiguous'; scored: ScoredCandidate[] }
  | { kind: 'not_found' };

export interface MatchingConfig {
  version: string;
  nameWeight: number;
  distanceWeight: number;
  categoryWeight: number;
  /** Au-delà, le candidat est éliminé quel que soit son nom. */
  maxDistanceM: number;
  highThreshold: number;
  lowThreshold: number;
}

/**
 * Points de départ explicitement destinés à bouger.
 *
 * Ils seront calibrés sur les 25 premiers prospects réels, à l'étape 6 du
 * plan. La version est portée dans l'objet pour qu'un changement de réglage
 * soit traçable dans les données, comme pour le barème de notation.
 */
export const MATCHING_CONFIG: MatchingConfig = {
  version: 'v1',
  nameWeight: 0.6,
  distanceWeight: 0.25,
  categoryWeight: 0.15,
  maxDistanceM: 300,
  highThreshold: 0.85,
  lowThreshold: 0.55,
};

/** Distance orthodromique en mètres. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Jetons de métier trop génériques pour porter une identité d'entreprise. */
function genericTokens(trade: Trade): string[] {
  return [trade.slug, trade.label, ...trade.keywords, ...trade.mapsQueries].flatMap((word) =>
    normalizeCompanyName(word).split(' '),
  );
}

/**
 * Le libellé de catégorie Google recoupe-t-il le métier attendu ?
 *
 * Se limite à `categoryLabels`, volontairement plus étroit que `keywords` :
 * `keywords` contient des mots comme « dépannage », choisis pour être
 * fréquents dans les noms d'artisans — ce qui en fait le pire discriminant
 * de catégorie possible, puisqu'il qualifie tout autant l'électroménager,
 * l'informatique ou l'automobile.
 */
function matchesCategory(category: string | null, trade: Trade): boolean {
  if (category === null) return false;
  const normalized = normalizeCompanyName(category);
  if (normalized === '') return false;
  return trade.categoryLabels.some((word) => {
    const target = normalizeCompanyName(word);
    return target !== '' && normalized.includes(target);
  });
}


export function scoreCandidate(
  subject: MatchSubject,
  candidate: MapsCandidate,
  trade: Trade,
  config: MatchingConfig,
): MatchScore {
  const generic = genericTokens(trade);
  const variants = nameVariants(subject.denomination, subject.denominationUsuelle);
  const name = bestNameMatch(variants, candidate.name, generic);

  const distanceM =
    subject.latitude === null ||
    subject.longitude === null ||
    candidate.latitude === null ||
    candidate.longitude === null
      ? null
      : haversineMeters(
          subject.latitude,
          subject.longitude,
          candidate.latitude,
          candidate.longitude,
        );

  // Une distance inconnue ne vaut ni bonus ni malus : elle ne prouve rien.
  const proximity =
    distanceM === null
      ? 0
      : Math.max(0, 1 - Math.min(distanceM, config.maxDistanceM) / config.maxDistanceM);

  const categoryMatch = matchesCategory(candidate.category, trade);

  const namePoints = config.nameWeight * name.score;
  const distancePoints = config.distanceWeight * proximity;
  const categoryPoints = config.categoryWeight * (categoryMatch ? 1 : 0);

  const lines: MatchLine[] = [
    {
      code: 'nom',
      label:
        name.variant === null
          ? 'nom : aucune variante exploitable'
          : `nom ${name.score.toFixed(2)} via « ${name.variant} »`,
      points: namePoints,
    },
    {
      code: 'distance',
      label: distanceM === null ? 'distance inconnue' : `${Math.round(distanceM)} m`,
      points: distancePoints,
    },
    {
      code: 'categorie',
      label:
        candidate.category === null
          ? 'catégorie absente'
          : `catégorie « ${candidate.category} »${categoryMatch ? ' ✓' : ' ✗'}`,
      points: categoryPoints,
    },
  ];

  return {
    confidence: namePoints + distancePoints + categoryPoints,
    nameSimilarity: name.score,
    matchedVariant: name.variant,
    distanceM,
    categoryMatch,
    lines,
  };
}

/**
 * Choisit un candidat, ou refuse de choisir.
 *
 * Deux candidats au-dessus du seuil haut ne fusionnent jamais : quand deux
 * fiches se disputent un prospect, la confiance élevée est le symptôme du
 * problème, pas sa résolution. Un faux appariement ne se voit pas dans les
 * statistiques — il se voit au téléphone, et l'appel est perdu.
 */
export function selectMatch(
  subject: MatchSubject,
  candidates: readonly MapsCandidate[],
  trade: Trade,
  config: MatchingConfig,
): MatchOutcome {
  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const score = scoreCandidate(subject, candidate, trade, config);
    // Au-delà de la distance maximale, deux homonymes sont deux entreprises.
    if (score.distanceM !== null && score.distanceM > config.maxDistanceM) continue;
    if (score.confidence < config.lowThreshold) continue;
    scored.push({ candidate, score });
  }

  if (scored.length === 0) return { kind: 'not_found' };

  scored.sort((a, b) => b.score.confidence - a.score.confidence);
  const confident = scored.filter((s) => s.score.confidence >= config.highThreshold);

  if (confident.length === 1) {
    const only = confident[0];
    if (only === undefined) return { kind: 'not_found' };
    return { kind: 'ok', candidate: only.candidate, score: only.score };
  }

  return { kind: 'ambiguous', scored };
}
```

- [ ] **Étape 4 : exporter et vérifier**

Ajouter à `packages/core/src/index.ts` :

```ts
export * from './matching.js';
```

Puis :

```
pnpm --filter @prospeo/core test
pnpm typecheck
```

Attendu : SUCCÈS sur les 11 tests de `matching`, typage propre.

- [ ] **Étape 5 : commit**

```bash
git add packages/core/src
git commit -m "feat: appariement Sirene-Maps explicable, avec refus de trancher"
```

---

## Tâche 4 : Normalisation des champs d'une fiche Maps

Sépare ce qui se teste de ce qui ne se teste pas. Les sélecteurs DOM vivront
en tâche 5 ; toute la conversion de valeurs vit ici, pure et couverte.

**Fichiers :**
- Créer : `apps/collector/src/sources/google-maps-normalize.ts`
- Créer : `apps/collector/src/sources/google-maps-normalize.test.ts`

**Interfaces :**
- Consomme : `MapsCandidate` depuis `@prospeo/core` (tâche 3).
- Produit : `RawMapsPlace`, `parseRating`, `parseReviewCount`,
  `parseLatLngFromUrl`, `toMapsCandidate`. La tâche 5 les consomme.

### Contexte

Analyser du HTML Google Maps sauvegardé exigerait une bibliothèque DOM et
resterait fragile. On coupe autrement : Playwright extrait des **chaînes
brutes** via des sélecteurs, et tout ce qui transforme ces chaînes en valeurs
typées est pur et testé sur des fixtures JSON. La partie fragile se réduit
alors à des expressions d'une ligne, et la partie subtile est intégralement
couverte.

Les formats à absorber sont français : la note s'écrit `4,7` avec une virgule
décimale, le nombre d'avis `(1 128)` avec une espace insécable comme
séparateur de milliers.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `apps/collector/src/sources/google-maps-normalize.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  parseLatLngFromUrl,
  parseRating,
  parseReviewCount,
  toMapsCandidate,
  type RawMapsPlace,
} from './google-maps-normalize.js';

describe('parseRating', () => {
  it('lit une note à virgule décimale française', () => {
    expect(parseRating('4,7')).toBe(4.7);
  });

  it('lit une note à point décimal', () => {
    expect(parseRating('4.7')).toBe(4.7);
  });

  it('rejette une valeur hors de l échelle plutôt que de la tronquer', () => {
    expect(parseRating('47')).toBeNull();
    expect(parseRating('-1')).toBeNull();
  });

  it('rend null sur une entrée vide ou illisible', () => {
    expect(parseRating(null)).toBeNull();
    expect(parseRating('')).toBeNull();
    expect(parseRating('Aucun avis')).toBeNull();
  });
});

describe('parseReviewCount', () => {
  it('lit un nombre entre parenthèses', () => {
    expect(parseReviewCount('(31)')).toBe(31);
  });

  it('absorbe les séparateurs de milliers, espace insécable comprise', () => {
    expect(parseReviewCount('(1 128)')).toBe(1128);
    expect(parseReviewCount('(1 128)')).toBe(1128);
  });

  it('lit un libellé complet', () => {
    expect(parseReviewCount('128 avis')).toBe(128);
  });

  it('rend null sans chiffre', () => {
    expect(parseReviewCount(null)).toBeNull();
    expect(parseReviewCount('Aucun avis')).toBeNull();
  });
});

describe('parseLatLngFromUrl', () => {
  it('lit les coordonnées de la forme @lat,lng,zoom', () => {
    expect(parseLatLngFromUrl('https://www.google.com/maps/place/X/@47.2213,-1.5601,17z/data=!x')).toEqual(
      { latitude: 47.2213, longitude: -1.5601 },
    );
  });

  it('lit les coordonnées de la forme !3dlat!4dlng', () => {
    expect(parseLatLngFromUrl('https://www.google.com/maps/place/X/data=!3d47.2213!4d-1.5601')).toEqual(
      { latitude: 47.2213, longitude: -1.5601 },
    );
  });

  it('rend null sans coordonnées', () => {
    expect(parseLatLngFromUrl('https://www.google.com/maps')).toBeNull();
  });

  it('rejette des coordonnées hors des bornes terrestres', () => {
    expect(parseLatLngFromUrl('https://www.google.com/maps/@200,-1.5601,17z/')).toBeNull();
  });
});

describe('toMapsCandidate', () => {
  const raw: RawMapsPlace = {
    name: 'Allard Plomberie',
    address: '11 rue Auguste Brizeux, 44000 Nantes',
    category: 'Plombier',
    phone: '02 40 00 00 00',
    website: 'https://allard-plomberie.fr',
    ratingText: '4,6',
    reviewCountText: '(31)',
    placeUrl: 'https://www.google.com/maps/place/Allard/@47.2214,-1.5602,17z/',
  };

  it('convertit une fiche complète', () => {
    expect(toMapsCandidate(raw)).toEqual({
      name: 'Allard Plomberie',
      address: '11 rue Auguste Brizeux, 44000 Nantes',
      latitude: 47.2214,
      longitude: -1.5602,
      category: 'Plombier',
      phone: '02 40 00 00 00',
      website: 'https://allard-plomberie.fr',
      rating: 4.6,
      reviewCount: 31,
      placeId: null,
      mapsUrl: raw.placeUrl,
    });
  });

  it('rejette une fiche sans nom : elle n est appariable par rien', () => {
    expect(toMapsCandidate({ ...raw, name: '   ' })).toBeNull();
  });

  it('accepte une fiche sans coordonnées, la distance restera inconnue', () => {
    const candidate = toMapsCandidate({ ...raw, placeUrl: 'https://www.google.com/maps' });
    expect(candidate?.latitude).toBeNull();
    expect(candidate?.mapsUrl).toBe('https://www.google.com/maps');
  });

  it('découpe le place_id quand l URL le porte', () => {
    const candidate = toMapsCandidate({
      ...raw,
      placeUrl: 'https://www.google.com/maps/place/X/@47.2,-1.5,17z/data=!19sChIJabc123',
    });
    expect(candidate?.placeId).toBe('ChIJabc123');
  });
});
```

- [ ] **Étape 2 : vérifier l'échec**

```
pnpm --filter @prospeo/collector test
```

Attendu : ÉCHEC, module `./google-maps-normalize.js` introuvable.

- [ ] **Étape 3 : implémenter**

Créer `apps/collector/src/sources/google-maps-normalize.ts` :

```ts
import type { MapsCandidate } from '@prospeo/core';

/**
 * Ce que le navigateur extrait d'une fiche : rien que des chaînes.
 *
 * Le contrat est volontairement plat et textuel. Tout le reste — virgule
 * décimale, séparateurs de milliers, coordonnées noyées dans l'URL — est
 * converti ici, où c'est testable sans navigateur.
 */
export interface RawMapsPlace {
  name: string | null;
  address: string | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  ratingText: string | null;
  reviewCountText: string | null;
  placeUrl: string;
}

/** Note Google, de 0 à 5, virgule décimale française admise. */
export function parseRating(text: string | null): number | null {
  if (text === null) return null;
  // Le signe est capturé : sans lui, « -1 » rendrait 1 au lieu d'être rejeté,
  // c'est-à-dire qu'une valeur hors échelle serait silencieusement tronquée
  // en une note plausible.
  const found = text.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (found === null) return null;
  const value = Number(found[0]);
  // Hors échelle : mieux vaut ne rien savoir qu'affirmer une note fausse.
  if (!Number.isFinite(value) || value < 0 || value > 5) return null;
  return value;
}

/** Nombre d'avis, parenthèses et séparateurs de milliers absorbés. */
export function parseReviewCount(text: string | null): number | null {
  if (text === null) return null;
  // `\s` couvre déjà l'espace insécable (U+00A0) et l'espace fine
  // insécable (U+202F) que Google utilise comme séparateurs de milliers ;
  // on les liste aussi explicitement, en séquences d'échappement littérales,
  // pour ne rien laisser dépendre d'un caractère invisible dans ce fichier.
  //
  // La virgule et le point ne sont volontairement pas dans cette liste :
  // en français la virgule est une marque décimale (« 4,7 »), jamais un
  // séparateur de milliers, et l'espace est le seul séparateur de milliers.
  // Les traiter comme des séparateurs de milliers fusionnerait une note
  // avec un nombre d'avis (« 4,7 (128) » deviendrait 47 au lieu de 128) et
  // produirait une valeur plausible mais fausse. Or ce champ alimente
  // directement le barème de qualification : rendre `null` vaut mieux
  // qu'affirmer un nombre faux.
  const THOUSANDS_SEPARATORS = /[\s\u00a0\u202f]/g;

  // Entre parenthèses, le contenu est le nombre d'avis lui-même — Google
  // n'y place rien d'autre — donc on en extrait les chiffres directement,
  // sans se soucier de ce qui précède les parenthèses (typiquement une
  // note, comme dans « 4,7 (128) »).
  const parenMatch = text.match(/\(([^)]*)\)/);
  if (parenMatch !== null) {
    const inside = (parenMatch[1] ?? '').replace(THOUSANDS_SEPARATORS, '');
    const digits = inside.match(/\d+/);
    if (digits === null) return null;
    const value = Number(digits[0]);
    return Number.isSafeInteger(value) ? value : null;
  }

  // Sans parenthèses, une note et un nombre d'avis peuvent se côtoyer dans
  // la même chaîne (« 128 avis · 4,7 »). On n'accepte donc que le groupe
  // de chiffres en tête de chaîne, une fois les espaces de séparation des
  // milliers retirées, et on le rejette s'il est immédiatement suivi d'une
  // virgule ou d'un point : ce serait alors le début d'une note à virgule
  // décimale, pas un nombre d'avis entier.
  const compact = text.replace(THOUSANDS_SEPARATORS, '');
  const found = compact.match(/^(\d+)(.?)/);
  if (found === null) return null;
  if (found[2] === ',' || found[2] === '.') return null;
  const value = Number(found[1]);
  return Number.isSafeInteger(value) ? value : null;
}

/** Coordonnées d'une URL de fiche, sous l'une ou l'autre de ses deux formes. */
export function parseLatLngFromUrl(
  url: string,
): { latitude: number; longitude: number } | null {
  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const data = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const found = data ?? at;
  if (found === null) return null;

  const latitude = Number(found[1]);
  const longitude = Number(found[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // Hors bornes terrestres : l'URL ne portait pas ce qu'on croyait y lire.
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** Identifiant de lieu, quand l'URL le porte. */
function parsePlaceId(url: string): string | null {
  const found = url.match(/!19s([\w-]+)/) ?? url.match(/[?&]cid=(\d+)/);
  return found?.[1] ?? null;
}

function trimmed(value: string | null): string | null {
  if (value === null) return null;
  const clean = value.trim();
  return clean === '' ? null : clean;
}

/**
 * `null` quand la fiche n'a pas de nom : sans nom elle n'est appariable par
 * rien, et la retenir ne ferait qu'introduire du bruit dans la file ambiguë.
 */
export function toMapsCandidate(raw: RawMapsPlace): MapsCandidate | null {
  const name = trimmed(raw.name);
  if (name === null) return null;

  const coords = parseLatLngFromUrl(raw.placeUrl);

  return {
    name,
    address: trimmed(raw.address),
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    category: trimmed(raw.category),
    phone: trimmed(raw.phone),
    website: trimmed(raw.website),
    rating: parseRating(raw.ratingText),
    reviewCount: parseReviewCount(raw.reviewCountText),
    placeId: parsePlaceId(raw.placeUrl),
    mapsUrl: raw.placeUrl,
  };
}
```

- [ ] **Étape 4 : vérifier le succès**

```
pnpm --filter @prospeo/collector test
pnpm typecheck
```

Attendu : SUCCÈS sur les 17 tests, typage propre.

- [ ] **Étape 5 : commit**

```bash
git add apps/collector/src/sources
git commit -m "feat: conversion pure des champs bruts d une fiche Google Maps"
```

---

## Tâche 5 : Pilotage Playwright de Google Maps

La seule partie du chantier qui ne se teste pas sans navigateur. Elle est
donc réduite au strict minimum : ouvrir, attendre, lire des chaînes, fermer.

**Fichiers :**
- Créer : `apps/collector/src/sources/google-maps.ts`
- Modifier : `apps/collector/package.json` (dépendance `playwright`)
- Modifier : `.env.example`

**Interfaces :**
- Consomme : `RawMapsPlace`, `toMapsCandidate` (tâche 4) ; `MapsCandidate`
  depuis `@prospeo/core`.
- Produit : `BlockedError`, `createGoogleMapsSource(options): MapsSource`, où
  `MapsSource = { search(query: string): Promise<MapsCandidate[]>; close(): Promise<void> }`.
  La tâche 6 consomme les deux.

- [ ] **Étape 1 : ajouter la dépendance**

```bash
pnpm --filter @prospeo/collector add playwright
pnpm exec playwright install chromium
```

- [ ] **Étape 2 : implémenter la source**

Créer `apps/collector/src/sources/google-maps.ts` :

```ts
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
 */
function stripAriaLabel(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value.replace(/^[^:]{0,40}:\s*/, '').trim();
  return cleaned === '' ? null : cleaned;
}

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
  // `domcontentloaded` ne suffit pas : le panneau d'une fiche est rendu après
  // coup, et lire les sélecteurs sans attendre rend `null` sur toute la fiche.
  // Ce n'est pas théorique — une recherche réelle a renvoyé zéro candidat pour
  // cette seule raison, sans lever la moindre erreur.
  await page.waitForSelector(SELECTORS.placeName, { timeout: 15_000 }).catch(() => null);

  const name = await textOf(page, SELECTORS.placeName);
  if (name === null) return null;
  return {
    name,
    address: stripAriaLabel(await attrOf(page, SELECTORS.placeAddress, 'aria-label')),
    category: await textOf(page, SELECTORS.placeCategory),
    phone: stripAriaLabel(await attrOf(page, SELECTORS.placePhone, 'aria-label')),
    website: await attrOf(page, SELECTORS.placeWebsite, 'href'),
    ratingText: await textOf(page, SELECTORS.placeRating),
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
function mergePlace(card: RawMapsPlace, detail: RawMapsPlace | null): RawMapsPlace {
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

        // Google décide APRÈS le chargement s'il affiche une liste ou une
        // fiche unique, et il réécrit alors l'URL en `/maps/place/` — mesuré à
        // cinq secondes sur une recherche réelle. Trancher plus tôt fait
        // prendre une fiche unique pour une liste vide : la recherche renvoie
        // zéro candidat sans lever la moindre erreur, et l'étage conclut
        // « introuvable » sur précisément les appariements les plus sûrs,
        // ceux dont le nom ne désigne qu'une entreprise.
        await Promise.race([
          page.waitForURL(/\/maps\/place\//, { timeout: 15_000 }),
          page.waitForSelector(SELECTORS.feed, { timeout: 15_000 }),
        ]).catch(() => null);
        assertNotBlocked(page.url());

        // Résultat unique : Maps a ouvert directement la fiche.
        if (page.url().includes('/maps/place/')) {
          const single = await readPlacePanel(page);
          if (single === null) return [];
          const candidate = toMapsCandidate(single);
          return candidate === null ? [] : [candidate];
        }
        // On part des liens, pas des conteneurs : le flux contient aussi des
        // éléments de mise en page sans lien, qui consommeraient sinon une
        // place du quota de candidats sans jamais rien apporter. Constaté sur
        // une recherche réelle — 9 conteneurs pour 8 fiches.
        const links = await page.locator(SELECTORS.cardLink).all();

        const raws: RawMapsPlace[] = [];
        for (const link of links.slice(0, settings.maxCandidates)) {
          const href = await link.getAttribute('href').catch(() => null);
          if (href === null) continue;
          raws.push({
            name: await textOf(link, SELECTORS.cardName),
            address: null,
            category: null,
            phone: null,
            website: null,
            ratingText: await textOf(link, SELECTORS.cardRating),
            // Google ne publie plus le nombre d'avis. Voir la note de `SELECTORS`.
            reviewCountText: null,
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
          const candidate = toMapsCandidate(mergePlace(raw, detail));
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
```

- [x] **Étape 3 : vérification sur une recherche réelle — FAITE le 1er septembre 2026**

Menée sur `google.com/maps`, requêtes « plombier Nantes » et « "Ze Plombier"
Nantes ». Elle a trouvé cinq défauts, dont un qui aurait vidé l'étage `enrich`
de sa substance sans jamais lever d'erreur, et les correctifs sont intégrés au
code ci-dessus. Les constats sont consignés dans le message du commit
`4aeb839` et dans le §4.5 du spec.

Résultat final vérifié :

```
"Ze Plombier" Nantes  -> 1 candidat
  { name: "Ze Plombier - Nantes", address: "25 Rue Petite Biesse, 44200 Nantes, France",
    latitude: 47.203728, longitude: -1.5474297, category: "Plombier",
    phone: "+33 2 85 52 26 00", website: "https://www.zeplombier.fr/",
    rating: 4.8, reviewCount: null }
```

**À refaire à chaque reprise du chantier après une interruption longue.**
Google renomme ses classes sans préavis, et un sélecteur muet ne casse rien —
il produit des `not_found` en masse qui ressemblent à des artisans réellement
absents d'internet.

- [ ] **Étape 4 : documenter et ignorer le profil**

Ajouter à `.gitignore` :

```
.playwright-profile/
```

Ajouter à `.env.example` :

```
# Répertoire du profil de navigateur persistant. Il retient le consentement
# Google : le supprimer fait réapparaître la bannière à chaque run.
# PLAYWRIGHT_USER_DATA_DIR=.playwright-profile
```

- [ ] **Étape 5 : commit**

```bash
git add apps/collector .gitignore .env.example
git commit -m "feat: source Google Maps pilotee par Playwright, contexte persistant"
```

---

## Tâche 6 : Étage `enrich`

**Fichiers :**
- Créer : `supabase/migrations/<horodatage>_enrichment_candidates.sql`
- Créer : `apps/collector/src/stages/enrich.ts`
- Créer : `apps/collector/src/stages/enrich.test.ts`
- Modifier : `apps/collector/src/cli.ts`
- Modifier : `packages/db/src/database.types.ts` (régénéré, jamais édité)

**Interfaces :**
- Consomme : `selectMatch`, `MATCHING_CONFIG`, `MatchSubject`,
  `MapsCandidate` (tâche 3) ; `MapsSource`, `BlockedError` (tâche 5).
- Produit : `EnrichmentRow`, `buildEnrichmentRow`, `runEnrich`.

- [ ] **Étape 1 : créer et appliquer la migration**

```bash
pnpm exec supabase migration new enrichment_candidates
```

Contenu du fichier créé :

```sql
-- La file de revue interroge `prospect_enrichment` par statut, et `enrich`
-- sélectionne les prospects à (re)traiter par le même champ.
create index prospect_enrichment_status_idx on prospect_enrichment (status);

-- Un cas `ambiguous` doit conserver ce qui a été vu, sinon la revue manuelle
-- n'aurait rien à trancher : il faudrait relancer le scraping pour redécouvrir
-- des candidats qu'on avait déjà sous la main.
alter table prospect_enrichment
  add column candidates jsonb not null default '[]'::jsonb;
```

Puis :

```bash
pnpm db:push --dry-run
pnpm db:push
pnpm db:types
```

Attendu : la migration passe, `packages/db/src/database.types.ts` est
régénéré.

- [ ] **Étape 2 : écrire les tests qui échouent**

Créer `apps/collector/src/stages/enrich.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { MATCHING_CONFIG, getTrade, type MapsCandidate } from '@prospeo/core';
import { buildEnrichmentRow, runEnrich, type EnrichProspect } from './enrich.js';
import { BlockedError } from '../sources/google-maps.js';

const trade = getTrade('plombier');
if (trade === undefined) throw new Error('métier plombier absent');

const prospect: EnrichProspect = {
  id: 'p1',
  denomination: 'SARL ALLARD',
  denominationUsuelle: null,
  city: 'NANTES',
  address: '11 rue Auguste Brizeux 44000 NANTES',
  latitude: 47.2213,
  longitude: -1.5601,
};

function candidate(over: Partial<MapsCandidate> = {}): MapsCandidate {
  return {
    name: 'Allard Plomberie',
    address: null,
    latitude: 47.2214,
    longitude: -1.5602,
    category: 'Plombier',
    phone: '02 40 00 00 00',
    website: 'https://facebook.com/allard',
    rating: 4.6,
    reviewCount: 31,
    placeId: 'abc',
    mapsUrl: 'https://maps.google.com/1',
    ...over,
  };
}

describe('buildEnrichmentRow', () => {
  it('écrit les champs de la fiche quand la fusion est automatique', () => {
    const row = buildEnrichmentRow(prospect, [candidate()], trade, MATCHING_CONFIG);
    expect(row.status).toBe('ok');
    expect(row.phone_e164).toBe('+33240000000');
    expect(row.declared_url).toBe('https://facebook.com/allard');
    expect(row.rating).toBe(4.6);
    expect(row.match_confidence).toBeGreaterThan(MATCHING_CONFIG.highThreshold);
  });

  it('n écrit aucune donnée de fiche quand le cas est ambigu', () => {
    // Écrire un téléphone non validé le rendrait indiscernable d un
    // téléphone confirmé, et il finirait composé.
    const row = buildEnrichmentRow(
      prospect,
      [candidate({ name: 'Allardin Chauffage', category: 'Chauffagiste' })],
      trade,
      MATCHING_CONFIG,
    );
    expect(row.status).toBe('ambiguous');
    expect(row.phone_e164).toBeNull();
    expect(row.declared_url).toBeNull();
  });

  it('conserve les candidats ambigus pour la revue', () => {
    const row = buildEnrichmentRow(
      prospect,
      [candidate({ name: 'Allardin Chauffage', category: 'Chauffagiste' })],
      trade,
      MATCHING_CONFIG,
    );
    expect(Array.isArray(row.candidates)).toBe(true);
    expect(row.candidates).toHaveLength(1);
  });

  it('marque not_found sans candidat', () => {
    const row = buildEnrichmentRow(prospect, [], trade, MATCHING_CONFIG);
    expect(row.status).toBe('not_found');
    expect(row.matched_name).toBeNull();
  });

  it('classe une URL de site propre comme telle', () => {
    const row = buildEnrichmentRow(
      prospect,
      [candidate({ website: 'https://allard-plomberie.fr' })],
      trade,
      MATCHING_CONFIG,
    );
    expect(row.declared_url).toBe('https://allard-plomberie.fr');
  });
});

describe('runEnrich', () => {
  function source(results: MapsCandidate[][]) {
    let call = 0;
    return {
      search: vi.fn(async () => results[call++] ?? []),
      close: vi.fn(async () => undefined),
    };
  }

  it('écrit une ligne par prospect', async () => {
    const upsert = vi.fn(async () => undefined);
    const report = await runEnrich({
      prospects: [prospect],
      trade,
      config: MATCHING_CONFIG,
      source: source([[candidate()]]),
      upsert,
      dailyRemaining: 10,
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ processed: 1, ok: 1, blocked: false });
  });

  it('s arrête au plafond journalier sans le dépasser', async () => {
    const upsert = vi.fn(async () => undefined);
    const report = await runEnrich({
      prospects: [prospect, { ...prospect, id: 'p2' }, { ...prospect, id: 'p3' }],
      trade,
      config: MATCHING_CONFIG,
      source: source([[candidate()], [candidate()], [candidate()]]),
      upsert,
      dailyRemaining: 2,
    });
    expect(report.processed).toBe(2);
    expect(report.stoppedByCap).toBe(true);
  });

  it('interrompt le run sur BlockedError et marque le prospect', async () => {
    const upsert = vi.fn(async () => undefined);
    const blocking = {
      search: vi.fn(async () => {
        throw new BlockedError('https://google.com/sorry/index');
      }),
      close: vi.fn(async () => undefined),
    };
    const report = await runEnrich({
      prospects: [prospect, { ...prospect, id: 'p2' }],
      trade,
      config: MATCHING_CONFIG,
      source: blocking,
      upsert,
      dailyRemaining: 10,
    });
    expect(report.blocked).toBe(true);
    expect(report.processed).toBe(0);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked' }));
    // Le second prospect n est pas tenté : marteler une protection la durcit.
    expect(blocking.search).toHaveBeenCalledTimes(1);
  });

  it('poursuit le run malgré une erreur isolée sur un prospect', async () => {
    const upsert = vi.fn(async () => undefined);
    let call = 0;
    const flaky = {
      search: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error('temps dépassé');
        return [candidate()];
      }),
      close: vi.fn(async () => undefined),
    };
    const report = await runEnrich({
      prospects: [prospect, { ...prospect, id: 'p2' }],
      trade,
      config: MATCHING_CONFIG,
      source: flaky,
      upsert,
      dailyRemaining: 10,
    });
    expect(report.failed).toBe(1);
    expect(report.ok).toBe(1);
    expect(report.blocked).toBe(false);
  });
});
```

- [ ] **Étape 3 : vérifier l'échec**

```
pnpm --filter @prospeo/collector test
```

Attendu : ÉCHEC, module `./enrich.js` introuvable.

- [ ] **Étape 4 : implémenter l'étage**

Créer `apps/collector/src/stages/enrich.ts` :

```ts
import {
  normalizePhone,
  selectMatch,
  type MapsCandidate,
  type MatchingConfig,
  type MatchSubject,
  type ScoredCandidate,
  type Trade,
} from '@prospeo/core';
import { BlockedError, type MapsSource } from '../sources/google-maps.js';

export interface EnrichProspect {
  id: string;
  denomination: string;
  denominationUsuelle: string | null;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

/** Ce que l'étage écrit dans `prospect_enrichment`. */
export interface EnrichmentRow {
  prospect_id: string;
  source: string;
  matched_name: string | null;
  match_confidence: number | null;
  phone_e164: string | null;
  phone_kind: string | null;
  declared_url: string | null;
  social_urls: string[];
  rating: number | null;
  review_count: number | null;
  place_id: string | null;
  maps_url: string | null;
  /** Candidats conservés pour la revue manuelle ; vide hors `ambiguous`. */
  candidates: unknown[];
  status: 'ok' | 'not_found' | 'ambiguous' | 'blocked';
  enriched_at: string;
}

const SOURCE = 'google_maps';

function emptyRow(prospectId: string, status: EnrichmentRow['status']): EnrichmentRow {
  return {
    prospect_id: prospectId,
    source: SOURCE,
    matched_name: null,
    match_confidence: null,
    phone_e164: null,
    phone_kind: null,
    declared_url: null,
    social_urls: [],
    rating: null,
    review_count: null,
    place_id: null,
    maps_url: null,
    candidates: [],
    status,
    enriched_at: new Date().toISOString(),
  };
}

/** Ce qu'on garde d'un candidat écarté, pour que la revue puisse trancher. */
function forReview(scored: ScoredCandidate): unknown {
  return {
    name: scored.candidate.name,
    address: scored.candidate.address,
    phone: scored.candidate.phone,
    website: scored.candidate.website,
    mapsUrl: scored.candidate.mapsUrl,
    confidence: scored.score.confidence,
    lines: scored.score.lines,
  };
}

export function buildEnrichmentRow(
  prospect: EnrichProspect,
  candidates: readonly MapsCandidate[],
  trade: Trade,
  config: MatchingConfig,
): EnrichmentRow {
  const subject: MatchSubject = {
    denomination: prospect.denomination,
    denominationUsuelle: prospect.denominationUsuelle,
    latitude: prospect.latitude,
    longitude: prospect.longitude,
  };
  const outcome = selectMatch(subject, candidates, trade, config);

  if (outcome.kind === 'not_found') return emptyRow(prospect.id, 'not_found');

  if (outcome.kind === 'ambiguous') {
    // Aucune donnée de fiche n'est écrite. Un téléphone non validé serait
    // indiscernable d'un téléphone confirmé, et finirait composé.
    const row = emptyRow(prospect.id, 'ambiguous');
    row.candidates = outcome.scored.map(forReview);
    return row;
  }

  const phone = normalizePhone(outcome.candidate.phone);
  const row = emptyRow(prospect.id, 'ok');
  row.matched_name = outcome.candidate.name;
  row.match_confidence = outcome.score.confidence;
  row.phone_e164 = phone?.e164 ?? null;
  row.phone_kind = phone?.kind ?? null;
  row.declared_url = outcome.candidate.website;
  row.rating = outcome.candidate.rating;
  row.review_count = outcome.candidate.reviewCount;
  row.place_id = outcome.candidate.placeId;
  row.maps_url = outcome.candidate.mapsUrl;
  return row;
}

export interface EnrichReport {
  processed: number;
  ok: number;
  ambiguous: number;
  notFound: number;
  failed: number;
  blocked: boolean;
  stoppedByCap: boolean;
}

export interface RunEnrichOptions {
  prospects: readonly EnrichProspect[];
  trade: Trade;
  config: MatchingConfig;
  source: MapsSource;
  upsert: (row: EnrichmentRow) => Promise<void>;
  /** Nombre de fiches encore autorisées aujourd'hui. */
  dailyRemaining: number;
}

/** Requêtes tentées dans l'ordre ; l'enseigne d'abord, c'est elle que Maps connaît. */
function queriesFor(prospect: EnrichProspect, trade: Trade): string[] {
  const queries: string[] = [];
  if (prospect.denominationUsuelle !== null) {
    queries.push(`"${prospect.denominationUsuelle}" ${prospect.city}`);
  }
  queries.push(`"${prospect.denomination}" ${prospect.city}`);
  const fallback = trade.mapsQueries[0] ?? trade.slug;
  queries.push(`${fallback} ${prospect.address}`);
  return queries;
}

export async function runEnrich(options: RunEnrichOptions): Promise<EnrichReport> {
  const report: EnrichReport = {
    processed: 0,
    ok: 0,
    ambiguous: 0,
    notFound: 0,
    failed: 0,
    blocked: false,
    stoppedByCap: false,
  };

  for (const prospect of options.prospects) {
    if (report.processed >= options.dailyRemaining) {
      report.stoppedByCap = true;
      break;
    }

    try {
      let candidates: MapsCandidate[] = [];
      for (const query of queriesFor(prospect, options.trade)) {
        candidates = await options.source.search(query);
        if (candidates.length > 0) break;
      }

      const row = buildEnrichmentRow(prospect, candidates, options.trade, options.config);
      await options.upsert(row);

      report.processed += 1;
      if (row.status === 'ok') report.ok += 1;
      else if (row.status === 'ambiguous') report.ambiguous += 1;
      else report.notFound += 1;
    } catch (error) {
      if (error instanceof BlockedError) {
        // Le run s'arrête net. Continuer martèlerait une protection qui vient
        // de se déclencher, ce qui la durcit et remplit la base de fiches
        // vides indiscernables de vraies absences.
        await options.upsert(emptyRow(prospect.id, 'blocked'));
        report.blocked = true;
        break;
      }
      report.failed += 1;
      process.stderr.write(
        `enrich: échec sur ${prospect.id} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return report;
}
```

- [ ] **Étape 5 : vérifier le succès**

```
pnpm --filter @prospeo/collector test
pnpm typecheck
```

Attendu : SUCCÈS sur les 9 tests de `enrich`.

- [ ] **Étape 6 : brancher la commande dans le CLI**

Dans `apps/collector/src/cli.ts` : ajouter `'enrich'` à `COMMANDS`, la ligne
correspondante dans `USAGE`, et le `case` :

```ts
    case 'enrich': {
      const slug = flag(argv, 'trade');
      if (slug === undefined) {
        process.stderr.write('enrich exige --trade\n');
        return 1;
      }
      const trade = getTrade(slug);
      if (trade === undefined) {
        process.stderr.write(`Métier inconnu : ${slug}\n`);
        return 1;
      }

      const config = loadConfig(process.env);
      const client = createClient(config);

      // Prospects sans enrichissement, ou dont le dernier run a été bloqué.
      const enriched = new Map<string, string>();
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect_enrichment')
          .select('prospect_id, status')
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) enriched.set(row.prospect_id, row.status);
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      const prospects: EnrichProspect[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect')
          .select('id, denomination, denomination_usuelle, city, address, latitude, longitude')
          .eq('trade_slug', trade.slug)
          .order('id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          const status = enriched.get(row.id);
          // `not_found` n'est pas rejoué automatiquement : c'est un verdict,
          // pas un échec. `--retry-not-found` le rouvre explicitement.
          if (status === 'ok' || status === 'ambiguous') continue;
          if (status === 'not_found' && !argv.includes('--retry-not-found')) continue;
          prospects.push({
            id: row.id,
            denomination: row.denomination,
            denominationUsuelle: row.denomination_usuelle,
            city: row.city,
            address: row.address,
            latitude: row.latitude,
            longitude: row.longitude,
          });
        }
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      // Plafond journalier : compté depuis la base, donc respecté même après
      // un redémarrage du processus.
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { count, error: countError } = await client
        .from('prospect_enrichment')
        .select('prospect_id', { count: 'exact', head: true })
        .gte('enriched_at', since.toISOString());
      if (countError) throw new Error(countError.message);
      const dailyRemaining = Math.max(0, DAILY_CAP - (count ?? 0));

      const source = createGoogleMapsSource({
        userDataDir: process.env.PLAYWRIGHT_USER_DATA_DIR ?? '.playwright-profile',
      });

      let report;
      try {
        report = await runEnrich({
          prospects,
          trade,
          config: MATCHING_CONFIG,
          source,
          dailyRemaining,
          upsert: async (row) => {
            const { error } = await client
              .from('prospect_enrichment')
              .upsert(row, { onConflict: 'prospect_id' });
            if (error) throw new Error(error.message);
          },
        });
      } finally {
        await source.close();
      }

      process.stdout.write(
        `enrich ${trade.slug} : ${report.ok} appariés, ${report.ambiguous} à trancher, ` +
          `${report.notFound} introuvables, ${report.failed} en échec ` +
          `(${source.navigations} pages Google chargées)\n`,
      );
      if (report.stoppedByCap) {
        process.stdout.write(`Plafond journalier de ${DAILY_CAP} prospects atteint.\n`);
      }
      if (report.blocked) {
        process.stderr.write('Arrêt : Google a interposé une vérification.\n');
        // Code 2, distinct du 1 des erreurs d usage : une automatisation doit
        // pouvoir reconnaître un blocage anti-bot sans lire stderr.
        return 2;
      }
      return 0;
    }
```

Ajouter en tête de fichier les imports et la constante :

```ts
import { getTrade, MATCHING_CONFIG } from '@prospeo/core';
import { createGoogleMapsSource } from './sources/google-maps.js';
import { runEnrich, type EnrichProspect } from './stages/enrich.js';

/**
 * Plafond de prospects enrichis par jour.
 *
 * Il compte des **prospects**, pas des requêtes envoyées à Google, et l'écart
 * n'est pas anodin : un prospect coûte une navigation de recherche, plus une
 * par fiche ouverte — jusqu'à six. C'est pourtant ce compteur-là qu'on
 * retient, parce que c'est le seul qui survive à un redémarrage : il se relit
 * depuis la base, alors qu'un compteur de navigations exigerait une table.
 *
 * Le volume réellement envoyé à Google est donc rapporté séparément en fin de
 * run, via `source.navigations`, pour rester visible plutôt que deviné.
 */
const DAILY_CAP = 300;
```

`getTrade` est déjà importé par `discover` : compléter la ligne existante
plutôt que d'en ajouter une seconde.

- [ ] **Étape 7 : vérifier de bout en bout sur les 25**

```bash
pnpm --filter @prospeo/collector start enrich --trade plombier
```

Attendu : un compte-rendu chiffré, aucune exception, et des lignes réelles
dans `prospect_enrichment`.

- [ ] **Étape 8 : commit**

```bash
git add apps/collector supabase packages/db
git commit -m "feat: etage enrich, plafond journalier et arret sur blocage"
```

---

## Jalon : calibration des seuils

**Ce n'est pas une tâche de code.** Elle s'exécute après la tâche 7, quand la
commande `review` existe, et elle conditionne les tâches suivantes.

Lancer `enrich` puis `review` sur les 25 prospects, examiner chaque décision,
et ajuster `MATCHING_CONFIG` en conséquence. Trois questions à trancher sur
pièces :

- Un cas fusionné automatiquement était-il faux ? Alors le seuil haut est
  trop bas.
- Un cas évident est-il parti en `ambiguous` ? Alors le seuil haut est trop
  haut, ou la pondération du nom trop faible.
- Un vrai candidat a-t-il été éliminé par la distance ? Alors
  `maxDistanceM` est trop serré.

Tout changement de réglage s'accompagne d'un incrément de
`MATCHING_CONFIG.version` et d'un `enrich --retry-not-found` sur la
population concernée.

---

## Tâche 7 : Commande `review`

**Fichiers :**
- Créer : `packages/core/src/naf.ts`
- Créer : `packages/core/src/naf.test.ts`
- Créer : `apps/collector/src/stages/review.ts`
- Créer : `apps/collector/src/stages/review.test.ts`
- Modifier : `packages/core/src/index.ts`, `apps/collector/src/cli.ts`

**Interfaces :**
- Consomme : `Trade` ; les lignes `candidates` écrites par la tâche 6.
- Produit : `nafMatchesTrade`, `applyReviewDecision`, `ReviewDecision`.

- [ ] **Étape 1 : écrire les tests qui échouent pour `nafMatchesTrade`**

Créer `packages/core/src/naf.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { nafMatchesTrade } from './naf.js';
import { getTrade } from './trades.js';

const plombier = getTrade('plombier');
if (plombier === undefined) throw new Error('métier plombier absent');

describe('nafMatchesTrade', () => {
  it('reconnaît le code du métier', () => {
    expect(nafMatchesTrade('43.22A', plombier)).toBe(true);
  });

  it('signale un code étranger au métier', () => {
    // Cas réel : GROUPE AMH, retenu parce que l entreprise est plombier,
    // mais dont l établissement fait de l installation électrique.
    expect(nafMatchesTrade('43.21A', plombier)).toBe(false);
  });

  it('tolère un code sans point', () => {
    expect(nafMatchesTrade('4322A', plombier)).toBe(true);
  });

  it('rend null quand le code est inconnu, sans le supposer divergent', () => {
    expect(nafMatchesTrade(null, plombier)).toBeNull();
  });
});
```

- [ ] **Étape 2 : vérifier l'échec, puis implémenter**

```
pnpm --filter @prospeo/core test
```

Attendu : ÉCHEC. Créer alors `packages/core/src/naf.ts` :

```ts
import type { Trade } from './types.js';

/** Retire le point : `43.22A` et `4322A` désignent la même activité. */
function canonical(code: string): string {
  return code.replace(/\./g, '').toUpperCase();
}

/**
 * Le NAF de l'établissement correspond-il au métier visé ?
 *
 * L'API filtre l'activité au niveau de l'ENTREPRISE et le code postal au
 * niveau de l'ÉTABLISSEMENT : un établissement retenu ne porte donc pas
 * nécessairement le métier cherché. Mesuré à 4 % sur le premier lot.
 *
 * On signale sans écarter : l'entreprise est bien du métier, l'établissement
 * peut exercer les deux activités ou porter un code périmé. `null` dit
 * « inconnu », qui n'est pas « divergent ».
 */
export function nafMatchesTrade(nafCode: string | null, trade: Trade): boolean | null {
  if (nafCode === null || nafCode.trim() === '') return null;
  const target = canonical(nafCode);
  return trade.nafCodes.some((code) => canonical(code) === target);
}
```

Exporter depuis `packages/core/src/index.ts` :

```ts
export * from './naf.js';
```

- [ ] **Étape 3 : écrire les tests qui échouent pour la décision de revue**

Créer `apps/collector/src/stages/review.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { applyReviewDecision, type ReviewCandidate } from './review.js';

const candidates: ReviewCandidate[] = [
  {
    name: 'Allard Plomberie',
    address: '11 rue Auguste Brizeux',
    phone: '02 40 00 00 00',
    website: 'https://facebook.com/allard',
    mapsUrl: 'https://maps.google.com/1',
    confidence: 0.78,
    lines: [],
  },
  {
    name: 'Allardin Chauffage',
    address: null,
    phone: null,
    website: null,
    mapsUrl: 'https://maps.google.com/2',
    confidence: 0.61,
    lines: [],
  },
];

describe('applyReviewDecision', () => {
  it('promeut le candidat retenu en enrichissement confirmé', () => {
    const row = applyReviewDecision('p1', candidates, { kind: 'accept', index: 0 });
    expect(row.status).toBe('ok');
    expect(row.matched_name).toBe('Allard Plomberie');
    expect(row.phone_e164).toBe('+33240000000');
    expect(row.candidates).toEqual([]);
  });

  it('marque not_found quand aucun candidat ne convient', () => {
    const row = applyReviewDecision('p1', candidates, { kind: 'reject' });
    expect(row.status).toBe('not_found');
    expect(row.phone_e164).toBeNull();
  });

  it('laisse la ligne intacte quand la décision est reportée', () => {
    const row = applyReviewDecision('p1', candidates, { kind: 'skip' });
    expect(row.status).toBe('ambiguous');
    expect(row.candidates).toHaveLength(2);
  });

  it('refuse un indice hors bornes plutôt que d écrire une fiche vide', () => {
    expect(() => applyReviewDecision('p1', candidates, { kind: 'accept', index: 9 })).toThrow();
  });
});
```

- [ ] **Étape 4 : vérifier l'échec, puis implémenter**

Créer `apps/collector/src/stages/review.ts` :

```ts
import { normalizePhone, type MatchLine } from '@prospeo/core';
import type { EnrichmentRow } from './enrich.js';

/** Un candidat tel qu'il a été conservé par `enrich` pour la revue. */
export interface ReviewCandidate {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string;
  confidence: number;
  lines: MatchLine[];
}

export type ReviewDecision =
  | { kind: 'accept'; index: number }
  | { kind: 'reject' }
  | { kind: 'skip' };

/**
 * Traduit une décision humaine en ligne d'enrichissement.
 *
 * Pure et testée à dessein : c'est elle que le dashboard réutilisera quand il
 * offrira la même file. Seule la coquille interactive sera réécrite.
 */
export function applyReviewDecision(
  prospectId: string,
  candidates: readonly ReviewCandidate[],
  decision: ReviewDecision,
): EnrichmentRow {
  const base: EnrichmentRow = {
    prospect_id: prospectId,
    source: 'google_maps',
    matched_name: null,
    match_confidence: null,
    phone_e164: null,
    phone_kind: null,
    declared_url: null,
    social_urls: [],
    rating: null,
    review_count: null,
    place_id: null,
    maps_url: null,
    candidates: [],
    status: 'not_found',
    enriched_at: new Date().toISOString(),
  };

  if (decision.kind === 'reject') return base;

  if (decision.kind === 'skip') {
    return { ...base, status: 'ambiguous', candidates: [...candidates] };
  }

  const chosen = candidates[decision.index];
  if (chosen === undefined) {
    // Écrire une fiche vide sur un indice erroné effacerait des candidats que
    // personne n'a écartés.
    throw new Error(`Aucun candidat à l'indice ${decision.index}`);
  }

  const phone = normalizePhone(chosen.phone);
  return {
    ...base,
    status: 'ok',
    matched_name: chosen.name,
    match_confidence: chosen.confidence,
    phone_e164: phone?.e164 ?? null,
    phone_kind: phone?.kind ?? null,
    declared_url: chosen.website,
    maps_url: chosen.mapsUrl,
  };
}
```

- [ ] **Étape 5 : vérifier le succès**

```
pnpm test
pnpm typecheck
```

Attendu : SUCCÈS.

- [ ] **Étape 6 : ajouter la coquille interactive au CLI**

Ajouter `'review'` à `COMMANDS`, la ligne dans `USAGE`, et le `case` :

```ts
    case 'review': {
      const config = loadConfig(process.env);
      const client = createClient(config);
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      // Paginé comme toute lecture du projet : la file ambiguë est courte
      // aujourd'hui, mais une lecture non paginée présenterait une tranche
      // arbitraire comme la file complète le jour où elle ne le sera plus.
      const queue: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect_enrichment')
          .select('prospect_id, candidates, prospect(denomination, denomination_usuelle, address, naf_code, trade_slug)')
          .eq('status', 'ambiguous')
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        queue.push(...((data ?? []) as unknown as Record<string, unknown>[]));
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      let settled = 0;
      for (const row of queue) {
        const p = (Array.isArray(row.prospect) ? row.prospect[0] : row.prospect) as
          | Record<string, unknown>
          | null;
        if (p === null) continue;

        const trade = getTrade(p.trade_slug as string);
        const nafOk = trade === undefined ? null : nafMatchesTrade(p.naf_code as string | null, trade);

        process.stdout.write(`\n${'─'.repeat(60)}\n`);
        process.stdout.write(`${p.denomination as string}\n${p.address as string}\n`);
        if (nafOk === false) {
          process.stdout.write(`⚠ NAF ${p.naf_code as string} étranger au métier ${trade?.label ?? ''}\n`);
        }

        const candidates = (row.candidates ?? []) as ReviewCandidate[];
        candidates.forEach((c, index) => {
          process.stdout.write(`\n  [${index + 1}] ${c.name}  (confiance ${c.confidence.toFixed(2)})\n`);
          for (const line of c.lines) process.stdout.write(`      ${line.label}\n`);
          if (c.phone !== null) process.stdout.write(`      tél. ${c.phone}\n`);
          if (c.website !== null) process.stdout.write(`      ${c.website}\n`);
        });

        const answer = (await rl.question('\n  Numéro à retenir, [a]ucun, [p]lus tard : ')).trim();
        const decision: ReviewDecision =
          answer === 'a'
            ? { kind: 'reject' }
            : answer === 'p' || answer === ''
              ? { kind: 'skip' }
              : { kind: 'accept', index: Number(answer) - 1 };

        if (decision.kind === 'skip') continue;
        try {
          const updated = applyReviewDecision(row.prospect_id as string, candidates, decision);
          const { error: writeError } = await client
            .from('prospect_enrichment')
            .upsert(updated, { onConflict: 'prospect_id' });
          if (writeError) throw new Error(writeError.message);
          settled += 1;
        } catch (failure) {
          process.stderr.write(
            `review: ${failure instanceof Error ? failure.message : String(failure)}\n`,
          );
        }
      }

      rl.close();
      process.stdout.write(`\nreview : ${settled} cas tranchés\n`);
      return 0;
    }
```

Imports à ajouter en tête :

```ts
import { createInterface } from 'node:readline/promises';
import { nafMatchesTrade } from '@prospeo/core';
import {
  applyReviewDecision,
  type ReviewCandidate,
  type ReviewDecision,
} from './stages/review.js';
```

- [ ] **Étape 7 : commit**

```bash
git add packages/core apps/collector
git commit -m "feat: revue manuelle des appariements douteux, et drapeau NAF"
```

---

## Tâche 8 : Étage `reconcile`

**Fichiers :**
- Créer : `supabase/migrations/<horodatage>_prospect_reconciliation.sql`
- Créer : `apps/collector/src/stages/reconcile.ts`
- Créer : `apps/collector/src/stages/reconcile.test.ts`
- Modifier : `apps/collector/src/sources/recherche-entreprises.ts`
- Modifier : `apps/collector/src/cli.ts`

**Interfaces :**
- Produit : `SireneStatus`, `decideReconciliation`, `fetchStatusBySiret`,
  `runReconcile`.

- [ ] **Étape 1 : créer et appliquer la migration**

```bash
pnpm exec supabase migration new prospect_reconciliation
```

```sql
-- `is_closed` branche enfin le disqualifiant du barème : il existait dans
-- `scoring.ts` mais `cli.ts` écrivait `isClosed: false` en dur, faute de
-- source. Sans réconciliation, on continuerait d'appeler des entreprises
-- fermées en les classant bien.
alter table prospect add column is_closed boolean not null default false;

-- Idempotence de l'étage : on ne revérifie pas ce qui vient de l'être.
alter table prospect add column reconciled_at timestamptz;
```

```bash
pnpm db:push --dry-run && pnpm db:push && pnpm db:types
```

- [ ] **Étape 2 : écrire les tests qui échouent**

Créer `apps/collector/src/stages/reconcile.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { decideReconciliation, runReconcile } from './reconcile.js';

describe('decideReconciliation', () => {
  it('conserve un établissement actif et diffusible', () => {
    expect(decideReconciliation({ kind: 'active' })).toBe('keep');
  });

  it('clôt un établissement cessé sans le supprimer', () => {
    // La cessation n est pas un motif juridique de suppression, et
    // l historique de prospection garde sa valeur.
    expect(decideReconciliation({ kind: 'closed' })).toBe('close');
  });

  it('supprime un établissement non diffusible', () => {
    expect(decideReconciliation({ kind: 'undiffusible' })).toBe('delete');
  });

  it('supprime un SIRET devenu absent de l API', () => {
    // Absent et non diffusible sont indiscernables de l extérieur ; on
    // retient l hypothèse qui respecte l obligation de conservation.
    expect(decideReconciliation({ kind: 'absent' })).toBe('delete');
  });
});

describe('runReconcile', () => {
  it('applique une action par prospect', async () => {
    const remove = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const touch = vi.fn(async () => undefined);

    const report = await runReconcile({
      prospects: [
        { id: 'p1', siret: '1' },
        { id: 'p2', siret: '2' },
        { id: 'p3', siret: '3' },
      ],
      fetchStatus: async (siret) =>
        siret === '1' ? { kind: 'active' } : siret === '2' ? { kind: 'closed' } : { kind: 'absent' },
      remove,
      close,
      touch,
    });

    expect(report).toMatchObject({ kept: 1, closed: 1, deleted: 1, failed: 0 });
    expect(remove).toHaveBeenCalledWith('p3');
    expect(close).toHaveBeenCalledWith('p2');
  });

  it('poursuit malgré un échec réseau isolé', async () => {
    const report = await runReconcile({
      prospects: [
        { id: 'p1', siret: '1' },
        { id: 'p2', siret: '2' },
      ],
      fetchStatus: async (siret) => {
        if (siret === '1') throw new Error('réseau');
        return { kind: 'active' };
      },
      remove: async () => undefined,
      close: async () => undefined,
      touch: async () => undefined,
    });
    expect(report.failed).toBe(1);
    expect(report.kept).toBe(1);
  });

  it('ne supprime rien sur une erreur réseau', async () => {
    const remove = vi.fn(async () => undefined);
    await runReconcile({
      prospects: [{ id: 'p1', siret: '1' }],
      fetchStatus: async () => {
        throw new Error('réseau');
      },
      remove,
      close: async () => undefined,
      touch: async () => undefined,
    });
    expect(remove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Étape 3 : vérifier l'échec, puis implémenter**

Créer `apps/collector/src/stages/reconcile.ts` :

```ts
export type SireneStatus =
  | { kind: 'active' }
  | { kind: 'closed' }
  | { kind: 'undiffusible' }
  | { kind: 'absent' };

export type ReconcileAction = 'keep' | 'close' | 'delete';

/**
 * Un établissement absent de l'API et un établissement non diffusible sont
 * indiscernables de l'extérieur — l'API cesse de renvoyer les deux. On retient
 * l'hypothèse qui respecte l'obligation de conservation.
 */
export function decideReconciliation(status: SireneStatus): ReconcileAction {
  switch (status.kind) {
    case 'active':
      return 'keep';
    case 'closed':
      return 'close';
    default:
      return 'delete';
  }
}

export interface ReconcileProspect {
  id: string;
  siret: string;
}

export interface ReconcileReport {
  kept: number;
  closed: number;
  deleted: number;
  failed: number;
}

export interface RunReconcileOptions {
  prospects: readonly ReconcileProspect[];
  fetchStatus: (siret: string) => Promise<SireneStatus>;
  remove: (prospectId: string) => Promise<void>;
  close: (prospectId: string) => Promise<void>;
  touch: (prospectId: string) => Promise<void>;
}

export async function runReconcile(options: RunReconcileOptions): Promise<ReconcileReport> {
  const report: ReconcileReport = { kept: 0, closed: 0, deleted: 0, failed: 0 };

  for (const prospect of options.prospects) {
    try {
      // Une erreur réseau ne doit jamais provoquer de suppression : elle est
      // indiscernable d'une absence, et la suppression est irréversible.
      const status = await options.fetchStatus(prospect.siret);
      const action = decideReconciliation(status);

      if (action === 'delete') {
        await options.remove(prospect.id);
        report.deleted += 1;
        continue;
      }
      if (action === 'close') {
        await options.close(prospect.id);
        report.closed += 1;
      } else {
        report.kept += 1;
      }
      await options.touch(prospect.id);
    } catch (error) {
      report.failed += 1;
      process.stderr.write(
        `reconcile: échec sur ${prospect.siret} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return report;
}
```

- [ ] **Étape 4 : ajouter la lecture par SIRET à la source Sirene**

Ajouter à `apps/collector/src/sources/recherche-entreprises.ts` :

```ts
/**
 * État courant d'un établissement, interrogé par son SIRET.
 *
 * L'API ne renvoie tout simplement pas les établissements non diffusibles :
 * une réponse vide se lit `absent`, et l'appelant en tire les conséquences.
 */
export async function fetchStatusBySiret(siret: string): Promise<SireneStatus> {
  const response = await fetch(`${BASE_URL}?q=${encodeURIComponent(siret)}&per_page=25&page=1`);
  if (!response.ok) throw new Error(`API Sirene : HTTP ${response.status}`);

  const body = (await response.json()) as { results?: unknown[] };
  for (const result of body.results ?? []) {
    const company = result as Record<string, unknown>;
    const establishments = (company.matching_etablissements ?? []) as Record<string, unknown>[];
    const found = establishments.find((etab) => etab.siret === siret);
    if (found === undefined) continue;

    if (company.statut_diffusion !== 'O' || found.statut_diffusion_etablissement !== 'O') {
      return { kind: 'undiffusible' };
    }
    return found.etat_administratif === 'A' ? { kind: 'active' } : { kind: 'closed' };
  }
  return { kind: 'absent' };
}
```

- [ ] **Étape 5 : brancher la commande et lire `is_closed` au scoring**

Ajouter `'reconcile'` à `COMMANDS`, sa ligne dans `USAGE`, et le `case` :

```ts
    case 'reconcile': {
      const config = loadConfig(process.env);
      const client = createClient(config);

      const prospects: ReconcileProspect[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect')
          .select('id, siret')
          .order('id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        prospects.push(...(data ?? []).map((row) => ({ id: row.id, siret: row.siret })));
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      const report = await runReconcile({
        prospects,
        fetchStatus: fetchStatusBySiret,
        remove: async (id) => {
          // Les dépendances partent en cascade : c'est la définition même de
          // « ne pas conserver ».
          const { error } = await client.from('prospect').delete().eq('id', id);
          if (error) throw new Error(error.message);
        },
        close: async (id) => {
          const { error } = await client
            .from('prospect')
            .update({ is_closed: true })
            .eq('id', id);
          if (error) throw new Error(error.message);
        },
        touch: async (id) => {
          const { error } = await client
            .from('prospect')
            .update({ reconciled_at: new Date().toISOString() })
            .eq('id', id);
          if (error) throw new Error(error.message);
        },
      });

      process.stdout.write(
        `reconcile : ${report.kept} conservés, ${report.closed} cessés, ` +
          `${report.deleted} supprimés, ${report.failed} en échec\n`,
      );
      return 0;
    }
```

Imports à ajouter :

```ts
import { fetchStatusBySiret } from './sources/recherche-entreprises.js';
import { runReconcile, type ReconcileProspect } from './stages/reconcile.js';
```

Dans le `case 'score'`, ajouter `is_closed` au `select` de `fetchScorePage`
et remplacer la valeur codée en dur :

```ts
          // Renseigné par `reconcile`. La valeur codée en dur d'origine
          // rendait le disqualifiant du barème inatteignable.
          isClosed: p.is_closed === true,
```

- [ ] **Étape 6 : vérifier et committer**

```
pnpm test && pnpm typecheck
pnpm --filter @prospeo/collector start reconcile
```

```bash
git add apps/collector supabase packages/db
git commit -m "feat: reconciliation Sirene, cloture des cesses et purge des non diffusibles"
```

---

## Tâche 9 : Étage `domains`

**Fichiers :**
- Créer : `supabase/migrations/<horodatage>_domain_checked_at.sql`
- Créer : `packages/core/src/domain-name.ts` + son test
- Créer : `apps/collector/src/stages/domains.ts` + son test
- Modifier : `packages/core/src/index.ts`, `apps/collector/src/cli.ts`

**Interfaces :**
- Produit : `domainCandidates`, `checkDomainAvailability`, `runDomains`.

- [ ] **Étape 1 : migration**

```sql
-- `probed_at` ne peut pas servir : `probe` et `domains` sont deux étages
-- distincts, et partager l'horodatage ferait passer l'un pour l'autre.
alter table web_presence add column domain_checked_at timestamptz;
```

```bash
pnpm db:push --dry-run && pnpm db:push && pnpm db:types
```

- [ ] **Étape 2 : tests puis implémentation de `domainCandidates`**

Créer `packages/core/src/domain-name.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { domainCandidates } from './domain-name.js';
import { getTrade } from './trades.js';

const plombier = getTrade('plombier');
if (plombier === undefined) throw new Error('métier plombier absent');

describe('domainCandidates', () => {
  it('propose le nom seul puis ses combinaisons avec le métier', () => {
    expect(domainCandidates('SARL ALLARD', plombier)).toEqual([
      'allard.fr',
      'plomberie-allard.fr',
      'allard-plomberie.fr',
    ]);
  });

  it('ne répète pas le métier déjà présent dans le nom', () => {
    expect(domainCandidates('PLOMBERIE MARTIN', plombier)).toEqual(['plomberie-martin.fr']);
  });

  it('joint les mots multiples par un tiret', () => {
    expect(domainCandidates('OUEST DEPANNAGE', plombier)[0]).toBe('ouest-depannage.fr');
  });

  it('ne propose rien pour un nom vide de sens', () => {
    expect(domainCandidates('SARL', plombier)).toEqual([]);
  });
});
```

Créer `packages/core/src/domain-name.ts` :

```ts
import { normalizeCompanyName } from './normalize.js';
import type { Trade } from './types.js';

const TLD = 'fr';

/**
 * Noms de domaine plausibles pour une entreprise.
 *
 * L'argumentaire change du tout au tout selon la précision : « j'ai vérifié,
 * plomberie-allard.fr est libre » se répond, « vous devriez prendre un
 * domaine » ne se répond pas.
 */
export function domainCandidates(denomination: string, trade: Trade): string[] {
  const base = normalizeCompanyName(denomination).replace(/ /g, '-');
  if (base === '') return [];

  const metier = normalizeCompanyName(trade.keywords[0] ?? trade.slug).replace(/ /g, '-');
  if (metier !== '' && base.includes(metier)) return [`${base}.${TLD}`];

  return [`${base}.${TLD}`, `${metier}-${base}.${TLD}`, `${base}-${metier}.${TLD}`];
}
```

Exporter depuis `packages/core/src/index.ts`.

- [ ] **Étape 3 : tests puis implémentation de la vérification**

Créer `apps/collector/src/stages/domains.ts` :

```ts
/**
 * Disponibilité d'un nom de domaine — heuristique, et nommée comme telle.
 *
 * L'absence d'enregistrement DNS suggère fortement la disponibilité sans la
 * garantir. RDAP tranche mieux, mais son indisponibilité ne doit jamais se
 * traduire par une affirmation : le champ reste `null`.
 */
export interface DomainDeps {
  resolve: (name: string) => Promise<string[]>;
  rdap: (name: string) => Promise<number>;
}

export async function checkDomainAvailability(
  name: string,
  deps: DomainDeps,
): Promise<boolean | null> {
  try {
    const records = await deps.resolve(name);
    if (records.length > 0) return false; // Résout : donc pris.
  } catch {
    // NXDOMAIN ou panne du résolveur : indiscernables ici, RDAP tranche.
  }

  try {
    const status = await deps.rdap(name);
    if (status === 404) return true;
    if (status === 200) return false;
    return null;
  } catch {
    return null;
  }
}
```

Créer `apps/collector/src/stages/domains.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { checkDomainAvailability } from './domains.js';

const nxdomain = async (): Promise<string[]> => {
  throw new Error('NXDOMAIN');
};

describe('checkDomainAvailability', () => {
  it('déclare pris un domaine qui résout', async () => {
    const taken = await checkDomainAvailability('allard.fr', {
      resolve: async () => ['1.2.3.4'],
      rdap: async () => 404,
    });
    // Le DNS tranche seul : un domaine qui résout est pris, quoi que dise RDAP.
    expect(taken).toBe(false);
  });

  it('déclare libre un domaine absent du DNS et inconnu du registre', async () => {
    expect(await checkDomainAvailability('allard.fr', { resolve: nxdomain, rdap: async () => 404 })).toBe(true);
  });

  it('déclare pris un domaine absent du DNS mais connu du registre', async () => {
    // Cas réel et fréquent : domaine réservé, sans serveur configuré.
    expect(await checkDomainAvailability('allard.fr', { resolve: nxdomain, rdap: async () => 200 })).toBe(false);
  });

  it('ne conclut rien quand RDAP est indisponible', async () => {
    expect(await checkDomainAvailability('allard.fr', { resolve: nxdomain, rdap: async () => 503 })).toBeNull();
  });

  it('ne conclut rien quand RDAP échoue', async () => {
    const unknown = await checkDomainAvailability('allard.fr', {
      resolve: nxdomain,
      rdap: async () => {
        throw new Error('réseau');
      },
    });
    // Une panne ne doit jamais devenir un argument commercial.
    expect(unknown).toBeNull();
  });
});
```

- [ ] **Étape 4 : brancher la commande**

Ajouter `'domains'` à `COMMANDS`, sa ligne dans `USAGE`, et le `case` :

```ts
    case 'domains': {
      const config = loadConfig(process.env);
      const client = createClient(config);

      // Seuls les prospects sans domaine propre : proposer un nom à qui en a
      // déjà un n'a aucun sens.
      const rows: { prospect_id: string; denomination: string; trade_slug: string }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('web_presence')
          .select('prospect_id, prospect(denomination, trade_slug)')
          .in('category', ['none', 'social_only', 'directory_only'])
          .is('domain_checked_at', null)
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          const p = (Array.isArray(row.prospect) ? row.prospect[0] : row.prospect) as
            | Record<string, unknown>
            | null;
          if (p === null) continue;
          rows.push({
            prospect_id: row.prospect_id,
            denomination: p.denomination as string,
            trade_slug: p.trade_slug as string,
          });
        }
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      const deps = {
        resolve: (name: string): Promise<string[]> => resolveNs(name),
        rdap: async (name: string): Promise<number> => {
          const response = await fetch(`https://rdap.nic.fr/domain/${encodeURIComponent(name)}`);
          return response.status;
        },
      };

      let checked = 0;
      for (const row of rows) {
        const trade = getTrade(row.trade_slug);
        if (trade === undefined) continue;
        const candidates = domainCandidates(row.denomination, trade);

        // On cherche un candidat libre, pas le verdict du dernier essayé.
        // `false` ne se dit que si TOUS ont été tranchés et pris ; il suffit
        // d'un seul « je ne sais pas » pour que le champ reste `null`.
        let available: boolean | null = candidates.length === 0 ? null : false;
        for (const name of candidates) {
          const verdict = await checkDomainAvailability(name, deps);
          if (verdict === true) {
            available = true;
            break;
          }
          if (verdict === null) available = null;
        }

        const { error } = await client.from('web_presence').upsert(
          {
            prospect_id: row.prospect_id,
            domain_available: available,
            domain_candidates: candidates,
            domain_checked_at: new Date().toISOString(),
          },
          { onConflict: 'prospect_id' },
        );
        if (error) {
          process.stderr.write(`domains: échec sur ${row.prospect_id} — ${error.message}\n`);
          continue;
        }
        checked += 1;
      }

      process.stdout.write(`domains : ${checked} prospects vérifiés\n`);
      return 0;
    }
```

Imports à ajouter :

```ts
import { resolveNs } from 'node:dns/promises';
import { domainCandidates } from '@prospeo/core';
import { checkDomainAvailability } from './stages/domains.js';
```

`resolveNs` plutôt que `resolve4` : un domaine enregistré mais sans serveur
web porte quand même des serveurs de noms. Interroger les enregistrements A
laisserait croire libre un domaine déjà pris.

- [ ] **Étape 5 : vérifier et committer**

```
pnpm test && pnpm typecheck
pnpm --filter @prospeo/collector start domains
```

```bash
git add packages/core apps/collector supabase packages/db
git commit -m "feat: disponibilite des noms de domaine, DNS puis RDAP"
```

---

## Après le plan

L'élargissement à Nantes entière (étape 9 de l'ordre de livraison du spec)
n'est pas une tâche de code :

```bash
for cp in 44000 44100 44200 44300; do
  pnpm --filter @prospeo/collector start discover --trade plombier --postal-code "$cp"
done
pnpm --filter @prospeo/collector start enrich --trade plombier   # deux jours, plafond de 300
pnpm --filter @prospeo/collector start review
pnpm --filter @prospeo/collector start probe
pnpm --filter @prospeo/collector start score
pnpm --filter @prospeo/collector start domains
```
