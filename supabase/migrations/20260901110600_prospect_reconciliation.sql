-- `is_closed` branche enfin le disqualifiant du barème : il existait dans
-- `scoring.ts` mais `cli.ts` écrivait `isClosed: false` en dur, faute de
-- source. Sans réconciliation, on continuerait d'appeler des entreprises
-- fermées en les classant bien.
alter table prospect add column is_closed boolean not null default false;

-- Trace de la dernière vérification. L'étage ne s'en sert PAS comme prédicat
-- de fraîcheur : il repasse la base entière à chaque exécution, sans quoi une
-- partie des prospects resterait indéfiniment hors contrôle. La colonne sert à
-- savoir quand un prospect a été vérifié pour la dernière fois.
alter table prospect add column reconciled_at timestamptz;
