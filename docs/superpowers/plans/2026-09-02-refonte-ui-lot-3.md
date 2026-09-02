# Refonte de l'interface — Lot 3 : l'écran de travail, et le jeu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finir la refonte — donner à l'écran de liste le dessin que la maquette promet, et adosser la gamification à un historique du pipeline qui n'existait pas.

**Architecture:** Trois couches, dans cet ordre. (1) Le **chrome** de l'écran de liste : purement visuel, aucune donnée nouvelle, livrable seul et immédiatement visible. (2) L'**historique du pipeline** : une table d'événements et l'écriture qui l'alimente — c'est ce qui débloque le reste. (3) Le **jeu** : des fonctions pures qui dérivent série, objectif et palier de faits datés, puis la bande qui les affiche.

**Tech Stack:** Postgres/Supabase (migrations SQL), TypeScript, React 18.3, Vite, CSS Modules, `@base-ui/react` 1.7, Vitest + Testing Library, jsdom.

---

## Où en est le projet — à lire avant la tâche 1

Ce plan est le troisième d'un chantier. Un agent qui arrive ici sans contexte doit lire, dans cet ordre :

1. `docs/superpowers/plans/2026-09-02-refonte-ui-ux.md` — les décisions D1 à D11, chacune avec sa raison.
2. `docs/design/HANDOFF.md` — ce que les maquettes montrent et que la base ne sait pas encore, et ce que les deux lots précédents ont fait tomber en silence. **Il porte un avertissement — « Ne pas lire ce tableau comme clos » — qui vaut toujours.**
3. Les maquettes dans `docs/design/maquettes/`, en particulier `Main.dc.html`, qui est la référence de ce lot.

**Ce que les lots 1 et 2 ont livré :** les tokens et le kit (`Badge`, `StatusBadge`, `Tooltip`, `Bientot`, `Card`/`Field`/`Absent`, `EmptyState`), la fiche prospect à 720 px en quatre onglets, `ScoreCompact`, la navigation à trois vues, l'écran de suivi des déploiements, l'écran de gabarit, et le journal `deployment_event` que le collector alimente.

**Ce qui manque, et pourquoi ce lot existe.** Le chrome de l'écran de liste — la barre du haut, la bande d'indicateurs, le dessin des lignes — n'a été touché par aucun des deux lots. Il est tombé entre le lot 1, qui s'arrêtait à la fiche, et le lot 3, qui ne couvrait que la gamification. C'est la raison pour laquelle l'écran ne ressemble pas encore à la maquette.

---

## Global Constraints

- **Le kit du lot 1 est le vocabulaire.** `apps/dashboard/src/ui/kit/` existe et est testé. N'en réinventez aucun composant ; si l'un manque de quelque chose, étendez-le plutôt que de le doubler.
- **Aucune chaîne en dur.** Tout texte affiché passe par `t()`. Toute clé ajoutée à `src/i18n/fr.ts` doit l'être à `en.ts`, et `i18n.test.ts` porte **un contrôle d'orphelines** : une clé sans consommateur hors tests fait échouer la suite. Une composition dynamique de clé impose d'ajouter sa ligne à la liste d'exceptions du fichier, avec sa raison.
- **Aucune couleur en dur dans un composant.** Uniquement des `var(--…)` de `theme.css` — c'est la condition pour que le thème clair reste livrable.
- **La couleur n'est jamais le seul indicateur d'un état.** Tout badge porte un mot ; toute pastille porte un `aria-label`.
- **Une absence se nomme, jamais elle ne se vide**, et **des absences de natures différentes restent distinctes**. C'est la doctrine que ce dépôt défend le plus âprement, et les deux lots précédents l'ont violée quatre fois — toujours en confondant « pas encore » avec « jamais ».
- **`null` est porteur de sens.** Un prospect sans score n'est pas un prospect à zéro.
- **Imports en `.js`** même pour un fichier `.tsx` (ESM/NodeNext). **Commentaires en français, sur le *pourquoi*.**
- **Commandes :** tests dashboard `pnpm --filter @prospeo/dashboard test`, tests collector `pnpm --filter @prospeo/collector test`, types `pnpm -r typecheck`, migrations `pnpm db:push` puis `pnpm db:types`. Depuis la racine. Un argument `-- <motif>` **ne restreint pas** le run vitest.
- **Commit à chaque fin de tâche**, jamais avant que les tests passent.

## Les trois leçons des lots précédents, à appliquer ici

Elles ont coûté du temps réel. Elles priment sur toute facilité.

1. **Ce plan ne dicte pas le texte exact des assertions.** Il dit *ce qui doit être prouvé*. Lisez la valeur réelle dans `fr.ts` et écrivez l'assertion en conséquence. Quatre fois sur cinq, une assertion inerte venait d'un texte inventé par un plan.
2. **Toute assertion doit être prouvée capable d'échouer** — cassez le code, observez le rouge, restaurez, observez le vert, et **collez les deux sorties dans votre rapport**. Un récit sans transcription n'est pas une preuve : un agent en a produit un qui n'a pas survécu à la relecture. Attention aux pièges : `getByText`/`queryByText` comparent le texte **entier du nœud** ; `queryByRole` filtre par défaut sur `hidden: false` ; `getAllByText` lève à zéro correspondance, donc un `.length > 0` qui suit ne teste rien.
3. **Ne construisez jamais une affordance qui annonce un fait qu'aucun code ne peut rendre vrai.** Le lot 2 en a livré trois — une colonne alimentée par rien, une étape jamais émise, un bouton promettant un contrôle qui n'existe pas. Si une donnée manque, dites-le au lieu de la mettre en forme.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `apps/dashboard/src/ui/theme.css` | *modifié* — la fonte d'affichage appliquée là où D6 la voulait | 1 |
| `apps/dashboard/src/ui/AppShell.module.css`, `AppShell.tsx` | *modifiés* — la barre du haut | 2 |
| `apps/dashboard/src/ui/BarreHaut.tsx` + `.module.css` | recherche, préférences, compte | 2 |
| `apps/dashboard/src/ui/ProspectRow.tsx` + `.module.css` | *réécrits* — badges, raison, score | 3 |
| `apps/dashboard/src/ui/WorkListSection.module.css` | *modifié* — l'en-tête de section et son compteur | 3 |
| `supabase/migrations/<ts>_pipeline_event.sql` | l'historique du pipeline | 4 |
| `apps/dashboard/src/data/mutations.ts` | *modifié* — `definirStatut` écrit l'historique | 5 |
| `apps/dashboard/src/domain/jeu.ts` | série, objectif, palier — fonctions pures | 6 |
| `apps/dashboard/src/data/jeu.ts` | les lectures | 7 |
| `apps/dashboard/src/ui/BandeProgression.tsx` + `.module.css` | la bande, à la place des quatre compteurs | 8 |
| `apps/dashboard/src/ui/KpiBand.tsx` | *supprimé* — remplacé par la bande | 8 |
| `docs/design/HANDOFF.md` | *modifié* | 9 |

---

## Task 1: La fonte d'affichage, appliquée là où D6 la voulait

**Files:** Modify `apps/dashboard/src/ui/theme.css` and the stylesheets that should carry the display family. Test: `apps/dashboard/src/ui/theme.test.ts` (existe).

**Le constat qui ouvre ce lot.** D6 a fait entrer **Bricolage Grotesque** pour donner du caractère aux titres et aux grands nombres, et `index.html` la télécharge à chaque chargement. Elle est utilisée à **un seul endroit** : le chiffre de la jauge de `ScoreCompact.module.css`. Tout le reste de l'application lit en Instrument Sans — y compris le `h2` du panneau, qui hérite de la fonte d'interface à 15 px. La revue finale du lot 1 l'avait signalé ; il a été classé en suivi et jamais repris. **C'est la première raison pour laquelle l'écran ne ressemble pas à la maquette.**

Deux tokens introduits par le lot 1 n'ont par ailleurs **aucun consommateur** : `--text-2xl` et `--color-surface-3`. Décidez pour chacun : l'employer là où il avait un sens, ou le retirer. Ne laissez pas un token orphelin — il ment sur ce que le thème gouverne.

- [ ] **Step 1: Recenser**

Listez les consommateurs actuels de `--font-display`, `--text-2xl` et `--color-surface-3`. Lisez `docs/design/maquettes/Main.dc.html` pour voir où la maquette emploie réellement la fonte d'affichage — c'est un fichier HTML lisible, la famille y est nommée dans les styles en ligne.

- [ ] **Step 2: Écrire le test qui échoue**

`theme.test.ts` existe et lit le CSS pour vérifier le contraste et la présence des trois familles. Étendez-le : prouvez que la fonte d'affichage est employée par plus d'un fichier, et qu'aucun token déclaré n'est sans consommateur. Un test qui lit les fichiers doit **échouer bruyamment** si le parcours casse — vérifiez que c'est le cas plutôt qu'un silence qui passerait pour un succès.

- [ ] **Step 3: Lancer, vérifier l'échec** — `pnpm --filter @prospeo/dashboard test`

- [ ] **Step 4: Appliquer**

Titres d'écran, titres de panneau, grands nombres. **Pas la copie courante** : la maquette réserve la fonte d'affichage aux titres et aux chiffres, et l'appliquer au corps de texte détruirait la densité que le §9.4 défend.

- [ ] **Step 5: Lancer, vérifier le succès, puis commit**

---

## Task 2: La barre du haut

**Files:** Create `apps/dashboard/src/ui/BarreHaut.tsx` + `.module.css`. Modify `AppShell.tsx`, `AppShell.module.css`. Test: `BarreHaut.test.tsx`.

**Ce qu'elle remplace.** `AppShell` porte aujourd'hui trois boutons en texte nu — « Passer au thème clair », « English », « Se déconnecter » — alignés à côté du nom de l'application. La maquette montre une barre qui porte le nom, le périmètre travaillé, un champ de recherche annoncé par `⌘K`, et les préférences repliées.

**Ce qui est visuel et ce qui ne l'est pas.** Le champ de recherche de la maquette n'a **aucun moteur derrière lui** dans ce lot. Deux issues, à choisir et à assumer : le construire réellement (filtrer la liste déjà chargée en mémoire — les prospects sont tous là, c'est peu de code), ou ne pas le dessiner du tout. **Ne dessinez pas un champ inerte qui ressemble à un champ actif** : c'est exactement la classe de défaut que le lot 2 a livrée trois fois. Si vous le construisez, il filtre pour de vrai ; sinon il n'existe pas. Dites votre choix dans le rapport.

Le raccourci `⌘K` n'est une promesse que si une touche l'honore. Même règle.

**Ce qui doit survivre :** la bascule de thème et de langue restent atteignables, et testées — `preferences.tsx` les porte, et des tests existants les montent.

- [ ] **Step 1: Écrire les tests qui échouent** — la barre rend le nom de l'application ; les préférences restent atteignables et fonctionnelles ; la déconnexion appelle son rappel ; et, si vous construisez la recherche, qu'elle filtre réellement et que le raccourci lui donne le focus.

- [ ] **Step 2: Lancer, vérifier l'échec**

- [ ] **Step 3: Ajouter les clés i18n (fr et en), puis implémenter**

- [ ] **Step 4: Lancer toute la suite** — les tests de `TodayScreen` montent `AppShell` ; s'ils cassent, diagnostiquez avant de toucher au test.

- [ ] **Step 5: Commit**

---

## Task 3: Les lignes de liste

**Files:** Rewrite `apps/dashboard/src/ui/ProspectRow.tsx` + `.module.css`. Modify `WorkListSection.module.css`. Test: `ProspectRow.test.tsx`.

**Maquette :** le bloc « Relances dues » et « Nouveaux prospects à fort score » de `Main.dc.html`.

Une ligne porte : un liseré de sélection, le nom, un badge de statut, la raison de présence, une piste de score compacte et le total. `StatusBadge` et `ScoreBar` existent déjà — réemployez-les.

**Deux choses à ne pas perdre en route**, toutes deux payées cher par le chantier 1 :

- **La raison de présence** est ce qui rend la file décidable. Elle vient du domaine (`ReasonFragment`, dont les fragments `raw` sont des **données** écrites par le barème du collector et ne passent jamais par `t()`). Ne la tronquez pas au point de la rendre inutile.
- **L'absence de score se nomme.** 114 prospects sur 139 n'ont pas de score, et un « 0 » les ferait lire comme jugés sans valeur alors qu'ils n'ont pas été jugés. `ScoreBar` le fait déjà correctement ; ne le contournez pas.

**Vérifiez la densité après coup.** Le §9.4 assume un interlignage resserré parce que l'usage réel consiste à trier des centaines de lignes. Une ligne plus aérée montre moitié moins de prospects à surface égale. Si votre dessin fait grossir la ligne, dites de combien dans le rapport.

- [ ] **Step 1: Écrire les tests qui échouent** — nom, badge de statut, raison rendue, absence de score nommée, ligne sélectionnée distinguée autrement que par la couleur seule.

- [ ] **Step 2: Lancer, vérifier l'échec**

- [ ] **Step 3: Implémenter**

- [ ] **Step 4: Lancer toute la suite, puis commit**

---

## Task 4: L'historique du pipeline

**Files:** Create `supabase/migrations/<horodatage>_pipeline_event.sql`. Modify `packages/db/src/database.types.ts` (régénéré).

**La décision qui ouvre cette tâche.** `prospect_pipeline` ne porte que `status`, `next_action_at` et `updated_at`, et `definirStatut` fait un `upsert` qui les écrase : **le passé disparaît à chaque changement**. Trois choses en dépendent, et deux sont bloquées :

| Source de points | État |
|---|---|
| Site mis en ligne | **débloqué** — `deployment_event` porte `en_ligne/reussi` et son horodatage (lot 2) |
| Relance tenue | **bloqué** — il faut la `next_action_at` en vigueur *au moment* de l'interaction |
| Rendez-vous obtenu | **bloqué** — il faut *quand* le statut est passé à « intéressé » |

**L'arbitrage a été rendu : on ajoute la table d'historique.** Une ligne par changement de statut, portant le statut *et* la `next_action_at` qui entre en vigueur avec lui — c'est cette seconde colonne qui rend « relance tenue » calculable, et l'oublier viderait la table de la moitié de son intérêt.

**La contrepartie, à assumer et à faire dire à l'écran (tâche 8) :** la table démarre vide. La série et le palier liront zéro les premiers jours. `prospect_pipeline.updated_at` permet de l'**amorcer** avec un point par prospect — le dernier changement connu. C'est mieux que rien et honnête, à condition que l'amorçage soit marqué comme tel et non présenté comme une observation.

**Précautions, apprises du lot 2 :**
- **RLS activée et politique conforme aux tables sœurs** — l'application expose sa clé anonyme dans le bundle.
- **Purement additive** : aucune modification ni suppression d'objet existant. La migration s'applique à l'instance réelle, il n'y a pas d'environnement de recette. **Relisez le SQL avant `pnpm db:push`.**
- **`database.types.ts` est généré** — jamais édité à la main.

- [ ] **Step 1: Écrire la migration**, horodatage postérieur à la dernière existante, commentaires en français expliquant *pourquoi* une table plutôt que des colonnes. Lisez `20260902100000_deployment_event.sql` : c'est l'analogue le plus proche.

- [ ] **Step 2: Appliquer et régénérer** — `pnpm db:push` puis `pnpm db:types`, puis `pnpm -r typecheck`.

- [ ] **Step 3: Amorcer** depuis `prospect_pipeline.updated_at`, dans la même migration, avec un commentaire disant que ces lignes sont un amorçage et non des observations.

- [ ] **Step 4: Commit**

---

## Task 5: `definirStatut` écrit l'historique

**Files:** Modify `apps/dashboard/src/data/mutations.ts`. Test: `mutations.test.ts` (existe).

**Le piège à ne pas tomber dedans.** `definirStatut` fait aujourd'hui un `upsert` sur `prospect_pipeline`. Il doit désormais **aussi** insérer une ligne d'historique. Ces deux écritures doivent être cohérentes : un état courant mis à jour sans sa ligne d'historique rendrait le jeu faux en silence, et une ligne d'historique sans mise à jour de l'état ferait mentir la fiche.

Supabase ne donne pas de transaction depuis le client. Décidez donc explicitement de l'ordre et du comportement en cas d'échec partiel, et **dites-le dans un commentaire** : quelle écriture d'abord, et que se passe-t-il si la seconde échoue. Une divergence silencieuse est le pire des trois résultats possibles.

- [ ] **Step 1: Écrire les tests qui échouent** — un changement de statut écrit l'état ET l'historique, avec la `next_action_at` qui entre en vigueur ; un échec de la seconde écriture est signalé et non avalé.

- [ ] **Step 2: Lancer, vérifier l'échec**

- [ ] **Step 3: Implémenter**

- [ ] **Step 4: Lancer, vérifier le succès. Prouvez par mutation que le test d'échec partiel mord.** Puis commit.

---

## Task 6: Le domaine du jeu

**Files:** Create `apps/dashboard/src/domain/jeu.ts`. Test: `jeu.test.ts`.

**C'est le cœur du lot, et c'est de l'arithmétique sur des faits datés** — donc testable sans réseau et sans composant. Les lectures viennent à la tâche 7 ; ici, des fonctions pures.

**Ce que la veille impose, et qui n'est pas négociable.** Les classements « le plus d'activité gagne » gonflent le bruit au lieu d'améliorer les résultats. Le jeu s'adosse donc à des **faits pondérés**, jamais au volume :

| Retenu | Écarté | Pourquoi |
|---|---|---|
| Objectif du jour, calculé sur **la médiane des 14 jours précédents** | Objectif fixe imposé | Un objectif jamais atteint ne motive pas ; un objectif dépassé à midi non plus. |
| **Série** de jours avec au moins une relance tenue | Compteur d'appels | Le nombre d'appels se gonfle sans effort. La régularité, non. |
| **Palier** à points pondérés — relance tenue 40, site en ligne 120, rendez-vous obtenu 200 | Points à l'action indifférenciée | Pondérer, c'est dire ce qui compte. |
| **Badges** liés à des jalons réels, dont un verrouillé visible | Badges décoratifs | Un badge qui ne correspond à rien qu'on ait fait est une image. |
| — | **Classement entre personnes** | L'application a un seul utilisateur, et un rang inatteignable démotive. |

**Deux définitions à écrire avec soin :**

- **« Relance tenue »** : une interaction survenue le jour où une `next_action_at` était due, ou avant. C'est l'historique de la tâche 4 qui le rend calculable — croisez `pipeline_event` et `interaction.occurred_at`.
- **Les jours se comptent en dates civiles**, pas en tranches de 24 heures. `domain/today.ts` exporte déjà `joursCivils`, écrit exactement pour cette raison — réutilisez-le. Sans lui, une relance tenue hier à 23 h compte pour le mauvais jour.

**Le cas du premier jour, qui est le cas courant.** La table d'historique vient d'être créée : la série vaudra zéro, l'objectif n'aura pas quatorze jours de données. Ce n'est pas une erreur, et ça ne doit pas se rendre comme un échec. Vos fonctions doivent distinguer **« zéro »** de **« pas assez d'historique pour le dire »**, et rendre la seconde de façon exploitable par l'écran. C'est la doctrine des absences distinctes, appliquée au jeu.

- [ ] **Step 1: Écrire les tests qui échouent** — chaque définition, ses bornes, et surtout la distinction « zéro » / « pas assez d'historique ».

- [ ] **Step 2: Lancer, vérifier l'échec**

- [ ] **Step 3: Implémenter**

- [ ] **Step 4: Lancer, vérifier le succès. Prouvez par mutation deux assertions**, dont celle qui distingue zéro d'une absence d'historique. Puis commit.

---

## Task 7: Les lectures du jeu

**Files:** Create `apps/dashboard/src/data/jeu.ts` and a hook. Test: à votre appréciation.

Minces et sans logique, comme `data/deployments.ts`. **Lisez-le avant d'écrire** : il porte les conventions établies au lot 2 (bornes sur les lectures imbriquées, allow-listing des énumérations plutôt que des conversions de type forcées, garde `vivant` dans les hooks).

**Deux précautions issues du lot 2 :**
- **Bornez toute lecture qui grandit avec le temps.** `pipeline_event` et `interaction` grossissent à chaque geste ; ne les lisez pas sans `limit`, et commentez pourquoi la borne est là. Le lot 2 a livré une lecture non bornée qu'il a fallu corriger.
- **Un échec de lecture doit se distinguer d'un résultat vide.** Le lot 2 a livré exactement cette confusion sur le journal, et il a fallu la corriger.

- [ ] **Step 1: Écrire, tester, commit** en suivant le cycle habituel.

---

## Task 8: La bande de progression

**Files:** Create `apps/dashboard/src/ui/BandeProgression.tsx` + `.module.css`. Delete `KpiBand.tsx` + `.module.css` + son test. Modify `TodayScreen.tsx`. Test: `BandeProgression.test.tsx`.

**Maquette :** la bande qui suit le titre « Aujourd'hui » dans `Main.dc.html` — anneau d'objectif, palier, badges, et le compteur de série dans la barre du haut.

**Ce qu'elle remplace.** `KpiBand` affiche quatre compteurs de lignes réelles. Deux d'entre eux — « Contactés » et « Intéressés » — restent à zéro tant que rien n'écrit dans `prospect_pipeline`, et le lot 1 l'affichait plutôt que de le maquiller. La bande de progression prend leur place ; vérifiez avant de supprimer que rien d'autre ne monte `KpiBand`.

**La règle qui gouverne l'écran le jour de la livraison.** L'historique est quasi vide. **N'affichez pas un compteur de série fondé sur rien** — un chiffre motivant sans fondement est pire que pas de chiffre, et c'est écrit dans le handoff depuis le lot 1. Tant que l'historique n'a pas de quoi trancher, la bande dit qu'elle apprend encore, avec le kit (`Absent`, `EmptyState`, ou une formulation à vous), et **jamais un zéro qui se lirait comme un échec**.

Le curseur de la maquette (`gamification` : affirmée / discrète / aucune) est un **réglage**, pas une question ouverte — D5 l'a tranché. S'il vous coûte peu, portez-le ; sinon, dites pourquoi vous l'avez laissé.

- [ ] **Step 1: Écrire les tests qui échouent** — l'objectif, le palier et les badges rendent leurs valeurs ; un historique insuffisant se dit comme tel et **pas** comme un zéro ; un badge verrouillé est distingué d'un badge obtenu autrement que par la couleur.

- [ ] **Step 2: Lancer, vérifier l'échec**

- [ ] **Step 3: Ajouter les clés i18n (fr et en), puis implémenter**

- [ ] **Step 4: Supprimer `KpiBand`** et ses clés devenues orphelines — le contrôle d'orphelines de `i18n.test.ts` vous dira lesquelles.

- [ ] **Step 5: Lancer toute la suite, prouver par mutation la distinction zéro / pas assez d'historique, puis commit**

---

## Task 9: Le handoff

**Files:** Modify `docs/design/HANDOFF.md`.

- [ ] **Step 1: Recenser les zones inertes**

```bash
grep -rn "Bientot" apps/dashboard/src --include=*.tsx | grep -v "kit/Bientot" | grep -v ".test."
```

Le tableau doit correspondre à ce que cette commande rend. Si elle rend autre chose que ce que vous attendiez, dites-le au lieu de l'arranger.

- [ ] **Step 2: Mettre à jour**

Doivent y figurer : ce que ce lot a livré ; les zones inertes restantes avec leur motif ; l'état de l'amorçage de l'historique et à partir de quand le jeu dira quelque chose de vrai ; et **la décision qui reste ouverte pour l'humain** — `packages/core/src/trades.ts` déclare un `templateRepo` sur les deux métiers, si bien que le gabarit désigné en base ne gouverne aucun métier actuel. Elle est déjà consignée ; vérifiez qu'elle l'est encore et qu'elle n'a pas été tranchée sans trace.

**Ne réécrivez pas le tableau des pertes des lots précédents** — il porte un avertissement qui vaut toujours. Ajoutez-y une ligne si ce lot a fait tomber quelque chose.

- [ ] **Step 3: Vérifier que rien n'est cassé, puis commit**

---

## Auto-revue

**Couverture.** D5 (gamification) → tâches 4 à 8. D6 (typographie) → tâche 1. Le chrome de l'écran, absent des chantiers précédents → tâches 2 et 3. La question ouverte du lot 3 → tranchée, tâche 4.

**Trois points de vigilance à l'exécution :**

1. **La tâche 4 touche la base réelle.** Il n'y a pas d'environnement de recette. La migration est additive, mais relisez-la avant de l'appliquer.
2. **Les tâches 1 à 3 sont purement visuelles et livrables seules.** Si le temps manque, elles seules referment l'écart avec la maquette. Les tâches 4 à 8 sont un bloc : la bande sans l'historique n'aurait rien à dire.
3. **L'historique démarre vide, et c'est l'état courant le jour de la livraison, pas un cas limite.** Les tâches 6 et 8 doivent le traiter explicitement, sous peine d'un écran qui paraît cassé alors qu'il est simplement neuf.

---

## Handoff d'exécution

Plan complet, enregistré dans `docs/superpowers/plans/2026-09-02-refonte-ui-lot-3.md`. Deux façons de l'exécuter :

1. **Par sous-agents (recommandé)** — un agent neuf par tâche, revue entre chaque, itération rapide.
2. **En ligne dans la session** — exécution par lots avec points de contrôle.
