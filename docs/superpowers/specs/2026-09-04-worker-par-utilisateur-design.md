# Le worker par utilisateur (D8) et son superviseur — décisions

**Date :** 2026-09-04
**Statut :** approuvé, prêt pour le plan d'implémentation
**Portée :** chantier n°8, étape suivant le relais OAuth — point 3 de l'ordre
fixé par `docs/superpowers/specs/2026-09-03-multi-utilisateur-design.md`, §7.

---

## 1. Où ça commence

Le terrain est plus préparé qu'il n'y paraît :

- `apps/collector/src/cli.ts`, commande `worker --owner <uuid>`, filtre déjà
  `campaign_job` sur `requested_by = <proprietaire>` — le cloisonnement par
  worker existe.
- `apps/collector/src/coffre.ts` porte `jetonDe()` (déchiffrement du jeton
  Vercel) et `apps/collector/src/config.ts` porte `loadCoffreConfig()`,
  écrits et testés à l'étape 2 (coffre-jetons) — **mais sans aucun
  appelant**. `chaineDeps.publier()`/`.deployer()` (`apps/collector/src/
  chaine.ts`) lisent toujours `GITHUB_TOKEN`/`VERCEL_TOKEN`/
  `PROSPEO_GITHUB_ORG`/`PROSPEO_VERCEL_TEAM` du `.env` global, comme avant
  le chantier n°8.

C'est cette étape qui branche enfin ces jetons — et en le faisant, elle
expose un bug qui dormait sans appelant pour le révéler.

## 2. Le bug trouvé pendant le brainstorming

`jetonDe()` a été écrit avant que l'étape 3 (relais OAuth) ne tranche que
**GitHub ne stocke aucun secret chiffré** : `connexion_plateforme.reference`
porte l'`installation_id` en clair, délibérément — *« sans la clé privée de
l'App […], il ne donne rien »* (commentaire du plan de l'étape 2). Appeler
`jetonDe(..., 'github')` tel quel ferait lire un `connexion_secret` absent
par construction, et `dechiffrer` sur une valeur `null` répondrait
`{ ouvert: false, motif: 'altere' }` — la fonction marquerait alors à tort
une connexion GitHub saine comme `indechiffrable`.

**Cause réelle :** une GitHub App ne fonctionne pas comme une intégration
Vercel. Il n'y a rien à déchiffrer — il faut fabriquer un jeton
d'installation à la demande (`POST /app/installations/{id}/access_tokens`,
valable une heure), signé par la clé privée de l'App. `apps/relais-oauth/
src/github.ts` sait déjà signer ce JWT (`signerJwtApp`), mais seulement pour
lire une installation pendant le callback — pas pour fabriquer un jeton
d'accès.

## 3. Décisions

### V1 — `jetonDe()` reste réservé à Vercel, une nouvelle fonction sert GitHub

`jetonDe()` ne change pas : c'est son vrai contrat (un secret chiffré,
statique, à déchiffrer). Une fonction sœur, `jetonInstallationGithub()`,
prend en charge GitHub :

1. lit la connexion active (`lireConnexion(proprietaire, 'github')`) ;
2. si `etat !== 'active'`, rend `{ jeton: null, etat }` — même forme que
   `jetonDe()` ;
3. sinon, fabrique un jeton d'installation frais à partir de `reference` (
   l'`installation_id`) via un JWT d'App signé à la volée ;
4. si GitHub refuse (installation suspendue ou supprimée : `404`/`401`),
   marque la connexion `revoquee` **avant** de rendre — même discipline que
   `jetonDe()` sur un secret indéchiffrable — et rend `{ jeton: null, etat:
   'revoquee' }` ;
5. sinon, rend `{ jeton }`.

Le jeton d'installation n'est **jamais stocké** : il est fabriqué à chaque
appel et expire de lui-même après une heure. Rien de nouveau à chiffrer,
rien de nouveau à faire tourner (péremption).

### V2 — Les secrets de l'App GitHub se dupliquent dans l'environnement du collector

`PROSPEO_GITHUB_APP_ID` et `PROSPEO_GITHUB_APP_PRIVATE_KEY` vivent
aujourd'hui seulement dans l'environnement du relais. Le worker en a besoin
pour fabriquer ses propres jetons d'installation. Ce sont les **mêmes**
valeurs, déjà réelles, copiées dans le `.env` du collector — aucune nouvelle
création côté GitHub. Le spec de l'étape 3 avait déjà anticipé ce genre de
duplication pour d'autres secrets : *« une rotation de l'un devra penser aux
deux »* ; cette étape ajoute l'App GitHub à cette liste.

`signerJwtApp` se **duplique** (nouveau fichier `apps/collector/src/
sources/github-app.ts`), sur le principe déjà accepté pour `coffre.ts` dans
le relais à l'étape 3 : une fonction de signature assez petite pour être
recopiée et commentée plutôt que partagée via un paquet, quand aucun des
deux services n'a par ailleurs besoin de dépendre de l'autre.

### V3 — `chaineDeps` résout le jeton et le compte à l'exécution, plus depuis l'environnement

`chaineDeps(client, proprietaire).publier()` et `.deployer()` ne lisent plus
`loadPublishConfig(process.env)`/`loadDeployConfig(process.env)`. À la
place :

1. lisent la connexion active de l'utilisateur pour la plateforme
   concernée ;
2. en tirent le jeton (`jetonInstallationGithub`/`jetonDe`) et le
   `compte_libelle` — qui remplace `PROSPEO_GITHUB_ORG` et
   `PROSPEO_VERCEL_TEAM`, globaux jusqu'ici, par la valeur propre à cet
   utilisateur ;
3. si le jeton manque, lèvent une erreur lisible (« connexion GitHub
   révoquée — reconnecte ton compte », etc.) — elle atterrit dans
   `campaign_job.last_error` exactement comme les autres échecs de la
   chaîne : aucun nouveau mécanisme d'erreur à inventer.

`githubTemplateRepo` (le gabarit, devenu public à l'étape D6) reste lu
depuis l'environnement : il n'appartient à personne en particulier, c'est
la seule valeur de l'ancien `PublishConfig` qui reste globale.

### V4 — Une table sœur de battement, une ligne par utilisateur

`worker_heartbeat` est un singleton (`id boolean primary key`) : on ne le
modifie ni ne le supprime, la doctrine l'interdit. Nouvelle table :

```sql
create table worker_heartbeat_utilisateur (
  owner_id  uuid primary key references auth.users (id),
  beat_at   timestamptz not null,
  in_flight integer not null default 0
);

create policy proprietaire_seul on worker_heartbeat_utilisateur
  for select to authenticated using (owner_id = (select auth.uid()));
```

La colonne `version` de l'ancienne table ne se reconduit pas : elle n'est ni
lue ni écrite nulle part, y compris dans l'ancienne table — la porter dans
la nouvelle serait reconduire une pièce déjà morte.

**Pas de ligne d'amorçage.** L'ancienne table en avait besoin (une date
volontairement ancienne) parce qu'elle est un singleton toujours interrogé
par `id = true` : une ligne devait exister pour être lue comme « à
l'arrêt ». Ici, un utilisateur qui n'a jamais eu de worker démarré n'a
simplement **pas de ligne** — la lecture honnête : « jamais démarré »
diffère de « démarré puis silencieux », deux absences de nature différente
(doctrine du dépôt). Le dashboard (`fetchHeartbeat`,
`apps/dashboard/src/data/campagne.ts`) traite déjà `null` comme « à
l'arrêt » — aucun changement de ce comportement, seulement du filtre :
`.from('worker_heartbeat_utilisateur').eq('owner_id', <utilisateur
courant>)` au lieu de `.from('worker_heartbeat').eq('id', true)`.

### V5 — Le superviseur : découverte, démarrage, arrêt, surveillance

Nouveau fichier `apps/collector/src/superviseur.ts`, nouvelle commande CLI
`superviseur` — **sans** `--owner` : elle sert tout le monde, à la
différence de toutes les autres commandes du collector.

**Découverte**, toutes les 60 s : les `owner_id` dont **les deux**
connexions (`github` et `vercel`) sont `active` dans
`connexion_plateforme`. Un utilisateur qui révoque l'une des deux disparaît
de la liste au balayage suivant.

**Démarrage** : pour chaque `owner_id` éligible sans process en cours,
`child_process.spawn('npx', ['tsx', 'src/cli.ts', 'worker', '--owner', id])`
— la même invocation que le script `start` du collector (il n'y a pas de
build : `tsx` exécute le TypeScript directement) —, stdout/stderr redirigés
vers un fichier de log nommé par utilisateur.

**Arrêt** : pour chaque process en cours dont l'`owner_id` n'est plus
éligible, `SIGTERM` — le worker gère déjà l'arrêt propre (il finit le job
en cours avant de sortir), rien à y changer.

**Surveillance**, le même double mécanisme que `worker` applique déjà à sa
propre file (Realtime + balayage de secours, `apps/collector/src/cli.ts`) :

- **signal principal** — l'événement `exit` du process enfant déclenche un
  redémarrage immédiat, avec un recul exponentiel (5 s, 10 s, 20 s, plafond
  60 s) pour ne pas marteler GitHub/Vercel/Supabase si la configuration
  d'un utilisateur fait planter son worker en boucle ; le recul se
  réinitialise après 60 s de fonctionnement sans crash ;
- **filet de sécurité** — le balayage de 60 s relit aussi
  `worker_heartbeat_utilisateur` : un `beat_at` vieux de plus de 90 s pour
  un process que le superviseur croit vivant signale un worker bloqué sans
  avoir crashé (le worker ne se protège pas contre un appel réseau qui ne
  rendrait jamais la main) — le superviseur le tue (`SIGKILL`) puis le
  relance.

**Arrêt du superviseur** : `SIGINT`/`SIGTERM` envoie `SIGTERM` à tous les
enfants et attend leur sortie avant de rendre la main — même logique que
`worker` attendant ses jobs en cours.

**Assemblage** : le superviseur lit sa configuration et construit son
client Supabase exactement comme `worker` (`loadConfig(process.env)`,
`createClient`, la clé `SUPABASE_SERVICE_ROLE_KEY`) — même privilège, pour
la même raison : lire `connexion_plateforme` de tous les utilisateurs pour
la découverte n'est possible qu'en contournant la RLS, comme le collector
le fait déjà pour tout le reste.

**Testabilité** : la logique de décision (qui démarrer, qui arrêter, quand
redémarrer, quand déclarer un process bloqué) se sépare de l'exécution
réelle des process, sur le modèle déjà en place pour `FileDeps`/`ChaineDeps`
— une interface qui expose `demarrer(ownerId)`, `arreter(ownerId)`,
`estVivant(ownerId)` en dépendance injectée, testée avec de faux process en
mémoire. Le vrai `child_process.spawn` reste le seul point d'assemblage non
testé par des tests unitaires, comme `createClient`/`createGithubClient`
aujourd'hui.

## 4. Hors périmètre, explicitement

- **L'hébergement réel** du superviseur (VPS, service de conteneurs
  managé, ou autre). Un superviseur à base de `child_process` fonctionne à
  l'identique quel que soit l'hôte — un chiffrage réel (Fly.io : environ
  2 à 3 $/mois par utilisateur pour un process léger toujours allumé, VPS :
  coût fixe pour plusieurs dizaines de process, isolement plus faible) a
  été fait pendant le brainstorming mais **la décision d'hébergement est
  reportée**, avec de vrais tarifs clients en main.
- **La péremption (D10)** — un processus distinct, à l'application, qui lit
  le coffre pour un utilisateur qui a disparu. Cette étape ne le construit
  pas ; le worker par utilisateur ne le remplace pas (§6 bis du spec
  multi-utilisateur : les deux exécutants sont nécessaires, pas l'un à la
  place de l'autre).
- **La seconde file et l'enrichissement par tranches (D7/D4)**, **Google et
  l'envoi (D3, Gmail)** — étapes suivantes de l'ordre du §7 du spec
  multi-utilisateur.
- **Aucun nouvel écran dashboard.** Seul `fetchHeartbeat` est rebranché sur
  la nouvelle table ; l'écran de campagne existant continue d'afficher la
  même chose, pour le bon utilisateur.

## 5. Ce que ça casse, ou pas

| | |
|---|---|
| `worker_heartbeat` (l'ancienne table) | Ne change pas, ne se supprime pas. Devient morte pour le worker de campagne ; reste disponible pour un usage futur (D10, ou un diagnostic global), comme le spec multi-utilisateur l'avait envisagé. |
| `GITHUB_TOKEN`/`VERCEL_TOKEN`/`PROSPEO_GITHUB_ORG`/`PROSPEO_VERCEL_TEAM` du `.env` | Ne sont plus lus par `chaineDeps`. Restent définis dans `config.ts` (`loadPublishConfig`/`loadDeployConfig`) pour l'instant : les retirer est un ménage séparé, hors du périmètre de cette étape. |
| Le contrat de `jetonDe()` | Ne change pas — Vercel seulement, comme conçu à l'étape 2. |
| La commande `worker --owner <uuid>` | Ne change pas dans sa forme d'appel ; son contenu interne (résolution des jetons) change (V3). Elle reste utilisable seule, à la main, comme aujourd'hui — le superviseur ne fait que l'appeler en boucle. |
