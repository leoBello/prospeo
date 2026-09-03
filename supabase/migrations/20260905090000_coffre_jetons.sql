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
