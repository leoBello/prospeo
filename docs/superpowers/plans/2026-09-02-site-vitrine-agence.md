# Chantier n°5 — Le gabarit de site, niveau agence

> Document de référence. Les décisions D1 à D10 sont **prises** : elles portent
> leur raison avec elles. Ne les rouvre pas sans raison neuve — une préférence
> n'en est pas une.

---

## 1. Le constat qui ouvre ce chantier

Le premier site généré est en ligne : <https://dos-services-51000900400035.vercel.app>.
Il pèse 10 305 octets, tient en un fichier, ne charge aucun script — et il est
**vide**. Pas d'image, aucune animation, et un lien « voir sur la carte » là où
on attend une carte.

Ce n'était pas un accident : le chantier n°4 avait retenu « Astro, zéro JS par
défaut » et s'était concentré sur la chaîne — générer, publier, déployer,
écrire le message. La chaîne fonctionne de bout en bout. Ce qu'elle transporte
ne convainc personne.

**L'objectif de ce chantier :** un gabarit complet, illustré et animé, de
niveau agence, dont chaque prospect ne reçoit qu'une **variante légère**.

---

## 2. Le principe économique, qui gouverne tout le reste

Le modèle de langage ne fabrique pas un site. Il **choisit une variante** d'un
site déjà fait.

```
   LE GABARIT                        LA VARIANTE (par prospect)
   ~2 500 lignes, 15 images          ~10 champs courts
   écrit UNE fois par un agent       produit par le modèle, ~4 ¢
   copié tel quel dans 22 dépôts     injecté dans site.json
```

Tout ce qui est cher — la mise en page, les animations, les images, la carte,
le CSS — est écrit **une seule fois** et voyage par la copie de dépôt modèle
que `publish` fait déjà (`POST /repos/{owner}/{repo}/generate`). Le modèle ne
produit que ce qui doit différer d'un artisan à l'autre.

C'est l'architecture actuelle, poussée d'un cran. La règle du chantier n°4 ne
bouge pas d'un pouce :

> **Le modèle de langage ne touche jamais au code. Il ne produit qu'un fichier
> de contenu, validé contre un schéma `zod`.**

---

## 3. L'état mesuré de la base — 2 septembre 2026

Mesuré, pas supposé. Ces chiffres décident de ce que le gabarit peut afficher.

| Donnée | Couverture | Ce que ça impose |
|---|---|---|
| Coordonnées `lat`/`lon` | **139 / 139** | la carte marche pour tout le monde |
| Note Google | **30 / 139** | la section avis doit s'effacer pour 109 |
| Lien Maps | 39 / 139 | le lien « voir la fiche » est conditionnel |
| Téléphone | requis par `assembleFacts` | l'appel est le seul CTA sûr |
| Année de création | quasi totale | « depuis 2009 » est l'argument le plus fort |
| `review_count` | **0 / 139** | Google ne le publie plus. N'existe pas. |
| `social_urls` | **0 / 139** | aucune section réseaux sociaux |
| Métier | **139 plombiers, 0 serrurier** | un seul gabarit à faire |

**La dégradation n'est pas un cas limite, c'est le cas courant.** Un gabarit
qui suppose une note affiche un trou sur 109 sites sur 139.

---

## 4. Les décisions

### D1 — GSAP + ScrollTrigger, et non Framer Motion

Framer Motion réclame React. L'ajouter à un site Astro qui n'a aucun état
interactif coûte une île d'hydratation et ~45 Ko pour de la décoration pure.
GSAP est agnostique du framework, ScrollTrigger est l'outil standard pour
exactement ce rendu, et il s'installe en dépendance locale.

**En dépendance, pas en CDN.** Les 22 dépôts se construisent sur Vercel : un
`<script src="https://cdn...">` ajoute une dépendance d'exécution tierce, une
requête vers un tiers depuis la page d'une entreprise réelle, et une panne
possible qu'aucun de nos tests ne verrait.

**`prefers-reduced-motion` coupe tout.** Non négociable : c'est une exigence
d'accessibilité, et ça tient en une garde autour de l'initialisation.

### D2 — Le zéro-JS tombe. Le `noindex` ne tombe pas.

Le chantier n°4 avait retenu « zéro JS par défaut ». Cette décision-là est
remplacée : les animations et la carte en réclament, chargé en îles
`client:visible`.

**Ce qui ne change pas, et ne changera pas :**

```html
<meta name="robots" content="noindex, nofollow" />
```

Ces pages portent le nom d'entreprises réelles qui ne les ont pas commandées.
Indexées, elles entreraient en concurrence dans Google avec le vrai site de
l'artisan — ou deviendraient *le* résultat pour son nom. Un test doit tenir
cette balise.

### D3 — Images Unsplash **curées et commitées**, aucune API

Pas d'appel à l'API Unsplash, ni au build ni à l'exécution. On choisit les
images à la main une fois, on les optimise, on les **commite dans le dépôt
modèle**. Elles voyagent alors par la copie de dépôt, comme le reste.

Trois raisons, dans l'ordre d'importance :

1. **Pas de clé.** Une clé Unsplash devrait atteindre 22 projets Vercel, et
   `.env.example` interdit déjà tout secret côté public.
2. **Pas de fetch au build.** 22 dépôts × N images à chaque déploiement, avec
   les limites de débit et les pannes que ça implique.
3. **Des builds instantanés** et des pages rapides.

**Règle sur les sujets — celle-ci compte.** Chantiers, outils, matériaux,
intérieurs, matière. **Pas de visage reconnaissable présenté comme
l'équipe** : les autorisations de modèle ne sont pas garanties sur Unsplash, et
une photo d'inconnu légendée « notre équipe » sur le site d'une entreprise
réelle est un problème pour deux personnes à la fois.

*Piste à évaluer en tâche 3 :* le serveur MCP **higgsfield** (`generate_image`)
produit des images sans personne réelle, ce qui referme la question — mais il
demande une authentification et consomme des crédits. À arbitrer avec
l'utilisateur.

### D4 — Carte Leaflet + tuiles OpenStreetMap

Google Maps Embed réclame une clé d'API publique, facture, et pose des cookies
tiers — donc une bannière de consentement sur chaque site. Leaflet + OSM : pas
de clé, pas de cookie marketing, gratuit, et **les 139 prospects ont leurs
coordonnées en base**.

Chargée en `client:visible` : la carte ne se télécharge que si l'on descend
jusqu'à elle.

### D5 — Polices auto-hébergées (`@fontsource-variable`), pas le CDN Google

Le CDN Google Fonts transmet l'IP du visiteur à un tiers — sanctionné en
Allemagne, et inutilement risqué sur la page d'une entreprise qu'on démarche.
Auto-hébergé : une requête de moins, un tiers de moins, et un affichage plus
rapide. Variable, sous-ensemble latin.

### D6 — La variante est un **choix dans des listes closes**

Le modèle ne compose pas une palette : il en **sélectionne** une, comme il
sélectionne déjà des codes de prestation dans `trades.ts`.

```ts
// packages/core/src/site-theme.ts
export const PALETTES = ['ardoise', 'cuivre', 'nuit', 'terracotta', 'foret'] as const;
export const TYPOS    = ['grotesk-serif', 'humanist', 'geometrique'] as const;
export const HEROS    = ['plomberie-01' … 'plomberie-08'] as const;
```

La garantie est **structurelle, pas verbale** : le modèle ne peut pas inventer
une couleur au contraste illisible, ni une police absente du dépôt, ni une
image qui n'existe pas — le schéma rejette. Exactement la doctrine de
`siteRedactionSchema`.

Les palettes sont éprouvées au contraste (WCAG AA) **à l'écriture du gabarit**,
une fois pour toutes.

### D7 — Trois niveaux de contenu, et deux interdits qui restent

L'utilisateur a tranché : du contenu illustratif inventé est acceptable, il
sera ajusté avec le client une fois la vente faite. Le plan le prend au mot,
avec deux exceptions nommées.

| Niveau | Quoi | Règle |
|---|---|---|
| **1 — Faits** | nom, métier, ville, téléphone, année, note, coordonnées | viennent de la base, le modèle n'y touche pas |
| **2 — Illustratif** | photos, étapes du process, FAQ génériques, textes d'ambiance | **libre**, identique sur tous les sites, n'affirme rien de spécifique sur l'entreprise |
| **3 — Interdit** | faux avis nominatifs, certifications, garanties, prix, disponibilité, effectif, ancienneté fausse | rejeté par `verifierCoherence` |

**Pourquoi le niveau 3 tient malgré la consigne générale.** Un faux avis
client nominatif est spécifiquement sanctionné en droit français (pratique
commerciale trompeuse, art. L121-2 du code de la consommation) et il est
attribué à une entreprise identifiable qui n'a rien demandé. Une certification
type RGE ou Qualibat est un titre réglementé : l'afficher à tort engage
l'artisan, pas nous. Et commercialement, c'est le détail qui tue la vente —
un plombier non-RGE qui lit « certifié RGE » sur sa propre page en conclut que
le reste est faux aussi.

**Ce qu'on met à la place, et qui vaut mieux :** la section avis affiche la
**vraie note Google** avec un lien vers la vraie fiche. C'est plus fort qu'un
faux témoignage, et c'est vrai. Elle disparaît pour les 109 prospects sans
note — d'où l'exigence de dégradation.

### D8 — Pas de formulaire de contact qui n'aboutit nulle part

On n'a pas l'adresse e-mail de l'artisan. Un formulaire sur le site d'une
entreprise réelle qui avalerait une vraie demande client est un dommage
concret, causé à quelqu'un qui n'a rien demandé.

Le CTA est **l'appel** — le seul fait vérifié et actionnable dont on dispose.
Si un formulaire est voulu plus tard, il écrit à l'éditeur, et le dit.

### D9 — Un seul métier pour l'instant

139 plombiers, 0 serrurier. `trades.ts` déclare bien `templateRepo` par métier
et `templateRepoFor` fonctionne : le gabarit serrurier se forkera du plombier
le jour où un serrurier entrera en base. Le construire aujourd'hui, c'est
doubler le travail pour zéro prospect.

### D10 — Contrat en **v2**, et régénération de l'unique site existant

`SITE_CONTENT_VERSION` passe à `'v2'` : le bloc `theme` s'ajoute. Un seul
prospect a du contenu aujourd'hui — la migration coûte **un appel, ~4 ¢**.
C'est le meilleur moment possible pour changer le contrat, et il ne se
représentera pas.

---

## 5. Ce que le gabarit doit contenir

Onze sections. Chacune doit **disparaître proprement** quand son fait manque.

| # | Section | Contenu | Si le fait manque |
|---|---|---|---|
| 1 | En-tête collant | nom, téléphone, ancres | — |
| 2 | Héros | image plein cadre, dégradé, titre animé, 2 CTA | — |
| 3 | Bandeau de confiance | ville, année, note | chaque puce tombe seule |
| 4 | Prestations | cartes, icônes, apparition en cascade | 3 minimum garanties |
| 5 | Notre façon de faire | 3 étapes illustrées (**niveau 2**) | jamais |
| 6 | En images | galerie 6 photos + lightbox (**niveau 2**) | jamais |
| 7 | Avis | **vraie note Google** + lien fiche | **section entière absente** (109/139) |
| 8 | Zone d'intervention | **carte Leaflet**, marqueur sur les coordonnées | jamais (139/139) |
| 9 | Questions fréquentes | accordéon, réponses génériques (**niveau 2**) | jamais |
| 10 | Contact | téléphone, adresse, horaires **absents** | pas de formulaire (D8) |
| 11 | Pied + mentions | éditeur, contact de retrait | jamais — §11 conformité |

---

## 6. Les tâches

### Tâche 0 — Lire, mesurer, choisir le parti visuel
Lire ce plan, `2026-09-01-chaine-de-vente.md`, et les §10/§11 du spec du socle.
Rejouer la mesure du §3 plutôt que de la croire. Arrêter une direction visuelle
et la montrer à l'utilisateur **avant** d'écrire 2 000 lignes.
MCP utiles : `mcp__21st__get_inspiration`, `mcp__21st__search` (composants),
`mcp__context7__query-docs` (Astro 7, GSAP, Leaflet).

### Tâche 1 — Le socle
Jetons CSS, 5 palettes éprouvées au contraste, 3 appariements de polices
auto-hébergés, l'initialisation GSAP avec la garde `prefers-reduced-motion`.

### Tâche 2 — Les onze sections
Une par une, chacune avec son test de dégradation.

### Tâche 3 — Les images
Curation, optimisation (AVIF + WebP, plusieurs largeurs), commit. Décider avec
l'utilisateur entre Unsplash curé et higgsfield.

### Tâche 4 — La carte
Leaflet en île `client:visible`, coordonnées depuis les faits.

### Tâche 5 — Le contrat v2
`site-theme.ts` dans `packages/core`, `SiteContent` v2, le miroir dans
`contrat.ts` du gabarit, le JSON Schema jumeau. **Le test qui compare les deux
encodages doit rester vert.**

### Tâche 6 — Le prompt
Étendre `consignes(trade)` pour la sélection de thème. Le préfixe reste stable
par métier — c'est lui qui est mis en cache.

### Tâche 7 — Vérification
Le tableau du §7 ci-dessous, intégralement.

### Tâche 8 — Régénérer et redéployer
`generate --force --limit 1`, `publish`, vérifier la page en ligne à l'œil.

---

## 7. Comment on saura que c'est fini

Des seuils, pas des impressions.

- [ ] `npm install && npm run build` réussit **hors du monorepo** — le gabarit
      reste autonome. Le test existant le prouve ; il doit rester vert.
- [ ] Lighthouse ≥ **90** en performance et en accessibilité sur la page bâtie.
- [ ] Poids du premier affichage < **500 Ko**, images comprises.
- [ ] Build d'un dépôt généré < **60 s** sur Vercel.
- [ ] `prefers-reduced-motion: reduce` supprime **toute** animation.
- [ ] Une fiche **sans note, sans lien Maps, sans année** produit une page
      complète et sans trou. C'est le cas de la majorité.
- [ ] `noindex, nofollow` présent, sous test.
- [ ] Le test « aucune chaîne visible en dur dans les `.astro` » reste vert :
      tout texte d'interface passe par `ui.ts`.
- [ ] `pnpm -r test` et `pnpm -r typecheck` verts (645 tests au départ).
- [ ] La page en ligne est vue **à l'œil** avant de déclarer la tâche finie.

---

## 8. Les pièges déjà payés — ne les repaie pas

- **Le gabarit doit rester autonome.** Un `"@prospeo/core": "workspace:*"` dans
  son `package.json` fait échouer `npm install` sur Vercel pour les 22 dépôts.
  D'où `contrat.ts`, qui duplique le schéma **volontairement**.
- **La copie de dépôt GitHub est asynchrone.** `publish` attend déjà le `sha`
  du fichier venu du modèle (`attendreContenuModele`). N'y touche pas.
- **`zodOutputFormat` réclame zod/v4**, ce dépôt est en zod 3 : le second
  encodage JSON Schema est obligatoire, et un test compare les deux.
- **Une image non optimisée fait exploser le budget.** Une photo Unsplash
  brute pèse 3 à 5 Mo.
- **`vitest` du gabarit est en v4**, contre v2 ailleurs. C'est voulu, ne
  l'aligne pas.

---

## 9. Ce qui n'est pas dans ce chantier

- Le gabarit serrurier (D9).
- L'envoi des messages (D6 du chantier n°4).
- Le passage à l'échelle des 21 prospects restants — il suit ce chantier,
  puisqu'il n'a d'intérêt qu'une fois le gabarit digne d'être montré.

---

## 10. Ce que la réalisation a appris — 2 septembre 2026

Chantier exécuté. Cette section est **factuelle** : elle ne rouvre aucune
décision, elle enregistre ce que le réel a corrigé du plan.

### 10.1 Deux erreurs de ce document

**Le §3 mélange deux populations.** Ses chiffres sont exacts sur les 139 lignes
de la base. Mais le gabarit ne sert pas les 139 : `assembleFacts` exige un
téléphone, et ils sont **37**. Sur cette population-là :

| Donnée | §3 (sur 139) | Réel (sur 37 éligibles) |
|---|---|---|
| note Google ≥ 4 | 30 → « s'efface pour 109 » | **26 / 37**, soit 70 % |
| lien Maps | 39 → « conditionnel » | **37 / 37** |

La section avis est donc le cas **courant**, pas l'exception. La dégradation
reste construite et testée — onze pages sur trente-sept n'ont pas de note —
mais elle a cessé d'être le principe d'organisation de la mise en page : la
note passe en gros chiffre plutôt qu'en ligne discrète.

**Le §7 invoque un test qui n'existait pas.** « `npm install && npm run build`
réussit hors du monorepo — le test existant le prouve » : il n'y en avait
aucun. L'autonomie ne tenait que par la vigilance, depuis le commit `fa445fa`
du chantier n°4. Elle est désormais sous test
(`apps/site-template/src/autonomie.test.ts`), ce qui n'était pas un luxe : ce
chantier a ajouté six dépendances, dont `sharp` qu'Astro 7 n'embarque plus.

### 10.2 Trois écarts assumés

**`client:visible` n'existe pas pour un composant `.astro`.** La directive
suppose une île d'un framework d'interface, et le gabarit n'en embarque aucun.
En ajouter un pour une carte statique coûterait l'hydratation que D1 refuse
déjà à Framer Motion. Un `IntersectionObserver` et un `import()` dynamique
donnent le même effet en deux lignes, et Vite isole Leaflet dans son propre
paquet.

**L'AVIF n'est produit que pour le héros.** `<Image>` ignore silencieusement
une propriété `formats` — seul `<Picture>` la lit. Mesuré : le héros passe de
211 à 122 Ko contre six secondes de build. Les neuf autres images sont sous la
ligne de flottaison et chargées paresseusement ; leur encoder un AVIF coûterait
le même temps, payé vingt-deux fois, pour des octets que personne n'attend.

**Les images de héros vivent dans `trades.ts`, pas dans `site-theme.ts`.** Le
sketch de D6 les y plaçait. Une palette ne dit rien du travail ; une
photographie, si — un chantier de plomberie ouvrant le site d'un serrurier
serait un mensonge visuel. Les placer à côté des prestations donne en outre la
bonne obligation : ajouter un métier impose de fournir ses images.

### 10.3 Quatre défauts que seul l'œil a trouvés

Aucun n'aurait fait rougir une suite. Les quatre auraient tenu sur les
vingt-deux sites.

1. **La carte ne s'affichait pas du tout.** L'import dynamique de la feuille
   Leaflet répondait 404 — `inlineStylesheets: 'always'` inline toutes les
   feuilles, aucun fichier n'est écrit, le préchargement échoue, et
   l'exception faisait échouer la promesse entière.
2. **Le bandeau de démonstration était invisible en palette `nuit`.** Il posait
   `color: #fff` sur `background: var(--encre)`, or l'encre de `nuit` est
   presque blanche. Défaut de conformité (§11) et non de style : ce bandeau est
   ce qui empêche la page de passer pour le vrai site de l'artisan.
3. **Cinq étoiles pour un 4,6.** `Math.round(4.6)` vaut 5. On ne lit pas les
   deux — on lit les étoiles.
4. **Les images d'étapes étaient à contre-emploi** : des garages en désordre
   sous un titre qui parle de sérieux. Les textes alternatifs de la banque se
   sont révélés faux sur **trois des huit héros**. Les dix-sept images ont été
   regardées une par une, et les `sujet` de `trades.ts` — qui partent dans le
   prompt — décrivent ce qu'elles montrent réellement.

### 10.4 Les seuils du §7, mesurés

| Seuil | Valeur | |
|---|---|---|
| Lighthouse performance | **96** | ✅ |
| Lighthouse accessibilité | **100** | ✅ |
| Lighthouse bonnes pratiques | **100** | ✅ |
| Poids du premier affichage | ~320 Ko mobile, ~470 Ko bureau | ✅ |
| Page entière en ligne | 260 Ko mobile, 348 Ko bureau | ✅ |
| Build | 9,5 s en local | ✅ |
| `prefers-reduced-motion` | rien n'est instancié, sous test | ✅ |
| Fiche dépouillée | page complète, vue à l'œil en `nuit` | ✅ |
| `noindex, nofollow` | présent, sous test | ✅ |
| Chaînes en dur dans les `.astro` | aucune, test étendu aux `<script>` | ✅ |
| `pnpm -r test` / `typecheck` | **679 verts** (645 au départ) | ✅ |
| Page en ligne vue à l'œil | oui, mobile et bureau, 0 erreur console | ✅ |

Le score SEO est de **63**, et son unique échec est `is-crawlable` : c'est le
`noindex` de D2. Il doit rester bas.

### 10.5 Ce qui reste ouvert

**Il n'existe aucun outil pour synchroniser `apps/site-template` vers le dépôt
modèle GitHub.** Cela a été fait à la main au chantier n°4, et de nouveau ici
par un script jetable. Tant que le gabarit ne bouge pas, la question ne se pose
plus : les nouveaux dépôts sont copiés du modèle, désormais à jour. Elle se
reposera à la première correction du gabarit, et il faudra alors la porter dans
les dépôts déjà créés — `publish` n'écrit que `site.json`.

**La diversité réelle des variantes n'est pas mesurée.** Le prompt demande au
modèle de ne pas prendre systématiquement le premier de chaque liste, et le
seul appel réel a produit `cuivre` + `humanist` + `plomberie-01`, ce qui n'est
le premier d'aucune des trois. Un seul tirage ne prouve rien : à vérifier sur
le lot des 21.

**Le gabarit du serrurier n'existe toujours pas** (D9), et ses huit images non
plus — seuls leurs identifiants sont déclarés dans `trades.ts`. Le jour où un
serrurier entre en base, il faudra curer ses images avant de pouvoir publier.
