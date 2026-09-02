# Maquettes — refonte de l'interface (chantier n°6)

Les maquettes qui accompagnent
[`docs/superpowers/plans/2026-09-02-refonte-ui-ux.md`](../../superpowers/plans/2026-09-02-refonte-ui-ux.md).

> **Maquettes :** `docs/design/maquettes/` — sources des artboards. Le canvas
> en ligne qui les portait a été supprimé ; les fichiers de ce dossier
> suffisent à le reconstruire.

---

## Ce qu'il y a ici

Huit artboards, répartis en trois pages dans `canvas.json`.

| Fichier | Page | Ce qu'il montre |
|---|---|---|
| `Main.dc.html` | Application | L'écran « Aujourd'hui » refondu : rail, liste, fiche à 720 px en quatre onglets. **Les onglets sont cliquables.** |
| `Composants.dc.html` | Application | Le vocabulaire : badges, infobulles, cartes, jauges, états vides, fondations couleur et typo. |
| `Deploiements.dc.html` | Déploiement | Le tableau de suivi, cinq étapes par ligne, échecs et péremptions. |
| `DeploiementDetail.dc.html` | Déploiement | Un déploiement en cours : étapes détaillées et journal de construction. |
| `Gabarit.dc.html` | Déploiement | Désigner un dépôt GitHub en substitution du gabarit par défaut. |
| `DirectionA.dc.html` | Directions | « Console calme » — écartée (D11). |
| `DirectionB.dc.html` | Directions | « Cockpit » — **retenue** (D11). |
| `DirectionC.dc.html` | Directions | « Dossier éditorial » — écartée (D11). |

`canvas.json` porte la mise en page du canvas : position et taille de chaque
artboard, pages, et les notes qui les commentent.

---

## Ces maquettes sont contraignantes

`Composants.dc.html` n'est pas une planche d'illustration : c'est le
**vocabulaire d'interface du projet**, et
[`../GUIDELINES.md`](../GUIDELINES.md) en fait une règle. Tout composant neuf
en part, et un composant **important** passe par une maquette approuvée avant
d'être écrit — les critères y sont énoncés.

Raison courte : **aucun test de ce dépôt ne voit une mise en page.** `jsdom`
ne calcule ni largeur, ni hauteur, ni débordement. La maquette est le seul
contrôle qui les voie, et le chantier n°6 l'a appris trois fois.

---

## Statut des données affichées

**Tout ce qui est affiché est un échantillon.** Les noms d'entreprises, SIRET,
téléphones, notes et adresses déployées sont inventés pour la maquette — ils
ne viennent pas de la base.

Ce qui, en revanche, **vient du code réel** et doit être respecté à
l'implémentation :

- les sept statuts de `pipeline_status` et leurs libellés de `i18n/fr.ts` ;
- les quatre groupes du barème (`presence`, `vitalite`, `joignabilite`,
  `disqualifiant`) ;
- les cinq états du site de `SiteSection.tsx` (aucune rédaction, non publié,
  non déployé, en ligne, retiré) ;
- les cinq étapes de déploiement, dans l'ordre de `stages/publish.ts` et
  `sources/vercel.ts` ;
- l'ordre de résolution des gabarits de `templateRepoFor`.

Les liens `href="#"` dans les maquettes sont des leurres : ils ne mènent nulle
part par construction.

---

## Rouvrir et modifier

Un `.dc.html` n'est **pas** une page autonome : il est enveloppé dans `<x-dc>`,
range ses feuilles et ses polices dans `<helmet>`, et — pour `Main.dc.html` —
porte des gabarits (`{{ x }}`), des conditions (`<sc-if>`) et des boucles
(`<sc-for>`) que l'éditeur de canvas résolvait. Ouvrir la source dans un
navigateur ne montre donc rien.

- **Regarder une maquette** : `node docs/design/maquettes/aplatir.mjs` écrit
  dans `rendu/` une version statique de chacune des huit, ouvrable directement.
  C'est une **lecture, pas une seconde vérité** : les `.dc.html` restent la
  référence, et `rendu/` se régénère plutôt qu'il ne s'entretient. Le script
  n'a aucune dépendance — il exécute la classe de logique de `Main` avec les
  réglages par défaut (`accent`, `gamification: affirmee`) et neutralise les
  gestionnaires de clic, qui n'ont plus de moteur derrière eux. **Les onglets
  de la fiche ne sont donc pas cliquables dans le rendu** ; l'onglet montré est
  celui de l'état initial, `Fiche`.
- **Retoucher visuellement** : le canvas en ligne qui portait ces artboards a
  été supprimé — il n'y a plus de lien à ouvrir. Les huit fichiers et
  `canvas.json` suffisent à le reconstruire ; c'est exactement ce dont ils sont
  issus.

Les fichiers sont du HTML lisible et modifiable à la main : styles en ligne,
SVG dessinés (aucune icône de bibliothèque, aucun emoji), et pour `Main.dc.html`
une petite classe de logique en bas de fichier qui porte l'état des onglets et
les deux réglages (`accent`, `gamification`).
