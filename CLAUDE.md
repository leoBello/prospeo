# Prospeo — règles du dépôt

Monorepo pnpm : Postgres/Supabase, un collector en ligne de commande (Node),
un dashboard React 18 + Vite + TypeScript + CSS Modules.

**Tout est en français** : le code, les commentaires, les tests, l'interface,
la documentation. Les commentaires disent le *pourquoi*, jamais le *quoi*.

## Avant d'écrire un composant d'interface

**Lis [`docs/design/GUIDELINES.md`](docs/design/GUIDELINES.md).** Il fixe le
vocabulaire, et il est contraignant. Deux règles en sortent, à connaître avant
même d'ouvrir un fichier :

1. **Le vocabulaire vient de l'artboard « Composants »**
   (`docs/design/maquettes/Composants.dc.html`, rendu ouvrable dans
   `maquettes/rendu/`). `apps/dashboard/src/ui/kit/` en est la version
   exécutable : **on l'étend, on ne le double pas.**
2. **Un composant important passe par une maquette approuvée par le design,
   avant d'être écrit.** Les critères d'« important » sont dans les
   guidelines. Aucun test de ce dépôt ne voit une mise en page — la maquette
   est le seul contrôle qui la voie.

## La doctrine, qui prime sur toute facilité

- **Une absence se nomme, jamais elle ne se vide**, et **des absences de
  natures différentes restent distinctes.** « Pas encore » n'est pas
  « jamais ». C'est ce que ce dépôt défend le plus âprement, et ce qu'il a
  violé le plus souvent.
- **`null` est porteur de sens.** Un prospect sans score n'est pas un
  prospect à zéro.
- **Ne jamais construire une affordance qui annonce un fait qu'aucun code ne
  peut rendre vrai.** Un chiffre motivant fondé sur rien est pire que pas de
  chiffre.
- **La couleur n'est jamais le seul indicateur d'un état.** Tout badge porte
  un mot ; toute pastille porte un `aria-label`.
- **Aucune chaîne affichée en dur** : tout passe par `t()`, dans
  `src/i18n/fr.ts` **et** `en.ts`. Une clé sans consommateur hors tests fait
  échouer la suite ; une clé composée à l'exécution exige sa ligne
  d'exception, avec sa raison.
- **Aucune couleur en dur** : uniquement des `var(--…)` de `ui/theme.css`.
  C'est la condition pour que le thème clair reste livrable.
- **Imports en `.js`** même depuis un `.tsx` (ESM/NodeNext).

## Les tests

- **Écris le test d'abord**, et vérifie qu'il échoue pour la bonne raison.
- **Toute assertion doit être prouvée capable d'échouer** : casse le code
  qu'elle couvre, observe le rouge, restaure, observe le vert. Un récit sans
  transcription n'est pas une preuve. Aux lots précédents, quatre assertions
  mortes sur cinq venaient d'un texte **inventé** plutôt que lu dans `fr.ts`.
- **Le texte d'une assertion se lit dans `fr.ts`**, jamais ne s'invente —
  pas même depuis un plan.
- Pièges de cette suite, qui y ont déjà produit des assertions mortes :
  `getByText`/`queryByText` comparent le texte **entier du nœud** ;
  `queryByRole` filtre par défaut sur `hidden: false` ; `getAllByText` **lève**
  à zéro correspondance, donc un `.length > 0` qui suit ne teste rien ; une
  assertion négative mal écrite est vraie quoi qu'il arrive.
- **N'écris jamais un test qui prétend voir une mise en page.** `jsdom` ne
  calcule ni largeur, ni hauteur, ni débordement. Trois défauts visuels ont
  traversé 446, puis 460, puis 468 tests verts.
- Les contrôles automatiques qui gardent les règles ci-dessus :
  `ui/guidelines.test.ts` (couleurs, fontes, pièges de mise en page),
  `ui/theme.test.ts` (contraste, familles, tokens sans consommateur),
  `i18n/i18n.test.ts` (clés orphelines, parité fr/en).

## Commandes, depuis la racine

```
pnpm --filter @prospeo/dashboard test     # tests du dashboard
pnpm --filter @prospeo/collector test     # tests du collector
pnpm -r typecheck                          # types, tous paquets
pnpm db:push && pnpm db:types              # migrations, puis types régénérés
node docs/design/maquettes/aplatir.mjs     # rend les maquettes ouvrables
```

**Un argument `-- <motif>` ne restreint PAS un run vitest** dans cette
configuration : la suite entière s'exécute quoi qu'il arrive. Ne prétends
jamais avoir lancé un sous-ensemble.

## La base

`supabase/migrations/` s'applique à une **instance réelle** : il n'y a pas
d'environnement de recette. Une migration se relit instruction par
instruction avant `pnpm db:push`, et **rien ne modifie ni ne supprime un
objet existant**. `packages/db/src/database.types.ts` est **généré** —
jamais édité à la main.

Un piège déjà payé : **une table d'événements créée en cours de route ne
connaît pas le passé.** Toute source de points, de compteur ou de badge qui
s'y adosse doit se demander si le fait qu'elle mesure existait avant elle —
et, si oui, aller le chercher dans la table d'état.

## Où lire la suite

- `docs/design/HANDOFF.md` — ce que les maquettes montrent et que la base ne
  sait pas encore, les zones inertes et leur motif, les décisions ouvertes.
  **Il porte un avertissement — « ne pas lire ce tableau comme clos » — qui
  vaut toujours.**
- `docs/superpowers/plans/` — les chantiers, décision par décision, chacune
  avec sa raison.
