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
