-- Chantier n°4 — l'état du site d'un prospect : dépôt, déploiement, péremption.
--
-- Une table plutôt que des colonnes sur `prospect` : la population concernée
-- est une petite minorité (22 sur 139 aujourd'hui), et un prospect sans site
-- n'a aucune raison de porter huit colonnes nulles. C'est le même parti que
-- `prospect_enrichment` et `web_presence`.

create table prospect_site (
  prospect_id       uuid primary key references prospect (id) on delete cascade,

  -- « org/nom ». Recalculable depuis le prospect (`nomDepot`), mais stocké :
  -- c'est ce qui permet de retrouver le dépôt d'un prospect dont la
  -- dénomination a changé depuis, et de le dépublier (D5).
  repo_full_name    text,
  repo_url          text,

  vercel_project_id text,

  -- L'URL déployée est une DONNÉE DE VENTE, pas une trace d'exécution : c'est
  -- elle que citera l'email de la tâche 5. Le plan l'exige explicitement en
  -- base « et pas dans les journaux ».
  deployment_url    text,

  -- Empreinte du contenu réellement écrit dans le dépôt. Gouverne
  -- l'idempotence : un rejeu dont l'empreinte n'a pas bougé ne pousse aucun
  -- commit, donc ne redéclenche aucun déploiement.
  content_hash      text,

  -- Traçabilité de la génération, même doctrine que `prospect_score
  -- .ruleset_version` : un contenu relu dans six mois doit dire sous quelles
  -- consignes et par quel modèle il a été écrit.
  prompt_version    text,
  model             text,
  generated_at      timestamptz,

  -- C'est cette date qui fait courir les 90 jours de la péremption (D5). Sans
  -- elle, un site publié au nom d'un tiers vivrait indéfiniment sans
  -- surveillance : la tâche 6 n'aurait rien pour décider.
  published_at      timestamptz,

  -- Renseignée à la dépublication. Conservée plutôt que la ligne supprimée :
  -- savoir qu'un site a existé et quand il a été retiré fait partie de ce
  -- qu'on doit pouvoir répondre à un artisan qui en a demandé le retrait.
  unpublished_at    timestamptz,

  updated_at        timestamptz not null default now()
);

-- Les deux lectures de la tâche 6. `published_at` sert la péremption à 90
-- jours ; le filtre partiel écarte d'emblée les sites déjà dépubliés, qui
-- seront la majorité des lignes à terme.
create index prospect_site_published_idx
  on prospect_site (published_at)
  where unpublished_at is null;

alter table prospect_site enable row level security;
create policy authenticated_all on prospect_site
  for all to authenticated using (true) with check (true);

-- L'index différé du socle, au motif qu'« une table sans écrivain n'a pas
-- besoin d'index ». La tâche 5 lui en donne un : chaque prospect accumulera
-- un message par canal et par régénération, et la fiche les relit par
-- prospect.
create index generated_message_prospect_idx
  on generated_message (prospect_id, created_at desc);
