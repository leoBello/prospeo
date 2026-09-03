# Le relais OAuth — la GitHub App et l'intégration Vercel qui remplissent le coffre

**Date :** 2026-09-03
**Statut :** design, prêt pour plan d'implémentation
**Portée :** chantier n°8, étape 3 sur 6. Voir
[`2026-09-03-multi-utilisateur-design.md`](2026-09-03-multi-utilisateur-design.md)
pour les dix décisions qui l'encadrent (D2 en particulier), et
[`2026-09-03-coffre-jetons-design.md`](2026-09-03-coffre-jetons-design.md) pour
l'étape 2 — livrée, fusionnée (PR #11) — qui construit l'endroit où les jetons
de cette étape iront vivre.

---

## 1. Objectif

Permettre à un utilisateur de connecter **son propre compte** GitHub et **son
propre compte** Vercel à Prospeo, sans jamais coller de jeton — D2. À la fin de
cette étape, `connexion_plateforme` et `connexion_secret` (étape 2) portent de
**vraies** connexions, pas des fixtures de contrôle.

**Précision par rapport à V5 de l'étape 2** — qui disait les jetons « traités
côté collector » sans encore trancher le mur ci-dessous. Ils sont en réalité
traités par le **relais** (§3, R1), un service distinct, pour la raison que ce
mur impose : le collector n'a pas de serveur HTTP pour les recevoir. Ce que V5
protège reste intact — c'est toujours un processus qui tourne côté
application, en `service_role`, jamais le navigateur, qui écrit le coffre.

### Le mur, et pourquoi il fallait le regarder en face ici

Recevoir un rappel OAuth — l'installation d'une GitHub App, l'autorisation
d'une intégration Vercel — exige un point d'entrée HTTP public. Le collector
n'en a aucun : c'est une ligne de commande, lancée à la main sur la machine de
l'opérateur, sans serveur. §7.4 du spec de l'étape 2 nommait déjà ce mur sans
le trancher.

### Critères de succès

1. Un utilisateur clique un lien, installe la GitHub App sur son propre
   compte/organisation, et `connexion_plateforme` porte son
   `installation_id` — sans que Prospeo n'ait jamais vu ni stocké de secret
   GitHub (§2 du spec de l'étape 2 : ce n'en est pas un).
2. Un utilisateur clique un lien, autorise l'intégration Vercel, et son jeton
   d'accès atterrit **chiffré** dans `connexion_secret` — jamais en clair,
   jamais dans un journal.
3. Les deux flux se protègent contre la falsification : personne ne peut
   forcer l'écriture d'une connexion pour un `owner_id` qui n'est pas le sien.
4. Le collector n'a **toujours** aucun serveur HTTP. Le mur est résolu
   ailleurs, pas en le déplaçant dans le collector.

### Hors périmètre

- **Aucun écran dashboard.** Comme l'étape 2, cette étape reste vérifiable par
  script, pas par une maquette — aucune n'existe encore pour un écran
  « Connexions », et la doctrine du dépôt l'exige avant d'écrire un composant
  important.
- **`publish.ts`/`deploy.ts` ne changent pas.** La chaîne de déploiement
  continue d'utiliser `GITHUB_TOKEN`/`VERCEL_TOKEN`, les secrets partagés
  actuels. Rebrancher la chaîne sur les jetons connectés attend que D8 (un
  worker par utilisateur) existe pour le porter proprement — un seul
  propriétaire réel existe aujourd'hui, rebrancher maintenant n'aurait
  personne à servir.
- **Le processus de péremption** (D10) — toujours pas construit, comme à
  l'étape 2.
- **Google** — Google/Gmail, étape 6.

---

## 2. Ce qui a déjà été fait, manuellement, hors code

Deux comptes sont déjà créés par le propriétaire, dans ses propres comptes
GitHub et Vercel :

- **Une GitHub App**, « Any account » comme cible d'installation, permissions
  Administration (read/write) et Contents (read/write), sans OAuth utilisateur
  à l'installation, sans webhook. Ses identifiants (App ID, clé privée `.pem`)
  sont notés par le propriétaire, **hors de ce dépôt et hors de cette
  conversation** — ils rejoindront l'environnement du relais (§5) à
  l'implémentation, jamais un commit ni un message.
- **Une intégration Vercel** (badge Community, non listée), avec les scopes
  API limités à Projects et Deployments en lecture/écriture. Son Client ID et
  Client Secret sont notés de la même façon.

Trois pages statiques, publiées sur le dashboard existant (`apps/dashboard/`,
déjà déployé sur Vercel), répondent aux champs obligatoires du formulaire
d'inscription Vercel :

| Champ du formulaire | Page | Contenu |
|---|---|---|
| Website | `https://prospeo-dashboard.vercel.app` | le dashboard lui-même |
| Documentation URL | `.../documentation.html` | ce que l'intégration fait, en une page |
| EULA URL | `.../eula.html` | outil en développement, conditions à venir |
| Privacy Policy URL | `.../confidentialite.html` | ce qui est stocké, ce qui ne l'est pas |

**Ces trois pages sont délibérément minimales et honnêtes** — pas un texte
juridique fabriqué. Le spec cadre du chantier note déjà que les vraies
conditions d'utilisation et la vérification Google restent à faire avant toute
ouverture publique ; ce formulaire l'a juste demandé plus tôt que prévu.

Le **Redirect URL** de l'intégration Vercel est posé à
`https://prospeo-relais-oauth.vercel.app/api/vercel/callback` — une adresse
qui n'existe pas encore, mais qui existera, puisque §4 fixe le nom du projet
qui la sert. Modifiable depuis la console des intégrations si ce nom change en
cours d'implémentation.

---

## 3. Décisions

### R1 — Un nouveau paquet, `apps/relais-oauth`, déployé comme projet Vercel séparé

Ni dans le collector (pas de serveur), ni dans le projet Vercel du dashboard
(mélanger des secrets serveur avec les variables `VITE_*` publiques du
dashboard est exactement le risque que `.env.example` met déjà en garde).

*Pourquoi Vercel et non une fonction Supabase Edge (l'alternative retenue en
second) :* le relais peut importer directement le module de chiffrement du
collector (R2), en Node, sans porter le chiffrement vers Deno. Rien à
héberger, rien à surveiller — Vercel scale à zéro entre deux connexions.

*Le coût, à assumer :* trois secrets (`PROSPEO_COFFRE_CLE`,
`SUPABASE_SERVICE_ROLE_KEY`, et les nouveaux identifiants OAuth) vivent
maintenant dans **deux** environnements distincts — celui du collector et
celui du relais — au lieu d'un seul. Une rotation de l'un devra penser aux
deux.

### R2 — `coffre.ts` s'extrait dans `packages/coffre`

`chiffrer`, `dechiffrer`, `lireCleMaitresse`, `Scelle`, `Ouverture`,
`CleMaitresse` déménagent de `apps/collector/src/coffre.ts` vers un nouveau
paquet partagé, sur le modèle de `packages/core`/`packages/db`. Le collector
et le relais en dépendent tous deux ; ni l'un ni l'autre ne dépend de l'autre.
`jetonDe` **reste dans le collector** : lui seul lit `connexion_secret`, et
c'est le seul consommateur à l'avoir jamais fait — le relais, lui, **écrit**,
il ne lit jamais de secret existant.

### R3 — Le `state` signé porte l'identité et empêche la falsification

Sans lui, un tiers pourrait appeler un rappel avec un `owner_id` arbitraire et
lui faire porter une connexion. `state` transporte `{ ownerId, plateforme,
exp }`, encodé puis signé HMAC-SHA256 avec une clé dédiée
(`PROSPEO_OAUTH_STATE_SECRET`, nouvelle, propre au relais). Chaque rappel
vérifie la signature et l'expiration **avant** toute écriture — même famille
de rigueur que le coffre lui-même, et testable sans réseau ni base.

*Pourquoi une expiration courte (quelques minutes) :* un lien d'entrée n'a pas
vocation à être réutilisable ; le limiter dans le temps réduit la fenêtre où
un lien intercepté resterait utilisable.

### R4 — Trois routes, un rôle chacune

- `GET /api/connecter?plateforme=github|vercel&owner=<uuid>` — vérifie que
  `owner` désigne un utilisateur réel (lecture Supabase, `service_role`),
  signe le `state`, redirige vers GitHub ou Vercel.
- `GET /api/github/callback` — reçoit `installation_id`, `setup_action`,
  `state`. Vérifie le `state`. Si `setup_action === 'install'`, interroge
  l'API GitHub (JWT signé par la clé privée de l'App) pour le libellé du
  compte installé, puis écrit `connexion_plateforme` (`reference =
  installation_id`, rien à chiffrer — §2 de l'étape 2 le justifie déjà).
- `GET /api/vercel/callback` — reçoit `code`, `state`, `teamId` (optionnel).
  Vérifie le `state`. Échange `code` contre un jeton d'accès (API Vercel),
  **chiffre-le** avec `chiffrer()` (R2), écrit `connexion_plateforme` +
  `connexion_secret`.

Chaque rappel répond par une page HTML minimale (« Connecté — vous pouvez
fermer cet onglet » / « Échec : …, réessayez ») — pas de redirection vers le
dashboard, qui ne montre encore aucun écran de connexions.

### R5 — Un échec de vérification ne s'affiche jamais en détail à l'appelant

Un `state` invalide, expiré, ou un échange de code qui échoue rend une page
d'échec **générique** au navigateur, mais consigne la raison précise côté
serveur (les journaux du déploiement Vercel). Distinguer les deux évite qu'un
message d'erreur devienne un outil de reconnaissance pour qui tenterait de
falsifier un appel.

---

## 4. Secrets nouveaux, et où ils vivent

Tous nouveaux, tous propres à l'environnement du **relais** (projet Vercel
`prospeo-relais-oauth`) — aucun ne rejoint `.env.example` du collector, sauf
mention contraire :

| Variable | Rôle | Vit dans |
|---|---|---|
| `PROSPEO_GITHUB_APP_ID` | identifie l'App auprès de GitHub | relais |
| `PROSPEO_GITHUB_APP_PRIVATE_KEY` | signe le JWT d'installation | relais |
| `PROSPEO_VERCEL_OAUTH_CLIENT_ID` | identifie l'intégration auprès de Vercel | relais |
| `PROSPEO_VERCEL_OAUTH_CLIENT_SECRET` | échange le code contre un jeton | relais |
| `PROSPEO_OAUTH_STATE_SECRET` | signe/vérifie le `state` (R3) | relais |
| `PROSPEO_COFFRE_CLE` | chiffre le jeton Vercel (R2) | relais **et** collector (même valeur, deux environnements) |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` | écrit `connexion_plateforme`/`connexion_secret` | relais **et** collector (déjà présents côté collector) |

`PROSPEO_GITHUB_APP_PRIVATE_KEY` est un PEM multi-lignes ; le format exact de
son stockage (base64, ou tel quel si l'environnement Vercel le permet) se
tranche à l'implémentation (§6).

---

## 5. Tests

| Unité | Ce qu'on prouve |
|---|---|
| `state` (signature/vérification) | aller-retour, signature invalide refusée, expiration refusée — pur, sans réseau ni base, même famille que `coffre.ts` |
| `api/vercel/callback` | l'échange de code est mocké (comme `sources/vercel.ts` le fait déjà côté collector) ; le jeton reçu est bien chiffré avant écriture, jamais en clair dans un journal |
| `api/github/callback` | l'appel JWT/API GitHub est mocké (comme `sources/github.ts`) ; `reference` reçoit l'`installation_id`, jamais chiffré |

**Ce qu'aucun test ne peut prouver : le vrai clic.** Un flux OAuth complet
suppose une vraie interaction avec GitHub ou Vercel — la preuve finale est
**manuelle**, faite une fois par le propriétaire, consignée dans
`HANDOFF.md` comme à l'étape 2.

---

## 6. Points à trancher à l'implémentation

1. **L'encodage de `PROSPEO_GITHUB_APP_PRIVATE_KEY`** dans un environnement
   Vercel (PEM tel quel si les sauts de ligne sont préservés, sinon base64
   décodé au démarrage).
2. **La bibliothèque de signature JWT** pour l'échange App-vers-API GitHub
   (peu de dépendances neuves désirables — à choisir au plan).
3. **Le nom exact des tables/colonnes déjà existantes** (`connexion_plateforme
   .compte_libelle`) à remplir depuis l'API GitHub/Vercel — quel champ de leur
   réponse respective sert de libellé lisible.
4. **La durée d'expiration du `state`** (proposition : 10 minutes, à confirmer
   au plan).
