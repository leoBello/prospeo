# Refonte de l'interface — Lot 2 : voir les déploiements, choisir le gabarit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre observable, depuis l'interface, ce que le collector fait aux vingt-deux sites publiés — et permettre de désigner le dépôt GitHub qui leur sert de modèle, sans toucher au code.

**Architecture:** Le lot est **en observation seule** : le dashboard lit, il ne déclenche rien. La décision du chantier n°1 — « Supabase + collector en ligne de commande, sans backend applicatif » — reste entière, et les jetons GitHub et Vercel ne quittent pas le collector. Deux tables neuves portent ce que la base ne savait pas dire : un journal d'événements que le collector écrit à chaque franchissement d'étape, et un réglage que le collector relit au moment de publier. Le dashboard gagne une navigation, deux écrans, et perd une de ses deux zones inertes.

**Tech Stack:** Postgres/Supabase (migrations SQL), TypeScript, React 18.3, Vite, CSS Modules, `@base-ui/react` 1.7, Vitest + Testing Library, jsdom.

## Global Constraints

- **Périmètre :** lot n°2 sur 3. Le lot 3 (gamification, D5) reste bloqué par §4.2 et n'est pas ouvert ici.
- **Observation seule, et c'est une décision, pas une étape.** Aucun écran ne déclenche un déploiement, une publication ou une validation GitHub. Le bouton « Redéployer » de `PanelActions.tsx` **reste inerte sous `Bientot`** ; ne le câblez pas. Le dashboard n'acquiert aucun secret.
- **Référence de conception :** `docs/superpowers/plans/2026-09-02-refonte-ui-ux.md`, décisions D9 et D10. Maquettes : `docs/design/maquettes/Deploiements.dc.html`, `DeploiementDetail.dc.html`, `Gabarit.dc.html`.
- **Le kit du lot 1 est le vocabulaire.** `Badge`, `StatusBadge`, `Tooltip`, `Bientot`, `Card`/`Field`/`Absent`, `EmptyState` existent dans `apps/dashboard/src/ui/kit/`. N'en réinventez aucun ; si l'un manque de quelque chose, étendez-le plutôt que de le doubler.
- **Aucune chaîne en dur.** Tout texte affiché passe par `t()`. Toute clé ajoutée à `src/i18n/fr.ts` doit l'être à `en.ts`, et `i18n.test.ts` porte désormais **un contrôle d'orphelines** : une clé sans consommateur hors tests fait échouer la suite. Une composition dynamique de clé impose d'ajouter sa ligne à la liste d'exceptions du fichier, avec sa raison.
- **Aucune couleur en dur dans un composant.** Uniquement des `var(--…)` de `theme.css`.
- **La couleur n'est jamais le seul indicateur d'un état.** Tout badge porte un mot ; toute pastille porte un `aria-label`.
- **`null` est porteur de sens.** Un satellite absent n'est jamais remplacé par un objet vide ou par des zéros.
- **Imports en `.js`** même pour un fichier `.tsx` (ESM/NodeNext).
- **Commentaires en français, sur le *pourquoi*.**
- **Commandes :** tests dashboard `pnpm --filter @prospeo/dashboard test`, tests collector `pnpm --filter @prospeo/collector test`, types `pnpm -r typecheck`, migrations `pnpm db:push` puis `pnpm db:types`. Depuis la racine du dépôt. Un argument `-- <motif>` **ne restreint pas** le run vitest dans cette configuration.
- **Commit à chaque fin de tâche**, jamais avant que les tests passent.

## Leçon du lot 1, à appliquer ici

Le lot 1 a livré **cinq assertions qui ne pouvaient pas échouer**, et la cause dominante était la même à chaque fois : `getByText` / `queryByText` comparent le texte **entier du nœud** par défaut, si bien que `queryByText('0 salarié')` ne correspondait jamais à un nœud rendant « au moins 0 salarié » — et passait aussi bien sur du code juste que sur du code faux.

Ce plan en tire trois règles, qui priment sur toute facilité :

1. **Ce plan ne dicte pas le texte exact des assertions.** Il dit *ce qui doit être prouvé*. C'est à l'implémenteur de lire la valeur réelle dans `fr.ts` et d'écrire l'assertion en conséquence — quatre fois sur cinq, le défaut venait d'un texte inventé par le plan.
2. **Toute assertion doit être prouvée capable d'échouer**, en cassant temporairement le code, en observant le rouge, puis en restaurant. Le rapport de tâche doit porter la sortie rouge.
3. **Préférez une regex à une chaîne exacte** dès que l'intention est « contient », et `getByRole` avec son nom accessible dès qu'un rôle existe. Attention : `queryByRole` filtre par défaut sur `hidden: false` et **ne voit pas** un contenu monté mais caché.

Le lot 1 a aussi perdu trois faits en silence pendant une réécriture, la suite restant verte à chaque fois. Ici le risque équivalent est de journaliser une étape que le collector ne franchit pas, ou d'en oublier une qu'il franchit : **le journal doit être dérivé du code réel de `publish` et `deploy`, jamais de la maquette.**

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `supabase/migrations/<ts>_deployment_event.sql` | journal d'étapes, une ligne par franchissement | 1 |
| `supabase/migrations/<ts>_site_template.sql` | le gabarit actif, relu par `publish` | 2 |
| `packages/db/src/database.types.ts` | *régénéré* — types des deux tables | 1, 2 |
| `apps/collector/src/stages/events.ts` | écrire un événement, sans jamais faire échouer l'étage | 3 |
| `apps/collector/src/stages/publish.ts` | *modifié* — émet ses événements | 4 |
| `apps/collector/src/cli.ts` | *modifié* — `deploy` émet les siens, `publish` lit le gabarit actif | 5, 6 |
| `apps/dashboard/src/domain/deployment.ts` | vue des déploiements telle que l'écran la consomme | 7 |
| `apps/dashboard/src/data/deployments.ts` | lectures Supabase : événements et gabarit | 7 |
| `apps/dashboard/src/ui/Nav.tsx` + `.module.css` | le rail, et l'écran courant | 8 |
| `apps/dashboard/src/screens/DeploiementsScreen.tsx` + `.module.css` | D9 — le tableau de suivi | 9 |
| `apps/dashboard/src/ui/EtapesPiste.tsx` + `.module.css` | la piste à cinq segments, réutilisée | 9 |
| `apps/dashboard/src/screens/GabaritScreen.tsx` + `.module.css` | D10 — le gabarit actif et son historique | 10 |
| `apps/dashboard/src/ui/panel/HistoriqueTab.tsx` | *modifié* — consomme les vrais événements | 11 |
| `docs/design/HANDOFF.md` | *modifié* — une zone inerte de moins, l'état du lot 3 | 12 |

---

## Task 1: La table des événements de déploiement

**Files:**
- Create: `supabase/migrations/<horodatage>_deployment_event.sql`
- Modify: `packages/db/src/database.types.ts` (régénéré, jamais édité à la main)

**Interfaces:**
- Consomme : `prospect` (clé étrangère).
- Produit : la table `deployment_event` et l'énumération `deployment_step`, sur lesquelles s'appuient les tâches 3 à 11.

**Ce que cette table existe pour dire.** `prospect_site` porte un **état courant** — dépôt, projet, URL, dates. Elle ne dit ni combien de temps une étape a pris, ni pourquoi elle a échoué, ni ce que le build a écrit. Aujourd'hui, quand `deploy` échoue, la cause part sur `stderr` du terminal et **la base n'en garde rien** : l'écran de suivi n'aurait qu'un état final à montrer, ce qui le viderait de son intérêt.

- [ ] **Step 1: Écrire la migration**

Créer le fichier avec un horodatage postérieur à `20260902090000_rejet_redaction.sql` (format `YYYYMMDDHHMMSS`). Contenu :

```sql
-- Chantier n°6, lot 2 — le journal des étapes de déploiement.
--
-- `prospect_site` porte un ÉTAT COURANT : le dépôt, le projet, l'URL, les
-- dates. Elle ne porte pas d'historique, et c'est ce qui manque à l'écran de
-- suivi : ni durée d'étape, ni cause d'échec, ni journal. Aujourd'hui la
-- cause d'un échec part sur `stderr` du terminal, et la base n'en garde rien.
--
-- Une table d'événements plutôt que des colonnes supplémentaires : une étape
-- peut être rejouée, échouer puis réussir, et se répéter à chaque
-- régénération. Ce sont des faits datés qui s'accumulent, pas un état qui
-- s'écrase.

create type deployment_step as enum
  ('redaction', 'depot', 'projet', 'build', 'en_ligne', 'retrait');

create type deployment_outcome as enum ('demarre', 'reussi', 'echoue', 'ignore');

create table deployment_event (
  id           bigint generated always as identity primary key,
  prospect_id  uuid not null references prospect (id) on delete cascade,

  step         deployment_step not null,
  outcome      deployment_outcome not null,

  -- La cause d'échec, telle que l'API ou le build l'a rendue. Nulle sur un
  -- succès. C'est la colonne qui fait exister l'écran : sans elle, une ligne
  -- en échec ne peut dire que « échoué ».
  detail       text,

  -- Durée de l'étape en millisecondes, quand elle est mesurable. Nulle pour
  -- un événement instantané ou pour une étape reprise d'un run précédent.
  duration_ms  integer,

  occurred_at  timestamptz not null default now()
);

-- La lecture de l'écran de suivi : les derniers événements d'un prospect,
-- du plus récent au plus ancien.
create index deployment_event_prospect_idx
  on deployment_event (prospect_id, occurred_at desc);

-- La lecture du tableau : ce qui a bougé récemment, tous prospects confondus.
create index deployment_event_recent_idx
  on deployment_event (occurred_at desc);

alter table deployment_event enable row level security;

-- Même doctrine que les autres tables du socle : le dashboard lit et écrit
-- sous le compte authentifié, le collector écrit avec la clé `service_role`.
create policy authenticated_all on deployment_event
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Appliquer et régénérer les types**

```bash
pnpm db:push
pnpm db:types
```

Expected : `db:push` applique la migration sans erreur ; `db:types` réécrit `packages/db/src/database.types.ts` avec `deployment_event` dans `Tables` et `deployment_step` / `deployment_outcome` dans `Enums`.

**Ne modifiez jamais `database.types.ts` à la main** — il est généré, et une édition manuelle serait écrasée au prochain `db:types`.

- [ ] **Step 3: Vérifier que les types sont exploitables**

```bash
pnpm -r typecheck
```

Expected : PASS. Vérifier ensuite que `Enums<'deployment_step'>` se résout, par exemple en l'important temporairement dans un fichier de test, puis en retirant l'import.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations packages/db/src/database.types.ts
git commit -m "feat(db): le journal des etapes de deploiement

prospect_site porte un etat courant, pas un historique : quand deploy
echoue, la cause part sur stderr et la base n'en garde rien. Une table
d'evenements plutot que des colonnes, parce qu'une etape se rejoue,
echoue puis reussit, et se repete a chaque regeneration."
```

---

## Task 2: La table du gabarit actif

**Files:**
- Create: `supabase/migrations/<horodatage>_site_template.sql`
- Modify: `packages/db/src/database.types.ts` (régénéré)

**Interfaces:**
- Produit : la table `site_template`, lue par la tâche 6 et par l'écran de la tâche 10.

**Ce que `trades.ts` annonçait déjà.** Le commentaire de `templateRepoFor` dit, mot pour mot, que le repli « permettra à une interface de gestion de trancher sans toucher au code ». Cette table est ce que cette phrase attendait.

- [ ] **Step 1: Écrire la migration**

```sql
-- Chantier n°6, lot 2 — le gabarit actif, désigné depuis l'interface.
--
-- `templateRepoFor` (packages/core/src/trades.ts) annonçait déjà ce repli :
-- « permettra à une interface de gestion de trancher sans toucher au code ».
-- L'ordre de résolution ne change pas — le gabarit du métier prime toujours —,
-- cette table s'insère seulement entre lui et la variable d'environnement.

create table site_template (
  -- Table à ligne unique : `id` toujours à 1, contraint. Un réglage global
  -- n'a pas de clé naturelle, et une table sans contrainte laisserait deux
  -- lignes cohabiter sans que rien ne dise laquelle fait foi.
  id                integer primary key generated always as identity,
  constraint site_template_singleton check (id = 1),

  -- « org/nom ». Nul = aucun gabarit désigné, on retombe sur l'environnement.
  repo_full_name    text,
  branch            text not null default 'main',

  -- Verdict du dernier contrôle effectué par le collector. Le dashboard ne
  -- peut pas le produire : il faudrait un jeton GitHub, qui n'a rien à faire
  -- dans un bundle navigateur. L'écran affiche donc le dernier verdict connu
  -- et sa date, jamais un contrôle qu'il aurait fait lui-même.
  checked_at        timestamptz,
  check_ok          boolean,
  check_detail      text,

  updated_at        timestamptz not null default now()
);

alter table site_template enable row level security;
create policy authenticated_all on site_template
  for all to authenticated using (true) with check (true);

-- La ligne unique, créée vide : l'absence de gabarit désigné est un état
-- normal, pas une table vide qu'il faudrait traiter à part dans chaque
-- lecture.
insert into site_template (repo_full_name) values (null);
```

- [ ] **Step 2: Appliquer, régénérer, vérifier**

```bash
pnpm db:push
pnpm db:types
pnpm -r typecheck
```

Expected : PASS, et `site_template` présente dans `Tables`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations packages/db/src/database.types.ts
git commit -m "feat(db): le gabarit actif, designe depuis l'interface

trades.ts annoncait deja ce repli : « permettra a une interface de
gestion de trancher sans toucher au code ». La table s'insere entre le
gabarit du metier, qui prime toujours, et la variable d'environnement."
```

---

## Task 3: Écrire un événement sans jamais faire échouer l'étage

**Files:**
- Create: `apps/collector/src/stages/events.ts`
- Test: `apps/collector/src/stages/events.test.ts`

**Interfaces:**
- Consomme : le client Supabase du collector.
- Produit :
  - `interface EventSink { emit(e: DeploymentEvent): Promise<void> }`
  - `type DeploymentEvent = { prospectId: string; step: Enums<'deployment_step'>; outcome: Enums<'deployment_outcome'>; detail?: string | null; durationMs?: number | null }`
  - `createEventSink(client): EventSink`
  - `NULL_SINK: EventSink` — un puits qui ne fait rien, pour les tests des étages.

**La règle qui gouverne ce fichier.** Journaliser est un **effet de bord d'observation**. Si l'écriture du journal échoue — réseau, RLS, colonne manquante après une migration incomplète — l'étage **ne doit pas s'interrompre** : perdre une ligne de journal est un désagrément, interrompre `publish` au milieu de vingt-deux dépôts en est un autre. L'échec est signalé sur `stderr` et le travail continue.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `apps/collector/src/stages/events.test.ts`. Prouver, avec un client factice (pas de réseau) :

1. `emit` insère bien dans `deployment_event`, avec les champs transmis — assertion sur l'objet réellement passé à l'insertion.
2. **Une erreur d'insertion ne se propage pas** : `emit` résout au lieu de rejeter quand le client rend une erreur. C'est la garantie centrale du fichier ; prouvez-la en faisant rendre une erreur au client factice, et vérifiez qu'aucune exception ne sort.
3. L'échec est **signalé** : quelque chose est écrit sur `stderr`. Un échec silencieux ferait croire à un journal complet.
4. `NULL_SINK.emit` résout sans rien faire et sans client.

Lire `apps/collector/src/stages/publish.test.ts` d'abord : il montre comment ce dépôt fabrique ses doublures de client Supabase. Suivez ce style plutôt que d'en inventer un.

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `pnpm --filter @prospeo/collector test`
Expected: FAIL — module `./events.js` introuvable.

- [ ] **Step 3: Écrire `events.ts`**

Le fichier doit porter, en commentaire français, la raison pour laquelle une erreur d'écriture n'interrompt pas l'étage. Signature exacte donnée dans **Interfaces** ci-dessus.

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `pnpm --filter @prospeo/collector test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/collector/src/stages/events.ts apps/collector/src/stages/events.test.ts
git commit -m "feat(collector): un puits d'evenements qui n'interrompt jamais l'etage

Journaliser est un effet de bord d'observation. Perdre une ligne de
journal est un desagrement ; interrompre publish au milieu de vingt-deux
depots en est un autre. L'echec est signale sur stderr, le travail
continue."
```

---

## Task 4: `publish` émet ses événements

**Files:**
- Modify: `apps/collector/src/stages/publish.ts`
- Modify: `apps/collector/src/stages/publish.test.ts`

**Interfaces:**
- Consomme : `EventSink` (tâche 3).
- Produit : `PublishDeps` gagne un champ `events: EventSink`.

**Dérivez les étapes du code, pas de la maquette.** Lisez `runPublish` en entier avant d'écrire quoi que ce soit. Les étapes que `publish` franchit réellement sont `redaction` (le contenu est prêt et cohérent) et `depot` (le dépôt existe et le contenu y est écrit). `decidePublish` rend `create`, `update` ou `skip` : un `skip` est un `outcome` `ignore`, pas une absence d'événement — savoir qu'un run a délibérément sauté un prospect est une information, et son absence se lirait comme un trou.

Le travail « laissé en plan » que `PublishReport.skipped` compte — éditeur non renseigné, faits incomplets, prose incohérente — doit produire un événement `echoue` dont le `detail` **nomme le motif**. C'est exactement ce que l'écran affichera dans la ligne.

- [ ] **Step 1: Étendre les tests existants**

`publish.test.ts` existe et couvre déjà `runPublish`. Ajoutez-y — sans affaiblir un test existant — la preuve que :
- une création réussie émet `depot` / `reussi` ;
- un `skip` émet `ignore` ;
- un refus pour éditeur non renseigné émet `echoue` avec un `detail` non vide qui nomme le motif ;
- une panne réseau sur GitHub émet `echoue` et **n'interrompt pas** la boucle sur les prospects suivants.

Utilisez un `EventSink` factice qui collecte dans un tableau ; assertez sur ce tableau, pas sur des chaînes affichées.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/collector test`
Expected: FAIL sur les nouveaux tests uniquement.

- [ ] **Step 3: Câbler les émissions**

`events` est **obligatoire** dans `PublishDeps` : un champ optionnel laisserait un appelant l'oublier sans que rien ne le signale, et le journal serait muet pour une moitié des runs sans qu'on sache laquelle. Les tests existants qui construisent des `PublishDeps` passeront `NULL_SINK`.

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `pnpm --filter @prospeo/collector test && pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/collector/src/stages/publish.ts apps/collector/src/stages/publish.test.ts
git commit -m "feat(collector): publish journalise ce qu'il fait et ce qu'il refuse

Un skip est un evenement, pas une absence : savoir qu'un run a
deliberement saute un prospect est une information, et son absence se
lirait comme un trou. Le travail laisse en plan — editeur non
renseigne, faits incomplets — nomme son motif dans le detail."
```

---

## Task 5: `deploy` émet ses événements

**Files:**
- Modify: `apps/collector/src/cli.ts` (le bloc `case 'deploy'`)
- Test: `apps/collector/src/stages/deploy-events.test.ts` (créer)

**Interfaces:**
- Consomme : `EventSink` (tâche 3), `VercelClient`.
- Produit : rien que les tâches suivantes importent ; l'effet est en base.

**Les étapes réelles, telles que le code les franchit.** Relisez `case 'deploy'` dans `cli.ts` avant d'écrire. Il fait, dans cet ordre : créer le projet Vercel s'il n'existe pas (`projet`), amorcer le premier déploiement puis attendre l'URL (`build`), enregistrer l'URL (`en_ligne`). Il porte aussi un **état intermédiaire réel** que la maquette montre : « en construction, à reprendre au prochain run », quand l'URL n'est pas encore là. C'est un `build` / `demarre` sans `reussi` correspondant, et l'écran doit pouvoir l'afficher comme « en cours » plutôt que comme un trou.

Le `catch` compte aujourd'hui `echoue` et écrit sur `stderr`. **C'est cette erreur qu'il faut faire atterrir en base**, dans `detail` — c'est la raison d'être de tout le lot.

**Difficulté à prévoir :** `case 'deploy'` vit dans `cli.ts`, un fichier long et non testé unitairement. Ne testez pas `cli.ts` : **extrayez la boucle** dans `apps/collector/src/stages/deploy.ts` avec une signature injectable (client, client Vercel, puits d'événements), laissez `cli.ts` l'appeler, et testez la fonction extraite. C'est le même patron que `runPublish`. Si l'extraction s'avère plus large que prévu, signalez-le et proposez un découpage plutôt que de tester `cli.ts` en l'état.

- [ ] **Step 1: Écrire les tests qui échouent**

Prouver, avec des doublures de client Supabase et de `VercelClient` :
- un déploiement complet émet `projet`, `build`, `en_ligne`, tous `reussi`, dans cet ordre ;
- un projet déjà créé n'émet pas `projet` une seconde fois ;
- une URL encore absente émet `build` / `demarre` et **n'émet pas** `en_ligne` ;
- une panne Vercel émet `echoue` dont le `detail` contient le message de l'erreur, et **la boucle continue** sur le prospect suivant.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/collector test`
Expected: FAIL — module `./deploy.js` introuvable.

- [ ] **Step 3: Extraire la boucle et câbler les émissions**

`cli.ts` conserve la lecture de configuration, la construction des clients et l'affichage du rapport ; la boucle part dans `deploy.ts`. Le comportement observable de la commande ne doit pas changer — mêmes compteurs, mêmes messages.

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `pnpm --filter @prospeo/collector test && pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/collector/src/stages/deploy.ts apps/collector/src/stages/deploy-events.test.ts apps/collector/src/cli.ts
git commit -m "feat(collector): deploy journalise ses etapes, et ses echecs

La cause d'un echec partait sur stderr et la base n'en gardait rien :
c'est elle qu'on veut lire dans la ligne, pas dans un terminal. La
boucle sort de cli.ts pour devenir testable, sans changer ce que la
commande affiche."
```

---

## Task 6: `publish` lit le gabarit actif

**Files:**
- Modify: `apps/collector/src/cli.ts` (le bloc `case 'publish'`)
- Test: à l'endroit où la résolution est calculée

**Interfaces:**
- Consomme : la table `site_template` (tâche 2), `templateRepoFor` de `@prospeo/core`.
- Produit : rien de nouveau ; `templateRepoDefaut` change seulement de source.

**Ne touchez pas à `templateRepoFor`.** Sa signature `(trade, defaut)` est correcte et son ordre — le métier prime — ne change pas. Seul le **calcul de `defaut`** change : `repo_full_name` de `site_template` s'il est renseigné, sinon `PROSPEO_GITHUB_TEMPLATE_REPO`. Une ligne, à l'endroit où `deps.templateRepoDefaut` est construit.

- [ ] **Step 1: Écrire le test qui échoue**

Prouver les trois branches de la résolution : gabarit du métier présent (il prime, même si la base en désigne un autre) ; métier absent et base renseignée (la base gagne) ; métier absent et base nulle (l'environnement gagne). Écrivez-le sur une petite fonction pure — extrayez-la si nécessaire — plutôt que sur `cli.ts`.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/collector test`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `pnpm --filter @prospeo/collector test && pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/collector/src
git commit -m "feat(collector): publish lit le gabarit actif en base

templateRepoFor ne bouge pas : le metier prime toujours. Seule la
source du repli change, et c'est ce que son commentaire annoncait."
```

---

## Task 7: La couche de lecture du dashboard

**Files:**
- Create: `apps/dashboard/src/domain/deployment.ts`
- Create: `apps/dashboard/src/data/deployments.ts`
- Test: `apps/dashboard/src/domain/deployment.test.ts`

**Interfaces:**
- Consomme : `deployment_event`, `site_template`, `prospect_site`.
- Produit :
  - `interface DeploymentView { prospectId; nom; tradeSlug; city; score: number | null; gabarit: string | null; etat: DeploymentEtat; etapeCourante: Enums<'deployment_step'> | null; detail: string | null; durationMs: number | null; deploymentUrl: string | null; publishedAt: string | null; unpublishedAt: string | null; peremptionDans: number | null }`
  - `type DeploymentEtat = 'jamais' | 'en_cours' | 'echec' | 'en_ligne' | 'retire'`
  - `etatDepuisEvenements(events, site): DeploymentEtat` — **fonction pure, c'est elle que les tests visent**
  - `joursAvantPeremption(publishedAt, maintenant): number | null`
  - `fetchDeployments(client)`, `fetchSiteTemplate(client)`, `fetchEventsFor(client, prospectId)`

**Le cœur de la tâche est une fonction pure.** L'état d'un déploiement se déduit de ses événements et de `prospect_site` ; c'est de l'arithmétique sur des faits, testable sans réseau. Les fonctions de lecture Supabase, elles, restent minces et sans logique.

Règles de dérivation à respecter :
- **`retire`** dès que `unpublishedAt` est renseignée — quel que soit le reste. Une ligne conserve son `deployment_url` après dépublication ; le tester seul afficherait « en ligne » pour un site retiré, ce que le lot 1 a déjà eu à corriger une fois.
- **`en_cours`** quand le dernier événement d'une étape est `demarre` sans `reussi` ni `echoue` postérieur.
- **`echec`** quand le dernier événement est `echoue`, et `detail` porte sa cause.
- **`en_ligne`** quand `deploymentUrl` est présente et `unpublishedAt` nulle.
- **`jamais`** quand aucun événement n'existe et qu'aucune URL n'est enregistrée.
- La péremption compte **90 jours depuis `publishedAt`**, en dates civiles — pas en tranches de 24 h. `domain/today.ts` porte déjà `joursCivils` : lisez-la et réutilisez sa méthode plutôt que de soustraire des millisecondes, sinon un site publié hier à 23 h afficherait un jour de moins qu'il n'en reste.

- [ ] **Step 1: Écrire les tests qui échouent**

Couvrir les cinq états, la précédence de `retire` sur tous les autres, et la péremption — y compris le cas d'un `publishedAt` nul, qui rend `null` et non `90`.

- [ ] **Step 2: Lancer, vérifier l'échec** — Run: `pnpm --filter @prospeo/dashboard test`

- [ ] **Step 3: Implémenter le domaine, puis les lectures**

- [ ] **Step 4: Lancer, vérifier le succès** — Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/domain/deployment.ts apps/dashboard/src/domain/deployment.test.ts apps/dashboard/src/data/deployments.ts
git commit -m "feat(dashboard): deriver l'etat d'un deploiement de ses evenements

Une fonction pure : l'etat se deduit des faits dates et de
prospect_site. « Retire » prime sur tout — une ligne conserve son
deployment_url apres depublication, et le tester seul afficherait « en
ligne » pour un site retire."
```

---

## Task 8: La navigation

**Files:**
- Create: `apps/dashboard/src/ui/Nav.tsx`, `apps/dashboard/src/ui/Nav.module.css`
- Modify: `apps/dashboard/src/ui/AppShell.tsx`, `AppShell.module.css`
- Modify: `apps/dashboard/src/App.tsx`
- Test: `apps/dashboard/src/ui/Nav.test.tsx`

**Interfaces:**
- Produit : `type Vue = 'today' | 'deploiements' | 'gabarit'`, `useVue(): { vue: Vue; aller: (v: Vue) => void }`, `Nav({ vue, aller })`.

**Pourquoi pas de routeur.** L'application a trois écrans et deux dépendances applicatives. Ajouter `react-router` pour trois vues coûterait plus en surface qu'il ne rapporte. **Mais l'état en mémoire seul ne suffit pas** : un rechargement ramènerait sur « Aujourd'hui », et un lien vers l'écran de déploiement serait impossible à donner. La vue vit donc dans le **fragment d'URL** (`#/deploiements`), lu au montage et écrit à chaque changement, avec écoute de `hashchange` pour que les boutons Précédent/Suivant du navigateur fonctionnent.

Un fragment inconnu retombe sur `today` sans erreur : une URL erronée ne doit pas produire un écran blanc.

**Le rail de la maquette est vertical, à icônes,** avec une infobulle par entrée (`Main.dc.html`). `AppShell` porte aujourd'hui un `<nav>` horizontal à un seul bouton en dur ; c'est lui que `Nav` remplace. Les icônes sont des SVG dessinés en ligne — **jamais d'emoji ni de glyphe dingbat** — sur une grille de 20 px, au trait, d'un style unique.

- [ ] **Step 1: Écrire les tests qui échouent**

Prouver : la vue initiale suit le fragment d'URL ; un fragment inconnu retombe sur `today` ; cliquer une entrée change la vue **et** le fragment ; un `hashchange` externe change la vue ; l'entrée active est marquée autrement que par la couleur (`aria-current`), et chaque entrée porte un nom accessible malgré son icône seule.

- [ ] **Step 2: Lancer, vérifier l'échec** — Run: `pnpm --filter @prospeo/dashboard test`

- [ ] **Step 3: Implémenter**

`AppShell` prend `nav` en `ReactNode`, comme il prend déjà `list` et `panel` : la coquille ne doit pas connaître la liste des vues.

- [ ] **Step 4: Lancer, vérifier le succès** — Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`

Vérifier que les tests existants de `TodayScreen` passent toujours : ils montent `AppShell` indirectement.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/ui/Nav.tsx apps/dashboard/src/ui/Nav.module.css apps/dashboard/src/ui/Nav.test.tsx apps/dashboard/src/ui/AppShell.tsx apps/dashboard/src/ui/AppShell.module.css apps/dashboard/src/App.tsx
git commit -m "feat(dashboard): un rail de navigation, sans routeur

Trois ecrans ne justifient pas react-router. Mais l'etat en memoire
seul ramenerait sur Aujourd'hui a chaque rechargement et rendrait tout
lien impossible : la vue vit dans le fragment d'URL, et hashchange
rebranche les boutons Precedent et Suivant du navigateur."
```

---

## Task 9: L'écran de suivi des déploiements (D9)

**Files:**
- Create: `apps/dashboard/src/ui/EtapesPiste.tsx`, `EtapesPiste.module.css`
- Create: `apps/dashboard/src/screens/DeploiementsScreen.tsx`, `.module.css`
- Test: `apps/dashboard/src/ui/EtapesPiste.test.tsx`, `apps/dashboard/src/screens/DeploiementsScreen.test.tsx`

**Interfaces:**
- Consomme : `DeploymentView`, `DeploymentEtat` (tâche 7), le kit du lot 1.
- Produit : `EtapesPiste({ etape, etat })`, `DeploiementsScreen({ deployments })`.

**Maquette :** `docs/design/maquettes/Deploiements.dc.html`. Elle porte la bande de quatre chiffres, les filtres, le tableau, et la piste à cinq segments.

**Deux partis pris de D9 qui ne sont pas décoratifs :**
- **Une ligne en échec porte sa cause dans la ligne**, pas dans un journal qu'il faut ouvrir. Le journal reste accessible, mais on ne doit pas avoir à l'ouvrir pour savoir ce qui s'est passé.
- **Le compteur de péremption à 90 jours est un indicateur de premier rang**, parce que c'est une obligation issue de D5 du chantier n°4 — un site publié au nom d'un tiers est retiré automatiquement —, pas une statistique d'usage.

**Sur la piste à segments :** l'état d'un segment se dit par sa forme **et** par le texte de la ligne, jamais par la seule couleur. La piste entière porte un `aria-label` qui nomme l'étape et l'état. L'animation du segment en cours doit être **désactivée** sous `prefers-reduced-motion` — `theme.css` porte déjà la règle globale, vérifiez qu'elle s'y applique.

**Un vide nommé, pas une page blanche :** aucun déploiement du tout, ou aucun dans le filtre courant, se dit avec `EmptyState`.

- [ ] **Step 1: Écrire les tests qui échouent**

Prouver, au minimum : les cinq états rendent des libellés distincts ; une ligne en échec affiche sa cause dans la ligne ; un site retiré n'affiche pas de lien vers son URL ; le compteur de péremption apparaît quand elle approche et pas autrement ; un filtre vide rend un `EmptyState`. Lisez les valeurs réelles de `fr.ts` avant d'écrire vos assertions — n'inventez pas de texte.

- [ ] **Step 2: Lancer, vérifier l'échec** — Run: `pnpm --filter @prospeo/dashboard test`

- [ ] **Step 3: Ajouter les clés i18n** (fr **et** en), puis implémenter

- [ ] **Step 4: Lancer, vérifier le succès** — Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/ui/EtapesPiste.tsx apps/dashboard/src/ui/EtapesPiste.module.css apps/dashboard/src/ui/EtapesPiste.test.tsx apps/dashboard/src/screens/DeploiementsScreen.tsx apps/dashboard/src/screens/DeploiementsScreen.module.css apps/dashboard/src/screens/DeploiementsScreen.test.tsx apps/dashboard/src/i18n
git commit -m "feat(dashboard): l'ecran de suivi des deploiements

Cinq etapes, dans l'ordre reel du code. Une ligne en echec porte sa
cause dans la ligne : le journal reste accessible, mais on ne doit pas
avoir a l'ouvrir pour savoir ce qui s'est passe. La peremption a 90
jours est un indicateur de premier rang — c'est une obligation, pas une
statistique."
```

---

## Task 10: L'écran du gabarit (D10)

**Files:**
- Create: `apps/dashboard/src/screens/GabaritScreen.tsx`, `.module.css`
- Test: `apps/dashboard/src/screens/GabaritScreen.test.tsx`

**Interfaces:**
- Consomme : `fetchSiteTemplate` (tâche 7), le kit du lot 1.
- Produit : `GabaritScreen({ template, trades, onDesigner })`.

**Maquette :** `docs/design/maquettes/Gabarit.dc.html`. **Elle est en avance sur ce lot, et c'est délibéré.**

**Ce que l'écran fait, et ce qu'il ne fait pas.** Il **enregistre** le dépôt désigné — une écriture en base, sans secret, que la RLS autorise. Il **n'exécute aucun contrôle** : vérifier qu'un dépôt est accessible, marqué « template », et qu'il contient `src/content/site.json` exige un jeton GitHub, qui n'a rien à faire dans un bundle navigateur. L'écran affiche donc **le dernier verdict connu et sa date** (`checked_at`, `check_ok`, `check_detail`), et le bouton « Vérifier » de la maquette **reste inerte sous `Bientot`**, avec pour raison que le contrôle est fait par le collector à son prochain passage.

L'ordre de résolution doit être **affiché**, pas seulement implémenté : métier, puis gabarit actif, puis variable d'environnement. C'est l'infobulle de la maquette, et c'est ce qui évite qu'on se demande pourquoi un plombier n'a pas reçu le gabarit qu'on vient de désigner.

**Portée du changement, à dire à l'écran :** changer de gabarit n'affecte que les déploiements à venir ; les sites déjà en ligne conservent le modèle avec lequel ils ont été construits.

**Toute nouvelle zone inerte doit gagner sa ligne dans `docs/design/HANDOFF.md`** — c'est la règle du lot 1, et la tâche 12 vérifiera qu'elle a été tenue.

- [ ] **Step 1: Écrire les tests qui échouent**

Prouver : le gabarit actif s'affiche avec sa branche et la date de son dernier contrôle ; un gabarit non désigné se dit comme un état nommé, pas comme un champ vide ; un verdict de contrôle en échec affiche son `check_detail` ; l'ordre de résolution est accessible ; le bouton « Vérifier » est inerte et dit pourquoi ; les exceptions par métier lisent `trades.ts` et non une liste recopiée.

- [ ] **Step 2: Lancer, vérifier l'échec** — Run: `pnpm --filter @prospeo/dashboard test`

- [ ] **Step 3: Ajouter les clés i18n** (fr **et** en), puis implémenter

- [ ] **Step 4: Lancer, vérifier le succès** — Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/screens/GabaritScreen.tsx apps/dashboard/src/screens/GabaritScreen.module.css apps/dashboard/src/screens/GabaritScreen.test.tsx apps/dashboard/src/i18n
git commit -m "feat(dashboard): designer le gabarit sans toucher au code

L'ecran enregistre le depot choisi et affiche le dernier verdict connu.
Il ne verifie rien lui-meme : il faudrait un jeton GitHub, qui n'a rien
a faire dans un bundle navigateur. L'ordre de resolution est affiche,
pas seulement implemente."
```

---

## Task 11: L'onglet Historique consomme les vrais événements

**Files:**
- Modify: `apps/dashboard/src/ui/panel/HistoriqueTab.tsx`
- Modify: `apps/dashboard/src/ui/panel/HistoriqueTab.test.tsx`

**Interfaces:**
- Consomme : `fetchEventsFor` (tâche 7).

**C'est la tâche qui retire une zone inerte.** `HistoriqueTab` affiche aujourd'hui les seules dates que `prospect_site` porte, et annonce le journal pas-à-pas sous `Bientot` — parce qu'aucune table d'événements n'existait. Elle existe maintenant.

Remplacez la zone inerte par la frise réelle : un événement par ligne, avec son étape, son issue, sa durée quand elle est connue, et sa cause quand elle a échoué. **Conservez les jalons de `prospect_site`** — ils portent des faits que les événements ne rejouent pas pour les sites déployés avant cette migration.

**Attention au cas le plus fréquent :** les vingt-deux sites déjà en ligne n'ont **aucun événement**, puisque la table vient d'être créée. Une frise vide pour eux serait une régression par rapport à l'existant. Traitez ce cas explicitement — les jalons restent, et l'absence d'événements se dit comme un fait daté (« journal ouvert le … »), pas comme un vide.

- [ ] **Step 1: Écrire les tests qui échouent**

Prouver : les événements s'affichent avec étape, issue et durée ; un échec affiche sa cause ; un prospect sans événement mais avec des jalons affiche toujours ses jalons ; le marqueur `Bientot` a disparu de ce composant.

- [ ] **Step 2: Lancer, vérifier l'échec** — Run: `pnpm --filter @prospeo/dashboard test`

- [ ] **Step 3: Implémenter**

- [ ] **Step 4: Lancer, vérifier le succès** — Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/ui/panel/HistoriqueTab.tsx apps/dashboard/src/ui/panel/HistoriqueTab.test.tsx
git commit -m "feat(dashboard): l'historique montre les vraies etapes

La zone annoncee par Bientot au lot 1 avait sa table depuis la tache 1.
Les jalons de prospect_site restent : les vingt-deux sites deployes
avant cette migration n'ont aucun evenement, et une frise vide serait
une regression."
```

---

## Task 12: Le handoff, et le recensement des zones inertes

**Files:**
- Modify: `docs/design/HANDOFF.md`

- [ ] **Step 1: Recenser les usages réels de `Bientot`**

```bash
grep -rn "Bientot" apps/dashboard/src --include=*.tsx | grep -v "kit/Bientot" | grep -v ".test."
```

Attendu : le bouton « Redéployer » de `PanelActions.tsx` (conservé, décision de ce lot), plus le bouton « Vérifier » de `GabaritScreen.tsx` (tâche 10). Celui de `HistoriqueTab.tsx` doit avoir disparu. **Toute occurrence supplémentaire doit gagner sa ligne dans le tableau** — c'est la règle posée au lot 1.

- [ ] **Step 2: Mettre à jour le document**

Il doit dire, à la fin de ce lot : ce qui est en place ; les zones inertes restantes **avec leur motif et ce qui les débloque** ; que le déclenchement depuis l'interface est un **choix** de ce lot, pas un oubli — l'architecture « sans backend applicatif » du chantier n°1 le gouverne, et une file d'attente en base est la piste retenue si le besoin se confirme ; et l'état de la question ouverte du lot 3, qui n'a pas bougé.

**Ne réécrivez pas le tableau des pertes du lot 1** — il porte un avertissement (« ne pas lire ce tableau comme clos ») qui vaut toujours. Ajoutez-y une ligne si ce lot a fait tomber quelque chose.

- [ ] **Step 3: Vérifier que rien n'est cassé**

Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/collector test && pnpm -r typecheck`
Expected: PASS partout.

- [ ] **Step 4: Commit**

```bash
git add docs/design/HANDOFF.md
git commit -m "docs: le handoff du lot 2

Une zone inerte de moins, une de plus, et la raison de la seconde : le
declenchement depuis l'interface est un choix d'architecture, pas un
oubli."
```

---

## Auto-revue

**Couverture des décisions.** D9 → tâches 1, 3, 4, 5, 7, 9, 11. D10 → tâches 2, 6, 10. §4.1 du chantier n°6 → tâche 1. La navigation, absente du chantier n°6 parce qu'un seul écran existait, → tâche 8. **D5 (gamification) reste hors périmètre**, bloquée par §4.2.

**Cohérence des types.** `EventSink` est défini tâche 3 et consommé tâches 4, 5. `DeploymentEtat` et `DeploymentView` sont définis tâche 7 et consommés tâches 9, 11. `Vue` est défini tâche 8 et consommé par `App.tsx`. `templateRepoFor` ne change pas de signature.

**Trois points de vigilance à l'exécution :**

1. **Les tâches 1 et 2 touchent la base réelle.** `pnpm db:push` applique à l'instance liée ; il n'y a pas d'environnement de recette. Les deux migrations sont purement additives — création de tables et de types, aucune modification de colonne existante — mais relisez-les avant de les appliquer.
2. **La tâche 5 extrait du code de `cli.ts`**, fichier long et non testé unitairement. Le comportement observable de la commande ne doit pas changer. Si l'extraction déborde, signalez-le plutôt que de tester `cli.ts` en l'état.
3. **Les vingt-deux sites déjà en ligne n'ont aucun événement.** C'est le cas le plus fréquent à l'ouverture des écrans, pas un cas limite : les tâches 9 et 11 doivent le traiter explicitement, sous peine d'un écran qui paraît cassé le jour de la livraison.

---

## Handoff d'exécution

Plan complet, enregistré dans `docs/superpowers/plans/2026-09-02-refonte-ui-lot-2.md`. Deux façons de l'exécuter :

1. **Par sous-agents (recommandé)** — un agent neuf par tâche, revue entre chaque, itération rapide.
2. **En ligne dans la session** — exécution par lots avec points de contrôle.
