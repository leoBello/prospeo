# Le relais OAuth — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un utilisateur peut connecter son compte GitHub et son compte
Vercel à Prospeo — sans jamais coller de jeton — via un nouveau service
serverless (`apps/relais-oauth`) qui reçoit les rappels OAuth que le
collector, sans serveur HTTP, ne peut pas recevoir.

**Architecture:** `packages/coffre` porte désormais le chiffrement
(`chiffrer`/`dechiffrer`/`lireCleMaitresse`), partagé entre le collector et
le nouveau relais. Le relais expose trois routes Vercel serverless
(`/api/connecter`, `/api/github/callback`, `/api/vercel/callback`), chacune
une fine enveloppe autour d'un module pur et testable, sur le modèle
`cli.ts`/`stages/*.ts` déjà en place côté collector.

**Tech Stack:** TypeScript, Vercel Serverless Functions (`@vercel/node`),
Node `crypto` (HMAC, RSA-SHA256), `@supabase/supabase-js`, Vitest.

**Spec :** [`2026-09-03-relais-oauth-design.md`](../specs/2026-09-03-relais-oauth-design.md)

## Global Constraints

- **Tout est en français** : code, commentaires, tests, documentation. Les
  commentaires disent le *pourquoi*, jamais le *quoi*.
- **Imports en `.js`** même depuis un `.ts` (ESM/NodeNext) — partout, y
  compris dans le nouveau paquet et le nouveau service.
- **Écris le test d'abord**, vérifie qu'il échoue pour la bonne raison, et
  **prouve que chaque assertion peut échouer** : casse, observe le rouge,
  restaure, observe le vert. Un récit sans transcription n'est pas une
  preuve.
- **Un argument `-- <motif>` ne restreint PAS un run vitest** dans cette
  configuration : la suite entière s'exécute toujours. Ne prétends jamais
  avoir lancé un sous-ensemble.
- **Aucun secret dans un test, un journal, un message d'erreur ou un
  commit.** Les clés de test (HMAC, RSA, AES) sont générées dans le test
  lui-même, jamais copiées d'un environnement réel.
- **`publish.ts`/`deploy.ts` ne changent pas dans ce plan** — hors périmètre,
  voir le spec §1.
- **Aucun écran dashboard** dans ce plan — hors périmètre, voir le spec §1.
- **Un échec de vérification (`state`, échange de code) ne s'affiche jamais
  en détail au navigateur** — page générique côté client, raison précise
  dans les journaux serveur (R5 du spec).
- **`jetonDe` reste dans le collector** — lui seul lit `connexion_secret`
  (R2 du spec). Le relais **écrit**, il ne lit jamais un secret existant.
- **`packages/db/src/database.types.ts` est déjà à jour** pour
  `connexion_plateforme`/`connexion_secret` (chantier n°8, étape 2, déjà
  fusionnée) — aucune migration dans ce plan.

---

## File Structure

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `packages/coffre/{package.json,tsconfig.json,vitest.config.ts}` | le nouveau paquet partagé |
| `packages/coffre/src/coffre.ts` | `chiffrer`/`dechiffrer`/`lireCleMaitresse` (déplacé du collector) |
| `packages/coffre/src/index.ts` | ré-export |
| `apps/relais-oauth/{package.json,tsconfig.json,vitest.config.ts}` | le nouveau service |
| `apps/relais-oauth/src/state.ts` | signe/vérifie le `state` (R3) |
| `apps/relais-oauth/src/github.ts` | JWT de l'App, lecture d'une installation |
| `apps/relais-oauth/src/vercel-oauth.ts` | échange `code` → jeton d'accès |
| `apps/relais-oauth/src/supabase.ts` | client `service_role`, config |
| `apps/relais-oauth/src/connexions.ts` | écrit `connexion_plateforme`/`connexion_secret` |
| `apps/relais-oauth/src/page.ts` | la page HTML minimale de confirmation/échec |
| `apps/relais-oauth/src/connecter.ts` | logique pure de `/api/connecter` |
| `apps/relais-oauth/src/github-callback.ts` | logique pure de `/api/github/callback` |
| `apps/relais-oauth/src/vercel-callback.ts` | logique pure de `/api/vercel/callback` |
| `apps/relais-oauth/api/connecter.ts` | enveloppe Vercel de `connecter.ts` |
| `apps/relais-oauth/api/github/callback.ts` | enveloppe Vercel de `github-callback.ts` |
| `apps/relais-oauth/api/vercel/callback.ts` | enveloppe Vercel de `vercel-callback.ts` |
| `apps/relais-oauth/.env.example` | les onze variables du relais, documentées |

**Modifiés :**

| Fichier | Ce qui change |
|---|---|
| `apps/collector/src/coffre.ts` | ne garde que `jetonDe`/`CoffreDeps` ; importe le reste de `@prospeo/coffre` |
| `apps/collector/src/coffre.test.ts` | ne garde que les tests de `jetonDe` |
| `apps/collector/src/config.ts` | `loadCoffreConfig` importe `lireCleMaitresse` de `@prospeo/coffre` |
| `apps/collector/package.json` | dépendance `@prospeo/coffre` |
| `docs/design/HANDOFF.md` | ce que le relais permet, et ce qu'il ne permet pas encore |

---

## Tâche 1 : Extraire `packages/coffre`

Un refactor pur — aucun comportement ne change, seule l'adresse du code
bouge. La preuve n'est pas un nouveau test, c'est que **la suite entière
(collector + le nouveau paquet) reste verte** avant/après, avec les mêmes
assertions qu'avant, simplement rangées différemment.

**Files:**
- Create: `packages/coffre/package.json`, `packages/coffre/tsconfig.json`,
  `packages/coffre/vitest.config.ts`, `packages/coffre/src/coffre.ts`,
  `packages/coffre/src/coffre.test.ts`, `packages/coffre/src/index.ts`
- Modify: `apps/collector/src/coffre.ts`, `apps/collector/src/coffre.test.ts`,
  `apps/collector/src/config.ts`, `apps/collector/package.json`

**Interfaces:**
- Produces (depuis `@prospeo/coffre`) : `chiffrer(clair: string, cle:
  CleMaitresse): Scelle`, `dechiffrer(scelle: Scelle, cle: CleMaitresse):
  Ouverture`, `lireCleMaitresse(brut: string | undefined): CleMaitresse`, les
  types `CleMaitresse`, `Scelle`, `Ouverture`. Toutes les tâches suivantes de
  ce plan les consomment via `import { … } from '@prospeo/coffre';`.

- [ ] **Étape 1 : Créer le paquet**

```json
// packages/coffre/package.json
{
  "name": "@prospeo/coffre",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

```json
// packages/coffre/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src"]
}
```

```typescript
// packages/coffre/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Étape 2 : Déplacer le module de chiffrement**

Créer `packages/coffre/src/coffre.ts` avec **exactement** ce contenu (repris
tel quel de `apps/collector/src/coffre.ts`, sans `PlateformeConnectee`,
`EtatConnexion`, `CoffreDeps` ni `jetonDe`, qui restent côté collector) :

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Le seul endroit du dépôt qui manipule un jeton en clair.
 *
 * **La clé vit dans l'environnement de qui l'emploie — collector ou relais —
 * jamais dans la base.** Le coffre Supabase aurait mis la clé chez le même
 * fournisseur que les données ; ainsi, une copie complète de la base ne
 * vaut rien.
 *
 * Extrait du collector au chantier n°8, étape 3 : le relais OAuth
 * (`apps/relais-oauth`) doit chiffrer avec le MÊME algorithme et la MÊME
 * clé que le collector déchiffre — les dépendre l'un de l'autre aurait
 * couplé un service à un CLI ; ce paquet partagé évite les deux.
 */

/** AES-256 : trente-deux octets, ni plus ni moins. */
const TAILLE_CLE = 32;

/** Douze octets, la taille recommandée pour GCM — au-delà, la spécification
 *  impose un traitement supplémentaire sans rien gagner. */
const TAILLE_VECTEUR = 12;

export interface CleMaitresse {
  /** Quelle clé, pour qu'une rotation reste possible sans tout re-chiffrer. */
  id: string;
  octets: Buffer;
}

export interface Scelle {
  chiffre: Buffer;
  vecteur: Buffer;
  etiquette: Buffer;
  cleId: string;
}

/**
 * `ouvert: false` avec un motif, plutôt qu'une exception.
 *
 * La perte de la clé maîtresse est un cas prévu : chaque connexion passe à
 * « indéchiffrable » et se reconnecte. L'appelant doit pouvoir le MARQUER en
 * base, ce qu'une exception nue lui interdirait sans un `try` à chaque appel.
 *
 * **Un seul motif, `'altere'`** : `dechiffrer` reçoit toujours une
 * `CleMaitresse` déjà validée par `lireCleMaitresse`, qui lève avant d'en
 * rendre une — une clé absente ne peut donc structurellement pas atteindre
 * cette fonction.
 */
export type Ouverture =
  | { ouvert: true; clair: string }
  | { ouvert: false; motif: 'altere' };

/**
 * Lit la clé maîtresse, ou **empêche le processus appelant de démarrer**.
 *
 * Format `<id>:<32 octets en base64>`. L'identifiant voyage avec la clé pour
 * qu'on ne puisse pas les désynchroniser en les rangeant séparément.
 */
export function lireCleMaitresse(brut: string | undefined): CleMaitresse {
  if (brut === undefined || brut === '') {
    throw new Error(
      'PROSPEO_COFFRE_CLE est obligatoire : sans elle, aucun jeton ne peut être lu ni écrit.',
    );
  }
  const separateur = brut.indexOf(':');
  if (separateur <= 0) {
    throw new Error('PROSPEO_COFFRE_CLE attend la forme « <id>:<clé en base64> ».');
  }
  const id = brut.slice(0, separateur);
  const octets = Buffer.from(brut.slice(separateur + 1), 'base64');
  if (octets.length !== TAILLE_CLE) {
    throw new Error(
      `PROSPEO_COFFRE_CLE doit porter ${TAILLE_CLE} octets, ${octets.length} reçus.`,
    );
  }
  return { id, octets };
}

export function chiffrer(clair: string, cle: CleMaitresse): Scelle {
  const vecteur = randomBytes(TAILLE_VECTEUR);
  const chiffreur = createCipheriv('aes-256-gcm', cle.octets, vecteur);
  const chiffre = Buffer.concat([chiffreur.update(clair, 'utf8'), chiffreur.final()]);
  return { chiffre, vecteur, etiquette: chiffreur.getAuthTag(), cleId: cle.id };
}

export function dechiffrer(scelle: Scelle, cle: CleMaitresse): Ouverture {
  try {
    const dechiffreur = createDecipheriv('aes-256-gcm', cle.octets, scelle.vecteur);
    dechiffreur.setAuthTag(scelle.etiquette);
    const clair = Buffer.concat([dechiffreur.update(scelle.chiffre), dechiffreur.final()]);
    return { ouvert: true, clair: clair.toString('utf8') };
  } catch {
    return { ouvert: false, motif: 'altere' };
  }
}
```

Créer `packages/coffre/src/index.ts` :

```typescript
export * from './coffre.js';
```

Créer `packages/coffre/src/coffre.test.ts` avec **exactement** les tests
`lireCleMaitresse` et `chiffrer / dechiffrer` de
`apps/collector/src/coffre.test.ts` (lignes 1 à 73 du fichier actuel) :

```typescript
import { describe, expect, it } from 'vitest';
import { chiffrer, dechiffrer, lireCleMaitresse } from './coffre.js';

/** Trente-deux octets, la taille exacte d'une clé AES-256. */
const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));

describe('lireCleMaitresse', () => {
  it('refuse une cle absente, plutot que de laisser demarrer sans coffre', () => {
    expect(() => lireCleMaitresse(undefined)).toThrow();
  });

  it('refuse une cle qui n a pas la bonne taille', () => {
    expect(() => lireCleMaitresse('v1:' + Buffer.alloc(16, 7).toString('base64'))).toThrow();
  });

  it('porte un identifiant de cle, pour qu une rotation reste possible', () => {
    expect(lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64')).id).toBe('v1');
  });
});

describe('chiffrer / dechiffrer', () => {
  it('rend le clair d origine', () => {
    const r = dechiffrer(chiffrer('jeton-vercel-secret', CLE), CLE);
    expect(r).toEqual({ ouvert: true, clair: 'jeton-vercel-secret' });
  });

  it('n ecrit jamais le clair dans le scelle', () => {
    const s = chiffrer('jeton-vercel-secret', CLE);
    expect(s.chiffre.toString('utf8')).not.toContain('jeton');
    expect(s.chiffre.toString('base64')).not.toContain('amV0b24');
  });

  it('ne reemploie JAMAIS le meme vecteur', () => {
    const vecteurs = new Set(
      Array.from({ length: 200 }, () => chiffrer('x', CLE).vecteur.toString('hex')),
    );
    expect(vecteurs.size).toBe(200);
  });

  it('refuse un chiffre altere au lieu de rendre des octets arbitraires', () => {
    const s = chiffrer('jeton-vercel-secret', CLE);
    s.chiffre[0] = (s.chiffre[0] ?? 0) ^ 0xff;
    expect(dechiffrer(s, CLE)).toEqual({ ouvert: false, motif: 'altere' });
  });

  it('refuse une etiquette altere', () => {
    const s = chiffrer('jeton-vercel-secret', CLE);
    s.etiquette[0] = (s.etiquette[0] ?? 0) ^ 0xff;
    expect(dechiffrer(s, CLE)).toEqual({ ouvert: false, motif: 'altere' });
  });

  it('rend un echec NOMME sous une autre cle, jamais une exception nue', () => {
    const autre = lireCleMaitresse('v2:' + Buffer.alloc(32, 9).toString('base64'));
    expect(dechiffrer(chiffrer('x', CLE), autre)).toEqual({ ouvert: false, motif: 'altere' });
  });
});
```

- [ ] **Étape 3 : Lancer les tests du nouveau paquet**

Run: `pnpm --filter @prospeo/coffre test`
Expected: PASS — 9 tests, tel quel.

- [ ] **Étape 4 : Réduire `apps/collector/src/coffre.ts` à `jetonDe`**

Remplacer tout le fichier par :

```typescript
import type { Enums } from '@prospeo/db';
import { dechiffrer, type CleMaitresse, type Scelle, type Ouverture } from '@prospeo/coffre';
import type { Proprietaire } from './proprietaire.js';

/**
 * Ce que le collector garde du coffre : LIRE un jeton, jamais le chiffrer.
 *
 * `chiffrer`/`dechiffrer`/`lireCleMaitresse` ont rejoint `@prospeo/coffre`
 * au chantier n°8, étape 3 — partagés avec `apps/relais-oauth`, qui écrit
 * les connexions que cette fonction lit. `jetonDe` reste ICI : lui seul lit
 * `connexion_secret`, et c'est le seul consommateur à l'avoir jamais fait.
 */

/** Alias sur les types générés par la migration du chantier n°8, étape 2. */
export type PlateformeConnectee = Enums<'plateforme_connectee'>;
export type EtatConnexion = Enums<'etat_connexion'>;

/**
 * Uniquement ce que `jetonDe` emploie.
 *
 * Des fonctions, jamais un client Supabase brut — comme `FileDeps`
 * (`stages/file.ts`) et `ChaineDeps` (`chaine.ts`) — pour que `jetonDe` se
 * teste sans base ni réseau. `cli.ts` est le seul endroit qui assemblera un
 * `CoffreDeps` réel, à partir d'un client `service_role`.
 */
export interface CoffreDeps {
  lireConnexion(
    proprietaire: Proprietaire,
    plateforme: PlateformeConnectee,
  ): Promise<{ id: string; etat: EtatConnexion } | null>;
  lireSecret(connexionId: string): Promise<Scelle | null>;
  marquerEtat(connexionId: string, etat: EtatConnexion): Promise<void>;
  cle: CleMaitresse;
}

/**
 * Lit le jeton en clair d'une connexion, ou dit pourquoi elle n'en rend pas.
 *
 * **`revoquee` n'essaie même pas de déchiffrer** : la plateforme refuserait
 * de toute façon le jeton, pour un aller-retour réseau en plus, et pour un
 * secret qu'il est inutile de manipuler.
 *
 * **Un secret qui ne se déchiffre pas MARQUE la connexion avant de rendre.**
 * Sans ce marquage, l'écran continuerait d'annoncer un compte connecté qui ne
 * l'est plus — l'affordance que la doctrine interdit. Le marquer *avant* de
 * rendre évite qu'un appelant lise un état pas encore vrai en base.
 *
 * **Un déchiffrement réussi n'écrit rien** : `connexion_plateforme.etat` est
 * déjà `active`, l'écrire de nouveau serait une écriture sans raison à
 * chaque lecture.
 */
export async function jetonDe(
  deps: CoffreDeps,
  proprietaire: Proprietaire,
  plateforme: PlateformeConnectee,
): Promise<{ jeton: string } | { jeton: null; etat: EtatConnexion | 'absente' }> {
  const connexion = await deps.lireConnexion(proprietaire, plateforme);
  if (connexion === null) {
    return { jeton: null, etat: 'absente' };
  }
  if (connexion.etat !== 'active') {
    return { jeton: null, etat: connexion.etat };
  }

  const scelle = await deps.lireSecret(connexion.id);
  const ouverture: Ouverture =
    scelle === null ? { ouvert: false, motif: 'altere' } : dechiffrer(scelle, deps.cle);

  if (!ouverture.ouvert) {
    await deps.marquerEtat(connexion.id, 'indechiffrable');
    return { jeton: null, etat: 'indechiffrable' };
  }

  return { jeton: ouverture.clair };
}
```

- [ ] **Étape 5 : Réduire `apps/collector/src/coffre.test.ts` aux tests de `jetonDe`**

Remplacer tout le fichier par :

```typescript
import { describe, expect, it, vi } from 'vitest';
import { chiffrer, lireCleMaitresse } from '@prospeo/coffre';
import { jetonDe, type CoffreDeps } from './coffre.js';
import { proprietaire } from './proprietaire.js';

/** Trente-deux octets, la taille exacte d'une clé AES-256. */
const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));

describe('jetonDe', () => {
  const PROPRIETAIRE = proprietaire('131ab48e-055a-4a15-af4b-79ed7a2e4465');

  function deps(surcharges: Partial<CoffreDeps> = {}): CoffreDeps {
    return {
      lireConnexion: async () => null,
      lireSecret: async () => null,
      marquerEtat: async () => {},
      cle: CLE,
      ...surcharges,
    };
  }

  it('rend absente quand aucune connexion n existe pour cette plateforme', async () => {
    const lireSecret = vi.fn();
    const marquerEtat = vi.fn();
    const r = await jetonDe(deps({ lireSecret, marquerEtat }), PROPRIETAIRE, 'vercel');

    expect(r).toEqual({ jeton: null, etat: 'absente' });
    expect(lireSecret).not.toHaveBeenCalled();
    expect(marquerEtat).not.toHaveBeenCalled();
  });

  it('ne lit pas le secret d une connexion revoquee, et rend son etat tel quel', async () => {
    const lireSecret = vi.fn();
    const r = await jetonDe(
      deps({
        lireConnexion: async () => ({ id: 'cx-1', etat: 'revoquee' }),
        lireSecret,
      }),
      PROPRIETAIRE,
      'vercel',
    );

    expect(r).toEqual({ jeton: null, etat: 'revoquee' });
    expect(lireSecret).not.toHaveBeenCalled();
  });

  it('marque indechiffrable en base quand le secret d une connexion active ne se dechiffre pas', async () => {
    const autreCle = lireCleMaitresse('v2:' + Buffer.alloc(32, 9).toString('base64'));
    const scelleIllisible = chiffrer('jeton-vercel-secret', autreCle);
    const marquerEtat = vi.fn(async () => {});

    const r = await jetonDe(
      deps({
        lireConnexion: async () => ({ id: 'cx-1', etat: 'active' }),
        lireSecret: async () => scelleIllisible,
        marquerEtat,
      }),
      PROPRIETAIRE,
      'vercel',
    );

    expect(r).toEqual({ jeton: null, etat: 'indechiffrable' });
    expect(marquerEtat).toHaveBeenCalledWith('cx-1', 'indechiffrable');
    expect(marquerEtat).toHaveBeenCalledTimes(1);
  });

  it('rend le jeton d une connexion active dechiffrable, sans aucune ecriture', async () => {
    const scelle = chiffrer('jeton-vercel-secret', CLE);
    const marquerEtat = vi.fn(async () => {});

    const r = await jetonDe(
      deps({
        lireConnexion: async () => ({ id: 'cx-1', etat: 'active' }),
        lireSecret: async () => scelle,
        marquerEtat,
      }),
      PROPRIETAIRE,
      'vercel',
    );

    expect(r).toEqual({ jeton: 'jeton-vercel-secret' });
    expect(marquerEtat).not.toHaveBeenCalled();
  });

  it('le jeton dechiffre ne fuit jamais dans un message d erreur, meme d un appel ulterieur', async () => {
    const scelle = chiffrer('jeton-vercel-secret-a-ne-jamais-relire', CLE);
    const ok = await jetonDe(
      deps({
        lireConnexion: async () => ({ id: 'cx-1', etat: 'active' }),
        lireSecret: async () => scelle,
      }),
      PROPRIETAIRE,
      'vercel',
    );
    expect(ok).toEqual({ jeton: 'jeton-vercel-secret-a-ne-jamais-relire' });

    let echecCapture: unknown;
    try {
      await jetonDe(
        deps({
          lireConnexion: async () => {
            throw new Error('panne reseau pendant la lecture de connexion_plateforme');
          },
        }),
        PROPRIETAIRE,
        'vercel',
      );
    } catch (e) {
      echecCapture = e;
    }

    expect(echecCapture).toBeInstanceOf(Error);
    expect((echecCapture as Error).message).not.toContain(
      'jeton-vercel-secret-a-ne-jamais-relire',
    );
  });
});
```

- [ ] **Étape 6 : Mettre à jour `config.ts` et `package.json` du collector**

Dans `apps/collector/src/config.ts`, trouver la ligne (proche du bas du
fichier) :

```typescript
import { lireCleMaitresse, type CleMaitresse } from './coffre.js';
```

La remplacer par :

```typescript
import { lireCleMaitresse, type CleMaitresse } from '@prospeo/coffre';
```

Dans `apps/collector/package.json`, ajouter dans `"dependencies"` (ordre
alphabétique, comme les entrées existantes) :

```json
    "@prospeo/coffre": "workspace:*",
```

- [ ] **Étape 7 : Installer et vérifier la suite entière**

Run: `pnpm install`
Expected: le workspace résout `@prospeo/coffre` pour le collector, sans
erreur.

Run: `pnpm --filter @prospeo/coffre test`
Expected: PASS — 9 tests.

Run: `pnpm --filter @prospeo/collector test`
Expected: PASS — même nombre de tests qu'avant la Tâche 1 moins les 9
déplacés (388 − 9 = 379), suite entière, transcrire la sortie complète.

Run: `pnpm -r typecheck`
Expected: vert sur tous les paquets, y compris le nouveau `@prospeo/coffre`.

- [ ] **Étape 8 : Commit**

```bash
git add packages/coffre apps/collector/src/coffre.ts apps/collector/src/coffre.test.ts apps/collector/src/config.ts apps/collector/package.json pnpm-lock.yaml
git commit -m "refactor(coffre): chiffrer/dechiffrer/lireCleMaitresse rejoignent packages/coffre"
```

---

## Tâche 2 : Le paquet `apps/relais-oauth`, et le `state` signé

**Files:**
- Create: `apps/relais-oauth/package.json`, `apps/relais-oauth/tsconfig.json`,
  `apps/relais-oauth/vitest.config.ts`, `apps/relais-oauth/src/state.ts`,
  `apps/relais-oauth/src/state.test.ts`

**Interfaces:**
- Consumes: rien d'une tâche précédente.
- Produces: `export type Plateforme = 'github' | 'vercel'`, `export
  interface ChargeState { ownerId: string; plateforme: Plateforme; exp:
  number }`, `export type ResultatState = { ok: true; charge: ChargeState }
  | { ok: false; raison: 'signature_invalide' | 'expire' | 'format_invalide'
  }`, `export function signerState(charge: { ownerId: string; plateforme:
  Plateforme }, secret: string, maintenant?: Date): string`, `export
  function verifierState(state: string, secret: string, maintenant?: Date):
  ResultatState`. Les Tâches 6, 7 et 8 consomment ces quatre exports.

- [ ] **Étape 1 : Créer le paquet**

```json
// apps/relais-oauth/package.json
{
  "name": "@prospeo/relais-oauth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@prospeo/coffre": "workspace:*",
    "@prospeo/db": "workspace:*",
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "@vercel/node": "^12.0.0"
  }
}
```

```json
// apps/relais-oauth/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src", "api"]
}
```

```typescript
// apps/relais-oauth/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Étape 2 : Écrire les tests de `state.ts`, qui échoueront faute de module**

```typescript
// apps/relais-oauth/src/state.test.ts
import { describe, expect, it } from 'vitest';
import { signerState, verifierState } from './state.js';

const SECRET = 'secret-de-test-jamais-reel';

describe('signerState / verifierState', () => {
  it('rend la charge d origine après un aller-retour', () => {
    const state = signerState({ ownerId: 'u1', plateforme: 'vercel' }, SECRET);
    const resultat = verifierState(state, SECRET);
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.charge.ownerId).toBe('u1');
      expect(resultat.charge.plateforme).toBe('vercel');
    }
  });

  it('refuse un state altéré (charge modifiée)', () => {
    const state = signerState({ ownerId: 'u1', plateforme: 'vercel' }, SECRET);
    const [payload, signature] = state.split('.');
    // On substitue une charge pour un AUTRE propriétaire, signature inchangée.
    const chargeFalsifiee = Buffer.from(
      JSON.stringify({ ownerId: 'attaquant', plateforme: 'vercel', exp: Date.now() + 60000 }),
      'utf8',
    ).toString('base64url');
    const falsifie = `${chargeFalsifiee}.${signature}`;
    expect(verifierState(falsifie, SECRET)).toEqual({ ok: false, raison: 'signature_invalide' });
    void payload;
  });

  it('refuse une signature qui ne correspond pas au secret', () => {
    const state = signerState({ ownerId: 'u1', plateforme: 'vercel' }, SECRET);
    expect(verifierState(state, 'un-autre-secret')).toEqual({
      ok: false,
      raison: 'signature_invalide',
    });
  });

  it('refuse un state expiré', () => {
    const hier = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const state = signerState({ ownerId: 'u1', plateforme: 'vercel' }, SECRET, hier);
    // Vérifié à l'heure ACTUELLE — le state, signé hier, est expiré depuis longtemps.
    expect(verifierState(state, SECRET)).toEqual({ ok: false, raison: 'expire' });
  });

  it('refuse une chaîne mal formée', () => {
    expect(verifierState('pas-un-state-valide', SECRET)).toEqual({
      ok: false,
      raison: 'format_invalide',
    });
  });
});
```

- [ ] **Étape 3 : Lancer, constater l'échec**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: FAIL — `./state.js` n'existe pas.

- [ ] **Étape 4 : Écrire `state.ts`**

```typescript
// apps/relais-oauth/src/state.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Le `state` signé qui protège les trois routes de ce service.
 *
 * Sans lui, un tiers pourrait appeler `/api/github/callback` ou
 * `/api/vercel/callback` avec un `ownerId` arbitraire et lui faire porter
 * une connexion — R3 du spec. Signé HMAC-SHA256, jamais chiffré : ce qu'il
 * porte (un identifiant et un nom de plateforme) n'est pas un secret,
 * seule sa provenance doit être garantie.
 */

export type Plateforme = 'github' | 'vercel';

export interface ChargeState {
  ownerId: string;
  plateforme: Plateforme;
  exp: number;
}

export type ResultatState =
  | { ok: true; charge: ChargeState }
  | { ok: false; raison: 'signature_invalide' | 'expire' | 'format_invalide' };

/**
 * Dix minutes : assez pour cliquer « installer »/« autoriser » côté
 * GitHub/Vercel, pas assez pour qu'un lien intercepté reste utilisable
 * longtemps après avoir été généré.
 */
const DUREE_VALIDITE_MS = 10 * 60 * 1000;

function signer(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signerState(
  charge: { ownerId: string; plateforme: Plateforme },
  secret: string,
  maintenant: Date = new Date(),
): string {
  const complet: ChargeState = { ...charge, exp: maintenant.getTime() + DUREE_VALIDITE_MS };
  const payload = Buffer.from(JSON.stringify(complet), 'utf8').toString('base64url');
  return `${payload}.${signer(payload, secret)}`;
}

export function verifierState(
  state: string,
  secret: string,
  maintenant: Date = new Date(),
): ResultatState {
  const separateur = state.indexOf('.');
  if (separateur <= 0) return { ok: false, raison: 'format_invalide' };
  const payload = state.slice(0, separateur);
  const signature = state.slice(separateur + 1);

  const attendue = signer(payload, secret);
  const bufSignature = Buffer.from(signature, 'base64url');
  const bufAttendue = Buffer.from(attendue, 'base64url');
  // `timingSafeEqual` exige la même longueur — la vérifier d'abord évite une
  // exception sur une signature tronquée, qui n'est qu'un cas de plus de
  // « signature invalide », pas une panne à part.
  if (bufSignature.length !== bufAttendue.length || !timingSafeEqual(bufSignature, bufAttendue)) {
    return { ok: false, raison: 'signature_invalide' };
  }

  let charge: ChargeState;
  try {
    charge = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ChargeState;
  } catch {
    return { ok: false, raison: 'format_invalide' };
  }
  if (
    typeof charge.ownerId !== 'string' ||
    (charge.plateforme !== 'github' && charge.plateforme !== 'vercel') ||
    typeof charge.exp !== 'number'
  ) {
    return { ok: false, raison: 'format_invalide' };
  }
  if (charge.exp < maintenant.getTime()) return { ok: false, raison: 'expire' };

  return { ok: true, charge };
}
```

- [ ] **Étape 5 : Lancer, constater le passage**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — 5 tests. Transcrire la sortie complète.

- [ ] **Étape 6 : Casser puis restaurer une assertion**

Modifier temporairement `signer` pour ignorer `secret` (ex: `return
createHmac('sha256', 'toujours-le-meme').update(payload).digest('base64url')`).
Relancer : le test « refuse une signature qui ne correspond pas au secret »
doit rougir (deux secrets différents produiraient la même signature).
Restaurer, relancer, observer le vert. Transcrire les deux sorties.

- [ ] **Étape 7 : Commit**

```bash
git add apps/relais-oauth
git commit -m "feat(relais-oauth): state signe HMAC, protege les trois routes"
```

---

## Tâche 3 : `github.ts` — le JWT de l'App, et la lecture d'une installation

**Files:**
- Create: `apps/relais-oauth/src/github.ts`, `apps/relais-oauth/src/github.test.ts`

**Interfaces:**
- Produces: `export function signerJwtApp(appId: string, clePrivee: string,
  maintenant?: Date): string`, `export interface GithubAppOptions { appId:
  string; clePrivee: string; fetch?: typeof fetch }`, `export interface
  InstallationGithub { compteLibelle: string }`, `export function
  createGithubAppClient(options: GithubAppOptions): { lireInstallation(id:
  string): Promise<InstallationGithub> }`. La Tâche 7 consomme
  `createGithubAppClient`.

- [ ] **Étape 1 : Écrire les tests, qui échoueront faute de module**

```typescript
// apps/relais-oauth/src/github.test.ts
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { createGithubAppClient, signerJwtApp } from './github.js';

/** Une vraie paire de clés RSA, générée pour ce fichier — jamais une clé réelle. */
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('signerJwtApp', () => {
  it('produit un JWT à trois segments, vérifiable avec la clé publique', () => {
    const jwt = signerJwtApp('123456', privateKey);
    const segments = jwt.split('.');
    expect(segments).toHaveLength(3);

    const [entete, charge, signature] = segments;
    const verificateur = createVerify('RSA-SHA256');
    verificateur.update(`${entete}.${charge}`);
    expect(verificateur.verify(publicKey, signature as string, 'base64url')).toBe(true);

    const chargeDecodee = JSON.parse(Buffer.from(charge as string, 'base64url').toString('utf8'));
    expect(chargeDecodee.iss).toBe('123456');
  });

  it('refuse une vérification sous une AUTRE clé publique', () => {
    const { publicKey: autrePublique } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const jwt = signerJwtApp('123456', privateKey);
    const [entete, charge, signature] = jwt.split('.');
    const verificateur = createVerify('RSA-SHA256');
    verificateur.update(`${entete}.${charge}`);
    expect(verificateur.verify(autrePublique, signature as string, 'base64url')).toBe(false);
  });
});

describe('createGithubAppClient — lireInstallation', () => {
  function fausseReponse(status: number, corps: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(corps),
      json: async () => corps,
    } as unknown as Response;
  }

  it('signe une requête Bearer et rend le libellé du compte installé', async () => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const fausseFetch = (async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      return fausseReponse(200, { account: { login: 'mon-org' } });
    }) as unknown as typeof fetch;

    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const installation = await client.lireInstallation('987');

    expect(installation).toEqual({ compteLibelle: 'mon-org' });
    expect(appels[0]?.url).toBe('https://api.github.com/app/installations/987');
    const entetes = appels[0]?.init?.headers as Record<string, string>;
    expect(entetes.Authorization).toMatch(/^Bearer /);
  });

  it("échoue franchement si GitHub refuse, avec le statut et le corps dans le message", async () => {
    const fausseFetch = (async () => fausseReponse(404, { message: 'Not Found' })) as unknown as typeof fetch;
    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    await expect(client.lireInstallation('987')).rejects.toThrow(/404/);
  });
});
```

- [ ] **Étape 2 : Lancer, constater l'échec**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: FAIL — `./github.js` n'existe pas.

- [ ] **Étape 3 : Écrire `github.ts`**

```typescript
// apps/relais-oauth/src/github.ts
import { createSign } from 'node:crypto';

/**
 * L'authentification d'une GitHub App — un JWT signé par sa clé privée,
 * échangé contre un accès à une installation précise.
 *
 * Aucune bibliothèque cliente : trois champs, une signature. Même choix que
 * `apps/collector/src/sources/github.ts`, qui préfère `fetch` à Octokit pour
 * garder le contrôle exact des en-têtes et des corps.
 */

const BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** Neuf minutes : sous la limite des dix minutes que GitHub tolère pour un
 *  JWT d'App, avec une marge pour une horloge locale imprécise. */
const DUREE_JWT_S = 9 * 60;

function base64url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

/**
 * Signe un JWT RS256 minimal pour s'authentifier en tant qu'App (pas en tant
 * qu'installation) — c'est ce jeton qui permet d'interroger
 * `/app/installations/{id}`, avant même d'avoir un jeton d'installation.
 */
export function signerJwtApp(appId: string, clePrivee: string, maintenant: Date = new Date()): string {
  const iat = Math.floor(maintenant.getTime() / 1000) - 60; // 60s de marge, horloge en avance
  const aSigner = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({ iat, exp: iat + DUREE_JWT_S, iss: appId })}`;
  const signature = createSign('RSA-SHA256').update(aSigner).sign(clePrivee, 'base64url');
  return `${aSigner}.${signature}`;
}

export interface GithubAppOptions {
  appId: string;
  clePrivee: string;
  fetch?: typeof fetch;
}

export interface InstallationGithub {
  compteLibelle: string;
}

export function createGithubAppClient(options: GithubAppOptions): {
  lireInstallation(installationId: string): Promise<InstallationGithub>;
} {
  const appeler = options.fetch ?? fetch;
  return {
    async lireInstallation(installationId) {
      const jwt = signerJwtApp(options.appId, options.clePrivee);
      const reponse = await appeler(`${BASE}/app/installations/${installationId}`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
        },
      });
      if (!reponse.ok) {
        const corps = await reponse.text().catch(() => '');
        throw new Error(
          `GitHub : lecture de l'installation ${installationId} — ${reponse.status} — ${corps}`,
        );
      }
      const corps = (await reponse.json()) as { account: { login: string } };
      return { compteLibelle: corps.account.login };
    },
  };
}
```

- [ ] **Étape 4 : Lancer, constater le passage**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — 4 nouveaux tests, plus les 5 de `state.test.ts`. Transcrire
la sortie complète.

- [ ] **Étape 5 : Casser puis restaurer une assertion**

Modifier temporairement `createSign('RSA-SHA256')` en `createSign('SHA256')`
(sans le préfixe RSA). Relancer : le premier test de `signerJwtApp` doit
rougir (la signature ne vérifie plus). Restaurer, relancer, observer le
vert. Transcrire les deux sorties.

- [ ] **Étape 6 : Commit**

```bash
git add apps/relais-oauth/src/github.ts apps/relais-oauth/src/github.test.ts
git commit -m "feat(relais-oauth): signe le JWT de l App, lit une installation"
```

---

## Tâche 4 : `vercel-oauth.ts` — l'échange du code

**Files:**
- Create: `apps/relais-oauth/src/vercel-oauth.ts`,
  `apps/relais-oauth/src/vercel-oauth.test.ts`

**Interfaces:**
- Produces: `export interface VercelOAuthOptions { clientId: string;
  clientSecret: string; fetch?: typeof fetch }`, `export interface
  JetonVercel { accessToken: string; teamId: string | null }`, `export
  function createVercelOAuthClient(options: VercelOAuthOptions): {
  echangerCode(code: string, redirectUri: string): Promise<JetonVercel> }`.
  La Tâche 8 consomme `createVercelOAuthClient`.

- [ ] **Étape 1 : Écrire les tests, qui échoueront faute de module**

```typescript
// apps/relais-oauth/src/vercel-oauth.test.ts
import { describe, expect, it } from 'vitest';
import { createVercelOAuthClient } from './vercel-oauth.js';

function faussetch(reponses: { status: number; body?: unknown }[]) {
  const appels: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fn = async (url: string, init: RequestInit = {}) => {
    appels.push({ url, init });
    const r = reponses[Math.min(i++, reponses.length - 1)] ?? { status: 200 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body ?? {}),
      json: async () => r.body ?? {},
    } as unknown as Response;
  };
  return { fn: fn as unknown as typeof fetch, appels };
}

describe('createVercelOAuthClient — echangerCode', () => {
  it('poste les quatre champs en x-www-form-urlencoded, et rend le jeton', async () => {
    const { fn, appels } = faussetch([
      { status: 200, body: { access_token: 'jeton-vercel', team_id: 'team_x' } },
    ]);
    const client = createVercelOAuthClient({ clientId: 'id1', clientSecret: 'secret1', fetch: fn });
    const jeton = await client.echangerCode('code-recu', 'https://relais.example/api/vercel/callback');

    expect(jeton).toEqual({ accessToken: 'jeton-vercel', teamId: 'team_x' });
    expect(appels[0]?.url).toBe('https://api.vercel.com/v2/oauth/access_token');
    expect(appels[0]?.init.method).toBe('POST');
    const entetes = appels[0]?.init.headers as Record<string, string>;
    expect(entetes['Content-Type']).toBe('application/x-www-form-urlencoded');
    const corps = new URLSearchParams(String(appels[0]?.init.body));
    expect(corps.get('client_id')).toBe('id1');
    expect(corps.get('client_secret')).toBe('secret1');
    expect(corps.get('code')).toBe('code-recu');
    expect(corps.get('redirect_uri')).toBe('https://relais.example/api/vercel/callback');
  });

  it('rend teamId null sur un compte personnel', async () => {
    const { fn } = faussetch([{ status: 200, body: { access_token: 'jeton-vercel', team_id: null } }]);
    const client = createVercelOAuthClient({ clientId: 'id1', clientSecret: 'secret1', fetch: fn });
    const jeton = await client.echangerCode('code-recu', 'https://relais.example/api/vercel/callback');
    expect(jeton.teamId).toBeNull();
  });

  it('échoue franchement si Vercel refuse le code', async () => {
    const { fn } = faussetch([{ status: 400, body: { error: 'invalid_grant' } }]);
    const client = createVercelOAuthClient({ clientId: 'id1', clientSecret: 'secret1', fetch: fn });
    await expect(client.echangerCode('code-perime', 'https://relais.example/api/vercel/callback')).rejects.toThrow(
      /400/,
    );
  });
});
```

- [ ] **Étape 2 : Lancer, constater l'échec**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: FAIL — `./vercel-oauth.js` n'existe pas.

- [ ] **Étape 3 : Écrire `vercel-oauth.ts`**

```typescript
// apps/relais-oauth/src/vercel-oauth.ts
/**
 * L'échange OAuth de Vercel : un `code`, valable 30 minutes et une seule
 * fois, contre un jeton d'accès durable — documenté par Vercel comme un
 * POST `application/x-www-form-urlencoded`, pas un JSON.
 */

const BASE = 'https://api.vercel.com';

export interface VercelOAuthOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

export interface JetonVercel {
  accessToken: string;
  /** `null` sur un compte personnel sans équipe. */
  teamId: string | null;
}

export function createVercelOAuthClient(options: VercelOAuthOptions): {
  echangerCode(code: string, redirectUri: string): Promise<JetonVercel>;
} {
  const appeler = options.fetch ?? fetch;
  return {
    async echangerCode(code, redirectUri) {
      const corps = new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        code,
        redirect_uri: redirectUri,
      });
      const reponse = await appeler(`${BASE}/v2/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corps.toString(),
      });
      if (!reponse.ok) {
        const texte = await reponse.text().catch(() => '');
        throw new Error(`Vercel : échange du code — ${reponse.status} — ${texte}`);
      }
      const json = (await reponse.json()) as { access_token: string; team_id: string | null };
      return { accessToken: json.access_token, teamId: json.team_id ?? null };
    },
  };
}
```

- [ ] **Étape 4 : Lancer, constater le passage**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — 3 nouveaux tests, plus les 9 précédents. Transcrire la
sortie complète.

- [ ] **Étape 5 : Casser puis restaurer une assertion**

Modifier temporairement `'Content-Type': 'application/x-www-form-urlencoded'`
en `'application/json'`. Relancer : le premier test doit rougir sur
l'assertion du `Content-Type`. Restaurer, relancer, observer le vert.
Transcrire les deux sorties.

- [ ] **Étape 6 : Commit**

```bash
git add apps/relais-oauth/src/vercel-oauth.ts apps/relais-oauth/src/vercel-oauth.test.ts
git commit -m "feat(relais-oauth): echange le code Vercel contre un jeton d acces"
```

---

## Tâche 5 : `supabase.ts` et `connexions.ts` — écrire une connexion

**Files:**
- Create: `apps/relais-oauth/src/supabase.ts`,
  `apps/relais-oauth/src/connexions.ts`,
  `apps/relais-oauth/src/connexions.test.ts`

**Interfaces:**
- Consumes: `Scelle` (`@prospeo/coffre`, Tâche 1).
- Produces: `export function createClient(config: { supabaseUrl: string;
  supabaseServiceRoleKey: string }): SupabaseClient<Database>`, `export
  async function proprietaireExiste(client, ownerId: string):
  Promise<boolean>`, `export async function ecrireConnexionGithub(client,
  ownerId: string, installationId: string, compteLibelle: string):
  Promise<void>`, `export async function ecrireConnexionVercel(client,
  ownerId: string, compteLibelle: string, scelle: Scelle): Promise<void>`.
  Les Tâches 6, 7, 8 les consomment.

- [ ] **Étape 1 : Écrire `supabase.ts` (pas de TDD — assemblage sans logique propre)**

```typescript
// apps/relais-oauth/src/supabase.ts
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';

/**
 * Client en `service_role` : contourne RLS par construction, comme celui du
 * collector (`apps/collector/src/supabase.ts`). C'est ce qui permet au
 * relais d'écrire `connexion_plateforme`/`connexion_secret`, que
 * `authenticated` ne peut jamais atteindre en écriture (étape 2).
 */
export function createClient(config: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}): SupabaseClient<Database> {
  return createSupabaseClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Étape 2 : Écrire les tests de `connexions.ts`, qui échoueront faute de module**

```typescript
// apps/relais-oauth/src/connexions.test.ts
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { chiffrer, lireCleMaitresse } from '@prospeo/coffre';
import { ecrireConnexionGithub, ecrireConnexionVercel } from './connexions.js';

const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));

/**
 * Client simulé minimal : une lecture (`select().eq().eq().maybeSingle()`)
 * suivie d'une écriture (`insert()` OU `update().eq()`), selon que la
 * lecture a trouvé une ligne. Chaque test configure `ligneExistante` et
 * enregistre les appels dans `appels`.
 */
function fakeClient(ligneExistante: { id: string } | null) {
  const appels: { methode: string; table: string; valeurs?: unknown }[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { async maybeSingle() { return { data: ligneExistante, error: null }; } };
                },
                async maybeSingle() {
                  // connexion_secret n'a qu'un seul .eq()
                  return { data: ligneExistante, error: null };
                },
              };
            },
          };
        },
        insert(valeurs: unknown) {
          appels.push({ methode: 'insert', table, valeurs });
          return {
            async then(resolve: (v: { data: null; error: null }) => void) {
              resolve({ data: null, error: null });
            },
            select() {
              return {
                async single() {
                  return { data: { id: 'cx-nouvelle' }, error: null };
                },
              };
            },
          };
        },
        update(valeurs: unknown) {
          appels.push({ methode: 'update', table, valeurs });
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, appels };
}

describe('ecrireConnexionGithub', () => {
  it('insère une nouvelle connexion quand aucune n existe', async () => {
    const { client, appels } = fakeClient(null);
    await ecrireConnexionGithub(client, 'owner-1', '999', 'mon-org');

    const insertion = appels.find((a) => a.methode === 'insert' && a.table === 'connexion_plateforme');
    expect(insertion).toBeDefined();
    const valeurs = insertion?.valeurs as Record<string, unknown>;
    expect(valeurs.owner_id).toBe('owner-1');
    expect(valeurs.plateforme).toBe('github');
    expect(valeurs.reference).toBe('999');
    expect(valeurs.compte_libelle).toBe('mon-org');
    expect(valeurs.etat).toBe('active');
  });

  it('met à jour la connexion existante plutôt que d en créer une seconde', async () => {
    const { client, appels } = fakeClient({ id: 'cx-existante' });
    await ecrireConnexionGithub(client, 'owner-1', '999', 'mon-org');

    const maj = appels.find((a) => a.methode === 'update' && a.table === 'connexion_plateforme');
    expect(maj).toBeDefined();
    expect(appels.some((a) => a.methode === 'insert')).toBe(false);
  });
});

describe('ecrireConnexionVercel', () => {
  it('insère la connexion PUIS le secret chiffré, jamais le clair', async () => {
    const { client, appels } = fakeClient(null);
    const scelle = chiffrer('jeton-vercel-en-clair', CLE);
    await ecrireConnexionVercel(client, 'owner-1', 'mon-equipe', scelle);

    const secret = appels.find((a) => a.table === 'connexion_secret');
    expect(secret).toBeDefined();
    const valeurs = secret?.valeurs as Record<string, unknown>;
    expect(String(valeurs.chiffre)).not.toContain('jeton-vercel-en-clair');
    expect(valeurs.connexion_id).toBe('cx-nouvelle');
  });
});
```

- [ ] **Étape 3 : Lancer, constater l'échec**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: FAIL — `./connexions.js` n'existe pas.

- [ ] **Étape 4 : Écrire `connexions.ts`**

```typescript
// apps/relais-oauth/src/connexions.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { Scelle } from '@prospeo/coffre';

type Client = SupabaseClient<Database>;

/**
 * Écrit les connexions issues des deux flux OAuth (R4 du spec).
 *
 * **Lire-puis-écrire, jamais `upsert`.** Un `upsert` qui inclurait `id` dans
 * ses colonnes réécrirait l'identifiant à chaque reconnexion — cassant la
 * clé étrangère `connexion_secret.connexion_id on delete cascade` (une
 * mise à jour de clé primaire référencée exige `on update cascade`, que la
 * migration ne pose pas). Lire l'existant, puis `insert` ou `update` selon
 * le cas, garde le même `id` d'une reconnexion à l'autre.
 */

async function idConnexion(
  client: Client,
  ownerId: string,
  plateforme: 'github' | 'vercel',
): Promise<string | null> {
  const { data, error } = await client
    .from('connexion_plateforme')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('plateforme', plateforme)
    .maybeSingle();
  if (error !== null) {
    throw new Error(`connexion_plateforme : lecture impossible — ${error.message}`);
  }
  return data?.id ?? null;
}

/** L'existence d'un compte réel — vérifiée avant de signer un `state` pour lui (Tâche 6). */
export async function proprietaireExiste(client: Client, ownerId: string): Promise<boolean> {
  const { data, error } = await client.auth.admin.getUserById(ownerId);
  if (error !== null) return false;
  return data.user !== null;
}

/**
 * GitHub n'a rien à chiffrer (§2 du spec de l'étape 2) : `reference` porte
 * l'`installation_id` en clair.
 */
export async function ecrireConnexionGithub(
  client: Client,
  ownerId: string,
  installationId: string,
  compteLibelle: string,
): Promise<void> {
  const existant = await idConnexion(client, ownerId, 'github');
  const valeurs = {
    owner_id: ownerId,
    plateforme: 'github' as const,
    reference: installationId,
    compte_libelle: compteLibelle,
    etat: 'active' as const,
    connectee_at: new Date().toISOString(),
  };
  const { error } =
    existant === null
      ? await client.from('connexion_plateforme').insert(valeurs)
      : await client.from('connexion_plateforme').update(valeurs).eq('id', existant);
  if (error !== null) {
    throw new Error(`connexion_plateforme (github) : écriture impossible — ${error.message}`);
  }
}

/** Un `bytea` Postgres s'écrit en texte comme `\x` suivi d'hexadécimal. */
function versBytea(buffer: Buffer): string {
  return `\\x${buffer.toString('hex')}`;
}

/** Vercel a un vrai secret : `scelle` (déjà chiffré par l'appelant, Tâche 8) rejoint `connexion_secret`. */
export async function ecrireConnexionVercel(
  client: Client,
  ownerId: string,
  compteLibelle: string,
  scelle: Scelle,
): Promise<void> {
  const existant = await idConnexion(client, ownerId, 'vercel');
  const valeurs = {
    owner_id: ownerId,
    plateforme: 'vercel' as const,
    compte_libelle: compteLibelle,
    etat: 'active' as const,
    connectee_at: new Date().toISOString(),
  };

  let connexionId: string;
  if (existant === null) {
    const { data, error } = await client
      .from('connexion_plateforme')
      .insert(valeurs)
      .select('id')
      .single();
    if (error !== null || data === null) {
      throw new Error(`connexion_plateforme (vercel) : écriture impossible — ${error?.message}`);
    }
    connexionId = data.id;
  } else {
    const { error } = await client.from('connexion_plateforme').update(valeurs).eq('id', existant);
    if (error !== null) {
      throw new Error(`connexion_plateforme (vercel) : écriture impossible — ${error.message}`);
    }
    connexionId = existant;
  }

  const { data: secretExistant, error: erreurLecture } = await client
    .from('connexion_secret')
    .select('connexion_id')
    .eq('connexion_id', connexionId)
    .maybeSingle();
  if (erreurLecture !== null) {
    throw new Error(`connexion_secret : lecture impossible — ${erreurLecture.message}`);
  }

  const valeursSecret = {
    connexion_id: connexionId,
    chiffre: versBytea(scelle.chiffre),
    vecteur: versBytea(scelle.vecteur),
    etiquette: versBytea(scelle.etiquette),
    cle_id: scelle.cleId,
    ecrit_at: new Date().toISOString(),
  };
  const { error: erreurEcriture } =
    secretExistant === null
      ? await client.from('connexion_secret').insert(valeursSecret)
      : await client.from('connexion_secret').update(valeursSecret).eq('connexion_id', connexionId);
  if (erreurEcriture !== null) {
    throw new Error(`connexion_secret : écriture impossible — ${erreurEcriture.message}`);
  }
}
```

- [ ] **Étape 5 : Lancer, constater le passage**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — 3 nouveaux tests, plus les 12 précédents. Transcrire la
sortie complète.

- [ ] **Étape 6 : Casser puis restaurer une assertion**

Modifier temporairement, dans `ecrireConnexionGithub`, `existant === null`
en `true` (force toujours l'insertion). Relancer : le test « met à jour la
connexion existante » doit rougir. Restaurer, relancer, observer le vert.
Transcrire les deux sorties.

- [ ] **Étape 7 : Commit**

```bash
git add apps/relais-oauth/src/supabase.ts apps/relais-oauth/src/connexions.ts apps/relais-oauth/src/connexions.test.ts
git commit -m "feat(relais-oauth): ecrit une connexion github ou vercel, sans dupliquer la ligne"
```

---

## Tâche 6 : `connecter.ts` — le point d'entrée, et son enveloppe Vercel

**Files:**
- Create: `apps/relais-oauth/src/config.ts`, `apps/relais-oauth/src/connecter.ts`,
  `apps/relais-oauth/src/connecter.test.ts`, `apps/relais-oauth/api/connecter.ts`,
  `apps/relais-oauth/.env.example`

**Interfaces:**
- Consumes: `signerState` (`./state.js`, Tâche 2), `createClient` /
  `proprietaireExiste` (`./supabase.js` / `./connexions.js`, Tâche 5),
  `lireCleMaitresse` (`@prospeo/coffre`).
- Produces: `export interface RelaisConfig { … }`, `export function
  loadRelaisConfig(env): RelaisConfig`, `export interface ConnecterDeps {
  proprietaireExiste(ownerId: string): Promise<boolean>; signerState(charge:
  { ownerId: string; plateforme: Plateforme }): string }`, `export type
  ResultatConnecter = { ok: true; url: string } | { ok: false; statut: 400 |
  404; raison: string }`, `export async function construireRedirection(deps,
  liens: { githubInstallUrl: string; vercelInstallUrl: string }, plateforme:
  string | undefined, ownerId: string | undefined):
  Promise<ResultatConnecter>`. Les Tâches 7 et 8 consomment
  `loadRelaisConfig`.

- [ ] **Étape 1 : Écrire `config.ts` (le loader complet du service, pas de TDD — assemblage)**

```typescript
// apps/relais-oauth/src/config.ts
import { lireCleMaitresse, type CleMaitresse } from '@prospeo/coffre';

/**
 * Les onze variables du relais, exigées d'un coup — comme `exiger` dans
 * `apps/collector/src/config.ts`, pour qu'un déploiement mal configuré
 * échoue en nommant TOUT ce qui manque, pas une variable à la fois.
 */
export interface RelaisConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  coffreCle: CleMaitresse;
  oauthStateSecret: string;
  githubAppId: string;
  githubAppPrivateKey: string;
  githubInstallUrl: string;
  vercelOAuthClientId: string;
  vercelOAuthClientSecret: string;
  vercelInstallUrl: string;
  vercelRedirectUri: string;
}

const VARIABLES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PROSPEO_COFFRE_CLE',
  'PROSPEO_OAUTH_STATE_SECRET',
  'PROSPEO_GITHUB_APP_ID',
  'PROSPEO_GITHUB_APP_PRIVATE_KEY',
  'PROSPEO_GITHUB_INSTALL_URL',
  'PROSPEO_VERCEL_OAUTH_CLIENT_ID',
  'PROSPEO_VERCEL_OAUTH_CLIENT_SECRET',
  'PROSPEO_VERCEL_INSTALL_URL',
  'PROSPEO_VERCEL_REDIRECT_URI',
] as const;

export function loadRelaisConfig(env: Record<string, string | undefined>): RelaisConfig {
  const manquantes = VARIABLES.filter((n) => env[n] === undefined || env[n] === '');
  if (manquantes.length > 0) {
    throw new Error(`Configuration incomplète :\n${manquantes.map((n) => `  - ${n}`).join('\n')}`);
  }
  const v = (nom: (typeof VARIABLES)[number]): string => env[nom] as string;
  return {
    supabaseUrl: v('SUPABASE_URL'),
    supabaseServiceRoleKey: v('SUPABASE_SERVICE_ROLE_KEY'),
    coffreCle: lireCleMaitresse(v('PROSPEO_COFFRE_CLE')),
    oauthStateSecret: v('PROSPEO_OAUTH_STATE_SECRET'),
    githubAppId: v('PROSPEO_GITHUB_APP_ID'),
    // Un PEM porte de vrais sauts de ligne ; une variable d'environnement les
    // perd souvent en route. `\n` littéral (deux caractères) est donc rétabli
    // en vrai saut de ligne ici plutôt que de contraindre CHAQUE plateforme
    // d'hébergement à préserver un PEM multi-lignes tel quel.
    githubAppPrivateKey: v('PROSPEO_GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
    githubInstallUrl: v('PROSPEO_GITHUB_INSTALL_URL'),
    vercelOAuthClientId: v('PROSPEO_VERCEL_OAUTH_CLIENT_ID'),
    vercelOAuthClientSecret: v('PROSPEO_VERCEL_OAUTH_CLIENT_SECRET'),
    vercelInstallUrl: v('PROSPEO_VERCEL_INSTALL_URL'),
    vercelRedirectUri: v('PROSPEO_VERCEL_REDIRECT_URI'),
  };
}
```

- [ ] **Étape 2 : Écrire les tests de `connecter.ts`, qui échoueront faute de module**

```typescript
// apps/relais-oauth/src/connecter.test.ts
import { describe, expect, it } from 'vitest';
import { construireRedirection, type ConnecterDeps } from './connecter.js';

const LIENS = {
  githubInstallUrl: 'https://github.com/apps/prospeo-deploiement/installations/new',
  vercelInstallUrl: 'https://vercel.com/integrations/prospeo/new',
};

function deps(surcharges: Partial<ConnecterDeps> = {}): ConnecterDeps {
  return {
    proprietaireExiste: async () => true,
    signerState: () => 'state-signe-de-test',
    ...surcharges,
  };
}

describe('construireRedirection', () => {
  it('refuse une plateforme inconnue', async () => {
    const r = await construireRedirection(deps(), LIENS, 'autre-chose', 'owner-1');
    expect(r).toEqual({ ok: false, statut: 400, raison: expect.any(String) });
  });

  it('refuse un owner absent', async () => {
    const r = await construireRedirection(deps(), LIENS, 'github', undefined);
    expect(r).toEqual({ ok: false, statut: 400, raison: expect.any(String) });
  });

  it("refuse un owner qui n'existe pas", async () => {
    const r = await construireRedirection(deps({ proprietaireExiste: async () => false }), LIENS, 'github', 'inconnu');
    expect(r).toEqual({ ok: false, statut: 404, raison: expect.any(String) });
  });

  it('redirige vers GitHub avec le state signé', async () => {
    const r = await construireRedirection(deps(), LIENS, 'github', 'owner-1');
    expect(r).toEqual({
      ok: true,
      url: 'https://github.com/apps/prospeo-deploiement/installations/new?state=state-signe-de-test',
    });
  });

  it('redirige vers Vercel avec le state signé', async () => {
    const r = await construireRedirection(deps(), LIENS, 'vercel', 'owner-1');
    expect(r).toEqual({
      ok: true,
      url: 'https://vercel.com/integrations/prospeo/new?state=state-signe-de-test',
    });
  });
});
```

- [ ] **Étape 3 : Lancer, constater l'échec**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: FAIL — `./connecter.js` n'existe pas.

- [ ] **Étape 4 : Écrire `connecter.ts`**

```typescript
// apps/relais-oauth/src/connecter.ts
import type { Plateforme } from './state.js';

export interface ConnecterDeps {
  proprietaireExiste(ownerId: string): Promise<boolean>;
  signerState(charge: { ownerId: string; plateforme: Plateforme }): string;
}

export interface LiensInstallation {
  githubInstallUrl: string;
  vercelInstallUrl: string;
}

export type ResultatConnecter =
  | { ok: true; url: string }
  | { ok: false; statut: 400 | 404; raison: string };

/**
 * Le point d'entrée des deux flux (R4 du spec) : vérifie que l'appelant
 * désigne un utilisateur réel AVANT de signer quoi que ce soit — signer un
 * `state` pour un `owner_id` qui n'existe pas ne serait détecté qu'au
 * rappel, bien plus tard, pour rien.
 */
export async function construireRedirection(
  deps: ConnecterDeps,
  liens: LiensInstallation,
  plateforme: string | undefined,
  ownerId: string | undefined,
): Promise<ResultatConnecter> {
  if (plateforme !== 'github' && plateforme !== 'vercel') {
    return { ok: false, statut: 400, raison: 'plateforme doit être « github » ou « vercel ».' };
  }
  if (ownerId === undefined || ownerId === '') {
    return { ok: false, statut: 400, raison: 'owner est obligatoire.' };
  }
  const existe = await deps.proprietaireExiste(ownerId);
  if (!existe) {
    return { ok: false, statut: 404, raison: `aucun utilisateur ${ownerId}.` };
  }
  const state = deps.signerState({ ownerId, plateforme });
  const base = plateforme === 'github' ? liens.githubInstallUrl : liens.vercelInstallUrl;
  return { ok: true, url: `${base}?state=${encodeURIComponent(state)}` };
}
```

- [ ] **Étape 5 : Lancer, constater le passage**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — 5 nouveaux tests, plus les 15 précédents. Transcrire la
sortie complète.

- [ ] **Étape 6 : Casser puis restaurer une assertion**

Modifier temporairement le message d'erreur de `owner est obligatoire` en
retirant la garde (`if (false)`). Relancer : le test « refuse un owner
absent » doit rougir. Restaurer, relancer, observer le vert. Transcrire les
deux sorties.

- [ ] **Étape 7 : L'enveloppe Vercel**

```typescript
// apps/relais-oauth/api/connecter.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { construireRedirection } from '../src/connecter.js';
import { signerState } from '../src/state.js';
import { createClient } from '../src/supabase.js';
import { proprietaireExiste } from '../src/connexions.js';
import { loadRelaisConfig } from '../src/config.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const config = loadRelaisConfig(process.env);
  const client = createClient(config);

  const resultat = await construireRedirection(
    {
      proprietaireExiste: (ownerId) => proprietaireExiste(client, ownerId),
      signerState: (charge) => signerState(charge, config.oauthStateSecret),
    },
    { githubInstallUrl: config.githubInstallUrl, vercelInstallUrl: config.vercelInstallUrl },
    typeof req.query.plateforme === 'string' ? req.query.plateforme : undefined,
    typeof req.query.owner === 'string' ? req.query.owner : undefined,
  );

  if (!resultat.ok) {
    res.status(resultat.statut).send(resultat.raison);
    return;
  }
  res.redirect(302, resultat.url);
}
```

- [ ] **Étape 8 : Documenter les onze variables**

```
# apps/relais-oauth/.env.example
# Prospeo — relais OAuth (chantier n8, etape 3). Variables du DEPLOIEMENT
# VERCEL de ce service — a poser dans Project Settings > Environment
# Variables du projet `prospeo-relais-oauth`, PAS dans le .env du collector.

# --- Supabase (deja utilisees par le collector, memes valeurs) ---------
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# --- Le coffre (chantier n8, etape 2) -----------------------------------
# MEME VALEUR que PROSPEO_COFFRE_CLE dans .env du collector : c'est cette
# cle qui dechiffre ce que ce service chiffre. Generer : voir .env.example
# a la racine du depot.
PROSPEO_COFFRE_CLE=

# --- Le state signe (chantier n8, etape 3) ------------------------------
# Cle HMAC dediee, distincte de PROSPEO_COFFRE_CLE. Generer :
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
PROSPEO_OAUTH_STATE_SECRET=

# --- GitHub App ----------------------------------------------------------
# App ID : en haut de la page de reglages de l App (github.com/settings/apps).
PROSPEO_GITHUB_APP_ID=

# Cle privee .pem generee sur cette meme page ("Generate a private key").
# Les sauts de ligne du PEM doivent survivre : soit coller le fichier tel
# quel si la plateforme le permet, soit remplacer chaque saut de ligne par
# la sequence litterale \n (config.ts les restaure).
PROSPEO_GITHUB_APP_PRIVATE_KEY=

# Lien public d installation, forme github.com/apps/<nom-de-l-app>/installations/new.
PROSPEO_GITHUB_INSTALL_URL=

# --- Integration Vercel ---------------------------------------------------
# Console des integrations Vercel > l integration > Credentials.
PROSPEO_VERCEL_OAUTH_CLIENT_ID=
PROSPEO_VERCEL_OAUTH_CLIENT_SECRET=

# Lien public d installation, forme vercel.com/integrations/<slug>/new.
PROSPEO_VERCEL_INSTALL_URL=

# DOIT correspondre EXACTEMENT au "Redirect URL" enregistre dans la console
# des integrations Vercel, sans quoi l echange de code echoue.
PROSPEO_VERCEL_REDIRECT_URI=https://prospeo-relais-oauth.vercel.app/api/vercel/callback
```

- [ ] **Étape 9 : Vérifier et commiter**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — toujours 20 tests (l'enveloppe et `.env.example` n'ajoutent
aucun test, ils ne portent aucune logique propre).

Run: `pnpm -r typecheck`
Expected: vert sur tous les paquets.

```bash
git add apps/relais-oauth/src/config.ts apps/relais-oauth/src/connecter.ts apps/relais-oauth/src/connecter.test.ts apps/relais-oauth/api/connecter.ts apps/relais-oauth/.env.example
git commit -m "feat(relais-oauth): /api/connecter signe le state et redirige"
```

---

## Tâche 7 : `github-callback.ts`, et son enveloppe Vercel

**Files:**
- Create: `apps/relais-oauth/src/page.ts`, `apps/relais-oauth/src/github-callback.ts`,
  `apps/relais-oauth/src/github-callback.test.ts`,
  `apps/relais-oauth/api/github/callback.ts`

**Interfaces:**
- Consumes: `verifierState`/`ResultatState` (`./state.js`, Tâche 2),
  `createGithubAppClient` (`./github.js`, Tâche 3), `createClient` /
  `ecrireConnexionGithub` (`./supabase.js` / `./connexions.js`, Tâche 5),
  `loadRelaisConfig` (`./config.js`, Tâche 6).
- Produces: `export function pageConfirmation(succes: boolean): string`,
  `export interface GithubCallbackDeps { verifierState(state: string):
  ResultatState; lireInstallation(installationId: string): Promise<{
  compteLibelle: string }>; ecrireConnexion(ownerId: string, installationId:
  string, compteLibelle: string): Promise<void> }`, `export type
  ResultatCallback = { ok: true } | { ok: false; raison: string }`, `export
  async function traiterRappelGithub(deps, params: { installationId: string
  | undefined; setupAction: string | undefined; state: string | undefined
  }): Promise<ResultatCallback>`. La Tâche 8 consomme `pageConfirmation`.

- [ ] **Étape 1 : Écrire `page.ts` (pas de TDD — une chaîne statique)**

```typescript
// apps/relais-oauth/src/page.ts
/**
 * La page HTML minimale rendue par les deux rappels — jamais le détail
 * d'un échec (R5 du spec) : un `state` invalide ou un échange de code
 * refusé rend le MÊME message générique, quelle qu'en soit la cause
 * précise, consignée elle dans les journaux du déploiement.
 */
export function pageConfirmation(succes: boolean): string {
  const titre = succes ? 'Connecté' : 'Échec';
  const message = succes
    ? 'Vous pouvez fermer cet onglet.'
    : "La connexion n'a pas abouti. Réessayez depuis Prospeo.";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>Prospeo — ${titre}</title></head><body><h1>${titre}</h1><p>${message}</p></body></html>`;
}
```

- [ ] **Étape 2 : Écrire les tests de `github-callback.ts`, qui échoueront faute de module**

```typescript
// apps/relais-oauth/src/github-callback.test.ts
import { describe, expect, it, vi } from 'vitest';
import { traiterRappelGithub, type GithubCallbackDeps } from './github-callback.js';
import type { ResultatState } from './state.js';

const ETAT_VALIDE: ResultatState = {
  ok: true,
  charge: { ownerId: 'owner-1', plateforme: 'github', exp: Date.now() + 60000 },
};

function deps(surcharges: Partial<GithubCallbackDeps> = {}): GithubCallbackDeps {
  return {
    verifierState: () => ETAT_VALIDE,
    lireInstallation: async () => ({ compteLibelle: 'mon-org' }),
    ecrireConnexion: async () => {},
    ...surcharges,
  };
}

describe('traiterRappelGithub', () => {
  it('refuse un state manquant', async () => {
    const r = await traiterRappelGithub(deps(), { installationId: '1', setupAction: 'install', state: undefined });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un state invalide', async () => {
    const r = await traiterRappelGithub(
      deps({ verifierState: () => ({ ok: false, raison: 'signature_invalide' }) }),
      { installationId: '1', setupAction: 'install', state: 'x' },
    );
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un state signé pour une AUTRE plateforme', async () => {
    const r = await traiterRappelGithub(
      deps({
        verifierState: () => ({ ok: true, charge: { ownerId: 'owner-1', plateforme: 'vercel', exp: Date.now() + 60000 } }),
      }),
      { installationId: '1', setupAction: 'install', state: 'x' },
    );
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse une action de setup inattendue', async () => {
    const r = await traiterRappelGithub(deps(), { installationId: '1', setupAction: 'request', state: 'x' });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un installation_id manquant', async () => {
    const r = await traiterRappelGithub(deps(), { installationId: undefined, setupAction: 'install', state: 'x' });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('écrit la connexion avec le libellé lu chez GitHub, sur succès', async () => {
    const ecrireConnexion = vi.fn(async () => {});
    const r = await traiterRappelGithub(deps({ ecrireConnexion }), {
      installationId: '999',
      setupAction: 'install',
      state: 'x',
    });
    expect(r).toEqual({ ok: true });
    expect(ecrireConnexion).toHaveBeenCalledWith('owner-1', '999', 'mon-org');
  });
});
```

- [ ] **Étape 3 : Lancer, constater l'échec**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: FAIL — `./github-callback.js` n'existe pas.

- [ ] **Étape 4 : Écrire `github-callback.ts`**

```typescript
// apps/relais-oauth/src/github-callback.ts
import type { ResultatState } from './state.js';

export interface GithubCallbackDeps {
  verifierState(state: string): ResultatState;
  lireInstallation(installationId: string): Promise<{ compteLibelle: string }>;
  ecrireConnexion(ownerId: string, installationId: string, compteLibelle: string): Promise<void>;
}

export type ResultatCallback = { ok: true } | { ok: false; raison: string };

/**
 * Le rappel `Setup URL` de la GitHub App (R4 du spec). `setup_action` vaut
 * `install` à la première installation, `update` si l'utilisateur modifie
 * les dépôts autorisés — les deux valent une connexion active ; toute
 * autre valeur (GitHub en introduit parfois de nouvelles) est refusée
 * plutôt que traitée à l'aveugle.
 */
export async function traiterRappelGithub(
  deps: GithubCallbackDeps,
  params: { installationId: string | undefined; setupAction: string | undefined; state: string | undefined },
): Promise<ResultatCallback> {
  if (params.state === undefined) return { ok: false, raison: 'state manquant' };
  const verif = deps.verifierState(params.state);
  if (!verif.ok) return { ok: false, raison: `state ${verif.raison}` };
  if (verif.charge.plateforme !== 'github') {
    return { ok: false, raison: 'state signé pour une autre plateforme' };
  }
  if (params.setupAction !== 'install' && params.setupAction !== 'update') {
    return { ok: false, raison: `setup_action inattendu : ${params.setupAction ?? '(absent)'}` };
  }
  if (params.installationId === undefined) {
    return { ok: false, raison: 'installation_id manquant' };
  }

  const installation = await deps.lireInstallation(params.installationId);
  await deps.ecrireConnexion(verif.charge.ownerId, params.installationId, installation.compteLibelle);
  return { ok: true };
}
```

- [ ] **Étape 5 : Lancer, constater le passage**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — 6 nouveaux tests, plus les 20 précédents. Transcrire la
sortie complète.

- [ ] **Étape 6 : Casser puis restaurer une assertion**

Modifier temporairement `verif.charge.plateforme !== 'github'` en
`false` (la garde ne refuse plus rien). Relancer : le test « refuse un
state signé pour une AUTRE plateforme » doit rougir. Restaurer, relancer,
observer le vert. Transcrire les deux sorties.

- [ ] **Étape 7 : L'enveloppe Vercel**

```typescript
// apps/relais-oauth/api/github/callback.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { traiterRappelGithub } from '../../src/github-callback.js';
import { pageConfirmation } from '../../src/page.js';
import { verifierState } from '../../src/state.js';
import { createGithubAppClient } from '../../src/github.js';
import { createClient } from '../../src/supabase.js';
import { ecrireConnexionGithub } from '../../src/connexions.js';
import { loadRelaisConfig } from '../../src/config.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const config = loadRelaisConfig(process.env);
  const client = createClient(config);
  const githubApp = createGithubAppClient({ appId: config.githubAppId, clePrivee: config.githubAppPrivateKey });

  const resultat = await traiterRappelGithub(
    {
      verifierState: (state) => verifierState(state, config.oauthStateSecret),
      lireInstallation: (id) => githubApp.lireInstallation(id),
      ecrireConnexion: (ownerId, installationId, compteLibelle) =>
        ecrireConnexionGithub(client, ownerId, installationId, compteLibelle),
    },
    {
      installationId: typeof req.query.installation_id === 'string' ? req.query.installation_id : undefined,
      setupAction: typeof req.query.setup_action === 'string' ? req.query.setup_action : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
    },
  );

  if (!resultat.ok) {
    // La raison précise reste ICI, dans les journaux du déploiement — jamais
    // dans la page rendue au navigateur (R5 du spec).
    console.error('rappel github échoué :', resultat.raison);
  }
  res.status(resultat.ok ? 200 : 400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
    pageConfirmation(resultat.ok),
  );
}
```

- [ ] **Étape 8 : Vérifier et commiter**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — toujours 26 tests.

Run: `pnpm -r typecheck`
Expected: vert.

```bash
git add apps/relais-oauth/src/page.ts apps/relais-oauth/src/github-callback.ts apps/relais-oauth/src/github-callback.test.ts apps/relais-oauth/api/github/callback.ts
git commit -m "feat(relais-oauth): /api/github/callback ecrit l installation, jamais un secret"
```

---

## Tâche 8 : `vercel-callback.ts`, et son enveloppe Vercel

**Files:**
- Create: `apps/relais-oauth/src/vercel-callback.ts`,
  `apps/relais-oauth/src/vercel-callback.test.ts`,
  `apps/relais-oauth/api/vercel/callback.ts`

**Interfaces:**
- Consumes: `verifierState`/`ResultatState` (`./state.js`, Tâche 2),
  `createVercelOAuthClient` (`./vercel-oauth.js`, Tâche 4), `chiffrer`/
  `CleMaitresse` (`@prospeo/coffre`, Tâche 1), `createClient` /
  `ecrireConnexionVercel` (Tâche 5), `pageConfirmation` (Tâche 7),
  `loadRelaisConfig` (Tâche 6).
- Produces: `export interface VercelCallbackDeps { verifierState(state:
  string): ResultatState; echangerCode(code: string, redirectUri: string):
  Promise<{ accessToken: string; teamId: string | null }>; ecrireConnexion(
  ownerId: string, compteLibelle: string, scelle: Scelle): Promise<void>;
  cle: CleMaitresse; redirectUri: string }`, `export async function
  traiterRappelVercel(deps, params: { code: string | undefined; state:
  string | undefined }): Promise<ResultatCallback>`.

- [ ] **Étape 1 : Écrire les tests, qui échoueront faute de module**

```typescript
// apps/relais-oauth/src/vercel-callback.test.ts
import { describe, expect, it, vi } from 'vitest';
import { lireCleMaitresse } from '@prospeo/coffre';
import { traiterRappelVercel, type VercelCallbackDeps } from './vercel-callback.js';
import type { ResultatState } from './state.js';

const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));

const ETAT_VALIDE: ResultatState = {
  ok: true,
  charge: { ownerId: 'owner-1', plateforme: 'vercel', exp: Date.now() + 60000 },
};

function deps(surcharges: Partial<VercelCallbackDeps> = {}): VercelCallbackDeps {
  return {
    verifierState: () => ETAT_VALIDE,
    echangerCode: async () => ({ accessToken: 'jeton-vercel-en-clair', teamId: 'team_x' }),
    ecrireConnexion: async () => {},
    cle: CLE,
    redirectUri: 'https://relais.example/api/vercel/callback',
    ...surcharges,
  };
}

describe('traiterRappelVercel', () => {
  it('refuse un state manquant', async () => {
    const r = await traiterRappelVercel(deps(), { code: 'c1', state: undefined });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un state invalide', async () => {
    const r = await traiterRappelVercel(deps({ verifierState: () => ({ ok: false, raison: 'expire' }) }), {
      code: 'c1',
      state: 'x',
    });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un state signé pour une AUTRE plateforme', async () => {
    const r = await traiterRappelVercel(
      deps({
        verifierState: () => ({ ok: true, charge: { ownerId: 'owner-1', plateforme: 'github', exp: Date.now() + 60000 } }),
      }),
      { code: 'c1', state: 'x' },
    );
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un code manquant', async () => {
    const r = await traiterRappelVercel(deps(), { code: undefined, state: 'x' });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('chiffre le jeton avant de l écrire, jamais en clair', async () => {
    const ecrireConnexion = vi.fn(async () => {});
    const r = await traiterRappelVercel(deps({ ecrireConnexion }), { code: 'c1', state: 'x' });

    expect(r).toEqual({ ok: true });
    expect(ecrireConnexion).toHaveBeenCalledTimes(1);
    const [ownerId, compteLibelle, scelle] = ecrireConnexion.mock.calls[0] as [string, string, { chiffre: Buffer }];
    expect(ownerId).toBe('owner-1');
    expect(compteLibelle).toBe('team_x');
    expect(scelle.chiffre.toString('utf8')).not.toContain('jeton-vercel-en-clair');
  });

  it('nomme le compte « compte personnel » quand teamId est nul', async () => {
    const ecrireConnexion = vi.fn(async () => {});
    await traiterRappelVercel(
      deps({ echangerCode: async () => ({ accessToken: 'x', teamId: null }), ecrireConnexion }),
      { code: 'c1', state: 'x' },
    );
    const [, compteLibelle] = ecrireConnexion.mock.calls[0] as [string, string];
    expect(compteLibelle).toBe('compte personnel');
  });
});
```

- [ ] **Étape 2 : Lancer, constater l'échec**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: FAIL — `./vercel-callback.js` n'existe pas.

- [ ] **Étape 3 : Écrire `vercel-callback.ts`**

```typescript
// apps/relais-oauth/src/vercel-callback.ts
import { chiffrer, type CleMaitresse, type Scelle } from '@prospeo/coffre';
import type { ResultatState } from './state.js';

export interface VercelCallbackDeps {
  verifierState(state: string): ResultatState;
  echangerCode(code: string, redirectUri: string): Promise<{ accessToken: string; teamId: string | null }>;
  ecrireConnexion(ownerId: string, compteLibelle: string, scelle: Scelle): Promise<void>;
  cle: CleMaitresse;
  redirectUri: string;
}

export type ResultatCallback = { ok: true } | { ok: false; raison: string };

/**
 * Le rappel Redirect URL de l'intégration Vercel (R4 du spec). Le jeton
 * reçu est chiffré ICI, avant tout appel à `ecrireConnexion` — le clair ne
 * voyage jamais jusqu'à `connexions.ts`.
 */
export async function traiterRappelVercel(
  deps: VercelCallbackDeps,
  params: { code: string | undefined; state: string | undefined },
): Promise<ResultatCallback> {
  if (params.state === undefined) return { ok: false, raison: 'state manquant' };
  const verif = deps.verifierState(params.state);
  if (!verif.ok) return { ok: false, raison: `state ${verif.raison}` };
  if (verif.charge.plateforme !== 'vercel') {
    return { ok: false, raison: 'state signé pour une autre plateforme' };
  }
  if (params.code === undefined) return { ok: false, raison: 'code manquant' };

  const jeton = await deps.echangerCode(params.code, deps.redirectUri);
  const scelle = chiffrer(jeton.accessToken, deps.cle);
  const compteLibelle = jeton.teamId ?? 'compte personnel';
  await deps.ecrireConnexion(verif.charge.ownerId, compteLibelle, scelle);
  return { ok: true };
}
```

- [ ] **Étape 4 : Lancer, constater le passage**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — 6 nouveaux tests, plus les 26 précédents (32 au total).
Transcrire la sortie complète.

- [ ] **Étape 5 : Casser puis restaurer une assertion**

Modifier temporairement `chiffrer(jeton.accessToken, deps.cle)` en `{
chiffre: Buffer.from(jeton.accessToken), vecteur: Buffer.alloc(12), etiquette:
Buffer.alloc(16), cleId: 'x' }` (le clair passe tel quel). Relancer : le test
« chiffre le jeton avant de l'écrire » doit rougir. Restaurer, relancer,
observer le vert. Transcrire les deux sorties.

- [ ] **Étape 6 : L'enveloppe Vercel**

```typescript
// apps/relais-oauth/api/vercel/callback.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { traiterRappelVercel } from '../../src/vercel-callback.js';
import { pageConfirmation } from '../../src/page.js';
import { verifierState } from '../../src/state.js';
import { createVercelOAuthClient } from '../../src/vercel-oauth.js';
import { createClient } from '../../src/supabase.js';
import { ecrireConnexionVercel } from '../../src/connexions.js';
import { loadRelaisConfig } from '../../src/config.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const config = loadRelaisConfig(process.env);
  const client = createClient(config);
  const vercelOAuth = createVercelOAuthClient({
    clientId: config.vercelOAuthClientId,
    clientSecret: config.vercelOAuthClientSecret,
  });

  const resultat = await traiterRappelVercel(
    {
      verifierState: (state) => verifierState(state, config.oauthStateSecret),
      echangerCode: (code, redirectUri) => vercelOAuth.echangerCode(code, redirectUri),
      ecrireConnexion: (ownerId, compteLibelle, scelle) =>
        ecrireConnexionVercel(client, ownerId, compteLibelle, scelle),
      cle: config.coffreCle,
      redirectUri: config.vercelRedirectUri,
    },
    {
      code: typeof req.query.code === 'string' ? req.query.code : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
    },
  );

  if (!resultat.ok) {
    console.error('rappel vercel échoué :', resultat.raison);
  }
  res.status(resultat.ok ? 200 : 400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
    pageConfirmation(resultat.ok),
  );
}
```

- [ ] **Étape 7 : Vérifier et commiter**

Run: `pnpm --filter @prospeo/relais-oauth test`
Expected: PASS — 32 tests, suite entière. Transcrire la sortie complète.

Run: `pnpm -r typecheck`
Expected: vert sur les six paquets (`core`, `db`, `coffre`, `collector`,
`dashboard`, `relais-oauth`, plus `site-template`).

```bash
git add apps/relais-oauth/src/vercel-callback.ts apps/relais-oauth/src/vercel-callback.test.ts apps/relais-oauth/api/vercel/callback.ts
git commit -m "feat(relais-oauth): /api/vercel/callback chiffre le jeton avant de l ecrire"
```

---

## Tâche 9 : Déploiement, vérification manuelle, et HANDOFF.md

Cette tâche n'écrit plus de code testable automatiquement : elle déploie le
service, pose ses onze variables, et prouve — une fois, à la main, comme
l'exige le spec §5 — que les deux flux marchent contre GitHub et Vercel
réels.

**Files:**
- Modify: `docs/design/HANDOFF.md`

- [ ] **Étape 1 : Créer le projet Vercel du relais**

Depuis [vercel.com/new](https://vercel.com/new), importer le dépôt, choisir
**Root Directory: `apps/relais-oauth`**, nommer le projet
`prospeo-relais-oauth` (pour que le domaine corresponde à ce que le
formulaire de l'intégration Vercel porte déjà — voir spec §2). **Framework
Preset : « Other »** — ce projet n'a ni page ni build, seulement des
fonctions sous `api/`, contrairement à `apps/dashboard` (Vite) et
`apps/site-template` (Astro), les deux seuls autres projets Vercel du
dépôt. Aucun `vercel.json` n'existe pour les deux autres (zéro-config
suffit) ; si le déploiement échoue faute de détection, poser
`{"buildCommand": null}` dans un `vercel.json` à la racine de
`apps/relais-oauth` avant de creuser plus loin.

- [ ] **Étape 2 : Poser les onze variables**

Dans Project Settings → Environment Variables du projet
`prospeo-relais-oauth`, poser chacune des variables listées dans
`apps/relais-oauth/.env.example`, avec les vraies valeurs — App ID et clé
privée GitHub, Client ID/Secret Vercel, une clé HMAC neuve pour
`PROSPEO_OAUTH_STATE_SECRET`, et les liens d'installation notés à la
création des deux comptes (spec §2). **Jamais dans un commit, un message,
ou un fichier suivi par git.**

- [ ] **Étape 3 : Vérifier le déploiement**

Run: `curl -i "https://prospeo-relais-oauth.vercel.app/api/connecter?plateforme=vercel&owner=131ab48e-055a-4a15-af4b-79ed7a2e4465"`
Expected: `302`, avec un en-tête `Location` pointant vers
`vercel.com/integrations/…/new?state=…`.

- [ ] **Étape 4 : La preuve manuelle — Vercel**

Ouvrir l'URL de l'étape 3 dans un navigateur, autoriser l'intégration.
Vérifier :
1. la page finale affiche « Connecté » ;
2. dans Supabase, `connexion_plateforme` porte une ligne `plateforme =
   'vercel'`, `owner_id` = l'identifiant utilisé, `etat = 'active'` ;
3. `connexion_secret` porte une ligne pour cette connexion — jamais le
   jeton en clair (vérifier au survol de la colonne `chiffre` dans
   l'éditeur Supabase : des octets, pas du texte lisible).

- [ ] **Étape 5 : La preuve manuelle — GitHub**

Répéter avec `plateforme=github`. Installer l'App sur un compte de test.
Vérifier que `connexion_plateforme` porte une ligne `plateforme =
'github'`, `reference` = l'`installation_id` réel, et qu'**aucune ligne
`connexion_secret`** ne s'y rattache (rien à chiffrer, §2 du spec).

- [ ] **Étape 6 : Documenter dans HANDOFF.md**

Ajouter, après la section « Chantier n°8, étape 2 » existante :

```markdown
## Chantier n°8, étape 3 — le relais OAuth : ce qui connecte, et ce qui ne rebranche rien

**Déployé le <DATE-REELLE-DU-DEPLOIEMENT>.** Ne pas lire ce tableau comme clos.

### Ce qui est prouvé, contre GitHub et Vercel réels

Un utilisateur clique un lien (`/api/connecter?plateforme=…&owner=…`),
installe la GitHub App ou autorise l'intégration Vercel sur SON propre
compte, et `connexion_plateforme` porte une vraie connexion — `reference`
pour GitHub (non secret), `connexion_secret` chiffré pour Vercel. Prouvé une
fois, à la main (§5 du spec — un flux OAuth complet ne se simule pas en
test automatisé), le <DATE> par le propriétaire.

Le `state` signé (HMAC-SHA256, dix minutes de validité) empêche qu'un tiers
force l'écriture d'une connexion pour un `owner_id` qui n'est pas le sien.

### Ce qui n'est PAS construit, et c'est le point important

**`publish.ts`/`deploy.ts` n'ont pas changé.** La chaîne de déploiement
continue d'utiliser `GITHUB_TOKEN`/`VERCEL_TOKEN`, les secrets partagés —
une vraie connexion peut exister dans `connexion_plateforme` sans que rien
dans le collector ne la lise encore. Rebrancher la chaîne attend D8 (un
worker par utilisateur).

**Aucun écran dashboard.** Rien n'affiche encore « Vercel connecté depuis…
» — le critère de succès n°3 du spec de l'étape 2 reste reporté, cette fois
à l'étape où un worker par utilisateur existera pour donner un sens à
l'écran.

**Le processus de péremption (D10) n'existe toujours pas.**
```

- [ ] **Étape 7 : Commit**

```bash
git add docs/design/HANDOFF.md
git commit -m "docs(handoff): ce que le relais oauth connecte, et ce qu il ne rebranche pas"
```
