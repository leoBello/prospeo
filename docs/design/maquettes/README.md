# Maquettes — l'interface de Prospeo

Les sources des artboards. Les règles qu'elles fixent sont dans
[`../GUIDELINES.md`](../GUIDELINES.md), qui est contraignant.

**Canvas publié** : <https://claude.ai/code/artifact/f30a87ba-b5a5-447b-a81a-cde27141cb6d>

**Il n'y a qu'un seul canvas, et c'est celui-là.** Le précédent avait été
supprimé ; celui-ci est reconstruit depuis les fichiers de ce dossier, qui
font foi. Toute évolution de l'interface met ces fichiers à jour puis
republie **au même lien** : une maquette qui décrit l'écran d'avant ne
gouverne plus rien, elle induit en erreur. Un second canvas publié à côté est
la même erreur sous une autre forme.

---

## Ce qu'il y a ici

Quinze artboards, répartis en cinq pages dans `canvas.json`. Les huit premiers
viennent du chantier n°6 ; les deux suivants de la campagne de prospection
(chantier n°7) ; les cinq derniers de la veille par onglets.

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
| `Campagne.dc.html` | Campagne | L'écran nominal : les 20 prospects jamais touchés, la piste Site · Mail · Envoi, la bande de conditions, le panneau de relecture du mail. |
| `CampagneEtats.dc.html` | Campagne | Les états qui décident : conditions manquantes, réglage d'envoi automatique, quatre listes vides de causes différentes, l'adresse manquante. |
| `Veille.dc.html` | Veille | L'écran « Aujourd'hui » refondu : le brief repliable, puis **la veille par onglets de statut** — dix lignes par page, pagination, six colonnes dont une contextuelle. **Les onglets sont cliquables.** |
| `VeilleDetail.dc.html` | Veille | Le même écran, fiche ouverte **en surimpression** : la table garde sa largeur, ses colonnes ne bougent pas — et le panneau en recouvre trois. |
| `VeilleCompacte.dc.html` | Veille | La même page dans une fenêtre de **1440 × 720**, brief replié : les dix lignes tiennent, mesuré au navigateur. |
| `VeilleEtats.dc.html` | Veille | Les six situations que les onglets créent : onglet à zéro, comptes pas encore reçus, recherche sans résultat, colonne contextuelle, absences d'une rangée, **la ligne qui quitte l'onglet**. |
| `VeilleArbitrages.dc.html` | Veille | Les trois arbitrages **tranchés le 2026-09-10**, avec les options écartées, leur coût, et ce que les décisions obligent. |

`canvas.json` porte la mise en page du canvas : position et taille de chaque
artboard, pages, et les notes qui les commentent.

---

## La veille par onglets — tranchée le 2026-09-10

Née d'un défaut constaté à l'usage : « Nouveaux prospects à fort score »
plafonne à douze lignes (`MAX_ROWS_PER_LIST`) et annonce le reste par
« N de plus, non affichés ici ». On ne suit pas une prospection dans une liste
dont on ne voit pas la fin.

Trois arbitrages ont été rendus par le propriétaire, et un quatrième était
demandé. Ils sont dessinés dans `VeilleArbitrages.dc.html` avec les options
écartées et leur coût ; les voici avec ce qu'ils **obligent** :

| Décision | Ce qu'elle oblige |
|---|---|
| **1A — les prospects sans ligne de suivi vont dans « À contacter »** | L'onglet retient `pipeline` nul **et** `a_contacter`, et la colonne « Suivi » les distingue par `StatusBadge` — jamais par la seule couleur. **Aucune migration** : rien ne crée de ligne de suivi. |
| **2A — la bande « Relances dues » reste**, dans le brief repliable | `buildToday` garde sa file de relances telle quelle ; la table s'ajoute à côté, elle ne la remplace pas. Une ligne peut figurer deux fois sur l'écran, et c'est voulu — une échéance n'est pas un statut. |
| **3-1 — dix lignes par page, taille constante** | Aucun code ne mesure une hauteur pour en déduire une taille de page. Le repli du brief est un état **persistant**, pas un réglage de session. |
| **Le panneau passe en surimpression** (demandé) | `.body` devient `position: relative` à toutes les largeurs, `.panel` un calque à `--z-panel`, et la bascule à 900 px de `ProspectPanel.module.css` disparaît — c'est déjà le comportement, partout. Contrepartie assumée : le panneau **recouvre** les trois colonnes de droite. |

**Une colonne « Commune » a été retirée du dessin** : la base tient un seul
code postal (139 prospects, tous à Nantes), et la colonne aurait répété la même
valeur cent trente-neuf fois. Elle est remplacée par « Téléphone », qui porte le
numéro, son type (`mobile` / `fixe`) et son absence.

**Les hauteurs sont mesurées, pas estimées.** Les trois artboards d'écran ont
été rendus dans un navigateur et mesurés : 900 px pour `Veille` et
`VeilleDetail` dans une fenêtre de 900, 720 px pour `VeilleCompacte` dans une
fenêtre de 720. Une correction de mise en page se revérifie de la même façon —
`jsdom` ne verra jamais rien de tout cela.

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

**Les cinq artboards « Veille » emploient les chiffres réels de la base**,
relevés le 2 septembre 2026 : `prospect` = 139, `prospect_score` = 129,
`prospect_pipeline` = **2**. C'est délibéré — la répartition par statut est la
première chose que ce dessin doit rendre visible, et elle est aujourd'hui
extrêmement déséquilibrée : cinq onglets sur huit sont à zéro. Seuls le
partage des deux lignes de suivi entre « Contacté » et « Relancé », et le
partage des dix prospects non scorés, sont des échantillons ; ils sont
indiscernables des vrais faute de relevé, et rien ne se décide dessus.

**Les deux artboards « Campagne » montrent quatre choses que la base ne sait
pas encore**, et qu'aucune ligne de code ne rend vraie aujourd'hui :

- **la file `campaign_job`** et le worker qui la draine — le badge « Collector
  à l'écoute » n'a aucune table derrière lui ;
- **`prospect_contact`** et l'origine de l'adresse (collectée / saisie) —
  aucune colonne du schéma ne porte d'email, ce qui est le blocage nommé au
  §« l'adresse manquante » ;
- **le jeton d'envoi Gmail** — `AuthProvider` ne connaît aujourd'hui que
  `signInWithPassword` ;
- **le coût cumulé d'une campagne** — rien ne le compte encore côté dashboard.

Tant que ces quatre-là n'existent pas, l'écran ne doit pas être construit
au-delà de ce qu'elles permettent : c'est exactement la règle « ne jamais
construire une affordance qui annonce un fait qu'aucun code ne peut rendre
vrai ».

Les liens `href="#"` dans les maquettes sont des leurres : ils ne mènent nulle
part par construction.

---

## Rouvrir et modifier

Un `.dc.html` n'est **pas** une page autonome : il est enveloppé dans `<x-dc>`,
range ses feuilles et ses polices dans `<helmet>`, et — pour `Main.dc.html` —
porte des gabarits (`{{ x }}`), des conditions (`<sc-if>`) et des boucles
(`<sc-for>`) que l'éditeur de canvas résolvait. Ouvrir la source dans un
navigateur ne montre donc rien.

- **Regarder une maquette** : ouvrir le canvas publié (lien en tête), ou
  lancer `node docs/design/maquettes/aplatir.mjs`, qui écrit dans `rendu/` une
  version statique de chacune, ouvrable directement.
  C'est une **lecture, pas une seconde vérité** : les `.dc.html` restent la
  référence, et `rendu/` se régénère plutôt qu'il ne s'entretient. Le script
  n'a aucune dépendance — il exécute les classes de logique avec les réglages
  par défaut (`accent`, `gamification: affirmee`) et neutralise les
  gestionnaires de clic, qui n'ont plus de moteur derrière eux. **Les onglets
  ne sont donc pas cliquables dans le rendu**, ni ceux de la fiche
  (`Main`, état initial `Fiche`) ni ceux de la veille (`Veille`, état initial
  « À contacter »).
- **Retoucher visuellement** : dans le canvas publié. Les fichiers de ce
  dossier restent la référence — le canvas se reconstruit depuis eux, jamais
  l'inverse.

Les fichiers sont du HTML lisible et modifiable à la main : styles en ligne,
SVG dessinés (aucune icône de bibliothèque, aucun emoji), et pour `Main.dc.html`
une petite classe de logique en bas de fichier qui porte l'état des onglets et
les deux réglages (`accent`, `gamification`). `Veille.dc.html` en porte une
aussi, pour ses huit onglets.

`VeilleDetail.dc.html` et `VeilleCompacte.dc.html` sont **dérivés** de
`Veille.dc.html` : ils en reprennent le rendu statique, l'un en y posant le
panneau, l'autre en repliant le brief. Une correction apportée à la table se
fait donc dans `Veille.dc.html`, et les deux se régénèrent — sans quoi les
trois divergent en silence.
