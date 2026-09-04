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
