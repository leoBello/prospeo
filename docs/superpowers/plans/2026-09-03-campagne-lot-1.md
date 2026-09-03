# Campagne de prospection — lot 1 : la file, le worker, l'écran, le déclenchement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qu'un clic sur « Déployer » dans le dashboard mette un site en ligne, et que l'écran le montre avancer — sans qu'aucun secret n'entre dans le bundle navigateur.

**Architecture :** Le dashboard écrit une ligne dans `campaign_job` ; un collector résident (`prospeo worker`) l'écoute par Supabase Realtime, enchaîne les quatre étages existants (`runGenerate` → `runPublish` → `runDeploy` → `runPitch`) et journalise dans `deployment_event` ; l'écran suit en Realtime. Aucun backend applicatif, conformément à la décision du chantier n°1.

**Tech Stack :** Postgres/Supabase (migrations SQL, RLS, Realtime), Node + tsx (collector), React 18 + Vite + TypeScript + CSS Modules (dashboard), Vitest.

**Spec de référence :** [`docs/superpowers/specs/2026-09-03-campagne-prospection-design.md`](../specs/2026-09-03-campagne-prospection-design.md)
**Maquettes contraignantes :** [`Campagne.dc.html`](../../design/maquettes/Campagne.dc.html), [`CampagneEtats.dc.html`](../../design/maquettes/CampagneEtats.dc.html)

**Périmètre de ce plan :** lots 0 à 3 du §13 du spec, jusqu'au jalon. **Pas dans ce plan :** la connexion Google et l'envoi (lot 2 du découpage), l'étage `contacts`, la campagne de 10, le mode auto, le détail au clic.

---

## Global Constraints

Ces règles valent pour **chaque** tâche. Elles viennent de `CLAUDE.md` et de `docs/design/GUIDELINES.md`, qui priment sur toute facilité.

- **Tout est en français** : code, commentaires, tests, interface, documentation. Les commentaires disent le *pourquoi*, jamais le *quoi*.
- **Imports en `.js`** même depuis un `.tsx` (ESM/NodeNext).
- **Aucune chaîne affichée en dur** : tout passe par `t()`, présent dans `src/i18n/fr.ts` **et** `en.ts`. Une clé sans consommateur hors tests fait échouer la suite.
- **Le texte d'une assertion se lit dans `fr.ts`, jamais ne s'invente — pas même depuis ce plan.** Quand une étape demande d'asserter un libellé, ouvrir `fr.ts`, lire la valeur, la copier. Aux lots précédents, quatre assertions mortes sur cinq venaient d'un texte inventé.
- **Aucune couleur en dur** : uniquement des `var(--…)` de `ui/theme.css`.
- **La couleur n'est jamais le seul indicateur d'un état** : tout badge porte un mot, toute pastille un `aria-label`.
- **Une absence se nomme, jamais elle ne se vide**, et des absences de natures différentes restent distinctes.
- **`null` est porteur de sens.** Un prospect sans score n'est pas un prospect à zéro.
- **Ne jamais construire une affordance qui annonce un fait qu'aucun code ne peut rendre vrai.**
- **N'écris jamais un test qui prétend voir une mise en page.** `jsdom` ne calcule ni largeur, ni hauteur, ni débordement. C'est le domaine des deux artboards approuvés.
- **`supabase/migrations/` s'applique à une instance réelle**, sans environnement de recette. Une migration se relit instruction par instruction avant `pnpm db:push`, et **rien ne modifie ni ne supprime un objet existant**.
- **`packages/db/src/database.types.ts` est généré** — jamais édité à la main.
- **Un argument `-- <motif>` ne restreint PAS un run vitest** dans cette configuration : la suite entière s'exécute quoi qu'il arrive. Les commandes ci-dessous lancent donc la suite entière, et **il ne faut jamais prétendre avoir lancé un sous-ensemble.**
- **Toute assertion doit être prouvée capable d'échouer** : casser le code qu'elle couvre, observer le rouge, restaurer, observer le vert.

### Les `REMPLACER PAR LA VALEUR LUE DANS fr.ts`

Neuf tests de ce plan portent ce littéral à la place d'une chaîne attendue. **Ce ne sont pas des trous laissés par négligence** : c'est la seule façon d'honorer deux règles qui se contredisent. Un plan complet devrait montrer l'assertion en entier ; la règle du dépôt interdit qu'un texte d'assertion vienne d'un plan plutôt que du catalogue.

La règle du dépôt gagne, parce qu'elle est née d'un dégât mesuré : **quatre assertions mortes sur cinq**, aux lots précédents, venaient d'un texte recopié depuis un plan et jamais confronté à `fr.ts`. Un test qui compare une chaîne inventée à une chaîne inventée passe au vert sans rien garder.

Chaque littéral se remplace donc en ouvrant `apps/dashboard/src/i18n/fr.ts` et en lisant la valeur. Un test qui garde le littéral **échoue** — c'est voulu : il ne doit pas être possible de l'oublier.
- Pièges de cette suite : `getByText`/`queryByText` comparent le texte **entier du nœud** ; `queryByRole` filtre par défaut sur `hidden: false` ; `getAllByText` **lève** à zéro correspondance, donc un `.length > 0` qui suit ne teste rien.

### Commandes, depuis la racine

```
pnpm --filter @prospeo/dashboard test     # suite du dashboard, entière
pnpm --filter @prospeo/collector test     # suite du collector, entière
pnpm -r typecheck                          # types, tous paquets
pnpm db:push                               # applique les migrations à l'instance RÉELLE
pnpm db:types                              # régénère packages/db/src/database.types.ts
```

---

## File Structure

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260903090000_campagne_file.sql` | `campaign`, `campaign_job`, `worker_heartbeat`, et la publication Realtime |
| `supabase/migrations/20260903091000_prospect_contact.sql` | le destinataire et son origine |
| `supabase/migrations/20260903092000_message_send.sql` | l'envoi et sa garantie d'unicité |
| `apps/collector/src/chaine.ts` | construit les `Deps` des quatre étages — **une seule fois**, pour la CLI et le worker |
| `apps/collector/src/chaine.test.ts` | prouve que la chaîne enchaîne dans l'ordre et s'arrête au premier échec |
| `apps/collector/src/stages/file.ts` | prendre un job, le clore, battre le cœur |
| `apps/collector/src/stages/file.test.ts` | la prise concurrente, la reprise d'un orphelin |
| `apps/dashboard/src/domain/campagne.ts` | éligibilité (D3) et dérivation des trois segments — **aucun accès réseau** |
| `apps/dashboard/src/domain/campagne.test.ts` | le cœur testable de l'écran |
| `apps/dashboard/src/data/campagne.ts` | les lectures Supabase |
| `apps/dashboard/src/data/campagne.test.ts` | mise en forme, et échec de lecture ≠ résultat vide |
| `apps/dashboard/src/data/useCampagne.ts` | branchement React + abonnement Realtime |
| `apps/dashboard/src/screens/CampagneScreen.tsx` | l'écran |
| `apps/dashboard/src/screens/CampagneScreen.module.css` | sa mise en page |
| `apps/dashboard/src/screens/CampagneScreen.test.tsx` | états, absences, actions |
| `apps/dashboard/src/ui/BandeConditions.tsx` | worker et compte d'envoi, à côté des boutons qu'ils gouvernent |
| `apps/dashboard/src/ui/BandeConditions.module.css` | — |
| `apps/dashboard/src/ui/BandeConditions.test.tsx` | un bouton éteint porte sa raison |
| `apps/dashboard/src/ui/PisteCampagne.tsx` | les trois segments Site · Mail · Envoi |
| `apps/dashboard/src/ui/PisteCampagne.module.css` | — |
| `apps/dashboard/src/ui/PisteCampagne.test.tsx` | bloqué ≠ échoué ≠ vide |

**Modifiés :**

| Fichier | Ce qui change |
|---|---|
| `apps/collector/src/cli.ts` | les cas `publish`/`deploy`/`generate`/`pitch` consomment `chaine.ts` ; nouvelle commande `worker` |
| `apps/dashboard/src/ui/Nav.tsx` | une quatrième vue, `campagne` |
| `apps/dashboard/src/ui/Nav.test.tsx` | la quatrième entrée |
| `apps/dashboard/src/App.tsx` | branche `CampagneScreen` |
| `apps/dashboard/src/data/mutations.ts` | `deposerJob`, `retirerJob` |
| `apps/dashboard/src/data/mutations.test.ts` | leurs tests |
| `apps/dashboard/src/i18n/fr.ts` et `en.ts` | les clés de l'écran |
| `packages/db/src/database.types.ts` | **régénéré**, jamais édité |
| `docs/design/HANDOFF.md` | ce que ce lot a livré, et ce qui reste inerte |

**Pourquoi `chaine.ts` existe.** Le câblage des `Deps` de `runPublish` et `runDeploy` vit aujourd'hui **en ligne dans les `case` de `cli.ts`** (~130 lignes chacun). Le worker a besoin exactement du même. Le recopier créerait un dialecte, et une correction n'atterrirait que d'un côté. L'extraction est donc une condition du lot, pas un embellissement.

---

## Tâche 1 : Les trois migrations, et les types régénérés

**Files:**
- Create: `supabase/migrations/20260903090000_campagne_file.sql`
- Create: `supabase/migrations/20260903091000_prospect_contact.sql`
- Create: `supabase/migrations/20260903092000_message_send.sql`
- Modify (généré) : `packages/db/src/database.types.ts`

**Interfaces:**
- Consumes: rien.
- Produces: les tables `campaign`, `campaign_job`, `worker_heartbeat`, `prospect_contact`, `message_send` ; les types `Enums<'campaign_job_state'>`, `Enums<'campaign_state'>`, `Enums<'campaign_job_kind'>`, `Enums<'contact_origin'>`, `Enums<'send_state'>` ; `Tables<'campaign_job'>` et consorts.

> **Pas de TDD ici, et c'est délibéré :** il n'y a pas d'instance de recette. Le contrôle est la relecture instruction par instruction, puis la régénération des types — qui échoue si le schéma n'est pas ce qu'on croit.

- [ ] **Étape 1 : Écrire la migration de la file**

Créer `supabase/migrations/20260903090000_campagne_file.sql` :

```sql
-- Chantier n°7, lot 1 — la file de travail du dashboard, et le worker qui la
-- draine.
--
-- POURQUOI UNE FILE, ET PAS UN APPEL DIRECT. Le dashboard n'appelle ni GitHub
-- ni Vercel : ce sont des secrets, et la décision d'architecture du chantier
-- n°1 (« Supabase + collector, sans backend applicatif ») les tient hors du
-- bundle navigateur. Le dashboard dépose donc une DEMANDE, que le collector
-- exécute. C'est la piste que `HANDOFF.md` avait identifiée, et elle prolonge
-- le modèle existant au lieu d'y ajouter une exception.

-- L'état d'un lot. 'suspendue' n'est pas 'annulee' : suspendre garde les jobs
-- en attente pour une reprise, annuler les abandonne. Deux gestes distincts,
-- deux valeurs.
create type campaign_state as enum ('en_cours', 'suspendue', 'terminee', 'annulee');

-- Une énumération à une seule valeur aujourd'hui, et non un booléen ni un
-- texte libre : la deuxième valeur ('redaction_seule', pour régénérer un mail
-- sans retoucher au site) est probable, et l'idiome du dépôt est
-- l'énumération (`pipeline_status`, `deployment_step`, `pipeline_event_origin`).
create type campaign_job_kind as enum ('chaine');

create type campaign_job_state as enum
  ('en_attente', 'en_cours', 'termine', 'echoue', 'annule');

create table campaign (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,
  size           integer not null,

  -- L'envoi automatique vit sur LA CAMPAGNE, jamais dans une préférence
  -- utilisateur. Un réglage global survivrait au lot qui l'a justifié et
  -- s'appliquerait au suivant sans que personne le redemande — or ce réglage
  -- rouvre D6 du chantier n°4 (« le système rédige, l'humain envoie »), ce
  -- qui ne doit jamais arriver par héritage silencieux.
  --
  -- Écrit dès ce lot bien que le mode auto n'y soit pas construit : la
  -- colonne appartient à la forme de la table, et l'ajouter plus tard
  -- demanderait une seconde migration sur une table qui n'a pas bougé.
  auto_send      boolean not null default false,
  auto_send_at   timestamptz,

  state          campaign_state not null default 'en_cours',
  created_by     uuid,
  created_at     timestamptz not null default now()
);

create table campaign_job (
  id            bigint generated always as identity primary key,

  -- Nul quand la demande ne vient pas d'une campagne : « Déployer la
  -- sélection » traite des lignes cochées sans créer de lot.
  campaign_id   uuid references campaign (id) on delete set null,

  prospect_id   uuid not null references prospect (id) on delete cascade,
  kind          campaign_job_kind not null default 'chaine',
  state         campaign_job_state not null default 'en_attente',

  attempts      integer not null default 0,
  last_error    text,

  -- NULLABLE, ET LE TOTAL D'UNE CAMPAGNE DOIT LE DIRE. Si un étage ne rend
  -- pas son coût, la somme est PARTIELLE : l'afficher comme un total exact
  -- sous-déclarerait la dépense. Un chiffre faux est pire qu'un chiffre
  -- annoncé incomplet.
  cost_eur      numeric,

  requested_by  uuid,
  requested_at  timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

-- Le drainage : le plus ancien en attente d'abord.
create index campaign_job_file_idx
  on campaign_job (state, requested_at);

-- La bande de campagne, qui compte par lot.
create index campaign_job_campaign_idx
  on campaign_job (campaign_id);

-- UN SEUL JOB ACTIF PAR PROSPECT. Sans cet index, deux clics rapides
-- déposeraient deux chaînes sur le même dépôt GitHub, et le second échouerait
-- sur un nom déjà pris — un échec fabriqué par l'interface elle-même.
-- Partiel : un prospect peut avoir autant de jobs terminés qu'on veut.
create unique index campaign_job_actif_unique
  on campaign_job (prospect_id)
  where state in ('en_attente', 'en_cours');

-- Le worker est-il vivant ?
--
-- Sans cette table, un worker mort produirait des demandes qui s'empilent en
-- silence, et l'écran afficherait un bouton « Déployer » qui ne déploie rien
-- — exactement l'affordance que la doctrine interdit.
--
-- Ligne unique, sur le patron de `site_template` (chantier n°10).
create table worker_heartbeat (
  id         boolean primary key default true,
  beat_at    timestamptz not null,
  version    text,
  -- Combien de jobs le worker tient en ce moment : ce qui permet à l'écran de
  -- distinguer « à l'écoute, au repos » de « à l'écoute, occupé ».
  in_flight  integer not null default 0,
  constraint worker_heartbeat_singleton check (id)
);

-- Amorçage avec un battement VOLONTAIREMENT ANCIEN : tant qu'aucun worker
-- n'a tourné, l'écran doit lire « à l'arrêt », ce qui est la vérité. Une date
-- à `now()` ferait croire à un worker vivant dès la migration.
insert into worker_heartbeat (id, beat_at) values (true, now() - interval '1 day');

alter table campaign          enable row level security;
alter table campaign_job      enable row level security;
alter table worker_heartbeat  enable row level security;

-- Même doctrine que le reste du socle : le dashboard lit et écrit sous le
-- compte authentifié, le collector écrit avec la clé `service_role`, qui
-- contourne RLS nativement.
create policy authenticated_all on campaign
  for all to authenticated using (true) with check (true);
create policy authenticated_all on campaign_job
  for all to authenticated using (true) with check (true);
create policy authenticated_all on worker_heartbeat
  for all to authenticated using (true) with check (true);

-- REALTIME. Sans cet ajout, `postgres_changes` ne rend rien et l'écran
-- reste figé jusqu'à un rechargement manuel — le worker, lui, ne serait
-- jamais réveillé par un dépôt et n'avancerait qu'au balayage périodique.
--
-- `alter publication ... add table` n'altère NI ne supprime la table :
-- il l'ajoute à un flux. `deployment_event` existe depuis le lot 2 du
-- chantier n°6 et n'est pas modifiée ici.
--
-- GARDÉ, ET NON NU : l'état de `supabase_realtime` n'est pas connaissable
-- depuis ce dépôt. `deployment_event` a pu être ajoutée à la publication
-- depuis l'interface Supabase — aucune migration ne la manipule — et
-- `add table` sur une table déjà membre lève une erreur qui ferait échouer
-- la migration ENTIÈRE, sur une instance de production sans retour en
-- arrière. Deux autres cas nus lèveraient de même : la publication peut ne
-- pas exister du tout, ou avoir été créée `for all tables`, auquel cas y
-- ajouter une table nommée est refusé alors qu'elle y est déjà de fait.
do $$
declare
  nom_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication
       where pubname = 'supabase_realtime' and puballtables
     )
  then
    foreach nom_table in array array['campaign_job', 'deployment_event']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = nom_table
      ) then
        execute format('alter publication supabase_realtime add table %I', nom_table);
      end if;
    end loop;
  end if;
end $$;
```

- [ ] **Étape 2 : Écrire la migration du destinataire**

Créer `supabase/migrations/20260903091000_prospect_contact.sql` :

```sql
-- Chantier n°7, lot 1 — l'adresse email du prospect.
--
-- LE BLOCAGE QUE CETTE TABLE LÈVE. Aucune table du schéma ne portait
-- d'adresse email : `prospect_enrichment` a `phone_e164`, `declared_url` et
-- `social_urls`, et Google Maps n'en donne pas. Un bouton « Envoyer » sans
-- destinataire est exactement l'affordance que la doctrine interdit.
--
-- Une table plutôt que des colonnes sur `prospect`, même parti que
-- `prospect_enrichment` et `web_presence` : la population concernée est une
-- minorité, et un prospect sans adresse n'a aucune raison de porter cinq
-- colonnes nulles.

-- L'ORIGINE EST UNE ÉNUMÉRATION, PAS UN BOOLÉEN. Une adresse relevée par un
-- robot et une adresse vérifiée par un humain ne sont pas le même fait, et ce
-- qu'on engage en écrivant à l'une n'est pas ce qu'on engage avec l'autre :
-- l'écran doit pouvoir le dire. Une troisième origine (import, correction
-- après rebond) est plus probable qu'un `is_manual` ne le laisserait croire —
-- même raison que `pipeline_event_origin` (lot 3, chantier n°6).
create type contact_origin as enum ('collecte', 'saisie');

create table prospect_contact (
  prospect_id  uuid primary key references prospect (id) on delete cascade,

  email        text not null,
  origin       contact_origin not null,

  -- Où l'adresse a été relevée. Nul pour une saisie manuelle : ce n'est pas
  -- une information manquante, c'est une information sans objet.
  source_url   text,

  -- Ce que la collecte a vu d'AUTRE. Reprend le patron de
  -- `web_presence.domain_candidates` : n'en retenir qu'une sans garder les
  -- autres oblige à tout refaire le jour où la première rebondit.
  candidates   jsonb not null default '[]'::jsonb,

  found_at     timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table prospect_contact enable row level security;
create policy authenticated_all on prospect_contact
  for all to authenticated using (true) with check (true);
```

- [ ] **Étape 3 : Écrire la migration de l'envoi**

Créer `supabase/migrations/20260903092000_message_send.sql` :

```sql
-- Chantier n°7, lot 1 — l'envoi d'un message, et sa garantie d'unicité.
--
-- La table est créée dès ce lot bien que l'envoi n'y soit pas construit :
-- c'est elle qui porte la contrainte d'unicité dont dépend « n'envoie jamais
-- deux fois au même », et l'écran de ce lot lit déjà son état pour dériver le
-- troisième segment de la piste.

-- 'en_cours' N'EST PAS UN ÉTAT TRANSITOIRE DE CONFORT, c'est le cœur de la
-- garantie. La ligne s'écrit AVANT l'appel au fournisseur ; un plantage entre
-- les deux la laisse en 'en_cours', ce qui bloque le renvoi et s'affiche
-- comme « envoi incertain ». Un troisième état honnête vaut mieux qu'un
-- double envoi silencieux ou qu'un mail perdu.
create type send_state as enum ('en_cours', 'envoye', 'echoue');

create table message_send (
  id                    uuid primary key default gen_random_uuid(),
  prospect_id           uuid not null references prospect (id) on delete cascade,
  generated_message_id  uuid references generated_message (id) on delete set null,

  channel               text not null,
  provider              text not null,

  -- L'adresse TELLE QU'ELLE ÉTAIT à l'envoi. `prospect_contact.email` peut
  -- changer ensuite ; savoir à qui le message est réellement parti fait
  -- partie de ce qu'on doit pouvoir répondre à quelqu'un qui le demande.
  recipient             text not null,

  state                 send_state not null default 'en_cours',
  provider_message_id   text,
  error                 text,

  sent_by               uuid,
  started_at            timestamptz not null default now(),
  sent_at               timestamptz
);

-- LA GARANTIE, EN BASE ET NON DANS UN COMPOSANT REACT. Une règle qui ne vit
-- que dans l'interface ne survit pas à un rechargement au mauvais moment.
-- Partiel sur `state <> 'echoue'` : un envoi qui a échoué doit pouvoir être
-- retenté, un envoi parti ou incertain, jamais.
create unique index message_send_unique
  on message_send (prospect_id, channel)
  where state <> 'echoue';

create index message_send_prospect_idx
  on message_send (prospect_id, started_at desc);

alter table message_send enable row level security;
create policy authenticated_all on message_send
  for all to authenticated using (true) with check (true);
```

- [ ] **Étape 4 : Relire les trois fichiers instruction par instruction**

Ne pas sauter cette étape. `pnpm db:push` s'applique à une **instance réelle**, et il n'y a pas de retour en arrière. Vérifier, ligne à ligne :

1. aucune instruction ne contient `drop`, `alter table … drop`, `alter column`, ni `truncate` ;
2. les cinq `create type` portent des noms qui n'existent pas déjà —
   `grep -rn "create type" supabase/migrations/` pour comparer ;
3. les trois `create table` portent des noms qui n'existent pas déjà ;
4. chaque table a `enable row level security` **et** sa politique ;
5. `alter publication` ne porte que sur `campaign_job` et `deployment_event`.

- [ ] **Étape 5 : Appliquer, puis régénérer les types**

```bash
pnpm db:push
pnpm db:types
```

Attendu : `db:push` liste les trois migrations comme appliquées ; `db:types` réécrit `packages/db/src/database.types.ts` sans erreur.

- [ ] **Étape 6 : Vérifier que les types portent bien le nouveau schéma**

```bash
grep -c "campaign_job\|prospect_contact\|message_send\|worker_heartbeat" packages/db/src/database.types.ts
grep -n "campaign_job_state\|contact_origin\|send_state" packages/db/src/database.types.ts | head
```

Attendu : le premier compte est non nul ; le second liste les trois énumérations avec leurs valeurs. Si l'une manque, la migration n'a pas produit ce qu'on croit — **ne pas continuer**, corriger d'abord.

```bash
pnpm -r typecheck
```

Attendu : aucune erreur. Le fichier généré est valide et rien ne le consomme encore.

- [ ] **Étape 7 : Commit**

```bash
git add supabase/migrations packages/db/src/database.types.ts
git commit -m "feat(db): la file, le destinataire et l envoi — trois tables que l ecran attend

Le dashboard n appelle ni GitHub ni Vercel : il deposera une demande dans
campaign_job, que le collector draine. worker_heartbeat existe pour qu un
worker mort se voie a l ecran plutot que de laisser des demandes s empiler
en silence.

prospect_contact leve le blocage trouve avant de dessiner : aucune table ne
portait d adresse email, et un bouton Envoyer sans destinataire est
l affordance que la doctrine interdit. L origine est une enumeration : un
robot et un humain n engagent pas la meme chose.

message_send porte son unicite en index partiel et non dans un composant
React — une regle qui ne vit que dans l interface ne survit pas a un
rechargement au mauvais moment.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 2 : Extraire le câblage des étages dans `chaine.ts`

**Files:**
- Create: `apps/collector/src/chaine.ts`
- Modify: `apps/collector/src/cli.ts` (cas `publish` ~1744-1810 et `deploy` ~1814-1870)
- Test: la suite existante du collector, qui doit rester verte

**Interfaces:**
- Consumes: `runPublish`/`PublishDeps`/`EtatSite` de `stages/publish.js`, `runDeploy`/`DeployDeps`/`DeploySite` de `stages/deploy.js`, `createEventSink` de `stages/events.js`, `createGithubClient`, `createVercelClient`, `gabaritDefautPourPublication`.
- Produces:
  - `construireDepsPublication(client: SupabaseClient<Database>, opts: { github: GithubClient; templateRepoDefaut: string | undefined; rows: Record<string, LigneSite> }): PublishDeps`
  - `construireDepsDeploiement(client: SupabaseClient<Database>, opts: { vercel: VercelClient; attendreUrl: (projectId: string) => Promise<string | null> }): DeployDeps`
  - `export interface LigneSite` — la forme d'une ligne rendue par `fetchSiteRows`

> **Refactorisation pure : aucun comportement ne change.** On déplace du code, on ne le réécrit pas. Le contrôle est la suite existante du collector, qui doit rester verte à l'identique.

- [ ] **Étape 1 : Lancer la suite du collector et noter le compte**

```bash
pnpm --filter @prospeo/collector test
```

Attendu : tous verts. **Noter le nombre de tests** — c'est la référence à retrouver à l'étape 5.

- [ ] **Étape 2 : Créer `chaine.ts` en déplaçant le câblage**

Créer `apps/collector/src/chaine.ts`. Le corps des deux fonctions est **le code déjà présent dans `cli.ts`**, déplacé sans modification : ouvrir `apps/collector/src/cli.ts` aux cas `publish` et `deploy`, et transporter les objets `deps` tels quels.

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { createEventSink } from './stages/events.js';
import type { DeployDeps } from './stages/deploy.js';
import type { EtatSite, PublishDeps } from './stages/publish.js';
import type { GithubClient } from './sources/github.js';
import type { VercelClient } from './sources/vercel.js';

/**
 * Câblage des étages, en un seul endroit.
 *
 * **Pourquoi ce fichier existe.** Les objets `Deps` de `runPublish` et
 * `runDeploy` vivaient en ligne dans les `case` de `cli.ts`, à ~130 lignes
 * chacun. Le worker du chantier n°7 en a besoin des mêmes, pour un seul
 * prospect au lieu d'un lot. Les recopier aurait créé un dialecte, et une
 * correction n'aurait atterri que d'un côté — celui qu'on aurait ouvert.
 *
 * Ce fichier ne décide rien : il ne fait que construire les dépendances. Les
 * étages, eux, sont inchangés.
 */

/**
 * Une ligne de `prospect_site` telle que `fetchSiteRows` la rend.
 *
 * Les dix champs sont ceux du `select` de `fetchSiteRows` (`cli.ts`), dans
 * le même ordre. En omettre un ferait échouer la construction du type au
 * premier appelant qui le lit, et non ici.
 */
export interface LigneSite {
  content: unknown;
  repo_full_name: string | null;
  repo_url: string | null;
  content_hash: string | null;
  content_rejected_at: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  vercel_project_id: string | null;
  deployment_url: string | null;
}

export function construireDepsPublication(
  client: SupabaseClient<Database>,
  opts: {
    github: GithubClient;
    templateRepoDefaut: string | undefined;
    rows: Record<string, LigneSite>;
  },
): PublishDeps {
  return {
    github: opts.github,
    templateRepoDefaut: opts.templateRepoDefaut,
    async lireEtat(prospectId) {
      const row = opts.rows[prospectId];
      if (row === undefined || row.repo_full_name === null) return null;
      return {
        repoFullName: row.repo_full_name,
        empreinte: row.content_hash,
        publishedAt: row.published_at === null ? null : new Date(row.published_at),
      } satisfies EtatSite;
    },
    async enregistrer(prospectId, etat) {
      const { error } = await client.from('prospect_site').upsert({
        prospect_id: prospectId,
        repo_full_name: etat.repoFullName,
        repo_url: etat.repoUrl,
        content_hash: etat.empreinte,
        prompt_version: etat.promptVersion,
        model: etat.model,
        generated_at: etat.generatedAt.toISOString(),
        published_at: etat.publishedAt.toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    maintenant: () => new Date(),
    events: createEventSink(client),
  };
}

export function construireDepsDeploiement(
  client: SupabaseClient<Database>,
  opts: { vercel: VercelClient; attendreUrl: (projectId: string) => Promise<string | null> },
): DeployDeps {
  return {
    vercel: opts.vercel,
    events: createEventSink(client),
    async enregistrerProjet(prospectId, vercelProjectId) {
      const { error } = await client
        .from('prospect_site')
        .update({ vercel_project_id: vercelProjectId, updated_at: new Date().toISOString() })
        .eq('prospect_id', prospectId);
      if (error) throw new Error(error.message);
    },
    async enregistrerUrl(prospectId, url) {
      const { error } = await client
        .from('prospect_site')
        .update({ deployment_url: url, updated_at: new Date().toISOString() })
        .eq('prospect_id', prospectId);
      if (error) throw new Error(error.message);
    },
    attendreUrl: opts.attendreUrl,
    maintenant: () => new Date(),
  };
}
```

> **Vérifier avant de continuer :** les champs de `LigneSite` doivent correspondre exactement à ce que `fetchSiteRows` sélectionne dans `cli.ts`. Ouvrir sa définition et comparer. Si un champ diffère, corriger `LigneSite` — pas `fetchSiteRows`.

- [ ] **Étape 3 : Faire consommer `chaine.ts` par `cli.ts`**

Dans `apps/collector/src/cli.ts`, cas `publish` : remplacer le littéral `const deps: PublishDeps = { … }` par

```ts
      const deps = construireDepsPublication(client, {
        github: createGithubClient({ token: pubConfig.githubToken, org: pubConfig.githubOrg }),
        templateRepoDefaut: gabaritDefautPourPublication(
          gabaritActif,
          pubConfig.githubTemplateRepo,
        ),
        rows,
      });
```

Cas `deploy` : remplacer `const deps: DeployDeps = { … }` par

```ts
      const deps = construireDepsDeploiement(client, {
        vercel,
        attendreUrl: (projectId) => attendreUrl(vercel, projectId),
      });
```

Ajouter l'import en tête de fichier, et **retirer les imports devenus inutilisés** (`PublishDeps`, `DeployDeps`, `EtatSite`, `createEventSink` s'ils ne servent plus ailleurs) — `pnpm -r typecheck` les signalera.

- [ ] **Étape 4 : Vérifier que rien n'a changé**

```bash
pnpm -r typecheck
pnpm --filter @prospeo/collector test
```

Attendu : aucune erreur de type, et **exactement le même nombre de tests verts qu'à l'étape 1**. Un test en moins signifie qu'un fichier ne compile plus et n'est plus collecté — ce n'est pas un succès.

- [ ] **Étape 5 : Prouver que le déplacement est réellement couvert**

Casser volontairement `construireDepsPublication` : dans `enregistrer`, remplacer `repo_full_name: etat.repoFullName` par `repo_full_name: null`.

```bash
pnpm --filter @prospeo/collector test
```

Attendu : **du rouge**. Si tout reste vert, ce câblage n'est couvert par aucun test et le déplacement est aveugle — le noter dans le message de commit plutôt que de le taire. Restaurer la ligne, relancer, observer le vert.

- [ ] **Étape 6 : Commit**

```bash
git add apps/collector/src/chaine.ts apps/collector/src/cli.ts
git commit -m "refactor(collector): le cablage des etages sort des cas de la CLI

Les Deps de runPublish et runDeploy vivaient en ligne dans cli.ts, a ~130
lignes chacun. Le worker en a besoin des memes, pour un prospect au lieu
d un lot : les recopier aurait cree un dialecte, et une correction n aurait
atterri que du cote qu on aurait ouvert.

Aucun comportement ne change — code deplace, pas reecrit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 3 : `stages/file.ts` — prendre un job, le clore, battre le cœur

**Files:**
- Create: `apps/collector/src/stages/file.ts`
- Test: `apps/collector/src/stages/file.test.ts`

**Interfaces:**
- Consumes: `Database` de `@prospeo/db`.
- Produces:
  - `export interface Job { id: number; prospectId: string; campaignId: string | null; attempts: number }`
  - `export interface FileDeps { listerEnAttente(): Promise<{ id: number; prospect_id: string; campaign_id: string | null; attempts: number }[]>; prendre(id: number): Promise<boolean> }`
  - `export async function prendreProchain(deps: FileDeps): Promise<Job | null>`

> **`FileDeps` ne porte que ce que `prendreProchain` emploie.** Une première rédaction y ajoutait `clore`, `battre` et `maintenant` : trois membres que cette fonction n'appelle jamais, et qu'un lecteur aurait crus nécessaires. Clore un job et battre le cœur sont l'affaire du worker, pas de la prise — ils vivent donc dans le `case 'worker'` (tâche 5).
>
> **Nommage :** le §11 du spec désigne ce module par `collector/stages/worker.ts`. Il s'appelle ici `file.ts`, parce qu'il porte la file et non le worker — lequel vit dans `cli.ts` comme toutes les autres commandes. Écart délibéré, à reporter dans le spec s'il gêne.

- [ ] **Étape 1 : Écrire les tests qui échouent**

Créer `apps/collector/src/stages/file.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { prendreProchain, type FileDeps } from './file.js';

/** Un jeu de dépendances où tout réussit, que chaque test spécialise. */
function deps(surcharges: Partial<FileDeps> = {}): FileDeps {
  return {
    listerEnAttente: async () => [],
    prendre: async () => true,
    ...surcharges,
  };
}

describe('prendreProchain', () => {
  it('rend null quand la file est vide, sans tenter de prise', async () => {
    const prendre = vi.fn(async () => true);
    const job = await prendreProchain(deps({ prendre }));

    expect(job).toBeNull();
    // Une prise à vide écrirait en base sans raison, à chaque battement.
    expect(prendre).not.toHaveBeenCalled();
  });

  it('prend le premier job de la liste', async () => {
    const job = await prendreProchain(
      deps({
        listerEnAttente: async () => [
          { id: 7, prospect_id: 'p-7', campaign_id: null, attempts: 0 },
        ],
      }),
    );

    expect(job).toEqual({ id: 7, prospectId: 'p-7', campaignId: null, attempts: 0 });
  });

  it('passe au suivant quand un autre worker a pris le premier', async () => {
    // `prendre` rend `false` quand la mise à jour conditionnelle n'a touché
    // aucune ligne : entre la lecture et l'écriture, quelqu'un d'autre a
    // changé l'état. C'est la course qu'on doit perdre proprement, et non
    // ignorer.
    const prendre = vi.fn(async (id: number) => id !== 7);
    const job = await prendreProchain(
      deps({
        listerEnAttente: async () => [
          { id: 7, prospect_id: 'p-7', campaign_id: null, attempts: 0 },
          { id: 8, prospect_id: 'p-8', campaign_id: 'c-1', attempts: 2 },
        ],
        prendre,
      }),
    );

    expect(job).toEqual({ id: 8, prospectId: 'p-8', campaignId: 'c-1', attempts: 2 });
    expect(prendre).toHaveBeenCalledTimes(2);
  });

  it('rend null quand toute la liste a ete prise par ailleurs', async () => {
    // Distinct du cas « file vide » : ici il y avait du travail, et il est
    // parti. Rendre autre chose que null ferait traiter un job qu'on ne
    // possede pas. Sans l'assertion sur `prendre`, ce test rougirait
    // pareillement si la boucle n'etait jamais parcourue : elle prouve donc
    // qu'une prise a bien ete tentee sur l'unique candidat, et pas seulement
    // que le resultat final est null.
    const prendre = vi.fn(async () => false);
    const job = await prendreProchain(
      deps({
        listerEnAttente: async () => [
          { id: 7, prospect_id: 'p-7', campaign_id: null, attempts: 0 },
        ],
        prendre,
      }),
    );

    expect(job).toBeNull();
    expect(prendre).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent pour la bonne raison**

```bash
pnpm --filter @prospeo/collector test
```

Attendu : échec à la résolution du module `./file.js` — « Failed to resolve import » ou « Cannot find module ». **Pas** une erreur d'assertion : le module n'existe pas encore.

- [ ] **Étape 3 : Écrire l'implémentation minimale**

Créer `apps/collector/src/stages/file.ts` :

```ts
/**
 * La file de travail : prendre un job, sans jamais en prendre deux.
 *
 * **Pourquoi une prise en deux temps plutôt qu'une requête atomique.**
 * PostgREST ne sait pas exprimer « mets à jour la plus ancienne ligne en
 * attente et rends-la ». On lit donc une liste, puis on tente une mise à jour
 * CONDITIONNÉE À L'ÉTAT (`state = 'en_attente'`) : si un autre worker est
 * passé entre les deux, la mise à jour ne touche aucune ligne et `prendre`
 * rend `false`. La course se perd proprement au lieu de produire deux workers
 * sur le même dépôt GitHub.
 *
 * Ce module ne touche pas à Supabase : il reçoit ses accès en paramètre, sur
 * le patron de `runPublish` et `runDeploy`. C'est ce qui le rend testable
 * sans base.
 */

export interface Job {
  id: number;
  prospectId: string;
  campaignId: string | null;
  attempts: number;
}

/**
 * Uniquement ce que `prendreProchain` emploie.
 *
 * Clore un job et battre le cœur sont l'affaire du worker : les déclarer ici
 * ferait croire que la prise en dépend, et obligerait chaque test à fabriquer
 * deux fonctions qu'il n'appelle jamais.
 */
export interface FileDeps {
  /** Les jobs en attente, du plus ancien au plus récent. */
  listerEnAttente(): Promise<
    { id: number; prospect_id: string; campaign_id: string | null; attempts: number }[]
  >;
  /** Tente la prise. `false` : un autre l'a eu d'abord. */
  prendre(id: number): Promise<boolean>;
}

export async function prendreProchain(deps: FileDeps): Promise<Job | null> {
  const candidats = await deps.listerEnAttente();

  for (const c of candidats) {
    if (await deps.prendre(c.id)) {
      return {
        id: c.id,
        prospectId: c.prospect_id,
        campaignId: c.campaign_id,
        attempts: c.attempts,
      };
    }
  }

  // Ni « file vide » ni « erreur » : simplement, tout ce qui attendait est
  // parti ailleurs. L'appelant réessaiera au prochain tour.
  return null;
}
```

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

```bash
pnpm --filter @prospeo/collector test
```

Attendu : les quatre tests de `prendreProchain` verts, et le reste de la suite inchangé.

- [ ] **Étape 5 : Prouver que chaque assertion peut échouer**

Une par une, casser puis restaurer :

1. remplacer `if (await deps.prendre(c.id))` par `if (true)` → le test « passe au suivant » doit rougir ;
2. remplacer le `return null` final par `return { id: 0, prospectId: '', campaignId: null, attempts: 0 }` → le test « toute la liste a ete prise » doit rougir ;
3. déplacer l'appel à `deps.prendre` avant la boucle → le test « file vide » doit rougir.

Après chaque cassure : `pnpm --filter @prospeo/collector test`, observer le rouge, restaurer, observer le vert. **Une assertion qui reste verte quand on casse son objet ne teste rien.**

- [ ] **Étape 6 : Commit**

```bash
git add apps/collector/src/stages/file.ts apps/collector/src/stages/file.test.ts
git commit -m "feat(collector): prendre un job sans jamais en prendre deux

PostgREST ne sait pas exprimer « mets a jour la plus ancienne ligne en
attente et rends-la ». La prise se fait donc en deux temps, la mise a jour
etant conditionnee a l etat : un worker qui perd la course le sait, et
passe au suivant au lieu de travailler sur un job qu il ne possede pas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 4 : `traiterProspect` — enchaîner les quatre étages

**Files:**
- Modify: `apps/collector/src/chaine.ts`
- Test: `apps/collector/src/chaine.test.ts` (créer)

**Interfaces:**
- Consumes: `construireDepsPublication`, `construireDepsDeploiement` (tâche 2).
- Produces:
  - `export type EtapeChaine = 'generate' | 'publish' | 'deploy' | 'pitch'`
  - `export interface ResultatChaine { termine: EtapeChaine[]; echec: { etape: EtapeChaine; message: string } | null; coutEur: number | null }`
  - `export interface ChaineDeps { generer(prospectId: string): Promise<number | null>; publier(prospectId: string): Promise<void>; deployer(prospectId: string): Promise<void>; rediger(prospectId: string): Promise<number | null> }`
  - `export async function traiterProspect(prospectId: string, deps: ChaineDeps): Promise<ResultatChaine>`

> Les quatre fonctions de `ChaineDeps` rendent un **coût en euros ou `null`**. `null` n'est pas zéro : c'est « cet étage ne sait pas ce qu'il a coûté », et le total doit le dire.

- [ ] **Étape 1 : Écrire les tests qui échouent**

Créer `apps/collector/src/chaine.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { traiterProspect, type ChaineDeps } from './chaine.js';

function deps(surcharges: Partial<ChaineDeps> = {}): ChaineDeps {
  return {
    generer: async () => 0.02,
    publier: async () => {},
    deployer: async () => {},
    rediger: async () => 0.01,
    ...surcharges,
  };
}

describe('traiterProspect', () => {
  it('enchaine les quatre etapes dans l ordre', async () => {
    const ordre: string[] = [];
    await traiterProspect(
      'p-1',
      deps({
        generer: async () => {
          ordre.push('generate');
          return null;
        },
        publier: async () => {
          ordre.push('publish');
        },
        deployer: async () => {
          ordre.push('deploy');
        },
        rediger: async () => {
          ordre.push('pitch');
          return null;
        },
      }),
    );

    // L ordre est une dependance de donnees, pas une convention : publier
    // avant d avoir genere pousserait un depot vide.
    expect(ordre).toEqual(['generate', 'publish', 'deploy', 'pitch']);
  });

  it('s arrete au premier echec et nomme l etape fautive', async () => {
    const rediger = vi.fn(async () => null);
    const resultat = await traiterProspect(
      'p-1',
      deps({
        publier: async () => {
          throw new Error('nom deja pris');
        },
        rediger,
      }),
    );

    expect(resultat.echec).toEqual({ etape: 'publish', message: 'nom deja pris' });
    expect(resultat.termine).toEqual(['generate']);
    // Rediger un mail qui citerait une URL inexistante produirait un message
    // faux : la chaine s arrete, elle ne saute pas l etape.
    expect(rediger).not.toHaveBeenCalled();
  });

  it('somme les couts connus', async () => {
    const resultat = await traiterProspect('p-1', deps({ generer: async () => 0.02, rediger: async () => 0.01 }));

    expect(resultat.coutEur).toBeCloseTo(0.03, 5);
  });

  it('rend un cout nul quand aucune etape ne sait ce qu elle a coute', async () => {
    // `null` n est pas zero : « je ne sais pas » et « c etait gratuit » sont
    // deux faits differents, et l ecran doit pouvoir les distinguer.
    const resultat = await traiterProspect(
      'p-1',
      deps({ generer: async () => null, rediger: async () => null }),
    );

    expect(resultat.coutEur).toBeNull();
  });

  it('somme ce qui est connu meme quand une etape l ignore', async () => {
    const resultat = await traiterProspect(
      'p-1',
      deps({ generer: async () => 0.02, rediger: async () => null }),
    );

    // Un total partiel, pas un total faux. Traiter le `null` comme zero
    // sous-declarerait la depense sans que rien ne le signale.
    expect(resultat.coutEur).toBeCloseTo(0.02, 5);
  });
});
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent**

```bash
pnpm --filter @prospeo/collector test
```

Attendu : `traiterProspect` n'est pas exportée — « does not provide an export named 'traiterProspect' ».

- [ ] **Étape 3 : Écrire l'implémentation**

Ajouter à la fin de `apps/collector/src/chaine.ts` :

```ts
export type EtapeChaine = 'generate' | 'publish' | 'deploy' | 'pitch';

export interface ResultatChaine {
  termine: EtapeChaine[];
  echec: { etape: EtapeChaine; message: string } | null;
  /** `null` : aucune étape n'a su dire ce qu'elle coûtait. Ce n'est pas zéro. */
  coutEur: number | null;
}

export interface ChaineDeps {
  generer(prospectId: string): Promise<number | null>;
  publier(prospectId: string): Promise<void>;
  deployer(prospectId: string): Promise<void>;
  rediger(prospectId: string): Promise<number | null>;
}

/**
 * La chaîne complète sur UN prospect.
 *
 * **L'ordre est une dépendance de données, pas une convention** : publier
 * avant d'avoir généré pousserait un dépôt vide, et rédiger avant d'avoir
 * déployé produirait un mail citant une URL qui n'existe pas. La chaîne
 * s'arrête donc au premier échec au lieu de sauter l'étape fautive.
 *
 * Le rapport nomme l'étape qui a échoué : c'est ce que la ligne de l'écran
 * affichera, et « échoué » tout court n'aiderait personne.
 */
export async function traiterProspect(
  prospectId: string,
  deps: ChaineDeps,
): Promise<ResultatChaine> {
  const termine: EtapeChaine[] = [];
  // `null` tant qu'aucune étape n'a rendu de coût — voir `ResultatChaine`.
  let cout: number | null = null;

  const ajouterCout = (montant: number | null): void => {
    if (montant === null) return;
    cout = cout === null ? montant : cout + montant;
  };

  const etapes: readonly [EtapeChaine, () => Promise<number | null>][] = [
    ['generate', () => deps.generer(prospectId)],
    ['publish', () => deps.publier(prospectId).then(() => null)],
    ['deploy', () => deps.deployer(prospectId).then(() => null)],
    ['pitch', () => deps.rediger(prospectId)],
  ];

  for (const [etape, executer] of etapes) {
    try {
      ajouterCout(await executer());
      termine.push(etape);
    } catch (cause) {
      return {
        termine,
        echec: { etape, message: cause instanceof Error ? cause.message : String(cause) },
        coutEur: cout,
      };
    }
  }

  return { termine, echec: null, coutEur: cout };
}
```

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

```bash
pnpm --filter @prospeo/collector test
```

Attendu : les cinq tests de `traiterProspect` verts.

- [ ] **Étape 5 : Prouver que les assertions peuvent échouer**

1. **retirer le garde** `if (montant === null) return;` **et** remplacer `cout === null ? montant : cout + montant` par `cout = (cout ?? 0) + (montant ?? 0)` → le test « cout nul quand aucune etape » doit rougir sur `expected +0 to be null`.

   > **Les deux moitiés sont nécessaires.** Remplacer le seul cumul, garde intact, est un **no-op** : le garde a déjà exclu `montant === null`, donc `(cout ?? 0) + montant` et `cout === null ? montant : cout + montant` rendent exactement la même valeur, et la suite reste entièrement verte. Vérifié en rejouant les deux variantes. Une cassure qui ne rougit pas ne prouve rien — et une consigne de cassure inopérante est pire qu'aucune consigne, puisqu'elle fait croire la preuve faite.
2. remplacer le `return` du `catch` par un `continue` → les tests « s arrete au premier echec » doivent rougir ;
3. inverser deux entrées du tableau `etapes` → le test « enchaine dans l ordre » doit rougir.

Après chaque cassure : lancer, observer le rouge, restaurer, observer le vert.

- [ ] **Étape 6 : Commit**

```bash
git add apps/collector/src/chaine.ts apps/collector/src/chaine.test.ts
git commit -m "feat(collector): la chaine sur un prospect, et le cout qui ne ment pas

L ordre des quatre etapes est une dependance de donnees : publier avant
d avoir genere pousserait un depot vide, rediger avant d avoir deploye
produirait un mail citant une URL inexistante. La chaine s arrete au
premier echec et nomme l etape fautive.

Le cout reste null tant qu aucune etape n a su le dire — « je ne sais pas »
et « c etait gratuit » sont deux faits differents, et les confondre
sous-declarerait la depense sans que rien ne le signale.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 5 : La commande `worker`

**Files:**
- Modify: `apps/collector/src/cli.ts` (USAGE, `COMMANDS`, nouveau `case 'worker'`)

**Interfaces:**
- Consumes: `prendreProchain`/`FileDeps` (tâche 3), `traiterProspect`/`ChaineDeps` (tâche 4), `construireDepsPublication`/`construireDepsDeploiement` (tâche 2), `createClient`, `loadConfig`.
- Produces: la commande `prospeo worker`, et `export function chaineDeps(client: SupabaseClient<Database>): ChaineDeps` dans `chaine.ts`.

> **Pas de test unitaire sur la boucle elle-même**, et c'est assumé : elle n'est qu'un branchement entre `prendreProchain` et `traiterProspect`, tous deux couverts. Le contrôle est le jalon — un déploiement réel, vu à l'œil. Même parti que `useDeployments`, non testé pour la même raison.

- [ ] **Étape 1 : Déclarer la commande**

Dans `apps/collector/src/cli.ts`, ajouter la ligne au bloc `USAGE` (à la suite des commandes existantes) :

```
  worker [--concurrence <n>]                   Draine la file du dashboard, en continu
```

Puis ajouter `'worker'` au tableau `COMMANDS`. Localiser ce tableau avec :

```bash
grep -n "COMMANDS" apps/collector/src/cli.ts
```

- [ ] **Étape 2 : Écrire le cas `worker`**

Ajouter, parmi les autres `case` du `switch (command)` :

```ts
    case 'worker': {
      const config = loadConfig(process.env);
      const client = createClient(config);

      // 10 s : assez court pour qu'un worker mort se voie vite à l'écran (qui
      // le déclare arrêté au-delà de 60 s), assez long pour ne pas écrire en
      // base en permanence.
      const PERIODE_BATTEMENT_MS = 10_000;
      // Le filet sous Realtime. Un worker qui ne dépend que d'un socket est
      // un worker qui s'endort sans le dire : une déconnexion silencieuse
      // laisserait la file grossir sans que rien n'en sorte.
      const PERIODE_BALAYAGE_MS = 30_000;

      let enCours = 0;
      let arret = false;

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

      const fileDeps: FileDeps = {
        async listerEnAttente() {
          const { data, error } = await client
            .from('campaign_job')
            .select('id,prospect_id,campaign_id,attempts')
            .eq('state', 'en_attente')
            .order('requested_at', { ascending: true })
            .limit(20);
          if (error) throw new Error(error.message);
          return data ?? [];
        },
        async prendre(id) {
          // Conditionnée à l'état : c'est CETTE clause qui fait perdre la
          // course proprement quand un autre worker est passé entre la
          // lecture et l'écriture.
          const { data, error } = await client
            .from('campaign_job')
            .update({ state: 'en_cours', started_at: new Date().toISOString() })
            .eq('id', id)
            .eq('state', 'en_attente')
            .select('id');
          if (error) throw new Error(error.message);
          return (data ?? []).length === 1;
        },
      };

      /** Clore un job. Local au worker : la prise n'en a pas besoin. */
      const clore = async (
        id: number,
        issue: 'termine' | 'echoue',
        erreur: string | null,
        cout: number | null,
      ): Promise<void> => {
        const { error } = await client
          .from('campaign_job')
          .update({
            state: issue,
            last_error: erreur,
            cost_eur: cout,
            finished_at: new Date().toISOString(),
          })
          .eq('id', id);
        // Journalisé et non relancé : une exception ici sortirait de
        // `traiterUn` par le `finally`, et la boucle s'arrêterait sur un
        // problème d'écriture alors que le déploiement, lui, a réussi.
        if (error) process.stderr.write(`worker : clôture échouée — ${error.message}\n`);
      };

      const deps = chaineDeps(client);

      const traiterUn = async (): Promise<boolean> => {
        // `prendreProchain` lit puis écrit sur Supabase, et `fileDeps` fait un
        // `throw new Error(...)` sur toute erreur réseau — un blip pendant un
        // balayage suffit. Cette lecture n'a AUCUN job « en_cours » en main :
        // la laisser rejeter hors de tout `try` ferait remonter la rejection
        // jusqu'à `drainer`, puis jusqu'aux deux appels fire-and-forget plus
        // bas ; depuis Node 15, une rejection non gérée termine le processus,
        // et un job qu'un tour précédent a laissé `en_cours` resterait bloqué
        // à jamais derrière l'index unique partiel `campaign_job_actif_unique`
        // — plus aucune nouvelle demande sur ce prospect, sans intervention
        // manuelle en base. On distingue donc « la file n'a pas pu être lue »
        // (un incident, à journaliser — le balayage suivant réessaiera) de
        // « la file est vide » (l'état normal, qui ne mérite aucun bruit) :
        // les replier sur le même `return false` silencieux masquerait
        // l'incident.
        let job: Awaited<ReturnType<typeof prendreProchain>>;
        try {
          job = await prendreProchain(fileDeps);
        } catch (cause) {
          process.stderr.write(
            `worker : lecture de la file échouée — ${cause instanceof Error ? cause.message : String(cause)}\n`,
          );
          return false;
        }
        if (job === null) return false;

        enCours += 1;
        await battre();
        try {
          const resultat = await traiterProspect(job.prospectId, deps);
          await clore(
            job.id,
            resultat.echec === null ? 'termine' : 'echoue',
            resultat.echec === null ? null : `${resultat.echec.etape} : ${resultat.echec.message}`,
            resultat.coutEur,
          );
        } catch (cause) {
          // Un échec HORS chaîne (lecture, réseau, RLS) : le job doit être
          // clos malgré tout, faute de quoi il resterait « en cours » pour
          // toujours et l'index unique bloquerait toute nouvelle demande sur
          // ce prospect.
          await clore(
            job.id,
            'echoue',
            cause instanceof Error ? cause.message : String(cause),
            null,
          );
        } finally {
          enCours -= 1;
          await battre();
        }
        return true;
      };

      /**
       * Vide la file, un job à la fois.
       *
       * **Ne doit JAMAIS rejeter.** `drainer` est appelé en fire-and-forget
       * depuis le callback Realtime et depuis le balayage périodique : une
       * rejection non rattrapée ici tuerait le worker en pleine gestion d'un
       * job, qui resterait `en_cours` pour toujours derrière l'index unique
       * partiel — exactement le scénario que ce `try/catch` existe pour
       * empêcher. `traiterUn` protège déjà sa propre lecture de la file, mais
       * ce filet-ci reste en place : c'est lui, et non une relecture de
       * `traiterUn`, qui garantit que « le balayage rattrape Realtime » reste
       * vrai même si `traiterUn` change un jour.
       */
      const drainer = async (): Promise<void> => {
        try {
          while (!arret && (await traiterUn())) {
            // Rien : la condition fait le travail.
          }
        } catch (cause) {
          process.stderr.write(
            `worker : balayage interrompu par une erreur inattendue — ${cause instanceof Error ? cause.message : String(cause)}\n`,
          );
        }
      };

      /**
       * Lance `drainer` en tâche de fond, sans jamais laisser filer une
       * rejection.
       *
       * Garde redondante avec le `try/catch` interne de `drainer` ci-dessus,
       * et volontairement : un simple `void drainer()` suffit tant que
       * `drainer` ne rejette pas, mais cesse de protéger le worker dès que ce
       * invariant se rompt — par exemple si une future modification de
       * `drainer` ajoute du code après la boucle, hors du `try`. Un job laissé
       * `en_cours` par un worker mort ne se rattrape qu'à la main, en base.
       */
      const lancerDrainage = (): void => {
        void drainer().catch((cause: unknown) => {
          process.stderr.write(
            `worker : drainer a rejeté de façon inattendue — ${cause instanceof Error ? cause.message : String(cause)}\n`,
          );
        });
      };

      // Realtime réveille ; le balayage rattrape ce qu'une déconnexion aurait
      // laissé passer. Les deux, et non l'un ou l'autre.
      const canal = client
        .channel('campagne-file')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'campaign_job' },
          () => lancerDrainage(),
        )
        .subscribe();

      const battement = setInterval(() => void battre(), PERIODE_BATTEMENT_MS);
      const balayage = setInterval(() => lancerDrainage(), PERIODE_BALAYAGE_MS);

      // Arrêt propre : on cesse de prendre, on laisse finir ce qui est en
      // cours. Un job abandonné en « en cours » bloquerait le prospect
      // jusqu'à une intervention manuelle, à cause de l'index unique partiel.
      const fermer = async (): Promise<void> => {
        arret = true;
        clearInterval(battement);
        clearInterval(balayage);
        await canal.unsubscribe();
        process.stdout.write('worker : arrêt demandé, plus aucune prise\n');
      };
      process.on('SIGINT', () => void fermer());
      process.on('SIGTERM', () => void fermer());

      process.stdout.write('worker : à l’écoute de campaign_job\n');
      await battre();
      await drainer();

      // La commande ne rend la main que sur signal : `worker` est un
      // processus résident, pas un run borné comme les autres commandes.
      await new Promise<void>((resoudre) => {
        const attendre = setInterval(() => {
          if (arret && enCours === 0) {
            clearInterval(attendre);
            resoudre();
          }
        }, 500);
      });
      return 0;
    }
```

- [ ] **Étape 3 : Écrire `chaineDeps`, le pont entre la chaîne et les étages**

Ajouter dans `apps/collector/src/chaine.ts` — c'est ce qui donne à `traiterProspect` ses quatre accès réels :

```ts
/**
 * Les quatre accès réels de `traiterProspect`, pour UN prospect.
 *
 * Chaque étage reçoit un lot d'un seul élément : `runPublish` et `runDeploy`
 * sont déjà séquentiels et bornés, et leur passer un singleton évite
 * d'écrire une seconde version « pour un ». Les rapports rendus sont
 * convertis en exception quand ils comptent un échec — `traiterProspect`
 * raisonne sur des exceptions, pas sur des compteurs.
 *
 * **Le coût rendu est `null`, délibérément.** Les étages comptent des JETONS,
 * à trois tarifs distincts (entrée, écriture de cache, lecture de cache,
 * sortie), et rien dans ce dépôt ne porte de table de prix. Convertir ici
 * demanderait d'inventer des tarifs, c'est-à-dire de produire un chiffre
 * fondé sur rien — précisément ce que la doctrine interdit. `cost_eur` reste
 * donc nul jusqu'à ce qu'une table de prix existe, et le total d'une
 * campagne s'annoncera partiel (lot 6).
 */
/**
 * Ce qu'une garde de rejeu doit dire avant d'agir sur UN prospect.
 *
 * Un booléen ne suffit pas : « rien à faire » recouvre deux situations que
 * `chaineDeps` doit traiter à l'opposé l'une de l'autre. Un travail déjà fait
 * se tait — `chaineDeps` rend `null`, un rejeu de la chaîne ne coûte rien. Un
 * site retiré par un humain (`unpublished_at`) ne doit au contraire JAMAIS se
 * taire : le republier au nom d'une entreprise qui a demandé son retrait est
 * ce que ce dépôt prend le plus au sérieux, et `chaineDeps` doit lever.
 */
export type DecisionEtape =
  | { faire: true }
  | { faire: false; motif: 'deja_fait' }
  | { faire: false; motif: 'retire' };

/**
 * Faut-il (re)générer le contenu d'un prospect ?
 *
 * Même critère que le mode lot de `cli.ts` (`case 'generate'`, filtre
 * `aFaire`) : un contenu déjà écrit et non rejeté n'est pas repayé — c'est le
 * seul étage qui dépense de l'argent sur un appel au modèle. Une rédaction
 * REJETÉE à la relecture fait exception et doit être refaite.
 */
export function decideGeneration(
  ligne: Pick<LigneSite, 'content' | 'content_rejected_at'> | undefined,
): DecisionEtape {
  const dejaEcrit = ligne?.content != null && ligne.content_rejected_at === null;
  return dejaEcrit ? { faire: false, motif: 'deja_fait' } : { faire: true };
}

/**
 * Faut-il publier ce prospect ?
 *
 * Un site dépublié (`unpublished_at !== null`) l'a été SANS DÉLAI, au moment
 * où le prospect est passé « ne pas contacter » ou « perdu » (D5). Le
 * republier n'est pas un cas silencieux : c'est une exception forte.
 */
export function decidePublication(
  ligne: Pick<LigneSite, 'unpublished_at'> | undefined,
): DecisionEtape {
  if (ligne?.unpublished_at != null) return { faire: false, motif: 'retire' };
  return { faire: true };
}

/**
 * Faut-il déployer ce prospect ?
 *
 * Les deux motifs de silence coexistent ici : un site déjà en ligne
 * (`deployment_url` renseignée) n'a rien à gagner à un redéploiement — même
 * critère que `case 'deploy'` en lot. Le retrait est vérifié EN PREMIER : un
 * site retiré ne redéploie jamais, même sans URL encore enregistrée.
 */
export function decideDeploiement(
  ligne: Pick<LigneSite, 'unpublished_at' | 'deployment_url'> | undefined,
): DecisionEtape {
  if (ligne?.unpublished_at != null) return { faire: false, motif: 'retire' };
  if (ligne?.deployment_url != null) return { faire: false, motif: 'deja_fait' };
  return { faire: true };
}

/**
 * Faut-il rédiger un message pour ce prospect ?
 *
 * Même critère que le mode lot (`fetchProspectsDejaRediges`) : l'écriture
 * dans `generated_message` est un `insert`, pas un `upsert` — rejouer sans
 * cette garde empile des messages en double sur le même prospect.
 */
export function decideRedaction(dejaRedige: boolean): DecisionEtape {
  return dejaRedige ? { faire: false, motif: 'deja_fait' } : { faire: true };
}

export function chaineDeps(client: SupabaseClient<Database>): ChaineDeps {
  return {
    async generer(prospectId) {
      const genConfig = loadGenerateConfig(process.env);
      const candidats = await fetchSiteCandidates(client, undefined);
      const cible = candidats.find((c) => c.id === prospectId);
      // Hors des critères de `fetchSiteCandidates` (score, métier, éligibilité
      // web) : ce n'est pas un échec, juste rien à générer pour ce prospect.
      if (cible === undefined) return null;

      const rows = await fetchSiteRows(client);
      const decision = decideGeneration(rows[prospectId]);
      // `deja_fait` : un contenu est déjà écrit et n'a pas été rejeté à la
      // relecture. Un rejeu ne doit pas repayer un appel au modèle — c'est le
      // seul étage de la chaîne qui coûte de l'argent.
      if (!decision.faire) return null;

      const trade = getTrade(cible.faits.metier.slug);
      if (trade === undefined) throw new Error(`métier inconnu : ${cible.faits.metier.slug}`);

      const resultat = await runGenerate(
        [{ prospectId, faits: cible.faits, trade }],
        createRedacteur({
          apiKey: genConfig.anthropicApiKey,
          workspaceId: genConfig.anthropicWorkspaceId,
          trade,
        }),
      );
      if (resultat.report.failed > 0) throw new Error('la rédaction du contenu a échoué');
      if (resultat.report.rejected > 0) {
        throw new Error('contenu refusé par le schéma — rejouer la rédaction');
      }

      for (const { contenu } of resultat.contenus) {
        const { error } = await client.from('prospect_site').upsert({
          prospect_id: prospectId,
          content: contenu as unknown as Json,
          prompt_version: contenu.version.promptVersion,
          model: contenu.version.model,
          generated_at: new Date().toISOString(),
          // Le refus portait sur le texte qu'on vient de remplacer : le
          // laisser bloquerait `publish` sur une rédaction neuve.
          content_rejected_at: null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
      }
      return null;
    },

    async publier(prospectId) {
      const pubConfig = loadPublishConfig(process.env);
      const rows = await fetchSiteRows(client);
      const ligne = rows[prospectId];
      if (ligne === undefined || ligne.content == null) {
        throw new Error('aucun contenu à publier — la rédaction n’a rien écrit');
      }

      const decision = decidePublication(ligne);
      if (!decision.faire) {
        // `decidePublication` ne rend jamais `deja_fait` : ici, `motif` vaut
        // toujours `retire`. Un site dépublié l'a été SANS DÉLAI, au moment où
        // le prospect est passé « ne pas contacter » ou « perdu » (D5). Le
        // republier au nom d'une entreprise qui a demandé son retrait est ce
        // que ce dépôt prend le plus au sérieux : ce n'est pas un « rien à
        // faire » silencieux, la chaîne doit s'arrêter net et le dire.
        throw new Error('publication refusée : le site a été retiré (unpublished_at renseigné)');
      }

      const gabaritActif = await lireGabaritActif(client);
      const deps = construireDepsPublication(client, {
        github: createGithubClient({ token: pubConfig.githubToken, org: pubConfig.githubOrg }),
        templateRepoDefaut: gabaritDefautPourPublication(
          gabaritActif,
          pubConfig.githubTemplateRepo,
        ),
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

    async deployer(prospectId) {
      const depConfig = loadDeployConfig(process.env);
      const vercel = createVercelClient({
        token: depConfig.vercelToken,
        teamId: depConfig.vercelTeamId,
      });
      const rows = await fetchSiteRows(client);
      const ligne = rows[prospectId];
      if (ligne === undefined || ligne.repo_full_name === null) {
        throw new Error('aucun dépôt à déployer');
      }

      const decision = decideDeploiement(ligne);
      if (!decision.faire) {
        if (decision.motif === 'retire') {
          // Même gravité que pour `publier`, et pour la même raison : un site
          // retiré ne doit jamais redéployer, même s'il n'a par ailleurs
          // aucune URL de production encore enregistrée.
          throw new Error('déploiement refusé : le site a été retiré (unpublished_at renseigné)');
        }
        // `deja_fait` : `deployment_url` est déjà renseignée, le site est en
        // ligne — rien à gagner à relancer un déploiement identique.
        return;
      }

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

    async rediger(prospectId) {
      const pitchConfig = loadPitchConfig(process.env);
      const candidats = await fetchPitchCandidates(client);
      const cible = candidats.find((c) => c.id === prospectId);
      // Non joignable (ni téléphone ni site déployé) : rien à rédiger, et ce
      // n'est pas un échec de la chaîne. L'écran le dira par son troisième
      // segment.
      if (cible === undefined) return null;

      // Même critère que le mode lot (`fetchProspectsDejaRediges`) : interrogé
      // pour UN prospect plutôt que la table entière, puisque c'est tout ce
      // dont on a besoin ici.
      const { data: messagesExistants, error: lectureError } = await client
        .from('generated_message')
        .select('prospect_id')
        .eq('prospect_id', prospectId)
        .limit(1);
      if (lectureError) throw new Error(lectureError.message);

      const decision = decideRedaction((messagesExistants ?? []).length > 0);
      // `deja_fait` : l'écriture ci-dessous est un `insert`, pas un `upsert` —
      // rejouer sans cette garde empile des `generated_message` en double sur
      // le même prospect.
      if (!decision.faire) return null;

      const resultat = await runPitch(
        [{ prospectId, faits: cible.faits }],
        createPitchRedacteur({
          apiKey: pitchConfig.anthropicApiKey,
          workspaceId: pitchConfig.anthropicWorkspaceId,
        }),
      );
      if (resultat.report.failed > 0) throw new Error('la rédaction du message a échoué');
      // Symétrique à `generer` ci-dessus : `runPitch` incrémente `rejected`
      // quand le contenu sort de son contrat, et ne pousse alors RIEN dans
      // `messages` — sans lever. Comme on ne passe qu'un prospect, un rejet
      // laisserait `messages` vide, la boucle d'écriture ne ferait rien, et la
      // fonction rendrait `null` : le job se clorait `termine`, sans le
      // moindre `generated_message` écrit ni `last_error` — un échec réel
      // rendu indiscernable d'un succès.
      if (resultat.report.rejected > 0) {
        throw new Error('message refusé par le schéma — rejouer la rédaction');
      }
      if (resultat.report.refusedEditeur > 0) {
        throw new Error('éditeur non renseigné — voir EDITEUR dans packages/core');
      }

      for (const m of resultat.messages) {
        const { error } = await client.from('generated_message').insert({
          prospect_id: m.prospectId,
          channel: m.canal,
          subject: m.objet,
          content: m.contenu,
          model: PITCH_TRACE.model,
          prompt_version: PITCH_TRACE.promptVersion,
        });
        if (error) throw new Error(error.message);
      }
      return null;
    },
  };
}
```

> **Deux fonctions de `cli.ts` doivent devenir exportables** pour que `chaine.ts` les emploie : `fetchSiteRows`, `fetchSiteCandidates`, `fetchPitchCandidates` et `attendreUrl` sont aujourd'hui privées au module. Les déplacer dans `chaine.ts` (elles n'appartiennent pas à la ligne de commande) et faire consommer `cli.ts` depuis là — même mouvement qu'à la tâche 2, et le même contrôle : la suite du collector doit rester verte au même compte.
>
> **Vérifier au passage** que `loadGenerateConfig`, `loadPublishConfig`, `loadDeployConfig` et `loadPitchConfig` sont bien exportées par `config.js` — `cli.ts` les importe déjà, donc oui.

- [ ] **Étape 4 : Vérifier les types et la suite**

```bash
pnpm -r typecheck
pnpm --filter @prospeo/collector test
```

Attendu : aucune erreur de type, suite verte, **et le même nombre de tests qu'après la tâche 4**.

- [ ] **Étape 5 : Vérifier la commande à la main**

```bash
pnpm --filter @prospeo/collector start worker
```

Attendu : `worker : à l'écoute de campaign_job`, puis le processus reste en vie. Vérifier le battement depuis un second terminal :

```bash
pnpm db:list  # confirme la connexion à l'instance
```

Puis, dans l'éditeur SQL Supabase : `select beat_at, in_flight from worker_heartbeat;` — `beat_at` doit avancer toutes les 10 s. Arrêter avec Ctrl+C : le message d'arrêt doit s'afficher.

- [ ] **Étape 6 : Commit**

```bash
git add apps/collector/src/cli.ts apps/collector/src/chaine.ts
git commit -m "feat(collector): un worker resident, qui ecoute et qui bat

Realtime reveille, le balayage rattrape. Les deux, et non l un ou l autre :
un worker qui ne depend que d un socket est un worker qui s endort sans le
dire, et la file grossirait sans que rien n en sorte.

Le battement existe pour que l ecran puisse eteindre ses boutons avec leur
raison quand le worker est mort, plutot que de laisser des demandes
s empiler en silence.

Un echec hors chaine clot quand meme le job : le laisser « en cours »
bloquerait le prospect pour toujours via l index unique partiel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 6 : `domain/campagne.ts` — l'éligibilité et les trois segments

**Files:**
- Create: `apps/dashboard/src/domain/campagne.ts`
- Test: `apps/dashboard/src/domain/campagne.test.ts`

**Interfaces:**
- Consumes: `Enums` de `@prospeo/db`.
- Produces:
  - `export type SegmentEtat = 'vide' | 'en_cours' | 'ok' | 'echec' | 'bloque'`
  - `export type EtatLigne = { nom: 'jamais' } | { nom: 'en_file'; rang: number } | { nom: 'site_en_cours'; etape: Enums<'deployment_step'> } | { nom: 'site_echec'; detail: string } | { nom: 'mail_a_relire' } | { nom: 'adresse_manquante' } | { nom: 'envoi_incertain' } | { nom: 'envoi_echec' } | { nom: 'envoye'; le: string }`
  - `export interface FaitsProspect { prospectId: string; denomination: string; ville: string; tradeSlug: string; score: number | null; presence: Enums<'web_presence_category'> | null; statut: Enums<'pipeline_status'>; aInteraction: boolean; aMessage: boolean; sitePublie: boolean }`
  - `export interface Lot { lignes: FaitsProspect[]; sansScore: number }`
  - `export function classerLot(faits: readonly FaitsProspect[], taille: number): Lot`
  - `export interface FaitsLigne { job: { state: Enums<'campaign_job_state'>; lastError: string | null; rang: number } | null; derniereEtape: { step: Enums<'deployment_step'>; outcome: Enums<'deployment_outcome'>; detail: string | null } | null; siteEnLigne: boolean; mailRedige: boolean; adresse: string | null; envoi: { state: Enums<'send_state'>; sentAt: string | null } | null }`
  - `export function etatLigne(f: FaitsLigne): { site: SegmentEtat; mail: SegmentEtat; envoi: SegmentEtat; etat: EtatLigne }`

- [ ] **Étape 1 : Écrire les tests d'éligibilité**

Créer `apps/dashboard/src/domain/campagne.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { classerLot, etatLigne, type FaitsLigne, type FaitsProspect } from './campagne.js';

function fait(surcharges: Partial<FaitsProspect> = {}): FaitsProspect {
  return {
    prospectId: 'p-1',
    denomination: 'Aquatech Nantes',
    ville: 'Nantes',
    tradeSlug: 'plombier',
    score: 80,
    presence: 'none',
    statut: 'a_contacter',
    aInteraction: false,
    aMessage: false,
    sitePublie: false,
    ...surcharges,
  };
}

describe('classerLot', () => {
  it('classe par score decroissant et borne a la taille demandee', () => {
    const lot = classerLot(
      [
        fait({ prospectId: 'a', score: 60 }),
        fait({ prospectId: 'b', score: 95 }),
        fait({ prospectId: 'c', score: 75 }),
      ],
      2,
    );

    expect(lot.lignes.map((l) => l.prospectId)).toEqual(['b', 'c']);
  });

  it('exclut et COMPTE les prospects jamais scores', () => {
    // Un prospect sans score n est pas un prospect a zero : un tri
    // decroissant le rangerait en bas comme s il l etait. Il sort du lot, et
    // son exclusion s affiche.
    const lot = classerLot(
      [fait({ prospectId: 'a', score: 60 }), fait({ prospectId: 'sans', score: null })],
      10,
    );

    expect(lot.lignes.map((l) => l.prospectId)).toEqual(['a']);
    expect(lot.sansScore).toBe(1);
  });

  it('ne compte pas comme « sans score » un prospect deja disqualifie par ailleurs', () => {
    // Le compte annonce « des prospects qu on pourrait recuperer en les
    // scorant ». Y verser un prospect en « ne pas contacter » promettrait une
    // remediation qui n existe pas.
    const lot = classerLot(
      [fait({ prospectId: 'x', score: null, statut: 'ne_pas_contacter' })],
      10,
    );

    expect(lot.lignes).toHaveLength(0);
    expect(lot.sansScore).toBe(0);
  });

  it.each([
    ['un statut deja avance', { statut: 'contacte' as const }],
    ['une interaction consignee', { aInteraction: true }],
    ['un message deja redige', { aMessage: true }],
    ['un site deja publie', { sitePublie: true }],
  ])('exclut un prospect avec %s', (_libelle, surcharge) => {
    const lot = classerLot([fait(surcharge)], 10);
    expect(lot.lignes).toHaveLength(0);
  });
});
```

- [ ] **Étape 2 : Écrire les tests de dérivation des segments**

Ajouter au même fichier :

```ts
function ligne(surcharges: Partial<FaitsLigne> = {}): FaitsLigne {
  return {
    job: null,
    derniereEtape: null,
    siteEnLigne: false,
    mailRedige: false,
    adresse: null,
    envoi: null,
    ...surcharges,
  };
}

describe('etatLigne', () => {
  it('rend trois segments vides sur un prospect jamais touche', () => {
    const r = etatLigne(ligne());

    expect(r).toMatchObject({ site: 'vide', mail: 'vide', envoi: 'vide' });
    expect(r.etat).toEqual({ nom: 'jamais' });
  });

  it('nomme le rang d un job en file, sans rien allumer', () => {
    // L attente est un etat, pas un vide : sans elle, un clic sur Deployer
    // ne produirait aucun changement visible et donnerait a croire qu il n a
    // rien fait.
    const r = etatLigne(ligne({ job: { state: 'en_attente', lastError: null, rang: 3 } }));

    expect(r.site).toBe('vide');
    expect(r.etat).toEqual({ nom: 'en_file', rang: 3 });
  });

  it('allume le premier segment pendant le build', () => {
    const r = etatLigne(
      ligne({
        job: { state: 'en_cours', lastError: null, rang: 1 },
        derniereEtape: { step: 'build', outcome: 'demarre', detail: null },
      }),
    );

    expect(r.site).toBe('en_cours');
    expect(r.etat).toEqual({ nom: 'site_en_cours', etape: 'build' });
  });

  it('porte la cause d un echec DANS l etat, pas derriere un journal', () => {
    const r = etatLigne(
      ligne({
        job: { state: 'echoue', lastError: 'depot : nom deja pris', rang: 1 },
        derniereEtape: { step: 'depot', outcome: 'echoue', detail: 'nom deja pris' },
      }),
    );

    expect(r.site).toBe('echec');
    expect(r.etat).toEqual({ nom: 'site_echec', detail: 'nom deja pris' });
  });

  it('distingue BLOQUE de ECHOUE quand l adresse manque', () => {
    // Une adresse manquante n a rien rate : elle attend un humain. Les
    // confondre ferait chercher une remediation technique la ou il manque une
    // information.
    const r = etatLigne(ligne({ siteEnLigne: true, mailRedige: true, adresse: null }));

    expect(r).toMatchObject({ site: 'ok', mail: 'ok', envoi: 'bloque' });
    expect(r.etat).toEqual({ nom: 'adresse_manquante' });
  });

  it('annonce un mail a relire quand tout est pret', () => {
    const r = etatLigne(
      ligne({ siteEnLigne: true, mailRedige: true, adresse: 'contact@exemple.fr' }),
    );

    expect(r).toMatchObject({ site: 'ok', mail: 'ok', envoi: 'vide' });
    expect(r.etat).toEqual({ nom: 'mail_a_relire' });
  });

  it('rend « envoi incertain » sur une ligne restee en cours', () => {
    // Le troisieme etat honnete : la ligne message_send a ete ecrite, l appel
    // au fournisseur n a jamais rendu son verdict. Le presenter comme envoye
    // ou comme jamais envoye serait un mensonge dans les deux sens.
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        envoi: { state: 'en_cours', sentAt: null },
      }),
    );

    expect(r.envoi).toBe('en_cours');
    expect(r.etat).toEqual({ nom: 'envoi_incertain' });
  });

  it('allume les trois segments une fois le mail parti', () => {
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        envoi: { state: 'envoye', sentAt: '2026-09-03T14:02:00Z' },
      }),
    );

    expect(r).toMatchObject({ site: 'ok', mail: 'ok', envoi: 'ok' });
    expect(r.etat).toEqual({ nom: 'envoye', le: '2026-09-03T14:02:00Z' });
  });

  it('rend le segment envoi a « echec » avec un badge dedie, jamais « mail a relire »', () => {
    // Un envoi qui a echoue n est pas un mail jamais tente : les confondre
    // ferait disparaitre l echec derriere « mail a relire », alors que
    // SegmentEtat porte deja 'echec' pour exactement ce cas.
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        envoi: { state: 'echoue', sentAt: null },
      }),
    );

    expect(r).toMatchObject({ site: 'ok', mail: 'ok', envoi: 'echec' });
    expect(r.etat).toEqual({ nom: 'envoi_echec' });
  });

  it('garde le segment mail a « ok » quand un job echoue apres que le mail ait ete redige', () => {
    // Le mail existe deja : un rejeu de job qui echoue plus tard ne doit pas
    // effacer ce fait. Le site n est pas en ligne ici (siteEnLigne reste a
    // false) : c est bien le job qui porte l echec du segment site.
    const r = etatLigne(
      ligne({
        mailRedige: true,
        job: { state: 'echoue', lastError: 'pitch : timeout', rang: 1 },
        derniereEtape: { step: 'retrait', outcome: 'echoue', detail: 'timeout fournisseur' },
      }),
    );

    expect(r.mail).toBe('ok');
    expect(r.site).toBe('echec');
    expect(r.etat).toEqual({ nom: 'site_echec', detail: 'timeout fournisseur' });
  });

  it('garde le badge d echec de job au-dessus de « mail a relire », meme site en ligne', () => {
    // Choix assume : un job en echec reste l information la plus actionnable
    // et la plus recente, meme quand le site est deja en ligne et le mail
    // deja pret. Le segment `site` le dit honnetement a 'ok' — le badge, lui,
    // nomme la derniere tentative, pas l etat du site : les deux cohabitent
    // sans se contredire, l un ne pretend rien que l autre dementirait.
    const r = etatLigne(
      ligne({
        siteEnLigne: true,
        mailRedige: true,
        adresse: 'contact@exemple.fr',
        job: { state: 'echoue', lastError: 'depot : nom deja pris', rang: 1 },
        derniereEtape: { step: 'depot', outcome: 'echoue', detail: 'nom deja pris' },
      }),
    );

    expect(r.site).toBe('ok');
    expect(r.mail).toBe('ok');
    expect(r.etat).toEqual({ nom: 'site_echec', detail: 'nom deja pris' });
  });

  it.each([
    ['annule', 'annule' as const],
    ['termine', 'termine' as const],
  ])('retombe sur « jamais » pour un job %s qui n a fait avancer aucun fait', (_libelle, state) => {
    // Choix assume et verrouille : 'annule' et 'termine' sont des etats
    // terminaux du job, mais aucun n est porteur de sens a lui seul — ce sont
    // siteEnLigne / mailRedige / adresse / envoi qui disent ce qui a
    // vraiment avance. Sans qu aucun d eux ait bouge, nommer autre chose que
    // « jamais » inventerait un fait qu aucun code ne peut rendre vrai.
    const r = etatLigne(ligne({ job: { state, lastError: null, rang: 1 } }));

    expect(r.etat).toEqual({ nom: 'jamais' });
  });
});
```

- [ ] **Étape 3 : Lancer les tests et vérifier qu'ils échouent**

```bash
pnpm --filter @prospeo/dashboard test
```

Attendu : échec de résolution du module `./campagne.js`. **Pas** une erreur d'assertion.

- [ ] **Étape 4 : Écrire l'implémentation**

Créer `apps/dashboard/src/domain/campagne.ts` :

```ts
import type { Enums } from '@prospeo/db';

/**
 * Le cœur testable de l'écran de campagne : qui entre dans le lot, et où en
 * est chaque ligne.
 *
 * **Aucun accès réseau ici.** Ce module reçoit des faits et rend des états —
 * même partage des rôles qu'entre `data/queries.ts` et `domain/prospect.ts`.
 * C'est ce qui permet de prouver les règles de D3 et D9 sans base.
 */

export type SegmentEtat = 'vide' | 'en_cours' | 'ok' | 'echec' | 'bloque';

/**
 * L'état d'une ligne, en union discriminée plutôt qu'en chaîne.
 *
 * Une chaîne obligerait l'écran à la comparer à des littéraux, et rien
 * n'empêcherait d'en inventer un huitième. Ici, ajouter un état sans traiter
 * son rendu ne compile pas.
 */
export type EtatLigne =
  | { nom: 'jamais' }
  | { nom: 'en_file'; rang: number }
  | { nom: 'site_en_cours'; etape: Enums<'deployment_step'> }
  | { nom: 'site_echec'; detail: string }
  | { nom: 'mail_a_relire' }
  | { nom: 'adresse_manquante' }
  | { nom: 'envoi_incertain' }
  | { nom: 'envoi_echec' }
  | { nom: 'envoye'; le: string };

export interface FaitsProspect {
  prospectId: string;
  denomination: string;
  ville: string;
  tradeSlug: string;
  /** `null` : jamais scoré. Ce n'est pas zéro — voir `classerLot`. */
  score: number | null;
  presence: Enums<'web_presence_category'> | null;
  statut: Enums<'pipeline_status'>;
  aInteraction: boolean;
  aMessage: boolean;
  sitePublie: boolean;
}

export interface Lot {
  lignes: FaitsProspect[];
  /**
   * Combien de prospects auraient été éligibles s'ils avaient un score.
   *
   * Ce compte porte une promesse — « les scorer les ferait entrer » — et ne
   * doit donc contenir QUE des prospects que le scoring débloquerait
   * réellement. Un prospect en « ne pas contacter » n'en fait pas partie.
   */
  sansScore: number;
}

/** Tout sauf le score : la partie de D3 qu'un scoring ne changerait pas. */
function eligibleHorsScore(f: FaitsProspect): boolean {
  return (
    f.statut === 'a_contacter' && !f.aInteraction && !f.aMessage && !f.sitePublie
  );
}

export function classerLot(faits: readonly FaitsProspect[], taille: number): Lot {
  const recevables = faits.filter(eligibleHorsScore);

  return {
    lignes: recevables
      .filter((f): f is FaitsProspect & { score: number } => f.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, taille),
    sansScore: recevables.filter((f) => f.score === null).length,
  };
}

export interface FaitsLigne {
  job: { state: Enums<'campaign_job_state'>; lastError: string | null; rang: number } | null;
  derniereEtape: {
    step: Enums<'deployment_step'>;
    outcome: Enums<'deployment_outcome'>;
    detail: string | null;
  } | null;
  siteEnLigne: boolean;
  mailRedige: boolean;
  /** `null` : ni collectée ni saisie. Une absence, pas un échec (D9). */
  adresse: string | null;
  envoi: { state: Enums<'send_state'>; sentAt: string | null } | null;
}

/**
 * Le segment « site », depuis son seul fait d'aboutissement et, à défaut,
 * l'avancement du job.
 *
 * `siteEnLigne` est la vérité terrain : un job qui échoue APRÈS coup (un
 * rejeu, par exemple) ne doit jamais l'écraser. Le job n'est consulté que
 * quand ce fait ne tranche pas encore.
 */
function segmentSite(f: FaitsLigne): SegmentEtat {
  if (f.siteEnLigne) return 'ok';
  if (f.job === null) return 'vide';
  if (f.job.state === 'echoue') return 'echec';
  if (f.job.state === 'en_cours') return 'en_cours';
  // 'en_attente', 'termine', 'annule' : rien de plus precis a dire ici que
  // « pas encore en ligne » — le badge, lui, nomme l'attente s'il y en a une.
  return 'vide';
}

/** Le segment « mail », depuis son seul fait : rien d'autre ne le fait varier. */
function segmentMail(f: FaitsLigne): SegmentEtat {
  return f.mailRedige ? 'ok' : 'vide';
}

/**
 * Le segment « envoi », depuis l'envoi lui-même et l'adresse qui le
 * conditionne.
 *
 * Bloqué ≠ échoué (D9, et le test « distingue BLOQUE de ECHOUE ») : une
 * adresse manquante attend un humain, elle n'a rien raté. Ce segment ne rend
 * donc 'bloque' que si le mail est prêt à partir et qu'aucun envoi n'a
 * encore été tenté.
 */
function segmentEnvoi(f: FaitsLigne): SegmentEtat {
  if (f.envoi !== null) {
    if (f.envoi.state === 'envoye') return 'ok';
    if (f.envoi.state === 'echoue') return 'echec';
    return 'en_cours'; // f.envoi.state === 'en_cours'
  }
  return f.mailRedige && f.adresse === null ? 'bloque' : 'vide';
}

/**
 * Le badge, choisi APRÈS les trois segments et par ordre de priorité : c'est
 * la seule chose que la ligne dit en un mot, et c'est là — et seulement
 * là — que l'ordre compte.
 */
function choisirEtat(
  f: FaitsLigne,
  site: SegmentEtat,
  mail: SegmentEtat,
  envoi: SegmentEtat,
): EtatLigne {
  if (f.envoi !== null && f.envoi.state === 'envoye') {
    return { nom: 'envoye', le: f.envoi.sentAt ?? '' };
  }

  if (envoi === 'echec') return { nom: 'envoi_echec' };
  if (envoi === 'en_cours') return { nom: 'envoi_incertain' };

  if (f.job !== null && f.job.state === 'echoue') {
    // Choix assumé : un job en échec reste l'information la plus actionnable
    // et la plus récente, même quand le site est déjà en ligne et le mail
    // déjà prêt (`site` et `mail` le disent, honnêtement, à 'ok'). Le badge
    // nomme la dernière tentative, pas l'état du site — les deux cohabitent
    // sans se contredire : « échec » ne prétend jamais que le site est tombé.
    return {
      nom: 'site_echec',
      // Le détail de l'étape prime sur `last_error` : il vient de l'API qui a
      // refusé, là où `last_error` porte le préfixe d'étape ajouté par le
      // worker. C'est la phrase que la ligne affiche.
      detail: f.derniereEtape?.detail ?? f.job.lastError ?? '',
    };
  }

  if (site === 'ok' && mail === 'ok') {
    return envoi === 'bloque' ? { nom: 'adresse_manquante' } : { nom: 'mail_a_relire' };
  }

  if (f.job !== null && f.job.state === 'en_cours') {
    return {
      nom: 'site_en_cours',
      // `redaction` est la première étape de `deployment_step` : un job pris
      // dont aucun événement n'est encore écrit en est là, et non nulle part.
      etape: f.derniereEtape?.step ?? 'redaction',
    };
  }

  if (f.job !== null && f.job.state === 'en_attente') {
    return { nom: 'en_file', rang: f.job.rang };
  }

  // Reste ici : aucun job (jamais rien demandé), ou un job 'termine'/'annule'
  // qui n'a fait avancer ni site, ni mail, ni adresse, ni envoi. Choix
  // assumé et verrouillé par les tests : sans qu'aucun de ces faits ait
  // bougé, nommer autre chose que « jamais » inventerait un fait qu'aucun
  // code ne peut rendre vrai.
  return { nom: 'jamais' };
}

export function etatLigne(f: FaitsLigne): {
  site: SegmentEtat;
  mail: SegmentEtat;
  envoi: SegmentEtat;
  etat: EtatLigne;
} {
  const site = segmentSite(f);
  const mail = segmentMail(f);
  const envoi = segmentEnvoi(f);

  return { site, mail, envoi, etat: choisirEtat(f, site, mail, envoi) };
}
```

- [ ] **Étape 5 : Lancer les tests et vérifier qu'ils passent**

```bash
pnpm --filter @prospeo/dashboard test
```

Attendu : les tests de `classerLot` et `etatLigne` verts, le reste de la suite inchangé.

- [ ] **Étape 6 : Prouver que chaque règle de doctrine peut échouer**

Ce sont les assertions qui gardent la doctrine ; elles doivent être prouvées, pas supposées.

1. dans `classerLot`, remplacer `.filter((f) => f.score !== null)` par `.map((f) => ({ ...f, score: f.score ?? 0 }))` → le test « exclut et COMPTE les prospects jamais scores » doit rougir ;
2. dans `classerLot`, calculer `sansScore` sur `faits` au lieu de `recevables` → le test « ne compte pas comme sans score un prospect deja disqualifie » doit rougir ;
3. dans `segmentEnvoi`, remplacer `return 'bloque'` par `return 'echec'` → le test « distingue BLOQUE de ECHOUE » doit rougir ;
4. dans `segmentEnvoi`, supprimer la branche `state === 'en_cours'` → le test « envoi incertain » doit rougir ;
5. dans `segmentEnvoi`, ne plus rendre `'echec'` sur `state === 'echoue'` → le test « rend le segment envoi a « echec » » doit rougir ;
6. dans `segmentMail`, faire dépendre le résultat de `f.job?.state === 'echoue'` (réintroduire le bug IMPORTANT) → « garde le segment mail a « ok » quand un job echoue » doit rougir ;
7. dans `segmentSite`, faire passer la vérification de `f.job.state === 'echoue'` avant celle de `f.siteEnLigne` (réintroduire le bug CRITIQUE côté site) → « garde le badge d echec de job au-dessus de « mail a relire », meme site en ligne » doit rougir sur `r.site` ;
8. dans `choisirEtat`, faire retourner autre chose que `{ nom: 'jamais' }` pour un job `'termine'`/`'annule'` → les deux cas du test `it.each` « retombe sur « jamais » » doivent rougir.

Après chaque cassure : `pnpm --filter @prospeo/dashboard test`, observer le rouge, restaurer, observer le vert.

- [ ] **Étape 7 : Commit**

```bash
git add apps/dashboard/src/domain/campagne.ts apps/dashboard/src/domain/campagne.test.ts
git commit -m "feat(campagne): qui entre dans le lot, et ou en est chaque ligne

Un prospect jamais score n est pas un prospect a zero : il sort du lot et
son exclusion se compte. Le compte ne retient que ceux qu un scoring
debloquerait vraiment — y verser un « ne pas contacter » promettrait une
remediation qui n existe pas.

Bloque n est pas echoue : une adresse manquante attend un humain, elle n a
rien rate. Et un envoi reste « en cours » est un troisieme etat honnete —
le presenter comme parti ou comme jamais parti mentirait dans les deux sens.

Chaque segment (site, mail, envoi) se derive desormais de ses propres
faits, et le badge se choisit ensuite par ordre de priorite : un job en
echec ne peut plus effacer un mail deja redige ni un site deja en ligne,
et un envoi echoue rend son propre etat (`envoi_echec`) plutot que de se
confondre avec « mail a relire ».

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 7 : `data/campagne.ts` — les lectures

**Files:**
- Create: `apps/dashboard/src/data/campagne.ts`
- Test: `apps/dashboard/src/data/campagne.test.ts`

**Interfaces:**
- Consumes: `FaitsProspect`, `FaitsLigne` (tâche 6) ; `fetchAllRows`, `RangeReader` de `./paginate.js`.
- Produces:
  - `export const CAMPAGNE_SELECT: string`
  - `export function toFaitsProspect(raw: unknown): FaitsProspect | null`
  - `export function campagneRangeReader(client: SupabaseClient<Database>): RangeReader<unknown>`
  - `export interface LectureCampagne { faits: FaitsProspect[]; lignes: Map<string, FaitsLigne>; totalQualifies: number }`
  - `export async function fetchCampagne(client: SupabaseClient<Database>): Promise<LectureCampagne>`
  - `export async function fetchHeartbeat(client: SupabaseClient<Database>): Promise<{ beatAt: string; inFlight: number } | null>`

- [ ] **Étape 1 : Écrire les tests des convertisseurs**

Créer `apps/dashboard/src/data/campagne.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { toFaitsProspect } from './campagne.js';

describe('toFaitsProspect', () => {
  it('lit un score absent comme null et jamais comme zero', () => {
    // `prospect_score` est une relation qui peut ne pas exister. La ramener a
    // 0 rendrait un prospect jamais score indistinguable d un prospect nul.
    const f = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      prospect_score: null,
      web_presence: { category: 'none' },
      prospect_pipeline: { status: 'a_contacter' },
      interaction: [],
      generated_message: [],
      prospect_site: null,
    });

    expect(f?.score).toBeNull();
  });

  it('lit une relation un-a-un rendue en tableau d un element', () => {
    // PostgREST rend ces relations tantot en objet, tantot en tableau selon
    // la requete : les deux formes doivent produire le meme fait.
    const f = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      prospect_score: [{ total: 86 }],
      web_presence: [{ category: 'dead_site' }],
      prospect_pipeline: [{ status: 'a_contacter' }],
      interaction: [],
      generated_message: [],
      prospect_site: null,
    });

    expect(f).toMatchObject({ score: 86, presence: 'dead_site', statut: 'a_contacter' });
  });

  it('traite un pipeline absent comme « a contacter », valeur par defaut de la base', () => {
    const f = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      prospect_score: { total: 50 },
      web_presence: null,
      prospect_pipeline: null,
      interaction: [],
      generated_message: [],
      prospect_site: null,
    });

    expect(f?.statut).toBe('a_contacter');
  });

  it('ne compte comme site publie qu une ligne avec published_at', () => {
    const enCours = toFaitsProspect({
      id: 'p-1',
      denomination: 'Aquatech',
      city: 'Nantes',
      trade_slug: 'plombier',
      prospect_score: { total: 50 },
      web_presence: null,
      prospect_pipeline: null,
      interaction: [],
      generated_message: [],
      prospect_site: { published_at: null, deployment_url: null },
    });

    expect(enCours?.sitePublie).toBe(false);
  });

  it('ecarte une ligne sans identifiant plutot que de la forcer', () => {
    // Meme doctrine que `typeDeTelephone` dans queries.ts : une ligne que la
    // base ne nomme pas ne peut pas peser sur un classement.
    expect(toFaitsProspect({ denomination: 'Sans id' })).toBeNull();
  });
});
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent**

```bash
pnpm --filter @prospeo/dashboard test
```

Attendu : échec de résolution de `./campagne.js` dans `data/`.

- [ ] **Étape 3 : Écrire l'implémentation**

Créer `apps/dashboard/src/data/campagne.ts`. Les helpers `unique`, `texte` et `nombre` sont **repris de `data/deployments.ts`** — les relire là-bas et les réutiliser à l'identique plutôt que d'en écrire une variante.

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';
import type { FaitsLigne, FaitsProspect } from '../domain/campagne.js';
import { fetchAllRows, type RangeReader } from './paginate.js';

/**
 * Lectures Supabase de l'écran de campagne.
 *
 * Aucune logique d'état ici : c'est `domain/campagne.ts` qui décide. Ce
 * fichier ne fait que demander les bonnes colonnes et les mettre en forme —
 * même partage des rôles qu'entre `data/deployments.ts` et
 * `domain/deployment.ts`.
 */

/**
 * Les satellites dans la MÊME requête, et non en lectures séparées.
 *
 * Même raison que `PROSPECT_SELECT` et `DEPLOYMENT_SELECT` : des lectures
 * séparées les prendraient à des instants différents, et une interaction
 * écrite entre les deux passerait pour absente d'une ligne qui l'a pourtant
 * déjà — ce qui ferait entrer dans le lot un prospect déjà contacté.
 *
 * `interaction` et `generated_message` sont plafonnées à 1 : on ne veut
 * savoir que s'il en existe, pas les lire.
 */
export const CAMPAGNE_SELECT = [
  'id',
  'denomination',
  'city',
  'trade_slug',
  'prospect_score(total)',
  'web_presence(category)',
  'prospect_pipeline(status)',
  'prospect_site(published_at,deployment_url)',
  'prospect_contact(email)',
  'interaction(id)',
  'generated_message(id)',
].join(',');

function unique(value: unknown): Record<string, unknown> | null {
  const cible = Array.isArray(value) ? value[0] : value;
  return typeof cible === 'object' && cible !== null ? (cible as Record<string, unknown>) : null;
}

function texte(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nombre(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonVide(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function toFaitsProspect(raw: unknown): FaitsProspect | null {
  const o = unique(raw);
  if (o === null) return null;

  const id = texte(o['id']);
  // Une ligne sans identifiant ne peut ni être classée ni être cliquée :
  // l'écarter vaut mieux que de lui en fabriquer un.
  if (id === null) return null;

  const site = unique(o['prospect_site']);
  const pipeline = unique(o['prospect_pipeline']);

  return {
    prospectId: id,
    denomination: texte(o['denomination']) ?? '',
    ville: texte(o['city']) ?? '',
    tradeSlug: texte(o['trade_slug']) ?? '',
    // `null` traversé tel quel : c'est tout l'enjeu de D3.
    score: nombre(unique(o['prospect_score'])?.['total']),
    presence: (texte(unique(o['web_presence'])?.['category']) ??
      null) as Enums<'web_presence_category'> | null,
    // `a_contacter` est le défaut de la colonne en base : une ligne
    // `prospect_pipeline` absente signifie « pas encore suivi », ce qui EST
    // « à contacter ».
    statut: (texte(pipeline?.['status']) ?? 'a_contacter') as Enums<'pipeline_status'>,
    aInteraction: nonVide(o['interaction']),
    aMessage: nonVide(o['generated_message']),
    // Un dépôt créé n'est pas un site publié : seule `published_at` le dit.
    sitePublie: site !== null && texte(site['published_at']) !== null,
  };
}

/** Construit le lecteur de tranches attendu par `fetchAllRows` — voir `deploymentRangeReader`. */
export function campagneRangeReader(client: SupabaseClient<Database>): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('prospect')
      .select(CAMPAGNE_SELECT)
      .order('id', { ascending: true })
      .limit(1, { referencedTable: 'interaction' })
      .limit(1, { referencedTable: 'generated_message' })
      .range(from, to) as unknown as ReturnType<RangeReader<unknown>>;
}

export async function fetchHeartbeat(
  client: SupabaseClient<Database>,
): Promise<{ beatAt: string; inFlight: number } | null> {
  const { data, error } = await client
    .from('worker_heartbeat')
    .select('beat_at,in_flight')
    .eq('id', true)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  if (data === null) return null;
  return { beatAt: data.beat_at, inFlight: data.in_flight };
}
```

Ajouter, dans le même fichier, la composition des `FaitsLigne` :

```ts
type JobActif = { state: Enums<'campaign_job_state'>; lastError: string | null; rang: number };

/**
 * Les jobs qui pèsent sur l'écran, et le RANG de chacun dans la file.
 *
 * Le rang ne se lit nulle part : il se calcule à la lecture, sur l'ordre de
 * `requested_at`. Le stocker en base obligerait à réécrire toutes les lignes
 * à chaque prise — et il serait faux entre deux écritures.
 *
 * Seuls les jobs ACTIFS et le dernier échec comptent : un job terminé est
 * déjà visible par ses effets (site en ligne, message écrit), et l'afficher
 * ferait dire à la ligne deux choses à la fois.
 */
async function fetchJobs(client: SupabaseClient<Database>): Promise<Map<string, JobActif>> {
  const { data, error } = await client
    .from('campaign_job')
    .select('prospect_id,state,last_error,requested_at')
    .in('state', ['en_attente', 'en_cours', 'echoue'])
    .order('requested_at', { ascending: true });
  if (error !== null) throw new Error(error.message);

  const jobs = new Map<string, JobActif>();
  let rang = 0;
  for (const r of data ?? []) {
    // Le rang ne se compte QUE sur l'attente : un job en cours n'attend pas,
    // et un job échoué encore moins. Les inclure gonflerait le rang annoncé
    // et ferait mentir « 3e » sur le temps restant.
    if (r.state === 'en_attente') rang += 1;
    jobs.set(r.prospect_id, {
      state: r.state,
      lastError: r.last_error,
      rang: r.state === 'en_attente' ? rang : 0,
    });
  }
  return jobs;
}

/** Le dernier événement de déploiement de chaque prospect. */
async function fetchDernieresEtapes(
  client: SupabaseClient<Database>,
): Promise<Map<string, { step: Enums<'deployment_step'>; outcome: Enums<'deployment_outcome'>; detail: string | null }>> {
  // Plafonné comme dans `data/deployments.ts` : le journal grossit à chaque
  // passage du worker, et l'écran n'a besoin que du dernier par prospect.
  const { data, error } = await client
    .from('deployment_event')
    .select('prospect_id,step,outcome,detail,occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(500);
  if (error !== null) throw new Error(error.message);

  const etapes = new Map<
    string,
    { step: Enums<'deployment_step'>; outcome: Enums<'deployment_outcome'>; detail: string | null }
  >();
  for (const r of data ?? []) {
    // Tri décroissant : la PREMIÈRE ligne vue pour un prospect est la plus
    // récente. Les suivantes ne l'écrasent pas.
    if (etapes.has(r.prospect_id)) continue;
    etapes.set(r.prospect_id, { step: r.step, outcome: r.outcome, detail: r.detail });
  }
  return etapes;
}

/** Le dernier envoi de chaque prospect, tous états confondus. */
async function fetchEnvois(
  client: SupabaseClient<Database>,
): Promise<Map<string, { state: Enums<'send_state'>; sentAt: string | null }>> {
  const { data, error } = await client
    .from('message_send')
    .select('prospect_id,state,sent_at,started_at')
    .order('started_at', { ascending: false });
  if (error !== null) throw new Error(error.message);

  const envois = new Map<string, { state: Enums<'send_state'>; sentAt: string | null }>();
  for (const r of data ?? []) {
    if (envois.has(r.prospect_id)) continue;
    envois.set(r.prospect_id, { state: r.state, sentAt: r.sent_at });
  }
  return envois;
}

export interface LectureCampagne {
  faits: FaitsProspect[];
  lignes: Map<string, FaitsLigne>;
  /**
   * Combien de prospects sont qualifiés dans la base, tous statuts confondus.
   *
   * C'est ce qui permet à l'écran de distinguer « le lot est fini » de « la
   * base est vide » — deux absences de natures différentes, que le seul
   * `faits.length === 0` confondrait.
   */
  totalQualifies: number;
}

export async function fetchCampagne(
  client: SupabaseClient<Database>,
): Promise<LectureCampagne> {
  // Les quatre lectures en parallèle : elles sont indépendantes, et les
  // enchaîner tripleraient l'attente au premier affichage.
  const [brut, jobs, etapes, envois] = await Promise.all([
    fetchAllRows<unknown>(campagneRangeReader(client), {}),
    fetchJobs(client),
    fetchDernieresEtapes(client),
    fetchEnvois(client),
  ]);

  const faits: FaitsProspect[] = [];
  const lignes = new Map<string, FaitsLigne>();

  for (const row of brut) {
    const f = toFaitsProspect(row);
    if (f === null) continue;
    faits.push(f);

    const o = unique(row);
    const site = unique(o?.['prospect_site']);
    lignes.set(f.prospectId, {
      job: jobs.get(f.prospectId) ?? null,
      derniereEtape: etapes.get(f.prospectId) ?? null,
      // « En ligne » veut dire joignable, pas « dépôt créé » : c'est l'URL
      // qui le prouve, et elle n'est écrite qu'une fois le build terminé.
      siteEnLigne: site !== null && texte(site['deployment_url']) !== null,
      mailRedige: nonVide(o?.['generated_message']),
      adresse: texte(unique(o?.['prospect_contact'])?.['email']),
      envoi: envois.get(f.prospectId) ?? null,
    });
  }

  return { faits, lignes, totalQualifies: faits.length };
}
```

> **`fetchAllRows` prend `{}` en options :** ouvrir `data/paginate.ts` et vérifier la forme réelle de `FetchAllOptions` avant d'écrire cet appel — `fetchDeployments` en donne l'usage exact.
>
> **`mailRedige` s'appuie sur `generated_message` déjà chargé** par `CAMPAGNE_SELECT`, plafonné à 1 : on ne veut savoir que s'il en existe un, pas le lire. Le contenu du message est l'affaire du panneau de relecture, qui est un lot ultérieur.

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

```bash
pnpm --filter @prospeo/dashboard test
pnpm -r typecheck
```

Attendu : les cinq tests de `toFaitsProspect` verts, aucune erreur de type.

- [ ] **Étape 5 : Prouver les assertions**

1. remplacer `score: nombre(...)` par `score: nombre(...) ?? 0` → le test « score absent comme null » doit rougir ;
2. remplacer `unique()` par un accès direct sans gérer le tableau → le test « relation rendue en tableau » doit rougir ;
3. remplacer `texte(site['published_at']) !== null` par `site !== null` → le test « ne compte comme site publie » doit rougir.

Casser, lancer, observer le rouge, restaurer, observer le vert.

- [ ] **Étape 6 : Commit**

```bash
git add apps/dashboard/src/data/campagne.ts apps/dashboard/src/data/campagne.test.ts
git commit -m "feat(campagne): les lectures, et un score absent qui reste absent

Les satellites voyagent dans la meme requete : des lectures separees les
prendraient a des instants differents, et une interaction ecrite entre les
deux ferait entrer dans le lot un prospect deja contacte.

Un depot cree n est pas un site publie — seule published_at le dit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 8 : Les clés d'interface

**Files:**
- Modify: `apps/dashboard/src/i18n/fr.ts`
- Modify: `apps/dashboard/src/i18n/en.ts`

**Interfaces:**
- Produces: les clés `campagne.*` et `nav.campagne`, consommées par les tâches 9 à 11.

> **Cette tâche vient AVANT les composants, et ce n'est pas un détail d'ordonnancement.** La règle du dépôt est que le texte d'une assertion se lit dans `fr.ts` — donc `fr.ts` doit exister d'abord. Écrire un test contre une chaîne recopiée depuis un plan est exactement ce qui a produit quatre assertions mortes sur cinq aux lots précédents.

- [ ] **Étape 1 : Ajouter les clés françaises**

Dans `apps/dashboard/src/i18n/fr.ts`, à la suite du bloc `deploiements.*`, ajouter les clés ci-dessous. **Les libellés proviennent des deux artboards approuvés** — les relire dans `docs/design/maquettes/rendu/Campagne.html` et `rendu/CampagneEtats.html` plutôt que de les inventer.

```ts
  'nav.campagne': 'Campagne',

  'campagne.title': 'Campagne de prospection',
  'campagne.subtitle':
    "Les 20 prospects les mieux notés que personne n'a encore touchés. Un site, un mail, un envoi — dans cet ordre.",

  'campagne.col.prospect': 'Prospect',
  'campagne.col.piste': 'Site · Mail · Envoi',
  'campagne.col.etat': 'État',

  'campagne.action.deployer': 'Déployer',
  'campagne.action.deployerSelection': 'Déployer la sélection',
  'campagne.action.detail': 'Détail',
  'campagne.action.rejouer': 'Rejouer',
  'campagne.action.retirer': 'Retirer',

  'campagne.etat.jamais': 'Jamais déployé',
  'campagne.etat.enFile': "En file d'attente · {rang}e",
  'campagne.etat.siteEnCours': 'Site en cours',
  'campagne.etat.siteEchec': 'Déploiement en échec',
  'campagne.etat.mailARelire': 'Mail à relire',
  'campagne.etat.adresseManquante': 'Adresse manquante',
  'campagne.etat.envoiIncertain': 'Envoi incertain',
  'campagne.etat.envoiEchec': 'Envoi en échec',
  'campagne.etat.envoye': 'Envoyé',

  'campagne.piste.site': 'Site',
  'campagne.piste.mail': 'Mail',
  'campagne.piste.envoi': 'Envoi',
  'campagne.piste.segment': '{segment} : {etat}',
  'campagne.piste.etat.vide': 'pas commencé',
  'campagne.piste.etat.enCours': 'en cours',
  'campagne.piste.etat.ok': 'terminé',
  'campagne.piste.etat.echec': 'en échec',
  'campagne.piste.etat.bloque': 'en attente d’une information',

  'campagne.worker.ecoute': "Collector à l'écoute",
  'campagne.worker.arret': "Collector à l'arrêt",
  'campagne.worker.arret.raison':
    'Aucun signe de vie depuis {minutes} min. Les demandes déposées maintenant attendront son retour.',
  'campagne.worker.arret.remede':
    'Le relancer avec pnpm --filter @prospeo/collector start worker. Rien n’est perdu : la file vit en base.',

  'campagne.sansScore':
    "{count} prospects n'ont jamais été scorés : ils ne peuvent pas être classés, et n'apparaissent pas dans ce lot.",
  'campagne.sansScore_one':
    "{count} prospect n'a jamais été scoré : il ne peut pas être classé, et n'apparaît pas dans ce lot.",

  'campagne.vide.lotFini': 'Le lot est fini',
  'campagne.vide.lotFini.detail': 'Les prospects les mieux notés ont tous été touchés.',
  'campagne.vide.aucunQualifie': 'Aucun prospect qualifié',
  'campagne.vide.aucunQualifie.detail':
    "La base n'en contient aucun pour ce métier. Rien n'a été filtré : il n'y a rien.",
```

> **Le pluriel de `campagne.sansScore` :** la forme `_one` est obligatoire dès qu'une clé porte `{count}` — `i18n.test.ts` vérifie que toute forme `_one` a sa forme plurielle, et `translate` choisit selon la règle de la langue (le français met au singulier tout ce qui est strictement inférieur à deux).

- [ ] **Étape 2 : Ajouter les traductions anglaises**

Dans `apps/dashboard/src/i18n/en.ts`, ajouter **exactement les mêmes clés**, traduites. Une clé absente laisse du français dans un écran anglais, et `i18n.test.ts` le refuse.

- [ ] **Étape 3 : Lancer la suite**

```bash
pnpm --filter @prospeo/dashboard test
```

Attendu : **échec**, et c'est le comportement voulu. `i18n.test.ts` signale que ces clés n'ont aucun consommateur hors tests. C'est la garde qui empêche un catalogue de se remplir de clés mortes.

**Noter la liste des clés signalées** : les tâches 9 à 11 doivent toutes les consommer. Une clé encore signalée à la fin du lot est une clé à supprimer, pas à allowlister.

- [ ] **Étape 4 : Ne pas commiter seul**

Cette tâche laisse la suite rouge par construction. Elle se commite **avec la tâche 9**, qui consomme les clés. Passer à la tâche suivante sans commiter.

---

## Tâche 9 : `PisteCampagne` et `CampagneScreen` en lecture seule

**Files:**
- Create: `apps/dashboard/src/ui/PisteCampagne.tsx`, `.module.css`, `.test.tsx`
- Create: `apps/dashboard/src/screens/CampagneScreen.tsx`, `.module.css`, `.test.tsx`
- Modify: `apps/dashboard/src/ui/Nav.tsx`, `apps/dashboard/src/ui/Nav.test.tsx`
- Modify: `apps/dashboard/src/App.tsx`
- Create: `apps/dashboard/src/data/useCampagne.ts`

**Interfaces:**
- Consumes: `SegmentEtat`, `EtatLigne`, `classerLot`, `etatLigne` (tâche 6) ; `fetchCampagne`, `fetchHeartbeat` (tâche 7) ; les clés de la tâche 8.
- Produces:
  - `export function PisteCampagne(props: { site: SegmentEtat; mail: SegmentEtat; envoi: SegmentEtat }): ReactElement`
  - `export interface CampagneScreenProps { lot: Lot; lignes: Map<string, FaitsLigne>; totalQualifies: number; heartbeat: { beatAt: string; inFlight: number } | null; onSignOut: () => void; nav: ReactNode }`
  - `export function CampagneScreen(props: CampagneScreenProps): ReactElement`
  - `export type Vue = 'today' | 'campagne' | 'deploiements' | 'gabarit'`

> **`totalQualifies` est une propriété à part entière, et non une dérivation de `lot.lignes.length`.** C'est ce qui sépare « les vingt mieux notés ont tous été touchés » de « la base ne contient personne ». Les confondre est exactement l'erreur que la doctrine des absences interdit, et un tableau vide ne porte pas cette information.

> **Aucun bouton n'agit dans cette tâche.** L'écran lit. Le déclenchement est la tâche 11 — livrer une action qui n'a pas encore de file derrière elle serait une affordance qui annonce un fait qu'aucun code ne rend vrai.

- [ ] **Étape 1 : Écrire le test de `PisteCampagne`**

Créer `apps/dashboard/src/ui/PisteCampagne.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import { PisteCampagne } from './PisteCampagne.js';

describe('PisteCampagne', () => {
  it('donne a chaque segment un nom accessible, la couleur ne disant jamais seule l etat', () => {
    renderWithPreferences(<PisteCampagne site="ok" mail="en_cours" envoi="bloque" />);

    // Trois segments, trois noms distincts : un lecteur d'ecran doit pouvoir
    // dire ou en est la ligne sans voir la couleur.
    const segments = screen.getAllByRole('img');
    expect(segments).toHaveLength(3);
  });

  it('distingue « bloque » de « en echec » dans le texte accessible', () => {
    // Ouvrir apps/dashboard/src/i18n/fr.ts et LIRE les valeurs de
    // `campagne.piste.etat.bloque` et `campagne.piste.etat.echec`. Les
    // recopier ici. NE PAS les inventer depuis ce plan.
    const bloque = 'REMPLACER PAR LA VALEUR LUE DANS fr.ts';

    renderWithPreferences(<PisteCampagne site="ok" mail="ok" envoi="bloque" />);

    expect(screen.getByLabelText(new RegExp(bloque, 'i'))).toBeTruthy();
  });
});
```

> **L'étape suivante est de remplacer `'REMPLACER PAR LA VALEUR LUE DANS fr.ts'` par la vraie valeur, lue dans le fichier.** Un test qui garde ce littéral échouera — c'est voulu : il ne doit pas être possible de l'oublier.

- [ ] **Étape 2 : Lancer et vérifier l'échec**

```bash
pnpm --filter @prospeo/dashboard test
```

Attendu : échec de résolution de `./PisteCampagne.js`.

- [ ] **Étape 3 : Écrire `PisteCampagne`**

Créer `apps/dashboard/src/ui/PisteCampagne.tsx` :

```tsx
import type { ReactElement } from 'react';
import type { SegmentEtat } from '../domain/campagne.js';
import type { TranslationKey } from '../i18n/translate.js';
import { useT } from './preferences.js';
import styles from './PisteCampagne.module.css';

/**
 * Les trois segments d'une ligne de campagne : Site · Mail · Envoi.
 *
 * **Trois segments et non cinq.** Les cinq étapes de déploiement restent
 * celles de l'écran « Déploiements » ; les redessiner ici créerait un second
 * vocabulaire pour le même fait (D8). Le détail des cinq s'ouvre au clic sur
 * la ligne.
 *
 * **Chaque segment porte un `aria-label`** : la couleur n'est jamais le seul
 * indicateur d'un état, et « bloqué » (tirets ambre) doit se distinguer de
 * « en échec » (plein rouge) autrement que par la teinte.
 */

const CLE_ETAT: Record<SegmentEtat, TranslationKey> = {
  vide: 'campagne.piste.etat.vide',
  en_cours: 'campagne.piste.etat.enCours',
  ok: 'campagne.piste.etat.ok',
  echec: 'campagne.piste.etat.echec',
  bloque: 'campagne.piste.etat.bloque',
};

const CLASSE: Record<SegmentEtat, string> = {
  vide: styles.vide,
  en_cours: styles.enCours,
  ok: styles.ok,
  echec: styles.echec,
  bloque: styles.bloque,
};

function Segment({ nom, etat }: { nom: TranslationKey; etat: SegmentEtat }) {
  const t = useT();
  return (
    <span
      // `role="img"` plutôt qu'un `div` muet : le segment PORTE une
      // information, il n'est pas décoratif.
      role="img"
      aria-label={t('campagne.piste.segment', { segment: t(nom), etat: t(CLE_ETAT[etat]) })}
      className={`${styles.segment} ${CLASSE[etat]}`}
    />
  );
}

export function PisteCampagne({
  site,
  mail,
  envoi,
}: {
  site: SegmentEtat;
  mail: SegmentEtat;
  envoi: SegmentEtat;
}): ReactElement {
  return (
    <div className={styles.piste}>
      <Segment nom="campagne.piste.site" etat={site} />
      <Segment nom="campagne.piste.mail" etat={mail} />
      <Segment nom="campagne.piste.envoi" etat={envoi} />
    </div>
  );
}
```

Créer `apps/dashboard/src/ui/PisteCampagne.module.css` — **uniquement des `var(--…)` de `theme.css`**, aucune couleur littérale (`guidelines.test.ts` le vérifie) :

```css
.piste {
  display: flex;
  gap: 3px;
}

.segment {
  width: 46px;
  height: 5px;
  border-radius: var(--radius-pill);
  flex: none;
}

.vide {
  background: var(--color-seg-empty);
}

.enCours {
  background: var(--color-accent);
}

.ok {
  background: var(--color-success);
}

.echec {
  background: var(--color-danger);
}

/*
 * Bloqué se distingue d'échoué par la FORME autant que par la teinte : des
 * tirets, pas un plein. Une adresse manquante attend un humain, elle n'a rien
 * raté — et un opérateur daltonien doit pouvoir le voir.
 */
.bloque {
  background: repeating-linear-gradient(
    90deg,
    var(--color-warning) 0 4px,
    var(--color-seg-empty) 4px 8px
  );
}
```

- [ ] **Étape 4 : Lire `fr.ts` et compléter le test**

Ouvrir `apps/dashboard/src/i18n/fr.ts`, lire la valeur de `campagne.piste.etat.bloque`, et remplacer le littéral `'REMPLACER PAR LA VALEUR LUE DANS fr.ts'` du test par cette valeur exacte.

```bash
pnpm --filter @prospeo/dashboard test
```

Attendu : les deux tests de `PisteCampagne` verts.

- [ ] **Étape 5 : Ajouter la quatrième vue au rail**

Dans `apps/dashboard/src/ui/Nav.tsx` :

1. étendre le type : `export type Vue = 'today' | 'campagne' | 'deploiements' | 'gabarit';`
2. ajouter `'campagne'` au tableau `VUES`, **en deuxième position** (l'ordre du tableau est celui du rail, et la maquette place Campagne entre Aujourd'hui et Déploiements) ;
3. ajouter l'icône, dans le même style de trait que les trois autres — grille de 20 px, `strokeWidth` 1.7, jamais d'emoji :

```tsx
function IconeCampagne() {
  return (
    <svg {...TRAIT}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 8l9 6 9-6" />
    </svg>
  );
}
```

4. ajouter l'entrée à `ENTREES`, en deuxième position :

```tsx
  { vue: 'campagne', libelleKey: 'nav.campagne', Icone: IconeCampagne },
```

Dans `apps/dashboard/src/ui/Nav.test.tsx`, étendre le test existant qui compte les entrées. **Lire d'abord ce test** pour voir la forme qu'il attend, puis y ajouter `campagne` — ne pas en écrire un second à côté.

- [ ] **Étape 6 : Écrire le test de `CampagneScreen`**

Créer `apps/dashboard/src/screens/CampagneScreen.test.tsx`. **Avant d'écrire les assertions, ouvrir `fr.ts` et lire les valeurs de `campagne.sansScore`, `campagne.vide.lotFini` et `campagne.vide.aucunQualifie`.**

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import { CampagneScreen } from './CampagneScreen.js';
import type { FaitsLigne, FaitsProspect } from '../domain/campagne.js';

function fait(surcharges: Partial<FaitsProspect> = {}): FaitsProspect {
  return {
    prospectId: 'p-1',
    denomination: 'Aquatech Nantes',
    ville: 'Nantes',
    tradeSlug: 'plombier',
    score: 86,
    presence: 'none',
    statut: 'a_contacter',
    aInteraction: false,
    aMessage: false,
    sitePublie: false,
    ...surcharges,
  };
}

const VIVANT = { beatAt: new Date().toISOString(), inFlight: 0 };

describe('CampagneScreen', () => {
  it('affiche une ligne par prospect du lot', () => {
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait()], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalQualifies={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText('Aquatech Nantes')).toBeTruthy();
  });

  it('nomme les prospects ecartes faute de score, au lieu de les taire', () => {
    // LIRE la valeur de `campagne.sansScore` dans fr.ts. Elle porte {count} :
    // asserter sur un fragment stable de la phrase, pas sur la phrase entiere
    // — `getByText` compare le texte ENTIER du noeud.
    const fragment = 'REMPLACER PAR UN FRAGMENT LU DANS fr.ts';

    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait()], sansScore: 3 }}
        lignes={new Map<string, FaitsLigne>()}
        totalQualifies={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText(new RegExp(fragment))).toBeTruthy();
  });

  it('ne montre rien sur les ecartes quand il n y en a aucun', () => {
    // Assertion negative, ecrite avec soin : `queryByText` rend `null` quand
    // rien ne correspond, et c est CE null qu on affirme. Un `getAllByText`
    // suivi d un `.length === 0` leverait avant d asserter.
    const fragment = 'REMPLACER PAR LE MEME FRAGMENT';

    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait()], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalQualifies={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.queryByText(new RegExp(fragment))).toBeNull();
  });

  it('distingue « le lot est fini » de « aucun prospect qualifie »', () => {
    // Deux vides de natures differentes, deux ecrans. « Pas encore » n est
    // pas « jamais ».
    const lotFini = 'REMPLACER PAR LA VALEUR LUE DANS fr.ts';

    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalQualifies={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText(lotFini)).toBeTruthy();
  });
});
```

- [ ] **Étape 6 bis : Ajouter le cinquième test, celui qui sépare les deux vides**

Le quatrième test ci-dessus montre « le lot est fini » avec `totalQualifies={12}`. Il lui faut son jumeau, sans quoi rien ne prouve que la distinction existe : un composant qui afficherait toujours « le lot est fini » les passerait tous les deux.

```tsx
  it('dit « aucun prospect qualifie » quand la base est vide, et non « lot fini »', () => {
    // Deux absences de natures differentes. Un tableau vide ne dit pas
    // laquelle : c est `totalQualifies` qui le porte, et le deriver de
    // `lot.lignes.length` recreerait exactement la confusion.
    const aucunQualifie = 'REMPLACER PAR LA VALEUR LUE DANS fr.ts';
    const lotFini = 'REMPLACER PAR LA VALEUR LUE DANS fr.ts';

    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalQualifies={0}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText(aucunQualifie)).toBeTruthy();
    expect(screen.queryByText(lotFini)).toBeNull();
  });
```

- [ ] **Étape 7 : Écrire `CampagneScreen`**

Créer `apps/dashboard/src/screens/CampagneScreen.tsx`. **Lire d'abord `DeploiementsScreen.tsx`** : il porte déjà l'`AppShell`, l'en-tête et le tableau, et c'est sa structure qu'on suit. La mise en page suit `docs/design/maquettes/rendu/Campagne.html` — **quand la maquette et le code divergent, la maquette gouverne.**

```tsx
import type { ReactElement, ReactNode } from 'react';
import type { EtatLigne, FaitsLigne, Lot } from '../domain/campagne.js';
import { etatLigne } from '../domain/campagne.js';
import type { TranslationKey } from '../i18n/translate.js';
import { AppShell } from '../ui/AppShell.js';
import { BandeConditions } from '../ui/BandeConditions.js';
import { PisteCampagne } from '../ui/PisteCampagne.js';
import { StatusBadge } from '../ui/kit/StatusBadge.js';
import { useT } from '../ui/preferences.js';
import styles from './CampagneScreen.module.css';

/**
 * L'écran de campagne.
 *
 * **Il lit, il n'agit pas encore** (lot 1) : les actions arrivent avec la
 * file, tâche 11. Livrer un bouton avant son exécutant produirait une
 * affordance qui annonce un fait qu'aucun code ne rend vrai.
 */

/** Le libellé d'un état. Une clé par variante : ajouter un état sans son libellé ne compile pas. */
function cleEtat(etat: EtatLigne): TranslationKey {
  switch (etat.nom) {
    case 'jamais':
      return 'campagne.etat.jamais';
    case 'en_file':
      return 'campagne.etat.enFile';
    case 'site_en_cours':
      return 'campagne.etat.siteEnCours';
    case 'site_echec':
      return 'campagne.etat.siteEchec';
    case 'mail_a_relire':
      return 'campagne.etat.mailARelire';
    case 'adresse_manquante':
      return 'campagne.etat.adresseManquante';
    case 'envoi_incertain':
      return 'campagne.etat.envoiIncertain';
    case 'envoi_echec':
      return 'campagne.etat.envoiEchec';
    case 'envoye':
      return 'campagne.etat.envoye';
  }
}

export interface CampagneScreenProps {
  lot: Lot;
  lignes: Map<string, FaitsLigne>;
  totalQualifies: number;
  heartbeat: { beatAt: string; inFlight: number } | null;
  onSignOut: () => void;
  nav: ReactNode;
}

/** L'état d'une ligne dont rien n'est encore connu : jamais touchée. */
const LIGNE_VIERGE: FaitsLigne = {
  job: null,
  derniereEtape: null,
  siteEnLigne: false,
  mailRedige: false,
  adresse: null,
  envoi: null,
};

export function CampagneScreen({
  lot,
  lignes,
  totalQualifies,
  heartbeat,
  onSignOut,
  nav,
}: CampagneScreenProps): ReactElement {
  const t = useT();
  const maintenant = new Date();

  return (
    <AppShell
      nav={nav}
      onSignOut={onSignOut}
      panel={null}
      list={
        <div className={styles.page}>
          <header className={styles.entete}>
            <h1 className={styles.titre}>{t('campagne.title')}</h1>
            <p className={styles.sousTitre}>{t('campagne.subtitle')}</p>
          </header>

          <BandeConditions heartbeat={heartbeat} maintenant={maintenant} />

          {lot.lignes.length === 0 ? (
            // Deux vides de natures différentes, deux écrans. Le second ne se
            // dérive PAS d'un tableau vide : `totalQualifies` le porte.
            <div className={styles.vide} role="status">
              <p className={styles.videTitre}>
                {totalQualifies === 0
                  ? t('campagne.vide.aucunQualifie')
                  : t('campagne.vide.lotFini')}
              </p>
              <p className={styles.videDetail}>
                {totalQualifies === 0
                  ? t('campagne.vide.aucunQualifie.detail')
                  : t('campagne.vide.lotFini.detail')}
              </p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('campagne.col.prospect')}</th>
                  <th scope="col">{t('campagne.col.piste')}</th>
                  <th scope="col">{t('campagne.col.etat')}</th>
                </tr>
              </thead>
              <tbody>
                {lot.lignes.map((p) => {
                  const r = etatLigne(lignes.get(p.prospectId) ?? LIGNE_VIERGE);
                  return (
                    <tr key={p.prospectId}>
                      <td>
                        <span className={styles.nom}>{p.denomination}</span>
                        <span className={styles.meta}>
                          {p.ville} · <span className={styles.score}>{p.score}</span>
                        </span>
                      </td>
                      <td>
                        <PisteCampagne site={r.site} mail={r.mail} envoi={r.envoi} />
                      </td>
                      <td>
                        {/* Le badge porte un MOT, jamais une couleur seule. */}
                        <StatusBadge>
                          {t(cleEtat(r.etat), r.etat.nom === 'en_file' ? { rang: r.etat.rang } : {})}
                        </StatusBadge>
                        {r.etat.nom === 'site_echec' ? (
                          // La cause est DANS la ligne, pas derrière un
                          // journal à ouvrir — même parti que D9 du
                          // chantier n°6.
                          <p className={styles.cause}>{r.etat.detail}</p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {lot.sansScore > 0 ? (
            <p className={styles.sansScore}>
              {t('campagne.sansScore', { count: lot.sansScore })}
            </p>
          ) : null}
        </div>
      }
    />
  );
}
```

> **Vérifier la signature de `StatusBadge`** avant d'écrire : ouvrir `apps/dashboard/src/ui/kit/StatusBadge.tsx`. Il est aujourd'hui bâti sur les sept statuts de `pipeline_status` et n'accepte peut-être pas un enfant libre. **Si c'est le cas, étendre le kit** — un second badge écrit à côté serait un dialecte, ce que le §1 des guidelines interdit explicitement.
>
> **`campagne.etat.enFile` porte `{rang}`** : c'est la seule clé de cet écran qui prenne un paramètre, d'où le ternaire sur `t()`. Passer un objet vide ailleurs évite d'avoir à écrire deux appels.

Créer `CampagneScreen.module.css` en reprenant les classes de `DeploiementsScreen.module.css` — **uniquement des `var(--…)`**, et `text-overflow: ellipsis` posé sur le nœud de texte et jamais sur un conteneur `flex` ou `grid` (`guidelines.test.ts` le vérifie).

- [ ] **Étape 8 : Brancher dans `App.tsx`**

Créer `apps/dashboard/src/data/useCampagne.ts` sur le patron **exact** de `useDeployments.ts` (le lire) : `enabled` pour éviter la lecture tant que la vue n'est pas affichée, trois états `loading` / `ready` / `error`, et un `reload`.

Il appelle `fetchCampagne` **et** `fetchHeartbeat`, puis applique `classerLot(faits, 20)`. L'état prêt porte donc :

```ts
export type CampagneState =
  | { status: 'loading' }
  | {
      status: 'ready';
      lot: Lot;
      lignes: Map<string, FaitsLigne>;
      totalQualifies: number;
      heartbeat: { beatAt: string; inFlight: number } | null;
    }
  | { status: 'error'; message: string };
```

**`heartbeat` reste `null` sans faire échouer la lecture** : ne pas savoir si le worker est vivant n'empêche pas d'afficher le lot, et `workerVivant(null, …)` rend déjà `false` — l'écran dira « à l'arrêt », ce qui est la lecture prudente. Faire échouer l'écran entier pour un battement illisible cacherait la liste pour une information annexe.

**Le 20 vient de D3 du spec.** Le déclarer en constante nommée dans `useCampagne.ts` (`const TAILLE_LOT = 20;`) plutôt qu'en littéral : le lot 6 le rendra réglable, et un littéral disséminé se retrouve mal.

Dans `App.tsx`, ajouter la branche `if (vue === 'campagne')`, avec ses trois cas — chargement, erreur, prêt — **calqués sur la branche `deploiements` existante**. Les gardes de `useProspects` restent après, pour la raison que son commentaire explique : un écran qui ne consomme pas les prospects ne doit pas disparaître quand leur lecture échoue.

- [ ] **Étape 9 : Vérifier la suite entière**

```bash
pnpm --filter @prospeo/dashboard test
pnpm -r typecheck
```

Attendu : suite verte, **y compris `i18n.test.ts`** — chaque clé ajoutée en tâche 8 a désormais un consommateur. Si une clé est encore signalée orpheline, elle n'est pas utilisée : la consommer ou la supprimer, jamais l'allowlister.

- [ ] **Étape 10 : Prouver les assertions**

1. supprimer le bloc qui rend `campagne.sansScore` → le test « nomme les prospects ecartes » doit rougir, et « ne montre rien quand il n y en a aucun » rester vert (c'est ce qui prouve que ce dernier ne teste pas rien) ;
2. remplacer la condition qui distingue les deux vides par un simple `lignes.length === 0` → le test « distingue le lot fini » doit rougir ;
3. retirer l'`aria-label` de `Segment` → les tests de `PisteCampagne` doivent rougir.

- [ ] **Étape 11 : Commit**

```bash
git add apps/dashboard/src/i18n apps/dashboard/src/ui/PisteCampagne.tsx \
        apps/dashboard/src/ui/PisteCampagne.module.css \
        apps/dashboard/src/ui/PisteCampagne.test.tsx \
        apps/dashboard/src/ui/Nav.tsx apps/dashboard/src/ui/Nav.test.tsx \
        apps/dashboard/src/screens/CampagneScreen.tsx \
        apps/dashboard/src/screens/CampagneScreen.module.css \
        apps/dashboard/src/screens/CampagneScreen.test.tsx \
        apps/dashboard/src/data/useCampagne.ts apps/dashboard/src/App.tsx
git commit -m "feat(campagne): l ecran, en lecture seule

Aucun bouton n agit encore : livrer une action sans file derriere elle
serait une affordance qui annonce un fait qu aucun code ne rend vrai.

Bloque se distingue d echoue par la forme autant que par la teinte — des
tirets, pas un plein — et chaque segment porte son nom accessible : la
couleur ne dit jamais seule un etat.

Le lot epuise et la base vide sont deux ecrans differents, et le second ne
se derive pas d un tableau vide.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 10 : `BandeConditions` — le worker, à côté des boutons qu'il gouverne

**Files:**
- Create: `apps/dashboard/src/ui/BandeConditions.tsx`, `.module.css`, `.test.tsx`
- Modify: `apps/dashboard/src/screens/CampagneScreen.tsx`

**Interfaces:**
- Consumes: `fetchHeartbeat` (tâche 7), les clés `campagne.worker.*` (tâche 8).
- Produces:
  - `export const SEUIL_WORKER_MORT_MS = 60_000`
  - `export function workerVivant(beatAt: string | null, maintenant: Date): boolean`
  - `export function BandeConditions(props: { heartbeat: { beatAt: string; inFlight: number } | null; maintenant: Date }): ReactElement`

> **La bande ne porte que la moitié worker dans ce lot.** La maquette y montre aussi le compte d'envoi Gmail et le compteur d'envois du jour : ils arrivent avec la connexion Google (lot suivant). **Ne pas les esquisser en attendant** — un emplacement grisé « compte d'envoi » annoncerait une capacité que rien ne rend vraie. La bande affiche ce qui existe, et la maquette reste la référence de ce qu'elle deviendra.

- [ ] **Étape 1 : Écrire les tests**

Créer `apps/dashboard/src/ui/BandeConditions.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import { BandeConditions, workerVivant } from './BandeConditions.js';

const MAINTENANT = new Date('2026-09-03T12:00:00Z');

describe('workerVivant', () => {
  it('tient un battement recent pour vivant', () => {
    expect(workerVivant('2026-09-03T11:59:55Z', MAINTENANT)).toBe(true);
  });

  it('declare mort au-dela du seuil', () => {
    expect(workerVivant('2026-09-03T11:58:00Z', MAINTENANT)).toBe(false);
  });

  it('traite l absence de battement comme un worker mort, jamais comme un doute', () => {
    // Un worker dont on ne sait rien ne peut pas se voir accorder le benefice
    // du doute : ce serait un bouton qui promet un deploiement que personne
    // n executera.
    expect(workerVivant(null, MAINTENANT)).toBe(false);
  });
});

describe('BandeConditions', () => {
  it('porte la raison ET le remede quand le worker est a l arret', () => {
    // LIRE dans fr.ts les valeurs de `campagne.worker.arret` et
    // `campagne.worker.arret.remede`, et en extraire un fragment stable.
    const arret = 'REMPLACER PAR LA VALEUR LUE DANS fr.ts';

    renderWithPreferences(
      <BandeConditions
        heartbeat={{ beatAt: '2026-09-03T11:00:00Z', inFlight: 0 }}
        maintenant={MAINTENANT}
      />,
    );

    // Un bouton eteint qui ne dit pas pourquoi envoie chercher une
    // remediation qui n existe pas — c est l erreur que le bouton
    // « Verifier » de GabaritScreen a deja coutee.
    expect(screen.getByText(arret)).toBeTruthy();
  });
});
```

- [ ] **Étape 2 : Lancer et vérifier l'échec**

```bash
pnpm --filter @prospeo/dashboard test
```

Attendu : échec de résolution de `./BandeConditions.js`.

- [ ] **Étape 3 : Écrire l'implémentation**

Créer `apps/dashboard/src/ui/BandeConditions.tsx` :

```tsx
import type { ReactElement } from 'react';
import { useT } from './preferences.js';
import { Badge } from './kit/Badge.js';
import styles from './BandeConditions.module.css';

/**
 * Les conditions dont dépendent les actions de l'écran, posées **à côté**
 * d'elles.
 *
 * Le dashboard n'appelle ni GitHub ni Vercel : il dépose une demande que le
 * collector draine. Si ce collector est mort, un bouton « Déployer » promet
 * un déploiement que personne n'exécutera — l'affordance que la doctrine
 * interdit. Cette bande est ce qui rend ce fait visible avant le clic.
 */

/**
 * Six battements manqués.
 *
 * Le worker bat toutes les 10 s. Un seuil à 60 s tolère une latence réseau et
 * un redémarrage court sans clignoter, tout en signalant une vraie panne dans
 * la minute.
 */
export const SEUIL_WORKER_MORT_MS = 60_000;

/**
 * `null` vaut mort, jamais « on ne sait pas ».
 *
 * Accorder le bénéfice du doute rallumerait les boutons dans le seul cas où
 * l'on est certain de ne rien savoir.
 */
export function workerVivant(beatAt: string | null, maintenant: Date): boolean {
  if (beatAt === null) return false;
  const battement = Date.parse(beatAt);
  if (Number.isNaN(battement)) return false;
  return maintenant.getTime() - battement < SEUIL_WORKER_MORT_MS;
}

export function BandeConditions({
  heartbeat,
  maintenant,
}: {
  heartbeat: { beatAt: string; inFlight: number } | null;
  maintenant: Date;
}): ReactElement {
  const t = useT();
  const vivant = workerVivant(heartbeat?.beatAt ?? null, maintenant);
  const minutes =
    heartbeat === null
      ? null
      : Math.floor((maintenant.getTime() - Date.parse(heartbeat.beatAt)) / 60_000);

  return (
    <div className={styles.bande}>
      {/* Le badge porte un MOT, pas seulement une teinte. */}
      <Badge ton={vivant ? 'succes' : 'danger'}>
        {vivant ? t('campagne.worker.ecoute') : t('campagne.worker.arret')}
      </Badge>

      {vivant ? null : (
        <div className={styles.raison} role="status">
          <p className={styles.raisonTexte}>
            {t('campagne.worker.arret.raison', { minutes: minutes ?? 0 })}
          </p>
          {/* Le remède, et pas seulement le symptôme. */}
          <p className={styles.remede}>{t('campagne.worker.arret.remede')}</p>
        </div>
      )}
    </div>
  );
}
```

> **Vérifier la signature de `Badge`** avant d'écrire : ouvrir `apps/dashboard/src/ui/kit/Badge.tsx` et employer ses props réelles. Si le kit n'a pas le ton nécessaire, **étendre le kit**, ne pas écrire un second badge à côté (§1 des guidelines).

Créer `BandeConditions.module.css` avec les seuls tokens de `theme.css`.

- [ ] **Étape 4 : Lire `fr.ts`, compléter le test, lancer**

Remplacer le littéral du test par la valeur lue, puis :

```bash
pnpm --filter @prospeo/dashboard test
```

Attendu : les quatre tests verts.

- [ ] **Étape 5 : Monter la bande dans l'écran**

Dans `CampagneScreen.tsx`, insérer `<BandeConditions heartbeat={heartbeat} maintenant={new Date()} />` sous le titre, au-dessus de la liste — la position de la maquette.

- [ ] **Étape 6 : Prouver les assertions**

1. remplacer `if (beatAt === null) return false;` par `return true;` → le test « absence de battement » doit rougir ;
2. supprimer le paragraphe `remede` → si aucun test ne rougit, l'assertion sur le remède manque : l'ajouter.

- [ ] **Étape 7 : Commit**

```bash
git add apps/dashboard/src/ui/BandeConditions.tsx \
        apps/dashboard/src/ui/BandeConditions.module.css \
        apps/dashboard/src/ui/BandeConditions.test.tsx \
        apps/dashboard/src/screens/CampagneScreen.tsx
git commit -m "feat(campagne): l etat du worker, a cote des boutons qu il gouverne

Un collector mort rend un bouton « Deployer » menteur. La bande le dit
avant le clic, avec sa raison ET son remede — un bouton eteint qui ne dit
pas pourquoi envoie chercher une remediation qui n existe pas.

Un battement absent vaut mort, jamais « on ne sait pas » : accorder le
benefice du doute rallumerait les boutons dans le seul cas ou l on est
certain de ne rien savoir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 11 : Le déclenchement, et le suivi en Realtime

**Files:**
- Modify: `apps/dashboard/src/data/mutations.ts`
- Modify: `apps/dashboard/src/data/mutations.test.ts`
- Modify: `apps/dashboard/src/data/useCampagne.ts`
- Modify: `apps/dashboard/src/screens/CampagneScreen.tsx`

**Interfaces:**
- Consumes: `useCampagne` (tâche 9), `Vue` (tâche 9).
- Produces:
  - `export async function deposerJob(client: SupabaseClient<Database>, prospectId: string): Promise<string | null>`
  - `export async function retirerJob(client: SupabaseClient<Database>, prospectId: string): Promise<string | null>`

> Les deux rendent `null` en cas de succès et le message d'erreur sinon — **la convention de `designerGabarit` et de `PanelActions`**, adoptée après qu'une écriture refusée par la RLS n'ait été journalisée qu'en console, l'opérateur croyant le changement pris.

- [ ] **Étape 1 : Écrire les tests**

Ajouter à `apps/dashboard/src/data/mutations.test.ts`. **Lire d'abord le fichier** pour reprendre sa façon de simuler le client.

```ts
describe('deposerJob', () => {
  it('rend null quand l insertion reussit', async () => {
    const client = clientQui({ insert: { error: null } });
    expect(await deposerJob(client, 'p-1')).toBeNull();
  });

  it('rend le message quand la RLS refuse, au lieu de le journaliser en console', async () => {
    // Une ecriture refusee qui ne remonte pas laisse l operateur croire que
    // le declenchement est parti. C est le defaut releve a la revue du lot 2
    // sur designerGabarit.
    const client = clientQui({ insert: { error: { message: 'refusé' } } });
    expect(await deposerJob(client, 'p-1')).toBe('refusé');
  });

  it('traite une violation d unicite comme un succes, pas comme une erreur', async () => {
    // L index unique partiel refuse un second job actif sur le meme prospect.
    // Ce n est pas une panne : c est la garantie qui fonctionne, et l ecran
    // affiche deja « en file ». Montrer une erreur ferait recliquer.
    const client = clientQui({ insert: { error: { code: '23505', message: 'duplicate key' } } });
    expect(await deposerJob(client, 'p-1')).toBeNull();
  });
});
```

- [ ] **Étape 2 : Lancer et vérifier l'échec**

```bash
pnpm --filter @prospeo/dashboard test
```

Attendu : `deposerJob` n'est pas exportée.

- [ ] **Étape 3 : Écrire les mutations**

Ajouter à `apps/dashboard/src/data/mutations.ts` :

```ts
/** Code Postgres d'une violation de contrainte d'unicité. */
const VIOLATION_UNICITE = '23505';

/**
 * Dépose une demande de traitement pour un prospect.
 *
 * Le dashboard n'appelle ni GitHub ni Vercel : il écrit une ligne, et le
 * collector résident la prend. C'est le contrat entier de l'écran côté
 * déclenchement — et il reste vrai si un backend remplace un jour le worker.
 *
 * **Une violation d'unicité n'est pas une erreur.** L'index partiel
 * `campaign_job_actif_unique` refuse un second job actif sur le même
 * prospect ; c'est la garantie qui joue son rôle, et l'écran affiche déjà
 * « en file d'attente ». Remonter une erreur ferait recliquer sur une
 * demande déjà déposée.
 */
export async function deposerJob(
  client: Client,
  prospectId: string,
): Promise<string | null> {
  const { error } = await client
    .from('campaign_job')
    .insert({ prospect_id: prospectId, kind: 'chaine', state: 'en_attente' });

  if (error === null) return null;
  if (error.code === VIOLATION_UNICITE) return null;
  return error.message;
}

/**
 * Retire une demande encore en attente.
 *
 * `eq('state', 'en_attente')` : un job déjà pris par le worker ne se retire
 * pas depuis l'interface — le dépôt GitHub est peut-être déjà créé, et
 * effacer la ligne ferait mentir l'écran sur ce qui existe réellement.
 */
export async function retirerJob(
  client: Client,
  prospectId: string,
): Promise<string | null> {
  const { error } = await client
    .from('campaign_job')
    .update({ state: 'annule', finished_at: new Date().toISOString() })
    .eq('prospect_id', prospectId)
    .eq('state', 'en_attente');

  return error === null ? null : error.message;
}
```

- [ ] **Étape 4 : Abonner l'écran aux changements**

Dans `useCampagne.ts`, ajouter un `useEffect` qui s'abonne aux deux tables et relit :

```ts
  // Realtime plutôt qu'un sondage : une campagne dure une quinzaine de
  // minutes, et interroger toutes les deux secondes pendant ce temps
  // multiplierait les lectures sans rien gagner en fraîcheur.
  //
  // La relecture est COMPLÈTE et non incrémentale : composer un état à
  // partir d'événements partiels rouvrirait la question de l'ordre
  // d'arrivée, pour un lot de vingt lignes qui se relit en une requête.
  useEffect(() => {
    if (!enabled) return;

    const canal = client
      .channel('campagne-ecran')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_job' }, () =>
        setTentative((n) => n + 1),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deployment_event' }, () =>
        setTentative((n) => n + 1),
      )
      .subscribe();

    return () => {
      void client.removeChannel(canal);
    };
  }, [client, enabled]);
```

- [ ] **Étape 5 : Brancher les boutons**

Dans `CampagneScreen.tsx`, câbler le bouton de chaque ligne selon `etat.nom` :

| `etat.nom` | Libellé | Action |
|---|---|---|
| `jamais` | `campagne.action.deployer` | `deposerJob` |
| `en_file` | `campagne.action.retirer` | `retirerJob` |
| `site_en_cours` | `campagne.action.detail` | aucune pour l'instant — **désactivé, avec sa raison** (l'écran de détail est un lot ultérieur) |
| `site_echec` | `campagne.action.rejouer` | `deposerJob` |
| autres | — | aucun bouton |

**Le bouton entier est désactivé quand le worker est mort**, avec la raison portée par `BandeConditions`.

- [ ] **Étape 6 : Vérifier la suite et les types**

```bash
pnpm --filter @prospeo/dashboard test
pnpm -r typecheck
```

Attendu : tout vert.

- [ ] **Étape 7 : Prouver les assertions**

1. supprimer la branche `if (error.code === VIOLATION_UNICITE) return null;` → le test « violation d unicite comme un succes » doit rougir ;
2. remplacer `return error.message` par `return null` → le test « rend le message quand la RLS refuse » doit rougir.

- [ ] **Étape 8 : Commit**

```bash
git add apps/dashboard/src/data/mutations.ts apps/dashboard/src/data/mutations.test.ts \
        apps/dashboard/src/data/useCampagne.ts apps/dashboard/src/screens/CampagneScreen.tsx
git commit -m "feat(campagne): le declenchement, et le suivi sans rechargement

Le dashboard ecrit une ligne, le collector la prend. Ce contrat reste vrai
si un backend remplace un jour le worker — l interface ne changerait pas.

Une violation d unicite n est pas une erreur : c est l index partiel qui
joue son role, et l ecran affiche deja « en file ». Remonter une erreur
ferait recliquer sur une demande deja deposee.

Un job deja pris ne se retire pas : le depot GitHub est peut-etre cree, et
effacer la ligne ferait mentir l ecran sur ce qui existe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## JALON — un prospect, du clic au site en ligne

**Ce jalon n'est pas une étape de vérification de plus : c'est le seul contrôle qui voie la chaîne entière.** Aucun test de ce dépôt ne la voit.

- [ ] **Étape 1 : Lancer le worker**

```bash
pnpm --filter @prospeo/collector start worker
```

Le laisser tourner dans son terminal.

- [ ] **Étape 2 : Lancer le dashboard**

```bash
pnpm --filter @prospeo/dashboard dev
```

Ouvrir `#/campagne`.

- [ ] **Étape 3 : Vérifier ce que l'écran affirme**

- la bande annonce le collector à l'écoute ;
- le lot affiche des prospects, classés par score décroissant ;
- si des prospects sans score existent, leur compte est affiché sous la liste.

Arrêter le worker (Ctrl+C) et **rafraîchir** : la bande doit passer à « à l'arrêt » sous une minute, et les boutons s'éteindre avec leur raison. Le relancer.

- [ ] **Étape 4 : Déclencher un prospect, et le regarder**

Cliquer « Déployer » sur **un seul** prospect. Sans recharger la page, observer :

1. la ligne passe en file d'attente ;
2. le worker écrit son avancée dans son terminal ;
3. le premier segment s'allume ;
4. le site apparaît en ligne.

- [ ] **Étape 5 : Vérifier le fait, pas seulement l'écran**

Dans l'éditeur SQL Supabase :

```sql
select state, last_error, cost_eur, started_at, finished_at
from campaign_job order by requested_at desc limit 1;

select step, outcome, detail, duration_ms, occurred_at
from deployment_event order by occurred_at desc limit 10;

select repo_full_name, deployment_url, published_at
from prospect_site order by updated_at desc limit 1;
```

**Ouvrir l'URL déployée dans un navigateur.** Un site en ligne est le fait ; une ligne en base n'en est que la trace.

- [ ] **Étape 6 : Vérifier que le double clic ne double rien**

Cliquer « Déployer » deux fois de suite sur un second prospect.

```sql
select count(*) from campaign_job where prospect_id = '<id du second>';
```

Attendu : **une seule ligne**. L'index unique partiel a fait son travail, et l'interface n'a montré aucune erreur.

- [ ] **Étape 7 : Consigner dans le handoff**

Ajouter à `docs/design/HANDOFF.md` une section « Ce qui est en place à la fin du lot 1 du chantier n°7 », qui dit :

- ce qui marche réellement, mesuré et non supposé (durée observée du clic à la mise en ligne) ;
- **ce qui reste inerte, et pourquoi** : le panneau de relecture, l'envoi, la bande de campagne, le mode auto, le détail au clic. Les recenser avec la même honnêteté que le tableau « Ce qui est annoncé mais pas alimenté » ;
- le résultat du point ouvert n°1 du spec (durée de vie du `provider_token`) s'il a été mesuré, ou la mention qu'il ne l'a pas été ;
- l'avertissement d'usage : **ne pas lire ce tableau comme clos.**

- [ ] **Étape 8 : Commit**

```bash
git add docs/design/HANDOFF.md
git commit -m "docs(handoff): le lot 1 du chantier 7, et ce qui reste inerte

Ce qui marche est mesure, pas suppose. Ce qui ne marche pas encore est
recense — un ecran qui laisse croire a une chaine complete quand seule la
moitie existe coute plus cher qu un ecran qui nomme ses trous.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Ce que ce plan ne couvre pas

À reprendre dans le plan du lot suivant, dans cet ordre :

| Lot | Contenu |
|---|---|
| 4 | Google en plus du mot de passe, et l'envoi d'un premier mail réel |
| 5 | L'étage `contacts` du collector, et la saisie manuelle dans la ligne |
| 6 | La campagne de 10, sa bande, son anneau, son coût, sa suspension |
| 7 | Le mode automatique, sa confirmation et ses quatre bornes |
| 8 | Le détail par déploiement — `DeploiementDetail.dc.html` trouve son écran |

Les cinq points ouverts du §12 du spec restent ouverts à la fin de ce lot, sauf le n°1 (durée de vie du `provider_token`), qui devient bloquant à l'entrée du lot 4 et se mesure au plus tard là.
