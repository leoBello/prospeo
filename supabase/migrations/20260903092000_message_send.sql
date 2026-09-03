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
