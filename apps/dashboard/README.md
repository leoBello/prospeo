# @prospeo/dashboard

Interface de lecture du socle de prospection : Vite + React + TypeScript,
sans backend propre. Le navigateur parle directement à PostgREST, et c'est la
RLS qui protège les données.

## Démarrer

```bash
pnpm --filter @prospeo/dashboard dev
```

Les variables sont lues dans le `.env` **de la racine du dépôt**, pas dans ce
paquet — `envDir: '../..'` dans `vite.config.ts`. Sans cette ligne, le build
réussirait en injectant un `import.meta.env` vide, et l'application
annoncerait « configuration incomplète » alors que le `.env` est rempli.

| Variable | Rôle |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet |
| `VITE_SUPABASE_ANON_KEY` | clé publiable ; publique par construction |

**Seules les variables préfixées `VITE_` partent dans le bundle.**
`SUPABASE_SERVICE_ROLE_KEY` reste donc au collector, et `readConfig` refuse en
plus de démarrer si une clé secrète atterrit dans `VITE_SUPABASE_ANON_KEY` :
les deux clés se ressemblent au point qu'un copier-coller les confond, et la
mauvaise fonctionne — mieux que l'autre, en contournant RLS.

## Le compte

Un seul compte, créé côté Supabase. L'écran de connexion n'ouvre aucun
parcours d'inscription : les politiques `authenticated_all` n'accordent pas
moins que tout, un compte créé librement lirait la base entière.

```bash
# Dashboard Supabase > Authentication > Users > Add user
# ou :
pnpm exec supabase auth admin create-user --email <adresse> --password <mot-de-passe>
```

## La pagination, qui n'est pas un détail

PostgREST plafonne toute réponse à `max_rows` (1000) sans le signaler : la
réponse tronquée est un HTTP 200 valide. Une lecture nue rendrait mille lignes
et l'interface les présenterait comme la base entière — elle ne planterait
pas, elle mentirait.

`src/data/paginate.ts` est le seul chemin de lecture autorisé pour une
collection. Il s'arrête sur une page incomplète et jamais sur une page pleine,
refuse une taille de page supérieure au plafond serveur, et échoue sur la
première erreur plutôt que de rendre les pages déjà lues.

Corollaire : **toute requête paginée doit porter un ordre total déterministe**
(`order('id')`). Sans lui, deux lignes de même rang peuvent changer de place
entre deux requêtes — l'une lue deux fois, l'autre jamais, pour un résultat de
la bonne taille et faux.

## L'absence n'est pas un zéro

Au 1ᵉʳ septembre 2026, 114 prospects sur 139 n'ont ni score, ni présence web
sondée. Les quatre satellites (`prospect_score`, `web_presence`,
`prospect_enrichment`, `prospect_pipeline`) restent donc `null` dans
`ProspectView`, et ce `null` remonte jusqu'à l'écran : « pas encore scoré »
et non « 0 », « sans objet » et non « 0 % ».

Aucun code de ce paquet ne doit remplacer un satellite absent par un objet
vide ou par des zéros. C'est la règle la plus facile à casser par
commodité, et la seule dont la violation ne produit aucune erreur.

## Ce que la base se contredit

Le dashboard lit des tables alimentées par des étages indépendants qui ne
tournent pas au même moment. `classify` déduit une catégorie de ce qu'`enrich`
a trouvé ; `score` chiffre ce que `classify` a conclu. Rien n'oblige ces
étages à être passés dans cet ordre sur un prospect donné, **et rien en base
ne marque qu'ils ne l'ont pas été.**

`src/domain/coherence.ts` confronte les trois tables et refuse de présenter un
chiffre douteux comme un chiffre sûr. Trois écarts, du plus urgent au moins
urgent :

| Écart | Ce qu'il signifie |
|---|---|
| `presence_contradicted` | catégorie `none` (+35) alors qu'une URL est déclarée — le prospect est probablement `has_site` (−100), donc du mauvais côté du seuil |
| `score_predates_enrichment` | `computed_at` antérieur à `enriched_at` : le score ignore le téléphone, la note et le site trouvés depuis |
| `score_stale_ruleset` | score calculé sous une autre version du barème |

Relevé le 1ᵉʳ septembre 2026 : **les 25 prospects scorés portent les deux
derniers écarts, et 4 portent le premier.** Autrement dit, aucun score en base
n'est actuellement digne de confiance. Ces écarts se corrigent en rejouant
`classify` puis `score` dans le collector ; le dashboard les constate, il ne
les répare pas.

Les 114 prospects sans satellite n'en portent aucun : une absence n'est pas
une incohérence, et les couvrir d'avertissements noierait les vrais.

## Structure

| Dossier | Contenu |
|---|---|
| `src/data` | pagination, requêtes PostgREST, client Supabase |
| `src/domain` | vues métier pures : barème, listes de travail, indicateurs |
| `src/i18n` | catalogues `fr` (référence) et `en` |
| `src/ui` | coquille, composants, tokens CSS |
| `src/screens` | connexion, « Aujourd'hui » |

## Tests

```bash
pnpm --filter @prospeo/dashboard test
pnpm --filter @prospeo/dashboard typecheck
```

Aucun test n'accède au réseau : le serveur PostgREST est simulé par une
fonction qui découpe un tableau, plafond `max_rows` compris.
