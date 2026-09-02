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
