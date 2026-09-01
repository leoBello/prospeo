# Chantier n°4 — La chaîne de vente : du prospect au site déployé

**État :** plan arrêté, décisions tranchées, non implémenté. Écrit le
1er septembre 2026, après l'achèvement du socle, de l'enrichissement et de la
calibration sur Nantes.

---

## 1. Pourquoi maintenant, et pas avant

La spec du socle plaçait explicitement hors périmètre « la génération de sites
vitrines, l'import de template GitHub, l'adaptation des fichiers i18n par LLM,
le déploiement Vercel ». Sa justification :

> Tant qu'on ne sait pas quels champs sortent réellement du terrain, concevoir
> la fabrique de sites revient à deviner les entrées de la génération. Le socle
> produit cette information.

**Cette condition est remplie.** La base contient 139 prospects nantais, et on
sait désormais, pour chacun, ce qui sort réellement du terrain : dénomination,
enseigne, adresse, téléphone normalisé, note Google et nombre d'avis, catégorie
de présence web, disponibilité d'un nom de domaine. On sait aussi ce qui n'en
sort **pas** — et c'est cette liste-là qui contraint la génération.

Population cible : **22 prospects qualifiés**, dont 3 dont le site existe mais
ne répond plus.

---

## 2. Ce que la chaîne doit produire

Pour un prospect retenu, dans l'ordre :

1. Un dépôt GitHub contenant un site vitrine, dérivé d'un modèle générique.
2. Un contenu adapté à cette entreprise, rédigé par un modèle de langage.
3. Un déploiement Vercel, joignable par une URL.
4. Un email et un SMS de proposition commerciale, citant cette URL.

L'artisan reçoit donc un message qui dit : « voici votre site, en ligne,
regardez-le » — pas une promesse, une démonstration.

---

## 3. La décision d'architecture qui rend ce chantier tenable

**Le modèle de langage ne touche jamais au code. Il ne produit qu'un fichier
de contenu, validé contre un schéma.**

Ce n'est pas un raffinement : c'est ce qui sépare un chantier faisable d'un
chantier ingouvernable. Conséquences :

- **Aucune génération ne peut casser un build.** Le code du site est écrit une
  fois, à la main, et testé. Ce qui varie d'un prospect à l'autre est un objet
  dont la forme est contrainte.
- **Aucune génération ne peut introduire de code arbitraire** dans un dépôt qui
  portera le nom d'une entreprise réelle.
- **Le rejeu est gratuit.** Régénérer le contenu d'un prospect ne demande pas
  de reconstruire un site.
- **La revue humaine reste possible.** Relire un objet de trente champs prend
  une minute ; relire un site généré, non.

La spec du socle avait posé cette direction en imposant l'i18n au dashboard :
« externaliser les textes dès le départ est presque gratuit […] la discipline
sert accessoirement à valider le format qu'on emploiera pour les sites
générés ». Ce chantier encaisse cet investissement.

---

## 4. Les garde-fous, hérités du socle et non négociables

**Le modèle ne reçoit que des faits vérifiés issus de la base, et le prompt lui
interdit d'en inventer.** La règle existe déjà pour les messages de prospection
(spec du socle, §10) ; elle vaut **doublement** pour un site vitrine. Un
message contenant un détail inventé se retourne contre l'appelant dans les
premières secondes ; un SITE qui annonce « 20 ans d'expérience » ou
« intervention en 30 minutes » quand personne ne le sait engage la réputation
de l'artisan et la nôtre. Ce que la base ignore ne doit apparaître nulle part.

**Rien ne part automatiquement.** Le système rédige, l'humain envoie. Voir la
décision D6.

**Tout étage est borné et idempotent.** Comme `enrich`, `probe` et `domains` :
un `--limit` réellement appliqué, un rejeu qui ne refait pas ce qui est fait,
un décompte des échecs qui décide du code de sortie.

**Tout ce qui coûte est compté et affiché.** Un dépôt GitHub, un projet Vercel
et une génération LLM ont un coût unitaire faible et un coût cumulé réel. Le
run doit dire ce qu'il a dépensé, comme `enrich` annonce ses pages Google.

---

## 5. Décisions tranchées

Sept points arrêtés avec l'utilisateur le 1er septembre 2026. **Ils ne sont pas
à rediscuter** ; les rouvrir demande une raison neuve, pas une préférence.

### D1 — Le site est neutre en métier, éprouvé sur le plombier

Le métier est un **champ de contenu**, pas une structure : identité,
prestations, zone d'intervention sont les mêmes sections pour un plombier et un
serrurier. Le site est donc construit sans métier câblé, et éprouvé sur les 22
plombiers déjà qualifiés.

*Pourquoi :* la demande initiale portait sur le serrurier, mais la base n'en
contient aucun. Construire pour le serrurier imposait deux heures de collecte
Google avant d'avoir la moindre cible. Avec un site neutre, le serrurier ne
coûtera qu'un `discover` + `enrich`, sans retoucher une ligne du site.

### D2 — Astro

*Pourquoi :* zéro JavaScript par défaut, donc un site instantané sur mobile —
là où se trouvent les clients de l'artisan. SEO natif, qui est la raison d'être
d'une vitrine. Déploiement Vercel trivial. Ses collections de contenu épousent
exactement le fichier JSON généré. Vite + React aurait expédié un runtime pour
une page sans interactivité.

### D3 — Un dépôt GitHub par prospect

*Pourquoi :* c'est l'actif de l'artisan, et on peut lui en transférer la
propriété le jour où il achète. L'intégration git de Vercel est par dépôt. Une
génération ratée n'affecte qu'un site. Vingt-deux dépôts ne sont rien ; à
l'échelle de Nantes on en générerait environ 67, puisqu'on ne génère que pour
les qualifiés.

### D4 — Organisation GitHub et compte Vercel dédiés

*Pourquoi :* les dépôts portent le nom d'entreprises réelles ; les mêler aux
projets personnels complique le transfert et brouille tout. Une organisation
GitHub est gratuite. Un jeton limité à elle ne peut pas toucher aux dépôts
personnels s'il fuit.

### D5 — Dépublication immédiate sur refus, péremption à 90 jours sinon

Sur passage à `ne_pas_contacter` ou `perdu`, le site est dépublié sans délai.
Tout site resté sans réponse expire seul au bout de 90 jours.

*Pourquoi :* la spec du socle dit déjà que le statut « ne pas contacter » est
« respecté immédiatement et définitivement » — la même doctrine s'applique à un
site publié au nom de l'entreprise. Un site portant le nom d'un tiers, publié
sans son accord, ne doit pas vivre indéfiniment sans surveillance. Effet de
bord utile : le nombre de projets Vercel reste borné.

### D6 — Le système rédige, l'humain envoie

Aucun envoi automatisé, ni email ni SMS.

*Pourquoi :* c'est déjà la règle du socle, et trois raisons s'y ajoutent. Un
domaine neuf qui envoie du courriel froid atterrit en indésirable et brûle sa
réputation. L'envoi automatique supprime le dernier contrôle humain sur un
texte qui nomme une entreprise réelle. Et sur vingt-deux prospects, l'envoi
n'est pas le goulot d'étranglement. Automatiser demanderait par ailleurs de
vérifier ce qui est permis par canal en prospection B2B en France, et d'ajouter
identification de l'expéditeur et mécanisme d'opposition.

### D7 — Les trois sites en panne d'abord

La chaîne est éprouvée sur les 3 prospects `dead_site`, puis ouverte aux 19
`none`.

*Pourquoi :* « votre site ne répond plus, en voici un qui fonctionne » est
l'argumentaire le plus fort du lot. Trois prospects suffisent à éprouver la
chaîne de bout en bout, et l'échec y coûte trois dépôts, pas vingt-deux.

Les trois, par score décroissant :

| prospect | score |
|---|---|
| `SOULEYMANE DOSSO (DOS SERVICES)` | 95 |
| `FRANCK BERNARD (NANTES CHAUFFE-EAU, …)` | 75 |
| `AQUATIO - VINCENT COMBE` | 60 |

---

## 6. Ordre de livraison — la tranche verticale d'abord

L'urgence commande de **prouver la chaîne entière sur un seul prospect** avant
de soigner chacun de ses maillons. Un site laid mais déployé, au contenu
adapté, dont l'email cite l'URL, vaut mieux que quatre étages parfaits qui ne
se parlent pas encore.

1. **Tâche 0** — le site générique minimal, contenu externalisé (Astro).
2. **Tâche 1** — le contrat de contenu et l'assemblage des faits.
3. **Tâche 2** — l'étage `generate` (LLM).
4. **Tâche 3** — l'étage `publish` (GitHub).
5. **Tâche 4** — l'étage `deploy` (Vercel).
6. **JALON** — la chaîne complète sur `SOULEYMANE DOSSO`, vérifiée à l'œil.
7. **Tâche 5** — l'étage `pitch` (email et SMS).
8. **Tâche 6** — la dépublication et la péremption.
9. **Tâche 7** — les 19 restants, et la revue depuis le dashboard.

Les tâches 3 et 4 s'écrivent contre un modèle bidon, en parallèle de la
tâche 0. Les tâches 1 et 2 en dépendent réellement.

---

## 7. Les tâches

### Tâche 0 — Le site générique (Astro)

**Ce n'est pas une tâche d'intégration, c'est du travail de conception.** Sans
elle, tout le reste génère du vide.

- Un site vitrine d'artisan, mobile d'abord, sobre et rapide.
- **Aucune chaîne rédigée dans le code.** Tout le contenu vit dans un fichier
  unique, dont la forme est le contrat de la tâche 1.
- Les sections dictent les champs : identité, métier, zone d'intervention,
  prestations, contact, mentions légales.
- Le site doit vivre sans base de données.

`apps/dashboard` a déjà éprouvé la discipline i18n sur deux locales : son
format de fichier de contenu est le point de départ naturel.

### Tâche 1 — Le contrat de contenu (`packages/core`)

- Un schéma `zod` du fichier de contenu : c'est lui que le modèle remplira, et
  lui qui validera sa réponse.
- Une fonction pure qui assemble, pour un prospect, **les seuls faits vérifiés**
  disponibles. Elle est le garde-fou technique de la règle « pas d'invention » :
  ce qu'elle ne renvoie pas ne peut pas atteindre le prompt.
- Une distinction explicite entre champs **obligatoires** (nom, métier, ville,
  téléphone) et **facultatifs** (note Google, avis, domaine libre). Un champ
  facultatif absent produit une section absente, jamais une phrase creuse.

Pur, hors ligne, testable — donc testé en premier.

### Tâche 2 — L'étage `generate`

- SDK officiel `@anthropic-ai/sdk`, modèle `claude-opus-4-8`.
- `thinking: {type: "adaptive"}` — la tâche demande du jugement rédactionnel.
- **Sorties structurées** (`output_config.format`) contre le schéma de la
  tâche 1. Une réponse qui ne valide pas est un échec franc, pas un contenu
  approximatif qu'on rattrape à la main.
- **Mise en cache du préfixe** : le contenu générique et les consignes sont
  identiques d'un prospect à l'autre et forment l'essentiel des jetons
  d'entrée. Ils vont avant le dernier point de césure, les faits du prospect
  après.
- **API Batches** à considérer au-delà du premier lot : la génération n'est pas
  sensible à la latence, et le traitement asynchrone coûte moitié moins.
- `prompt_version` porté dans les données, comme `MATCHING_CONFIG.version` et
  le barème : un changement de consignes doit être traçable.

**Le prompt énonce l'interdiction d'inventer ET la liste close des faits
disponibles.** Un modèle à qui l'on ne dit pas ce qu'il ignore comble les
trous : c'est son métier.

### Tâche 3 — L'étage `publish` (GitHub)

- Un dépôt modèle marqué *template* dans l'organisation dédiée, et un dépôt par
  prospect créé par `POST /repos/{owner}/{repo}/generate`.
- Écriture du seul fichier de contenu par-dessus.
- Nommage déterministe et idempotent : rejouer ne crée pas un second dépôt.
- `GITHUB_TOKEN` dans `.env`, portée limitée à l'organisation, jamais dans une
  variable `VITE_`.

### Tâche 4 — L'étage `deploy` (Vercel)

- Un projet Vercel par dépôt, un déploiement, une URL récupérée et stockée.
- Idempotent : un prospect déjà déployé se met à jour, il ne se duplique pas.
- L'URL est une donnée de vente : elle appartient à la base, pas aux journaux.

### Tâche 5 — L'étage `pitch` (email et SMS)

- Réutilise `generated_message`, qui attend un écrivain depuis le socle
  (`prospect_id`, `channel`, `model`, `prompt_version`, `content`).
- Trois canaux, comme le prévoit la spec §10 : **email**, **SMS**, et le script
  d'appel déjà prévu.
- **Migration nécessaire :** `interaction_kind` vaut aujourd'hui
  `('appel', 'whatsapp', 'email', 'note')` — il n'y a **pas de `sms`**. Le
  journal des échanges ne peut donc pas consigner un SMS envoyé.
- L'index sur `generated_message.prospect_id`, différé du socle au motif qu'une
  table sans écrivain n'a pas besoin d'index, **part avec cette tâche**.
- Le SMS est contraint par sa longueur : c'est une contrainte de rédaction à
  passer au modèle, pas une troncature appliquée après coup.
- Le message cite **l'URL déployée** et, quand `domains` l'a trouvé, **le nom de
  domaine libre**. « J'ai vérifié, serrurier-untel.fr est libre, et voici à quoi
  ressemblerait votre site » est l'argumentaire le plus concret possible.

### Tâche 6 — Dépublication et péremption (D5)

- Sur passage à `ne_pas_contacter` ou `perdu` : dépublication immédiate du
  projet Vercel, et décision explicite sur le sort du dépôt GitHub.
- Péremption automatique à 90 jours pour les sites sans réponse.
- La date de publication doit donc être stockée : c'est elle qui fait courir le
  délai.
- Comme `reconcile` pour les suppressions, cette tâche détruit : elle mérite un
  mode qui montre avant d'agir.

### Tâche 7 — L'échelle et la revue

- Les 19 prospects `none` restants, `--limit` appliqué.
- Affichage dans le dashboard : contenu généré, URL déployée, messages, et de
  quoi rejeter une génération.
- `prospect_pipeline` et `interaction` attendent elles aussi leur premier
  écrivain.

---

## 8. Pour l'agent qui reprend

**Commence par la tâche 0.** C'est le maillon long, et rien ne se teste sans
lui. Les tâches 3 et 4 peuvent avancer en parallèle contre un modèle bidon.

**Ce qu'il faut demander à l'utilisateur avant de pouvoir livrer :**

| secret | pour quoi | où |
|---|---|---|
| `ANTHROPIC_API_KEY` | tâches 2 et 5 | `.env` |
| `GITHUB_TOKEN` | tâche 3 | `.env`, portée = l'organisation dédiée |
| `VERCEL_TOKEN` | tâches 4 et 6 | `.env` |

Il faut aussi le **nom de l'organisation GitHub** et celui du **compte Vercel**
(D4), à créer si ce n'est pas fait.

**Aucun de ces secrets ne doit apparaître dans une variable préfixée `VITE_`**,
qui part dans le bundle public du dashboard.

**Demande son accord avant toute sortie réseau.** C'est la règle de travail
établie avec cet utilisateur, et elle vaut ici pour l'API Anthropic, GitHub et
Vercel comme elle valait pour Google.

**Les conventions du dépôt s'appliquent :** TDD, commentaires en français
expliquant le POURQUOI, tests qui documentent une décision, messages de commit
citant le décompte de tests verts. Lis `packages/core/src/name-match.ts` pour
le niveau attendu.

---

## 9. Ce qui n'est pas dans ce chantier

- L'envoi effectif des messages (D6).
- Un nom de domaine acheté et raccordé — `domains` dit qu'il est libre, il ne
  le réserve pas.
- Le multi-utilisateur.
- La reprise du site par l'artisan : transfert de dépôt, facturation.
- Le métier `serrurier`, qui ne coûtera qu'un `discover` + `enrich` une fois le
  site neutre en place (D1).
