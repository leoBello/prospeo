-- Chantier n°7, lot 1 — la file de travail du dashboard, et le worker qui la
-- draine.
--
-- POURQUOI UNE FILE, ET PAS UN APPEL DIRECT. Le dashboard n'appelle ni GitHub
-- ni Vercel : ce sont des secrets, et la décision d'architecture du chantier
-- n°1 (« Supabase + collector, sans backend applicatif ») les tient hors du
-- bundle navigateur. Le dashboard dépose donc une DEMANDE, que le collector
-- exécute. C'est la piste que `HANDOFF.md` avait identifiée, et elle prolonge
-- le modèle existant au lieu d'y ajouter une exception.

-- L'état d'un lot. 'suspendue' n'est pas 'annulee' : suspendre garde les jobs
-- en attente pour une reprise, annuler les abandonne. Deux gestes distincts,
-- deux valeurs.
create type campaign_state as enum ('en_cours', 'suspendue', 'terminee', 'annulee');

-- Une énumération à une seule valeur aujourd'hui, et non un booléen ni un
-- texte libre : la deuxième valeur ('redaction_seule', pour régénérer un mail
-- sans retoucher au site) est probable, et l'idiome du dépôt est
-- l'énumération (`pipeline_status`, `deployment_step`, `pipeline_event_origin`).
create type campaign_job_kind as enum ('chaine');

create type campaign_job_state as enum
  ('en_attente', 'en_cours', 'termine', 'echoue', 'annule');

create table campaign (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,
  size           integer not null,

  -- L'envoi automatique vit sur LA CAMPAGNE, jamais dans une préférence
  -- utilisateur. Un réglage global survivrait au lot qui l'a justifié et
  -- s'appliquerait au suivant sans que personne le redemande — or ce réglage
  -- rouvre D6 du chantier n°4 (« le système rédige, l'humain envoie »), ce
  -- qui ne doit jamais arriver par héritage silencieux.
  --
  -- Écrit dès ce lot bien que le mode auto n'y soit pas construit : la
  -- colonne appartient à la forme de la table, et l'ajouter plus tard
  -- demanderait une seconde migration sur une table qui n'a pas bougé.
  auto_send      boolean not null default false,
  auto_send_at   timestamptz,

  state          campaign_state not null default 'en_cours',
  created_by     uuid,
  created_at     timestamptz not null default now()
);

create table campaign_job (
  id            bigint generated always as identity primary key,

  -- Nul quand la demande ne vient pas d'une campagne : « Déployer la
  -- sélection » traite des lignes cochées sans créer de lot.
  campaign_id   uuid references campaign (id) on delete set null,

  prospect_id   uuid not null references prospect (id) on delete cascade,
  kind          campaign_job_kind not null default 'chaine',
  state         campaign_job_state not null default 'en_attente',

  attempts      integer not null default 0,
  last_error    text,

  -- NULLABLE, ET LE TOTAL D'UNE CAMPAGNE DOIT LE DIRE. Si un étage ne rend
  -- pas son coût, la somme est PARTIELLE : l'afficher comme un total exact
  -- sous-déclarerait la dépense. Un chiffre faux est pire qu'un chiffre
  -- annoncé incomplet.
  cost_eur      numeric,

  requested_by  uuid,
  requested_at  timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

-- Le drainage : le plus ancien en attente d'abord.
create index campaign_job_file_idx
  on campaign_job (state, requested_at);

-- La bande de campagne, qui compte par lot.
create index campaign_job_campaign_idx
  on campaign_job (campaign_id);

-- UN SEUL JOB ACTIF PAR PROSPECT. Sans cet index, deux clics rapides
-- déposeraient deux chaînes sur le même dépôt GitHub, et le second échouerait
-- sur un nom déjà pris — un échec fabriqué par l'interface elle-même.
-- Partiel : un prospect peut avoir autant de jobs terminés qu'on veut.
create unique index campaign_job_actif_unique
  on campaign_job (prospect_id)
  where state in ('en_attente', 'en_cours');

-- Le worker est-il vivant ?
--
-- Sans cette table, un worker mort produirait des demandes qui s'empilent en
-- silence, et l'écran afficherait un bouton « Déployer » qui ne déploie rien
-- — exactement l'affordance que la doctrine interdit.
--
-- Ligne unique, sur le patron de `site_template` (chantier n°10).
create table worker_heartbeat (
  id         boolean primary key default true,
  beat_at    timestamptz not null,
  version    text,
  -- Combien de jobs le worker tient en ce moment : ce qui permet à l'écran de
  -- distinguer « à l'écoute, au repos » de « à l'écoute, occupé ».
  in_flight  integer not null default 0,
  constraint worker_heartbeat_singleton check (id)
);

-- Amorçage avec un battement VOLONTAIREMENT ANCIEN : tant qu'aucun worker
-- n'a tourné, l'écran doit lire « à l'arrêt », ce qui est la vérité. Une date
-- à `now()` ferait croire à un worker vivant dès la migration.
insert into worker_heartbeat (id, beat_at) values (true, now() - interval '1 day');

alter table campaign          enable row level security;
alter table campaign_job      enable row level security;
alter table worker_heartbeat  enable row level security;

-- Même doctrine que le reste du socle : le dashboard lit et écrit sous le
-- compte authentifié, le collector écrit avec la clé `service_role`, qui
-- contourne RLS nativement.
create policy authenticated_all on campaign
  for all to authenticated using (true) with check (true);
create policy authenticated_all on campaign_job
  for all to authenticated using (true) with check (true);
create policy authenticated_all on worker_heartbeat
  for all to authenticated using (true) with check (true);

-- REALTIME. Sans cet ajout, `postgres_changes` ne rend rien et l'écran
-- reste figé jusqu'à un rechargement manuel — le worker, lui, ne serait
-- jamais réveillé par un dépôt et n'avancerait qu'au balayage périodique.
--
-- `alter publication ... add table` n'altère NI ne supprime la table :
-- il l'ajoute à un flux. `deployment_event` existe depuis le lot 2 du
-- chantier n°6 et n'est pas modifiée ici.
--
-- GARDÉ, ET NON NU : l'état de `supabase_realtime` n'est pas connaissable
-- depuis ce dépôt. `deployment_event` a pu être ajoutée à la publication
-- depuis l'interface Supabase — aucune migration ne la manipule — et
-- `add table` sur une table déjà membre lève une erreur qui ferait échouer
-- la migration ENTIÈRE, sur une instance de production sans retour en
-- arrière. Deux autres cas nus lèveraient de même : la publication peut ne
-- pas exister du tout, ou avoir été créée `for all tables`, auquel cas y
-- ajouter une table nommée est refusé alors qu'elle y est déjà de fait.
do $$
declare
  nom_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication
       where pubname = 'supabase_realtime' and puballtables
     )
  then
    foreach nom_table in array array['campaign_job', 'deployment_event']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = nom_table
      ) then
        execute format('alter publication supabase_realtime add table %I', nom_table);
      end if;
    end loop;
  end if;
end $$;
