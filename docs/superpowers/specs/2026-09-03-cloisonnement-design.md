# Cloisonnement — chaque utilisateur ne voit que ses prospects

**Date :** 2026-09-03
**Statut :** design, prêt pour plan d'implémentation — **une exception doctrinale demande une autorisation explicite (§7)**
**Portée :** chantier n°8, étape 1 sur 6. Voir [`2026-09-03-multi-utilisateur-design.md`](2026-09-03-multi-utilisateur-design.md) pour les dix décisions qui l'encadrent.

---

## 1. Objectif

Faire qu'un utilisateur ne voie, ne lise et n'écrive que ses propres données.

C'est la première étape du chantier n°8, et **la seule dont l'absence n'est
pas un retard mais un incident** : au deuxième inscrit, chacun voit les
prospects, les sites et les messages de l'autre.

### Critères de succès

1. Un second compte, créé sur l'instance, ne voit **aucune** ligne du premier
   — vérifié table par table, avec sa clé, pas déduit d'une politique.
2. Les 139 prospects, le site de LUCIAN LAZA et tout l'historique appartiennent
   au compte du propriétaire (D5), sans qu'une ligne soit perdue.
3. `discover` peut ingérer le **même SIRET** pour deux utilisateurs différents.
4. Le collector, qui contourne RLS par construction, **ne traite jamais les
   données d'un utilisateur pour le compte d'un autre**.
5. Aucune donnée existante n'est perdue, et le site déjà publié reste
   dépubliable.

### Hors périmètre

Le coffre à jetons, les intégrations GitHub/Vercel, le worker par utilisateur,
la seconde file, la péremption, Google. Ils viennent après, et **ils dépendent
tous de celle-ci** : tant que les lignes n'ont pas de propriétaire, aucun
d'eux ne peut savoir de qui il parle.

---

## 2. L'état actuel, mesuré

### Les seize tables laissent tout voir à tout le monde

```
authenticated_all  →  campaign, campaign_job, deployment_event,
                      generated_message, interaction, message_send,
                      pipeline_event, prospect, prospect_contact,
                      prospect_enrichment, prospect_pipeline, prospect_score,
                      prospect_site, site_template, web_presence,
                      worker_heartbeat
```

Toutes portent `for all to authenticated using (true) with check (true)`. La
RLS est **activée** partout — la mécanique est en place, c'est la condition
qui est ouverte. C'était juste en mono-utilisateur : la clé anonyme est
publique par construction, et RLS empêchait un inconnu de lire. Elle
n'empêche rien entre deux inscrits.

### Un seul compte existe

`131ab48e-055a-4a15-af4b-79ed7a2e4465` — `leobello.wd@gmail.com`, créé le
1er septembre 2026. C'est à lui que D5 rattache l'existant.

### Le collector ne voit pas la RLS

`apps/collector/src/supabase.ts` crée son client avec la clé `service_role`,
dont le commentaire dit déjà : « **contourne RLS** ». Toutes les lectures du
collector — `fetchSiteRows`, `fetchSiteCandidates`, `fetchPitchCandidates`,
`listerEnAttente` — voient donc l'intégralité des tables, quoi que dise une
politique.

**La RLS protège le dashboard, pas le worker.** C'est le point le plus facile
à oublier et le plus coûteux à découvrir tard.

---

## 3. Décisions

### C1 — Le locataire est un utilisateur, pas une organisation

`auth.users.id` identifie le locataire. Pas de table `organisation`, pas de
rôles, pas d'invitations.

*Pourquoi :* D1 dit « propre à chaque utilisateur ». Une organisation
ajouterait trois concepts dont rien ne prouve encore le besoin, et elle se
glisse plus tard entre l'utilisateur et ses données sans rien casser — une
colonne `owner_id` devient un `account_id`, les politiques suivent.

### C2 — `prospect` porte le propriétaire ; les satellites le déduisent

`prospect` gagne `owner_id uuid not null references auth.users (id)`.

Les tables qui pendent d'un prospect — `prospect_enrichment`, `web_presence`,
`prospect_score`, `prospect_pipeline`, `prospect_site`, `prospect_contact`,
`interaction`, `generated_message`, `deployment_event`, `pipeline_event`,
`message_send` — **ne dupliquent pas** la colonne. Leur politique remonte au
prospect.

*Pourquoi ne pas dénormaliser :* onze colonnes de plus, c'est onze occasions
de désynchronisation, et rien pour l'empêcher sans déclencheurs. La remontée
est une lecture par clé primaire indexée. Si une mesure la montre trop lente,
on dénormalisera **alors** — mais on ne paie pas d'avance une cohérence à
tenir contre un coût qu'on n'a pas constaté.

### C3 — `campaign` et `campaign_job` portent le propriétaire directement

Ces deux-là ne pendent pas d'un prospect : `campaign` n'en référence aucun, et
`campaign_job.requested_by` existe déjà mais **n'est jamais écrite** (constat
M3 de la revue finale du lot 1).

`campaign` gagne `owner_id`. `campaign_job` emploie `requested_by`, que
`deposerJob` doit enfin renseigner.

### C4 — `site_template` et `worker_heartbeat` restent partagées

`site_template` est le gabarit de l'application, que D6 rend public.
`worker_heartbeat` décrit un processus, pas des données de client.

*Conséquence :* leurs politiques changent quand même — de « tout utilisateur
authentifié écrit » à « tout utilisateur authentifié **lit**, seul le
`service_role` écrit ». Un client n'a aucune raison de pouvoir désigner le
gabarit de tout le monde.

### C5 — Le collector filtre par propriétaire, explicitement

Puisque `service_role` contourne RLS, chaque lecture du collector reçoit un
`owner_id` et filtre dessus. Ce n'est pas une précaution : c'est la **seule**
barrière côté worker.

*Forme retenue :* les fonctions de lecture prennent le propriétaire en
paramètre obligatoire, et non optionnel. Un paramètre optionnel se laisse
oublier, et l'oubli est silencieux — il rend simplement plus de lignes.

---

## 4. Le modèle des politiques

Deux formes seulement, pour qu'on puisse les relire d'un coup d'œil.

**Sur `prospect`, `campaign`, `campaign_job` — le propriétaire est sur la ligne :**

```sql
create policy proprietaire_seul on prospect
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
```

`(select auth.uid())` et non `auth.uid()` : Postgres évalue le sous-select une
fois par requête au lieu d'une fois par ligne. Sur une table de plusieurs
milliers de prospects, la différence se mesure.

**Sur les onze satellites — le propriétaire se lit chez le prospect :**

```sql
create policy proprietaire_du_prospect on prospect_score
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = prospect_score.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (…même condition…));
```

`with check` autant que `using` : sans lui, un utilisateur pourrait **écrire**
une ligne rattachée au prospect d'un autre, même sans pouvoir la relire.

**Un index sur `prospect (id, owner_id)`** rend cette remontée gratuite : la
condition se satisfait par l'index seul, sans toucher la table.

---

## 5. Ce que le collector doit changer

C'est la moitié du travail, et elle est invisible depuis la base.

**Recensement fait, et il est plus lourd que prévu.**
`grep -rn "\.from('" apps/collector/src --include=*.ts | grep -v test` rend
**42 appels** sur dix tables :

| Table | Appels | À filtrer |
|---|---|---|
| `prospect_site` | 9 | oui |
| `prospect` | 9 | oui |
| `prospect_enrichment` | 8 | oui |
| `web_presence` | 6 | oui |
| `generated_message` | 4 | oui |
| `campaign_job` | 3 | oui |
| `prospect_score` | 2 | oui |
| `deployment_event` | 1 | oui |
| `site_template` | 1 | **non** — gabarit de l'application (C4) |
| `worker_heartbeat` | 1 | **non** — décrit un processus (C4) |

**Quarante appels à reprendre**, pas cinq fonctions. Le premier jet de ce
document annonçait cinq lectures ; le recensement le corrige, et c'est la
mesure qui gouverne.

Toutes les commandes du collector sont concernées, pas seulement le worker :
`discover`, `enrich`, `probe`, `score`, `domains`, `generate`, `publish`,
`deploy`, `pitch`, `unpublish`, `reconcile`, `review`, `calibrate`.

**Le worker de campagne n'a qu'un propriétaire** (D8 : un worker par
utilisateur), ce qui simplifie : il le reçoit au démarrage. Mais les commandes
de collecte (`discover`, `enrich`, `probe`, `score`) sont aujourd'hui lancées
à la main, sans notion de propriétaire — elles ont besoin d'un
`--owner <uuid>` obligatoire, ou de le déduire d'une file.

---

## 6. La migration de l'existant

Trois instructions, dans cet ordre, et **rien ne s'exécute avant que le §7
soit tranché** :

1. Ajouter `owner_id` **nullable** à `prospect` et `campaign`.
2. `update prospect set owner_id = '131ab48e-055a-4a15-af4b-79ed7a2e4465'`
   — les 139 lignes, plus le prospect de LUCIAN LAZA et son site en ligne.
   Idem pour `campaign` (vide aujourd'hui) et `campaign_job.requested_by`
   (quatre lignes, toutes `annule`).
3. Passer `owner_id` à `not null` **une fois les lignes remplies**, jamais
   avant : un `not null` posé d'emblée sur une table peuplée échoue.

**Vérification exigée avant de passer à `not null` :** compter les lignes à
`owner_id is null`. Zéro, ou on s'arrête.

---

## 7. L'exception doctrinale, à autoriser explicitement

`CLAUDE.md` : « **rien ne modifie ni ne supprime un objet existant** ».

Le cloisonnement ne peut pas la respecter entièrement. `prospect.siret` porte
`not null unique` depuis la migration initiale. Avec une base par utilisateur,
**deux clients qui ciblent la même ville découvrent le même SIRET**, et le
`discover` du second échoue sur la contrainte.

Il faut donc :

```sql
alter table prospect drop constraint prospect_siret_key;   -- ← l'exception
create unique index prospect_owner_siret on prospect (owner_id, siret);
```

**Pourquoi il n'y a pas d'échappatoire.** Un index partiel ne peut pas
remplacer une contrainte globale par une contrainte par locataire : c'est la
même colonne, la même table. Garder l'ancienne contrainte reviendrait à dire
« un SIRET n'appartient qu'à un seul client », c'est-à-dire à donner Marseille
au premier arrivé.

**Ce que ça coûte si c'est fait de travers.** Entre le `drop` et le `create
unique index`, la table n'a plus de garde-fou : un `discover` concurrent
pourrait insérer un doublon. Les deux instructions doivent être **dans la même
transaction**, et la migration ne doit pas tourner pendant qu'un collector
tourne.

**Cette autorisation se demande au propriétaire, elle ne se déduit pas.**

---

## 8. Tests

Écrire le test d'abord, et vérifier qu'il échoue pour la bonne raison.

**Ce qui se teste sans base** — les fonctions du collector reçoivent
désormais un propriétaire : qu'elles le transmettent au filtre, et qu'elles
refusent de s'exécuter sans. Une signature obligatoire se prouve au typecheck ;
un filtre transmis se prouve par le client simulé de `mutations.test.ts`, qui
enregistre déjà la requête construite.

**Ce qui ne se teste que contre l'instance**, et qui est le vrai contrôle :
créer un second compte, et vérifier **table par table** qu'il ne voit rien du
premier. Une politique juste sur quinze tables et fausse sur la seizième n'est
pas une politique juste. Ce contrôle s'écrit comme un script de vérification
conservé au dépôt, pas comme une observation faite une fois.

**Ce qu'aucun test ne verra :** qu'une lecture du collector a été oubliée.
`service_role` ne lèvera jamais. La seule parade est le recensement exhaustif
du §5, à confronter au code une fois le travail fait — `grep -rn "from('"` sur
`apps/collector/src`.

---

## 9. Ordre de livraison

1. **Les colonnes, nullable, et le rattachement de l'existant** — aucune
   politique ne change encore, rien ne casse.
2. **Le passage à `not null`**, après vérification du compte de nuls.
3. **L'exception du §7** — `siret`, dans sa propre transaction, autorisée à
   part.
4. **Les politiques**, table par table, en commençant par `prospect` : tant
   qu'elle n'est pas cloisonnée, cloisonner les satellites ne protège rien.
5. **Le filtrage du collector** — les cinq lectures du §5, plus le recensement
   qui prouve qu'il n'en reste aucune.
6. **Le script de vérification à deux comptes**, conservé au dépôt.

Le 5 peut se faire en parallèle du 4 : ils ne se touchent pas.

---

## 10. Points à trancher à l'implémentation

1. **Le second compte de vérification** : créé pour le test et conservé, ou
   créé puis supprimé ? Conservé, il permet de rejouer la vérification à
   chaque chantier — au prix d'un compte de plus sur l'instance.
2. **`discover` et les commandes de collecte** : `--owner <uuid>` obligatoire,
   ou une file d'ingestion qui porte le propriétaire ? La seconde forme est
   celle du chantier ; la première suffit tant que la collecte se lance à la
   main.
3. **La performance de la remontée au prospect** (C2) : à mesurer sur
   `CAMPAGNE_SELECT`, qui lit `prospect` avec huit relations embarquées. Si
   elle coûte, dénormaliser `owner_id` sur les satellites les plus lus — mais
   après mesure, pas avant.
