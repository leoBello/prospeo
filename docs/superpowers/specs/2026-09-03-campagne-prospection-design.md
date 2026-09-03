# Prospeo — Campagne de prospection : déployer, rédiger, envoyer

**Date :** 2026-09-03
**Statut :** design validé (maquettes approuvées le 3 septembre), prêt pour plan d'implémentation
**Périmètre :** chantier n°7 — l'écran qui met la chaîne de vente entre les mains de l'opérateur
**Maquettes de référence :** [`Campagne.dc.html`](../../design/maquettes/Campagne.dc.html) et [`CampagneEtats.dc.html`](../../design/maquettes/CampagneEtats.dc.html), page « Campagne » de `canvas.json`

---

## 1. Objectif

Un écran depuis lequel on lance et suit une campagne de prospection de bout en
bout : un site déployé, un mail rédigé par un modèle, un envoi depuis le compte
Gmail de l'opérateur — sur les vingt prospects les mieux notés que personne n'a
encore touchés.

Jusqu'ici la chaîne existe mais ne s'exécute qu'en ligne de commande, et les
messages se copient à la main depuis la fiche prospect. Le dashboard **lit et
enregistre** ; il ne déclenche rien. Cet écran change cela, sans changer
l'architecture qui l'interdisait.

### Critères de succès

1. L'écran liste les 20 prospects éligibles, classés par score, **et nomme ceux
   qu'il a dû exclure** faute de score.
2. Un clic dépose une demande en base ; le collector résident la prend en moins
   de deux secondes, et l'écran suit le déroulé sans rechargement.
3. Une fois le site en ligne, le mail est rédigé sans intervention, et lisible
   en entier avant d'être envoyé.
4. Un clic envoie ce mail depuis le compte Gmail de l'opérateur, et l'échange
   apparaît dans l'historique du prospect.
5. Une campagne de 10 traite les dix prospects sans intervention jusqu'au
   brouillon ; un réglage explicite la pousse jusqu'à l'envoi.
6. **Aucun état de l'écran ne se vide sans se nommer** : worker à l'arrêt,
   jeton expiré, adresse introuvable, liste illisible et liste épuisée sont
   cinq écrans différents.
7. Un même prospect ne peut pas recevoir deux mails, y compris si l'écran est
   rechargé au mauvais moment.

### Hors périmètre

- **Le SMS.** `pitch` en rédige un, l'écran le montre et permet de le copier,
  mais rien ne l'envoie : il faudrait une passerelle payante et un second
  chemin d'envoi. La maquette le dit à l'écran plutôt que de le taire.
- **La détection des rebonds.** Savoir qu'un mail est revenu suppose de lire la
  boîte (`gmail.readonly`), donc un second consentement et un traitement
  d'inbox. Voir §12.
- **Le multi-utilisateur.** Un opérateur, un compte d'envoi.
- **La relance.** Cet écran fait le premier contact. Les relances restent le
  domaine de l'écran « Aujourd'hui ».

---

## 2. Le mur, et pourquoi on ne le franchit pas

La décision d'architecture du chantier n°1 — « **Supabase + collector en ligne
de commande, sans backend applicatif** » — supprime une couche API entière
parce que le dashboard n'a besoin d'appeler que Supabase. Elle a un corollaire
que `HANDOFF.md` documente déjà : **le dashboard n'appelle jamais GitHub ni
Vercel**, et c'est pour cela que « Redéployer » est inerte depuis le lot 1.

Trois maillons, trois statuts :

| Maillon | Le navigateur peut-il ? | Pourquoi |
|---|---|---|
| Déployer un site | **non** | jetons GitHub et Vercel — des secrets |
| Rédiger le mail | **non** | clé API Anthropic — un secret |
| Envoyer le mail | **oui** | le jeton OAuth Google appartient à l'utilisateur connecté, et l'API Gmail accepte les appels navigateur |

Le troisième est ce qui rend cet écran possible sans backend. Les deux premiers
passent par la piste que `HANDOFF.md` avait déjà identifiée : **une file en
base, que le collector draine.**

### Pourquoi une file, et pas un backend

Le chiffrage, fait avant de trancher :

| Étape, par prospect | Durée |
|---|---|
| `generate` (contenu du site, Anthropic) | 5–20 s |
| `publish` (dépôt GitHub, push) | 3–10 s |
| `deploy` (projet Vercel, amorce) | 2–5 s |
| build Vercel, **observé par rejeu** | 30–90 s |
| `pitch` (mail + SMS, Anthropic) | 3–10 s |
| **total** | **45 s à 2 min** |

Le déclenchement pèse **0,2 à 2 s** avec un collector résident à l'écoute,
contre ~200 ms pour un appel HTTP à un backend : **1 à 2 % du total**. Ce qui
rendrait une file lente n'est pas la file, c'est un cron — toutes les 5
minutes, il ajouterait 2 min 30 d'attente morte en moyenne.

Trois raisons de fond, au-delà du chiffre :

1. **La chaîne est déjà asynchrone.** `runDeploy` n'attend pas le build : il
   l'amorce, rend `pending`, et un rejeu récupère l'URL. L'écran devra observer
   `deployment_event` quel que soit le déclencheur.
2. **Un backend ne supprimerait pas la file.** Une campagne de 10, c'est ~15
   minutes ; aucune requête HTTP ne tient ça, et une Edge Function encore
   moins. Il faudrait une file et un worker de toute façon — la question n'est
   pas « file ou backend », c'est « qui tient le worker ».
3. **Le contrat de l'écran est agnostique.** Il insère une ligne dans
   `campaign_job` et écoute `deployment_event`. Le jour où un backend devient
   justifié, il draine la même table : **l'interface ne change pas d'une
   ligne.** Choisir la file maintenant ne coûte aucune optionalité.

Ce qui limitera la performance à l'échelle, ce sont les quotas GitHub, Vercel et
Anthropic, réglés par un paramètre de concurrence — identique dans un worker ou
dans un backend.

---

## 3. Décisions tranchées

Six points arrêtés avec le propriétaire le 3 septembre 2026, plus trois
versés au dessin. **Ils ne sont pas à rediscuter** ; les rouvrir demande une
raison neuve, pas une préférence.

### D1 — File en base, drainée par un collector résident

Une commande `prospeo worker` reste en vie et écoute `campaign_job` par
Supabase Realtime. Elle exécute les étages existants sans les modifier.

*Pourquoi :* §2. Et parce que le worker est le seul endroit du système qui
détient déjà les trois jeux de secrets.

*Contrepartie assumée :* il faut un endroit où le laisser tourner. **Un worker
à l'arrêt doit se voir à l'écran**, sans quoi une campagne resterait muette
sans que personne sache pourquoi. D'où `worker_heartbeat` (§5).

### D2 — Auto jusqu'au brouillon ; l'envoi automatique est un réglage explicite

Par défaut, une campagne déploie et rédige les dix, puis s'arrête : chaque mail
est relu avant de partir. Un interrupteur **activable depuis l'interface**, par
campagne, la pousse jusqu'à l'envoi.

*Pourquoi :* D6 du chantier n°4 (« le système rédige, l'humain envoie ») est
une décision, pas une contrainte technique. Elle peut se rouvrir — mais
explicitement, avec ses conséquences énoncées, et non par effet de bord d'une
case cochée. Le réglage porte donc une confirmation qui dit ce qu'on perd
(§8), et reste visible tant qu'il dure.

*Ce qui ne se négocie pas avec lui :* le modèle ne reçoit toujours que des
faits vérifiés de la base, l'espacement tient, et les quatre bornes du §8
tiennent.

### D3 — Éligibilité : jamais touché, au sens strict

Un prospect entre dans le lot si, et seulement si :

- `prospect_pipeline.status = 'a_contacter'` (ce qui exclut `ne_pas_contacter`,
  `perdu`, et tout ce qui a bougé) ;
- **aucune ligne `interaction`** ;
- **aucune ligne `generated_message`** ;
- **aucune ligne `prospect_site` avec `published_at` non nul** ;
- **`prospect_score.total` non nul.**

Les 20 premiers par score décroissant.

**Deux nombres distincts, à ne pas confondre.** Le **lot** est ce que l'écran
affiche : 20 par défaut, élargissable à 50 quand les 20 sont épuisés. La
**campagne** est ce qu'on lance dessus : 10 par défaut, porté par
`campaign.size`. Une campagne prend les 10 premiers du lot encore éligibles au
moment du lancement — pas une sélection figée à l'avance, puisque la borne 2 du
§8 revérifie l'éligibilité avant chaque envoi.

À côté de la campagne, « Déployer la sélection » traite les lignes cochées sans
créer de campagne : `campaign_job.campaign_id` reste nul (§5.2).

*Pourquoi le score non nul est une condition et pas un tri :* un prospect
jamais scoré n'est pas un prospect à zéro. Un tri décroissant le rangerait en
bas comme s'il l'était. Il est **exclu, et l'exclusion est affichée** avec son
compte et une action pour la lever.

*Pourquoi `interaction` et `generated_message` et pas `message_send` :* voir
§5.4. `message_send` naîtra avec ce chantier et ne connaît pas le passé ; les
deux autres, si.

### D4 — Google en plus du mot de passe

`LoginScreen` gagne un bouton « Continuer avec Google ». La connexion par mot
de passe reste.

*Pourquoi pas Google seul :* le compte existant doit continuer de fonctionner,
et une panne du provider ne doit pas fermer l'application.

*Conséquence à porter :* un opérateur connecté par mot de passe **n'a pas de
jeton d'envoi**. L'écran gère cet état — il déploie et rédige, il n'envoie pas,
et il le dit (`CampagneEtats`, §1b).

### D5 — L'envoi part du navigateur, écran ouvert

Le mail est envoyé par l'API Gmail avec le `provider_token` de la session.

*Pourquoi :* le mail part du vrai compte de l'opérateur — sa signature, sa
réputation, et les réponses dans sa boîte. Aucun identifiant Google durable
n'est stocké nulle part. C'est aussi le seul maillon qui n'a pas besoin du
worker.

*Contrepartie assumée :* le jeton vit une heure et Supabase ne le renouvelle
pas ; l'onglet fermé arrête les envois. **Les deux cas sont des états nommés**
(`CampagneEtats`, §1c et §1d), jamais des boutons qui échouent en silence. Les
sites, eux, continuent de se déployer : c'est le worker qui les porte.

### D6 — L'adresse : un étage `contacts`, avec saisie en repli

**Aucune table du schéma ne porte d'adresse email.** `prospect_enrichment` a
`phone_e164`, `declared_url`, `social_urls` — Google Maps n'en donne pas. Sans
destinataire, un bouton « Envoyer » est exactement l'affordance que la doctrine
interdit.

Deux sources, dans cet ordre : un étage `contacts` du collector qui cherche
(page Facebook, annuaires, mentions légales d'un site en panne via archive), et
une **saisie manuelle dans la ligne** pour ce qu'il n'a pas trouvé.

*Pourquoi les deux :* la saisie seule suffit à rendre l'écran utile dès le
premier jour, et l'étage seul ne suffira jamais — sur les prospects `none`, qui
n'ont aucune présence web, il n'y a souvent rien à trouver.

*Ce qui en découle :* **l'origine de l'adresse est affichée.** Une adresse
relevée par un robot et une adresse vérifiée par un humain ne sont pas le même
fait, et ce qu'on engage en écrivant à l'une n'est pas ce qu'on engage avec
l'autre.

### D7 — Un espacement entre les envois (versé au dessin)

Les envois d'une campagne sont espacés — 90 s par défaut, réglable.

*Pourquoi :* dix mails froids en rafale depuis une boîte neuve se lisent comme
du spam et brûlent sa réputation. L'écran **montre l'attente** au lieu de la
subir : une ligne « Envoi dans 42 s » est un état, pas un gel.

### D8 — La piste replie le déploiement en un segment (versé au dessin)

La ligne porte trois segments — **Site · Mail · Envoi** — et non les cinq
étapes de `Deploiements`. Le détail des cinq s'ouvre au clic.

*Pourquoi :* cet écran suit une campagne, pas un build. Les cinq étapes
existent déjà dans `Deploiements.dc.html` et `DeploiementDetail.dc.html` ; les
redessiner ici créerait un dialecte. **Ce clic donne enfin un propriétaire à
`DeploiementDetail`**, la seule maquette du dépôt sans écran depuis la clôture
du lot 3.

### D9 — Bloqué n'est pas échoué (versé au dessin)

Une adresse manquante rend un segment en tirets ambre, jamais un segment rouge,
et compte dans une colonne à part (« sans adresse, ignoré ») et non dans les
échecs.

*Pourquoi :* une campagne où un prospect manque d'adresse n'est pas une
campagne en panne. Les confondre ferait chercher une remédiation technique là
où il manque une information.

---

## 4. Ce que l'écran montre

Deux artboards approuvés. Ce qui suit en énonce les invariants ; **la maquette
gouverne la mise en page**, et aucun test de ce dépôt ne la voit.

### 4.1 La bande de conditions

Sous le titre, au-dessus de la liste, **à côté des boutons qu'elle gouverne** :

- l'état du worker (`worker_heartbeat`) ;
- l'état du compte d'envoi (présence et fraîcheur du `provider_token`) ;
- le compte d'envois du jour, contre le plafond du compte ;
- l'interrupteur d'envoi automatique, **avec son mot** — « inactif » / « actif »
  — parce que la couleur n'est jamais le seul indicateur d'un état.

Quand une condition manque, **les boutons qu'elle gouverne s'éteignent et
disent pourquoi**. Un bouton grisé muet envoie chercher une remédiation qui
n'existe pas — c'est l'erreur que le bouton « Vérifier » de `GabaritScreen` a
déjà coûtée.

### 4.2 La bande de campagne

Visible pendant qu'une campagne tourne : anneau de progression **et** son
chiffre, quatre compteurs (sites en ligne, mails rédigés, envoyés, en échec),
la durée restante estimée, le coût cumulé, et « Suspendre ».

L'anneau n'est pas décoratif : `HANDOFF.md` recense « une bande de progression
construite sans son anneau » parmi les écarts que la maquette aurait évités.

**La durée restante se dérive des durées réellement observées** dans cette
campagne. Tant qu'aucun prospect n'est terminé, **rien ne s'affiche** — pas une
durée devinée.

### 4.3 La liste

Vingt lignes au plus. Par ligne : sélection, dénomination, badge de présence
web (l'argument de vente — `dead_site` porte le plus fort), métier, ville,
score en chasse fixe, la piste à trois segments, un état porteur d'un mot, et
une action contextuelle.

**L'adresse email ne figure pas dans la ligne.** Le troisième segment et le
badge disent déjà s'il y en a une ; l'y répéter tronquait une ligne sur deux
sans rien ajouter. L'absence se signale par un badge nommé, pas par une chaîne
vide.

**La cause d'un échec est dans la ligne**, pas derrière un journal à ouvrir —
même parti que D9 du chantier n°6.

### 4.4 Le panneau de relecture

À droite, à 520 px : le site déployé et son lien (c'est *lui* l'argument, et le
relire est le vrai contrôle), le destinataire **et son origine**, l'objet, le
corps avec ses sauts de ligne signifiants, la traçabilité (modèle, version des
consignes, date), le SMS rédigé mais non envoyable, et le pied d'envoi.

Le pied dit, **avant le clic**, de quelle boîte le mail part, où arriveront les
réponses, et ce que l'envoi change dans la fiche.

### 4.5 Les absences, qui restent distinctes

| Situation | Ce qui s'affiche | Ce que ce n'est pas |
|---|---|---|
| Les 20 ont tous été touchés | « Le lot est fini » + élargir | une base vide |
| Aucun prospect qualifié en base | « Rien n'a été filtré : il n'y a rien » | un lot fini |
| Prospects sans score | comptés et nommés, hors lot | un score de zéro |
| La lecture a échoué | « on ne sait pas ce qu'elle contient » | une liste vide |
| Adresse introuvable | « la collecte n'a trouvé aucune adresse » | un échec de déploiement |
| Collecte en cours | « pas encore trouvée » | « introuvable » |

Six situations, six rendus. C'est le point où ce dépôt s'est trompé le plus
souvent, et c'est pour cela que `CampagneEtats.dc.html` existe.

---

## 5. Modèle de données

Cinq objets neufs. **Aucune table existante n'est modifiée ni supprimée** —
`supabase/migrations/` s'applique à une instance réelle, sans environnement de
recette.

### 5.1 `campaign` — un lot, et son réglage

```
id              uuid pk
label           text            -- « Campagne du 3 septembre »
size            integer         -- 10
auto_send       boolean         -- D2, par campagne et jamais global
auto_send_at    timestamptz     -- quand il a été activé, et par qui via created_by
state           campaign_state  -- ('en_cours','suspendue','terminee','annulee')
created_by      uuid            -- auth.uid()
created_at      timestamptz
```

`auto_send` vit sur la campagne et non dans une préférence utilisateur : un
réglage global survivrait à la campagne qui l'a justifié, et s'appliquerait à
la suivante sans que personne le redemande.

### 5.2 `campaign_job` — la file

```
id            bigint identity pk
campaign_id   uuid null references campaign  -- null : un « Déployer » isolé
prospect_id   uuid references prospect
kind          campaign_job_kind  -- ('chaine') ; énumération pour l'extension
state         campaign_job_state -- ('en_attente','en_cours','termine','echoue','annule')
attempts      integer default 0
last_error    text
cost_eur      numeric            -- nullable : voir ci-dessous
requested_by  uuid
requested_at  timestamptz
started_at    timestamptz
finished_at   timestamptz
```

Index : `(state, requested_at)` pour le drainage, `(campaign_id)` pour la bande.

**`cost_eur` est nullable, et le total d'une campagne doit le dire.** Si un
étage ne rend pas son coût, la somme est *partielle* — l'afficher comme un
total exact sous-déclarerait la dépense. Un chiffre faux est pire qu'un chiffre
annoncé incomplet.

**Un seul job actif par prospect à la fois** : index unique partiel sur
`prospect_id where state in ('en_attente','en_cours')`. Sans lui, deux clics
rapides déposeraient deux chaînes sur le même dépôt GitHub.

### 5.3 `prospect_contact` — le destinataire, et d'où il vient

```
prospect_id  uuid pk references prospect
email        text                -- l'adresse retenue
origin       contact_origin      -- ('collecte','saisie')
source_url   text                -- où elle a été relevée ; null pour une saisie
candidates   jsonb default '[]'  -- ce que la collecte a vu d'autre
found_at     timestamptz
updated_at   timestamptz
```

Une table plutôt que des colonnes sur `prospect`, même parti que
`prospect_enrichment` et `web_presence` : la population concernée est une
minorité, et un prospect sans adresse n'a aucune raison de porter cinq colonnes
nulles.

`candidates` reprend le patron de `web_presence.domain_candidates` : la
collecte voit parfois plusieurs adresses, et n'en retenir qu'une sans garder
les autres oblige à tout refaire quand la première rebondit.

**`origin` est une énumération et non un booléen**, pour la même raison que
`pipeline_event_origin` : une troisième origine (import, correction après
rebond) est plus probable qu'un `is_manual` ne le laisserait croire.

### 5.4 `message_send` — l'envoi, et sa garantie d'unicité

```
id                   uuid pk
prospect_id          uuid references prospect
generated_message_id uuid references generated_message
channel              text            -- 'email'
provider             text            -- 'gmail'
recipient            text            -- l'adresse au moment de l'envoi
state                send_state      -- ('en_cours','envoye','echoue')
provider_message_id  text            -- rendu par l'API Gmail
error                text
sent_by              uuid
started_at           timestamptz
sent_at              timestamptz
```

**Contrainte unique partielle sur `(prospect_id, channel) where state <>
'echoue'`.** C'est elle, et non l'interface, qui garantit qu'un prospect ne
reçoit pas deux mails. Une garantie qui ne vit que dans un composant React ne
survit pas à un rechargement au mauvais moment.

**La ligne s'écrit *avant* l'appel à Gmail**, en `en_cours`, puis passe à
`envoye` avec l'identifiant rendu. Un plantage entre les deux laisse une ligne
`en_cours` : elle bloque le renvoi et **s'affiche comme « envoi incertain »**.
Un troisième état honnête vaut mieux qu'un double envoi silencieux ou qu'un
mail perdu.

**Cette table ne connaît pas le passé.** C'est le piège que CLAUDE.md nomme, et
que le jeu a déjà payé au lot 3. Un mail envoyé à la main avant ce chantier n'y
laisse aucune ligne — mais il en a laissé une dans `interaction`. **C'est
pourquoi l'éligibilité (D3) repose sur `interaction` et `generated_message`, et
jamais sur `message_send`.**

### 5.5 `worker_heartbeat` — le worker est-il vivant

```
id           boolean pk default true check (id)  -- une seule ligne, par construction
beat_at      timestamptz
version      text
in_flight    integer   -- combien de jobs en cours
```

Le worker l'écrit toutes les 10 s. L'écran le lit : au-delà de 60 s, le worker
est « à l'arrêt » et les boutons qu'il gouverne s'éteignent avec leur raison.

Sans cette table, un worker mort produirait des demandes qui s'empilent en
silence — exactement le genre de promesse qu'aucun code ne peut tenir.

### 5.6 RLS

Même doctrine que le reste du socle : `authenticated` lit et écrit, le
collector passe par `service_role`. La clé anonyme est publique par
construction ; RLS est la condition de validité de l'architecture, pas un
durcissement ultérieur.

---

## 6. Le worker

Une commande `prospeo worker` dans le collector, à côté des étages existants.

**Elle ne réimplémente aucun étage.** Elle enchaîne `runGenerate`,
`runPublish`, `runDeploy`, `runPitch` sur un prospect, dans cet ordre, et écrit
`deployment_event` comme ils le font déjà.

- **Écoute** `campaign_job` par Realtime, et **balaye** au démarrage et
  toutes les 30 s. Le balayage rattrape ce qu'une déconnexion Realtime aurait
  laissé passer : un worker qui ne dépend que d'un socket est un worker qui
  s'endort sans le dire.
- **Concurrence bornée**, réglable, à 1 par défaut. Les quotas GitHub, Vercel
  et Anthropic sont la vraie limite.
- **Idempotence héritée** : les étages savent déjà ne pas refaire ce qui est
  fait — `content_hash` gouverne le push, un projet Vercel existant n'est pas
  recréé. Rejouer un job échoué est donc sûr.
- **Le build ne bloque pas.** `runDeploy` rend `pending` ; le job reste
  `en_cours` et une reprise récupère l'URL, comme aujourd'hui en ligne de
  commande.
- **Arrêt propre** : sur `SIGTERM`, il finit le job en cours et repose les
  autres en `en_attente`. Un job abandonné en `en_cours` par un worker tué est
  repris après un délai de garde.

---

## 7. L'envoi Gmail

### 7.1 La connexion

`signInWithOAuth({ provider: 'google' })` avec le scope
`https://www.googleapis.com/auth/gmail.send` — le plus étroit qui permette
d'envoyer, et rien d'autre : il ne donne aucun accès en lecture à la boîte.

Le `provider_token` de la session sert de porteur. **Supabase ne le
renouvelle pas** : il disparaît au premier rafraîchissement du jeton Supabase,
soit une heure environ. Le comportement exact dépend de la version de
`supabase-js` — voir §12.

L'écran distingue donc **trois** états du compte d'envoi, et non deux :
connecté avec jeton valide, connecté sans jeton (session par mot de passe), et
jeton expiré en cours de campagne. Les trois ont un rendu et une remédiation
distincts.

### 7.2 L'envoi

`POST /gmail/v1/users/me/messages/send`, corps RFC 822 encodé en base64url.
L'API accepte les appels depuis un navigateur.

Séquence, et l'ordre compte :

1. écrire `message_send` en `en_cours` — la contrainte unique tranche ici, pas
   plus tard ;
2. appeler Gmail ;
3. passer la ligne en `envoye` avec `provider_message_id` ;
4. consigner l'échange et faire avancer la fiche, **par les fonctions qui
   existent déjà** : `journaliserInteraction` (`kind = 'email'`) puis
   `definirStatut(..., 'contacte', ...)`, qui écrit `prospect_pipeline` **et**
   `pipeline_event` en une fois. Ne rien réécrire ici : `definirStatut` porte
   déjà la distinction d'échec entre l'état et l'historique, dont la série
   dépend.

L'étape 4 échouée laisse un mail parti et une fiche en retard : elle est donc
rejouable, et son échec s'affiche plutôt que de se taire. `definirStatut` rend
précisément **laquelle** de ses deux écritures a échoué — c'est cette
distinction que l'écran doit relayer, pas un « échec » générique.

### 7.3 Les limites du support

Un compte `@gmail.com` personnel plafonne à **500 destinataires par jour**
(2 000 sur Workspace). L'écran affiche le compte du jour contre ce plafond.
Ce n'est pas une statistique : c'est la limite qui décide si un envoi partira.

---

## 8. Le mode automatique, et ses bornes

Activable **par campagne**, jamais globalement, derrière une confirmation qui
énonce trois choses : ce qui ne change pas (le modèle ne reçoit que des faits
vérifiés), ce qui tient (l'espacement, l'écran ouvert), et **ce qu'on perd** —
le dernier contrôle humain sur un texte qui nomme une entreprise réelle. La
confirmation rappelle combien de mails de la campagne ont été relus, et combien
partiront non lus.

Une fois actif, il reste visible dans la bande de conditions, avec son mot.

**Quatre bornes, qui tiennent quoi qu'il arrive :**

1. il ne dépasse pas la taille du lot — la campagne suivante se relance à la
   main ;
2. il n'écrit jamais à un prospect passé en `ne_pas_contacter`, même s'il était
   dans le lot au départ (revérifié avant chaque envoi, pas au lancement) ;
3. il n'envoie jamais deux fois au même — garanti par l'index de §5.4, pas par
   la boucle ;
4. il ne survit pas à la fermeture de l'écran, et le désactiver arrête le
   *prochain* envoi, pas celui qui est parti.

La boucle vit dans le navigateur, se démonte avec le composant, et s'arrête sur
expiration du jeton en laissant la campagne sur « prêt à envoyer ».

---

## 9. Conformité

Ce chantier fait passer le système de « rédige » à « envoie ». D6 du chantier
n°4 avait explicitement reporté la question ; elle est due ici.

- **Prospection B2B par email.** Le message doit se rapporter à l'activité
  professionnelle du destinataire, **identifier son expéditeur**, et offrir un
  **moyen d'opposition** explicite. Les consignes de rédaction (`pitch`)
  doivent produire les deux dernières, et non compter sur la bonne volonté du
  modèle : ce sont des blocs fixes, ajoutés hors du texte généré.
- **`ne_pas_contacter` est immédiat et définitif** — la règle du socle vaut
  ici, et le site est dépublié sans délai (D5 du chantier n°4). L'action est
  disponible depuis le panneau de relecture, parce que c'est là qu'on la
  rencontrera.
- **Aucun fait inventé.** Le modèle ne reçoit que des faits vérifiés de la
  base. La règle vaut doublement quand le message part tout seul.

**À confirmer avant le premier envoi automatique**, et non à supposer : la
formulation exacte de l'opposition et de l'identification. C'est une
vérification, pas une conception.

---

## 10. Ce que la maquette montre et que rien ne rend vrai

Recensement à l'entrée du chantier, à tenir à jour dans `HANDOFF.md` :

| Ce que la maquette montre | Ce qui existe aujourd'hui |
|---|---|
| « Collector à l'écoute » | rien — ni `worker_heartbeat`, ni commande `worker` |
| La file et l'état « en file d'attente · 3ᵉ » | rien — ni `campaign_job` |
| Le destinataire et son origine | rien — **aucune colonne email dans le schéma** |
| Le jeton Gmail et l'envoi | `AuthProvider` ne connaît que `signInWithPassword` |
| Le coût cumulé | rien ne le compte côté dashboard |
| Le détail des cinq étapes au clic | `DeploiementDetail.dc.html`, maquette sans écran |

**Tant que l'un de ces éléments n'existe pas, l'affordance qui l'annonce ne se
construit pas.** Un `Bientot` porteur de son motif, comme le bouton
« Vérifier » de `GabaritScreen`, est la seule forme acceptable d'une promesse
non tenue.

---

## 11. Tests

Écrire le test d'abord, et **vérifier qu'il échoue pour la bonne raison** :
casser le code couvert, observer le rouge, restaurer, observer le vert.

Le texte des assertions **se lit dans `fr.ts`**, jamais ne s'invente — quatre
assertions mortes sur cinq, aux lots précédents, venaient d'un texte inventé.

**Ce qui se teste :**

| Unité | Ce qu'on prouve |
|---|---|
| `domain/campagne.ts` | l'éligibilité D3, y compris l'exclusion des non-scorés, comptée à part |
| `domain/campagne.ts` | la dérivation des trois segments depuis `deployment_event` + `message_send` + `prospect_contact` |
| `domain/campagne.ts` | « bloqué » ≠ « échoué » ≠ « en attente » (D9) |
| `data/campagne.ts` | la lecture, et l'échec de lecture distinct d'un résultat vide |
| `envoi/rfc822.ts` | l'encodage — accents, objet, corps multiligne, base64url |
| `envoi/cadence.ts` | l'espacement, en horloge simulée |
| `envoi/envoyer.ts` | la séquence de §7.2, et le cas du plantage entre 1 et 3 |
| `collector/stages/worker.ts` | le drainage, l'idempotence du rejeu, la reprise d'un job orphelin |
| `i18n` | parité fr/en, aucune clé orpheline |
| `ui/guidelines.test.ts` | aucune couleur littérale, aucune fonte hors tokens, pas d'ellipse sur un conteneur flex |

**Ce qu'aucun test ne verra :** une largeur, une hauteur, un débordement, un
chevauchement, une troncature. `jsdom` n'en calcule aucune. C'est le domaine des
deux artboards approuvés, et la raison pour laquelle ils ne sont pas une
formalité.

**Piège de cette suite, déjà payé :** `getByText` compare le texte *entier* du
nœud, `queryByRole` filtre sur `hidden: false`, `getAllByText` **lève** à zéro
correspondance — un `.length > 0` qui suit ne teste rien.

---

## 12. Points à trancher à l'implémentation

Ils ne bloquent pas le plan, mais ils se tranchent au moment où on les
rencontre, et se consignent dans `HANDOFF.md`.

1. **La durée de vie réelle du `provider_token`** selon la version de
   `supabase-js` du dépôt : conservé en session ou perdu au premier
   rafraîchissement. À mesurer, pas à supposer. Le rendu de l'état « jeton
   expiré » en dépend.
2. **Les sources de l'étage `contacts`**, et son taux de réussite réel sur les
   prospects `none`. S'il est très bas, la saisie manuelle devient le chemin
   principal et l'étage un bonus — ce que l'écran doit alors refléter.
3. **Le délai de garde** avant de reprendre un job `en_cours` orphelin : trop
   court, on double un déploiement ; trop long, une campagne se fige.
4. **La détection des rebonds.** Hors périmètre ici, mais un mail qui rebondit
   laisse un prospect « contacté » qui ne l'est pas. Le minimum honnête, à
   défaut de détection : ne pas prétendre que le contact a abouti.
5. **`trades.ts` et le gabarit désigné**, décision ouverte depuis le lot 2 :
   les deux métiers déclarent leur propre `templateRepo`, donc le gabarit
   désigné en base ne gouverne rien. Une campagne qui déploie dix sites rend
   cette décision plus visible qu'elle ne l'était.

---

## 13. Ordre de livraison

La tranche verticale d'abord : **prouver la chaîne complète sur un prospect**
avant de soigner chaque maillon.

| # | Lot | Ce qu'il prouve |
|---|---|---|
| 0 | Les cinq migrations | la base sait porter une file, un contact, un envoi |
| 1 | `prospeo worker` | une ligne déposée à la main en base déclenche un déploiement réel |
| 2 | L'écran en lecture | les 20, la piste, et les six absences — sans aucun bouton actif |
| 3 | Le déclenchement | « Déployer » dépose un job, l'écran suit en Realtime |
| **J** | **Jalon** | **un prospect, du clic au site en ligne, vu à l'œil** |
| 4 | Google + l'envoi d'un mail | le premier mail réel part, la fiche le sait |
| 5 | L'étage `contacts` + la saisie | le destinataire cesse d'être une hypothèse |
| 6 | La campagne de 10 et sa bande | le lot, les compteurs, le coût, la suspension |
| 7 | Le mode auto et ses quatre bornes | D2, avec sa confirmation |
| 8 | Le détail au clic | `DeploiementDetail` trouve son écran |

Les lots 1 et 2 sont indépendants et peuvent avancer en parallèle. Le lot 4 ne
dépend pas du 5 : un prospect dont l'adresse est saisie à la main suffit à
éprouver l'envoi.
