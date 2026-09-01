# Chantier n°4 — La chaîne de vente : du prospect au site déployé

**État :** plan, non implémenté. Écrit le 1er septembre 2026, après l'achèvement
du socle, de l'enrichissement et de la calibration sur Nantes.

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

Population cible actuelle : **22 prospects qualifiés**, dont 3 dont le site
existe mais ne répond plus. Un volume qui tient dans une session de travail,
donc éprouvable de bout en bout avant d'être élargi.

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

**Rien ne part automatiquement.** Le système rédige, l'humain envoie. Règle du
socle reprise telle quelle, avec ici une seconde raison : l'envoi de courriels
et de SMS de prospection en France est encadré, et ce qui est permis en B2B
dépend du canal. Tant que ce point n'est pas tranché, la chaîne s'arrête à la
production du texte.

**Tout étage est borné et idempotent.** Comme `enrich`, `probe` et `domains` :
un `--limit` réellement appliqué, un rejeu qui ne refait pas ce qui est fait,
un décompte des échecs qui décide du code de sortie.

**Tout ce qui coûte est compté et affiché.** Un dépôt GitHub, un projet Vercel
et une génération LLM ont un coût unitaire faible et un coût cumulé réel. Le
run doit dire ce qu'il a dépensé, comme `enrich` annonce ses pages Google.

---

## 5. Ordre de livraison — la tranche verticale d'abord

L'urgence commande de **prouver la chaîne entière sur un seul prospect** avant
de soigner chacun de ses maillons. Un site laid mais déployé, au contenu
adapté, dont l'email cite l'URL, vaut mieux que quatre étages parfaits qui ne
se parlent pas encore.

1. **Tâche 0** — le site générique minimal, contenu externalisé.
2. **Tâche 1** — le contrat de contenu et l'assemblage des faits.
3. **Tâche 2** — l'étage `generate` (LLM).
4. **Tâche 3** — l'étage `publish` (GitHub).
5. **Tâche 4** — l'étage `deploy` (Vercel).
6. **JALON** — la chaîne complète sur UN prospect, vérifiée à l'œil.
7. **Tâche 5** — l'étage `pitch` (email et SMS).
8. **Tâche 6** — le passage aux 22, et la revue depuis le dashboard.

Les tâches 3 et 4 s'écrivent contre un modèle bidon, en parallèle de la
tâche 0. Les tâches 1 et 2 en dépendent réellement.

---

## 6. Les tâches

### Tâche 0 — Le site générique

**Ce n'est pas une tâche d'intégration, c'est du travail de conception.** Sans
elle, tout le reste génère du vide.

- Un site vitrine d'artisan, mobile d'abord, sobre et rapide.
- **Aucune chaîne rédigée dans le code.** Tout le contenu vit dans un fichier
  unique, dont la forme est le contrat de la tâche 1.
- Les sections dictent les champs : identité, métier, zone d'intervention,
  prestations, contact, mentions légales.
- Le déploiement Vercel doit être trivial et le site doit vivre sans base de
  données.

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
- **API Batches** à considérer pour le volume : la génération n'est pas
  sensible à la latence et le lot tient dans une nuit, à moitié prix.
- `prompt_version` porté dans les données, comme `MATCHING_CONFIG.version` et
  le barème : un changement de consignes doit être traçable.

**Le prompt énonce l'interdiction d'inventer ET la liste close des faits
disponibles.** Un modèle à qui l'on ne dit pas ce qu'il ignore comble les
trous : c'est son métier.

### Tâche 3 — L'étage `publish` (GitHub)

- Un dépôt modèle marqué *template*, et un dépôt par prospect créé par
  `POST /repos/{owner}/{repo}/generate`.
- Écriture du seul fichier de contenu par-dessus.
- Nommage déterministe et idempotent : rejouer ne crée pas un second dépôt.
- `GITHUB_TOKEN` dans `.env`, jamais dans une variable `VITE_`.

### Tâche 4 — L'étage `deploy` (Vercel)

- Un projet Vercel par dépôt, un déploiement, une URL récupérée et stockée.
- Idempotent : un prospect déjà déployé se met à jour, il ne se duplique pas.
- L'URL est une donnée de vente : elle appartient à la base, pas aux journaux.

### Tâche 5 — L'étage `pitch` (email et SMS)

- Réutilise `generated_message`, qui attend un écrivain depuis le socle
  (`prospect_id`, `channel`, `model`, `prompt_version`, `content`).
- Trois canaux, comme le prévoit la spec §10 : **email**, **SMS**, et le script
  d'appel déjà prévu.
- Le SMS est contraint par sa longueur : c'est une contrainte de rédaction à
  passer au modèle, pas une troncature appliquée après coup.
- Le message cite **l'URL déployée** et, quand `domains` l'a trouvé, **le nom de
  domaine libre**. « J'ai vérifié, serrurier-untel.fr est libre, et voici à quoi
  ressemblerait votre site » est l'argumentaire le plus concret possible.
- L'index sur `generated_message.prospect_id`, différé du socle au motif qu'une
  table sans écrivain n'a pas besoin d'index, **part avec cette tâche**.

### Tâche 6 — L'échelle et la revue

- Sélection des prospects par score, `--limit` appliqué.
- Affichage dans le dashboard : contenu généré, URL déployée, messages, et de
  quoi rejeter une génération.
- Un état de pipeline par prospect — `prospect_pipeline` et `interaction`
  attendent elles aussi leur premier écrivain.

---

## 7. Les décisions à trancher avant d'écrire du code

1. **Le métier du site générique.** La demande dit « serrurier », mais la base
   ne contient aujourd'hui que des plombiers. Site plombier d'abord, ou site
   serrurier puis `discover --trade serrurier` ?
2. **La technologie du site.** Astro, Vite statique, autre chose.
3. **Un dépôt par prospect, ou un dépôt unique multi-sites ?** Vingt-deux dépôts
   sont anodins ; quatre cent vingt le sont moins.
4. **Les comptes GitHub et Vercel.** Personnels ou dédiés ? Les sites porteront
   le nom d'entreprises réelles.
5. **Le sort d'un site après un refus.** Un site déployé au nom d'une entreprise
   qui n'en veut pas doit-il être dépublié, et sous quel délai ?
6. **L'envoi.** Le plan s'arrête à la production du texte. Automatiser l'envoi
   en France demande de vérifier ce qui est permis par canal en B2B, et d'y
   ajouter identification de l'expéditeur et mécanisme d'opposition. Décision
   de l'utilisateur, pas décision d'implémentation.

---

## 8. Ce qui n'est pas dans ce chantier

- L'envoi effectif des messages.
- Un nom de domaine acheté et raccordé — `domains` dit qu'il est libre, il ne
  le réserve pas.
- Le multi-utilisateur.
- La reprise du site par l'artisan : transfert de dépôt, facturation.
