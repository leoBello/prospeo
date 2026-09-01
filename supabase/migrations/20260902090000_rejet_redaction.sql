-- Chantier n°4, tâche 7 — de quoi REJETER une rédaction depuis le dashboard.

-- Le plan veut « de quoi rejeter une génération ». La question est où mettre le
-- refus, et la réponse tient en un mot : PAS dans l'effacement du contenu.
--
-- Effacer `content` aurait suffi à faire régénérer le prospect au prochain
-- `generate`, mais aurait coûté trois choses. On ne saurait plus distinguer
-- « jamais rédigé » de « rédigé puis refusé » — deux états qui appellent des
-- décisions opposées quand on relit un lot. On ne saurait plus CE QU'ON A
-- REFUSÉ, donc rien de ce qui aurait permis de corriger le prompt plutôt que
-- de retirer la même chose au hasard. Et on effacerait, en cliquant, la seule
-- copie d'un texte qui est peut-être déjà publié sous le nom d'une entreprise
-- réelle.
--
-- L'horodatage, lui, dit tout cela sans rien détruire : quand le refus a eu
-- lieu, et — par comparaison avec `generated_at` — si la rédaction qu'on lit
-- est celle qui a été refusée ou une nouvelle.
alter table prospect_site add column content_rejected_at timestamptz;

-- Le refus ne vaut que s'il ARRÊTE la publication.
--
-- Sans ce couplage, rejeter une rédaction dans le dashboard puis lancer
-- `publish` la pousserait quand même : le clic n'aurait servi à rien, et il
-- aurait de surcroît laissé croire le contraire. `runPublish` refuse donc un
-- contenu rejeté avant tout appel réseau, et `generate` le reprend comme s'il
-- n'existait pas. Les deux se lisent dans `stages/publish.ts` et dans la
-- commande `generate` du CLI.
comment on column prospect_site.content_rejected_at is
  'Rédaction refusée à la relecture. `publish` s''y refuse, `generate` la reprend.';
