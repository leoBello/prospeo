-- Chantier n°8, étape 1 — le cloisonnement par propriétaire, seize tables.
--
-- Jusqu'ici, `authenticated_all using (true)` laissait tout utilisateur
-- connecté voir toutes les lignes de tout le monde : soutenable à un seul
-- compte, plus du tout au deuxième inscrit. Cette migration remplace chaque
-- `authenticated_all` par une politique qui borne la ligne à son
-- propriétaire — directement sur `prospect` et `campaign`, ou en remontant
-- jusqu'à eux pour les tables satellites.
--
-- L'ORDRE COMPTE. `prospect` d'abord : tant qu'elle n'est pas cloisonnée,
-- cloisonner les satellites ne protège rien, puisqu'ils remontent à elle.
--
-- Une politique n'est pas un objet de données : la retirer ne perd aucune
-- ligne. C'est le geste que l'interdiction de `CLAUDE.md` sur les objets
-- existants vise le moins — mais cloisonner exige de les réécrire, donc de
-- les retirer d'abord.

-- FORME 1 — le propriétaire est sur la ligne.
-- `(select auth.uid())` et non `auth.uid()` : Postgres évalue le sous-select
-- UNE FOIS par requête au lieu d'une fois par ligne. Sur plusieurs milliers
-- de prospects, la différence se mesure.
drop policy authenticated_all on prospect;
create policy proprietaire_seul on prospect
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy authenticated_all on campaign;
create policy proprietaire_seul on campaign
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy authenticated_all on campaign_job;
create policy proprietaire_seul on campaign_job
  for all to authenticated
  using (requested_by = (select auth.uid()))
  with check (requested_by = (select auth.uid()));

-- FORME 2 — le propriétaire se lit chez le prospect.
-- `with check` autant que `using` : sans lui, un utilisateur pourrait ÉCRIRE
-- une ligne rattachée au prospect d'un autre, même sans pouvoir la relire.
-- Répétée à l'identique pour les onze satellites.
drop policy authenticated_all on prospect_enrichment;
create policy proprietaire_du_prospect on prospect_enrichment
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = prospect_enrichment.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = prospect_enrichment.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on web_presence;
create policy proprietaire_du_prospect on web_presence
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = web_presence.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = web_presence.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on prospect_score;
create policy proprietaire_du_prospect on prospect_score
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = prospect_score.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = prospect_score.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on prospect_pipeline;
create policy proprietaire_du_prospect on prospect_pipeline
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = prospect_pipeline.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = prospect_pipeline.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on prospect_site;
create policy proprietaire_du_prospect on prospect_site
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = prospect_site.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = prospect_site.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on prospect_contact;
create policy proprietaire_du_prospect on prospect_contact
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = prospect_contact.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = prospect_contact.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on interaction;
create policy proprietaire_du_prospect on interaction
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = interaction.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = interaction.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on generated_message;
create policy proprietaire_du_prospect on generated_message
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = generated_message.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = generated_message.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on deployment_event;
create policy proprietaire_du_prospect on deployment_event
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = deployment_event.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = deployment_event.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on pipeline_event;
create policy proprietaire_du_prospect on pipeline_event
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = pipeline_event.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = pipeline_event.prospect_id
      and p.owner_id = (select auth.uid())
  ));

drop policy authenticated_all on message_send;
create policy proprietaire_du_prospect on message_send
  for all to authenticated
  using (exists (
    select 1 from prospect p
    where p.id = message_send.prospect_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prospect p
    where p.id = message_send.prospect_id
      and p.owner_id = (select auth.uid())
  ));

-- FORME 3 — les deux tables de l'application (C4).
-- `site_template` est le gabarit, que D6 rend public ; `worker_heartbeat`
-- décrit un processus. Ni l'un ni l'autre n'appartient à un client — mais un
-- client n'a aucune raison de pouvoir désigner le gabarit de tout le monde,
-- ni de maquiller l'état du worker. Lecture pour tous, écriture réservée au
-- `service_role`, qui contourne RLS de toute façon.
-- `site_template` RESTE ÉCRITE PAR UN UTILISATEUR AUTHENTIFIÉ, et c'est un
-- écart délibéré à C4 du spec, tranché par le propriétaire le 3 septembre.
--
-- La passer en lecture seule aurait cassé `designerGabarit`
-- (`dashboard/src/data/mutations.ts`) et laissé l'écran « Gabarit » avec un
-- formulaire que la RLS refuse — l'affordance que la doctrine interdit. Le
-- cloisonnement a pour objet d'empêcher un client de voir les DONNÉES d'un
-- autre ; casser un écran au passage n'y ajoute rien.
--
-- LE TROU RESTE RÉEL, ET IL EST BORNÉ : un utilisateur pourrait repointer le
-- gabarit de tous. Un seul compte existe aujourd'hui, et le changement est
-- visible et réversible. À fermer quand une distinction administrateur
-- existera — consigné dans HANDOFF.md.


drop policy authenticated_all on worker_heartbeat;
create policy lecture_seule on worker_heartbeat
  for select to authenticated using (true);
