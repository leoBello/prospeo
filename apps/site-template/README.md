# Modèle de site vitrine — plombier

Dépôt **modèle** (`Template repository`). Chaque prospect reçoit une copie de
ce dépôt, créée par l'étage `publish` du collector Prospeo via
`POST /repos/prospeo/plombier/generate`.

## Ce qui varie d'un site à l'autre

**Un seul fichier : `src/content/site.json`.** Rien d'autre. C'est la décision
d'architecture du chantier : le modèle de langage ne touche jamais au code, il
ne produit qu'un fichier de contenu validé contre un schéma. Aucune génération
ne peut donc casser un build, ni introduire de code arbitraire dans un dépôt
qui porte le nom d'une entreprise réelle.

Ce fichier contient trois blocs, et la séparation est le sujet :

- `faits` — assemblés depuis la base, jamais écrits par le modèle ;
- `redaction` — ce que le modèle produit : deux textes, un choix de
  prestations, et un **thème** ;
- `version` — sous quelles consignes et par quel modèle le texte a été produit.

Un relecteur voit donc en un coup d'œil ce qui a été écrit par une machine et
ce qui ne pouvait pas l'être.

## Le thème : un choix, pas une composition

`redaction.theme` porte trois jetons, et **trois seulement** :

```json
{ "palette": "cuivre", "typo": "grotesk-serif", "heros": "plomberie-06" }
```

Le modèle ne compose pas une apparence : il **sélectionne** dans des listes
closes, exactement comme il sélectionne des codes de prestation. La garantie
est structurelle et non verbale — il ne peut pas produire une couleur au
contraste illisible, une police absente du dépôt, ni une image qui n'existe
pas : le schéma rejette avant que rien ne soit écrit.

Les valeurs réelles vivent ici, jamais dans le fichier de contenu :

| Où | Quoi |
|---|---|
| `src/styles/palettes.css` | les cinq palettes, éprouvées au contraste (WCAG AA) |
| `src/styles/typos.css` | les trois appariements de polices, auto-hébergés |
| `src/assets/heros/` | les huit photographies d'ouverture |

Faire voyager des hexadécimaux dans `site.json` rouvrirait ce que ces listes
ferment : un contenu porteur de couleurs est un contenu qu'une génération — ou
une main dans le dépôt du prospect — peut rendre illisible sans qu'aucun
schéma ne s'en aperçoive.

## Développer

```
npm install
npm run dev      # http://localhost:4321
npm run build    # produit dist/
npm test         # les tests du gabarit, dont le contraste des palettes
```

Le site est **autonome** : aucune dépendance au monorepo qui l'a produit, et il
se construit hors de lui — c'est ce que fait Vercel. Un test le vérifie
(`src/autonomie.test.ts`).

## Ce que le build refuse

`src/content/load.ts` valide `site.json` contre le contrat et **lève** en cas
d'écart. Un build rouge vaut mieux qu'une page déployée au téléphone manquant,
dont l'URL partirait dans un email et que l'artisan découvrirait lui-même.

Le contrat est en **v2** : un contenu v1, sans thème ni coordonnées, est
refusé plutôt que construit — il produirait une page sans couleurs et une
carte sans point.

## Dégradation

Chaque section sait disparaître quand le fait qui la fonde manque. Mesuré sur
la base au 2 septembre 2026, pour les 37 prospects éligibles à un site :

| Fait | Couverture | Sans lui |
|---|---|---|
| téléphone, ville, année | 37 / 37 | — |
| coordonnées | 37 / 37 | la carte disparaît |
| note Google ≥ 4 | 26 / 37 | la section avis disparaît entièrement |
| lien Maps | 37 / 37 | le lien vers la fiche disparaît |

Une fiche dépouillée rend une page complète et sans trou : c'est un test, pas
une intention.

## Performance et accessibilité

Mesuré sur la page bâtie, en local :

```
performance 96   accessibilité 100   bonnes pratiques 100   SEO 63
```

Le SEO est bas pour une seule raison, et elle est voulue : la page porte
`noindex, nofollow`. Voir ci-dessous.

Les animations (GSAP + ScrollTrigger) sont **entièrement coupées** sous
`prefers-reduced-motion: reduce` — rien n'est instancié, et l'état de départ
n'est jamais posé en CSS, si bien qu'une page dont le script ne s'exécute pas
reste entièrement lisible.

La carte (Leaflet + tuiles OpenStreetMap) n'est téléchargée qu'à l'approche de
sa section. C'est le seul tiers que la page contacte : polices, images et
scripts sont tous servis depuis ce dépôt.

## Mentions légales

Le site déclare son véritable éditeur — pas l'artisan, qui n'a rien demandé —
et porte une adresse de contact permettant d'en demander le retrait immédiat.
Il porte aussi un bandeau de démonstration que le fichier de contenu ne peut
pas éteindre, et une balise `noindex, nofollow` : ces pages ne doivent pas
entrer en concurrence dans Google avec le vrai site de l'artisan, ni devenir
*le* résultat pour son nom.
