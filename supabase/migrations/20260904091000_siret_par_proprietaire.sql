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
