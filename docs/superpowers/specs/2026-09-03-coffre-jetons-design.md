# Le coffre à jetons — agir pour un utilisateur, même absent

**Date :** 2026-09-03
**Statut :** design, prêt pour plan d'implémentation
**Portée :** chantier n°8, étape 2 sur 6. Voir [`2026-09-03-multi-utilisateur-design.md`](2026-09-03-multi-utilisateur-design.md) pour les dix décisions qui l'encadrent, et [`2026-09-03-cloisonnement-design.md`](2026-09-03-cloisonnement-design.md) pour l'étape 1, livrée.

---

## 1. Objectif

Permettre au collector de déployer **avec le compte de l'utilisateur** — et au
processus de péremption d'agir **pour un utilisateur qui ne revient pas**.

### Pourquoi le coffre n'est pas évitable

D8 place un worker par utilisateur : celui-ci pourrait tenir les jetons de son
utilisateur en mémoire, sans coffre. Mais D10 exige que l'application garde la
capacité de dépublier un site quand l'utilisateur a disparu — et un worker qui
n'existe que pour un utilisateur actif ne peut pas le faire.

**Deux exécutants de natures différentes, donc :**

| | Qui | Quand | Jetons |
|---|---|---|---|
| Worker de campagne | un par utilisateur (D8) | tant qu'il est actif | tenus en mémoire au démarrage |
| Processus de péremption | **un seul, à l'application** | en permanence | **lus dans le coffre** |

Le second rend le coffre obligatoire. L'avantage que D8 semblait offrir — « pas
de résolution de jetons par job » — ne vaut que pour la chaîne de campagne.

### Critères de succès

1. Un jeton écrit n'est **jamais lisible en clair** dans la base : une copie
   complète de la base ne vaut rien sans la clé.
2. Le **dashboard ne peut lire aucun jeton**, même celui de son propre
   utilisateur — il n'en a jamais besoin.
3. L'utilisateur voit **quels comptes sont connectés**, et depuis quand.
4. Un jeton révoqué, expiré ou indéchiffrable se comporte comme un jeton
   **absent** — nommé à l'écran, jamais silencieux.
5. Le processus de péremption peut lire les jetons d'un utilisateur qui ne
   s'est pas connecté depuis des mois.

### Hors périmètre

Les intégrations elles-mêmes — la GitHub App, l'intégration Vercel, Google —
et le parcours d'installation. Cette étape construit **l'endroit où leurs
jetons vivront**, pas leur obtention. Elle se livre et se vérifie sans qu'aucune
intégration existe.

---

## 2. Ce qu'il faut vraiment stocker, et ce qu'on croyait devoir stocker

Le périmètre est **plus étroit** qu'il n'y paraît.

| Plateforme | Ce qu'on garde | Est-ce un secret ? |
|---|---|---|
| **GitHub** | l'**identifiant d'installation** de la GitHub App | **non** |
| **Vercel** | le jeton d'accès de l'intégration | **oui**, durable |
| **Google** | le jeton de rafraîchissement | **oui**, durable |

**GitHub ne met rien au coffre.** Une GitHub App ne s'authentifie pas avec un
jeton d'utilisateur : elle signe un JWT avec **sa** clé privée — que
l'application détient une seule fois — puis l'échange contre un jeton
d'installation valable une heure. L'identifiant d'installation n'est pas
sensible : sans la clé privée de l'App, il ne donne rien.

C'est une différence de nature, pas de degré : un jeton personnel volé sert à
qui le vole ; un identifiant d'installation volé ne sert à personne.

Le coffre existe donc pour **Vercel** aujourd'hui, et **Google** à l'étape 6.

---

## 3. Décisions

### V1 — La clé vit dans l'environnement du collector, jamais dans la base

Chiffrement **AES-256-GCM** par le module `crypto` de Node. La base ne stocke
que le chiffré, le vecteur d'initialisation et l'étiquette d'authentification.

*Pourquoi pas le coffre Supabase :* il n'est pas lisible par `supabase-js`
— `vault.decrypted_secrets` n'est pas exposé par PostgREST, délibérément — et
l'employer exigerait une fonction Postgres `security definer` par-dessus. Mais
la raison principale est ailleurs : **avec le coffre Supabase, les données et
la clé vivent chez le même fournisseur.** Une clé dans l'environnement du
collector rend une copie de la base inexploitable.

*GCM et non CBC :* GCM authentifie le chiffré. Sans cela, un chiffré modifié en
base se déchiffrerait en octets arbitraires, et le collector enverrait un jeton
fabriqué à Vercel au lieu d'échouer.

### V2 — Le secret et sa description vivent dans deux tables

- `connexion_plateforme` — **lisible par son propriétaire** : quelle
  plateforme, quel compte (le libellé, `mon-org` ou `leo@…`), depuis quand,
  et son état.
- `connexion_secret` — **aucune politique pour `authenticated`**. RLS étant
  active et aucune politique n'existant, la table est **inatteignable** depuis
  le dashboard. Seul `service_role` y accède.

*Pourquoi deux tables et non deux colonnes :* Postgres sait restreindre des
colonnes par `grant`, mais RLS ne s'exprime pas colonne par colonne, et une
politique qui protège une ligne entière est lisible d'un coup d'œil. Un écran
a besoin de dire « GitHub connecté depuis le 3 septembre » ; il n'a **jamais**
besoin du jeton. Deux tables rendent cette frontière impossible à franchir par
accident.

### V3 — Un jeton illisible est un jeton absent

Révoqué par la plateforme, expiré, ou déchiffrable par aucune clé : les trois
mènent au même comportement — **le compte est à reconnecter**, et l'écran le
dit.

*Pourquoi les confondre ici alors que ce dépôt sépare les absences partout
ailleurs :* la distinction compte pour le **diagnostic**, pas pour l'action.
`connexion_plateforme.etat` porte donc la nuance (`active`, `revoquee`,
`indechiffrable`) et l'écran l'affiche ; mais dans les trois cas, la seule
chose à faire est la même, et proposer trois remèdes différents pour un seul
geste tromperait.

*Conséquence de la perte de la clé maîtresse (décision du 3 septembre) :* tous
les jetons deviennent `indechiffrable`, chaque utilisateur doit reconnecter ses
comptes, et **rien ne prétend fonctionner entre-temps**. Aucune donnée n'est
perdue — seulement des autorisations à redonner.

### V4 — Un échec de déchiffrement ou d'appel se consigne, s'affiche, et se remonte

Trois destinations, pas une :

1. **En base**, sur `connexion_plateforme` : l'état et la date du constat.
2. **À l'écran de l'utilisateur** : « votre compte Vercel n'est plus
   accessible — 2 sites ne peuvent plus être retirés ».
3. **Dans un relevé pour l'exploitant** : quels comptes sont bloqués.

*Pourquoi les trois :* D10 dit que l'application garde la capacité de
dépublier. Quand elle la perd, se taire reviendrait à prétendre qu'un site
publié au nom d'un tiers reste surveillé. Le troisième point n'est pas du
confort : c'est ce qui permet de tenir la promesse au lieu de la supposer.

### V5 — Le dashboard n'écrit pas non plus

Les jetons arrivent par les rappels OAuth des intégrations, traités **côté
collector**. Le dashboard ne fait que **lire** l'état des connexions.

*Pourquoi :* un jeton qui transite par le navigateur est un jeton qu'on a
exposé, même une seconde. C'est le même raisonnement que pour GitHub et Vercel
au chantier n°7 — et la seule exception restera Gmail, dont le jeton d'envoi
est employé **par** le navigateur et n'est jamais stocké (D5 du chantier n°7).

---

## 4. Le modèle

```
connexion_plateforme
  id             uuid pk
  owner_id       uuid not null → auth.users        -- cloisonné comme le reste
  plateforme     plateforme_connectee              -- ('github','vercel','google')
  compte_libelle text                              -- « mon-org », « leo@… » : ce que l'écran montre
  reference      text                              -- l'identifiant d'installation GitHub, non secret
  etat           etat_connexion                    -- ('active','revoquee','indechiffrable')
  etat_constate_at timestamptz
  connectee_at   timestamptz not null
  unique (owner_id, plateforme)                    -- un compte par plateforme et par utilisateur

connexion_secret
  connexion_id   uuid pk → connexion_plateforme (on delete cascade)
  chiffre        bytea not null                    -- AES-256-GCM
  vecteur        bytea not null                    -- l'IV, unique par écriture
  etiquette      bytea not null                    -- le tag d'authentification GCM
  cle_id         text not null                     -- QUELLE clé a chiffré (voir §7)
  ecrit_at       timestamptz not null
```

**`reference` n'est pas dans le coffre**, et c'est délibéré : l'identifiant
d'installation GitHub n'est pas un secret, et l'y mettre imposerait un
déchiffrement pour une valeur qui n'en a pas besoin.

**RLS :** `connexion_plateforme` porte la politique du propriétaire, comme
`prospect`. `connexion_secret` a **RLS activée et aucune politique** — donc
personne n'y accède hors `service_role`. Une table sans politique n'est pas une
table oubliée : c'est la forme la plus stricte, et le commentaire de la
migration doit le dire, sans quoi le prochain lecteur « corrigera » l'oubli.

---

## 5. Ce que le collector gagne

Un module `coffre.ts`, avec trois fonctions et rien de plus :

- `chiffrer(clair)` → le triplet chiffré/vecteur/étiquette ;
- `dechiffrer(triplet)` → le clair, **ou** un échec nommé — jamais une
  exception nue, pour que l'appelant puisse marquer la connexion
  `indechiffrable` plutôt que de mourir ;
- `jetonDe(client, proprietaire, plateforme)` → le jeton en clair, ou l'état
  qui empêche de l'obtenir.

**Le chiffrement se teste sans base et sans réseau.** C'est un module pur au
sens où le reste du dépôt l'entend, et ses tests doivent couvrir : un aller-
retour, un chiffré modifié (l'étiquette GCM doit le refuser), un vecteur
réemployé (interdit : deux écritures ne partagent jamais leur IV), et une clé
absente au démarrage — qui doit **empêcher le collector de démarrer**, pas
échouer au premier job.

---

## 6. Tests

| Unité | Ce qu'on prouve |
|---|---|
| `coffre.ts` | aller-retour, chiffré altéré refusé, IV jamais réemployé, clé absente = refus de démarrer |
| `coffre.ts` | un déchiffrement impossible rend un **échec nommé**, jamais une exception nue |
| `data/connexions.ts` (dashboard) | l'état se lit, le secret **n'est pas lisible** — assertion contre l'instance |
| `scripts/verifier-cloisonnement.mjs` | étendu : `connexion_secret` est invisible **même pour son propriétaire** |

**Le contrôle qui compte n'est pas unitaire.** Étendre le script de
cloisonnement est ce qui prouvera que `connexion_secret` est bien inatteignable
— une politique manquante ne lève pas, elle rend zéro ligne, et un test qui
attend zéro ligne passerait aussi bien si la table était vide.

Il faut donc y écrire un secret **avec `service_role`**, puis vérifier qu'il
reste invisible pour son propriétaire en session. Sans cette écriture
préalable, le contrôle ne prouve rien.

---

## 7. Points à trancher à l'implémentation

1. **La colonne `cle_id`, posée mais pas encore employée.** Elle coûte une
   colonne aujourd'hui et permettra d'introduire une seconde clé sans tout
   re-chiffrer d'un coup. Le propriétaire a choisi « reconnexion » comme
   comportement en cas de perte (3 septembre) et n'a pas demandé la rotation ;
   la colonne la rend possible plus tard sans migration corrective. **À
   confirmer** : la poser, ou l'omettre et l'ajouter le jour venu.
2. **Où tourne le processus de péremption**, et sous quel ordonnanceur. Il
   n'est pas le worker de campagne (§1) et doit tourner même quand aucun
   utilisateur n'est connecté.
3. **Le format du relevé de V4** : un écran d'exploitation, un fichier, un
   message ? Rien ne l'exige tant qu'un seul compte existe, mais ne pas
   trancher revient à ne pas le construire.
4. **Le rappel OAuth de V5** : le collector n'a aujourd'hui aucun serveur HTTP.
   Recevoir un rappel Vercel en demande un — c'est le premier endroit du projet
   où la décision « pas de backend applicatif » devient réellement contraignante,
   et il faut le regarder en face à l'étape 3, pas ici.
