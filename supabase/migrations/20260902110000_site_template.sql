-- Chantier n°6, lot 2 — le gabarit actif, désigné depuis l'interface.
--
-- `templateRepoFor` (packages/core/src/trades.ts) annonçait déjà ce repli :
-- « permettra à une interface de gestion de trancher sans toucher au code ».
-- L'ordre de résolution ne change pas — le gabarit du métier prime toujours —,
-- cette table s'insère seulement entre lui et la variable d'environnement.

create table site_template (
  -- Table à ligne unique : `id` toujours à 1, contraint. Un réglage global
  -- n'a pas de clé naturelle, et une table sans contrainte laisserait deux
  -- lignes cohabiter sans que rien ne dise laquelle fait foi.
  id                integer primary key generated always as identity,
  constraint site_template_singleton check (id = 1),

  -- « org/nom ». Nul = aucun gabarit désigné, on retombe sur l'environnement.
  repo_full_name    text,
  branch            text not null default 'main',

  -- Verdict du dernier contrôle effectué par le collector. Le dashboard ne
  -- peut pas le produire : il faudrait un jeton GitHub, qui n'a rien à faire
  -- dans un bundle navigateur. L'écran affiche donc le dernier verdict connu
  -- et sa date, jamais un contrôle qu'il aurait fait lui-même.
  checked_at        timestamptz,
  check_ok          boolean,
  check_detail      text,

  updated_at        timestamptz not null default now()
);

alter table site_template enable row level security;
create policy authenticated_all on site_template
  for all to authenticated using (true) with check (true);

-- La ligne unique, créée vide : l'absence de gabarit désigné est un état
-- normal, pas une table vide qu'il faudrait traiter à part dans chaque
-- lecture.
insert into site_template (repo_full_name) values (null);
