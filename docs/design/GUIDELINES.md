# Règles de conception de l'interface

> **Ce document est contraignant.** Il ne décrit pas un goût, il fixe un
> vocabulaire — et un vocabulaire ne vaut que si personne n'en invente un
> second à côté.

La référence est [`maquettes/Composants.dc.html`](maquettes/Composants.dc.html),
l'artboard « Vocabulaire d'interface ». Il ne s'ouvre pas tel quel dans un
navigateur ; sa version rendue est [`maquettes/rendu/Composants.html`](maquettes/rendu/Composants.html),
régénérable par `node docs/design/maquettes/aplatir.mjs`.

---

## 1. Tout composant neuf part de ce vocabulaire

`Composants.dc.html` fixe, et c'est là qu'on va chercher avant d'inventer :

| Ce qu'il fixe | Ce que ça implique |
|---|---|
| **Les fondations couleur** | Aucune couleur n'existe hors des tokens de `theme.css`. |
| **Les trois familles typographiques** (D6) | Bricolage Grotesque pour les titres et les grands nombres, Instrument Sans pour l'interface et la copie, JetBrains Mono pour tout chiffre comparable — scores, SIRET, durées, identifiants. |
| **Les sept statuts du pipeline** et leur ton | `StatusBadge` les porte tous ; on n'en dessine pas un huitième. |
| **Les badges de fait** (présence web, état du site, métier, péremption, gabarit) | Un fait se rend par un `Badge`, pas par une phrase colorée. |
| **Les infobulles** | Elles portent le *pourquoi*, jamais ce dont la décision dépend (D4). |
| **Les actions** | Une action primaire par écran, les autres en contour. |
| **Les champs**, les cartes de faits, de chiffre, d'alerte | `Card` / `Field` les portent. |
| **Les absences et les vides** | « Pas encore collecté », « non publié par la source », « jamais scoré », « aucune relance due » : quatre absences **de natures différentes**, quatre rendus distincts. |

**Un composant qui a besoin de quelque chose que le kit n'a pas : on étend le
kit, on ne le double pas.** `apps/dashboard/src/ui/kit/` est le vocabulaire
exécutable de cet artboard. Un second badge, une seconde carte, une seconde
infobulle sont des dialectes — et un dialecte se paie à chaque écran suivant.

## 2. Un composant important passe par une maquette approuvée

**Avant d'écrire un composant important, il faut une maquette validée par le
design.** Pas une description en prose dans un plan : un artboard, dans
`docs/design/maquettes/`, approuvé.

Est **important** un composant qui remplit au moins un de ces critères :

- il occupe une zone structurante d'un écran (une bande, un en-tête, un
  panneau, une colonne, un tableau) ;
- il est **partagé par plusieurs écrans** ;
- il entre dans le kit ;
- il rend une **absence**, un état d'erreur ou un état de chargement — c'est
  là que ce dépôt s'est trompé le plus souvent ;
- il affiche un **chiffre** sur lequel quelqu'un va décider.

Ne sont pas importants : l'agencement interne d'un composant déjà maquetté,
un correctif de mise en page, un état supplémentaire d'un composant existant
dont la forme est déjà fixée.

**Pourquoi cette règle existe.** Le chantier n°6 a produit trois écarts que la
maquette aurait évités, et un quatrième qu'elle a révélé : une bande de
progression construite sans son anneau, un état vide qui cassait une rangée,
une cellule inventée qui écrasait la mise en page à la largeur réelle, et une
maquette — `DeploiementDetail` — qui n'a jamais trouvé d'écran parce qu'aucune
tâche ne la portait. Les trois premiers ont traversé plus de quatre cents
tests verts : **aucun test de ce dépôt ne voit une mise en page.** La maquette
est le seul contrôle qui la voie.

**Quand la maquette et le code divergent, la maquette gouverne** — sauf si la
suivre obligerait à afficher un fait que le code ne peut pas rendre vrai
(§3). Dans ce cas, l'écart se documente dans `HANDOFF.md`, avec sa raison.

## 3. Les règles qui priment sur la maquette

Elles ne sont pas négociables, et une maquette qui les contredirait est une
maquette à corriger :

- **Une absence se nomme, jamais elle ne se vide**, et **des absences de
  natures différentes restent distinctes**. « Pas encore » n'est pas
  « jamais ».
- **`null` est porteur de sens.** Un prospect sans score n'est pas un
  prospect à zéro.
- **Ne jamais construire une affordance qui annonce un fait qu'aucun code ne
  peut rendre vrai.** Un chiffre motivant fondé sur rien est pire que pas de
  chiffre.
- **La couleur n'est jamais le seul indicateur d'un état.** Tout badge porte
  un mot ; toute pastille porte un `aria-label`.
- **Aucune chaîne affichée en dur.** Tout passe par `t()`, dans `fr.ts` **et**
  `en.ts`.
- **Aucune couleur en dur.** Uniquement des `var(--…)` de `theme.css` : c'est
  la condition pour que le thème clair reste livrable.

## 4. Ce que les tests vérifient, et ce qu'ils ne verront jamais

`apps/dashboard/src/ui/guidelines.test.ts` fait respecter mécaniquement ce
qui peut l'être : aucune couleur littérale hors du thème, aucune famille
typographique hors des tokens, et l'absence du piège de mise en page qui a
coûté deux corrections à ce dépôt (`text-overflow: ellipsis` posé sur un
conteneur `flex` ou `grid`, où il n'a aucun effet).

`src/i18n/i18n.test.ts` traque les clés orphelines ; `src/ui/theme.test.ts`
mesure le contraste, la présence des trois familles et l'absence de token
sans consommateur.

**Ce qu'aucun test ne verra :** une largeur, une hauteur, un débordement, un
chevauchement, une troncature. `jsdom` ne calcule aucune mise en page. C'est
précisément le domaine que la maquette approuvée du §2 couvre, et la raison
pour laquelle elle n'est pas une formalité.
