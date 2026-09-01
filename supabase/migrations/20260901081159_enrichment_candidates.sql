-- La file de revue de la tâche suivante interroge `prospect_enrichment` par
-- statut : c'est elle qui justifie cet index. `enrich`, lui, lit la table
-- entière et filtre en mémoire — il n'en tire rien.
create index prospect_enrichment_status_idx on prospect_enrichment (status);

-- Un cas `ambiguous` doit conserver ce qui a été vu, sinon la revue manuelle
-- n'aurait rien à trancher : il faudrait relancer le scraping pour redécouvrir
-- des candidats qu'on avait déjà sous la main.
alter table prospect_enrichment
  add column candidates jsonb not null default '[]'::jsonb;
