# Maquettes — refonte de l'interface (chantier n°6)

Les maquettes qui accompagnent
[`docs/superpowers/plans/2026-09-02-refonte-ui-ux.md`](../../superpowers/plans/2026-09-02-refonte-ui-ux.md).

**Canvas en ligne :** <https://claude.ai/code/artifact/9a4484de-0054-499a-8015-58bd7f1fe18a>

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

Un `.dc.html` n'est **pas** une page autonome : il ne s'ouvre pas dans un
navigateur. C'est la source d'un artboard, qui a besoin de l'éditeur pour se
rendre.

- **Consulter ou retoucher visuellement** : ouvrir le canvas en ligne
  (lien ci-dessus). Les modifications y sont sauvegardées en place.
- **Repartir des sources** : les huit fichiers et `canvas.json` de ce dossier
  suffisent à reconstruire le canvas — c'est exactement ce dont ils sont issus.

Les fichiers sont du HTML lisible et modifiable à la main : styles en ligne,
SVG dessinés (aucune icône de bibliothèque, aucun emoji), et pour `Main.dc.html`
une petite classe de logique en bas de fichier qui porte l'état des onglets et
les deux réglages (`accent`, `gamification`).
