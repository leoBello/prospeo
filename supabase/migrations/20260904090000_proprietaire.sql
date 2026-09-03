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
