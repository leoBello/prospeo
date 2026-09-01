# @prospeo/db

Schéma Postgres du socle de prospection.

## Appliquer la migration

Dans le SQL Editor du projet Supabase, coller le contenu de
`migrations/0001_init.sql` et exécuter.

## Variables d'environnement

| Variable | Usage |
|---|---|
| `SUPABASE_URL` | URL du projet |
| `SUPABASE_SERVICE_ROLE_KEY` | collector uniquement — jamais dans le front |
| `VITE_SUPABASE_ANON_KEY` | dashboard — publique, protégée par RLS |

## RLS

Activée sur toutes les tables. La clé anonyme du dashboard est publique :
sans politiques, la base serait lisible par quiconque connaît l'URL.
