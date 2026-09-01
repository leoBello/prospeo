# Chantier n°6 — La refonte de l'interface

> Document de référence. Les décisions D1 à D11 sont **prises** : elles portent
> leur raison avec elles. Ne les rouvre pas sans raison neuve — une préférence
> n'en est pas une.
>
> **Maquettes :** `docs/design/maquettes/` (voir le README qui s'y trouve).
> Canvas en ligne : <https://claude.ai/code/artifact/9a4484de-0054-499a-8015-58bd7f1fe18a>

---

## 1. Le constat qui ouvre ce chantier

La fiche d'un prospect est illisible. Ce n'est pas une impression : c'est
mesurable dans `ProspectPanel.tsx`.

Le panneau fait **380 px de large** (`ProspectPanel.module.css`) et empile
**sept sections, toutes dépliées en permanence** — identité, contact, présence
web, site généré, messages, suivi, score. Il faut y loger une trentaine de
couples libellé/valeur, jusqu'à deux messages de prospection en texte intégral,
et le reçu de score **ligne par ligne, groupé par bloc**, lui aussi toujours
ouvert.

Rien n'y est faux. Chaque champ a été mis là pour une raison défendable, et
plusieurs portent des distinctions que le chantier n°1 a payé cher — « pas
encore collecté » contre « non publié par la source », l'absence de score qui
n'est pas un score à zéro. Le défaut n'est pas dans le contenu, il est dans
l'**absence de hiérarchie** : tout est présenté au même niveau, en même temps,
dans une colonne trop étroite. Une fiche qu'on doit lire de haut en bas pour
savoir quoi faire n'est pas un outil d'appel.

Trois manques aggravent le tout, tous vérifiables dans le code :

- **Aucun composant de statut.** Le statut du pipeline est du texte, la
  catégorie de présence web est du texte, l'état du site est une phrase. Rien
  ne se distingue au coup d'œil.
- **Aucune infobulle.** Les raisons de la conception — pourquoi le nombre
  d'avis est absent, pourquoi la confiance d'appariement compte — vivent en
  commentaires dans les sources, là où l'utilisateur ne les lira jamais.
- **Aucun écran de déploiement.** La chaîne `publish → deploy → unpublish`
  existe et fonctionne, mais elle ne s'observe que depuis un terminal. Vingt-
  deux sites sont en ligne au nom d'entreprises réelles, et l'interface n'en
  dit rien.

---

## 2. Ce que la veille a établi

Quatre recherches, dont les conclusions ont directement orienté les décisions.

| Question | Conclusion retenue | Effet |
|---|---|---|
| Bibliothèque de composants React en 2026 | shadcn/ui a basculé sur **Base UI** comme couche primitive par défaut en juillet 2026 ; Radix, racheté par WorkOS, ralentit. Base UI est en 1.0 stable depuis décembre 2025, maintenu à plein temps par MUI. | D8 |
| Densité et écrans de décision | Le motif dominant est la **divulgation progressive** : afficher d'abord ce qui répond à « est-ce que tout va bien ? », le détail derrière une interaction délibérée. Stripe pour les tables denses, Linear pour la navigation réduite. | D1, D2 |
| Gamification en contexte commercial | Les classements « le plus d'activité gagne » **gonflent le bruit** au lieu d'améliorer les résultats, et démotivent dès qu'un rang devient inatteignable. Ce qui fonctionne : séries, paliers, objectifs personnels, points pondérés. | D5 |
| Suivi de déploiement | Vercel : résumé en tête, journal à un clic. Pipeline en segments, l'état dit par une **icône ET un mot**, jamais par la couleur seule. | D9 |

Sources : [greatfrontend](https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026) ·
[shadcndeck](https://www.shadcndeck.com/blog/radix-vs-base-ui) ·
[saasui.design](https://www.saasui.design/blog/7-saas-ui-design-trends-2026) ·
[artofstyleframe](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/) ·
[ascentcloud](https://www.ascentcloud.io/blog/guide-to-sales-gamification) ·
[plecto](https://www.plecto.com/blog/gamification/gamification-b2b-saas-examples/)

---

## 3. Les décisions

### D1 — Le panneau passe de 380 px à 720 px et de sept sections à quatre onglets

`Fiche · Site · Messages · Historique`.

Les sept sections actuelles ne sont pas sept sujets : ce sont quatre moments
distincts du travail. On consulte l'identité et la joignabilité **avant
d'appeler** ; on relit la rédaction **quand on doute du site** ; on relit les
messages **quand on rappelle** ; on consulte l'historique **quand on ne se
souvient plus**. Les empiler suppose qu'on ait besoin des quatre en même
temps, ce qui n'arrive jamais.

**Contrepartie assumée.** La liste perd de la largeur. Elle en a moins besoin
que la fiche : une ligne de liste porte un nom, une raison et un score, la
fiche porte tout le reste.

### D2 — Le reçu de score passe derrière un dépliant ; ses trois groupes restent visibles

Le calcul ligne par ligne du §9.3 **reste intégralement accessible** — c'est
lui qui rend le barème réglable et vérifiable, et le chantier n°1 l'a voulu
ainsi. Mais il n'est plus déplié par défaut.

À sa place, trois barres — Présence, Vitalité, Joignabilité — qui donnent la
composition d'un coup d'œil, et dont le survol livre le détail du groupe. Le
reçu complet est à un clic.

**Ce qui ne change pas :** les libellés du `breakdown` restent des **données**,
affichées telles que le collector les a écrites, jamais traduites côté
interface (§9.5).

### D3 — Un vocabulaire fermé de badges, et une règle : jamais la couleur seule

Sept statuts de pipeline, plus les badges de fait (présence web, état du site,
métier, péremption, gabarit). Chacun porte **un point coloré ET un mot**.

`ne_pas_contacter` est le seul en trait discontinu : c'est une obligation de
conformité (§11), pas une étape du parcours. La forme le dit avant la couleur.

### D4 — L'infobulle porte le *pourquoi*, jamais ce dont la décision dépend

Les raisons aujourd'hui enfermées dans les commentaires du code remontent à
l'écran : pourquoi le nombre d'avis est absent et pourquoi relancer
l'enrichissement ne le remplira pas ; pourquoi la confiance d'appariement
compte au téléphone ; dans quel ordre les gabarits se résolvent.

**La règle qui borne l'usage :** si une information est nécessaire pour
décider, elle est visible. L'infobulle n'explique que ce qui, autrement,
passerait pour une anomalie d'affichage.

### D5 — La gamification est adossée à des faits, jamais au volume d'activité

C'est la décision la plus exposée du chantier, et la veille est formelle sur
le piège à éviter.

| Retenu | Écarté | Pourquoi |
|---|---|---|
| Objectif du jour, calculé sur **la médiane des 14 jours précédents** | Objectif fixe imposé | Un objectif qu'on n'a jamais atteint ne motive pas ; un objectif déjà dépassé à midi non plus. |
| **Série** de jours avec au moins une relance tenue | Compteur d'appels passés | Le nombre d'appels se gonfle sans effort. La régularité, non. |
| **Palier** à points pondérés (relance 40, site en ligne 120, rendez-vous 200) | Points à l'action indifférenciée | Pondérer, c'est dire ce qui compte. Ne pas pondérer, c'est récompenser le bruit. |
| **Badges** liés à des jalons réels, dont un verrouillé visible | Badges décoratifs | Un badge qui ne correspond à rien qu'on ait fait est une image. |
| — | **Classement entre personnes** | L'application a un seul utilisateur. Et le classement démotive dès qu'un rang devient inatteignable. |

Le curseur `gamification` de la maquette (`affirmée / discrète / aucune`) reste
dans le code livré : c'est un réglage, pas une question ouverte.

### D6 — Trois familles typographiques, dont une chasse fixe pour tout chiffre comparable

| Rôle | Fonte | Motif |
|---|---|---|
| Titres, grands nombres | **Bricolage Grotesque** 600/700 | Donne du caractère aux chiffres, qui sont le sujet de l'écran. |
| Interface, copie | **Instrument Sans** 400/500/600 | Plus étroite qu'Inter à corps égal — plus de lignes à surface égale. |
| Scores, SIRET, durées, identifiants | **JetBrains Mono** | Sans chasse fixe, les colonnes de score ne s'alignent pas d'une ligne à l'autre. |

Inter est abandonnée. Elle n'a pas de défaut technique ; elle n'a aucun
caractère, et l'écran en manque.

### D7 — Le gris de texte secondaire est corrigé, la réserve de `theme.css` est levée

`theme.css` signale déjà, en commentaire, que `--color-text-muted` n'atteint
pas le contraste AA de 4,5:1 — `#6b7280` sur `#171a21` mesure **3,60:1**. Ce
n'est pas anodin : cette couleur porte la « raison de présence » de chaque
ligne, que le §9.2 tient pour essentielle.

La valeur passe à **`#98a1b4`**, sans changement de teinte. La réserve avait
été remontée plutôt que corrigée unilatéralement ; ce chantier la tranche.

### D8 — Pas de Tailwind. Base UI pour le comportement, les CSS Modules pour le style

**Ce qui manque au code actuel n'est pas le style, c'est le comportement.** Les
tokens de `theme.css` sont sains, la bascule sombre/clair fonctionne, et la
discipline « aucune couleur en dur dans un composant » est tenue. Réécrire tout
cela en classes utilitaires coûterait cher pour un gain nul.

Ce qui manque — placement d'infobulle, piège de focus, navigation clavier des
onglets, sémantique ARIA, fermeture au clic extérieur — est exactement ce
qu'une bibliothèque **headless** fournit.

**Retenu :** `@base-ui-components/react` pour Tooltip, Tabs, Popover, Select,
Dialog. Style par CSS Modules, comme aujourd'hui.

**Contrepartie assumée :** une dépendance de plus dans un dashboard qui n'en
avait que React et Supabase. Elle est justifiée par l'accessibilité, qui ne
s'improvise pas et que le projet ne peut pas réécrire à la main.

### D9 — L'écran de déploiement montre les cinq étapes réelles du code

`Rédaction → Dépôt GitHub → Projet Vercel → Build → Mise en ligne`.

Ce ne sont pas des étapes inventées pour l'écran : ce sont celles de
`stages/publish.ts` et `sources/vercel.ts`, dans leur ordre d'exécution.

Deux partis pris :

- **Une ligne en échec porte sa cause dans la ligne**, pas dans un journal
  qu'il faut ouvrir. Le journal reste accessible, mais on ne doit pas avoir à
  l'ouvrir pour savoir ce qui s'est passé.
- **Le compteur de péremption à 90 jours est un indicateur de premier rang.**
  C'est une obligation issue de D5 du chantier n°4 — un site publié au nom d'un
  tiers est retiré automatiquement —, pas une statistique d'usage.

### D10 — Le gabarit GitHub se désigne depuis l'interface, sans toucher au code

L'ordre de résolution de `templateRepoFor` (`packages/core/src/trades.ts`) est
conservé tel quel, et l'écran l'expose :

```
1. le gabarit déclaré par le métier   (Trade.templateRepo)
2. à défaut, le gabarit actif          ← ce que l'écran permet de désigner
3. à défaut, PROSPEO_GITHUB_TEMPLATE_REPO
```

Le commentaire de `trades.ts` annonçait déjà « le repli, qui permettra à une
interface de gestion de trancher sans toucher au code ». Cet écran est cette
interface.

**Les quatre contrôles sont énoncés avant validation**, dont la mention
d'éditeur — que `editeurRenseigne()` fait déjà échouer côté `publish`. Un refus
doit dire *lequel* a manqué.

**Portée du changement :** changer de gabarit n'affecte que les déploiements à
venir. Les sites déjà en ligne conservent le modèle avec lequel ils ont été
construits.

### D11 — La direction graphique retenue est « Cockpit » (Direction B)

Trois directions ont été maquettées sur le même prospect, à contenu égal
(`DirectionA/B/C.dc.html`).

| | Pari | Contrepartie |
|---|---|---|
| **A — Console calme** | Rien ne bouge, la couleur ne sert qu'à l'état. Tenable huit heures. | Ne récompense rien : la gamification n'y a pas de place. |
| **B — Cockpit** ✅ | Le score devient une jauge ; l'écran dit ce que vaut l'action et ce qu'elle rapporte. | Le jeu doit rester adossé aux faits, sinon il devient du bruit (borné par D5). |
| **C — Dossier éditorial** | Se lit et s'imprime bien, apaise. | Moins de lignes à surface égale, et la gamification y trouve mal sa place. |

**B est retenue** : c'est la seule qui accueille la gamification demandée sans
la plaquer.

---

## 4. Ce que la base ne sait pas encore — deux manques réels

Ces deux points **bloquent** une partie de ce qui est maquetté. Ils sont
signalés ici plutôt que contournés.

### 4.1 Aucune table d'événements de déploiement

`prospect_site` porte un **état courant** (dépôt, projet, URL, dates), pas un
**historique**. Le suivi étape par étape de D9 — durée de chaque étape, cause
d'échec, journal — n'a rien pour s'alimenter.

Il faut une table d'événements, une ligne par franchissement d'étape :
prospect, étape, état, horodatage, message d'erreur. Sans elle, l'écran de
suivi ne peut afficher qu'un état final, ce qui le vide de son intérêt.

### 4.2 L'historique du pipeline n'existe pas

`prospect_pipeline` ne porte que `status` et `updated_at` : **le passé est
écrasé à chaque changement.**

Conséquence directe sur D5 : « relance tenue » suppose de savoir quelle
`next_action_at` était en vigueur au moment de l'interaction. Cette information
n'est nulle part. La **série** peut se calculer depuis `interaction.occurred_at`
(qui existe et suffit), mais pas la notion d'engagement honoré à la date prévue.

Deux issues, à trancher : soit une table d'historique du pipeline, soit une
définition plus faible de la série — « un jour avec au moins une interaction »
—, honnête mais moins signifiante.

---

## 5. Ordre d'exécution proposé

1. **Tokens et fondations** — D6, D7. Aucun composant ne change, seul
   `theme.css` bouge. Livrable isolé, testable, sans risque.
2. **Vocabulaire** — D3, D4. Badge, Tooltip, Card, EmptyState, avec Base UI
   (D8). Ces composants n'existent pas : rien ne casse.
3. **La fiche** — D1, D2. Le changement le plus visible, et celui qui a le plus
   de tests à reprendre (`ProspectPanel`, `SiteSection`, `MessagesSection`,
   `PipelineSection`).
4. **La migration d'événements** — §4.1. Prérequis de l'étape 5.
5. **Les écrans de déploiement** — D9, puis D10.
6. **La gamification** — D5, en dernier, une fois §4.2 tranché.

Les étapes 1 à 3 ne dépendent d'aucune migration et peuvent être livrées
immédiatement. L'étape 6 dépend d'une décision qui n'est pas prise.

---

## 6. Ce qui reste ouvert

- **§4.2** : table d'historique du pipeline, ou définition faible de la série ?
- Le seuil du palier (500 points) et la pondération des actions sont des
  valeurs d'attente. Elles se règlent à l'usage, pas sur le papier.
- L'écran « Base » (les 139 prospects, filtrables) n'est pas maquetté. Il
  n'était pas dans le périmètre de ce chantier, mais le rail de navigation lui
  réserve sa place.
