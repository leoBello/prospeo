-- Chantier n°4, tâche 5 — de quoi écrire, journaliser et argumenter un message.

-- 1. Le SMS manquait au journal des échanges.
--
-- `interaction_kind` valait ('appel', 'whatsapp', 'email', 'note') : générer un
-- SMS sans pouvoir consigner qu'on l'a envoyé produirait un canal aveugle —
-- le seul dont la fiche ne saurait jamais dire s'il a servi. Ajouté APRÈS
-- 'email' pour que l'ordre de l'énumération suive celui des canaux écrits.
--
-- Note d'exécution : PostgreSQL interdit d'EMPLOYER une valeur ajoutée dans la
-- même transaction que son ajout. La déclarer ici est licite ; toute écriture
-- l'utilisant doit venir d'une migration ultérieure ou d'un autre run.
alter type interaction_kind add value 'sms' after 'email';

-- 2. L'objet de l'email.
--
-- `generated_message.content` est un `text` : il porte très bien un SMS ou un
-- script d'appel, qui sont des blocs de prose. Un email en est deux — un objet
-- et un corps — et les agglutiner dans une seule colonne obligerait le
-- dashboard à les redécouper à la lecture, sur une convention non écrite.
-- Le jour où l'objet contient une ligne vide, le découpage se trompe en
-- silence et l'artisan reçoit un mail dont l'objet est la moitié du corps.
--
-- Nullable, parce que seul l'email en a un. Une colonne vide sur deux canaux
-- sur trois coûte moins qu'une convention d'encodage à respecter des deux
-- côtés.
alter table generated_message add column subject text;

-- 3. LEQUEL des domaines est libre.
--
-- `domains` sait déjà qu'un candidat l'est — `domain_available` — mais pas
-- lequel : la boucle s'arrête au premier libre et n'en garde que le verdict.
-- Or le plan veut que le message dise « j'ai vérifié, serrurier-untel.fr est
-- libre », et c'est le nom qui porte l'argument. Un booléen ne permet d'écrire
-- que « un domaine est libre », ce qu'aucun artisan ne peut vérifier.
--
-- La colonne accompagne `domain_available` et suit son sort : elle est effacée
-- quand une sonde reclasse le prospect en `has_site`, pour la raison que
-- `domainProposalApplies` documente — la même ligne ne doit pas affirmer à la
-- fois que l'artisan a un site et qu'un domaine l'attend.
alter table web_presence add column domain_free_name text;
