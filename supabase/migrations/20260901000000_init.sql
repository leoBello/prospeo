-- Prospeo — schéma initial du socle de prospection.

create type web_presence_category as enum
  ('none', 'social_only', 'directory_only', 'dead_site', 'has_site');

create type enrichment_status as enum ('ok', 'not_found', 'ambiguous', 'blocked');

create type pipeline_status as enum
  ('a_contacter', 'contacte', 'relance', 'interesse', 'gagne', 'perdu', 'ne_pas_contacter');

create type interaction_kind as enum ('appel', 'whatsapp', 'email', 'note');

create table prospect (
  id                          uuid primary key default gen_random_uuid(),
  siret                       text not null unique,
  siren                       text not null,
  trade_slug                  text not null,
  denomination                text not null,
  denomination_usuelle        text,
  naf_code                    text,
  address                     text not null,
  postal_code                 text not null,
  city                        text not null,
  latitude                    double precision,
  longitude                   double precision,
  date_creation               date,
  effectif_code               text,
  is_entrepreneur_individuel  boolean not null default false,
  is_head_office              boolean not null default false,
  discovered_at               timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index prospect_trade_idx on prospect (trade_slug);
create index prospect_city_idx  on prospect (postal_code, city);

create table prospect_enrichment (
  prospect_id       uuid primary key references prospect (id) on delete cascade,
  source            text not null,
  matched_name      text,
  match_confidence  real,
  phone_e164        text,
  phone_kind        text,
  declared_url      text,
  social_urls       jsonb not null default '[]'::jsonb,
  rating            real,
  review_count      integer,
  place_id          text,
  maps_url          text,
  screenshot_paths  jsonb not null default '[]'::jsonb,
  status            enrichment_status not null,
  enriched_at       timestamptz not null default now()
);

create table web_presence (
  prospect_id        uuid primary key references prospect (id) on delete cascade,
  -- Nullable : `probe` s'exécute avant `classify`, qui seul détermine la catégorie.
  category           web_presence_category,
  probed_url         text,
  http_status        integer,
  is_https           boolean,
  final_url          text,
  is_parked          boolean,
  has_viewport_meta  boolean,
  last_social_post_at date,
  domain_available   boolean,
  domain_candidates  jsonb not null default '[]'::jsonb,
  probed_at          timestamptz not null default now()
);

create table prospect_score (
  prospect_id      uuid primary key references prospect (id) on delete cascade,
  total            integer not null,
  breakdown        jsonb not null,
  ruleset_version  text not null,
  computed_at      timestamptz not null default now()
);

create index prospect_score_total_idx on prospect_score (total desc);

create table prospect_pipeline (
  prospect_id     uuid primary key references prospect (id) on delete cascade,
  status          pipeline_status not null default 'a_contacter',
  next_action_at  date,
  updated_at      timestamptz not null default now()
);

create index prospect_pipeline_next_idx on prospect_pipeline (next_action_at);

create table interaction (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references prospect (id) on delete cascade,
  kind         interaction_kind not null,
  body         text,
  occurred_at  timestamptz not null default now()
);

create index interaction_prospect_idx on interaction (prospect_id, occurred_at desc);

create table generated_message (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid not null references prospect (id) on delete cascade,
  channel         text not null,
  model           text not null,
  prompt_version  text not null,
  content         text not null,
  created_at      timestamptz not null default now()
);

-- RLS : obligatoire, la clé anonyme est publique par construction.
-- La clé service_role du collector contourne RLS nativement.
alter table prospect            enable row level security;
alter table prospect_enrichment enable row level security;
alter table web_presence        enable row level security;
alter table prospect_score      enable row level security;
alter table prospect_pipeline   enable row level security;
alter table interaction         enable row level security;
alter table generated_message   enable row level security;

create policy authenticated_all on prospect            for all to authenticated using (true) with check (true);
create policy authenticated_all on prospect_enrichment for all to authenticated using (true) with check (true);
create policy authenticated_all on web_presence        for all to authenticated using (true) with check (true);
create policy authenticated_all on prospect_score      for all to authenticated using (true) with check (true);
create policy authenticated_all on prospect_pipeline   for all to authenticated using (true) with check (true);
create policy authenticated_all on interaction         for all to authenticated using (true) with check (true);
create policy authenticated_all on generated_message   for all to authenticated using (true) with check (true);
