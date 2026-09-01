-- `web_presence.probed_at` ne doit être renseigné que par l'étage `probe`.
--
-- Il était `not null default now()`, si bien qu'une ligne créée par l'étage
-- `classify`/`score` — pour un prospect dont aucune URL n'a jamais été sondée —
-- affirmait une sonde qui n'a jamais eu lieu. C'est arrivé en conditions
-- réelles : `probe` n'a trouvé aucune URL, puis `score` a écrit 25 lignes
-- portant chacune un horodatage de sonde.
--
-- La colonne devient nullable et perd sa valeur par défaut : « pas encore
-- sondé » se dit désormais `null`, et l'horodatage redevient le seul moyen
-- fiable de savoir si une sonde est périmée.

alter table web_presence alter column probed_at drop default;
alter table web_presence alter column probed_at drop not null;

-- Corriger les lignes déjà fabriquées : une sonde sans URL sondée n'a pas eu lieu.
update web_presence
   set probed_at = null
 where probed_url is null;
