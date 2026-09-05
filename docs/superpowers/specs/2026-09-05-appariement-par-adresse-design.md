# L'appariement par adresse — décisions

**Date :** 2026-09-05
**Statut :** approuvé, prêt pour le plan d'implémentation
**Portée :** `packages/core` (l'appariement) et la commande `calibrate`. Aucune migration, aucun écran.

---

## 1. Le constat qui déclenche ce chantier

Mesuré le 5 septembre 2026, consigné dans `docs/design/HANDOFF.md`, section
« L'appariement, mesuré le 5 septembre 2026 » — **ne pas refaire ces mesures.**

Sur les 139 prospects nantais : **90 `not_found`**, 39 `ok`, 10 `ambiguous`.
Et le fait qui a tout réorienté : **aucun des 90 n'est réellement absent de
Google Maps.** Tous ont reçu entre 5 et 12 candidats. L'appariement les a
tous rejetés.

La cause tient en une ligne : le score vaut `nom 0,65 + proximité 0,25 +
catégorie 0,10`, et **le nom vaut ~0 pour cette population.** Le SIRET dit
`SARL ALLARD`, `EPB`, `HYDROVOLT` ; Google Maps affiche `AB Plomberie`,
`Ze Plombier - Nantes`, `C'est le Plombier`. Le nom légal et le nom
commercial d'un artisan n'ont, le plus souvent, rien à voir. Le motif
« nom : aucune variante exploitable » revient sans cesse.

**L'adresse, elle, existe des deux côtés et ne ment pas.** Le score ne la
lit jamais : il n'emploie que la distance entre coordonnées. Or « même
numéro, même rue, même code postal » est une preuve d'une autre nature que
« 300 mètres », et surtout **indépendante du nom**, qui est précisément le
signal défaillant.

## 2. Ce que la mesure a déjà tranché — et qu'il ne faut pas rouvrir

Deux pistes évidentes ont été explorées et écartées, **avec leurs chiffres**.
Les reprendre coûterait du temps pour rien.

### Le rayon est déjà au bon réglage

Le balayage hors ligne est écrit dans le commentaire de `MATCHING_CONFIG`
(`packages/core/src/matching.ts`), sur cette même population :

| Rayon | Fusions | À trancher | Introuvables |
|---|---|---|---|
| 300 m | 35 | 9 | 95 |
| **1 000 m (actuel)** | **39** | **10** | **90** |
| 2 000 m | 39 | 21 | 79 |
| 3 000 m | 39 | 29 | 71 |

**Au-delà de 1 000 m, zéro fusion supplémentaire** — seulement de la file de
revue. Les 676 candidats que le rayon écarte ne deviendraient pas des
appariements : ils passeraient de « hors rayon » à « sous le seuil ».
`maxDistanceM` ne bouge pas.

### Il n'existe aucun filtre de catégorie à assouplir

Le dépôt ne rejette **jamais** sur la catégorie : elle pèse 0,10 dans le
score, et ce poids résulte déjà d'une baisse délibérée de 0,15 à 0,10, parce
que Google classe mal cette population (le commentaire cite « Ideal »,
plombier, classé « Électricien »). Le filtre dur observé pendant
l'investigation appartenait au script de mesure, pas au dépôt.

## 3. Décisions

### A1 — Une « voie adresse », qui n'ajoute que des fusions

Une seconde voie de décision s'ajoute au score existant. Elle ne peut que
**transformer un `not_found` en `ok`**. Elle ne retire aucune fusion, ne
dégrade aucun verdict, et **n'envoie rien de neuf en revue**.

*Pourquoi cette forme :* le propriétaire a posé une contrainte explicite —
il ne veut pas arbitrer. Une voie qui alimenterait la file `ambiguous`
transformerait un gain en corvée. Une voie qui ne fait qu'ajouter des
fusions certaines respecte cette contrainte, et laisse le score existant
intact, donc non recalibré.

*Conséquence assumée :* les cas douteux restent `not_found`, comme
aujourd'hui. On préfère un prospect manqué à un prospect faussement apparié
— c'est déjà le sens de l'erreur du matcher actuel, vérifié : sur 39
appariements, **aucun faux positif**.

### A2 — L'adresse se compare après normalisation, et les préfixes sont le piège

Deux adresses désignent le même point quand le **numéro de voie** et le
**code postal** coïncident, et que **tous les mots significatifs de la voie
côté Maps se retrouvent côté SIRET**.

*L'inclusion, et non « un mot en commun ».* « Un mot en commun » a réellement
apparié `9 avenue Général Marchand` à `9 rue Kléber` pendant
l'investigation. *L'inclusion dans ce sens-là*, et non l'égalité, parce que
l'adresse SIRET porte souvent des mots en plus que Maps n'a pas
(`ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX` face à `1 Rue du Benelux`),
alors que l'inverse ne se produit pas.

*Ce que cette règle laisse passer, et qu'on assume :* `3 rue Victor Hugo` et
`3 avenue Victor Hugo` dans le même code postal s'appariraient, le type de
voie étant ignoré. Le cas est rare et, s'il survient, A3 puis A4 doivent
encore tenir.

La normalisation doit traiter quatre pièges, tous constatés dans les données
réelles :

1. **Les préfixes avant le numéro de voie.** `BUREAU 3 2 PLACE JEAN V`,
   `PORTE 64 11 RUE FELIBIEN`, `ETAGE 1 APPT 59 5 RUE ANITA CONTI`,
   `ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX`. Prendre « le premier
   nombre » donne le bureau, l'étage ou l'appartement. **C'est l'erreur qui a
   faussé la première mesure de ce chantier**, et elle a fait passer de
   vraies correspondances pour des rejets.
2. **Les suffixes de numéro** : `71` contre `71b`, `30 B` contre `30 bis`.
   Ils désignent le même immeuble et doivent se rapprocher.
3. **Les abréviations de type de voie** : `AVENUE`/`Av.`, `BOULEVARD`/`Bd`,
   `PLACE`/`Pl.`, `ROUTE`/`Rte`, `CHEMIN`/`Chem.`. Le type de voie ne porte
   aucune identité : il s'ignore.
4. **Les mots-outils et le nom de la commune.** `DES`, `DE`, `DU`, `LA`,
   `LES`, `ET`, et `NANTES` figurent dans presque toutes les adresses.
   **Les laisser dans la comparaison suffit à tout apparier avec tout** —
   c'est exactement ce qui a produit la mesure fausse « 33 récupérables »,
   où `9 avenue Général Marchand` a été apparié à `9 rue Kléber`.

### A3 — Dans la voie adresse, la catégorie devient « un métier du bâtiment »

À l'adresse exacte, le test de catégorie ne demande plus « est-ce le métier
cherché ? » mais « est-ce **un** métier du bâtiment ? ».

*Pourquoi :* les deux cas de la mesure ne sont pas de même nature. Une
**boulangerie** à l'adresse d'un plombier est un autre commerce dans le même
immeuble — un faux positif. `BELENOS`, classé « Serrurier » et enregistré au
SIRET « BELENOS SERRURERIE, BELENOS PLOMBERIE », est le bon artisan sous une
étiquette voisine — un faux négatif. Un test « métier du bâtiment » les
sépare, sans humain.

*Portée strictement bornée :* cette lecture élargie ne vaut **que** dans la
voie adresse, où elle est adossée à une preuve forte. Le poids de 0,10 du
score général ne change pas, et `matchesCategory` garde son comportement
actuel pour tous les autres usages.

*La liste des métiers du bâtiment est une donnée, pas une constante cachée* :
elle vit à côté des `Trade`, elle est plus large que l'union de leurs
`categoryLabels` (elle doit contenir au moins électricien, couvreur, maçon,
menuisier, chauffagiste), et **elle exclut les mots que le dépôt a déjà
identifiés comme mauvais discriminants** — `dépannage` en tête, qui qualifie
aussi bien l'électroménager que l'automobile (voir le commentaire de
`matchesCategory`).

### A4 — Deux candidats du bâtiment à la même adresse : aucune fusion

Si plusieurs candidats satisfont A2 **et** A3 pour un même prospect, la voie
adresse ne tranche pas et se retire. Le prospect suit son sort habituel.

*Pourquoi :* un plombier et un électricien qui partagent un local produiraient
deux candidats également crédibles. Choisir le premier serait choisir au
hasard. Le doute se constate automatiquement — il n'a pas besoin d'un humain
pour être reconnu, seulement pour être levé, et A1 dit qu'on ne le lui
demande pas.

### A5 — Rien ne s'applique sans mesure préalable par `calibrate`

`calibrate` rejoue l'appariement hors ligne sur les candidats déjà
enregistrés (`prospect_enrichment.candidates` porte nom, adresse, téléphone,
note, catégorie et `placeId`), **sans une seule requête Google**. La voie
adresse doit donc être mesurée sur les 139 prospects réels avant d'être
appliquée, et le rapport de `calibrate` doit distinguer les fusions gagnées
par la voie adresse de celles du score.

*Ce que la mesure doit établir avant tout `--apply` :* le nombre de fusions
gagnées, et **la relecture à l'œil de chacune**. C'est la procédure qu'a déjà
suivie le passage de 300 m à 1 000 m — « les quatre fusions gagnées ont été
vérifiées une par une » — et c'est elle qui a permis d'affirmer qu'aucune
n'était douteuse.

*Chiffres d'encadrement, connus :* 17 prospects ont un candidat à l'adresse
exacte sans aucun test de catégorie ; 5 en gardant le test strict du métier
cherché. Le résultat de A3 est entre les deux. **Ces deux bornes sont
elles-mêmes sous-estimées**, la mesure les ayant produites avec l'extraction
naïve du numéro que A2 corrige.

### A6 — La justification porte la voie adresse

`MatchLine.code` gagne la valeur `'adresse'`, et une fusion obtenue par cette
voie porte une ligne qui le dit — au même titre que `nom`, `distance` et
`categorie` aujourd'hui.

*Pourquoi :* `review` et `calibrate` affichent ces lignes, et un opérateur
qui relit une fusion six mois plus tard doit savoir **ce qui l'a décidée**.
Une fusion sans justification lisible est une fusion qu'on ne peut pas
contester.

## 4. Ce qui ne change pas

- `MATCHING_CONFIG` : les trois poids, `maxDistanceM`, `highThreshold`,
  `lowThreshold`. Aucun.
- `matchesCategory`, `nameVariants`, `bestNameMatch` : inchangés.
- Le statut `ambiguous` et la commande `review` : la voie adresse ne les
  alimente pas.
- Aucune table, aucune migration, aucun écran.

## 5. Risques résiduels, nommés

- **Deux artisans du bâtiment à la même adresse, dont un seul figure parmi
  les candidats.** A4 ne l'attrape pas : il n'y a qu'un candidat, il passe.
  Le résultat serait un site au bon nom portant le mauvais téléphone. Plus
  rare que le cas boulangerie, mais réel, et non couvert.
- **Une adresse SIRET qui est celle du comptable**, partagée par plusieurs
  entreprises clientes du même cabinet. Si l'une d'elles est du bâtiment,
  elle sera fusionnée à tort. Non couvert.
- **83 prospects sur 100 n'ont aucun candidat à leur adresse** : la voie
  adresse ne les débloque pas. Ce chantier améliore un taux, il ne le résout
  pas.

## 6. Tests

- La normalisation d'adresse se teste sur les cas réels relevés dans les
  données, cités nommément en A2 — préfixes, `71b`/`30 bis`, abréviations,
  mots-outils, nom de commune.
- **Le cas `9 avenue Général Marchand` contre `9 rue Kléber` doit échouer à
  s'apparier**, et un test doit le prouver : c'est le faux positif que la
  première mesure de ce chantier a réellement produit.
- **Le cas boulangerie doit être rejeté** (`211 route de Sainte-Luce`,
  catégorie « Boulangerie-Pâtisserie ») et **le cas `BELENOS` accepté**
  (catégorie « Serrurier ») : ce sont les deux cas qui justifient A3, et ils
  doivent se lire dans la suite de tests.
- A4 se teste sur deux candidats du bâtiment à la même adresse : aucune
  fusion.

## 7. Ce qui n'est pas dans ce chantier

- Toucher au rayon, aux poids ou aux seuils (§2).
- L'appariement des 83 prospects sans candidat à leur adresse.
- Les 10 `ambiguous` en attente : ils se tranchent avec `review`, tel quel,
  et ne demandent aucun code.
- Le rescraping : tout se mesure et s'applique hors ligne, sur les candidats
  déjà en base.
