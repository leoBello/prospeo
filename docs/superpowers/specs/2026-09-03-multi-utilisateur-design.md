# Prospeo devient multi-utilisateur — décisions, mesures, et ce que ça casse

**Date :** 2026-09-03
**Statut :** dix décisions prises, mesures faites, **spec d'implémentation pas encore écrit**
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
et Vercel, plus un **coffre chiffré des jetons par utilisateur** — là où
`loadPublishConfig(process.env)` lit aujourd'hui un jeton unique. D8 fait que
le worker de campagne tient ceux de SON utilisateur en mémoire ; mais le
§6 bis montre pourquoi le coffre reste indispensable malgré cela.

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
| **`worker_heartbeat`** | table à ligne unique (`check (id)`), alors que D8 demande un battement par utilisateur — et le dépôt interdit de modifier un objet existant. Table sœur obligatoire |
| **Le plafond Google** | `gmail.send` est un scope **sensible**. En « External + Testing » on plafonne à **100 utilisateurs** ; au-delà, la **vérification Google** est exigée — semaines de délai, vidéo de démonstration, politique de confidentialité. C'est un prérequis produit, pas une case à cocher. |

## 6. Les six questions, tranchées le 3 septembre 2026

### D5 — L'existant est rattaché au compte du propriétaire

Les 139 prospects nantais et le site de LUCIAN LAZA deviennent ceux du
premier locataire.

*Pourquoi :* les 139 portent scores, sondes et historique, payés d'environ 40
minutes de scraping. Surtout, **le site de LAZA est en ligne au nom d'une
entreprise réelle** et l'horloge des 90 jours de D5 (chantier n°4) tourne.
Effacer la ligne orphelinerait un site vivant, sans plus rien pour le
dépublier. Les jetons qui l'ont créé sont déjà ceux du propriétaire : le
rattachement est cohérent, pas arbitraire.

### D6 — Le gabarit devient public

*Pourquoi :* GitHub dérive un dépôt d'un modèle en **un** appel (`/generate`),
avec **un** jeton. Or un jeton de GitHub App est porté sur une seule
installation : celui de l'utilisateur ne peut pas lire un modèle privé chez
l'application. Un modèle public est lisible par tous les jetons, et le
problème disparaît sans écrire une ligne. C'est un squelette de vitrine
générique — il n'y a rien à y cacher. `templateRepoFor` continue de gouverner
lequel est employé.

### D7 — Deux files, drainées par le même worker, la campagne d'abord

L'enrichissement et la campagne n'ont ni le même rythme (des heures contre
~70 s), ni la même granularité (une tranche de 50 contre un prospect), ni le
même mode d'échec (Google bloque contre GitHub refuse).

*Pourquoi deux :* une file unique ferait attendre un clic de 70 secondes
derrière 14 minutes de scraping — or **la réactivité du déclenchement est
toute la raison d'être de la file**. Le worker sert la campagne d'abord.

### D8 — Un worker par utilisateur

**Décision du propriétaire, contre la recommandation initiale.** Elle porte un
avantage qui avait été sous-pesé : chaque worker ne détient que les jetons de
son utilisateur, ce qui supprime la résolution des jetons par job.

*Ce qu'elle coûte, et qu'il faut assumer :*

- un **superviseur** qui démarre, surveille et arrête un processus résident
  par inscrit — une charge d'exploitation qui croît avec les clients ;
- **`worker_heartbeat` ne convient plus.** C'est une table à ligne unique
  (`id boolean primary key`, `constraint worker_heartbeat_singleton
  check (id)`), et le dépôt interdit de modifier ou supprimer un objet
  existant. Il faut une **table sœur**, portant un battement par utilisateur,
  et l'ancienne devient morte — ou reste au service du processus de
  maintenance de D10.

### D9 — L'écran s'ouvre tout de suite et se remplit

`discover` a posé l'univers en quelques minutes : l'écran peut donc annoncer
un chiffre **vrai** (« 2 934 prospects trouvés, 50 enrichis ») et voir les
lignes apparaître au fil de l'eau par Realtime, exactement comme pendant un
déploiement.

*La règle qui l'accompagne, et qui n'est pas négociable :* **aucune durée
restante n'est annoncée tant qu'aucune tranche n'a été mesurée.** La bande de
campagne applique déjà cette retenue — elle n'affiche « ~9 min restantes »
qu'après avoir observé des durées réelles.

### D10 — L'application garde la capacité de dépublier

Les jetons de l'utilisateur sont conservés et renouvelés ; la péremption les
emploie même s'il ne se connecte plus.

*Pourquoi :* c'est la seule lecture qui sauve D5 du chantier n°4 — « un site
portant le nom d'un tiers, publié sans son accord, ne doit pas vivre
indéfiniment sans surveillance ».

*Deux exigences qui viennent avec :* les conditions d'utilisation doivent le
dire, et **un jeton révoqué rend la dépublication impossible** — il faut alors
alerter et consigner, jamais se taire.

## 6 bis. La conséquence que D8 et D10 produisent ensemble

Aucune des deux ne la portait seule, et elle change l'architecture :

**D8 dit que le worker appartient à l'utilisateur. D10 dit que l'application
doit pouvoir dépublier quand cet utilisateur a disparu.** Un worker qui ne
tourne que pour un utilisateur actif ne peut donc pas porter la péremption.

Il faut **deux exécutants de natures différentes** :

| | Qui | Quand | Avec quels jetons |
|---|---|---|---|
| Worker de campagne | un par utilisateur | tant qu'il est actif | ceux de son utilisateur, tenus en mémoire |
| Processus de péremption | **un seul, à l'application** | en permanence | **lus dans un coffre**, pour n'importe quel utilisateur |

**Conséquence : le coffre à jetons chiffré n'est pas évitable.** L'avantage
que D8 semblait offrir — « pas de résolution de jetons par job » — ne vaut que
pour la chaîne de campagne. La péremption, elle, doit pouvoir lire les jetons
de quelqu'un qui n'est pas là. Il faut donc le coffre **et** les workers par
utilisateur, pas l'un à la place de l'autre.

C'est un coût réel, à connaître avant d'écrire le spec plutôt qu'au milieu.

## 7. Ordre suggéré

Chaque étape rend la suivante vérifiable, et la première n'est pas
négociable :

1. **Le cloisonnement** — colonne propriétaire, RLS réécrite table par table,
   rattachement de l'existant (D5). C'est le seul poste qui, non fait, n'est
   pas une gêne mais un **incident** : au deuxième inscrit, chacun voit les
   prospects de l'autre.
2. **Le coffre à jetons chiffré**, et la GitHub App + l'intégration Vercel qui
   le remplissent (D2, D6). Le coffre avant les intégrations : c'est lui que
   les deux exécutants du §6 bis liront.
3. **Le worker par utilisateur** (D8) et son superviseur, avec la table sœur
   de battement. Le worker existant devient le modèle, pas le produit fini.
4. **La seconde file et l'enrichissement par tranches** (D7, D4), et ce que
   l'écran en dit sans jamais promettre une durée non mesurée (D9).
5. **Le processus de péremption de l'application** (D10, §6 bis) — distinct
   des workers, et la seule chose qui fasse tenir D5 du chantier n°4.
6. **Google et l'envoi**, une fois le projet Google Cloud de l'application
   créé et la question de la vérification tranchée.

**Ce qui n'est pas dans cet ordre, et qui devrait l'être avant l'ouverture à
de vrais clients :** les conditions d'utilisation qu'exige D10, et le dossier
de vérification Google qu'exige `gmail.send` au-delà de cent utilisateurs.
Ni l'un ni l'autre n'est du code, et les deux prennent des semaines.
