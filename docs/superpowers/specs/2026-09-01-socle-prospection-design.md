# Prospeo — Socle de prospection : collecte, scoring, suivi

**Date :** 2026-09-01
**Statut :** design validé, prêt pour plan d'implémentation
**Périmètre :** spec n°1 sur 2 (le spec n°2 couvrira la fabrique de sites vitrines et l'automatisation WhatsApp)

---

## 1. Objectif

Constituer une base qualifiée d'entreprises artisanales dépourvues de site web exploitable, la classer par potentiel commercial, et permettre d'en suivre la prospection manuelle depuis un dashboard.

Le premier lot cible **une ville et un métier** (plombiers), l'architecture devant permettre d'ajouter un métier par simple configuration.

### Critères de succès

1. Une commande produit en base les établissements d'un métier sur une ville, dédupliqués par SIRET.
2. Chaque prospect porte une catégorie de présence web déterminée automatiquement.
3. Chaque prospect porte un score 0–100 **dont chaque point est justifié par une ligne lisible**.
4. Le dashboard permet de filtrer, trier, consulter une fiche, et suivre un pipeline avec relances datées.
5. Un message de prospection personnalisé est générable et copiable depuis chaque fiche.
6. Une interruption du scraping ne perd aucun travail : la reprise repart où elle s'est arrêtée.

### Hors périmètre (spec n°2)

Génération de sites vitrines, import de template GitHub, adaptation des fichiers i18n par LLM, déploiement Vercel, envoi automatisé WhatsApp, multi-utilisateur.

**Justification de cette frontière :** tant qu'on ne sait pas quels champs sortent réellement du terrain, concevoir la fabrique de sites revient à deviner les entrées de la génération. Le socle produit cette information.

---

## 2. Décisions structurantes et leurs raisons

### 2.1 Sources de données

| Source | Rôle | Statut |
|---|---|---|
| `recherche-entreprises.api.gouv.fr` (Etalab, open data) | univers exhaustif, clé de déduplication (SIRET) | retenue |
| Google Maps, **pages publiques en navigateur headless** | téléphone, site déclaré, réseaux sociaux, note, avis | retenue |
| Google Places **API** | — | **écartée** |
| ScrapeGraphAI | — | **écarté** |

**Pourquoi l'API Google Places est écartée.** Le champ `website` et le téléphone relèvent du palier Enterprise, à 35 $/1000 requêtes (1000 gratuites par mois). Le blocage n'est pas le prix mais les conditions d'utilisation : le stockage du contenu Places est interdit, seul le `place_id` étant exempté et les coordonnées tolérées 30 jours. Or un CRM de prospection est par définition une base persistante de noms, adresses et téléphones. L'usage envisagé est donc incompatible avec le contrat.

**Pourquoi ScrapeGraphAI est écarté.** C'est un scraper qui invoque un LLM par page (0,001–0,01 $ par requête, 2 à 5 s de latence contre des millisecondes pour un sélecteur CSS). Son intérêt est la lecture de pages hétérogènes. Nos cibles sont des gabarits réguliers : payer un modèle pour relire la même mise en page des centaines de fois est une dépense sans contrepartie.

**Risque assumé sur le scraping Google Maps.** Les conditions d'utilisation de Google interdisent l'extraction en masse. Les jurisprudences hiQ v. LinkedIn et Van Buren v. United States établissent que l'accès à des pages publiques ne constitue pas une infraction pénale, et l'application par Google est technique (blocage d'IP, suspension de compte) plutôt que judiciaire — aucune action connue contre de la génération de prospects. Le risque est un blocage technique, pas un contentieux. **Décision prise en connaissance de cause.** La conception l'isole derrière une interface pour permettre un remplacement.

### 2.2 Architecture applicative

**Supabase + collector en ligne de commande, sans backend applicatif.**

Postgres hébergé sur Supabase, le dashboard React interroge la base via le SDK, le collector est un script Node autonome. Cela supprime une couche API entière — moins de code, moins de surface de bug, déploiement trivial.

**Contrepartie assumée et sa mitigation :** la clé anonyme part dans le bundle JavaScript, donc publique par construction. Sans politiques RLS, la base serait lisible par quiconque trouve l'URL. **RLS activée dès la première migration**, compte unique via Supabase Auth, clé `service_role` réservée au collector local. Ce n'est pas un durcissement ultérieur, c'est la condition de validité de l'architecture.

### 2.3 Aucun LLM dans la collecte

« Cette entreprise a-t-elle un site ? » se répond par une requête DNS et un appel HTTP. Le scoring est arithmétique. Le LLM n'intervient qu'à la rédaction du message de prospection, soit quelques centaines de tokens par prospect.

**Outillage IA :** SDK OpenAI standard pointé sur OpenRouter. OpenRouter constitue déjà la couche de commutation — changer de modèle gratuit revient à modifier une chaîne en configuration parmi environ 25 modèles `:free`. Limite de 20 requêtes/minute et 50/jour, portée à 1000/jour après un rechargement unique de 10 $ définitivement acquis.

LiteLLM est écarté **à ce stade** : introduire un proxy en conteneur pour un appel par prospect ajoute de l'infrastructure sans contrepartie. Il sera introduit si des chaînes de repli multi-fournisseurs deviennent nécessaires.

---

## 3. Structure du dépôt

```
prospeo/
├── apps/
│   ├── web/          React + Vite + TypeScript, TanStack Query & Table, Tailwind
│   │                 locales/fr.json (défaut) et locales/en.json
│   └── collector/    CLI Node/TypeScript, Playwright
├── packages/
│   ├── core/         types, classification, scoring, appariement — logique pure, sans I/O
│   └── db/           schéma Supabase, migrations, types générés
└── docs/superpowers/specs/
```

Monorepo pnpm workspaces.

**Rôle de `packages/core` :** les règles de classification et de scoring sont des fonctions pures. Elles sont donc testables en isolation, et réutilisables par le collector comme par le dashboard. Cette dernière propriété permet au front de recalculer les scores affichés en direct lors du réglage de la pondération, sans aller-retour serveur.

---

## 4. Le collector : pipeline en étages idempotents

| Étage | Entrée | Sortie | Idempotence |
|---|---|---|---|
| `discover` | métier + territoire | `prospect` (upsert SIRET) | rejouable sans doublon |
| `enrich` | prospects non enrichis | `prospect_enrichment` | reprend où il s'est arrêté |
| `probe` | URL déclarées | `web_presence` (partie technique), fraîcheur sociale, disponibilité du domaine | rejouable |
| `classify` | enrichissement + sonde | `web_presence.category` | pur |
| `score` | tout ce qui précède | `prospect_score` | pur |

Chaque étage ne traite que ce qui ne l'est pas encore (`WHERE <horodatage> IS NULL`) et écrit **prospect par prospect, jamais par lot**. Aucun échec partiel ne peut donc corrompre la base.

Conséquence pratique : un blocage au 200ᵉ prospect n'annule rien. La relance repart au 201ᵉ. Les étages `classify` et `score` étant purs et gratuits, ils sont rejouables intégralement après toute modification des règles.

### 4.1 Interfaces de découplage

```ts
interface DiscoverySource  { discover(q: TerritoryQuery): AsyncIterable<RawEstablishment> }
interface EnrichmentSource { enrich(p: Prospect): Promise<Enrichment | null> }
```

Google Maps est une implémentation parmi d'autres. Un `OsmEnrichmentSource` peut lui succéder sans toucher au reste du pipeline.

### 4.2 Comportement face aux protections anti-bot

- Un seul navigateur Playwright, contexte persistant réutilisé entre les exécutions.
- Délai aléatoire de 3 à 8 secondes entre deux fiches.
- Plafond quotidien configurable, 300 par défaut.
- **Détection de captcha ou de page d'interstitiel : arrêt immédiat du run**, prospect marqué `blocked`, sortie en code d'erreur explicite.
- Pas de proxy au départ. Sur une ville le volume ne le justifie pas, et un proxy résidentiel mal choisi attire davantage l'attention qu'une adresse domestique lente.

### 4.3 Configuration des métiers

```ts
// packages/core/trades.ts
{
  slug: 'plombier',
  label: 'Plombier',
  nafCodes: ['4322A'],
  mapsQueries: ['plombier', 'plomberie'],
  keywords: ['plomberie', 'chauffagiste', 'sanitaire'],
}
{
  slug: 'serrurier',
  label: 'Serrurier',
  nafCodes: ['4332B', '4324Y', '4332H'],
  mapsQueries: ['serrurier', 'serrurerie'],
  keywords: ['serrurerie', 'blindage', 'dépannage serrure'],
}
```

Ajouter un métier = ajouter un objet.

**`nafCodes` est un tableau et doit le rester.** La nomenclature NAF est en cours de révision : 4332B est scindé vers 4324Y et 4332H. Les établissements portent l'ancien ou le nouveau code selon leur date de mise à jour. Un code unique ferait disparaître silencieusement une part de la population. Les codes seront revérifiés contre les valeurs réellement retournées par l'API à l'implémentation.

---

## 5. Modèle de données

| Table | Contenu |
|---|---|
| `prospect` | SIRET (unique), SIREN, `trade_slug`, dénomination, dénomination usuelle, code NAF, adresse, code postal, ville, latitude, longitude, date de création, tranche d'effectif, entrepreneur individuel (booléen), statut de diffusion, horodatages |
| `prospect_enrichment` | `prospect_id`, source, nom apparié, confiance d'appariement, téléphone, type de téléphone, site déclaré, réseaux sociaux (JSON), note, nombre d'avis, `place_id`, URL Maps, chemins des captures, `status` (`ok`/`not_found`/`ambiguous`/`blocked`), horodatage |
| `web_presence` | `prospect_id`, `category`, URL testée, code HTTP, HTTPS, redirection finale, page parquée, balise viewport présente, domaine jugé disponible, horodatage |
| `prospect_score` | `prospect_id`, total, `breakdown` (JSON : code, libellé, points, détail), version du barème, horodatage |
| `prospect_pipeline` | `prospect_id` (unique), statut, `next_action_at`, horodatage |
| `interaction` | `prospect_id`, type (appel / whatsapp / email / note), contenu, date de l'échange |
| `generated_message` | `prospect_id`, canal, modèle, version du prompt, contenu, horodatage |

**Simplification assumée :** pas de table d'audit champ par champ. La provenance est portée par `prospect_enrichment` (source + horodatage), suffisant pour la traçabilité sans doubler le volume d'écriture.

### 5.1 Catégories de présence web

| Catégorie | Définition |
|---|---|
| `social_only` | aucun site, mais page Facebook ou Instagram |
| `dead_site` | domaine répondant mal : parqué, 404, certificat expiré, HTTP sans HTTPS, absence de balise viewport |
| `none` | aucune présence détectée |
| `directory_only` | présent uniquement sur un annuaire ou une fiche Google Business |
| `has_site` | site propre, vivant et responsive — disqualifié |

### 5.2 Comment ces catégories sont réellement déterminées

Point volontairement explicite, parce que la mécanique n'est pas évidente.

**Le mécanisme central est que le champ « site web » d'une fiche Google Maps contient très souvent une URL Facebook.** C'est le cas courant chez les artisans : ils renseignent leur page sociale faute de site. La classification exploite directement cela.

Règles appliquées par `classify`, dans l'ordre :

1. Aucune URL déclarée et aucun réseau social trouvé → `none`.
2. URL déclarée sur un domaine social (`facebook.com`, `instagram.com`, et leurs variantes) → `social_only`.
3. URL déclarée sur un domaine d'annuaire (`pagesjaunes.fr`, `yelp.*`, `business.site`, `*.wixsite.com` sans domaine propre) → `directory_only`.
4. URL sur un domaine propre, mais le verdict de `probe` est défaillant → `dead_site`.
5. Sinon → `has_site`.

**Type de téléphone :** déterminé par le préfixe après normalisation au format E.164. Les numéros français en `06` et `07` sont mobiles, les autres fixes. Un mobile vaut davantage parce qu'il aboutit directement à l'artisan sur son chantier, et qu'il ouvre la voie WhatsApp du spec n°2.

**Fraîcheur de l'activité sociale :** lorsque `social_only` est retenu, `probe` charge la page publique et tente d'y lire la date du dernier contenu. **Ce signal est explicitement optionnel :** Facebook impose fréquemment une authentification ou un mur de consentement, auquel cas la date est absente. Son absence retire simplement les +15 du barème, elle ne dégrade rien d'autre et n'interrompt pas l'étage.

---

## 6. Appariement Sirene ↔ Google Maps

C'est le point techniquement difficile. Sirene connaît « MARTIN », entrepreneur individuel, à une adresse. Google Maps connaît « Plomberie Martin & Fils ». Aucun identifiant commun ne les relie.

**Stratégie de requête :** `"<dénomination>" <ville>`, puis repli sur `<requête métier> <adresse>`.

**Score d'appariement**, combinant trois signaux :
- distance géographique (seuil : 150 m) ;
- similarité de nom normalisée (Jaro-Winkler, après retrait des formes juridiques, des accents et de la casse) ;
- cohérence de la catégorie Google avec le métier attendu.

**Trois issues :**

| Confiance | Issue |
|---|---|
| ≥ seuil haut | fusion automatique |
| entre les deux seuils, ou candidats multiples | `ambiguous` → file de validation manuelle |
| aucun candidat | `not_found`, prospect conservé et exploitable via Sirene seul |

**Règle : aucune fusion automatique sous le seuil haut.** Un faux appariement n'apparaît pas dans les statistiques ; il apparaît au téléphone, quand l'interlocuteur est appelé par le nom d'une autre entreprise, et l'appel est perdu. Le coût d'un doute à trancher manuellement est très inférieur à celui d'une fausse certitude.

---

## 7. Barème

Additif, borné à 0–100, chaque point justifié par une ligne visible dans la fiche. Le barème vit dans un fichier de configuration versionné ; l'étage `score` est rejouable gratuitement sur toute la base après réglage.

### Présence web

| Situation | Points |
|---|---|
| `social_only` | +45 |
| `dead_site` | +40 |
| `none` | +35 |
| `directory_only` | +30 |
| `has_site` | −100 |

### Vitalité

| Signal | Points |
|---|---|
| Note ≥ 4,0 avec au moins 10 avis | +25 |
| Activité sociale de moins de 90 jours | +15 |
| Au moins 30 avis | +10 |
| Effectif ≥ 3 | +10 |
| Ancienneté entre 3 et 20 ans | +10 |

### Joignabilité

| Signal | Points |
|---|---|
| Téléphone mobile | +20 |
| Téléphone fixe seul | +10 |
| Aucun téléphone | −25 |

### Disqualifiants

Établissement cessé ; établissement non diffusible ; enseigne de franchise détectée par mots-clés (−30).

### Justification des deux choix non évidents

**`social_only` passe devant `none`.** Un artisan qui publie ses chantiers sur Facebook a déjà admis qu'il lui faut une vitrine et n'a jamais franchi le pas : l'argumentaire est immédiat, et ses photos constituent une matière première gratuite pour le site à produire.

**L'ancienneté est une fenêtre, non une droite croissante.** En dessous de 3 ans l'entreprise est fragile ; au-delà de 20 ans sans aucune présence web, l'absence relève plus souvent d'un refus assumé que d'un oubli.

---

## 8. Fonctions à valeur commerciale

### 8.1 Captures d'écran automatiques

Playwright étant déjà lancé pour l'enrichissement, capturer la fiche Google et, le cas échéant, le site défaillant **en viewport mobile** ne coûte rien de plus. Fournit une preuve visuelle à joindre au message : « voici votre site sur un téléphone aujourd'hui ».

### 8.2 Disponibilité du nom de domaine

Requête DNS et interrogation RDAP sur le nom normalisé et deux ou trois variantes (`plomberie-martin.fr`, `martin-plomberie.fr`). Transforme l'argumentaire : « j'ai vérifié, `plomberie-martin.fr` est libre » est nettement plus concret qu'une recommandation générale.

**C'est une heuristique :** l'absence d'enregistrement DNS suggère fortement la disponibilité sans la garantir. Le champ est nommé et présenté comme tel dans l'interface.

### 8.3 Export CSV

Permet de travailler hors ligne et de reprendre la main indépendamment du dashboard.

### Écartés délibérément

Densité concurrentielle, historique de score, multi-utilisateur : sur un premier lot d'une ville, ce sont des colonnes vides et de la saisie supplémentaire.

---

## 9. Dashboard

Les décisions de cette section ont été arbitrées sur maquettes. Celles-ci sont conservées dans `.superpowers/brainstorm/` (dossier ignoré par git) et restent consultables.

### 9.1 Coquille applicative — liste et panneau latéral

**La liste ne disparaît jamais.** Sélectionner une ligne ouvre le détail dans un panneau à droite ; les flèches haut et bas parcourent les prospects sans quitter le panneau. Patron d'une boîte mail ou de Linear.

Raison du choix : le dashboard sert deux gestes opposés — qualifier, qui exige de comparer beaucoup de lignes, et appeler, qui exige de se concentrer sur une seule. Le panneau latéral est le seul des trois patrons envisagés qui ne sacrifie ni l'un ni l'autre, et il évite l'aller-retour vers une page de détail à chaque prospect.

**La navigation au clavier fait partie du contrat**, pas des finitions : haut/bas pour changer de prospect, et des raccourcis pour les transitions de pipeline. C'est ce qui rend le patron rentable sur cinquante fiches d'affilée.

**Évolution identifiée mais hors périmètre :** un mode « session d'appels » plein écran, enchaînant les prospects d'une file préparée, déclenché depuis l'écran d'ouverture. Retenu comme direction, non implémenté ici.

### 9.2 Écrans

**Aujourd'hui** — page d'accueil, structurée en deux temps :

1. Une bande d'indicateurs : prospects en base, contactés, intéressés, taux de réponse.
2. Les listes de travail : relances dues, puis nouveaux prospects à fort score.

Chaque ligne de liste porte **la raison de sa présence** (« relance prévue aujourd'hui », « 92 · page FB active, 4,6 ★, domaine libre »). Cela ne coûte rien et supprime l'effet boîte noire.

Note assumée : les indicateurs seront proches de zéro les premières semaines. Choix retenu en connaissance de cause.

**Exploration** — table dense triée par score décroissant. Filtres : métier, ville, catégorie de présence web, plage de score, statut de pipeline, type de téléphone, note, nombre d'avis, effectif, ancienneté, domaine disponible, jamais contacté.

**Fiche prospect** — dans le panneau latéral : score détaillé, captures, coordonnées, journal des échanges, actions.

**File d'appariements** — cas `ambiguous` présentés côte à côte, fiche Sirene contre candidats Google, tranchés en un clic.

**Réglages du barème** — curseurs de pondération. Les règles étant pures, le front **recalcule et reclasse instantanément la page affichée**. « Appliquer » persiste une nouvelle version du barème et déclenche le recalcul global.

### 9.3 Restitution du score — deux échelles de lecture

| Contexte | Représentation |
|---|---|
| Ligne de liste | barre segmentée en trois blocs — présence, vitalité, joignabilité — plus le total chiffré |
| Panneau de détail | le calcul ligne par ligne, groupé par bloc, avec libellé lisible et points signés, total en pied |

La barre segmentée dit **de quoi** un score est fait, pas seulement combien il vaut : deux prospects à 71 dont l'un manque de joignabilité et l'autre de vitalité se distinguent au coup d'œil.

**Le panneau ne cherche pas à formuler l'argumentaire commercial.** C'est le rôle du générateur de message (section 10), qui produit la prose. Le panneau sert à comprendre et à régler ; le message sert à parler.

### 9.4 Direction visuelle

Intention générale : **moderne, simple, clair.** Densité élevée sans encombrement, aucun ornement qui ne serve pas la lecture.

**Thème sombre par défaut, thème clair en bascule.** Les deux partagent exactement la même densité, la même typographie et les mêmes composants : seules changent des variables CSS.

| | Sombre (défaut) | Clair (bascule) |
|---|---|---|
| Fond | `#0f1115` | `#fafafa` |
| Surfaces | `#171a21` | `#ffffff` |
| Bordures | `#262b35` | `#e8e8e8` |
| Texte | `#d5d9e0` | `#1a1a1a` |
| Texte secondaire | `#6b7280` | `#8a8a8a` |
| Accent | `#5b8cff` | `#4f46e5` |

- Typographie sans-serif système (Inter en priorité), tailles resserrées.
- Lignes de table compactes, privilégiant le nombre de prospects visibles sans défilement.
- Gris neutres, un unique accent, réservé au score et aux actions primaires.

Raison du choix de la densité : l'usage réel consiste à trier des centaines de lignes. Une mise en page plus aérée montrait environ moitié moins de prospects à surface égale — un coût payé chaque jour.

**Tous les tokens de couleur et d'espacement sont déclarés en variables CSS dès le départ**, sans quoi la bascule de thème devient une reprise coûteuse.

**Outillage :** le skill `ui-ux-pro-max` est à mobiliser à l'étape de construction du dashboard (étape 4 de la livraison), pour le détail des composants et de la grille. Il n'apporte rien au stade de la conception.

### 9.6 Internationalisation

Le terme « i18n » recouvre **deux sujets distincts** dans ce projet. Ils sont notés ensemble ici pour éviter la confusion.

**a) L'interface du dashboard — dans le périmètre de ce spec.**

Toutes les chaînes affichées passent par des fichiers de traduction dès la première ligne de code. Deux locales : `fr` par défaut, `en` disponible. Aucune chaîne en dur dans les composants.

Justification : externaliser les textes dès le départ est presque gratuit ; le faire après coup impose de repasser sur chaque composant, et c'est exactement le genre de reprise qu'on ne fait jamais. La discipline sert accessoirement à valider le format qu'on emploiera pour les sites générés.

Précision importante : **les messages de prospection produits par le LLM ne relèvent pas de l'i18n.** Ce sont des données, rédigées en français parce que les artisans ciblés sont francophones, et stockées comme telles dans `generated_message`. Elles ne sont pas traduites.

**b) Les fichiers de traduction du template de site vitrine — périmètre du spec n°2.**

C'est le mécanisme retenu pour la personnalisation par LLM : le template GitHub place tout son contenu textuel dans des fichiers i18n, et l'adaptation à chaque prospect se limite à réécrire ces fichiers, sans toucher aux images Unsplash ni au code. Rappelé ici pour mémoire ; conçu dans le spec n°2.

### 9.5 Pipeline

États : `à contacter` → `contacté` → `relance` → `intéressé` → `gagné` / `perdu`, plus `ne pas contacter`.

Champ `next_action_at` et journal horodaté des échanges.

---

## 10. Générateur de message

Déclenché depuis la fiche, produit trois variantes : script d'appel, message WhatsApp, email.

Contexte assemblé mécaniquement : nom, métier, ville, note et avis, page sociale, état du site, disponibilité du domaine.

### Garde-fous

**Le modèle ne reçoit que des faits vérifiés issus de la base, et le prompt lui interdit explicitement d'en inventer.** Un message contenant un détail inventé sur l'entreprise se retourne contre l'appelant dans les premières secondes de l'échange.

**Rien ne part automatiquement.** Le texte est éditable, puis copié manuellement.

Prompt versionné, messages archivés dans `generated_message`, régénérables.

---

## 11. Conformité

- **Exclusion des établissements non diffusibles** de Sirene — obligation légale, appliquée dès `discover`.
- De nombreux artisans sont des entrepreneurs individuels dont la raison sociale est le nom propre : la base contient donc des données personnelles.
- Statut `ne pas contacter` respecté immédiatement et définitivement.
- Finalité déclarée : prospection B2B. Base légale : intérêt légitime.
- Provenance et date de collecte de chaque enrichissement conservées.

---

## 12. Gestion des erreurs

| Panne | Comportement |
|---|---|
| Détection du bot par Google | statut `blocked`, arrêt propre, reprise au même point |
| Sirene indisponible | réessai exponentiel, puis échec explicite de l'étage |
| Quota LLM épuisé | repli sur un gabarit statique à trous — la prospection reste possible |
| Appariement douteux | file manuelle, jamais de fusion silencieuse |

Principe : **aucun étage ne peut corrompre la base sur un échec partiel.** Écriture unitaire, erreurs journalisées avec le prospect concerné, jamais avalées.

---

## 13. Tests

**`packages/core`, en TDD** — classification, barème, normalisation des raisons sociales, appariement. Logique pure, donc tests rapides et déterministes : le meilleur rendement de l'effort de test.

**Parsing Google Maps sur fixtures HTML figées**, sans réseau. Google modifiera son DOM ; un test rouge le signalera au lieu que des champs vides soient découverts des semaines plus tard.

**Base** — migrations, et vérification que rejouer `discover` ne duplique rien.

**Dashboard** — tests de rendu sur les composants de score et de filtres. Pas d'E2E au départ.

---

## 14. Ordre de livraison

1. `packages/db` et `packages/core` avec leurs tests
2. `discover` — de vrais prospects en base
3. `probe`, `classify`, `score` — **premier classement réel sans avoir touché à Google**
4. Dashboard : liste, fiche, filtres
5. `enrich` Google Maps, captures, file d'ambiguïtés
6. Pipeline, relances, vue Aujourd'hui
7. Disponibilité du domaine, générateur de message, export

L'étape 3 constitue le premier jalon à valeur autonome : des prospects classés et exploitables avant toute exposition au scraping.

---

## 15. Points à trancher à l'implémentation

- Ville de départ pour le premier lot.
- Codes NAF à revérifier contre les valeurs réellement retournées par l'API.
- Seuils haut et bas de confiance d'appariement, à calibrer sur les premiers résultats.
