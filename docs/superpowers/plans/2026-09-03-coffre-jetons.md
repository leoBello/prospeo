# Le coffre à jetons — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que le collector puisse agir avec le compte d'un utilisateur, et que le processus de péremption puisse agir pour un utilisateur qui ne revient jamais — sans qu'un jeton soit jamais lisible en clair dans la base.

**Architecture :** Deux tables — l'état des connexions, lisible par son propriétaire ; les secrets, sans aucune politique, donc inatteignables hors `service_role`. Chiffrement AES-256-GCM par le module `crypto` de Node, la clé maîtresse dans l'environnement du collector et **jamais** dans la base.

**Spec :** [`2026-09-03-coffre-jetons-design.md`](../specs/2026-09-03-coffre-jetons-design.md) — décisions V1 à V5.

**Périmètre restreint, et c'est délibéré.** Le critère 3 du spec — « l'utilisateur voit quels comptes sont connectés » — est **reporté à l'étape 3**. Tant qu'aucune intégration n'existe, cet écran ne pourrait dire que « aucun compte », sans aucun moyen d'y changer quoi que ce soit : un écran qui ne peut qu'annoncer un vide qu'on ne peut pas remplir n'apprend rien et vieillit mal. Ce lot construit **l'endroit où les jetons vivront**, et se vérifie entièrement sans qu'aucune intégration existe.

---

## Global Constraints

- **Tout est en français** : code, commentaires, tests, documentation. Les commentaires disent le *pourquoi*, jamais le *quoi*.
- **Imports en `.js`** même depuis un `.ts` (ESM/NodeNext).
- **Écris le test d'abord**, vérifie qu'il échoue pour la bonne raison, et **prouve que chaque assertion peut échouer** : casse, observe le rouge, restaure, observe le vert. Un récit sans transcription n'est pas une preuve.
- **Un argument `-- <motif>` ne restreint PAS un run vitest** ici : la suite entière s'exécute toujours. Ne prétends jamais avoir lancé un sous-ensemble.
- **`supabase/migrations/` s'applique à une instance de production**, sans recette et sans retour en arrière.
- **`packages/db/src/database.types.ts` est généré** — jamais édité à la main.
- **Aucun secret ne s'écrit dans un test, un journal, un message d'erreur ou un commit.** Un jeton qui apparaît dans une sortie de test est un jeton compromis.

### Le protocole des migrations, non négociable

1. L'implémenteur **écrit le SQL et s'arrête** : il n'applique rien, ne commite rien.
2. Le contrôleur relit **instruction par instruction** et présente son verdict.
3. Le propriétaire valide.
4. Le contrôleur lance `pnpm db:push` puis `pnpm db:types`, et commite **après** application.

**Aucun collector ne doit tourner pendant une migration** — vérifier que `worker_heartbeat.beat_at` ne bouge plus, et non seulement qu'il est ancien.

**Aucun `drop`, aucun `alter column` sur un objet préexistant.** L'exception accordée le 3 septembre portait sur `prospect_siret_key` et sur elle seule ; elle est consommée.

### État de départ

`master` à `0b8de8e`. Dashboard **546 tests / 47 fichiers**, collector **372 / 27**, `pnpm -r typecheck` vert sur cinq paquets. Deux comptes sur l'instance : le propriétaire `131ab48e-055a-4a15-af4b-79ed7a2e4465` et le témoin `b81c0bf1-975a-45ca-904d-1bebb196b829`.

---

## File Structure

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260905090000_coffre_jetons.sql` | les deux tables, leurs énumérations, et la RLS |
| `apps/collector/src/coffre.ts` | chiffrer, déchiffrer, et lire un jeton — le seul endroit qui manipule du clair |
| `apps/collector/src/coffre.test.ts` | — |

**Modifiés :**

| Fichier | Ce qui change |
|---|---|
| `apps/collector/src/config.ts` | `loadCoffreConfig` : la clé maîtresse, exigée au démarrage |
| `apps/collector/src/cli.ts` | le refus de démarrer sans clé, là où les autres réglages sont lus |
| `scripts/verifier-cloisonnement.mjs` | le secret reste invisible **même pour son propriétaire** |
| `.env.example` | la clé maîtresse, documentée avec sa façon de la produire |
| `packages/db/src/database.types.ts` | **régénéré** |
| `docs/design/HANDOFF.md` | ce que le coffre protège, et ce qu'il ne protège pas |

---

## Tâche 1 : Les deux tables

**Files:**
- Create: `supabase/migrations/20260905090000_coffre_jetons.sql`
- Modify (généré) : `packages/db/src/database.types.ts`

> **Périmètre de l'implémenteur : écrire le SQL, rien d'autre.** Pas de `db:push`, pas de `db:types`, pas de commit.

- [ ] **Étape 1 : Vérifier qu'aucun worker ne tourne**

Lire `worker_heartbeat.beat_at` **deux fois à trente secondes d'intervalle**. S'il a bougé, un worker tourne : s'arrêter et le signaler. Un battement « ancien » ne suffit pas — il peut dater d'une pause.

- [ ] **Étape 2 : Écrire la migration**

```sql
-- Chantier n°8, étape 2 — l'endroit où vivent les jetons des utilisateurs.
--
-- POURQUOI DEUX TABLES ET NON DEUX COLONNES. Un écran a besoin de dire
-- « Vercel connecté depuis le 3 septembre » ; il n'a JAMAIS besoin du jeton.
-- Postgres sait restreindre des colonnes par `grant`, mais RLS ne s'exprime
-- pas colonne par colonne : une politique protège une ligne entière. Séparer
-- les deux rend la frontière impossible à franchir par accident.
--
-- POURQUOI LA CLÉ N'EST PAS ICI. Le chiffrement se fait côté collector, avec
-- une clé qui vit dans son environnement. Le coffre Supabase aurait mis la
-- clé chez le même fournisseur que les données ; ainsi, une copie complète de
-- cette base ne vaut rien.

create type plateforme_connectee as enum ('github', 'vercel', 'google');

-- Trois états, et la nuance sert au DIAGNOSTIC, pas à l'action : dans les
-- trois cas la seule chose à faire est de reconnecter le compte. Proposer
-- trois remèdes pour un seul geste tromperait — mais taire la cause
-- empêcherait de comprendre.
create type etat_connexion as enum ('active', 'revoquee', 'indechiffrable');

create table connexion_plateforme (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id),

  plateforme        plateforme_connectee not null,

  -- Ce que l'écran montre : « mon-org », « leo@… ». Jamais un identifiant
  -- technique seul, qui n'apprendrait à personne de quel compte il s'agit.
  compte_libelle    text,

  -- L'identifiant d'installation de la GitHub App, et rien de secret.
  -- DÉLIBÉRÉMENT HORS DU COFFRE : sans la clé privée de l'App — que
  -- l'application détient une seule fois — il ne donne rien. L'y mettre
  -- imposerait un déchiffrement pour une valeur qui n'en a pas besoin.
  reference         text,

  etat              etat_connexion not null default 'active',
  -- Quand cet état a été CONSTATÉ, et non quand il a commencé : on apprend
  -- une révocation en s'y heurtant, jamais au moment où elle survient.
  etat_constate_at  timestamptz,

  connectee_at      timestamptz not null default now(),

  -- Un compte par plateforme et par utilisateur. Deux comptes Vercel pour un
  -- même utilisateur poseraient la question « lequel déploie ? », à laquelle
  -- rien dans ce chantier ne sait répondre.
  unique (owner_id, plateforme)
);

create index connexion_plateforme_owner_idx on connexion_plateforme (owner_id);

create table connexion_secret (
  connexion_id  uuid primary key
                  references connexion_plateforme (id) on delete cascade,

  -- AES-256-GCM. `bytea` et non `text` : encoder en base64 pour la base
  -- ajouterait un tiers de volume et une conversion de plus à chaque bout,
  -- sans rien apporter.
  chiffre       bytea not null,

  -- Le vecteur d'initialisation, UNIQUE À CHAQUE ÉCRITURE. Le réemployer avec
  -- la même clé casse GCM : deux chiffrés produits sous le même couple
  -- (clé, IV) laissent retrouver le clair sans la clé.
  vecteur       bytea not null,

  -- L'étiquette d'authentification de GCM. C'est elle qui fait échouer un
  -- déchiffrement sur un chiffré modifié — sans quoi le collector enverrait à
  -- Vercel un jeton fabriqué au lieu de refuser.
  etiquette     bytea not null,

  -- QUELLE clé a chiffré cette ligne. Non employée aujourd'hui : elle rend
  -- possible d'introduire une seconde clé et de re-chiffrer progressivement,
  -- le jour venu, sans migration corrective. Une colonne coûte peu
  -- maintenant, beaucoup plus tard.
  cle_id        text not null,

  ecrit_at      timestamptz not null default now()
);

alter table connexion_plateforme enable row level security;
alter table connexion_secret     enable row level security;

-- LECTURE SEULE, et non `for all` comme sur `prospect`/`campaign`. Cette
-- table n'est JAMAIS écrite par le dashboard (V5 du spec) : les jetons
-- arrivent par les rappels OAuth, traités côté collector en `service_role`,
-- qui contourne RLS. Donner l'écriture ici ouvrirait exactement
-- l'affordance que la doctrine interdit — un utilisateur pourrait
-- s'INSÉRER lui-même une ligne « vercel, active » sans jamais être passé
-- par l'échange OAuth, et rien n'aurait constaté ce que cette ligne prétend.
create policy proprietaire_lit on connexion_plateforme
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- `connexion_secret` N'A AUCUNE POLITIQUE, ET CE N'EST PAS UN OUBLI.
--
-- RLS est activée ci-dessus ; sans politique, la table est INATTEIGNABLE pour
-- `authenticated`, y compris pour le propriétaire du secret. C'est la forme
-- la plus stricte que Postgres offre, et c'est celle qu'on veut : le
-- dashboard n'a jamais besoin d'un jeton, ni pour l'afficher ni pour
-- l'employer.
--
-- `service_role` contourne RLS par construction et reste le seul accès.
--
-- NE PAS « CORRIGER » CETTE ABSENCE. Ajouter une politique de lecture ici
-- rendrait les jetons de chaque utilisateur lisibles depuis un navigateur.
```

- [ ] **Étape 3 : Relire instruction par instruction**

Neuf instructions. Vérifier :

1. aucune ne contient `drop`, `alter column`, `truncate` ni `delete` ;
2. les deux `create type` portent des noms neufs — `grep -n "create type" supabase/migrations/*.sql` ;
3. les deux `create table` de même ;
4. **`connexion_secret` a `enable row level security` et AUCUNE politique** — c'est le point le plus important de cette migration, et le plus facile à « corriger » par erreur ;
5. `auth.users` est référencé dans le bon schéma.

- [ ] **Étape 4 : S'arrêter et rapporter**

Ne rien appliquer, ne rien commiter. Rapporter les cinq contrôles avec leur sortie réelle.

---

## Tâche 2 : `coffre.ts` — le chiffrement, et lui seul

**Files:**
- Create: `apps/collector/src/coffre.ts`, `coffre.test.ts`

**Interfaces:**
- Produces :
  - `export interface Scelle { chiffre: Buffer; vecteur: Buffer; etiquette: Buffer; cleId: string }`
  - `export type Ouverture = { ouvert: true; clair: string } | { ouvert: false; motif: 'cle_absente' | 'altere' }`
  - `export function chiffrer(clair: string, cle: CleMaitresse): Scelle`
  - `export function dechiffrer(scelle: Scelle, cle: CleMaitresse): Ouverture`
  - `export type CleMaitresse = { id: string; octets: Buffer }`
  - `export function lireCleMaitresse(brut: string | undefined): CleMaitresse`

> **Module pur : aucun accès réseau, aucun Supabase.** C'est ce qui le rend testable, et c'est le seul endroit du dépôt qui manipule un jeton en clair.

- [ ] **Étape 1 : Écrire les tests**

```ts
import { describe, expect, it } from 'vitest';
import { chiffrer, dechiffrer, lireCleMaitresse } from './coffre.js';

/** Trente-deux octets, la taille exacte d'une clé AES-256. */
const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));

describe('lireCleMaitresse', () => {
  it('refuse une cle absente, plutot que de laisser demarrer sans coffre', () => {
    // Un collector qui demarre sans cle echouerait au PREMIER job, une fois
    // qu il aurait deja cree un depot GitHub. L echec doit venir avant.
    expect(() => lireCleMaitresse(undefined)).toThrow();
  });

  it('refuse une cle qui n a pas la bonne taille', () => {
    // AES-256 exige exactement 32 octets. Une cle plus courte ferait lever
    // `crypto` au premier chiffrement, avec un message qui ne dirait pas d ou
    // vient le probleme.
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
    // Une erreur d implementation qui laisserait passer le clair ne se verrait
    // pas a l aller-retour : il faut le chercher dans les octets.
    const s = chiffrer('jeton-vercel-secret', CLE);
    expect(s.chiffre.toString('utf8')).not.toContain('jeton');
    expect(s.chiffre.toString('base64')).not.toContain('amV0b24');
  });

  it('ne reemploie JAMAIS le meme vecteur', () => {
    // Deux chiffres produits sous le meme couple (cle, IV) laissent retrouver
    // le clair SANS la cle. C est la faute qui casse GCM, et elle est
    // silencieuse.
    const vecteurs = new Set(
      Array.from({ length: 200 }, () => chiffrer('x', CLE).vecteur.toString('hex')),
    );
    expect(vecteurs.size).toBe(200);
  });

  it('refuse un chiffre altere au lieu de rendre des octets arbitraires', () => {
    // C est la raison d etre de GCM. Sans l etiquette, un chiffre modifie en
    // base se dechiffrerait en n importe quoi, et le collector enverrait un
    // jeton fabrique a Vercel au lieu d echouer.
    const s = chiffrer('jeton-vercel-secret', CLE);
    s.chiffre[0] = s.chiffre[0] ^ 0xff;
    expect(dechiffrer(s, CLE)).toEqual({ ouvert: false, motif: 'altere' });
  });

  it('refuse une etiquette altere', () => {
    const s = chiffrer('jeton-vercel-secret', CLE);
    s.etiquette[0] = s.etiquette[0] ^ 0xff;
    expect(dechiffrer(s, CLE)).toEqual({ ouvert: false, motif: 'altere' });
  });

  it('rend un echec NOMME sous une autre cle, jamais une exception nue', () => {
    // La perte de la cle maitresse est un cas prevu : chaque connexion passe
    // a « indechiffrable » et se reconnecte. L appelant doit pouvoir le
    // MARQUER, donc `dechiffrer` ne leve pas.
    const autre = lireCleMaitresse('v2:' + Buffer.alloc(32, 9).toString('base64'));
    expect(dechiffrer(chiffrer('x', CLE), autre)).toEqual({ ouvert: false, motif: 'altere' });
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec de résolution du module**

```bash
pnpm --filter @prospeo/collector test
```

Attendu : `Failed to resolve import "./coffre.js"`. **Pas** une erreur d'assertion.

- [ ] **Étape 3 : Écrire le module**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Le seul endroit du dépôt qui manipule un jeton en clair.
 *
 * **La clé vit dans l'environnement du collector, jamais dans la base.** Le
 * coffre Supabase aurait mis la clé chez le même fournisseur que les données ;
 * ainsi, une copie complète de la base ne vaut rien.
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
 */
export type Ouverture =
  | { ouvert: true; clair: string }
  | { ouvert: false; motif: 'altere' };

/**
 * Lit la clé maîtresse, ou **empêche le collector de démarrer**.
 *
 * Format `<id>:<32 octets en base64>`. L'identifiant voyage avec la clé pour
 * qu'on ne puisse pas les désynchroniser en les rangeant séparément.
 *
 * Refuser ici plutôt qu'au premier chiffrement : un collector démarré sans
 * coffre échouerait au premier job, **après** avoir créé un dépôt GitHub — et
 * un dépôt créé ne se « dé-crée » pas.
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
  // Un vecteur NEUF à chaque écriture. Le réemployer sous la même clé laisse
  // retrouver le clair sans la clé — la faute qui casse GCM, et elle est
  // silencieuse.
  const vecteur = randomBytes(TAILLE_VECTEUR);
  const chiffreur = createCipheriv('aes-256-gcm', cle.octets, vecteur);
  const chiffre = Buffer.concat([chiffreur.update(clair, 'utf8'), chiffreur.final()]);
  return { chiffre, vecteur, etiquette: chiffreur.getAuthTag(), cleId: cle.id };
}

export function dechiffrer(scelle: Scelle, cle: CleMaitresse): Ouverture {
  try {
    const dechiffreur = createDecipheriv('aes-256-gcm', cle.octets, scelle.vecteur);
    // `setAuthTag` avant `final` : c'est `final` qui vérifie l'étiquette et
    // lève si le chiffré a bougé.
    dechiffreur.setAuthTag(scelle.etiquette);
    const clair = Buffer.concat([dechiffreur.update(scelle.chiffre), dechiffreur.final()]);
    return { ouvert: true, clair: clair.toString('utf8') };
  } catch {
    // Chiffré modifié, étiquette fausse, ou mauvaise clé : les trois mènent au
    // même geste — reconnecter le compte. La nuance vit dans
    // `connexion_plateforme.etat`, pas ici.
    return { ouvert: false, motif: 'altere' };
  }
}
```

- [ ] **Étape 4 : Lancer, vérifier le vert**

La suite valait **372 tests / 27 fichiers** ; tu ajoutes neuf tests et un fichier.

- [ ] **Étape 5 : Prouver que les assertions mordent**

Quatre cassures, chacune sur une garantie différente :

1. remplacer `randomBytes(TAILLE_VECTEUR)` par un vecteur constant → le test « ne reemploie JAMAIS le meme vecteur » doit rougir ;
2. retirer `dechiffreur.setAuthTag(scelle.etiquette)` → les tests d'altération doivent rougir ;
3. remplacer le corps de `chiffrer` par `{ chiffre: Buffer.from(clair), … }` → le test « n ecrit jamais le clair » doit rougir ;
4. remplacer le contrôle de taille de clé par `octets.length > 0` → le test de taille doit rougir.

Pour chacune : casse, lance, **colle le rouge**, restaure, **colle le vert**.

- [ ] **Étape 6 : Commit**

---

## Tâche 3 : La clé, exigée au démarrage

**Files:**
- Modify: `apps/collector/src/config.ts`, `cli.ts`, `.env.example`

- [ ] **Étape 1 : Ajouter `loadCoffreConfig`**

**Lis d'abord `config.ts`** : il porte déjà `loadConfig`, `loadPublishConfig`, `loadDeployConfig`, `loadGenerateConfig`, `loadPitchConfig`. Suis exactement ce patron — un `load*Config` de plus, pas une forme nouvelle.

- [ ] **Étape 2 : Le refus de démarrer**

Dans `cli.ts`, les commandes qui touchent aux jetons d'un utilisateur lisent la clé **avant** toute autre chose. Aujourd'hui aucune ne l'emploie encore ; **ne l'exige donc que là où elle sert**, sinon toutes les commandes de collecte refuseraient de démarrer pour un coffre dont elles n'ont pas besoin.

> **C'est un point de jugement, pas une consigne mécanique.** Exiger la clé partout serait plus simple et casserait `discover`, `enrich`, `probe` et `score`, qui n'ont aucun jeton d'utilisateur à lire. Dis dans ton rapport ce que tu as retenu.

- [ ] **Étape 3 : Documenter la clé dans `.env.example`**

Avec **la commande qui la produit** :

```
# Chiffre les jetons des utilisateurs (AES-256-GCM). Sans elle, aucune
# connexion de plateforme ne peut être lue ni écrite.
# La produire : node -e "console.log('v1:'+require('crypto').randomBytes(32).toString('base64'))"
# LA PERDRE oblige chaque utilisateur à reconnecter ses comptes : aucune
# donnée n'est perdue, mais toutes les autorisations sont à redonner.
PROSPEO_COFFRE_CLE=
```

- [ ] **Étape 4 : Vérifier et commiter**

`pnpm --filter @prospeo/collector test` et `pnpm -r typecheck` verts.

---

## Tâche 4 : Lire un jeton, et marquer ce qui ne se lit plus

**Files:**
- Modify: `apps/collector/src/coffre.ts`, `coffre.test.ts`

**Interfaces:**
- Produces :
  - `export type PlateformeConnectee = Enums<'plateforme_connectee'>` et `export type EtatConnexion = Enums<'etat_connexion'>` (alias sur les types générés par la migration de la Tâche 1 — `import type { Enums } from '@prospeo/db';`).
  - `export interface CoffreDeps { lireConnexion(proprietaire: Proprietaire, plateforme: PlateformeConnectee): Promise<{ id: string; etat: EtatConnexion } | null>; lireSecret(connexionId: string): Promise<Scelle | null>; marquerEtat(connexionId: string, etat: EtatConnexion): Promise<void>; cle: CleMaitresse }`
  - `export async function jetonDe(deps: CoffreDeps, proprietaire: Proprietaire, plateforme: PlateformeConnectee): Promise<{ jeton: string } | { jeton: null; etat: EtatConnexion | 'absente' }>`

> `deps` porte les accès en paramètre, comme `FileDeps` (`stages/file.ts`) et `ChaineDeps` (`chaine.ts`) — des fonctions, jamais un client Supabase brut, pour que `jetonDe` se teste sans base ni réseau. `cli.ts` (Tâche 3) est le seul endroit qui devra un jour assembler un `CoffreDeps` réel à partir d'un client `service_role` — hors du périmètre de cette tâche tant qu'aucune commande n'appelle `jetonDe`.

- [ ] **Étape 1 : Écrire les tests**

Couvre, en TDD :

- aucune connexion pour cette plateforme → `{ jeton: null, etat: 'absente' }` ;
- une connexion `revoquee` → le jeton n'est **pas** lu, et l'état remonte tel quel ;
- une connexion `active` dont le secret ne se déchiffre pas → le jeton est `null`, l'état rendu est `indechiffrable`, **et la connexion est marquée en base** ;
- une connexion `active` déchiffrable → le jeton, et **aucune écriture** ;
- le jeton rendu n'apparaît dans **aucun** message d'erreur.

Le troisième est le cœur : un déchiffrement raté qui ne marquerait rien laisserait l'écran annoncer un compte connecté qui ne l'est plus — l'affordance que la doctrine interdit.

- [ ] **Étape 2 : Lancer, vérifier l'échec, écrire, prouver**

Les cassures à prouver : retirer le marquage en base, et confondre `absente` avec `revoquee`.

- [ ] **Étape 3 : Vérifier et commiter**

---

## Tâche 5 : Le contrôle voit le coffre

**Files:**
- Modify: `scripts/verifier-cloisonnement.mjs`

> **Un test qui vérifie que `connexion_secret` rend zéro ligne passerait aussi bien si la table était vide.** Il faut donc y écrire un secret avec `service_role` **avant** de vérifier qu'il reste invisible — sans quoi le contrôle ne prouve rien.

- [ ] **Étape 1 : Étendre le contrôle**

1. Avec `service_role` : créer pour le **témoin** une `connexion_plateforme` (`vercel`) et son `connexion_secret`, si elles n'existent pas.
2. En session témoin, avec la clé publique : la **connexion** est visible — c'est son compte.
3. En session témoin : `connexion_secret` est **inatteignable**, alors même que la ligne existe et lui appartient. C'est l'assertion neuve, et la seule qui prouve V2.
4. Vérifier aussi qu'une ligne du propriétaire reste invisible du témoin, comme pour les autres tables.

- [ ] **Étape 2 : L'exécuter, et prouver qu'il mord**

Ajouter temporairement une politique de lecture sur `connexion_secret` **en local seulement, jamais sur l'instance** — ou, à défaut, vérifier que l'assertion échoue si on la fait porter sur une table lisible. Dis dans ton rapport ce que tu as pu prouver et ce que tu n'as pas pu.

- [ ] **Étape 3 : Commiter**

---

## JALON — un secret existe, et personne ne peut le lire

- [ ] `scripts/verifier-cloisonnement.mjs` passe, y compris ses assertions neuves.
- [ ] Écrire un jeton avec `service_role`, le relire, vérifier qu'il revient identique.
- [ ] Le modifier d'un octet en base, le relire : **le déchiffrement doit échouer**, et la connexion passer à `indechiffrable`.
- [ ] Vérifier depuis un navigateur — ou une session de la clé publique — que `connexion_secret` ne rend rien, même pour son propriétaire.
- [ ] Consigner dans `HANDOFF.md` : ce que le coffre protège, ce qu'il ne protège pas (la clé est dans l'environnement du collector ; qui obtient cet environnement obtient les jetons), et le report du critère 3 à l'étape 3.

---

## Ce que ce plan ne couvre pas

La GitHub App et l'intégration Vercel qui **remplissent** le coffre, le parcours d'installation, l'écran qui montre les connexions, le worker par utilisateur, l'enrichissement par tranches, la péremption, Google et l'envoi.

**Et le mur nommé au §7.4 du spec :** recevoir un rappel OAuth demande un serveur HTTP que le collector n'a pas. C'est le premier endroit où « pas de backend applicatif » devient contraignant, et il se tranche à l'étape 3 — pas ici.
