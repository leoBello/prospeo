-- La file de revue interroge `prospect_enrichment` par statut, et `enrich`
-- sélectionne les prospects à (re)traiter par le même champ.
create index prospect_enrichment_status_idx on prospect_enrichment (status);

-- Un cas `ambiguous` doit conserver ce qui a été vu, sinon la revue manuelle
-- n'aurait rien à trancher : il faudrait relancer le scraping pour redécouvrir
-- des candidats qu'on avait déjà sous la main.
alter table prospect_enrichment
  add column candidates jsonb not null default '[]'::jsonb;
