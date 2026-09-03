# Cloisonnement — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qu'un utilisateur ne voie, ne lise et n'écrive que ses propres données — et qu'un second compte le prouve, table par table.

**Architecture :** `prospect`, `campaign` et `campaign_job` portent le propriétaire ; les onze satellites le déduisent par une remontée indexée. Les politiques RLS protègent le dashboard. **Elles ne protègent pas le collector**, qui emploie `service_role` : ses 40 lectures reçoivent un propriétaire obligatoire.

**Tech Stack :** Postgres/Supabase (migrations SQL, RLS), Node + tsx (collector), React 18 + TypeScript (dashboard), Vitest.

**Spec :** [`2026-09-03-cloisonnement-design.md`](../specs/2026-09-03-cloisonnement-design.md) — décisions C1 à C5, exception du §7 **autorisée le 3 septembre 2026**.

---

## Global Constraints

- **Tout est en français** : code, commentaires, tests, interface, documentation. Les commentaires disent le *pourquoi*, jamais le *quoi*.
- **Imports en `.js`** même depuis un `.tsx` (ESM/NodeNext).
- **Aucune chaîne affichée en dur**, aucune couleur en dur.
- **Le texte d'une assertion se lit dans `fr.ts`**, jamais ne s'invente — pas même depuis ce plan.
- **Écris le test d'abord**, vérifie qu'il échoue pour la bonne raison, et **prouve que chaque assertion peut échouer** : casse, observe le rouge, restaure, observe le vert. Un récit sans transcription n'est pas une preuve.
- **Un argument `-- <motif>` ne restreint PAS un run vitest** ici : la suite entière s'exécute toujours. Ne prétends jamais avoir lancé un sous-ensemble.
- **`supabase/migrations/` s'applique à une instance de production**, sans recette et sans retour en arrière.
- **`packages/db/src/database.types.ts` est généré** — jamais édité à la main.

### Le protocole des migrations, établi au lot précédent et non négociable

1. L'implémenteur **écrit le SQL et s'arrête** : il n'applique rien, ne commite rien.
2. Le contrôleur relit **instruction par instruction** et présente son verdict.
3. Le propriétaire valide le verdict.
4. Le contrôleur lance `pnpm db:push` puis `pnpm db:types`, et commite **après** application.

**Aucun collector ne doit tourner pendant une migration.** Vérifier `worker_heartbeat.beat_at` avant : au-delà de 60 s, personne ne travaille.

### La seule exception doctrinale autorisée

Retirer `prospect_siret_key` et la remplacer par un index unique `(owner_id, siret)`. **Rien d'autre.** Tout autre `drop`, `alter column` ou suppression de donnée reste interdit et demande une nouvelle autorisation.

### État de départ

`master` à `adc5744`. Dashboard **545 tests / 47 fichiers**, collector **366 / 26**, `pnpm -r typecheck` vert sur cinq paquets. Un seul compte : `131ab48e-055a-4a15-af4b-79ed7a2e4465`.

---

## File Structure

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260904090000_proprietaire.sql` | `owner_id` sur `prospect` et `campaign`, rattachement de l'existant, `not null`, index |
| `supabase/migrations/20260904091000_siret_par_proprietaire.sql` | **l'exception** : `drop constraint` + index unique `(owner_id, siret)`, même transaction |
| `supabase/migrations/20260904092000_politiques_cloisonnees.sql` | les seize politiques réécrites |
| `apps/collector/src/proprietaire.ts` | le type `Proprietaire` et la garde qui refuse un identifiant absent |
| `apps/collector/src/proprietaire.test.ts` | — |
| `scripts/verifier-cloisonnement.mjs` | le contrôle à deux comptes, conservé au dépôt |

**Modifiés :**

| Fichier | Ce qui change |
|---|---|
| `apps/collector/src/chaine.ts` | `fetchSiteRows`, `fetchSiteCandidates`, `fetchPitchCandidates` prennent un propriétaire |
| `apps/collector/src/cli.ts` | `--owner <uuid>` obligatoire sur les commandes de collecte ; le worker le reçoit au démarrage |
| `apps/collector/src/stages/*.ts` | les lectures restantes du recensement |
| `apps/dashboard/src/data/mutations.ts` | `deposerJob` écrit enfin `requested_by` |
| `apps/dashboard/src/data/campagne.ts` | `campagneRangeReader` : vérifier que RLS suffit, sans filtre redondant |
| `packages/db/src/database.types.ts` | **régénéré** |
| `docs/design/HANDOFF.md` | ce que le cloisonnement change, et ce qu'il ne protège pas |

---

## Tâche 1 : Le propriétaire, et le rattachement de l'existant

**Files:**
- Create: `supabase/migrations/20260904090000_proprietaire.sql`
- Modify (généré) : `packages/db/src/database.types.ts`

**Interfaces:**
- Produces: `prospect.owner_id`, `campaign.owner_id`, l'index `prospect (id, owner_id)`.

> **Périmètre de l'implémenteur : écrire le SQL, rien d'autre.** Pas de `db:push`, pas de `db:types`, pas de commit. Voir le protocole ci-dessus.

- [ ] **Étape 1 : Vérifier qu'aucun collector ne tourne**

```bash
node -e "
import('fs').then(async ({readFileSync})=>{
  const env=Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).filter(l=>/^[A-Z]/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}));
  const {createClient}=await import('@supabase/supabase-js');
  const c=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const {data}=await c.from('worker_heartbeat').select('beat_at').eq('id',true).single();
  console.log('battement il y a', Math.round((Date.now()-Date.parse(data.beat_at))/1000),'s');
});"
```

Au-delà de 60 s, personne ne travaille et la migration peut être écrite. En deçà, **arrêter le worker d'abord**.

- [ ] **Étape 2 : Écrire la migration**

```sql
-- Chantier n°8, étape 1 — le propriétaire des données.
--
-- POURQUOI MAINTENANT. Les seize tables portent aujourd'hui
-- `authenticated_all using (true)` : n'importe quel utilisateur connecté voit
-- toutes les lignes de tout le monde. C'était juste tant qu'il n'y avait
-- qu'un compte — la clé anonyme est publique par construction, et RLS
-- empêchait un inconnu de lire. Ça ne protège rien entre deux inscrits.
--
-- Cette migration ne change AUCUNE politique : elle pose seulement de quoi
-- les écrire. Séparer les deux permet de vérifier le rattachement avant que
-- quoi que ce soit devienne invisible.

-- NULLABLE d'abord, et non `not null` : la table est peuplée, et un `not
-- null` posé d'emblée sur 139 lignes sans valeur échouerait. Le passage se
-- fait plus bas, une fois les lignes remplies.
alter table prospect add column owner_id uuid references auth.users (id);
alter table campaign add column owner_id uuid references auth.users (id);

-- Rattachement de l'existant (D5 du chantier n°8).
--
-- Les 139 prospects portent scores, sondes et historique, payés d'environ 40
-- minutes de scraping. Surtout, le site de LUCIAN LAZA est EN LIGNE au nom
-- d'une entreprise réelle et l'horloge des 90 jours court : une ligne
-- orpheline serait un site vivant que plus rien ne pourrait dépublier.
--
-- L'identifiant est celui du seul compte existant au 3 septembre 2026,
-- `leobello.wd@gmail.com`. Écrit en clair plutôt que déduit d'un `select` :
-- une migration qui choisit son propriétaire au hasard d'un tri est une
-- migration qu'on ne peut pas relire.
update prospect set owner_id = '131ab48e-055a-4a15-af4b-79ed7a2e4465'
  where owner_id is null;
update campaign set owner_id = '131ab48e-055a-4a15-af4b-79ed7a2e4465'
  where owner_id is null;

-- `campaign_job.requested_by` existe depuis le lot 1 et n'a jamais été
-- écrite — relevée comme colonne morte par la revue finale (constat M3).
-- Elle devient la clé de voûte : c'est elle qui dira de qui résoudre les
-- jetons. Les quatre lignes existantes sont des essais du contrôleur, toutes
-- en `annule`.
update campaign_job set requested_by = '131ab48e-055a-4a15-af4b-79ed7a2e4465'
  where requested_by is null;

-- Le passage à `not null`, APRÈS remplissage.
--
-- Il vaut garde-fou autant que contrainte : à partir d'ici, une ligne sans
-- propriétaire ne peut plus naître, donc aucune donnée ne peut échapper au
-- cloisonnement par simple oubli d'un appelant.
alter table prospect alter column owner_id set not null;

-- `campaign` reste nullable : la table est vide, et rien ne crée encore de
-- campagne. Le `not null` s'ajoutera avec le lot qui les crée, quand un
-- appelant existera pour le respecter. Poser une contrainte que personne ne
-- peut encore violer n'apprend rien et se paie à la première insertion.

-- L'index qui rend gratuite la remontée des satellites (§4 du spec) : la
-- condition `p.id = … and p.owner_id = auth.uid()` se satisfait par l'index
-- seul, sans toucher la table.
create index prospect_id_owner_idx on prospect (id, owner_id);

-- La lecture par locataire, celle de tous les écrans et de toutes les
-- commandes de collecte.
create index prospect_owner_idx on prospect (owner_id);
```

> **`alter column … set not null` est-il un « objet modifié » ?** Non au sens de la règle : il ne retire ni ne redéfinit rien, il resserre une colonne que cette même migration vient de créer. La règle vise les objets **préexistants**. L'unique exception autorisée reste celle de la tâche 2.

- [ ] **Étape 3 : Relire instruction par instruction**

Neuf instructions. Vérifier, une par une :

1. aucune ne contient `drop`, `truncate`, `delete`, ni `alter column … type` ;
2. les deux `add column` portent sur des colonnes qui n'existent pas — `grep -n "owner_id" supabase/migrations/*.sql` ne doit rien rendre d'autre ;
3. les trois `update` portent tous une clause `where … is null` : rejoués, ils ne réécrivent rien ;
4. le `set not null` vient **après** les `update`, jamais avant ;
5. les deux `create index` portent des noms qui n'existent pas.

- [ ] **Étape 4 : S'arrêter et rapporter**

Ne rien appliquer, ne rien commiter. Rapporter les cinq contrôles avec leur sortie réelle.

---

## Tâche 2 : L'exception — un SIRET par propriétaire

**Files:**
- Create: `supabase/migrations/20260904091000_siret_par_proprietaire.sql`

> **C'est la seule instruction destructive autorisée de tout ce chantier.** Elle a été demandée au propriétaire et accordée le 3 septembre 2026, sur ce point précis. Elle ne s'étend à rien d'autre.

- [ ] **Étape 1 : Écrire la migration**

```sql
-- Chantier n°8, étape 1 — un SIRET appartient à un propriétaire, pas au
-- premier arrivé.
--
-- L'EXCEPTION. `CLAUDE.md` interdit de modifier ou supprimer un objet
-- existant, et cette migration retire une contrainte de la migration
-- initiale. L'autorisation a été demandée au propriétaire et accordée le
-- 3 septembre 2026, sur ce point PRÉCIS.
--
-- POURQUOI IL N'Y A PAS D'ÉCHAPPATOIRE. `prospect.siret` porte `not null
-- unique` depuis l'origine. Avec une base par utilisateur, deux clients qui
-- ciblent la même ville découvrent le même établissement : le `discover` du
-- second échouerait sur la contrainte. La garder reviendrait à donner
-- Marseille au premier arrivé. Et un index partiel ne peut pas remplacer une
-- contrainte globale par une contrainte par locataire — c'est la même
-- colonne, la même table.
--
-- POURQUOI LES DEUX INSTRUCTIONS SONT INSÉPARABLES. Entre le retrait et la
-- création, la table n'a plus aucun garde-fou sur `siret` : un `discover`
-- concurrent pourrait insérer un doublon que plus rien ne rattraperait.
-- Postgres exécute une migration dans une transaction, donc l'intervalle
-- n'est jamais visible d'une autre session — mais ces deux lignes ne doivent
-- JAMAIS être séparées dans deux migrations.
alter table prospect drop constraint prospect_siret_key;

create unique index prospect_owner_siret_unique on prospect (owner_id, siret);
```

- [ ] **Étape 2 : Vérifier le nom réel de la contrainte**

`prospect_siret_key` est le nom que Postgres **donne par défaut** à une contrainte `unique` déclarée en ligne sur `prospect (siret)`. Le vérifier plutôt que le supposer : une migration qui retire une contrainte inexistante échoue, et la suivante avec.

```sql
select conname from pg_constraint
where conrelid = 'prospect'::regclass and contype = 'u';
```

À exécuter en **lecture seule** dans l'éditeur SQL Supabase, et à rapporter. Si le nom diffère, corriger la migration.

- [ ] **Étape 3 : S'arrêter et rapporter**

---

## Tâche 3 : Les politiques

**Files:**
- Create: `supabase/migrations/20260904092000_politiques_cloisonnees.sql`

> **L'ordre compte.** `prospect` d'abord : tant qu'elle n'est pas cloisonnée, cloisonner les satellites ne protège rien, puisqu'ils remontent à elle.

- [ ] **Étape 1 : Écrire la migration**

Les politiques existantes s'appellent toutes `authenticated_all`. Les remplacer demande de les retirer — **mais une politique n'est pas un objet de données**, et son remplacement ne perd aucune ligne. C'est le geste que la règle vise le moins ; le noter quand même dans le rapport.

Trois formes, et pas une de plus :

```sql
-- FORME 1 — le propriétaire est sur la ligne.
-- `(select auth.uid())` et non `auth.uid()` : Postgres évalue le sous-select
-- UNE FOIS par requête au lieu d'une fois par ligne. Sur plusieurs milliers
-- de prospects, la différence se mesure.
drop policy authenticated_all on prospect;
create policy proprietaire_seul on prospect
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy authenticated_all on campaign;
create policy proprietaire_seul on campaign
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy authenticated_all on campaign_job;
create policy proprietaire_seul on campaign_job
  for all to authenticated
  using (requested_by = (select auth.uid()))
  with check (requested_by = (select auth.uid()));
```

```sql
-- FORME 2 — le propriétaire se lit chez le prospect.
-- `with check` autant que `using` : sans lui, un utilisateur pourrait ÉCRIRE
-- une ligne rattachée au prospect d'un autre, même sans pouvoir la relire.
-- À répéter à l'identique pour les onze satellites.
drop policy authenticated_all on prospect_score;
create policy proprietaire_du_prospect on prospect_score
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = prospect_score.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = prospect_score.prospect_id
      and p.owner_id = (select auth.uid())
  ));
```

Les onze satellites, exhaustivement : `prospect_enrichment`, `web_presence`, `prospect_score`, `prospect_pipeline`, `prospect_site`, `prospect_contact`, `interaction`, `generated_message`, `deployment_event`, `pipeline_event`, `message_send`.

```sql
-- FORME 3 — les deux tables de l'application (C4).
-- `site_template` est le gabarit, que D6 rend public ; `worker_heartbeat`
-- décrit un processus. Ni l'un ni l'autre n'appartient à un client — mais un
-- client n'a aucune raison de pouvoir désigner le gabarit de tout le monde,
-- ni de maquiller l'état du worker. Lecture pour tous, écriture réservée au
-- `service_role`, qui contourne RLS de toute façon.
drop policy authenticated_all on site_template;
create policy lecture_seule on site_template
  for select to authenticated using (true);

drop policy authenticated_all on worker_heartbeat;
create policy lecture_seule on worker_heartbeat
  for select to authenticated using (true);
```

- [ ] **Étape 2 : Compter, et vérifier l'exhaustivité**

Seize tables, seize politiques neuves. Le vérifier mécaniquement :

```bash
grep -c "^drop policy" supabase/migrations/20260904092000_politiques_cloisonnees.sql   # attendu : 16
grep -c "^create policy" supabase/migrations/20260904092000_politiques_cloisonnees.sql # attendu : 16
```

Une table oubliée reste ouverte à tous, et **rien ne le signalera** : c'est le mode d'échec de cette tâche. La liste de référence est celle du §2 du spec.

- [ ] **Étape 3 : S'arrêter et rapporter**

---

## Tâche 4 : Le collector reçoit un propriétaire

**Files:**
- Create: `apps/collector/src/proprietaire.ts`, `.test.ts`
- Modify: `apps/collector/src/chaine.ts`, `cli.ts`, `stages/*.ts`

**Interfaces:**
- Produces: `export type Proprietaire = string & { readonly __marque: unique symbol }` et `export function proprietaire(brut: string | undefined): Proprietaire`

> **C'est ici que se joue la vraie protection du worker.** `service_role` contourne RLS : aucune politique ne le retiendra jamais. Le filtre explicite est la seule barrière.

- [ ] **Étape 1 : Écrire les tests de la garde**

```ts
import { describe, expect, it } from 'vitest';
import { proprietaire } from './proprietaire.js';

describe('proprietaire', () => {
  it('accepte un uuid', () => {
    const id = '131ab48e-055a-4a15-af4b-79ed7a2e4465';
    expect(proprietaire(id)).toBe(id);
  });

  it('refuse une valeur absente, plutot que de traiter toute la base', () => {
    // Sans cette garde, une commande lancee sans --owner lirait les donnees
    // de TOUS les utilisateurs et les traiterait comme celles d un seul.
    // L echec doit etre bruyant : un filtre absent ne leve rien, il rend
    // simplement plus de lignes.
    expect(() => proprietaire(undefined)).toThrow();
  });

  it('refuse une chaine qui n est pas un uuid', () => {
    // `--owner leo` passerait un filtre `.eq('owner_id', 'leo')` qui ne
    // rendrait aucune ligne : un run silencieusement vide, qu on prendrait
    // pour « rien a faire ».
    expect(() => proprietaire('leo')).toThrow();
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec de résolution de module**

```bash
pnpm --filter @prospeo/collector test
```

Attendu : `Failed to resolve import "./proprietaire.js"`. **Pas** une erreur d'assertion.

- [ ] **Étape 3 : Écrire la garde**

```ts
/**
 * L'identifiant du locataire pour le compte duquel une commande travaille.
 *
 * **Un type marqué, et non un `string`.** Le collector emploie la clé
 * `service_role`, qui contourne RLS par construction : aucune politique ne le
 * retiendra jamais. Le filtre explicite est la SEULE barrière, et un
 * `string` de plus dans une signature se laisse oublier ou intervertir avec
 * un `prospectId`. Le marquage fait échouer la compilation à sa place.
 */
export type Proprietaire = string & { readonly __marque: unique symbol };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Refuse bruyamment plutôt que de laisser passer.
 *
 * Une valeur absente ferait lire la base entière ; une valeur mal formée
 * rendrait zéro ligne, qu'on prendrait pour « rien à faire ». Les deux échecs
 * sont silencieux, et c'est précisément pourquoi ils lèvent ici.
 */
export function proprietaire(brut: string | undefined): Proprietaire {
  if (brut === undefined || brut === '') {
    throw new Error('--owner <uuid> est obligatoire : sans lui, la commande lirait la base de tous les utilisateurs.');
  }
  if (!UUID.test(brut)) {
    throw new Error(`--owner attend un uuid, reçu « ${brut} ».`);
  }
  return brut as Proprietaire;
}
```

- [ ] **Étape 4 : Lancer, vérifier le vert, prouver les assertions**

Casser à tour de rôle : retirer la garde sur `undefined`, puis celle sur le format. Chaque cassure doit faire rougir son test. Coller les sorties.

- [ ] **Étape 5 : Reprendre les 40 lectures**

Le recensement, à refaire pour partir de la réalité et non de ce plan :

```bash
grep -rn "\.from('" apps/collector/src --include=*.ts | grep -v test
```

**42 appels, dont 40 à filtrer.** `site_template` et `worker_heartbeat` en sont exclus (C4) — ce sont des objets de l'application.

Le patron, partout le même : la fonction prend un `Proprietaire` en **premier paramètre après le client**, obligatoire, et le filtre s'applique là où le propriétaire est atteignable :

- sur `prospect` : `.eq('owner_id', proprietaire)` ;
- sur un satellite lu seul : `.eq('prospect.owner_id', proprietaire)` via la relation embarquée, ou une jointure explicite. **Vérifier la forme sur une requête réelle** avant de la répandre — PostgREST filtre sur une relation embarquée avec `!inner`, et une syntaxe fausse rend silencieusement toutes les lignes.

Traiter les fichiers dans cet ordre, du plus lu au moins lu : `chaine.ts` (les trois `fetch*`), puis `stages/discover.ts`, `enrich.ts`, `probe.ts`, `classify-score.ts`, `domains.ts`, `generate.ts`, `publish.ts`, `deploy.ts`, `pitch.ts`, `unpublish.ts`, `reconcile.ts`, `review.ts`, `calibrate.ts`.

- [ ] **Étape 6 : `--owner` obligatoire sur les commandes**

Dans `cli.ts`, chaque commande de collecte lit `proprietaire(flag(argv, 'owner'))`. Le `case 'worker'` le reçoit de même : **un worker par utilisateur** (D8), donc il le tient pour toute sa vie.

Ajouter `--owner <uuid>` à chaque ligne du bloc `USAGE`. Une option obligatoire absente de l'aide est une option qu'on découvre par une erreur.

- [ ] **Étape 7 : Prouver qu'il n'en reste aucune**

```bash
grep -rn "\.from('" apps/collector/src --include=*.ts | grep -v test | grep -v "site_template\|worker_heartbeat"
```

Chaque ligne rendue doit être suivie, dans les cinq lignes qui suivent, d'un filtre sur le propriétaire. **Coller la sortie complète dans le rapport, ligne par ligne, avec le filtre correspondant.** C'est le seul contrôle qui existe : `service_role` ne lèvera jamais, et aucun test ne verra une lecture oubliée.

- [ ] **Étape 8 : Vérifier et commiter**

`pnpm --filter @prospeo/collector test` et `pnpm -r typecheck` verts. Le compte de tests augmente de trois.

---

## Tâche 5 : Le dashboard écrit le propriétaire

**Files:**
- Modify: `apps/dashboard/src/data/mutations.ts`, `mutations.test.ts`

- [ ] **Étape 1 : Écrire le test**

`deposerJob` doit renseigner `requested_by`. Reprendre le client simulé de `mutations.test.ts`, qui enregistre déjà les valeurs construites, et asserter que la colonne est présente et vaut l'identifiant de la session.

**Lire d'abord** comment `deposerJob` obtient une session : `client.auth.getUser()`, ou l'identifiant passé par l'appelant. La seconde forme est préférable — une mutation qui interroge l'authentification à chaque appel est une mutation qu'on ne peut pas tester sans simuler l'authentification.

- [ ] **Étape 2 : Écrire, prouver, commiter**

La politique de `campaign_job` filtre sur `requested_by` : un job déposé sans lui serait **refusé par la RLS**, donc l'oubli se verra. C'est un cas rare où la base rattrape le code — le noter, et ne pas s'en remettre à elle pour autant.

---

## Tâche 6 : Le contrôle à deux comptes

**Files:**
- Create: `scripts/verifier-cloisonnement.mjs`

> **C'est le seul contrôle qui prouve le cloisonnement.** Une politique juste sur quinze tables et fausse sur la seizième n'est pas une politique juste, et rien d'autre ne le dira.

- [ ] **Étape 1 : Écrire le script**

Il doit :

1. créer un second compte par `auth.admin.createUser` (ou employer un compte de vérification existant) ;
2. ouvrir une session **avec sa clé anonyme**, pas avec `service_role` — c'est tout l'enjeu ;
3. pour **chacune des seize tables**, compter les lignes visibles ;
4. afficher un tableau, et **sortir en échec** si une seule table rend plus de zéro ligne ;
5. faire la même lecture avec le compte du propriétaire, et vérifier qu'il voit bien **ses** lignes — une politique qui cache tout à tout le monde passerait le contrôle précédent sans rien protéger.

Le point 5 n'est pas une formalité : c'est lui qui distingue « cloisonné » de « cassé ».

- [ ] **Étape 2 : L'exécuter, et le conserver**

Il vit dans `scripts/`, versionné, et se rejoue à chaque chantier qui touche aux politiques.

- [ ] **Étape 3 : Consigner dans le handoff**

Ajouter à `docs/design/HANDOFF.md` : ce que le cloisonnement protège, **et ce qu'il ne protège pas** — le collector, que `service_role` place hors d'atteinte de toute politique, et dont la seule barrière est le filtre de la tâche 4.

---

## JALON — un second compte ne voit rien

- [ ] Lancer `scripts/verifier-cloisonnement.mjs` : seize tables à zéro pour le second compte, et non nulles pour le propriétaire.
- [ ] Ouvrir le dashboard avec le compte du propriétaire : les 18 lignes du lot sont là, et le site de LUCIAN LAZA aussi.
- [ ] Lancer `prospeo discover --trade plombier --postal-code 13013 --owner <second compte>` : il doit ingérer des SIRET **déjà présents** chez le propriétaire, sans conflit. C'est la preuve que l'exception du §7 sert à quelque chose.
- [ ] Vérifier qu'aucune ligne du propriétaire n'a bougé.

---

## Ce que ce plan ne couvre pas

Le coffre à jetons, les intégrations GitHub et Vercel, le worker par utilisateur et son superviseur, la seconde file, l'enrichissement par tranches, le processus de péremption, Google et l'envoi. Voir l'ordre du §7 de [`2026-09-03-multi-utilisateur-design.md`](../specs/2026-09-03-multi-utilisateur-design.md).
