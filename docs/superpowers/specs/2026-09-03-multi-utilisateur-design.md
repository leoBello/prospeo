# Prospeo devient multi-utilisateur — décisions, mesures, et ce que ça casse

**Date :** 2026-09-03
**Statut :** décisions prises, mesures faites, **spec pas encore écrit** — questions ouvertes en §6
**Portée :** chantier n°8. Il n'amende pas le chantier n°7 : il en renverse une hypothèse.

---

## 1. Ce qui change, et où l'hypothèse était écrite

Jusqu'ici tout a été construit pour **un opérateur**, propriétaire du dépôt.
C'était écrit noir sur blanc et jamais contredit :

- Spec du chantier n°7, §1, hors périmètre : « **Le multi-utilisateur.** Un
  opérateur, un compte d'envoi. »
- D4 du chantier n°4 : « **Organisation GitHub et compte Vercel dédiés** » —
  une organisation, un compte, un jeton par plateforme, dans le `.env` du
  collector.

**La cible réelle est autre.** Chaque utilisateur déploie sur **son** GitHub,
**son** Vercel, et envoie depuis **son** Gmail. Seul le **gabarit** — le
dépôt modèle dont les sites sont dérivés — reste hébergé par l'application.
Un parcours d'inscription connectera ces comptes.

Ce n'est pas un réglage : c'est un changement de nature du produit, d'un outil
personnel à un logiciel vendu.

## 2. Décisions prises le 3 septembre 2026

### D1 — La base de prospects est **propre à chaque utilisateur**

Chacun collecte sa ville et son métier, et ne voit que ses prospects.

*Conséquence, et c'est le plus gros poste du chantier :* **les seize tables
portent aujourd'hui la même politique** — `authenticated_all` avec
`using (true)`. N'importe quel utilisateur connecté voit **toutes** les
lignes de **toutes** les tables. En mono-utilisateur c'était juste ; ici
c'est une fuite de données au premier inscrit. Il faut une colonne
propriétaire et une RLS réécrite, table par table, et rattacher les 139
prospects existants à quelqu'un.

### D2 — GitHub App et intégration Vercel, pas de jeton collé

L'utilisateur installe l'application sur son compte et l'autorise. Aucun
secret à copier, portée révocable et limitée, jetons renouvelables.

*Conséquence :* deux intégrations à construire et à faire valider côté GitHub
et Vercel, plus un **stockage chiffré des jetons par utilisateur**, et leur
résolution **par job** dans le worker — là où `loadPublishConfig(process.env)`
lit aujourd'hui un jeton unique.

### D3 — L'application paie le modèle de langage

La clé Anthropic reste côté collector ; l'utilisateur ne la voit pas.

*Conséquence :* le coût devient une dépense d'exploitation qui croît avec
l'usage. `campaign_job.cost_eur`, aujourd'hui **toujours nul** faute de table
de prix, cesse d'être un confort d'affichage et devient un instrument de
gestion.

### D4 — L'inscription enrichit **par tranches**, et l'écran se remplit

`discover` pose l'univers complet en quelques minutes ; un travailleur
enrichit ensuite par paquets, en commençant par ce qu'il faut à un premier
lot de vingt. L'écran affiche ce qui existe et **nomme ce qui manque**
pendant que le reste arrive.

*Pourquoi ce n'est pas négociable :* voir les mesures ci-dessous.

## 3. Les mesures qui ont forcé D4

Faites le 3 septembre 2026, contre l'API Etalab et le code du collector.
**Elles coûtent cher à refaire : ne pas les réestimer de mémoire.**

### Le volume

Plombiers (NAF 43.22A), par l'API Recherche d'entreprises :

| Zone | Établissements |
|---|---|
| Nantes, les 4 codes postaux | 416 |
| Nantes, ce que la base contient réellement | 139 (un seul code postal) |
| **Marseille, les 16 arrondissements** | **2 934** |
| dont le seul 13013 | 354 |

Marseille est **21 fois** la base actuelle.

### Le rythme, et pourquoi il ne s'accélère pas

`apps/collector/src/sources/google-maps.ts` étrangle **chaque** navigation
vers Google à un délai aléatoire de **3 à 8 secondes** (`DEFAULTS.minDelayMs`
/ `maxDelayMs`), soit ~5,5 s en moyenne. `throttleNavigation` est le seul
passage avant tout `goto`, et son commentaire dit pourquoi il couvre tous les
chemins : « un étranglement qui ne couvre qu'une partie des chemins ne protège
de rien ».

Chaque prospect coûte **2 à 4 navigations** (jusqu'à trois requêtes de
`queriesFor`, plus l'ouverture de la fiche). La boucle de `runEnrich` est
**sérielle**.

| Population | Enrichissement |
|---|---|
| 139 (Nantes, l'existant) | ~40 min |
| 354 (un arrondissement) | ~1 h 40 |
| **2 934 (Marseille)** | **9 à 13 h** |
| 50 (de quoi remplir un premier lot) | **~14 min** |

**Ça ne se parallélise pas.** Le rythme se mesure aux requêtes envoyées à
Google, et le spec du chantier n°1 assume explicitement le risque de blocage.
Accélérer, c'est se faire bloquer.

*Réserve honnête :* le facteur « 2 à 4 navigations » vient de la lecture du
code, pas d'un chronométrage. Les ~40 min de Nantes sont cohérentes avec lui,
sans le prouver.

### L'étage `contacts` n'a rien à chercher

Déjà consigné au §12.2 du spec du chantier n°7, rappelé ici parce que le
multi-utilisateur ne l'améliore pas : sur 139 prospects, `social_urls` est
vide pour **tous**, `declared_url` n'existe que pour 20 dont 17 sont exclus du
lot, et **109 sur 139 n'ont aucune présence web**. La saisie manuelle est le
chemin principal, pas le repli.

## 4. Ce qui survit du chantier n°7

Davantage qu'il n'y paraît, et une chose s'en trouve **renforcée** :

- **La file en base et le worker résident.** Les jetons GitHub et Vercel de
  chaque utilisateur ne peuvent pas plus vivre dans un navigateur que ceux du
  propriétaire. Le contrat « le dashboard écrit une ligne, le worker
  l'exécute » devient la seule forme possible.
- **`campaign_job.requested_by`**, relevée comme colonne morte par la revue
  finale (constat M3), devient la clé de voûte : c'est elle qui dira de qui
  résoudre les jetons.
- Le domaine (`classerLot`, `etatLigne`), l'écran, les quatre étages, la forme
  des migrations.

## 5. Ce que le multi-utilisateur casse, en clair

| Ce qui casse | Pourquoi |
|---|---|
| **La RLS des 16 tables** | `using (true)` partout : chacun voit tout |
| **Les jetons du `.env`** | un `GITHUB_TOKEN`, un `VERCEL_TOKEN` pour tout le monde |
| **D4 du chantier n°4** | « organisation et compte **dédiés** » dit l'inverse de la cible |
| **L'accès au gabarit** | `runPublish` dérive un dépôt d'un modèle ; celui-ci vit chez l'application et le dépôt naît chez l'utilisateur — l'accès croisé est à résoudre |
| **`worker_heartbeat`** | ligne unique, donc un seul worker pour tous : tenable, mais à décider explicitement |
| **Le plafond Google** | `gmail.send` est un scope **sensible**. En « External + Testing » on plafonne à **100 utilisateurs** ; au-delà, la **vérification Google** est exigée — semaines de délai, vidéo de démonstration, politique de confidentialité. C'est un prérequis produit, pas une case à cocher. |

## 6. Questions encore ouvertes — à trancher avant d'écrire le spec

1. **Que deviennent les 139 prospects nantais et le site déjà publié ?**
   Rattachés au compte du propriétaire, ou repartis de zéro ?
2. **Le worker : un seul pour tous, ou un par utilisateur ?** Un seul est plus
   simple et suffit au volume ; mais un utilisateur dont le jeton GitHub est
   invalide ne doit pas bloquer la file des autres.
3. **La file d'enrichissement est-elle la même que `campaign_job`, ou une
   seconde file ?** Elles n'ont ni le même rythme ni la même granularité.
4. **Le gabarit doit-il être public** pour que `runPublish` puisse en dériver
   un dépôt chez l'utilisateur, ou la GitHub App a-t-elle accès aux deux ?
5. **Que voit un utilisateur pendant les 14 premières minutes ?** L'écran doit
   nommer « base en cours de constitution » sans promettre de délai qu'aucun
   code ne peut tenir.
6. **La péremption à 90 jours et la dépublication (D5 du chantier n°4)**
   s'exécutent-elles pour le compte de l'utilisateur, sur son Vercel, même
   s'il ne se connecte plus ?

## 7. Ordre suggéré

Rien ne s'écrit avant que le §6 soit tranché. Ensuite, dans cet ordre, parce
que chaque étape rend la suivante vérifiable :

1. **Le cloisonnement** — colonne propriétaire, RLS réécrite, rattachement de
   l'existant. C'est le seul poste qui, non fait, est une fuite de données.
2. **Le stockage des jetons par utilisateur** et leur résolution par job.
3. **La GitHub App et l'intégration Vercel**, avec le parcours d'installation.
4. **L'enrichissement par tranches**, et ce que l'écran en dit.
5. **Google et l'envoi**, une fois le projet Google Cloud de l'application
   créé et la question de la vérification tranchée.
