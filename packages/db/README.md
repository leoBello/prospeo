# @prospeo/db

Schéma Postgres du socle de prospection, et types TypeScript générés depuis
la base réelle.

## Où vivent les migrations

`supabase/migrations/` à la racine du dépôt — pas dans ce paquet. C'est la
convention imposée par le CLI Supabase, qui suit l'ordre des fichiers par leur
horodatage et enregistre dans la base ce qui a déjà été appliqué.

| Fichier | Contenu |
|---|---|
| `20260901000000_init.sql` | 4 types énumérés, 7 tables, index, RLS et politiques |

## Mise en place, une fois par machine

```bash
pnpm exec supabase login                      # jeton d'accès personnel
pnpm exec supabase link --project-ref <ref>   # <ref> = le sous-domaine de SUPABASE_URL
```

Le `project-ref` est la partie variable de `SUPABASE_URL` :
`https://<ref>.supabase.co`.

## Usage courant

```bash
pnpm db:list              # ce qui est appliqué, ce qui est en attente
pnpm db:push --dry-run    # ce qui serait appliqué, sans rien écrire
pnpm db:push              # applique les migrations en attente
pnpm db:types             # régénère packages/db/src/database.types.ts
```

Créer une migration : `pnpm exec supabase migration new <nom>` crée un fichier
horodaté vide dans `supabase/migrations/`.

**Régénérer les types après chaque `db:push`.** C'est ce qui rend les noms de
colonnes vérifiables à la compilation : sans le type `Database`, une faute de
frappe dans un `.from(...).upsert(...)` ne se voit qu'à l'exécution.

## Variables d'environnement

| Variable | Usage |
|---|---|
| `SUPABASE_URL` | URL du projet |
| `SUPABASE_SERVICE_ROLE_KEY` | collector uniquement — contourne RLS, jamais dans le front |
| `VITE_SUPABASE_ANON_KEY` | dashboard — publique, c'est RLS qui protège |

## RLS

Activée sur les sept tables dès la première migration. La clé anonyme du
dashboard part dans le bundle JavaScript : sans politiques, la base serait
lisible par quiconque connaît l'URL. Ce n'est pas un durcissement ultérieur,
c'est la condition de validité de l'architecture sans backend.

## Un piège à connaître

`web_presence.category` est un `enum` Postgres. On peut y ajouter une valeur
(`ALTER TYPE … ADD VALUE`) mais **jamais en retirer une** sans recréer le type
et migrer les colonnes qui l'utilisent.

`web_presence.category` est par ailleurs **nullable à dessein** : l'étage
`probe` s'exécute avant `classify` et ne connaît pas encore la catégorie. Une
colonne `not null` obligerait à écrire une valeur sciemment fausse entre deux
étages.
