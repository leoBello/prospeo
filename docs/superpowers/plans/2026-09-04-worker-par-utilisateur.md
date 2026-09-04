# Le worker par utilisateur (D8) et son superviseur — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la chaîne de campagne (`publier`/`deployer`) agisse avec les jetons GitHub/Vercel de SON utilisateur au lieu du `.env` global, qu'un battement par utilisateur remplace le singleton, et qu'un superviseur démarre/surveille/arrête un worker par utilisateur éligible.

**Architecture :** Deux fonctions de résolution de jeton (`jetonDe` pour Vercel, déjà là ; `jetonInstallationGithub`, nouvelle, pour GitHub — un jeton d'installation fabriqué à la demande, jamais stocké) branchées dans `chaineDeps`. Une table sœur de battement, une ligne par utilisateur. Un superviseur à base de `child_process`, dont la logique de décision (qui démarrer, qui arrêter, quand redémarrer) est pure et testée séparément de l'exécution réelle des process.

**Spec :** [`2026-09-04-worker-par-utilisateur-design.md`](../specs/2026-09-04-worker-par-utilisateur-design.md) — décisions V1 à V5.

---

## Global Constraints

- **Tout est en français** : code, commentaires, tests, documentation. Les commentaires disent le *pourquoi*, jamais le *quoi*.
- **Imports en `.js`** même depuis un `.ts` (ESM/NodeNext).
- **Écris le test d'abord**, vérifie qu'il échoue pour la bonne raison, et **prouve que chaque assertion peut échouer** : casse, observe le rouge, restaure, observe le vert. Un récit sans transcription n'est pas une preuve.
- **Un argument `-- <motif>` ne restreint PAS un run vitest** ici : la suite entière s'exécute toujours. Ne prétends jamais avoir lancé un sous-ensemble.
- **`supabase/migrations/` s'applique à une instance de production**, sans recette et sans retour en arrière.
- **`packages/db/src/database.types.ts` est généré** — jamais édité à la main.
- **Aucun secret ne s'écrit dans un test, un journal, un message d'erreur ou un commit.**
- **Aucun `drop`, aucun `alter column` sur un objet préexistant.** Cette migration ne fait que créer.

### Le protocole des migrations, non négociable

1. L'implémenteur de la Tâche 1 **écrit le SQL et s'arrête** : il n'applique rien, ne commite rien.
2. Le contrôleur relit **instruction par instruction** et présente son verdict.
3. Le propriétaire valide.
4. Le contrôleur lance `pnpm db:push` puis `pnpm db:types`, et commite **après** application.
5. **Seulement alors** la Tâche 2 (et toutes les suivantes) sont dispatchées — elles dépendent du type `worker_heartbeat_utilisateur` généré.

**Aucun collector ne doit tourner pendant l'application de la migration** — vérifier que `worker_heartbeat.beat_at` ne bouge plus sur deux lectures à trente secondes d'intervalle, pas seulement qu'il est ancien.

### État de départ

`master` à `0576594`. Collector **379 tests / 28 fichiers**, dashboard **546 / 47**, `pnpm -r typecheck` vert sur les sept paquets scopés (`relais-oauth` inclus, non touché par ce plan). Trois lignes dans `connexion_plateforme` : le propriétaire réel (`131ab48e-055a-4a15-af4b-79ed7a2e4465`, `github` + `vercel` actifs) et une ligne de témoin (`b81c0bf1-975a-45ca-904d-1bebb196b829`, `vercel` seul, fixture du script `verifier-cloisonnement.mjs` de l'étape 1) — inerte pour ce chantier puisqu'elle n'a pas les deux plateformes actives.

---

## File Structure

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260905093000_worker_heartbeat_utilisateur.sql` | la table sœur de battement, une ligne par utilisateur, et sa RLS |
| `apps/collector/src/sources/github-app.ts` | fabrique un jeton d'installation GitHub App à la demande — jamais stocké |
| `apps/collector/src/sources/github-app.test.ts` | — |
| `apps/collector/src/coffre-supabase.ts` | le vrai accès Supabase derrière `CoffreDeps`/`CoffreGithubDeps` |
| `apps/collector/src/coffre-supabase.test.ts` | — |
| `apps/collector/src/superviseur.ts` | la décision pure : qui démarrer, qui arrêter, qui tuer — sans jamais toucher un vrai process |
| `apps/collector/src/superviseur.test.ts` | — |

**Modifiés :**

| Fichier | Ce qui change |
|---|---|
| `apps/collector/src/coffre.ts` | `jetonInstallationGithub()` et `CoffreGithubDeps`, sœurs de `jetonDe()`/`CoffreDeps` |
| `apps/collector/src/coffre.test.ts` | tests de `jetonInstallationGithub` |
| `apps/collector/src/chaine.ts` | `publier()`/`deployer()` résolvent jeton + compte par utilisateur |
| `apps/collector/src/chaine.test.ts` | `clientSimule` étendu à `connexion_plateforme` ; nouveaux tests d'échec de résolution |
| `apps/collector/src/config.ts` | `loadGithubAppConfig()`, `loadGithubTemplateConfig()` |
| `apps/collector/src/config.test.ts` | tests des deux nouveaux loaders |
| `apps/collector/src/cli.ts` | `battre()` du `worker` écrit `worker_heartbeat_utilisateur` ; nouvelle commande `superviseur` |
| `apps/dashboard/src/data/campagne.ts` | `fetchHeartbeat` lit `worker_heartbeat_utilisateur`, sans filtre explicite (RLS suffit) |
| `apps/dashboard/src/data/campagne.test.ts` | test direct de `fetchHeartbeat` |
| `.env.example` | les deux secrets de l'App GitHub, dupliqués côté collector |
| `packages/db/src/database.types.ts` | **régénéré**, après application de la migration |
| `docs/design/HANDOFF.md` | ce que cette étape branche, et ce qui reste hors périmètre |

---

## Tâche 1 : La table sœur de battement

**Files:**
- Create: `supabase/migrations/20260905093000_worker_heartbeat_utilisateur.sql`
- Modify (généré, après application) : `packages/db/src/database.types.ts`

> **Périmètre de l'implémenteur : écrire le SQL, rien d'autre.** Pas de `db:push`, pas de `db:types`, pas de commit.

- [ ] **Étape 1 : Vérifier qu'aucun worker ne tourne**

Lire `worker_heartbeat.beat_at` **deux fois à trente secondes d'intervalle** (`select beat_at from worker_heartbeat where id = true`). S'il a bougé, un worker tourne : s'arrêter et le signaler.

- [ ] **Étape 2 : Écrire la migration**

```sql
-- Chantier n°8, étape suivante — le worker par utilisateur (D8) : la table
-- sœur de battement.
--
-- POURQUOI UNE NOUVELLE TABLE ET NON worker_heartbeat MODIFIÉE.
-- worker_heartbeat est un singleton (`id boolean primary key`, contrainte
-- worker_heartbeat_singleton) : elle ne porte qu'UNE ligne, pour UN worker.
-- D8 met un worker par utilisateur ; le dépôt interdit `alter`/`drop` sur un
-- objet existant, et la forme même de cette table (un booléen en clé
-- primaire) est incompatible avec plusieurs lignes. worker_heartbeat devient
-- donc morte pour le worker de campagne — elle ne se supprime pas, elle
-- reste disponible pour un usage futur (D10, ou un diagnostic global).
--
-- PAS DE LIGNE D'AMORÇAGE, DÉLIBÉRÉMENT. L'ancienne table en avait besoin
-- (une date volontairement ancienne) parce qu'elle est toujours interrogée
-- par `id = true` : une ligne devait exister pour se lire « à l'arrêt ». Ici,
-- un utilisateur qui n'a jamais eu de worker démarré n'a simplement PAS DE
-- LIGNE — deux absences de nature différente (« pas encore » n'est pas
-- « jamais »). Le dashboard traite déjà `null` comme « à l'arrêt »
-- (`fetchHeartbeat`, `useCampagne.ts`) : aucun amorçage n'est nécessaire.

create table worker_heartbeat_utilisateur (
  owner_id   uuid primary key references auth.users (id),
  beat_at    timestamptz not null,

  -- Combien de jobs ce worker tient en ce moment — même rôle que sur
  -- worker_heartbeat. `version` de l'ancienne table n'est PAS reconduite :
  -- elle n'est lue ni écrite nulle part, y compris dans l'ancienne — la
  -- porter ici serait reconduire une pièce déjà morte.
  in_flight  integer not null default 0
);

alter table worker_heartbeat_utilisateur enable row level security;

-- Même forme que les seize tables du chantier n°8, étape 1 : chacun ne lit
-- que sa propre ligne. Jamais écrite par le dashboard — seul `service_role`
-- (le worker, puis le superviseur) y écrit, contournant RLS par
-- construction.
create policy proprietaire_seul on worker_heartbeat_utilisateur
  for select to authenticated
  using (owner_id = (select auth.uid()));
```

- [ ] **Étape 3 : Relire instruction par instruction**

Cinq instructions. Vérifier :

1. aucune ne contient `drop`, `alter column`, `truncate` ni `delete` ;
2. `create table` porte un nom neuf — `grep -n "create table worker_heartbeat_utilisateur" supabase/migrations/*.sql` ne rend qu'une occurrence ;
3. `owner_id` référence `auth.users (id)` et porte `primary key` (pas de ligne sans propriétaire, pas de doublon par utilisateur) ;
4. la politique filtre bien sur `owner_id = (select auth.uid())`, forme à sous-select unique — pas `auth.uid()` répété par ligne ;
5. aucune politique d'écriture n'est posée pour `authenticated` — seul `service_role` écrit.

- [ ] **Étape 4 : S'arrêter et rapporter**

Ne rien appliquer, ne rien commiter. Rapporter les cinq contrôles avec leur sortie réelle.

---

## JALON — la migration s'applique avant de continuer

Le contrôleur (pas un subagent) :

1. relit la migration de la Tâche 1 instruction par instruction ;
2. présente son verdict au propriétaire et attend sa validation explicite ;
3. une fois validée : `pnpm db:push` puis `pnpm db:types` ;
4. commite la migration et les types régénérés, **après** application — jamais avant.

Les Tâches 2 et 7 lisent/écrivent `worker_heartbeat_utilisateur` via le client Supabase typé : elles ne compilent pas tant que `database.types.ts` n'a pas été régénéré. **Ne dispatcher aucune tâche suivante avant que ce jalon soit franchi.**

---

## Tâche 2 : Le battement du `worker` s'écrit par utilisateur

**Files:**
- Modify: `apps/collector/src/cli.ts:1829-1838` (fonction `battre` du `case 'worker'`)

**Interfaces:**
- Consomme : la table `worker_heartbeat_utilisateur` (Tâche 1, appliquée), `proprietaire: Proprietaire` (déjà dans la portée du `case 'worker'`).
- Produit : rien de nouveau — `battre()` garde exactement sa forme d'appel (`await battre()`), seule son écriture change.

> **Ce `case` n'a pas de test unitaire dédié**, comme aujourd'hui : c'est l'assemblage réel (client Supabase, timers, Realtime), au même titre que le reste du `case 'worker'`. La preuve se fait par `pnpm --filter @prospeo/collector typecheck` (le nouveau nom de table doit être accepté par le client typé) et, plus tard, par l'observation du battement réel en base pendant la Tâche 7.

- [ ] **Étape 1 : Lire le code actuel**

```ts
const battre = async (): Promise<void> => {
  const { error } = await client
    .from('worker_heartbeat')
    .update({ beat_at: new Date().toISOString(), in_flight: enCours })
    .eq('id', true);
  // Journalisé, jamais fatal : perdre un battement est un désagrément,
  // interrompre un déploiement en cours en est un autre. Même doctrine
  // que `createEventSink`.
  if (error) process.stderr.write(`worker : battement échoué — ${error.message}\n`);
};
```

- [ ] **Étape 2 : Remplacer par l'écriture par utilisateur**

```ts
const battre = async (): Promise<void> => {
  // `upsert`, et non `update` : contrairement à l'ancien singleton, cette
  // table n'a PAS de ligne d'amorçage (Tâche 1) — le tout premier battement
  // d'un utilisateur doit INSÉRER sa ligne, les suivants la mettent à jour.
  // `owner_id` est la clé primaire : la cible de conflit est implicite.
  const { error } = await client
    .from('worker_heartbeat_utilisateur')
    .upsert({ owner_id: proprietaire, beat_at: new Date().toISOString(), in_flight: enCours });
  // Journalisé, jamais fatal : perdre un battement est un désagrément,
  // interrompre un déploiement en cours en est un autre. Même doctrine
  // que `createEventSink`.
  if (error) process.stderr.write(`worker : battement échoué — ${error.message}\n`);
};
```

- [ ] **Étape 3 : Vérifier la compilation**

Run: `pnpm --filter @prospeo/collector typecheck`
Expected: `Done`, 0 erreur — la preuve que `worker_heartbeat_utilisateur` existe bien dans le type `Database` régénéré au JALON.

- [ ] **Étape 4 : Lancer la suite existante**

Run: `pnpm --filter @prospeo/collector test`
Expected: 379 tests passés (aucun test ne couvrait `battre()`, aucune régression attendue ni possible sur ce point précis).

- [ ] **Étape 5 : Commit**

```bash
git add apps/collector/src/cli.ts
git commit -m "feat(worker): le battement s'écrit par utilisateur, plus sur le singleton"
```

---

## Tâche 3 : Fabriquer un jeton d'installation GitHub App

**Files:**
- Create: `apps/collector/src/sources/github-app.ts`
- Create: `apps/collector/src/sources/github-app.test.ts`

**Interfaces:**
- Produit : `signerJwtApp(appId: string, clePrivee: string, maintenant?: Date): string`, `type ResultatJetonInstallation = { ok: true; token: string } | { ok: false; motif: 'revoquee' | 'echec'; message: string }`, `createGithubAppClient(options: { appId: string; clePrivee: string; fetch?: typeof fetch }): { creerJetonInstallation(installationId: string): Promise<ResultatJetonInstallation> }`.

> **Duplication délibérée.** `signerJwtApp` existe déjà dans `apps/relais-oauth/src/github.ts`, pour un usage différent (lire une installation pendant le callback OAuth). Ce fichier-ci fabrique un JETON D'ACCÈS D'INSTALLATION — une opération que le relais ne fait pas. Les deux services ne dépendent pas l'un de l'autre (R1 du spec de l'étape 3) ; dupliquer une fonction de signature de 15 lignes coûte moins qu'introduire une dépendance croisée pour si peu.

- [ ] **Étape 1 : Écrire le test qui échoue — signature du JWT**

```ts
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { createGithubAppClient, signerJwtApp } from './github-app.js';

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
```

- [ ] **Étape 2 : Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/collector test -- github-app`
Expected: échec — `./github-app.js` n'existe pas encore. (Rappel : cette commande lance TOUTE la suite malgré `--`, mais l'échec de collecte sur ce fichier est visible dans la sortie.)

- [ ] **Étape 3 : Écrire `signerJwtApp` et le squelette du client**

```ts
import { createSign } from 'node:crypto';

/**
 * L'authentification d'une GitHub App — un JWT signé par sa clé privée,
 * échangé contre un jeton d'accès sur une installation précise.
 *
 * Duplication délibérée de `apps/relais-oauth/src/github.ts` (voir le
 * commentaire d'en-tête de ce fichier) : aucune bibliothèque cliente, trois
 * champs, une signature.
 */

const BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** Neuf minutes : sous la limite des dix minutes que GitHub tolère pour un
 *  JWT d'App, avec une marge pour une horloge locale imprécise. */
const DUREE_JWT_S = 9 * 60;

function base64url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

export function signerJwtApp(appId: string, clePrivee: string, maintenant: Date = new Date()): string {
  const iat = Math.floor(maintenant.getTime() / 1000) - 60; // 60s de marge, horloge en avance
  const aSigner = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({ iat, exp: iat + DUREE_JWT_S, iss: appId })}`;
  const signature = createSign('RSA-SHA256').update(aSigner).sign(clePrivee, 'base64url');
  return `${aSigner}.${signature}`;
}
```

- [ ] **Étape 4 : Lancer le test, vérifier qu'il passe**

Run: `pnpm --filter @prospeo/collector test -- github-app`
Expected: les deux tests de `signerJwtApp` passent (la suite entière tourne ; regarder leur ligne).

- [ ] **Étape 5 : Écrire les tests de `creerJetonInstallation`**

```ts
describe('createGithubAppClient — creerJetonInstallation', () => {
  function fausseReponse(status: number, corps: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(corps),
      json: async () => corps,
    } as unknown as Response;
  }

  it('signe une requête Bearer POST et rend le jeton fabriqué', async () => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const fausseFetch = (async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      return fausseReponse(201, { token: 'ghs_xxx', expires_at: '2026-01-01T00:00:00Z' });
    }) as unknown as typeof fetch;

    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const resultat = await client.creerJetonInstallation('999');

    expect(resultat).toEqual({ ok: true, token: 'ghs_xxx' });
    expect(appels[0]?.url).toBe('https://api.github.com/app/installations/999/access_tokens');
    expect(appels[0]?.init?.method).toBe('POST');
    const entetes = appels[0]?.init?.headers as Record<string, string>;
    expect(entetes.Authorization).toMatch(/^Bearer /);
  });

  it('rend motif "revoquee" sur un 404 — installation supprimée ou suspendue', async () => {
    const fausseFetch = (async () => fausseReponse(404, { message: 'Not Found' })) as unknown as typeof fetch;
    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const resultat = await client.creerJetonInstallation('999');
    expect(resultat).toEqual({ ok: false, motif: 'revoquee', message: expect.stringContaining('404') });
  });

  it('rend motif "revoquee" sur un 401', async () => {
    const fausseFetch = (async () => fausseReponse(401, { message: 'Bad credentials' })) as unknown as typeof fetch;
    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const resultat = await client.creerJetonInstallation('999');
    expect(resultat.ok).toBe(false);
    expect((resultat as { motif: string }).motif).toBe('revoquee');
  });

  it('rend motif "echec" — jamais "revoquee" — sur une panne transitoire (5xx)', async () => {
    const fausseFetch = (async () => fausseReponse(503, { message: 'Service Unavailable' })) as unknown as typeof fetch;
    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const resultat = await client.creerJetonInstallation('999');
    expect(resultat).toEqual({ ok: false, motif: 'echec', message: expect.stringContaining('503') });
  });
});
```

- [ ] **Étape 6 : Lancer les tests, vérifier qu'ils échouent**

Run: `pnpm --filter @prospeo/collector test -- github-app`
Expected: échec — `createGithubAppClient` n'est pas exporté.

- [ ] **Étape 7 : Écrire `createGithubAppClient`**

```ts
export interface GithubAppOptions {
  appId: string;
  clePrivee: string;
  fetch?: typeof fetch;
}

export type ResultatJetonInstallation =
  | { ok: true; token: string }
  | { ok: false; motif: 'revoquee' | 'echec'; message: string };

export function createGithubAppClient(options: GithubAppOptions): {
  creerJetonInstallation(installationId: string): Promise<ResultatJetonInstallation>;
} {
  const appeler = options.fetch ?? fetch;
  return {
    async creerJetonInstallation(installationId) {
      const jwt = signerJwtApp(options.appId, options.clePrivee);
      const reponse = await appeler(`${BASE}/app/installations/${installationId}/access_tokens`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
        },
      });
      // 401/404 : GitHub refuse de reconnaître l'installation — supprimée ou
      // suspendue. À distinguer d'une panne transitoire (5xx, réseau) : la
      // première justifie de marquer la connexion `revoquee` en base, la
      // seconde non — un blip réseau ne doit jamais faire perdre une
      // connexion saine.
      if (reponse.status === 401 || reponse.status === 404) {
        const corps = await reponse.text().catch(() => '');
        return {
          ok: false,
          motif: 'revoquee',
          message: `GitHub : jeton d'installation ${installationId} — ${reponse.status} — ${corps}`,
        };
      }
      if (!reponse.ok) {
        const corps = await reponse.text().catch(() => '');
        return {
          ok: false,
          motif: 'echec',
          message: `GitHub : jeton d'installation ${installationId} — ${reponse.status} — ${corps}`,
        };
      }
      const corps = (await reponse.json()) as { token: string };
      return { ok: true, token: corps.token };
    },
  };
}
```

- [ ] **Étape 8 : Lancer les tests, vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/collector test -- github-app`
Expected: les six tests du fichier passent.

- [ ] **Étape 9 : Commit**

```bash
git add apps/collector/src/sources/github-app.ts apps/collector/src/sources/github-app.test.ts
git commit -m "feat(collector): fabrique un jeton d'installation GitHub App à la demande"
```

---

## Tâche 4 : `jetonInstallationGithub` — la résolution côté coffre

**Files:**
- Modify: `apps/collector/src/coffre.ts`
- Modify: `apps/collector/src/coffre.test.ts`

**Interfaces:**
- Consomme : `ResultatJetonInstallation`, `createGithubAppClient` (Tâche 3) — le type seulement, pour la forme du deps `creerJetonInstallation`. `EtatConnexion` (déjà dans `coffre.ts`).
- Produit : `interface CoffreGithubDeps { lireInstallation(proprietaire: Proprietaire): Promise<{ connexionId: string; etat: EtatConnexion; installationId: string | null } | null>; marquerEtat(connexionId: string, etat: EtatConnexion): Promise<void>; creerJetonInstallation(installationId: string): Promise<ResultatJetonInstallation>; }`, `jetonInstallationGithub(deps: CoffreGithubDeps, proprietaire: Proprietaire): Promise<{ jeton: string } | { jeton: null; etat: EtatConnexion | 'absente' }>`.

> **`CoffreGithubDeps` est un type séparé de `CoffreDeps`, pas une extension.** `jetonDe` (Vercel) a besoin de `lireSecret` et `cle` ; GitHub n'a ni l'un ni l'autre — il n'y a rien à déchiffrer. Réunir les deux dans une seule interface ferait porter à chaque fonction des champs qu'elle n'emploie jamais, ce que ce dépôt évite systématiquement (voir `FileDeps`, `ChaineDeps`, `PublishDeps`).

- [ ] **Étape 1 : Écrire les tests qui échouent**

Ajouter à `apps/collector/src/coffre.test.ts`, après le `describe('jetonDe', ...)` existant :

```ts
import { jetonDe, jetonInstallationGithub, type CoffreDeps, type CoffreGithubDeps } from './coffre.js';

describe('jetonInstallationGithub', () => {
  const PROPRIETAIRE = proprietaire('131ab48e-055a-4a15-af4b-79ed7a2e4465');

  function deps(surcharges: Partial<CoffreGithubDeps> = {}): CoffreGithubDeps {
    return {
      lireInstallation: async () => null,
      marquerEtat: async () => {},
      creerJetonInstallation: async () => ({ ok: true, token: 'jeton-installation' }),
      ...surcharges,
    };
  }

  it('rend absente quand aucune connexion n existe', async () => {
    const creerJetonInstallation = vi.fn();
    const r = await jetonInstallationGithub(deps({ creerJetonInstallation }), PROPRIETAIRE);

    expect(r).toEqual({ jeton: null, etat: 'absente' });
    expect(creerJetonInstallation).not.toHaveBeenCalled();
  });

  it('ne fabrique pas de jeton pour une connexion deja revoquee, et rend son etat tel quel', async () => {
    const creerJetonInstallation = vi.fn();
    const r = await jetonInstallationGithub(
      deps({
        lireInstallation: async () => ({ connexionId: 'cx-1', etat: 'revoquee', installationId: '999' }),
        creerJetonInstallation,
      }),
      PROPRIETAIRE,
    );

    expect(r).toEqual({ jeton: null, etat: 'revoquee' });
    expect(creerJetonInstallation).not.toHaveBeenCalled();
  });

  it('leve sur une connexion active sans identifiant d installation — etat incoherent', async () => {
    await expect(
      jetonInstallationGithub(
        deps({ lireInstallation: async () => ({ connexionId: 'cx-1', etat: 'active', installationId: null }) }),
        PROPRIETAIRE,
      ),
    ).rejects.toThrow(/incohérent/);
  });

  it('marque revoquee en base quand GitHub refuse de fabriquer un jeton, et rend l etat', async () => {
    const marquerEtat = vi.fn(async () => {});
    const r = await jetonInstallationGithub(
      deps({
        lireInstallation: async () => ({ connexionId: 'cx-1', etat: 'active', installationId: '999' }),
        creerJetonInstallation: async () => ({ ok: false, motif: 'revoquee', message: 'GitHub : 404' }),
        marquerEtat,
      }),
      PROPRIETAIRE,
    );

    expect(r).toEqual({ jeton: null, etat: 'revoquee' });
    expect(marquerEtat).toHaveBeenCalledWith('cx-1', 'revoquee');
    expect(marquerEtat).toHaveBeenCalledTimes(1);
  });

  it('leve sans marquer l etat sur un echec transitoire (reseau, 5xx)', async () => {
    const marquerEtat = vi.fn(async () => {});
    await expect(
      jetonInstallationGithub(
        deps({
          lireInstallation: async () => ({ connexionId: 'cx-1', etat: 'active', installationId: '999' }),
          creerJetonInstallation: async () => ({ ok: false, motif: 'echec', message: 'GitHub : 503' }),
          marquerEtat,
        }),
        PROPRIETAIRE,
      ),
    ).rejects.toThrow(/503/);
    expect(marquerEtat).not.toHaveBeenCalled();
  });

  it('rend le jeton d une connexion active dont GitHub accepte la fabrication', async () => {
    const r = await jetonInstallationGithub(
      deps({
        lireInstallation: async () => ({ connexionId: 'cx-1', etat: 'active', installationId: '999' }),
        creerJetonInstallation: async () => ({ ok: true, token: 'jeton-installation-frais' }),
      }),
      PROPRIETAIRE,
    );

    expect(r).toEqual({ jeton: 'jeton-installation-frais' });
  });
});
```

- [ ] **Étape 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `pnpm --filter @prospeo/collector test -- coffre`
Expected: échec — `jetonInstallationGithub`/`CoffreGithubDeps` ne sont pas exportés.

- [ ] **Étape 3 : Écrire `jetonInstallationGithub`**

Ajouter `import type { ResultatJetonInstallation } from './sources/github-app.js';`
à l'import déjà présent en tête d'`apps/collector/src/coffre.ts` (celui qui
importe `Enums` de `@prospeo/db`, `dechiffrer`, etc.). Puis ajouter, après
`jetonDe` :

```ts
/**
 * Ce que `jetonInstallationGithub` emploie — distinct de `CoffreDeps` :
 * GitHub n'a ni secret à déchiffrer ni clé maîtresse, voir le commentaire
 * d'en-tête de la tâche qui l'introduit.
 */
export interface CoffreGithubDeps {
  lireInstallation(
    proprietaire: Proprietaire,
  ): Promise<{ connexionId: string; etat: EtatConnexion; installationId: string | null } | null>;
  marquerEtat(connexionId: string, etat: EtatConnexion): Promise<void>;
  creerJetonInstallation(installationId: string): Promise<ResultatJetonInstallation>;
}

/**
 * Lit le jeton d'installation d'une connexion GitHub, ou dit pourquoi elle
 * n'en rend pas. Même forme que `jetonDe`, pour un mécanisme différent : rien
 * n'est déchiffré, un jeton neuf est fabriqué à chaque appel (il expire de
 * lui-même en une heure — rien à faire péricliter).
 *
 * **`revoquee` en base ne tente même pas de fabriquer un jeton** — GitHub
 * refuserait de toute façon, pour un aller-retour réseau en plus.
 *
 * **GitHub refusant l'installation (401/404) MARQUE la connexion avant de
 * rendre** — même discipline que `jetonDe` sur un secret indéchiffrable : ne
 * pas le faire laisserait l'écran annoncer un compte connecté qui ne l'est
 * plus. Un échec transitoire (réseau, 5xx) NE marque rien : il lève, pour que
 * l'appelant le voie comme l'échec ponctuel qu'il est.
 */
export async function jetonInstallationGithub(
  deps: CoffreGithubDeps,
  proprietaire: Proprietaire,
): Promise<{ jeton: string } | { jeton: null; etat: EtatConnexion | 'absente' }> {
  const connexion = await deps.lireInstallation(proprietaire);
  if (connexion === null) {
    return { jeton: null, etat: 'absente' };
  }
  if (connexion.etat !== 'active') {
    return { jeton: null, etat: connexion.etat };
  }
  if (connexion.installationId === null) {
    throw new Error("connexion GitHub active sans identifiant d'installation — état incohérent");
  }

  const resultat = await deps.creerJetonInstallation(connexion.installationId);
  if (!resultat.ok) {
    if (resultat.motif === 'revoquee') {
      await deps.marquerEtat(connexion.connexionId, 'revoquee');
      return { jeton: null, etat: 'revoquee' };
    }
    throw new Error(resultat.message);
  }
  return { jeton: resultat.token };
}
```

- [ ] **Étape 4 : Lancer les tests, vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/collector test -- coffre`
Expected: les six nouveaux tests passent, les cinq tests existants de `jetonDe` passent toujours.

- [ ] **Étape 5 : Commit**

```bash
git add apps/collector/src/coffre.ts apps/collector/src/coffre.test.ts
git commit -m "feat(coffre): jetonInstallationGithub, sœur de jetonDe pour GitHub App"
```

---

## Tâche 5 : Le vrai accès Supabase derrière le coffre

**Files:**
- Create: `apps/collector/src/coffre-supabase.ts`
- Create: `apps/collector/src/coffre-supabase.test.ts`

**Interfaces:**
- Consomme : `CoffreDeps`, `CoffreGithubDeps` (`coffre.ts`), `PlateformeConnectee`, `EtatConnexion`.
- Produit : `creerCoffreDeps(client: SupabaseClient<Database>, cle: CleMaitresse): CoffreDeps`, `creerCoffreGithubDeps(client: SupabaseClient<Database>, githubApp: { creerJetonInstallation(installationId: string): Promise<ResultatJetonInstallation> }): CoffreGithubDeps`, `lireCompteLibelle(client: SupabaseClient<Database>, proprietaire: Proprietaire, plateforme: PlateformeConnectee): Promise<string | null>`.

> **Le format `bytea` a été vérifié contre la vraie base**, pas supposé : Postgres/PostgREST le rend en `\x` suivi d'hexadécimal, exactement la forme que `versBytea` (`apps/relais-oauth/src/connexions.ts`) écrit — `depuisBytea` en est l'inverse exact.

- [ ] **Étape 1 : Écrire les tests qui échouent**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { chiffrer, lireCleMaitresse } from '@prospeo/coffre';
import { proprietaire } from './proprietaire.js';
import { creerCoffreDeps, creerCoffreGithubDeps, lireCompteLibelle } from './coffre-supabase.js';

const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));
const PROPRIETAIRE = proprietaire('131ab48e-055a-4a15-af4b-79ed7a2e4465');

/** Un `bytea` Postgres tel que PostgREST le rend : `\x` suivi d'hexadécimal. */
function versBytea(buffer: Buffer): string {
  return `\\x${buffer.toString('hex')}`;
}

/**
 * Client simulé minimal : une lecture (`select().eq()...maybeSingle()`) et,
 * pour `marquerEtat`, une écriture (`update().eq()`). Chaque test configure
 * `ligne` et lit `appels` pour vérifier ce qui a été construit.
 */
function fakeClient(ligne: Record<string, unknown> | null) {
  const appels: { methode: string; table: string; valeurs?: unknown }[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { async maybeSingle() { return { data: ligne, error: null }; } };
                },
                async maybeSingle() { return { data: ligne, error: null }; },
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

describe('creerCoffreDeps', () => {
  it('lireConnexion rend id et etat depuis connexion_plateforme', async () => {
    const { client } = fakeClient({ id: 'cx-1', etat: 'active' });
    const deps = creerCoffreDeps(client, CLE);
    const r = await deps.lireConnexion(PROPRIETAIRE, 'vercel');
    expect(r).toEqual({ id: 'cx-1', etat: 'active' });
  });

  it('lireConnexion rend null quand aucune ligne n existe', async () => {
    const { client } = fakeClient(null);
    const deps = creerCoffreDeps(client, CLE);
    expect(await deps.lireConnexion(PROPRIETAIRE, 'vercel')).toBeNull();
  });

  it('lireSecret convertit le bytea hexadecimal en Buffer, pour les trois champs', async () => {
    const scelle = chiffrer('jeton-vercel-secret', CLE);
    const { client } = fakeClient({
      chiffre: versBytea(scelle.chiffre),
      vecteur: versBytea(scelle.vecteur),
      etiquette: versBytea(scelle.etiquette),
      cle_id: scelle.cleId,
    });
    const deps = creerCoffreDeps(client, CLE);
    const r = await deps.lireSecret('cx-1');
    expect(r).toEqual(scelle);
  });

  it('marquerEtat ecrit etat et etat_constate_at sur connexion_plateforme', async () => {
    const { client, appels } = fakeClient(null);
    const deps = creerCoffreDeps(client, CLE);
    await deps.marquerEtat('cx-1', 'indechiffrable');

    const maj = appels.find((a) => a.methode === 'update' && a.table === 'connexion_plateforme');
    expect(maj).toBeDefined();
    expect((maj?.valeurs as Record<string, unknown>).etat).toBe('indechiffrable');
  });
});

describe('creerCoffreGithubDeps', () => {
  it('lireInstallation rend connexionId, etat et installationId (reference)', async () => {
    const { client } = fakeClient({ id: 'cx-2', etat: 'active', reference: '999' });
    const deps = creerCoffreGithubDeps(client, { creerJetonInstallation: vi.fn() });
    const r = await deps.lireInstallation(PROPRIETAIRE);
    expect(r).toEqual({ connexionId: 'cx-2', etat: 'active', installationId: '999' });
  });

  it('delegue creerJetonInstallation au client GitHub App fourni', async () => {
    const creerJetonInstallation = vi.fn(async () => ({ ok: true as const, token: 'ghs_xxx' }));
    const { client } = fakeClient(null);
    const deps = creerCoffreGithubDeps(client, { creerJetonInstallation });
    await deps.creerJetonInstallation('999');
    expect(creerJetonInstallation).toHaveBeenCalledWith('999');
  });
});

describe('lireCompteLibelle', () => {
  it('rend compte_libelle pour la plateforme demandee', async () => {
    const { client } = fakeClient({ compte_libelle: 'mon-org' });
    expect(await lireCompteLibelle(client, PROPRIETAIRE, 'github')).toBe('mon-org');
  });

  it('rend null quand aucune connexion n existe', async () => {
    const { client } = fakeClient(null);
    expect(await lireCompteLibelle(client, PROPRIETAIRE, 'github')).toBeNull();
  });
});
```

- [ ] **Étape 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `pnpm --filter @prospeo/collector test -- coffre-supabase`
Expected: échec — `./coffre-supabase.js` n'existe pas.

- [ ] **Étape 3 : Écrire `coffre-supabase.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { CleMaitresse } from '@prospeo/coffre';
import type { CoffreDeps, CoffreGithubDeps, PlateformeConnectee } from './coffre.js';
import type { Proprietaire } from './proprietaire.js';
import type { ResultatJetonInstallation } from './sources/github-app.js';

type Client = SupabaseClient<Database>;

/**
 * Le vrai accès Supabase derrière `CoffreDeps`/`CoffreGithubDeps`.
 *
 * `coffre.ts` définit CE QUE `jetonDe`/`jetonInstallationGithub` emploient ;
 * ce fichier construit les implémentations réelles, sur le modèle
 * d'`apps/relais-oauth/src/connexions.ts` qui écrit ce que ce fichier lit.
 */

/** L'inverse exact de `versBytea` (`apps/relais-oauth/src/connexions.ts`) —
 *  vérifié contre la vraie base : PostgREST rend un `bytea` en `\x` suivi
 *  d'hexadécimal. */
function depuisBytea(valeur: string): Buffer {
  return Buffer.from(valeur.replace(/^\\x/, ''), 'hex');
}

/** Pour `jetonDe` (Vercel) : lecture de l'état, lecture et conversion du
 *  secret chiffré, marquage d'état. */
export function creerCoffreDeps(client: Client, cle: CleMaitresse): CoffreDeps {
  return {
    async lireConnexion(proprietaire, plateforme) {
      const { data, error } = await client
        .from('connexion_plateforme')
        .select('id,etat')
        .eq('owner_id', proprietaire)
        .eq('plateforme', plateforme)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data === null ? null : { id: data.id, etat: data.etat };
    },
    async lireSecret(connexionId) {
      const { data, error } = await client
        .from('connexion_secret')
        .select('chiffre,vecteur,etiquette,cle_id')
        .eq('connexion_id', connexionId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data === null) return null;
      return {
        chiffre: depuisBytea(data.chiffre),
        vecteur: depuisBytea(data.vecteur),
        etiquette: depuisBytea(data.etiquette),
        cleId: data.cle_id,
      };
    },
    async marquerEtat(connexionId, etat) {
      const { error } = await client
        .from('connexion_plateforme')
        .update({ etat, etat_constate_at: new Date().toISOString() })
        .eq('id', connexionId);
      if (error) throw new Error(error.message);
    },
    cle,
  };
}

/** Pour `jetonInstallationGithub` : lecture de l'installation (`reference`),
 *  marquage d'état, fabrication du jeton déléguée au client GitHub App. */
export function creerCoffreGithubDeps(
  client: Client,
  githubApp: { creerJetonInstallation(installationId: string): Promise<ResultatJetonInstallation> },
): CoffreGithubDeps {
  return {
    async lireInstallation(proprietaire) {
      const { data, error } = await client
        .from('connexion_plateforme')
        .select('id,etat,reference')
        .eq('owner_id', proprietaire)
        .eq('plateforme', 'github')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data === null
        ? null
        : { connexionId: data.id, etat: data.etat, installationId: data.reference };
    },
    async marquerEtat(connexionId, etat) {
      const { error } = await client
        .from('connexion_plateforme')
        .update({ etat, etat_constate_at: new Date().toISOString() })
        .eq('id', connexionId);
      if (error) throw new Error(error.message);
    },
    creerJetonInstallation: githubApp.creerJetonInstallation,
  };
}

/** Le compte affiché — l'organisation GitHub ou l'équipe Vercel de CET
 *  utilisateur. Une lecture à part de `lireConnexion`/`lireInstallation` :
 *  ni `jetonDe` ni `jetonInstallationGithub` n'en ont besoin, seul
 *  l'appelant de `chaineDeps` (Tâche 6) en a l'usage. */
export async function lireCompteLibelle(
  client: Client,
  proprietaire: Proprietaire,
  plateforme: PlateformeConnectee,
): Promise<string | null> {
  const { data, error } = await client
    .from('connexion_plateforme')
    .select('compte_libelle')
    .eq('owner_id', proprietaire)
    .eq('plateforme', plateforme)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.compte_libelle ?? null;
}
```

- [ ] **Étape 4 : Lancer les tests, vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/collector test -- coffre-supabase`
Expected: les huit tests passent.

- [ ] **Étape 5 : Commit**

```bash
git add apps/collector/src/coffre-supabase.ts apps/collector/src/coffre-supabase.test.ts
git commit -m "feat(collector): le vrai accès Supabase derrière CoffreDeps/CoffreGithubDeps"
```

---

## Tâche 6 : `chaineDeps` résout jeton et compte par utilisateur

**Files:**
- Modify: `apps/collector/src/config.ts`
- Modify: `apps/collector/src/config.test.ts`
- Modify: `apps/collector/src/chaine.ts:624-714` (`publier`/`deployer`)
- Modify: `apps/collector/src/chaine.test.ts`

**Interfaces:**
- Consomme : `creerCoffreDeps`, `creerCoffreGithubDeps`, `lireCompteLibelle` (Tâche 5), `jetonDe` (existant), `jetonInstallationGithub` (Tâche 4), `createGithubAppClient` (Tâche 3).
- Produit : `loadGithubAppConfig(env): { appId: string; clePrivee: string }`, `loadGithubTemplateConfig(env): { githubTemplateRepo: string | undefined }`.

> **`loadPublishConfig`/`loadDeployConfig` ne changent PAS.** Elles servent encore les commandes batch `publish`/`deploy` de `cli.ts` (lignes 1619 et 1668), qui restent sur les jetons globaux — hors périmètre de ce chantier. `chaineDeps` cesse simplement de les appeler, et gagne son propre loader minimal pour le seul réglage qu'il partage encore avec elles : `PROSPEO_GITHUB_TEMPLATE_REPO`.

- [ ] **Étape 1 : Écrire les tests des deux nouveaux loaders — d'abord l'échec**

Ajouter à `apps/collector/src/config.test.ts` :

```ts
import { loadGithubAppConfig, loadGithubTemplateConfig } from './config.js';

describe('loadGithubAppConfig', () => {
  it('exige PROSPEO_GITHUB_APP_ID et PROSPEO_GITHUB_APP_PRIVATE_KEY', () => {
    expect(() => loadGithubAppConfig({})).toThrow(/PROSPEO_GITHUB_APP_ID/);
  });

  it('restaure les sauts de ligne littéraux \\n du PEM', () => {
    const config = loadGithubAppConfig({
      PROSPEO_GITHUB_APP_ID: '123456',
      PROSPEO_GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\\nABC\\n-----END RSA PRIVATE KEY-----',
    });
    expect(config.appId).toBe('123456');
    expect(config.clePrivee).toBe('-----BEGIN RSA PRIVATE KEY-----\nABC\n-----END RSA PRIVATE KEY-----');
  });
});

describe('loadGithubTemplateConfig', () => {
  it('rend undefined quand PROSPEO_GITHUB_TEMPLATE_REPO est absent', () => {
    expect(loadGithubTemplateConfig({}).githubTemplateRepo).toBeUndefined();
  });

  it('rend la valeur quand elle est presente', () => {
    expect(loadGithubTemplateConfig({ PROSPEO_GITHUB_TEMPLATE_REPO: 'mon-modele' }).githubTemplateRepo).toBe(
      'mon-modele',
    );
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/collector test -- config`
Expected: échec — les deux fonctions ne sont pas exportées.

- [ ] **Étape 3 : Écrire les deux loaders**

Ajouter à `apps/collector/src/config.ts`, après `loadCoffreConfig` :

```ts
export interface GithubAppConfig {
  appId: string;
  clePrivee: string;
}

/**
 * Les secrets de l'App GitHub, dupliqués depuis l'environnement du relais
 * (`apps/relais-oauth`) : le worker en a besoin pour fabriquer ses propres
 * jetons d'installation (chantier n°8, étape suivant le relais OAuth).
 */
export function loadGithubAppConfig(env: Record<string, string | undefined>): GithubAppConfig {
  const v = exiger(env, ['PROSPEO_GITHUB_APP_ID', 'PROSPEO_GITHUB_APP_PRIVATE_KEY'], 'worker');
  return {
    appId: v['PROSPEO_GITHUB_APP_ID'] as string,
    // Même restauration que `loadRelaisConfig` (`apps/relais-oauth/src/
    // config.ts`) : un PEM porte de vrais sauts de ligne, une variable
    // d'environnement les perd souvent en route.
    clePrivee: (v['PROSPEO_GITHUB_APP_PRIVATE_KEY'] as string).replace(/\\n/g, '\n'),
  };
}

export interface GithubTemplateConfig {
  githubTemplateRepo: string | undefined;
}

/**
 * Le seul réglage que `chaineDeps` partage encore avec `loadPublishConfig` :
 * le dépôt modèle de repli. Un loader à part, et non `loadPublishConfig`
 * lui-même, parce que celui-ci EXIGE `GITHUB_TOKEN`/`PROSPEO_GITHUB_ORG` —
 * des secrets globaux que `chaineDeps` ne lit plus (Tâche 6).
 */
export function loadGithubTemplateConfig(env: Record<string, string | undefined>): GithubTemplateConfig {
  return { githubTemplateRepo: lire(env, 'PROSPEO_GITHUB_TEMPLATE_REPO') };
}
```

- [ ] **Étape 4 : Lancer, vérifier que les nouveaux tests passent**

Run: `pnpm --filter @prospeo/collector test -- config`
Expected: tous les tests de `config.test.ts` passent, y compris les quatre nouveaux.

- [ ] **Étape 5 : Étendre `clientSimule` pour servir `connexion_plateforme`**

Dans `apps/collector/src/chaine.test.ts`, modifier la signature et le corps de `clientSimule` (lignes ~228-257) :

```ts
function clientSimule(
  prospects: unknown[],
  sites: unknown[] = [],
  connexions: Record<string, unknown> | null = null,
): { client: SupabaseClient<Database>; appels: AppelRequete[] } {
  const appels: AppelRequete[] = [];
  const table = (nom: string, lignes: unknown[]): Record<string, unknown> => {
    const appel: AppelRequete = { table: nom, filtres: [] };
    appels.push(appel);
    const b: Record<string, unknown> = {
      select: (colonnes: string) => {
        appel.select = colonnes;
        return b;
      },
      order: () => b,
      eq: (colonne: string, valeur: string) => {
        appel.filtres.push([colonne, valeur]);
        return b;
      },
      limit: () => Promise.resolve({ data: lignes, error: null }),
      range: () => Promise.resolve({ data: lignes, error: null }),
      upsert: () => Promise.resolve({ error: null }),
      // `connexion_plateforme` se lit par `.maybeSingle()`, jamais par
      // `.limit()`/`.range()` — les autres tables de ce fake n'en ont pas
      // l'usage.
      maybeSingle: () => Promise.resolve({ data: connexions, error: null }),
    };
    return b;
  };
  const client = {
    // `connexion_plateforme` ne lit jamais par `.limit()`/`.range()` (voir
    // `maybeSingle` ci-dessus, qui ferme sur `connexions` directement) : la
    // route vers `sites` ici est sans conséquence pour elle, seulement
    // utilisée par les tables qui appellent réellement l'un des deux.
    from: (nom: string) => table(nom, nom === 'prospect' ? prospects : sites),
  } as unknown as SupabaseClient<Database>;
  return { client, appels };
}
```

- [ ] **Étape 6 : Écrire les tests d'échec de résolution — d'abord le rouge**

Ajouter à `apps/collector/src/chaine.test.ts` :

```ts
describe('chaineDeps.publier — résolution du jeton GitHub', () => {
  const cleCoffre = process.env['PROSPEO_COFFRE_CLE'];
  const appId = process.env['PROSPEO_GITHUB_APP_ID'];
  const clePrivee = process.env['PROSPEO_GITHUB_APP_PRIVATE_KEY'];
  beforeEach(() => {
    process.env['PROSPEO_COFFRE_CLE'] = 'v1:' + Buffer.alloc(32, 7).toString('base64');
    process.env['PROSPEO_GITHUB_APP_ID'] = '123456';
    process.env['PROSPEO_GITHUB_APP_PRIVATE_KEY'] = 'cle-de-test-non-pem';
  });
  afterEach(() => {
    if (cleCoffre === undefined) delete process.env['PROSPEO_COFFRE_CLE'];
    else process.env['PROSPEO_COFFRE_CLE'] = cleCoffre;
    if (appId === undefined) delete process.env['PROSPEO_GITHUB_APP_ID'];
    else process.env['PROSPEO_GITHUB_APP_ID'] = appId;
    if (clePrivee === undefined) delete process.env['PROSPEO_GITHUB_APP_PRIVATE_KEY'];
    else process.env['PROSPEO_GITHUB_APP_PRIVATE_KEY'] = clePrivee;
  });

  it('leve un message clair quand la connexion GitHub est absente', async () => {
    // `connexions: null` : aucune ligne — `lireInstallation` rend `null`
    // avant tout appel réseau, la fausse clé PEM ci-dessus n'est donc jamais
    // exercée.
    const { client } = clientSimule([], [{ prospect_id: 'p-1', content: { titre: 'x' }, content_rejected_at: null }], null);
    await expect(chaineDeps(client, PROPRIETAIRE).publier('p-1')).rejects.toThrow(/GitHub/);
  });

  it('leve un message clair quand la connexion GitHub est revoquee', async () => {
    const { client } = clientSimule(
      [],
      [{ prospect_id: 'p-1', content: { titre: 'x' }, content_rejected_at: null }],
      { id: 'cx-1', etat: 'revoquee', reference: '999' },
    );
    await expect(chaineDeps(client, PROPRIETAIRE).publier('p-1')).rejects.toThrow(/révoqu/);
  });
});

describe('chaineDeps.deployer — résolution du jeton Vercel', () => {
  const cleCoffre = process.env['PROSPEO_COFFRE_CLE'];
  beforeEach(() => {
    process.env['PROSPEO_COFFRE_CLE'] = 'v1:' + Buffer.alloc(32, 7).toString('base64');
  });
  afterEach(() => {
    if (cleCoffre === undefined) delete process.env['PROSPEO_COFFRE_CLE'];
    else process.env['PROSPEO_COFFRE_CLE'] = cleCoffre;
  });

  it('leve un message clair quand la connexion Vercel est absente', async () => {
    const { client } = clientSimule(
      [],
      [{ prospect_id: 'p-1', repo_full_name: 'org/depot-p1', vercel_project_id: null, deployment_url: null, unpublished_at: null }],
      null,
    );
    await expect(chaineDeps(client, PROPRIETAIRE).deployer('p-1')).rejects.toThrow(/Vercel/);
  });
});
```

- [ ] **Étape 7 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/collector test -- chaine`
Expected: échec — `publier`/`deployer` lèvent encore sur `GITHUB_TOKEN`/`VERCEL_TOKEN` absents (leur ancien comportement), pas sur les messages attendus ci-dessus.

- [ ] **Étape 8 : Rebrancher `publier` et `deployer`**

Dans `apps/collector/src/chaine.ts`, remplacer les imports en tête de fichier :

```ts
import {
  loadCoffreConfig,
  loadGenerateConfig,
  loadGithubAppConfig,
  loadGithubTemplateConfig,
  loadPitchConfig,
} from './config.js';
import { createGithubAppClient } from './sources/github-app.js';
import { creerCoffreDeps, creerCoffreGithubDeps, lireCompteLibelle } from './coffre-supabase.js';
import { jetonDe, jetonInstallationGithub } from './coffre.js';
```

`loadDeployConfig`/`loadPublishConfig` disparaissent de cet import — elles ne servent plus qu'à `cli.ts`, qui les importe déjà directement pour ses commandes batch. `loadCoffreConfig` est **ajoutée** : `chaine.ts` ne l'importait pas avant cette tâche (elle vivait dans `config.ts`, sans appelant — voir §1 du spec de cette étape).

Puis remplacer le corps de `publier` (lignes 624-669) :

```ts
async publier(prospectId) {
  const rows = await fetchSiteRows(client, proprietaire);
  const ligne = rows[prospectId];
  if (ligne === undefined || ligne.content == null) {
    throw new Error('aucun contenu à publier — la rédaction n’a rien écrit');
  }

  const decision = decidePublication(ligne);
  if (!decision.faire) {
    throw new Error('publication refusée : le site a été retiré (unpublished_at renseigné)');
  }

  // Résolu PAR UTILISATEUR (chantier n°8, étape suivant le relais OAuth) :
  // plus de GITHUB_TOKEN/PROSPEO_GITHUB_ORG globaux. `installationId` est
  // fabriqué à la demande, jamais stocké — voir `jetonInstallationGithub`.
  const githubAppConfig = loadGithubAppConfig(process.env);
  const coffreGithub = creerCoffreGithubDeps(
    client,
    createGithubAppClient({ appId: githubAppConfig.appId, clePrivee: githubAppConfig.clePrivee }),
  );
  const jetonGithub = await jetonInstallationGithub(coffreGithub, proprietaire);
  if (jetonGithub.jeton === null) {
    throw new Error(`connexion GitHub ${jetonGithub.etat} — reconnecte ton compte GitHub`);
  }
  const githubOrg = await lireCompteLibelle(client, proprietaire, 'github');
  if (githubOrg === null) {
    throw new Error('connexion GitHub active sans compte associé — état incohérent');
  }

  const templateConfig = loadGithubTemplateConfig(process.env);
  const gabaritActif = await lireGabaritActif(client);
  const deps = construireDepsPublication(client, {
    github: createGithubClient({ token: jetonGithub.jeton, org: githubOrg }),
    templateRepoDefaut: gabaritDefautPourPublication(gabaritActif, templateConfig.githubTemplateRepo),
    rows,
  });

  const report = await runPublish(
    [
      {
        prospectId,
        contenu: ligne.content as unknown as ContenuPublie,
        rejeteeLe:
          ligne.content_rejected_at === null ? null : new Date(ligne.content_rejected_at),
      },
    ],
    deps,
  );
  // `runPublish` a déjà écrit la cause dans `deployment_event` : l'écran
  // l'affichera depuis là, avec plus de détail que ce message.
  if (report.failed > 0) throw new Error('la création du dépôt a échoué');
  if (report.refused > 0) throw new Error('publication refusée — voir le journal du site');
},
```

Et le corps de `deployer` (lignes 671-714) : la résolution du jeton se place
**après** la lecture de la ligne et `decideDeploiement`, comme dans `publier`
ci-dessus — et pour la même raison : un site RETIRÉ doit lever « publication
refusée » quel que soit l'état de la connexion, jamais un message de jeton
moins spécifique quand les deux conditions se trouvent réunies.

```ts
async deployer(prospectId) {
  const rows = await fetchSiteRows(client, proprietaire);
  const ligne = rows[prospectId];
  if (ligne === undefined || ligne.repo_full_name === null) {
    throw new Error('aucun dépôt à déployer');
  }

  const decision = decideDeploiement(ligne);
  if (!decision.faire) {
    if (decision.motif === 'retire') {
      throw new Error('déploiement refusé : le site a été retiré (unpublished_at renseigné)');
    }
    return;
  }

  // Résolu PAR UTILISATEUR, comme `publier` ci-dessus : plus de
  // VERCEL_TOKEN/PROSPEO_VERCEL_TEAM globaux.
  const coffreConfig = loadCoffreConfig(process.env);
  const coffreDeps = creerCoffreDeps(client, coffreConfig.cle);
  const jetonVercel = await jetonDe(coffreDeps, proprietaire, 'vercel');
  if (jetonVercel.jeton === null) {
    throw new Error(`connexion Vercel ${jetonVercel.etat} — reconnecte ton compte Vercel`);
  }
  const compteVercel = await lireCompteLibelle(client, proprietaire, 'vercel');
  if (compteVercel === null) {
    throw new Error('connexion Vercel active sans compte associé — état incohérent');
  }

  const vercel = createVercelClient({
    token: jetonVercel.jeton,
    // Écrit par `ecrireConnexionVercel` (relais-oauth) comme `'compte
    // personnel'` littéral quand il n'y a pas d'équipe : ce n'est pas un
    // identifiant d'équipe Vercel valide, donc jamais transmis tel quel.
    teamId: compteVercel === 'compte personnel' ? undefined : compteVercel,
  });

  const report = await runDeploy(
    [
      {
        prospectId,
        repoFullName: ligne.repo_full_name,
        vercelProjectId: ligne.vercel_project_id,
      },
    ],
    construireDepsDeploiement(client, {
      vercel,
      attendreUrl: (projectId) => attendreUrl(vercel, projectId),
    }),
  );
  if (report.failed > 0) throw new Error('le déploiement a échoué');
  // `pending` n'est PAS une erreur : le build tourne chez Vercel et un
  // rejeu récupérera l'URL. C'est le comportement documenté de `runDeploy`
  // depuis le chantier n°4, et la chaîne continue vers `pitch` — le mail
  // ne partira de toute façon qu'après relecture humaine.
},
```

`loadCoffreConfig` est celle ajoutée à l'import ci-dessus, à l'étape 8. Le
reste du corps (l'appel à `runDeploy`, le commentaire sur `pending`) est
recopié tel quel depuis le code actuel — seul l'ORDRE des étapes et la
provenance du jeton/`teamId` changent.

- [ ] **Étape 9 : Lancer, vérifier que tout passe**

Run: `pnpm --filter @prospeo/collector test -- chaine`
Expected: les trois nouveaux tests passent, les tests existants de `chaineDeps.generer`, `traiterProspect`, `decide*` et `cloisonnement des lectures` passent toujours.

- [ ] **Étape 10 : Suite complète et typecheck**

Run: `pnpm --filter @prospeo/collector test && pnpm --filter @prospeo/collector typecheck`
Expected: tous les tests passent (379 + les nouveaux de ce plan), 0 erreur de type.

- [ ] **Étape 11 : Commit**

```bash
git add apps/collector/src/config.ts apps/collector/src/config.test.ts apps/collector/src/chaine.ts apps/collector/src/chaine.test.ts
git commit -m "feat(chaine): publier/deployer resolvent jeton et compte par utilisateur"
```

---

## Tâche 7 : Le superviseur

**Files:**
- Create: `apps/collector/src/superviseur.ts`
- Create: `apps/collector/src/superviseur.test.ts`
- Modify: `apps/collector/src/cli.ts`

**Interfaces:**
- Consomme : `worker_heartbeat_utilisateur` (Tâche 1, appliquée), le pattern `child_process.spawn` (Node, aucune dépendance nouvelle).
- Produit : `interface SuperviseurDeps { decouvrirEligibles(): Promise<Set<string>>; suivis(): Set<string>; demarrer(ownerId: string): void; arreterProprement(ownerId: string): void; tuerSansGrace(ownerId: string): void; dernierBattement(ownerId: string): Promise<Date | null>; maintenant(): Date; }`, `balayer(deps: SuperviseurDeps): Promise<void>`, `decouvrirEligiblesReel(client: SupabaseClient<Database>): Promise<Set<string>>`, `creerSuiviBackoff(): SuiviBackoff`.

> **La décision est pure, l'exécution ne l'est pas.** `balayer` ne touche jamais un vrai process ni une vraie horloge : tout lui est injecté. `demarrerProcessus`/le vrai `child_process.spawn`/les `setInterval` vivent dans `cli.ts`, au même titre que le reste de l'assemblage réel du `case 'worker'` — non testés unitairement, comme lui.

- [ ] **Étape 1 : Écrire les tests de `balayer` — d'abord le rouge**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { balayer, creerSuiviBackoff, decouvrirEligiblesReel, type SuperviseurDeps } from './superviseur.js';

function deps(surcharges: Partial<SuperviseurDeps> = {}): SuperviseurDeps {
  return {
    decouvrirEligibles: async () => new Set(),
    suivis: () => new Set(),
    demarrer: () => {},
    arreterProprement: () => {},
    tuerSansGrace: () => {},
    dernierBattement: async () => null,
    maintenant: () => new Date('2026-09-05T10:00:00.000Z'),
    ...surcharges,
  };
}

describe('balayer', () => {
  it('demarre un utilisateur eligible non encore suivi', async () => {
    const demarrer = vi.fn();
    await balayer(deps({ decouvrirEligibles: async () => new Set(['u-1']), demarrer }));
    expect(demarrer).toHaveBeenCalledWith('u-1');
  });

  it('ne redemarre pas un utilisateur deja suivi', async () => {
    const demarrer = vi.fn();
    await balayer(
      deps({ decouvrirEligibles: async () => new Set(['u-1']), suivis: () => new Set(['u-1']), demarrer }),
    );
    expect(demarrer).not.toHaveBeenCalled();
  });

  it('arrete proprement un utilisateur suivi devenu inelligible', async () => {
    const arreterProprement = vi.fn();
    await balayer(
      deps({
        decouvrirEligibles: async () => new Set(),
        suivis: () => new Set(['u-1']),
        arreterProprement,
      }),
    );
    expect(arreterProprement).toHaveBeenCalledWith('u-1');
  });

  it('tue sans grace un utilisateur suivi, eligible, dont le battement depasse 90s', async () => {
    const tuerSansGrace = vi.fn();
    await balayer(
      deps({
        decouvrirEligibles: async () => new Set(['u-1']),
        suivis: () => new Set(['u-1']),
        dernierBattement: async () => new Date('2026-09-05T09:58:00.000Z'), // 120s plus tot
        tuerSansGrace,
      }),
    );
    expect(tuerSansGrace).toHaveBeenCalledWith('u-1');
  });

  it('ne tue pas un utilisateur suivi au battement frais', async () => {
    const tuerSansGrace = vi.fn();
    await balayer(
      deps({
        decouvrirEligibles: async () => new Set(['u-1']),
        suivis: () => new Set(['u-1']),
        dernierBattement: async () => new Date('2026-09-05T09:59:30.000Z'), // 30s plus tot
        tuerSansGrace,
      }),
    );
    expect(tuerSansGrace).not.toHaveBeenCalled();
  });

  it('ne tue jamais un utilisateur dont le battement est null — jamais demarre n est pas perime', async () => {
    // LE DEFAUT QUE CE TEST FERME. Juste apres `demarrer()`, un utilisateur
    // est suivi mais n a pas encore ecrit son premier battement : `null` et
    // « perime » sont deux absences de nature differente, et confondre les
    // deux tuerait en boucle un worker sain qui vient a peine de partir.
    const tuerSansGrace = vi.fn();
    await balayer(
      deps({
        decouvrirEligibles: async () => new Set(['u-1']),
        suivis: () => new Set(['u-1']),
        dernierBattement: async () => null,
        tuerSansGrace,
      }),
    );
    expect(tuerSansGrace).not.toHaveBeenCalled();
  });
});

describe('creerSuiviBackoff', () => {
  it('rend 5s au premier redemarrage', () => {
    const suivi = creerSuiviBackoff();
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(5_000);
  });

  it('augmente le delai a chaque sortie rapprochee, jusqu au plafond de 60s', () => {
    const suivi = creerSuiviBackoff();
    const debut = new Date('2026-09-05T10:00:00.000Z');
    suivi.enregistrerDemarrage('u-1', debut);
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 1_000)); // crash immediat
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(10_000);

    suivi.enregistrerDemarrage('u-1', new Date(debut.getTime() + 11_000));
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 12_000));
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(20_000);

    suivi.enregistrerDemarrage('u-1', new Date(debut.getTime() + 32_000));
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 33_000));
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(60_000);

    suivi.enregistrerDemarrage('u-1', new Date(debut.getTime() + 93_000));
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 94_000));
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(60_000); // plafonne, ne depasse pas
  });

  it('reinitialise le compteur apres 60s de fonctionnement sain', () => {
    const suivi = creerSuiviBackoff();
    const debut = new Date('2026-09-05T10:00:00.000Z');
    suivi.enregistrerDemarrage('u-1', debut);
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 1_000)); // crash
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(10_000);

    suivi.enregistrerDemarrage('u-1', new Date(debut.getTime() + 11_000));
    suivi.enregistrerSortie('u-1', new Date(debut.getTime() + 11_000 + 61_000)); // 61s sain
    expect(suivi.delaiRedemarrageMs('u-1')).toBe(5_000); // repart a zero
  });
});

describe('decouvrirEligiblesReel', () => {
  function clientAvecConnexions(lignes: { owner_id: string; plateforme: string }[]): SupabaseClient<Database> {
    const b = { select: () => b, eq: () => b, in: () => Promise.resolve({ data: lignes, error: null }) };
    return { from: () => b } as unknown as SupabaseClient<Database>;
  }

  it('ne retient que les proprietaires avec github ET vercel actifs', async () => {
    const client = clientAvecConnexions([
      { owner_id: 'u-1', plateforme: 'github' },
      { owner_id: 'u-1', plateforme: 'vercel' },
      { owner_id: 'u-2', plateforme: 'github' }, // vercel manquant
    ]);
    expect(await decouvrirEligiblesReel(client)).toEqual(new Set(['u-1']));
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/collector test -- superviseur`
Expected: échec — `./superviseur.js` n'existe pas.

- [ ] **Étape 3 : Écrire `superviseur.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';

/**
 * La logique de décision d'un balayage du superviseur — PURE, injectée,
 * jamais un vrai process ni une vraie horloge ici. `cli.ts` assemble
 * l'exécution réelle (voir la Tâche 7 du plan qui introduit ce fichier).
 */
export interface SuperviseurDeps {
  /** Les owner_id dont GitHub ET Vercel sont actifs, à cet instant. */
  decouvrirEligibles(): Promise<Set<string>>;
  /** Les owner_id actuellement suivis (un process démarré, pas encore mort). */
  suivis(): Set<string>;
  /** Démarre un process pour cet utilisateur. Ne bloque pas. */
  demarrer(ownerId: string): void;
  /** Demande l'arrêt propre (SIGTERM) du process de cet utilisateur. */
  arreterProprement(ownerId: string): void;
  /** Tue sans grâce (SIGKILL) — le filet de sécurité sur un battement périmé. */
  tuerSansGrace(ownerId: string): void;
  /** Le dernier battement connu, ou `null` si aucun n'a jamais été écrit. */
  dernierBattement(ownerId: string): Promise<Date | null>;
  maintenant(): Date;
}

/**
 * Un utilisateur suivi, encore éligible, est déclaré bloqué si son battement
 * date de plus de 90 s. Un crash aurait déjà déclenché l'événement `exit`
 * (câblé à part, `cli.ts`) : ce filet ne vise que le cas où le process
 * tourne encore mais ne répond plus (boucle infinie, appel réseau qui ne
 * rend jamais la main).
 */
const SEUIL_PEREMPTION_MS = 90_000;

export async function balayer(deps: SuperviseurDeps): Promise<void> {
  const eligibles = await deps.decouvrirEligibles();
  const suivis = deps.suivis();

  for (const ownerId of eligibles) {
    if (!suivis.has(ownerId)) deps.demarrer(ownerId);
  }

  for (const ownerId of suivis) {
    if (!eligibles.has(ownerId)) {
      deps.arreterProprement(ownerId);
      continue;
    }
    // `null` : jamais démarré, ou pas encore eu le temps d'écrire son premier
    // battement — une absence de nature différente d'un battement périmé, et
    // qui ne doit JAMAIS déclencher ce filet (voir le test dédié).
    const battement = await deps.dernierBattement(ownerId);
    if (battement !== null && deps.maintenant().getTime() - battement.getTime() > SEUIL_PEREMPTION_MS) {
      deps.tuerSansGrace(ownerId);
    }
  }
}

/** Les owner_id dont `connexion_plateforme` porte GitHub ET Vercel actifs. */
export async function decouvrirEligiblesReel(client: SupabaseClient<Database>): Promise<Set<string>> {
  const { data, error } = await client
    .from('connexion_plateforme')
    .select('owner_id,plateforme')
    .eq('etat', 'active')
    .in('plateforme', ['github', 'vercel']);
  if (error) throw new Error(error.message);

  const plateformesParProprietaire = new Map<string, Set<string>>();
  for (const { owner_id, plateforme } of data ?? []) {
    const ensemble = plateformesParProprietaire.get(owner_id) ?? new Set<string>();
    ensemble.add(plateforme);
    plateformesParProprietaire.set(owner_id, ensemble);
  }

  const eligibles = new Set<string>();
  for (const [ownerId, plateformes] of plateformesParProprietaire) {
    if (plateformes.has('github') && plateformes.has('vercel')) eligibles.add(ownerId);
  }
  return eligibles;
}

export interface SuiviBackoff {
  enregistrerDemarrage(ownerId: string, instant: Date): void;
  enregistrerSortie(ownerId: string, instant: Date): void;
  delaiRedemarrageMs(ownerId: string): number;
}

const PALIERS_MS = [5_000, 10_000, 20_000, 60_000];
/** Sous ce temps de fonctionnement, une sortie compte comme un crash en boucle. */
const SEUIL_FONCTIONNEMENT_SAIN_MS = 60_000;

/**
 * Le recul exponentiel d'un redémarrage : 5s, 10s, 20s, plafond 60s. Se
 * réinitialise après 60s de fonctionnement sans sortie — sans quoi un
 * utilisateur qui a connu UN crash resterait pénalisé indéfiniment.
 */
export function creerSuiviBackoff(): SuiviBackoff {
  const demarrages = new Map<string, Date>();
  const compteurs = new Map<string, number>();
  return {
    enregistrerDemarrage(ownerId, instant) {
      demarrages.set(ownerId, instant);
    },
    enregistrerSortie(ownerId, instant) {
      const demarrage = demarrages.get(ownerId);
      const dureeMs = demarrage === undefined ? 0 : instant.getTime() - demarrage.getTime();
      if (dureeMs >= SEUIL_FONCTIONNEMENT_SAIN_MS) {
        compteurs.set(ownerId, 0);
      } else {
        compteurs.set(ownerId, Math.min((compteurs.get(ownerId) ?? 0) + 1, PALIERS_MS.length - 1));
      }
    },
    delaiRedemarrageMs(ownerId) {
      return PALIERS_MS[compteurs.get(ownerId) ?? 0] as number;
    },
  };
}
```

- [ ] **Étape 4 : Lancer, vérifier que tout passe**

Run: `pnpm --filter @prospeo/collector test -- superviseur`
Expected: les dix tests passent (six pour `balayer`, trois pour `creerSuiviBackoff`, un pour `decouvrirEligiblesReel`).

- [ ] **Étape 5 : Câbler la commande `superviseur` dans `cli.ts`**

Ajouter aux imports de `cli.ts` :

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { balayer, creerSuiviBackoff, decouvrirEligiblesReel, type SuperviseurDeps } from './superviseur.js';
```

Ajouter `'superviseur'` à `COMMANDS` (ligne ~230) :

```ts
const COMMANDS = [
  'discover',
  'enrich',
  'review',
  'calibrate',
  'probe',
  'score',
  'reconcile',
  'domains',
  'generate',
  'publish',
  'deploy',
  'unpublish',
  'pitch',
  'worker',
  'superviseur',
] as const;
```

Ajouter au bloc `USAGE`, après la ligne `worker` :

```
  superviseur                                  Démarre/surveille/arrête un worker
                                               par utilisateur éligible — SANS --owner
```

Modifier `main()` (juste après le contrôle `COMMANDS`, avant `lireProprietaire`) :

```ts
  // `superviseur` sert TOUS les utilisateurs éligibles : c'est la seule
  // commande sans --owner, et elle doit contourner la lecture universelle
  // ci-dessous — sans quoi `lireProprietaire` lèverait avant même
  // d'atteindre son traitement.
  if (command === 'superviseur') {
    return runSuperviseur();
  }

  const proprietaire = lireProprietaire(flag(argv, 'owner'));
```

Ajouter la fonction `runSuperviseur`, avant `main` :

```ts
// Le point d'entrée réel de `tsx`, résolu en JS pur — jamais `npx tsx` : sous
// Windows, `npx` est un script `.cmd`, que `spawn` ne peut invoquer sans
// `shell: true` ; or un enfant lancé via un shell POSIX n'est pas garanti de
// relayer un signal à son propre enfant (`kill()` sur le shell peut laisser
// le vrai process orphelin). `tsx/cli` est un fichier `.mjs` que `node`
// exécute directement, sur les deux plateformes, sans intermédiaire.
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve('tsx/cli');

async function runSuperviseur(): Promise<number> {
  const config = loadConfig(process.env);
  const client = createClient(config);

  const PERIODE_BALAYAGE_MS = 60_000;
  const processus = new Map<string, ChildProcess>();
  const backoff = creerSuiviBackoff();
  let arret = false;

  mkdirSync('logs', { recursive: true });

  const demarrerProcessus = (ownerId: string): void => {
    const enfant = spawn(process.execPath, [TSX_CLI, 'src/cli.ts', 'worker', '--owner', ownerId]);
    processus.set(ownerId, enfant);
    backoff.enregistrerDemarrage(ownerId, new Date());

    const journal = createWriteStream(`logs/worker-${ownerId}.log`, { flags: 'a' });
    enfant.stdout?.pipe(journal);
    enfant.stderr?.pipe(journal);

    enfant.on('exit', () => {
      processus.delete(ownerId);
      backoff.enregistrerSortie(ownerId, new Date());
      if (arret) return;
      // Signal PRINCIPAL de redémarrage (voir `superviseur.ts`) : `balayer`
      // ne redémarre que ce qu'il ne voit pas encore comme suivi, `exit` est
      // ce qui le lui apprend sans attendre le prochain balayage de 60s.
      const delai = backoff.delaiRedemarrageMs(ownerId);
      setTimeout(() => {
        if (!arret) demarrerProcessus(ownerId);
      }, delai);
    });
  };

  const deps: SuperviseurDeps = {
    decouvrirEligibles: () => decouvrirEligiblesReel(client),
    suivis: () => new Set(processus.keys()),
    demarrer: demarrerProcessus,
    arreterProprement: (ownerId) => {
      processus.get(ownerId)?.kill('SIGTERM');
    },
    tuerSansGrace: (ownerId) => {
      processus.get(ownerId)?.kill('SIGKILL');
    },
    async dernierBattement(ownerId) {
      const { data, error } = await client
        .from('worker_heartbeat_utilisateur')
        .select('beat_at')
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data === null ? null : new Date(data.beat_at);
    },
    maintenant: () => new Date(),
  };

  const cycle = (): void => {
    void balayer(deps).catch((cause: unknown) => {
      process.stderr.write(
        `superviseur : balayage interrompu — ${cause instanceof Error ? cause.message : String(cause)}\n`,
      );
    });
  };

  const balayage = setInterval(cycle, PERIODE_BALAYAGE_MS);
  cycle();

  const fermer = (): void => {
    arret = true;
    clearInterval(balayage);
    for (const enfant of processus.values()) enfant.kill('SIGTERM');
    process.stdout.write('superviseur : arrêt demandé, plus aucun démarrage\n');
  };
  process.on('SIGINT', fermer);
  process.on('SIGTERM', fermer);

  process.stdout.write('superviseur : à l’écoute\n');

  await new Promise<void>((resoudre) => {
    const attendre = setInterval(() => {
      if (arret && processus.size === 0) {
        clearInterval(attendre);
        resoudre();
      }
    }, 500);
  });
  return 0;
}
```

- [ ] **Étape 6 : Vérifier la compilation**

Run: `pnpm --filter @prospeo/collector typecheck`
Expected: `Done`, 0 erreur.

- [ ] **Étape 7 : Lancer la suite complète**

Run: `pnpm --filter @prospeo/collector test`
Expected: tous les tests passent (379 + tous ceux ajoutés par ce plan) — `runSuperviseur` lui-même n'a pas de test dédié (assemblage réel, voir la note en tête de tâche).

- [ ] **Étape 8 : Commit**

```bash
git add apps/collector/src/superviseur.ts apps/collector/src/superviseur.test.ts apps/collector/src/cli.ts
git commit -m "feat(collector): le superviseur démarre/surveille/arrête un worker par utilisateur"
```

---

## Tâche 8 : Le dashboard lit le battement par utilisateur

**Files:**
- Modify: `apps/dashboard/src/data/campagne.ts:172-183`
- Modify: `apps/dashboard/src/data/campagne.test.ts`

**Interfaces:**
- Consomme : `worker_heartbeat_utilisateur` (Tâche 1, appliquée).
- Produit : `fetchHeartbeat` garde exactement sa signature (`(client: Client) => Promise<{ beatAt: string; inFlight: number } | null>`) — aucun appelant ne change.

> **Aucun filtre explicite par `owner_id`** : comme partout ailleurs dans `apps/dashboard/src/data/*.ts`, c'est la RLS qui borne le résultat au propriétaire courant (`grep -rn "owner_id" apps/dashboard/src/data/*.ts` ne rend aucune occurrence en dehors des tests). Ajouter un `.eq('owner_id', ...)` ici romprait cette convention sans rien protéger de plus.

- [ ] **Étape 1 : Écrire le test qui échoue**

Ajouter à `apps/dashboard/src/data/campagne.test.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { fetchHeartbeat } from './campagne.js';

describe('fetchHeartbeat', () => {
  it('lit worker_heartbeat_utilisateur, jamais l ancien singleton', async () => {
    // LE DEFAUT QUE CE TEST FERME. Sans cette preuve, un renommage de table
    // resterait invisible : le dashboard continuerait de lire l'ancien
    // singleton, désormais mort, et afficherait « à l'arrêt » pour toujours
    // — indiscernable d'un vrai worker jamais démarré.
    const tables: string[] = [];
    const b = {
      select: () => b,
      maybeSingle: () => Promise.resolve({ data: { beat_at: '2026-09-05T10:00:00.000Z', in_flight: 2 }, error: null }),
    };
    const client = {
      from: (nom: string) => {
        tables.push(nom);
        return b;
      },
    } as unknown as SupabaseClient<Database>;

    const r = await fetchHeartbeat(client);

    expect(tables).toEqual(['worker_heartbeat_utilisateur']);
    expect(r).toEqual({ beatAt: '2026-09-05T10:00:00.000Z', inFlight: 2 });
  });

  it('rend null quand aucune ligne n existe — jamais demarre, pas en echec', async () => {
    const client = {
      from: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    } as unknown as SupabaseClient<Database>;

    expect(await fetchHeartbeat(client)).toBeNull();
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/dashboard test -- campagne`
Expected: échec — `tables` contient `'worker_heartbeat'`, pas `'worker_heartbeat_utilisateur'`.

- [ ] **Étape 3 : Rebrancher `fetchHeartbeat`**

```ts
export async function fetchHeartbeat(
  client: Client,
): Promise<{ beatAt: string; inFlight: number } | null> {
  // Pas de filtre explicite : comme partout ailleurs dans ce fichier, c'est
  // la RLS (`proprietaire_seul`) qui borne le résultat au propriétaire
  // courant — voir la note de tête de cette tâche.
  const { data, error } = await client
    .from('worker_heartbeat_utilisateur')
    .select('beat_at,in_flight')
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  if (data === null) return null;
  return { beatAt: data.beat_at, inFlight: data.in_flight };
}
```

- [ ] **Étape 4 : Lancer, vérifier que ça passe**

Run: `pnpm --filter @prospeo/dashboard test -- campagne`
Expected: les deux nouveaux tests passent.

- [ ] **Étape 5 : Suite complète du dashboard**

Run: `pnpm --filter @prospeo/dashboard test`
Expected: 546 tests + les 2 nouveaux passent — `useCampagne.test.ts` n'a besoin d'aucune modification (son client simulé route déjà `.from()` vers un objet générique quel que soit le nom de table, voir `apps/dashboard/src/data/useCampagne.test.ts:16-43`).

- [ ] **Étape 6 : Commit**

```bash
git add apps/dashboard/src/data/campagne.ts apps/dashboard/src/data/campagne.test.ts
git commit -m "feat(dashboard): fetchHeartbeat lit le battement par utilisateur"
```

---

## Tâche 9 : Documentation et vérification finale

**Files:**
- Modify: `.env.example`
- Modify: `docs/design/HANDOFF.md`

- [ ] **Étape 1 : Ajouter les deux secrets dupliqués à `.env.example`**

Après la section `PROSPEO_COFFRE_CLE` (fin du fichier) :

```
# ---------------------------------------------------------------------------
# App GitHub, cote collector — jetons d'installation par utilisateur
# ---------------------------------------------------------------------------
#
# MEMES VALEURS que celles d'apps/relais-oauth/.env.example : le worker
# fabrique ses propres jetons d'installation (une heure de validite,
# jamais stockes) au lieu de lire un GITHUB_TOKEN global. Une rotation de
# la cle privee de l'App doit penser aux DEUX environnements.

# App ID : en haut de la page de reglages de l'App (github.com/settings/apps).
PROSPEO_GITHUB_APP_ID=

# Cle privee .pem generee sur cette meme page ("Generate a private key").
# Les sauts de ligne du PEM doivent survivre : soit coller le fichier tel
# quel si la plateforme le permet, soit remplacer chaque saut de ligne par
# la sequence litterale \n (config.ts les restaure).
PROSPEO_GITHUB_APP_PRIVATE_KEY=
```

- [ ] **Étape 2 : Ajouter la section HANDOFF.md**

Insérer, après `## Chantier n°8, étape 3 — le relais OAuth : ce qui connecte, et ce qui ne rebranche rien` et avant `## La question ouverte du lot 3` (`docs/design/HANDOFF.md`, autour de la ligne 819) :

```markdown
## Chantier n°8, étape suivante — le worker par utilisateur : ce qui résout, et ce qui reste manuel

`chaineDeps.publier()`/`.deployer()` résolvent maintenant le jeton et le
compte de LEUR utilisateur — un jeton d'installation GitHub fabriqué à la
demande (`jetonInstallationGithub`, jamais stocké), le jeton Vercel déchiffré
du coffre (`jetonDe`, en service depuis cette étape après deux étapes sans
appelant). Un bug latent trouvé au passage : `jetonDe` aurait marqué à tort
une connexion GitHub saine comme `indechiffrable`, faute de secret à
déchiffrer côté GitHub App — corrigé en donnant à GitHub sa propre fonction
de résolution plutôt que de réutiliser celle de Vercel.

`worker_heartbeat_utilisateur` remplace le singleton pour le worker de
campagne ; `worker_heartbeat` ne se supprime pas (le dépôt l'interdit) et
reste disponible pour un usage futur (D10, ou un diagnostic global).

**Le superviseur existe, l'hébergement non.** `superviseur` (nouvelle
commande du collector) démarre/surveille/arrête un `worker --owner <uuid>`
par utilisateur éligible (GitHub et Vercel actifs), à base de
`child_process` — portable tel quel vers n'importe quel hôte. Deux chiffrages
faits pendant le brainstorming, à réutiliser plutôt qu'à refaire : Fly.io
Machines coûte environ 2 à 3 \$/mois par utilisateur pour un process léger
toujours allumé (donc linéaire avec le nombre de clients) ; un VPS à coût
fixe (~6-12 \$/mois) héberge plusieurs dizaines de ces process via
`pm2`/`systemd`, au prix d'un isolement plus faible. **Aucun des deux n'est
choisi** — décision reportée, avec de vrais tarifs clients en main.

**Ce que cette étape laisse délibérément de côté :**
- Les commandes batch `publish`/`deploy` de `cli.ts` (lignes 1619 et 1668)
  gardent leurs jetons globaux (`GITHUB_TOKEN`/`VERCEL_TOKEN`) — hors
  périmètre, sans lien avec la file de campagne.
- La péremption (D10) — un processus distinct, à l'application, qui lit le
  coffre pour un utilisateur disparu. Le superviseur ne le remplace pas
  (§6 bis du spec multi-utilisateur : les deux exécutants sont nécessaires).
- Aucun nouvel écran : seul `fetchHeartbeat` est rebranché, l'écran de
  campagne affiche la même chose, pour le bon utilisateur.
- La ligne de témoin de l'étape 1 (`b81c0bf1-…`, `vercel` seul, fixture de
  `verifier-cloisonnement.mjs`) reste en base, inerte pour ce chantier
  puisqu'elle n'a pas les deux plateformes actives — signalée, pas nettoyée.
```

- [ ] **Étape 3 : Commit**

```bash
git add .env.example docs/design/HANDOFF.md
git commit -m "docs(worker-par-utilisateur): secrets dupliqués et bilan de l'étape"
```

- [ ] **Étape 4 : Vérification finale, sur `master` après merge**

```bash
pnpm --filter @prospeo/collector test
pnpm --filter @prospeo/dashboard test
pnpm -r typecheck
```

Expected : tous verts. Consigner les décomptes réels dans le rapport final (ne jamais recopier ceux de l'« État de départ » de ce plan).

---

## Ce que ce plan ne couvre pas

- **L'hébergement réel du superviseur** — VPS ou service de conteneurs managé, décision reportée (§4 du spec).
- **La péremption (D10)**, **la seconde file/l'enrichissement par tranches (D7/D4)**, **Google et l'envoi (D3)** — étapes suivantes de l'ordre du §7 du spec multi-utilisateur.
- **Le nettoyage de la ligne de témoin** de l'étape 1 — signalé, laissé tel quel sur décision du propriétaire.
- **Le retrait de `GITHUB_TOKEN`/`VERCEL_TOKEN`/`PROSPEO_GITHUB_ORG`/`PROSPEO_VERCEL_TEAM`** du `.env` — encore requis par les commandes batch `publish`/`deploy`, qui restent inchangées.
