-- Chantier n°6, lot 3 — l'historique des changements de statut du pipeline.
--
-- `prospect_pipeline` porte un ÉTAT COURANT : `status`, `next_action_at`,
-- `updated_at`. `definirStatut` (dashboard) l'écrit par `upsert`, qui écrase
-- systématiquement la ligne précédente — le passé disparaît à chaque
-- changement. Deux sources de points de la gamification en dépendent et
-- restent bloquées : « relance tenue » a besoin de la `next_action_at` en
-- vigueur AU MOMENT de l'interaction, et « rendez-vous obtenu » a besoin de
-- savoir QUAND le statut est passé à « intéressé ». Ni l'une ni l'autre ne
-- peut se répondre depuis une colonne qui vient d'être écrasée.
--
-- Une table d'événements plutôt que des colonnes supplémentaires sur
-- `prospect_pipeline`, pour la même raison que `deployment_event` (lot 2) :
-- ce sont des faits datés qui s'accumulent, pas un état qui s'écrase. Une
-- ligne par changement de statut, portant CE statut et la `next_action_at`
-- qui entre en vigueur avec lui — cette seconde colonne est ce qui rend
-- « relance tenue » calculable ; l'omettre viderait la table de la moitié de
-- son intérêt.

-- L'origine d'une ligne : une observation réelle (écrite au moment du
-- changement, tâche 5) ou un amorçage (reconstitué une seule fois, à la
-- création de cette table, depuis le dernier `updated_at` connu de
-- `prospect_pipeline`). La distinction doit vivre dans une colonne et non
-- dans un commentaire SQL : les tâches 6 et 8 doivent pouvoir, À
-- L'EXÉCUTION, afficher « j'apprends encore » plutôt que présenter un point
-- reconstitué comme une observation. Une énumération plutôt qu'un booléen
-- pour rester dans l'idiome du dépôt (`pipeline_status`, `deployment_step`,
-- `deployment_outcome`, …) et parce qu'une troisième origine (import,
-- correction manuelle) est plus probable qu'un simple `is_seed` ne le
-- laisserait grandir.
create type pipeline_event_origin as enum ('observe', 'amorcage');

create table pipeline_event (
  id              bigint generated always as identity primary key,
  prospect_id     uuid not null references prospect (id) on delete cascade,

  status          pipeline_status not null,

  -- La `next_action_at` en vigueur à CE changement de statut précis — pas la
  -- valeur courante de `prospect_pipeline`, qui aura pu changer depuis.
  -- Type `date`, nullable : à l'image exacte de la colonne dont elle
  -- conserve la valeur (`prospect_pipeline.next_action_at`, migration
  -- initiale).
  next_action_at  date,

  -- Observée (écrite au moment réel du changement, tâche 5) ou amorcée
  -- (reconstituée une fois depuis `prospect_pipeline.updated_at`, faute
  -- d'historique antérieur à cette migration). Voir le commentaire du type
  -- ci-dessus : c'est cette colonne, et non un commentaire, qui permet à
  -- l'écran de ne pas confondre un fait observé avec une reconstitution.
  origin          pipeline_event_origin not null default 'observe',

  occurred_at     timestamptz not null default now()
);

-- La lecture de l'écran de suivi : l'historique d'un prospect, du plus
-- récent au plus ancien.
create index pipeline_event_prospect_idx
  on pipeline_event (prospect_id, occurred_at desc);

-- La lecture de la série / du tableau : ce qui a changé récemment, tous
-- prospects confondus.
create index pipeline_event_recent_idx
  on pipeline_event (occurred_at desc);

alter table pipeline_event enable row level security;

-- Même doctrine que les autres tables du socle : le dashboard lit et écrit
-- sous le compte authentifié, le collector écrit avec la clé `service_role`.
create policy authenticated_all on pipeline_event
  for all to authenticated using (true) with check (true);

-- Amorçage : un point par prospect déjà suivi dans `prospect_pipeline`, pris
-- depuis son dernier changement connu (`status`, `next_action_at`,
-- `updated_at`). Marqué `amorcage` et non `observe` : ce n'est pas un fait
-- daté au sens de la table, c'est une reconstitution a posteriori qui
-- ignore aussi bien la `next_action_at` qui a pu être en vigueur avant
-- celle-ci que les changements de statut antérieurs, disparus avec
-- l'`upsert` qui les a précédés. La série et le palier des tâches 6/8
-- doivent pouvoir le savoir pour afficher « j'apprends encore » plutôt
-- qu'une série fondée sur des points reconstitués.
insert into pipeline_event (prospect_id, status, next_action_at, origin, occurred_at)
select prospect_id, status, next_action_at, 'amorcage', updated_at
from prospect_pipeline;
