# Enrichissement, appariement et réconciliation — conception

Spec n°2. Fait suite au socle de prospection
(`2026-09-01-socle-prospection-design.md`), dont il reprend le vocabulaire,
le pipeline et les principes sans les redéfinir.

---

## 1. Objectif

Donner au socle la matière qui lui manque : téléphone, site déclaré, réseaux
sociaux, avis. Puis garantir que cette matière reste vraie dans le temps.

### Pourquoi ce chantier passe avant le dashboard

Constat sur la base réelle, au 1er septembre 2026 :

```
web_presence.category : {"none": 25}     les 25, sans exception
prospect_enrichment   : 0 lignes
scores                : 30 30 20 20 20 … 10 10 0
```

Les 25 prospects sont classés « aucune présence web » non pas parce qu'ils
n'ont pas de site, mais parce que personne n'a regardé. Sirene ne connaît ni
site, ni téléphone, ni avis : `declaredUrl` est nul pour tout le monde, donc
`classifyWebPresence` retombe sur `none` par défaut.

Le barème s'effondre pour la même raison. Sur ses huit signaux, six viennent
de l'enrichissement ; il ne reste que `effectif_code` — valant `NN`, inconnu,
pour la majorité — et `date_creation`. D'où ces 25 scores écrasés sur trois
valeurs. Il n'y a rien à classer.

Et la base ne contient **aucun numéro de téléphone**, ce qui rend le scénario
d'usage de départ — contacter à la main depuis le dashboard — impossible à
satisfaire. Un dashboard construit sur cet état afficherait 25 lignes
interchangeables, toutes étiquetées avec aplomb, sans un seul numéro.

### Critères de succès

- Les prospects appariés portent un téléphone exploitable et une catégorie de
  présence web fondée sur une observation, non sur une absence de données.
- Aucune fusion automatique erronée : un prospect apparié porte le nom de
  l'entreprise qu'on appellera réellement.
- Les cas douteux sont inspectables et tranchables sans dashboard.
- Un établissement qui cesse ou perd son droit de diffusion cesse d'être
  traité comme un prospect valide.
- L'enrichissement de Nantes entière (~420 plombiers) est réalisable sans
  surveillance continue, reprenable après interruption.

### Hors périmètre

- Le dashboard React — chantier 2.
- Le générateur de message et les captures d'écran — chantier 3.
- La fabrique de sites vitrines, Vercel, WhatsApp — chantiers 4 et 5.

---

## 2. Périmètre d'exécution : calibrer avant d'élargir

La conception vise la ville entière dès maintenant — plafond journalier,
reprise, écriture prospect par prospect. **L'exécution, elle, est
progressive.**

On enrichit d'abord les 25 prospects déjà en base, on inspecte la qualité
réelle des appariements, on règle les deux seuils de confiance sur ces cas
concrets. Ensuite seulement on relance `discover` sur les quatre codes
postaux de Nantes et on enrichit les ~420.

La raison est asymétrique. Un seuil haut mal réglé produit des fusions
fausses, et une fusion fausse ne se voit pas dans les statistiques : elle se
voit au téléphone, quand l'interlocuteur est appelé par le nom d'une autre
entreprise, et l'appel est perdu. Calibrer coûte une demi-heure ; un run de
deux jours à recommencer coûte deux jours.

Volumes constatés auprès de l'API :

| Code postal | Plombiers (43.22A) |
|---|---|
| 44000 | 132 |
| 44100 | 93 |
| 44200 | 39 |
| 44300 | 156 |
| **Total Nantes** | **~420** |

Avec le délai anti-bot de 3 à 8 s et le chargement des fiches, l'ordre de
grandeur est d'une heure quinze de scraping, soit deux jours au plafond de
300 par jour.

---

## 3. Le pipeline complété

```
discover → enrich → probe → classify+score → domains

  review     (manuel, vide la file `ambiguous`)
  reconcile  (transverse, rejoue Sirene par SIRET)
```

**`domains` passe après `score`, et c'est délibéré.** La disponibilité d'un
nom de domaine ne dit rien de la qualification d'un prospect ; elle ne sert
qu'à ce qu'on lui dira. La placer avant le score créerait une dépendance
circulaire — elle a besoin de la catégorie, que `classify` produit — pour un
signal qui n'entre pas au barème.

---

## 4. L'étage `enrich`

### 4.1 Découplage

La source Google Maps est cachée derrière cette interface :

```ts
interface MapsSource {
  search(query: string): Promise<MapsCandidate[]>;
  readonly navigations: number;
  close(): Promise<void>;
}
```

**Corrigé après la revue finale.** Ce spec annonçait une interface
`EnrichmentSource { enrich(p: Prospect) }` « déjà posée au socle » : elle
n'a jamais existé, ni au socle ni ici. Et le code a eu raison de ne pas la
créer — enfermer un prospect derrière `enrich(p)` aurait absorbé dans la
source la stratégie des trois requêtes du §4.2, qui appartient à l'étage, et
l'aurait rendue à la fois inobservable et intestable.

La source ne sait donc rien des prospects : elle exécute une requête et rend
des fiches. C'est l'étage qui décide quelles requêtes tenter, dans quel
ordre, et quand s'arrêter. `navigations` compte les pages réellement
chargées, pour que le volume envoyé à Google reste visible plutôt que deviné.

`GoogleMapsSource` est une implémentation parmi d'autres ; le reste du
pipeline ne la connaît pas.

### 4.2 Stratégie de requête

Trois requêtes tentées dans l'ordre, arrêt à la première qui produit un
candidat retenu :

1. `"<denomination_usuelle>" <ville>` lorsqu'elle existe ;
2. `"<denomination>" <ville>` ;
3. `<requête métier> <adresse>` — repli géographique.

L'ordre place l'appellation commerciale en premier : c'est celle que Google
Maps connaît (voir §5.1).

### 4.3 Ce qui est extrait

Nom, adresse, coordonnées, libellé de catégorie Google, téléphone, site
déclaré, note, `place_id`, URL de la fiche. Le nombre d'avis figurait dans
cette liste ; il n'est plus publié par Google (voir §4.5).

Le champ « site web » est le mécanisme central de la classification : chez
les artisans il contient très souvent une URL Facebook, ce qui rend la
détection `social_only` gratuite.

### 4.4 Anti-bot et résilience

Reprise du §4.2 du socle, sans modification : navigateur unique, contexte
persistant réutilisé entre exécutions, délai aléatoire de 3 à 8 secondes,
plafond quotidien configurable à 300, pas de proxy.

Précisions apportées ici :

- **Écriture prospect par prospect.** La ligne `prospect_enrichment` est le
  point de reprise ; aucun état intermédiaire n'existe ailleurs.
- **Sélection des prospects à traiter :** ceux sans ligne d'enrichissement,
  plus ceux en statut `blocked`. Les `not_found` ne sont **pas** rejoués
  automatiquement — un drapeau `--retry-not-found` le permet explicitement.
- **Mur de consentement Google.** C'est le premier obstacle en Europe. Le
  contexte persistant le franchit une fois et conserve le cookie. Son
  apparition répétée signale que le contexte n'est pas réutilisé, et doit
  être traitée comme une erreur de configuration, pas contournée en boucle.
- **Captcha ou interstitiel :** arrêt immédiat du run, prospect marqué
  `blocked`, sortie en code non nul.

### 4.5 Ce que la source rend réellement — vérifié le 1er septembre 2026

Les sélecteurs ont été confrontés à une vraie recherche sur `google.com/maps`.
Cinq écarts sont apparus ; deux d'entre eux corrigent des hypothèses de ce
spec et méritent d'y figurer.

**Le nombre d'avis n'est plus publié par Google Maps.** Ni sur les cartes de
résultat, ni sur le panneau d'une fiche : l'entête ne porte que la note et
l'image des étoiles, et le seul `aria-label` chiffré du flux est
« 4,8 étoiles ». Aucun sélecteur ne peut donc le fournir, et le §4.3 le
listait à tort parmi les champs extraits.

Conséquence sur le barème, corrigée après la revue finale de branche : ce
n'est pas **une** ligne qui meurt, mais **trois**, et la note s'en trouvait
entraînée avec elles.

| Règle | Points | État |
|---|---|---|
| `reputation` | 25 | **ranimée en v2** — elle exigeait la note *et* le nombre d'avis ; elle ne dépend plus que de la note |
| `reviews_volume` | 10 | inerte — le nombre d'avis n'est plus publié |
| `social_fresh` | 15 | inerte — `last_social_post_at` n'a aucun écrivain |

Le cas de `reputation` méritait d'être vu : la note est extraite par le
scraper, préservée à travers la revue manuelle, et deux correctifs du
chantier l'ont spécifiquement sauvée — mais elle ne pouvait rapporter aucun
point, parce que la règle exigeait aussi un nombre d'avis que Google ne
publie plus. Mesuré avant correction : une note de 4,9 donnait exactement le
même total qu'une note absente.

Les deux règles réellement inertes sont **laissées en place et le disent à
l'endroit exact où elles s'écrivent**, plutôt que retirées — le barème est
versionné, la donnée peut revenir, et une règle inerte qui explique pourquoi
vaut mieux qu'une règle disparue dont personne ne saura qu'elle a existé.
Vingt-cinq points restent hors d'atteinte, ce qui resserre l'échelle réelle
sans fausser l'ordre.

**Google tranche après le chargement entre une liste et une fiche unique**, et
ne réécrit l'URL en `/maps/place/` qu'au bout d'environ cinq secondes. Le
détail est technique mais la conséquence ne l'est pas : décider trop tôt fait
prendre une fiche unique pour une liste vide, et l'étage conclut
« introuvable » sur précisément les appariements les plus sûrs — ceux dont le
nom ne désigne qu'une entreprise. Sans aucune erreur levée, et avec un
compte-rendu d'exécution qui paraît normal.

Ce qui reste disponible et vérifié : nom, adresse, coordonnées, catégorie,
téléphone, site déclaré, note. C'est-à-dire tout ce dont l'appariement et la
classification de présence web ont besoin.

`place_id` n'est renseigné que dans le cas d'une liste de résultats — l'URL
d'une fiche unique ne porte pas le segment dont il est extrait. Sans
conséquence : le SIRET reste la clé de déduplication.

**Cette vérification est à refaire après toute interruption longue du
chantier.** Google renomme ses classes sans préavis, et un sélecteur muet ne
casse rien : il produit des `not_found` en masse qui ressemblent à des
artisans réellement absents d'internet.

---

## 5. L'appariement Sirene ↔ Google Maps

Logique pure dans `packages/core/src/matching.ts` : aucun I/O, entièrement
testable sur cas figés.

### 5.1 Le problème des entrepreneurs individuels

La stratégie du socle — « similarité de nom normalisée, Jaro-Winkler » — est
insuffisante telle quelle. Sur les 25 prospects, **5 sont des entrepreneurs
individuels (20 %)**, et leur dénomination légale n'a aucun rapport avec leur
nom commercial :

```
"GHAITH RAHALI (RGSERVICES)"       usuelle : "RGSERVICES"
"ERIC ESCAPIN"                     usuelle : "H20"
"CHRISTOPHE JINJOLET (…)"          usuelle : "OUEST DEPANNAGE PLOMBERIE"
"PHILIPPE DELAITRE (…)"            usuelle : "POPO LES BONS TUYAUX / PHILIPPE DELAITRE"
```

Google Maps connaît « H2O », pas « Eric Escapin ». La similarité entre ces
deux chaînes avoisine 0,3. Sans traitement, l'appariement échouerait sur un
cinquième de la population — silencieusement, en la classant `not_found`,
c'est-à-dire en la présentant comme absente d'internet alors qu'elle y est.

### 5.2 Variantes de nom

Chaque prospect produit plusieurs noms candidats, tous confrontés au nom Maps,
la meilleure correspondance étant retenue :

- la dénomination débarrassée de ses parenthèses ;
- le contenu de chaque parenthèse ;
- `denomination_usuelle` ;
- chaque segment séparé par `/`.

Toutes passent par `normalizeCompanyName`, complété du retrait des formes
juridiques (SARL, SAS, SASU, EURL, SCI, EI, ETS).

### 5.3 Signal de nom

```
nom = max(jaroWinkler(variante, nomMaps), inclusionJetons(variante, nomMaps))
```

L'inclusion — proportion des jetons significatifs du prospect présents dans
le nom Maps — couvre le cas « PLOMBERIE RABIER » face à « RABIER JEAN-MARIE » :
le patronyme est là, l'ordre et la longueur diffèrent. Jaro-Winkler seul y
échoue.

### 5.4 Distance

Vérifié : les 25 prospects portent tous des coordonnées Sirene, le signal est
donc exploitable. Côté Maps elles se lisent dans l'URL de la fiche.

**La distance est d'abord un filtre.** Au-delà de 300 m, le candidat est
éliminé quel que soit son nom : deux plombiers homonymes à l'autre bout de la
ville sont deux entreprises différentes. En deçà, elle contribue en dégradé,
pleine à 0 m et nulle à 300 m.

**Ceci révise le seuil de 150 m annoncé au §6 du socle.** Une épingle Google
et une adresse Sirene désignant le même établissement divergent couramment de
100 à 200 m — géocodage différent, entrée de l'immeuble contre centroïde de
la parcelle. Un couperet à 150 m écarterait des appariements corrects sans
laisser au nom la moindre chance de trancher. Passer à 300 m avec une
contribution dégradée conserve le rôle de filtre en déplaçant la décision
vers le signal qui la mérite.

**Un prospect sans coordonnées ne peut jamais être fusionné automatiquement,
et c'est voulu.** Sirene ne géocode pas tous les établissements. Quand la
position manque, la proximité ne vaut ni bonus ni malus — elle vaut zéro,
faute de preuve — si bien que la confiance plafonne à 0,75 : nom parfait et
catégorie parfaite réunis restent sous le seuil haut de 0,85. Le prospect part
donc en file de validation manuelle.

Ce n'est pas une limite subie mais la conséquence assumée du barème. Sans
position, rien ne distingue deux homonymes exerçant le même métier dans deux
villes différentes, et c'est précisément le cas où une fusion automatique
erronée coûte le plus cher. La file manuelle est la bonne réponse à une
absence de preuve ; en faire une fusion reviendrait à traiter l'absence de
preuve comme une preuve.

Conséquence pratique à surveiller au jalon : la proportion d'établissements
non géocodés fixe un plancher de travail manuel. Sur le premier lot de 25,
elle est nulle — les 25 portent des coordonnées.

### 5.5 Cohérence de catégorie

Le libellé de catégorie Google est comparé aux `keywords` du métier. Signal
d'appoint : il conforte sans jamais décider seul.

### 5.6 Formule et seuils

```
confiance = 0,60 × nom  +  0,25 × proximité  +  0,15 × catégorie

≥ 0,85            → fusion automatique          (statut `ok`)
0,55 à 0,85       → file de validation manuelle (statut `ambiguous`)
< 0,55            → candidat ignoré
aucun candidat    → statut `not_found`
```

**Ces cinq nombres sont des points de départ explicitement destinés à
bouger** après la revue des 25 premiers cas. Ils vivent dans un objet de
configuration versionné, à la manière du barème.

**Deux candidats au-dessus du seuil haut ne fusionnent jamais** — ils partent
en `ambiguous`. Quand deux fiches se disputent un prospect, la confiance
élevée est le symptôme du problème, pas sa résolution.

### 5.7 Explicabilité

`MatchScore` porte sa décision **et sa justification**, à la manière du
`ScoreBreakdown` du barème :

```ts
type MatchOutcome =
  | { kind: 'ok';        candidate: MapsCandidate; score: MatchScore }
  | { kind: 'ambiguous'; scored: { candidate: MapsCandidate; score: MatchScore }[] }
  | { kind: 'not_found' };

interface MatchScore {
  confidence: number;       // 0 à 1
  nameSimilarity: number;   // le max du §5.3
  matchedVariant: string | null;  // la variante qui a gagné, ou aucune
  distanceM: number | null;       // `null` : position inconnue, pas 0 m
  categoryMatch: boolean;
  lines: MatchLine[];       // libellés français, affichables tels quels
}
```

Les lignes se lisent dans la même langue que le `breakdown` du barème :

```
nom 0,91 via « H20 »
40 m
catégorie « Plombier » ✓
```

La revue CLI les affiche ; le dashboard les réutilisera sans les recalculer.

---

## 6. La revue manuelle — `collector review`

Parcourt les prospects en statut `ambiguous`, affiche la fiche Sirene et
chaque candidat Maps avec le détail de son score, enregistre la décision.

Elle sert deux fois : à calibrer les seuils sur des cas réels maintenant, et
à vider la file ensuite. La fonction de décision est pure et testée ; la
coquille interactive reste mince. Le dashboard reprendra la première telle
quelle.

Sans elle, la calibration se ferait sur des statistiques agrégées plutôt que
sur des cas — c'est-à-dire à l'aveugle.

---

## 7. La réconciliation — `collector reconcile`

Les filtres `statut_diffusion` et `etat_administratif` ne s'appliquent qu'à
l'ingestion. Un établissement qui cesse ou devient non diffusible **après**
coup n'est plus renvoyé par l'API : l'upsert ne se déclenche donc jamais et
la ligne obsolète demeure indéfiniment. « Jamais ingéré » n'équivaut pas à
« non conservé », et l'obligation porte sur la conservation.

L'étage rerequête l'API par SIRET pour tous les prospects connus. Deux issues
distinctes :

| Événement | Traitement | Motif |
|---|---|---|
| Droit de diffusion perdu | suppression de la ligne et de ses dépendances | obligation de conservation ; `discover` filtrant déjà `statut_diffusion`, rien ne la réintroduira |
| Cessation d'activité | conservation, `is_closed` positionné | le disqualifiant du barème doit s'appliquer |

Le second point est commercial autant que juridique. `is_closed` est
aujourd'hui **du code mort** : le disqualifiant existe dans `scoring.ts`,
mais `cli.ts` écrit `isClosed: false` en dur. Sans réconciliation, on
continuerait d'appeler des entreprises fermées en les classant bien.

Coût : ~420 requêtes sur une API gratuite.

---

## 8. Disponibilité du nom de domaine — `collector domains`

Concerne les prospects sans domaine propre, c'est-à-dire de catégorie `none`,
`social_only` ou `directory_only`.

Deux ou trois variantes sont dérivées du nom normalisé
(`plomberie-martin.fr`, `martin-plomberie.fr`), interrogées en DNS puis en
RDAP auprès du registre.

**C'est une heuristique, et elle est nommée comme telle dans les données
comme dans l'interface :** l'absence d'enregistrement suggère fortement la
disponibilité sans la garantir.

Ce que cela change : « j'ai vérifié, `plomberie-martin.fr` est libre » est un
argument, « vous devriez prendre un domaine » n'en est pas un.

---

## 9. Corrections portées du socle

### 9.1 Les scores périmés

`score` relit et renote déjà toute la base à chaque exécution : il ne porte
aucun prédicat de fraîcheur, et c'est bien ainsi — le principe « ne traiter
que ce qui ne l'est pas encore » vaut pour les étages lents et réseau, pas
pour un calcul pur et instantané.

Le trou est ailleurs, et il est plus étroit. Quand `buildScoreRow` renvoie
`null` — un domaine propre est déclaré mais pas encore sondé — l'étage compte
le prospect en attente et **passe sans rien écrire**. La ligne
`prospect_score` du passage précédent reste donc en place, ainsi que la
catégorie, sans marqueur d'obsolescence.

Inerte jusqu'ici, parce que `pending` vaut toujours 0 faute d'enrichissement.
Le premier run de `enrich` renseignera `declared_url` sur des prospects déjà
notés `none` à 20 points, et ces 20 points survivront à la découverte qu'ils
ont un site.

**Correction : quand un prospect devient « en attente de sonde », son score
et sa catégorie sont effacés.** C'est la même règle que celle appliquée deux
fois au socle — ne jamais laisser en base une valeur qui affirme ce qu'on ne
sait plus. « En attente » doit se lire comme une absence, pas comme un
ancien score qu'aucun signe ne distingue d'un score frais.

### 9.1 bis Fenêtre de fraîcheur de `probe`

`probe` resonde toutes les URL déclarées à chaque exécution, sans condition.
Aujourd'hui la liste est vide ; après `enrich` elle comptera une centaine
d'entrées, resondées intégralement à chaque passage.

Resonder est voulu — un site meurt entre deux runs, et c'est précisément ce
qu'on cherche. Mais une **fenêtre de fraîcheur de 7 jours** évite de
retélécharger cent sites pour reconstater l'évidence. Un drapeau
`--force` la contourne.

### 9.2 Le NAF interrogé mais jamais validé

L'API filtre l'activité au niveau de l'**entreprise** et le code postal au
niveau de l'**établissement** : un établissement retenu ne porte donc pas
nécessairement le NAF du métier visé. Mesuré sur la base :

```
43.22A : 24
43.21A :  1    GROUPE AMH (RABIER JEAN-MARIE)   ← installation électrique
```

4 %, soit une quinzaine sur les 420 de Nantes.

**Décision : conserver et signaler, ne pas écarter.** L'entreprise est bien
une entreprise de plomberie ; l'établissement peut exercer les deux activités
ou porter un code périmé. Supprimer perdrait de vrais prospects pour éviter
une étiquette.

Le drapeau se calcule à la lecture, depuis `naf_code` et la configuration du
métier — **pas de colonne stockée**, qui se périmerait au prochain changement
de configuration. Le barème n'y touche pas tant qu'on manque de recul.

### 9.3 Code de sortie

Le CLI sort aujourd'hui toujours en 0, y compris après un blocage. Un run
`blocked` doit sortir en code non nul, faute de quoi aucune automatisation ne
peut distinguer un succès d'un arrêt anti-bot.

---

## 10. Modèle de données

| Migration | Motif |
|---|---|
| `prospect.is_closed boolean not null default false` | branche le disqualifiant du barème |
| `prospect.reconciled_at timestamptz` | trace de la dernière vérification. **Pas** un prédicat de fraîcheur : `reconcile` revérifie toute la base à chaque passage, sans quoi ce qu'il n'a pas relu resterait indéfiniment hors contrôle |
| `web_presence.domain_checked_at timestamptz` | idempotence de `domains` ; `probed_at` ne peut pas servir, les deux étages sont distincts |
| index sur `prospect_enrichment.status` | la file de revue interroge ce champ |

Les tables et énumérations existantes suffisent par ailleurs :
`enrichment_status` porte déjà `ok / not_found / ambiguous / blocked`.

Rappel du socle : régénérer les types après chaque `db:push`.

---

## 11. Conformité

- Seules des pages publiques sont consultées, à un rythme volontairement
  lent, sans contournement de protection. Un captcha arrête le run ; il n'est
  jamais résolu.
- Sirene reste la source de vérité légale et la clé de déduplication.
- La réconciliation du §7 est le mécanisme qui rend la conservation conforme
  dans la durée, et non seulement à l'ingestion.

---

## 12. Gestion des erreurs

| Situation | Comportement |
|---|---|
| Fiche Maps introuvable | `not_found`, prospect conservé et exploitable via Sirene seul |
| Candidats multiples ou confiance intermédiaire | `ambiguous`, aucune écriture de fusion |
| Captcha ou interstitiel | arrêt du run, `blocked`, code de sortie non nul |
| Page Maps au format inattendu | prospect ignoré et journalisé, le run continue |
| RDAP indisponible | disponibilité laissée à `null`, jamais supposée |
| SIRET absent à la réconciliation | traité comme perte de diffusion |

---

## 13. Tests

- **Appariement :** tests tabulaires sur les cas réels de la base — « ERIC
  ESCAPIN / H20 », « SARL ALLARD », « GHAITH RAHALI / RGSERVICES ». Ce sont
  eux qui gardent la régression honnête.
- **Analyse des pages Maps :** fixtures HTML versionnées, aucun accès réseau
  en test. Les sélecteurs DOM sont la partie fragile ; les figer rend leur
  rupture visible.
- **`reconcile` et `domains` :** clients d'API et résolveurs simulés.
- **`review` :** la fonction de décision est testée ; la coquille interactive
  ne l'est pas et reste mince pour cette raison.

---

## 14. Ordre de livraison

1. Corrections du socle — effacement du score en attente, fenêtre de
   fraîcheur de `probe`.
2. Appariement pur dans `packages/core`, avec ses cas réels.
3. Source Google Maps et ses fixtures.
4. Étage `enrich`.
5. Commande `review`.
6. **Calibration des seuils sur les 25** — jalon humain, pas une tâche de code.
7. Étage `reconcile`.
8. Étage `domains`.
9. Élargissement à Nantes entière (~420) et enrichissement complet.

Les étapes 1 à 5 sont livrables et testables indépendamment. L'étape 6
conditionne les suivantes.

---

## 15. Points à trancher à l'implémentation

- Les cinq nombres de la formule d'appariement, calibrés à l'étape 6.
- Le nombre de candidats Maps retenus par requête — 5 proposé.
- Les sélecteurs DOM des fiches Maps, à figer sur fixtures.
- L'endpoint RDAP du registre `.fr` et son comportement en limitation de débit.

---

## 16. Reports au spec n°3 (dashboard)

- **La pagination est une contrainte de projet.** PostgREST plafonne les
  réponses à `max_rows` (1000). Toute lecture du dashboard doit paginer
  explicitement, faute de quoi elle affichera une tranche arbitraire en la
  présentant comme complète.
- Les captures d'écran, avec le générateur de message qui en est le seul
  consommateur. Seules celles des sites défaillants ont une valeur réelle, et
  elles se reprennent en quelques minutes sur une trentaine de prospects —
  contrairement à celles des fiches Google, chères à refaire et sans usage.
- L'affichage de la file `ambiguous`, réutilisant la fonction de décision de
  `review`.
- L'affichage du drapeau NAF divergent.
- L'index sur `generated_message.prospect_id`, différé du socle par décision
  explicite : il part avec le chantier 3, quand cette table recevra enfin un
  écrivain. Une table sans écrivain n'a pas besoin d'index.
