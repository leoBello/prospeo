# Handoff — ce que la maquette montre et que la base ne sait pas encore

> Mis à jour à la fin du lot 1, du lot 2, puis du lot 3. À relire avant
> d'ouvrir le lot 4.
>
> Règle : **toute zone d'interface rendue inerte par `<Bientot>` a sa ligne
> ici.** Une affordance « bientôt » sans entrée dans ce tableau est un oubli,
> pas une décision.

## Ce qui est en place à la fin du lot 1

| Composant | Fichier | État |
|---|---|---|
| Tokens, trois fontes, contraste AA | `src/ui/theme.css` | livré |
| `Badge`, `StatusBadge` | `src/ui/kit/Badge.tsx`, `src/ui/kit/StatusBadge.tsx` | livré |
| `Tooltip` (Base UI) | `src/ui/kit/Tooltip.tsx` | livré — rattachement ARIA posé à la main, voir plus bas |
| `Bientot` | `src/ui/kit/Bientot.tsx` | livré |
| `Card`, `Field`, `Absent` | `src/ui/kit/Card.tsx` | livré |
| `EmptyState` | `src/ui/kit/EmptyState.tsx` | livré |
| `ScoreCompact` | `src/ui/ScoreCompact.tsx` | livré |
| `FicheTab` (présence web, enrichissement, téléphone qualifié, score) | `src/ui/panel/FicheTab.tsx` | livré |
| `HistoriqueTab` | `src/ui/panel/HistoriqueTab.tsx` | livré — zone détail inerte, voir plus bas |
| `PanelActions` | `src/ui/PanelActions.tsx` | livré — bouton inerte, voir plus bas |
| Fiche à 720 px, quatre onglets | `src/ui/ProspectPanel.tsx` | livré |

## Ce qui est en place à la fin du lot 2

| Composant | Fichier | État |
|---|---|---|
| Table `deployment_event` | `supabase/migrations/20260902100000_deployment_event.sql` | livré |
| Table `site_template` (gabarit actif, ligne singleton) | `supabase/migrations/20260902110000_site_template.sql` | livré |
| `EventSink` — puits d'événements qui n'interrompt jamais l'étage | `apps/collector/src/stages/events.ts` | livré |
| `publish`, `deploy` et `unpublish` émettent leurs événements | `apps/collector/src/stages/publish.ts`, `deploy.ts`, `unpublish.ts` | livré — `unpublish` instrumenté à la revue de fin de lot, voir plus bas |
| `duration_ms` réellement mesurée | mêmes fichiers | livré — voir plus bas |
| `publish` lit le gabarit actif en base (niveau 2 de la résolution) | `apps/collector/src/site-template.ts` (`lireGabaritActif`, `gabaritDefautPourPublication`) | livré — voir la trouvaille plus bas |
| Navigation entre écrans | `apps/dashboard/src/App.tsx`, `src/ui/Nav.tsx` | livré |
| `EtapesPiste` | `src/ui/EtapesPiste.tsx` | livré |
| `DeploiementsScreen` (D9, suivi des déploiements) | `src/screens/DeploiementsScreen.tsx` | livré |
| `GabaritScreen` (D10, gabarit GitHub) | `src/screens/GabaritScreen.tsx` | livré — bouton inerte, voir plus bas |
| `HistoriqueTab` — journal réel en plus de la frise de jalons | `src/ui/panel/HistoriqueTab.tsx` | livré — une zone inerte de moins, voir plus bas |

**Les vingt-deux sites déjà en ligne n'ont aucun événement**, `deployment_event`
venant d'être créée par ce lot : tout ce qui a précédé la migration n'a laissé
aucune trace dans la table. C'est le cas majoritaire à l'ouverture des deux
écrans neufs, pas un cas limite, et les deux le traitent explicitement plutôt
que de le laisser passer pour une panne — `DeploiementsScreen` rend une piste
pleine et un badge « En ligne » pour `etapeCourante === null` avec
`etat === 'en_ligne'` (docstring du composant), `HistoriqueTab` affiche un
`EmptyState` daté sur le dernier jalon connu de `prospect_site` plutôt qu'un
vide muet. Ne pas le lire comme un bug le jour où ça s'affiche ainsi.

### Corrigé à la revue de fin de lot : deux colonnes que personne ne remplissait

**`duration_ms` est désormais mesurée.** Aucun des onze appels à `emit` ne la
passait, alors que `DeploiementsScreen` ship une colonne « Durée » complète
(en-tête, largeur fixe, `dureeParts()`, clés i18n) et que `HistoriqueTab`
affiche une durée par ligne. En production, chaque ligne aurait lu « non
renseigné » à jamais — la doctrine du vide nommé retournée contre elle-même :
« non renseigné » dit *la durée de ce prospect est inconnue*, quand le fait
était *rien ne mesure les durées*. Les étapes sont chronométrées une par une
sur l'horloge injectée (`deps.maintenant()`, mandataire dans `PublishDeps`,
`DeployDeps` et `UnpublishDeps`), échecs compris.

**Ce qui reste sans durée, et c'est voulu** : le `depot/ignore` d'un `publish`
qui saute un prospect inchangé, et le `build/demarre` d'un déploiement encore
en cours. Le premier n'a rien fait ; le second marque un commencement, dont la
durée n'existe pas — le build se poursuit après la fin du run. `null` est la
réponse honnête dans les deux cas, et « non renseigné » y est le bon
affichage.

**`retrait` n'est plus une étape que rien n'émet.** Elle figurait dans
l'énumération `deployment_step`, dans `ORDRE_ETAPES`, dans les deux catalogues
de traduction et dans deux composants — et `unpublish.ts` ne prenait aucun
`EventSink`. `publish` et `deploy` avaient été instrumentés, pas lui. Il émet
désormais `retrait/reussi` avec son motif (refus ou péremption — la table ne
garde rien d'autre qui les distingue), et `retrait/echoue` quand le garde-fou
bloque une suppression ou qu'une suppression Vercel rate. **Le mode
`--dry-run` n'émet rien** : journaliser un retrait qui n'a pas eu lieu ferait
de la table un récit de travail imaginaire.

## Ce qui est en place à la fin du lot 3

| Composant | Fichier | État |
|---|---|---|
| Fonte d'affichage, quatre titres d'écran + titre du panneau, chiffre de la jauge en chasse fixe | `src/ui/theme.css`, `src/ui/ScoreCompact.tsx` | livré — tokens orphelins retirés (`--color-surface-3`, `--space-6`, `--z-overlay`), `--text-2xl` employé ; `src/ui/theme.test.ts` vérifie désormais qu'aucun token déclaré n'est sans consommateur |
| Barre du haut : nom de l'application, recherche, préférences repliées derrière un compte (Popover Base UI), déconnexion | `src/ui/BarreHaut.tsx`, `src/ui/plateforme.ts` | livré — la recherche filtre les listes de travail déjà chargées, et le dit ; ce ne sont pas les 139 prospects de la base. Le raccourci clavier donne réellement le focus, et son libellé affiché correspond à la touche qui marche sur la plateforme courante |
| Lignes de liste : liseré de sélection, nom, `StatusBadge`, raison de présence, `ScoreBar` ; en-tête de section avec compteur en pastille et filet | `src/ui/ProspectRow.tsx` | livré — `Badge` gagne une taille compacte ; le code postal et la ville quittent la ligne (voir « Ce que ce lot a fait tomber », plus bas) |
| Table `pipeline_event` : une ligne par changement de statut, portant le statut **et** la `next_action_at` en vigueur à ce moment ; colonne `origin` (`observe` / `amorcage`) | `supabase/migrations/20260902120000_pipeline_event.sql` | livré, appliquée à l'instance réelle |
| `definirStatut` écrit l'historique en plus de l'état | `src/data/mutations.ts`, `src/ui/actions.ts` | livré — ordre décidé et commenté (l'état d'abord, l'historique ensuite), un échec de la seule écriture d'historique est signalé sans être avalé (`EchecDefinirStatut.etape`), et l'écran relit quand même puisque l'état, lui, a changé |
| Domaine du jeu : relance tenue, série, objectif médian sur 14 jours, palier pondéré, badges | `src/domain/jeu.ts` | livré, fonctions pures |
| Lectures du jeu : fenêtre bornée par date pour les calculs à fenêtre, `count` serveur pour les cumuls | `src/data/jeu.ts`, `src/data/useJeu.ts` | livré |
| `BandeProgression`, à la place de `KpiBand` (supprimé) | `src/ui/BandeProgression.tsx` | livré — `computeKpis`, le type `Kpis` et les clés `today.kpi.*` sont retirés avec `KpiBand` |

**État de la suite à la fin du lot 3** : 462 tests dashboard, 339 tests collector, `pnpm -r typecheck` vert.

### L'amorçage de l'historique, et à partir de quand le jeu dira quelque chose de vrai

Relevé sur l'instance réelle, après application de la migration `pipeline_event`
(2 septembre 2026) :

| Table | Lignes |
|---|---|
| `prospect` | 139 |
| `prospect_score` | 129 |
| `prospect_pipeline` | 2 |
| `pipeline_event` | 2 — **toutes deux `amorcage`, aucune `observe`** |
| `interaction` | 0 |
| `deployment_event` | 0 |

**L'amorçage n'a produit que deux lignes**, parce que `prospect_pipeline`
n'en contenait que deux au moment de la migration. Le jeu n'a donc **aucun
fait observé** : ni relance tenue, ni rendez-vous, ni site mis en ligne
enregistré depuis un vrai changement de statut. L'écran le dit — objectif
« pas encore connue », aucun compteur de série — plutôt que d'inventer un
zéro qui se lirait comme un échec (voir la doctrine des absences distinctes,
docstring de `BandeProgression.tsx`).

**Le jeu ne dira quelque chose de vrai qu'à partir du moment où :**
1. de vrais changements de statut passent par `definirStatut` (tâche 5), qui
   écrit désormais `pipeline_event` avec `origin: 'observe'` — chaque clic
   sur l'écran en ajoute un ;
2. des interactions sont journalisées (`journaliserInteraction`), pour que
   « relance tenue » ait quelque chose à croiser ;
3. ces faits s'accumulent sur **plusieurs jours civils distincts** — l'objectif
   médian se calcule sur une fenêtre de 14 jours, et une série suppose des
   jours différents, pas plusieurs gestes le même jour.

Tant que ce n'est pas le cas, un écran qui affiche « pas encore de série » au
lieu d'un chiffre n'est pas cassé : il est simplement neuf. Ne pas le
diagnostiquer comme une régression au lot 4 sans avoir vérifié qu'un mois de
faits observés existe.

**Corollaire pour le collector.** Les vingt-deux sites déjà en ligne
(mentionnés au lot 2) n'ont toujours **aucun** `deployment_event` : la
table est vide. Le collector n'a pas tourné depuis sa création. La source de
points « site mis en ligne » que le lot 2 déclarait débloquée ne rapporte
donc rien pour l'instant — non par défaut de code (le chemin d'émission
existe, voir la table du lot 2 ci-dessus), mais faute de passage réel du
collector.

### Deux affirmations périmées, corrigées dans le code

Une dizaine d'endroits (`apps/dashboard/src`) portaient « 114 prospects sur
139 » ou une variante, datée du 1ᵉʳ septembre 2026 et devenue fausse dès le
lendemain — pire, la même phrase servait pour deux faits différents :

- « 114 sur 139 n'ont aucun **score** » → au 2 septembre 2026, il n'en reste
  que **10** (`prospect_score` compte 129 lignes) ;
- « 114 sur 139 n'ont aucune ligne de **pipeline** » → il y en a **137**
  (`prospect_pipeline` n'en compte que 2).

Les écrans calculaient déjà depuis les données réelles — rien n'était faux à
l'affichage, seuls des commentaires et des commentaires de test l'étaient.
Corrigés et datés (2 septembre 2026) dans : `domain/prospect.ts`,
`domain/today.test.ts`, `screens/TodayScreen.test.tsx`,
`ui/kit/Badge.test.tsx`, `ui/kit/StatusBadge.tsx`, `ui/ProspectRow.tsx` (+
son test), `ui/ScoreBar.test.tsx`, `ui/ScoreCompact.tsx` (+ son test),
`ui/BandeProgression.tsx` (le couple « 139 en base, 25 scorés au 1ᵉʳ
septembre » qu'y portait le récit de la suppression de `KpiBand` — corrigé en
139 / 129, les vraies valeurs à la date du retrait). Aucune assertion ne
dépendait de ces chiffres ; la suite reste verte à l'identique.

**Une troisième catégorie de phrases n'a pas été corrigée par un chiffre.**
`domain/coherence.test.ts` et `domain/prospect.ts` (docstring) portaient
aussi « 114 sur 139 » pour un troisième fait — l'absence des **trois**
satellites à la fois (enrichissement, présence **et** score, pas seulement le
score). Ce décompte combiné n'a pas été revérifié pour ce lot : rien dans les
données fournies ne permet de le recalculer sans l'inventer, et un score seul
(10) ou un pipeline seul (137) ne s'y substitue pas — l'intersection des
trois peut être n'importe quel nombre entre 0 et 10. Ces deux emplacements
sont désormais explicites sur ce point (chiffre daté du 1ᵉʳ septembre,
marqué non revérifié, renvoi ici) plutôt que silencieusement corrigés vers un
nombre inventé. **Les docs de planification** (`docs/superpowers/plans/*.md`)
portant les mêmes chiffres n'ont délibérément pas été touchées : ce sont des
spécifications datées, déjà exécutées, pas de la documentation vivante — les
corriger reviendrait à réécrire un historique qui était exact au moment où
il a été écrit.

### Une source de points restera muette tant qu'une migration ne la débloque pas

« **Relance tenue** » croise `pipeline_event.next_action_at` et
`interaction.occurred_at` : a-t-on relancé un prospect à la date où on avait
dit qu'on le ferait ? Aucun `count` PostgREST ne peut rendre ce croisement
(il exige de comparer deux tables ligne à ligne), et le compter sur une
fenêtre glissante ferait **reverrouiller un badge déjà acquis** — la ligne
rouge que ce lot s'est fixée dès le départ. Conséquences, écrites dans le
code et ici :

- `Palier.complet` (voir `domain/jeu.ts`) vaut `false` **en permanence** —
  pas une absence transitoire — et l'écran l'écrit sous la jauge : le score
  du palier omet cette source (40 points sur l'unité) ;
- le badge `premiere_relance_tenue` porte l'état **`non_mesurable`**
  (`EtatBadgeValeur`, troisième état, distinct de `verrouille`) : aucun
  geste de l'opérateur ne peut le débloquer, contrairement à un badge
  simplement `verrouille`.

**Ce qui le débloquerait** : une vue ou une fonction en base qui calcule ce
croisement côté serveur (PostgreSQL peut le faire ; PostgREST seul ne le
peut pas). Ce serait une migration de plus sur une instance de production,
et **cette décision n'a pas été prise dans ce lot** — elle reste à trancher
par un humain, au même titre que les deux décisions listées plus bas.

### Une vérification qui n'a pas pu être faite

`data/jeu.ts` borne sa lecture de `pipeline_event` par
`.or('occurred_at.gte.…,next_action_at.gte.…')`. La validité exacte de
cette chaîne PostgREST n'a **pas** été vérifiée contre une vraie instance —
seulement contre les tests, qui simulent le client. Le mode d'échec, si la
chaîne était mal formée, serait un rejet **bruyant** propagé par
`fetchAllRows` (une erreur réseau visible), pas une régression silencieuse :
si le jeu se met à échouer bruyamment plutôt que de lire moins que prévu,
regarder ici en premier. À fumer-tester au premier usage réel de l'écran
avec des faits observés.

### La largeur réelle de la colonne, et un angle mort de méthode

`ProspectPanel` fait 720 px et le rail 56 px : la colonne qui porte la liste
et la bande ne fait que **~664 px** sur un écran de 1440 px de large. Des
points de rupture exprimés en largeur de **fenêtre** ne s'y déclenchent donc
jamais. `BandeProgression` est passée en **requête de conteneur** pour cette
raison précise (voir son docstring). **Les autres composants de la colonne
n'ont pas été revus sous cet angle** — c'est une piste à vérifier au lot 4,
pas un défaut constaté.

Une leçon de méthode qui mérite sa place à côté du tableau des pertes plus
bas : **aucun test de ce dépôt ne voit une mise en page** — `jsdom` ne
calcule aucune géométrie. Trois défauts visuels de `BandeProgression` ont
traversé successivement 446, 460 puis 468 tests verts sans qu'aucun ne les
révèle ; c'est l'œil du propriétaire qui les a trouvés, à deux reprises.
C'est la même classe de trou que le tableau des pertes documente pour les
faits tombés en silence — sauf qu'ici, aucun test à écrire ne le comble : il
faudrait un outil qui calcule réellement une mise en page (Playwright, par
exemple), que ce dépôt n'a pas pour ses tests unitaires.

## Le jeu comptait les sites en ligne sur la mauvaise table

Trouvaille de l'utilisateur, après la revue finale de branche : la bande
annonce « +120 pts · site mis en ligne », un site **était** réellement en
ligne, et le score affichait zéro.

La cause n'était pas dans le calcul. `data/jeu.ts` comptait les sites sur
`deployment_event`. Le plan tenait cette source pour « débloquée par le
lot 2 », qui a créé la table et son couple `en_ligne` / `reussi` — vrai du
schéma, faux des données : **cette table ne se remplit qu'aux passages du
collector, et tout ce qui a été publié avant sa création n'y figure pas.**
Le handoff du lot 2 le disait déjà des sites vivants (« ils n'ont aucun
événement ») ; le jeu, lui, a quand même compté depuis là. Un jalon
réellement atteint rapportait donc zéro, sous une affordance qui promettait
le contraire — exactement la classe de défaut que ce chantier s'était donné
pour règle de ne plus produire. **Aucune revue ne l'a vu : toutes ont
confronté le code au plan, jamais aux données.**

Le compte se fait désormais sur **`prospect_site`**, qui porte l'état d'un
site pour tous les prospects — ceux d'avant la table d'événements comme ceux
d'après — et qui évite au passage le double comptage qu'un cumul des deux
sources produirait sur les sites à venir. Le critère est **`published_at` non
nul, sans regarder `unpublished_at`** : le jalon est « avoir mis un site en
ligne », pas « en avoir un en ligne maintenant ». Un retrait — un refus, ou
la péremption à 90 jours du chantier n°4 — ne défait pas le travail accompli,
et le compter ferait régresser le palier et reverrouiller un badge acquis.
`unpublish` n'efface jamais `published_at` : il n'écrit que `unpublished_at`.
Ce compte ne peut donc que croître.

**Relevé au 3 septembre 2026 :** `prospect_site` porte **une** ligne publiée,
toujours en ligne, et `deployment_event` est vide. La mention « vingt-deux
sites en ligne » héritée des lots précédents ne décrit donc pas l'état de
cette instance ; elle est conservée telle quelle dans les sections
antérieures, qui disent ce qui était vrai à leur date.

**La leçon, pour le lot 4 :** une table d'événements créée en cours de route
ne connaît pas le passé. Toute source de points, tout compteur, tout badge
adossé à `deployment_event` doit se demander si le fait qu'il mesure existait
avant elle — et, si oui, aller le chercher dans la table d'état.


## Ce que ce lot a fait tomber de l'écran — deux pertes, toutes deux délibérées

Une note distincte du tableau « Ce que la réécriture a fait tomber » plus
bas, qui documente une audit spécifique (la réécriture des sept sections en
quatre onglets, lot 1) et dont le décompte à trois ne doit pas être retouché.
Ce lot a son propre constat, plus court :

| Perdu | Nature | Sort |
|---|---|---|
| Code postal et ville, sur la ligne de liste | déplacé, pas perdu | `panel/FicheTab.tsx` affiche l'adresse complète dès l'ouverture du panneau (`{address}, {postalCode} {city}`) — la maquette ne les montre pas sur la ligne |
| « En base » (139) et « Qualifiés » (129), sur l'écran « Aujourd'hui » | perte réelle | Retirés avec `KpiBand` (tâche 8) ; `computeKpis`, le type `Kpis` et les clés `today.kpi.*` sont retirés avec lui. **Décision du propriétaire** : la maquette ne prévoit pas cette cellule, et c'était la quatrième d'une rangée qui n'en loge que trois dans la largeur réelle du conteneur (voir plus haut). Ces deux chiffres ne sont **plus visibles nulle part** dans le dashboard |

Le premier n'est donc pas une perte au sens du tableau plus bas — le fait
reste affiché, ailleurs. Le second l'est : contrairement au code postal, rien
ne restitue « en base » / « qualifiés », et ce n'est pas prévu de le faire.

## Ce que la réécriture a fait tomber — trois fois, pas une

La réécriture des sept sections empilées en quatre onglets a perdu des faits
en silence. Chaque perte a été trouvée par une lecture différente, jamais par
un test : **la suite était verte à chaque fois.**

| Perdu | Retrouvé par | Restitué |
|---|---|---|
| Carte « Présence web » | relecture de la tâche | `a388a9f` |
| Statut d'enrichissement (`ok` / `not_found` / `ambiguous` / `blocked`) | relecture de la tâche | `a388a9f` |
| Qualificatif du téléphone (`phoneKind` : mobile / fixe) | revue de branche | ce lot |

Le troisième est le plus coûteux des trois : `data/queries.ts` écrivait
`phoneKind`, `domain/prospect.ts` le typait, et `SCORING_RULESET.phone` payait
**20 points un mobile contre 10 un fixe** — mais `grep -rn "phoneKind"
apps/dashboard/src --include=*.tsx` ne rendait rien. Le panneau affichait donc
un score bâti sur une distinction qu'il refusait de montrer, sur l'écran dont
l'action principale est un `tel:`. C'est restitué dans `FicheTab.tsx`, à côté
du numéro, et un `phoneKind` nul ne porte aucune des deux étiquettes.

**Ne pas lire ce tableau comme clos.** Rien ne prouve qu'il n'y a pas de
quatrième. Le seul contrôle automatique qui existe désormais est celui des
clés i18n, décrit juste en dessous : il constate qu'une clé n'a plus de
consommateur, pas qu'un champ de la base a cessé d'être affiché.

### Les clés orphelines, et le test qui les voit

Quatre clés avaient survécu au lot 1 sans consommateur — trace exacte des
faits tombés de l'écran :

| Clé | Sort |
|---|---|
| `value.mobile`, `value.landline` | reconsommées par la restitution de `phoneKind` |
| `score.total`, `score.outOf` | supprimées des deux catalogues — `ScoreCompact` les a remplacées par `score.outOfShort` |
| `pipeline.nextAction` | supprimée aussi : orpheline antérieure au lot 1, trouvée par le même test |

`src/i18n/i18n.test.ts` porte maintenant un contrôle d'orphelines : toute clé
de `fr.ts` doit apparaître dans un `.ts`/`.tsx` de `apps/dashboard/src` hors
catalogues **et hors tests** — une clé citée seulement par un test a un témoin,
pas un consommateur. Deux exceptions, déclarées dans le fichier avec leur
raison : les formes `_one`, que `translate` dérive de la clé nue, et le
préfixe `interaction.kind.`, composé à l'exécution par `CLE_CANAL` dans
`PipelineSection.tsx`. Ajouter une composition dynamique impose d'ajouter sa
ligne à cette liste.

## Ce que Base UI ne fournit pas, contrairement à ce qu'on croyait

`Tooltip.tsx` justifiait sa dépendance à Base UI par quatre apports, dont
« la sémantique ARIA ». En écrivant les tests qui manquaient, on a constaté
que `@base-ui/react` 1.7.0 n'en pose aucune pour l'infobulle : la bulle sort
sans `role`, et le déclencheur sans `aria-describedby`. Une bulle visible à la
souris et muette au lecteur d'écran, c'est-à-dire inutile précisément là où
elle compte le plus.

Les deux attributs sont donc posés dans `Tooltip.tsx`, et l'état d'ouverture y
est contrôlé pour cette seule raison : `aria-describedby` ne doit désigner la
bulle que tant qu'elle est montée. Deux tests les tiennent. Les trois autres
apports (placement, délai anti-clignotement, ouverture au clavier) sont bien
là — la dépendance reste justifiée, sa justification était juste trop large.

## Ce qui est annoncé mais pas alimenté

Recensement exhaustif, refait à la fin du lot 2 : deux usages de `<Bientot>`
en dehors de sa propre définition et de ses tests
(`grep -rn "Bientot" apps/dashboard/src --include=*.tsx | grep -v "kit/Bientot" | grep -v ".test."`).
Ce sont deux usages différents de ceux du lot 1 — le journal de
`HistoriqueTab.tsx` a été retiré du recensement, le bouton « Vérifier » de
`GabaritScreen.tsx` y est entré.

| Zone | Fichier | Ce qui manque | Débloqué par |
|---|---|---|---|
| Bouton « Redéployer » | `src/ui/PanelActions.tsx` | `publish` et `deploy` ne s'appellent que depuis le collector en ligne de commande. Aucun déclencheur côté dashboard — voir la décision d'architecture juste en dessous. | Une file d'attente en base, si le besoin se confirme |
| Bouton « Vérifier » (le dépôt gabarit est-il accessible ? marqué « template » ? contient-il `src/content/site.json` ?) | `src/screens/GabaritScreen.tsx` | Le contrôle exige un jeton GitHub, qui n'a rien à faire dans un bundle navigateur. `site_template` porte déjà les trois colonnes du verdict (`checked_at`, `check_ok`, `check_detail`) — lues par `GabaritScreen`, purgées à chaque nouvelle désignation par `designerGabarit` (`src/data/mutations.ts`). **Mais à la fin de ce lot, aucun code du collector ne les écrit** : `cli.ts` appelle `lireGabaritActif` pour choisir quel dépôt cloner à la publication, rien de plus — aucune passe de contrôle GitHub n'existe encore côté collector. **Le motif affiché sous `Bientot` le dit maintenant** (`gabarit.verifier.raison`) : il annonçait auparavant que le contrôle « est fait par le collector à son prochain passage », ce qui envoyait l'opérateur relancer le collector pour revoir « jamais contrôlé » — une remédiation qui n'existe pas, pire qu'un « indisponible » générique. | Une passe de contrôle à écrire dans le collector ; hors périmètre de ce lot |

**Ce qui a disparu du recensement.** `HistoriqueTab.tsx` annonçait un journal
pas-à-pas sous `Bientot` faute de table d'événements. `deployment_event`
existe désormais (migration `20260902100000_deployment_event.sql`, tâche 1) ;
le composant affiche le vrai journal, trié par horodatage, à côté — pas à la
place — de la frise de jalons de `prospect_site`, qui porte des faits que les
événements ne rejouent pas pour les sites déployés avant la migration. Voir
son docstring pour le détail des trois autres partis pris (flux brouillon,
lecture en échec distincte d'un historique vide, cas des vingt-deux sites déjà
en ligne).

**Recensement inchangé à la fin du lot 3.** La même commande
(`grep -rn "Bientot" apps/dashboard/src --include=*.tsx | grep -v "kit/Bientot" | grep -v ".test."`)
rend exactement les deux mêmes lignes qu'à la fin du lot 2 : ce lot n'en a
ajouté aucune et n'en a retiré aucune. Le motif du bouton « Vérifier »
tient toujours pour la même raison — **aucun code du collector n'écrit
encore** `checked_at` / `check_ok` / `check_detail`
(`grep -rn "checked_at\|check_ok" apps/collector/src` ne rend que des
occurrences de `domain_checked_at`, une colonne distincte, sans rapport avec
le verdict de contrôle du gabarit). La passe de contrôle GitHub reste hors
périmètre.

## Le déclenchement depuis l'interface : un choix de ce lot, pas un oubli

Le dashboard **lit et enregistre** ; il n'appelle jamais GitHub ni Vercel.
`publish` et `deploy` ne s'exécutent que depuis le collector en ligne de
commande — c'est pour cela que « Redéployer » (`PanelActions.tsx`) reste
inerte, inchangé depuis le lot 1, et que « Vérifier » (`GabaritScreen.tsx`)
l'est aussi.

Ce n'est pas un oubli : c'est ce que gouverne la décision d'architecture du
chantier n°1 — « **Supabase + collector en ligne de commande, sans backend
applicatif** » (`docs/superpowers/specs/2026-09-01-socle-prospection-design.md`,
§2.2). Cette architecture supprime une couche API entière précisément parce
que le dashboard n'a besoin d'appeler rien d'autre que Supabase ; lui donner
un bouton qui déclenche `publish` ou `deploy` réintroduirait cette couche —
il faudrait soit exposer les jetons GitHub et Vercel au navigateur (exclu, ce
sont des secrets), soit poser une Edge Function qui les détient à sa place,
c'est-à-dire reconstruire le backend applicatif que la décision du chantier
n°1 a précisément retiré.

**La piste retenue si le besoin se confirme : une file d'attente en base**,
qu'un déclenchement depuis l'interface se contenterait d'écrire (« republier
ce prospect »), et que le collector, à son prochain passage en ligne de
commande, drainerait comme il draine déjà `prospect_site` ou
`prospect_pipeline`. Elle prolonge le modèle « Supabase + collector » au lieu
d'y ajouter une exception, et garde les jetons hors du bundle navigateur.
Rien de ce lot ne construit cette file — elle n'est pour l'instant qu'une
piste identifiée, pas commencée.

## Trouvaille du lot 2 : le gabarit désigné en base ne joue aujourd'hui aucun rôle

`GabaritScreen` enregistre un dépôt modèle dans `site_template`, et
`templateRepoFor` (`packages/core/src/trades.ts`) le consulte bien en niveau 2
de sa résolution, après le gabarit du métier et avant la variable
d'environnement — l'ordre documenté dans son propre docstring. Mais
`packages/core/src/trades.ts` déclare un `templateRepo` sur **les deux
métiers existants** :

```ts
{ slug: 'plombier', …, templateRepo: 'plombier' },
{ slug: 'serrurier', …, templateRepo: 'serrurier' },
```

Le niveau 1 l'emporte donc systématiquement pour `plombier` et `serrurier` —
`trade.templateRepo ?? defaut` ne retombe sur `defaut` (le gabarit désigné en
base, puis `PROSPEO_GITHUB_TEMPLATE_REPO`) que si le métier ne déclare rien.
Concrètement : **désigner un gabarit actif dans `GabaritScreen` aujourd'hui
n'a aucun effet observable**, parce qu'aucun métier de la base n'est dans ce
cas. L'écran enregistre une décision qui ne gouverne encore rien.

Ce n'est pas un défaut de code — c'est l'ordre de résolution fonctionnant
exactement comme conçu, qui rencontre des données qui le court-circuitent. Il
reste **une décision pour un humain**, pas quelque chose que ce lot tranche :

1. retirer `templateRepo` des déclarations de `plombier` et `serrurier` dans
   `trades.ts`, pour que le gabarit désigné en base gouverne effectivement les
   métiers déjà en production ;
2. ou accepter que l'écran ne gouverne, pour l'instant, que de futurs métiers
   qui ne déclareraient pas leur propre `templateRepo` — auquel cas
   `GabaritScreen` mérite une mention de cette portée réduite, au-delà de
   l'infobulle qui affiche déjà l'ordre de résolution.

**La mention de la seconde branche est écrite** (revue de fin de lot). La
carte « Gabarit actif » rend une phrase — `gabarit.actif.aucunMetier` — dès
que **tous** les métiers de `trades` déclarent un `templateRepo`, c'est-à-dire
exactement quand le gabarit désigné ne gouverne aucun métier existant.
`gabarit.subtitle` affirme qu'une désignation « substitue » le gabarit livré
avec l'application ; c'est faux pour 100 % du trafic actuel, et l'écran le dit
maintenant au lieu de le laisser croire. La phrase disparaît d'elle-même dès
qu'un métier hérite. **`trades.ts` n'a pas été touché** : quels métiers
déclarent leur propre gabarit reste la décision humaine ci-dessus, et le choix
1 la fait disparaître sans qu'aucun code ne change.

**Confirmée inchangée et non tranchée à la fin du lot 3.**
`git log --oneline -- packages/core/src/trades.ts` s'arrête à `9407a19`
(chantier 5, gabarit « Atelier »), un commit antérieur à ce lot — aucun commit
du lot 3 ne touche ce fichier. Les deux métiers déclarent toujours leur propre
`templateRepo`, la carte affiche toujours `gabarit.actif.aucunMetier`, et la
décision reste ouverte pour un humain, sans trace d'un tranchage silencieux.

## Ce qui n'est pas encore maquetté ni construit

| Sujet | Décision | Blocage |
|---|---|---|
| Série, objectif, palier, badges | D5 | **Livré au lot 3** (`domain/jeu.ts`, `data/jeu.ts`, `BandeProgression.tsx`) — voir « Ce qui est en place à la fin du lot 3 », plus haut. La question ouverte ci-dessous est résolue (option 1, table `pipeline_event`). Une source reste muette (« relance tenue ») faute d'une migration serveur supplémentaire — voir « Une source de points restera muette », plus haut. |
| Écran « Base » (les 139 prospects) | hors périmètre du chantier n°6 | — |

L'écran de suivi des déploiements (D9) et l'écran de gabarit GitHub (D10),
tous deux listés ici à la fin du lot 1 comme non construits, sont livrés — voir
« Ce qui est en place à la fin du lot 2 » ci-dessus.

## Le chantier suivant : la refonte de l'écran de déploiement

**Décidé par le propriétaire à la clôture du lot 3, pas encore planifié.**

`DeploiementDetail.dc.html` est **la seule maquette d'écran sans contrepartie
dans l'application**. Recensement fait à la clôture du lot 3 :

| Maquette | Dans l'application |
|---|---|
| `Main` | `TodayScreen` |
| `Deploiements` | `DeploiementsScreen` |
| `Gabarit` | `GabaritScreen` |
| `Composants` | le kit `src/ui/kit/` — un vocabulaire, pas un écran |
| `DirectionA` / `B` / `C` | études de direction, jamais destinées à être construites (D11 retient B) |
| **`DeploiementDetail`** | **rien** |

Elle n'a été rattachée à aucune tâche : le lot 2 a livré le tableau, le lot 3
couvrait l'écran de travail et le jeu. **Elle est tombée entre les deux** —
le même accident que le chrome de l'écran de liste, tombé entre le lot 1 et
le lot 3, et rattrapé par ce dernier. Ce n'est pas un défaut de D9, qui a
délibérément mis la cause d'échec *dans la ligne* plutôt que derrière un
journal à ouvrir ; c'est un artboard sans propriétaire.

Ce que la maquette montre et que l'application ne rend nulle part : le
déploiement d'un prospect vu **par déploiement** et non par prospect —
en-tête, état courant, les cinq étapes en frise avec le message de chacune,
un bouton d'annulation, et le journal de construction. Le chemin qui y
mènerait est le clic sur une ligne de `#/deploiements` ; aujourd'hui les
lignes ne sont pas cliquables, leur unique lien étant l'URL du site publié.

**Deux préalables, à peser avant d'ouvrir ce chantier :**

- `deployment_event` est **vide** sur l'instance : les cinq étapes détaillées
  en viennent, et l'écran n'aurait presque rien à afficher tant que le
  collector n'aura pas tourné. Voir plus haut, « le jeu comptait les sites en
  ligne sur la mauvaise table » — même piège, même table.
- Une partie du contenu existe déjà ailleurs : `panel/HistoriqueTab.tsx`
  affiche le journal réel des événements. Ce que le détail ajoute, c'est la
  vue par déploiement et la frise des étapes, pas le journal lui-même.


## Chantier n°7, lot 1 — la campagne : ce qui marche, et ce qui reste inerte

**Mesuré le 3 septembre 2026, pas supposé.** Ce tableau ne doit pas se lire
comme clos : il vieillit dès qu'un lot suivant est livré.

### Ce qui marche réellement

- **La file et le worker.** `prospeo worker` reste résident, écoute
  `campaign_job` en Realtime et balaye toutes les 30 s. Vérifié contre
  l'instance : un `INSERT` déclenche bien un réveil, le battement de
  `worker_heartbeat` avance toutes les 10 s, et la prise d'un job est
  conditionnée à son état — deux workers ne peuvent pas prendre le même.
- **La chaîne sur un prospect.** Éprouvée de bout en bout sur un prospect
  volontairement inéligible : le job est pris, la chaîne s'arrête au premier
  échec, **l'étape fautive est nommée** (`publish : aucun contenu à publier`)
  et le job est clos. Aucun appel GitHub, aucun jeton LLM dépensé.
- **L'écran, en lecture et en déclenchement.** Les vingt mieux notés, les
  trois segments, les huit états, la bande de conditions, et un bouton qui
  dépose une demande que le worker exécute.
- **L'unicité.** Un second job actif sur le même prospect est refusé en base
  (`23505`), et l'interface traite ce refus comme un succès — c'est la
  garantie qui joue son rôle, pas une panne.

### Ce qui est annoncé par la maquette et **pas encore alimenté**

| Zone | Ce qui manque | Débloqué par |
|---|---|---|
| Le panneau de relecture du mail | rien ne le construit ; l'écran n'a pas de panneau latéral | le lot « Google + envoi » |
| Le compte d'envoi Gmail dans la bande de conditions | `AuthProvider` ne connaît que `signInWithPassword` ; aucun jeton d'envoi n'existe | idem |
| Le destinataire | `prospect_contact` existe et **est vide** : aucun étage ne la remplit, et aucune saisie manuelle n'est construite | l'étage `contacts` + la saisie |
| La bande de campagne (anneau, compteurs, coût, suspension) | `campaign` existe et **est vide** : rien ne crée de campagne | le lot « campagne de 10 » |
| Le mode automatique et ses quatre bornes | rien | le lot « mode auto » |
| Le détail d'un déploiement au clic | `DeploiementDetail.dc.html` reste **la maquette sans écran** | le dernier lot |

**Aucune de ces zones n'est esquissée dans l'écran.** Pas d'emplacement grisé,
pas de bouton inerte : un « Détail » désactivé aurait annoncé un écran que ce
lot ne construit pas.

### `cost_eur` restera nul, et ce n'est pas un oubli

Les étages comptent des **jetons**, à trois tarifs distincts (entrée, écriture
de cache, lecture de cache, sortie). Rien dans ce dépôt ne porte de table de
prix. Convertir en euros demanderait d'en inventer une, c'est-à-dire de
produire un chiffre fondé sur rien. La colonne existe, elle reste nulle, et le
total d'une campagne devra s'annoncer **partiel** plutôt qu'exact.

### Le point ouvert qui devient bloquant au lot suivant

**La durée de vie réelle du `provider_token` Google n'a pas été mesurée** —
le lot 1 n'ouvre aucune session Google. Supabase ne renouvelle pas ce jeton, et
le comportement exact dépend de la version de `supabase-js` (`^2.45.0` ici).
Le rendu de l'état « jeton expiré » en dépend, et il se mesure au plus tard à
l'entrée du lot « Google + envoi ». **À mesurer, pas à supposer.**

### Un arbitrage rendu, et sa trace

« Site en panne ou obsolète » s'affiche en **vert**. `TON_PRESENCE`
(`ui/presence.ts`, extrait de `panel/FicheTab.tsx` à ce lot) fait suivre au
ton la **valeur de vente** et non la qualité du site : un site mort est une
meilleure cible qu'un site vivant, et `has_site` vaut -100. `Campagne.dc.html`
le dessinait en rose ; le propriétaire a tranché pour le vocabulaire du kit, et
**la maquette a été corrigée**, raison écrite à l'intérieur.

### Ce qu'aucun test ne verra jamais, et ce que le jalon a trouvé

Le tableau portait **trois en-têtes pour quatre colonnes**. En
`table-layout: fixed`, ce sont les cellules de la première rangée qui fixent
les largeurs : la colonne d'actions n'en recevait aucune et absorbait 347 px au
lieu de 96, éloignant les boutons de l'état qu'ils commentent et coupant le
filet des en-têtes en plein milieu. **524 tests verts ne l'ont pas vu**, et
`jsdom` ne pouvait pas le voir. C'est le quatrième défaut de mise en page de ce
dépôt trouvé en regardant l'écran plutôt qu'en lisant du code.

## Chantier n°8, étape 1 — le cloisonnement : ce qu'il protège, et ce qu'il ne protège pas

**Appliqué à l'instance le 3 septembre 2026.** Ne pas lire ce tableau comme clos.

### Ce qui est protégé, et prouvé

`prospect` et `campaign` portent un `owner_id` ; `campaign_job` emploie
`requested_by` ; les onze satellites déduisent le propriétaire par une
remontée indexée. Quinze politiques remplacent les anciens
`authenticated_all using (true)`.

**Prouvé dans les deux sens**, avec la clé publique et une vraie session —
jamais avec `service_role`, qui contourne RLS et ferait passer n'importe quoi :

- un compte témoin voit **sa** ligne sur `prospect` et **zéro** sur les treize
  autres tables ;
- écrire sur le prospect d'un autre est refusé (`with check`, pas seulement
  `using`) ;
- déposer un job en usurpant l'identifiant d'un autre est refusé (`42501`) ;
- le **même SIRET** appartient désormais à deux propriétaires — c'est
  l'exception doctrinale du chantier, et elle sert.

Le contrôle vit dans `scripts/verifier-cloisonnement.mjs` et se rejoue à
chaque chantier qui touche aux politiques.

### Ce qui n'est PAS protégé, et c'est le point important

**La RLS ne protège pas le collector.** Il emploie la clé `service_role`, qui
la contourne par construction. Aucune politique ne le retiendra jamais, et
**aucun test ne verra une lecture oubliée** : `service_role` ne lève pas, il
rend simplement plus de lignes.

La seule barrière est un filtre explicite, posé sur les 42 lectures recensées
(`grep -rn "\.from('" apps/collector/src --include=*.ts | grep -v test` en
rend 44, dont 2 sont des objets de l'application).

**La forme du filtre a dû être mesurée, pas raisonnée.** Sans `!inner`, un
filtre sur une relation embarquée ne restreint pas les lignes de la table
principale — il vide seulement la relation. Mesuré contre l'instance : un
propriétaire étranger voyait **2 lignes sur 2** de `prospect_site` et **109**
de `web_presence` ; avec `prospect!inner()`, zéro. C'est la panne silencieuse
type de ce chantier.

### Le trou connu, borné, à fermer

**`site_template` reste écrite par n'importe quel utilisateur authentifié.**
Le spec prévoyait de la passer en lecture seule ; `designerGabarit`
(`dashboard/src/data/mutations.ts`) y écrit, et la verrouiller aurait laissé
l'écran « Gabarit » avec un formulaire que la RLS refuse — l'affordance que la
doctrine interdit.

Un utilisateur pourrait donc **repointer le gabarit de tous**. Borné
aujourd'hui : un seul compte réel, et le changement est visible et réversible.
**À fermer quand une distinction administrateur existera** — pas avant, sous
peine de casser un écran pour rien.

**`worker_heartbeat` reste lisible par n'importe quel utilisateur
authentifié**, de la même façon et pour la même raison (`FORME 3` de
`supabase/migrations/20260904092000_politiques_cloisonnees.sql`) : ligne
unique (`worker_heartbeat_singleton check (id)`, migration
`20260903090000_campagne_file.sql`), elle décrit un processus et
n'appartient à aucun client — C4 l'exclut donc du filtrage par propriétaire,
comme `site_template`.

Or D8 prévoit **un worker par utilisateur**. Au deuxième compte, deux workers
écriront tour à tour la même ligne unique, et l'écran « Campagne » de chacun
(`apps/dashboard/src/data/campagne.ts`) lira un `beat_at` et un `in_flight`
qui peuvent être ceux de l'autre worker. « Le collector est à l'écoute »
deviendrait alors une affordance qui annonce un fait qu'aucun code ne rend
vrai.

Borné aujourd'hui pour la même raison que `site_template` : **un seul compte
réel, donc un seul worker, donc une seule ligne qui ne peut être que la
sienne** — la lecture large ne change rien à ce que l'écran affiche. **À
fermer quand l'étape « worker par utilisateur » de D8 sera posée** : elle
demande une ligne par propriétaire (une clé primaire `owner_id` plutôt que le
singleton actuel) et un filtre sur `campagne.ts`, pas avant, pour la même
raison que `site_template` — fermer un trou sans client pour l'ouvrir ne fait
que déplacer le risque.

### Une leçon de méthode, payée dans ce chantier

`pnpm -r typecheck` a été annoncé vert au départ d'une tâche alors qu'il était
**déjà rouge** : la migration venait de rendre `owner_id` obligatoire, et
`discover.ts` insérait sans lui. L'état avait été vérifié **avant**
l'application, pas après. **Après toute migration suivie de `db:types`, le
typecheck se revérifie** avant d'annoncer quoi que ce soit.

## Chantier n°8, étape 2 — le coffre à jetons : ce qu'il protège, et ce qu'il ne protège pas

**Appliqué à l'instance le 3 septembre 2026.** Spec :
[`2026-09-03-coffre-jetons-design.md`](../superpowers/specs/2026-09-03-coffre-jetons-design.md).
Plan : [`2026-09-03-coffre-jetons.md`](../superpowers/plans/2026-09-03-coffre-jetons.md).
Ne pas lire ce tableau comme clos.

### Ce qui est protégé, et prouvé contre l'instance réelle

`connexion_plateforme` (état, lisible par son propriétaire — lecture SEULE,
jamais écrite depuis le dashboard) et `connexion_secret` (le triplet chiffré
AES-256-GCM, RLS activée, **aucune politique**) existent
(`supabase/migrations/20260905090000_coffre_jetons.sql`). Le chiffrement vit
dans `apps/collector/src/coffre.ts` (`chiffrer`, `dechiffrer`, `jetonDe`,
`lireCleMaitresse`) : module pur, sans base ni réseau, dont la clé maîtresse
vient de l'environnement du collector (`PROSPEO_COFFRE_CLE`) et **jamais** de
la base — une copie complète de la base ne vaut donc rien sans cette clé.

**Prouvé de bout en bout, contre l'instance réelle, pas seulement en test
unitaire :**

- un secret réel, chiffré puis écrit avec `service_role`, se relit identique
  via `jetonDe` avec la même clé ;
- un octet altéré dans `chiffre` fait échouer le déchiffrement et **marque la
  connexion `indechiffrable` en base**, avant que `jetonDe` ne rende son
  échec — jamais un silence ;
- en session témoin, clé publique : `connexion_plateforme` se lit (c'est un
  fait qu'un écran doit pouvoir montrer), mais `connexion_secret` reste
  **invisible même pour son propre propriétaire**, alors que la ligne existe
  et lui appartient — c'est la preuve qui compte, une politique manquante ne
  lève pas, elle rend zéro ligne, et seule une écriture préalable la rend
  probante. Le contrôle vit dans `scripts/verifier-cloisonnement.mjs`.

**Une politique corrigée en relecture, avant application, comme
`site_template` à l'étape 1.** Le SQL transcrit initialement donnait à
`connexion_plateforme` une politique `for all`, par imitation de
`prospect`/`campaign`. Le spec (V5) est explicite : le dashboard n'écrit
JAMAIS cette table, les connexions arrivent par les rappels OAuth traités
côté collector. Une politique `for all` aurait laissé un utilisateur
s'auto-déclarer connecté sans jamais passer par l'échange OAuth —
l'affordance que la doctrine interdit. Corrigée en `for select` avant
application, dans le SQL et dans le plan.

### Ce qui n'est PAS encore construit, et c'est le point important

**Rien n'écrit encore de vrai jeton.** Aucune GitHub App, aucune intégration
Vercel, aucun rappel OAuth n'existe : la ligne du témoin dans
`connexion_secret` est une fixture de contrôle (`chiffre`/`vecteur`/
`etiquette` valant `\x00`), pas une vraie connexion. Recevoir un rappel OAuth
suppose un serveur HTTP que le collector n'a pas — c'est le premier endroit
du projet où « pas de backend applicatif » devient contraignant, à trancher à
l'étape 3, pas avant.

**`loadCoffreConfig` (`apps/collector/src/config.ts`) n'est appelé nulle
part.** Décision délibérée de la Tâche 3 : aucune commande de `cli.ts` ne
manipule encore de jeton, l'exiger partout casserait `discover`, `enrich`,
`probe` et `score` pour un coffre dont ils n'ont pas besoin. `cli.ts` sera le
premier endroit qui assemble un `CoffreDeps` réel à partir d'un client
`service_role`, le jour où une commande en a besoin.

**Aucun processus de péremption n'existe.** `jetonDe` peut lire le jeton
d'un utilisateur absent depuis des mois (critère de succès n°5 du spec,
prouvé par construction — `jetonDe` ne dépend d'aucune fraîcheur de
connexion), mais rien ne l'appelle en continu : ni où ce processus doit
tourner, ni sous quel ordonnanceur n'est tranché (§7 du spec).

**Aucun écran ne montre les connexions.** Le critère de succès n°3 du spec
(« l'utilisateur voit quels comptes sont connectés ») est **délibérément
reporté à l'étape 3** — sans intégration réelle, un tel écran ne pourrait
dire que « aucun compte », sans aucun moyen d'y changer quoi que ce soit. La
doctrine du dépôt interdit de plus un composant important sans maquette
approuvée ; aucune maquette n'existe encore pour cet écran.

## Chantier n°8, étape 3 — le relais OAuth : ce qui connecte, et ce qui ne rebranche rien

**Déployé le 4 septembre 2026.** Spec :
[`2026-09-03-relais-oauth-design.md`](../superpowers/specs/2026-09-03-relais-oauth-design.md).
Plan : [`2026-09-03-relais-oauth.md`](../superpowers/plans/2026-09-03-relais-oauth.md).
Ne pas lire ce tableau comme clos.

### Ce qui est prouvé, contre GitHub et Vercel réels

Un utilisateur clique un lien (`/api/connecter?plateforme=…&owner=…`),
installe la GitHub App ou autorise l'intégration Vercel sur SON propre
compte, et `connexion_plateforme` porte une vraie connexion — `reference`
pour GitHub (l'`installation_id`, non secret), `connexion_secret` chiffré
pour Vercel. Prouvé le 4 septembre 2026 par le propriétaire, contre les deux
plateformes réelles : `connexion_plateforme` porte deux lignes (`vercel`
avec `connexion_secret` associé, 60 octets qui ne se déchiffrent pas en
texte lisible ; `github` avec `reference = 159129996`, sans
`connexion_secret` — rien à chiffrer). Le `state` signé (HMAC-SHA256, dix
minutes de validité) protège les deux flux contre la falsification d'un
`owner_id`.

### Une limite Vercel découverte au premier déploiement, pas anticipée par le plan

**Un projet Vercel dont le Root Directory est `apps/relais-oauth` ne peut
accéder à AUCUN fichier en dehors de ce dossier** — documenté par Vercel,
y compris contre `..`. `packages/coffre` (le chiffrement, chantier n°8
étape 3) est un paquet frère, donc hors de portée. Le premier déploiement a
échoué net : `FUNCTION_INVOCATION_FAILED`, `ERR_MODULE_NOT_FOUND` sur
`@prospeo/coffre/src/index.ts`.

Le dashboard n'avait jamais heurté cette limite : il importe `@prospeo/db`
uniquement pour des **types**, effacés à la compilation — jamais de code
exécuté. Le relais, lui, appelle `chiffrer`/`lireCleMaitresse` pour de vrai,
à l'exécution. **`apps/relais-oauth/src/coffre.ts` est désormais une copie
délibérée** de `packages/coffre/src/coffre.ts`, commentée comme telle, avec
le devoir de synchroniser les deux si l'algorithme change. Le collector n'est
pas concerné : il tourne en local, jamais sur Vercel.

**Pour tout paquet Vercel-déployé futur de ce dépôt** (Root Directory dans ce
monorepo) : un paquet partagé (`packages/*`) ne peut y être consommé que pour
ses **types**. Du code exécuté à l'exécution doit être vendoré, ou le paquet
partagé doit gagner un vrai build compilé avec une stratégie d'inclusion —
non résolu ici, juste contourné.

### Ce qui n'est PAS encore construit, et c'est le point important

**`publish.ts`/`deploy.ts` n'ont pas changé.** La chaîne de déploiement
continue d'utiliser `GITHUB_TOKEN`/`VERCEL_TOKEN`, les secrets partagés —
une vraie connexion existe désormais dans `connexion_plateforme` sans que
rien dans le collector ne la lise encore. Rebrancher la chaîne attend D8 (un
worker par utilisateur).

**Aucun écran dashboard.** Toujours reporté, comme à l'étape 2 — même
raison (pas de maquette approuvée pour un composant important).

**Un risque résiduel assumé par le spec, pas par l'implémentation.** La
GitHub App est volontairement sans OAuth utilisateur à l'installation (§2 du
spec de l'étape 3) : rien ne lie cryptographiquement l'`installation_id` reçu
à l'utilisateur qui vient de l'installer — seul le `state` garantit que
*quelqu'un* de légitime a initié la demande, pas que l'installation
désignée est la sienne. Trouvé en revue finale de branche. **Impact nul
aujourd'hui** (rien ne lit encore `reference` pour agir) ; **deviendra réel**
le jour où la chaîne de déploiement lira les connexions GitHub — à fermer à
ce moment-là, pas avant.

**Aucun processus de péremption n'existe.** Inchangé depuis l'étape 2.

## Chantier n°8, étape suivante — le worker par utilisateur : ce qui résout, et ce qui reste manuel

`chaineDeps.publier()`/`.deployer()` résolvent maintenant le jeton et le
compte de LEUR utilisateur — un jeton d'installation GitHub fabriqué à la
demande (`jetonInstallationGithub`, jamais stocké), le jeton Vercel déchiffré
du coffre (`jetonDe`, en service depuis cette étape après deux étapes sans
appelant). Un bug latent trouvé au passage : `jetonDe` aurait marqué à tort
une connexion GitHub saine comme `indechiffrable`, faute de secret à
déchiffrer côté GitHub App — corrigé en donnant à GitHub sa propre fonction
de résolution plutôt que de réutiliser celle de Vercel. Les messages d'erreur
adressés à l'utilisateur (GitHub et Vercel) traduisent désormais les états
`revoquee`/`indechiffrable` en français correct via `libelleEtatConnexion`,
plutôt que d'interpoler le slug technique brut.

`worker_heartbeat_utilisateur` remplace le singleton pour le worker de
campagne ; `worker_heartbeat` ne se supprime pas (le dépôt l'interdit) et
reste disponible pour un usage futur (D10, ou un diagnostic global).

**Le superviseur existe, l'hébergement non.** `superviseur` (nouvelle
commande du collector) démarre/surveille/arrête un `worker --owner <uuid>`
par utilisateur éligible (GitHub et Vercel actifs), à base de
`child_process` — portable tel quel vers n'importe quel hôte. Deux chiffrages
faits pendant le brainstorming, à réutiliser plutôt qu'à refaire : Fly.io
Machines coûte environ 2 à 3 \$/mois par utilisateur pour un process léger
toujours allumé (donc linéaire avec le nombre de clients) ; un VPS à coût
fixe (~6-12 \$/mois) héberge plusieurs dizaines de ces process via
`pm2`/`systemd`, au prix d'un isolement plus faible. **Aucun des deux n'est
choisi** — décision reportée, avec de vrais tarifs clients en main.

**Ce que cette étape laisse délibérément de côté :**
- Les commandes batch `publish`/`deploy` de `cli.ts` (lignes 1619 et 1668)
  gardent leurs jetons globaux (`GITHUB_TOKEN`/`VERCEL_TOKEN`) — hors
  périmètre, sans lien avec la file de campagne.
- La péremption (D10) — un processus distinct, à l'application, qui lit le
  coffre pour un utilisateur disparu. Le superviseur ne le remplace pas
  (§6 bis du spec multi-utilisateur : les deux exécutants sont nécessaires).
- Aucun nouvel écran : seul `fetchHeartbeat` est rebranché, l'écran de
  campagne affiche la même chose, pour le bon utilisateur.
- La ligne de témoin de l'étape 1 (`b81c0bf1-…`, `vercel` seul, fixture de
  `verifier-cloisonnement.mjs`) reste en base, inerte pour ce chantier
  puisqu'elle n'a pas les deux plateformes actives — signalée, pas nettoyée.
- Deux fenêtres de course théoriques, trouvées en revue (Tâche 7) : (1) deux
  balayages `balayer()` se chevauchent si l'un est anormalement lent ;
  (2) un process fraîchement redémarré peut être tué à tort si son battement
  est lu avant sa première écriture. De faible probabilité (le délai de backoff
  minimal, 5 secondes, très supérieur à la durée d'un aller-retour base de
  données) et non corrigées à ce stade. Une piste existe : comparer
  l'identité du process — par exemple son `pid` — plutôt que de raisonner
  uniquement sur l'`ownerId`, pour éviter qu'une décision fondée sur un cycle
  de balayage antérieur ne s'applique à un process relancé entre-temps.

## Chantier n°8 mis en pause le 5 septembre 2026 — où il s'arrête, et ce qu'il laisse ouvert

**Décision du propriétaire, et sa raison :** il est encore le seul utilisateur.
Avant d'engager une dépense d'infrastructure (hébergement des workers, proxys
résidentiels), il veut prouver que l'application marche de bout en bout et
rapporte. Le chantier n°7 (campagne de prospection) reprend donc à son lot 4,
et le n°8 attend.

**Rien n'est à annuler.** Les quatre étapes livrées — cloisonnement RLS, coffre
à jetons, relais OAuth, worker par utilisateur — sont correctes pour un seul
utilisateur : un utilisateur unique reste un utilisateur. Aucune infrastructure
n'a été engagée, aucune des décisions d'hébergement n'a été prise. Le
superviseur existe mais reste facultatif : `worker --owner <uuid>` lancé à la
main fait le même travail pour un compte.

**LE PIÈGE, PAYÉ UNE FOIS — à vérifier avant de croire à une panne.** La
dernière étape a fait lire les jetons dans le coffre plutôt que dans le `.env`.
Trois variables sont donc devenues obligatoires dans l'environnement du
collector, et ne l'étaient pas avant : `PROSPEO_COFFRE_CLE`,
`PROSPEO_GITHUB_APP_ID`, `PROSPEO_GITHUB_APP_PRIVATE_KEY`. Sans elles, le
worker échoue à l'étape `publish` avec « Configuration incomplète pour l'étage
« worker » » — alors que les commandes batch `publish`/`deploy`, restées sur
les anciens `GITHUB_TOKEN`/`VERCEL_TOKEN`, continuent de marcher. Le contraste
entre les deux est exactement ce qui rend la panne déroutante. Les valeurs sont
celles du projet Vercel `prospeo-relais-oauth` ; `PROSPEO_COFFRE_CLE` doit être
**identique**, sinon le jeton Vercel chiffré ne se déchiffre plus.

### Ce qui reste ouvert, dans l'ordre où il faudra le reprendre

1. **La seconde file et l'enrichissement par tranches** (D7, D4, D9) — le
   brainstorming était commencé quand la pause a été décidée. Deux points y
   avaient déjà été tranchés : l'enrichissement hébergé passera **derrière des
   proxys résidentiels** (une IP de sortie par utilisateur), et le worker
   vérifiera la file de campagne **entre chaque prospect enrichi** plutôt qu'en
   fin de tranche — le grain d'interruption devient ~17 s au lieu de 14 min.
2. **La péremption** (D10) — le seul mécanisme qui fasse tenir D5 du chantier
   n°4 (un site publié au nom d'un tiers ne doit pas vivre sans surveillance).
3. **L'hébergement** des workers, et **Google** au-delà de 100 utilisateurs.

### Trois mesures faites le 5 septembre 2026, à ne pas refaire de mémoire

Le scraping Google Maps, mesuré avec Playwright sur six navigations réelles :

| Mesure | Valeur |
|---|---|
| Première navigation (amorçage, cache froid) | **1,13 Mo** |
| Navigations suivantes (régime marginal) | **0,48 Mo** en moyenne |
| Par prospect (2 à 4 navigations) | **~1,4 Mo** |

Ce que ça coûte derrière un proxy résidentiel, aux prix du marché
(1,50 à 8 $/Go, relevés le 5 septembre) : **moins de 0,60 $** pour les 50
prospects d'un premier lot, **1 à 4 $** pour un arrondissement (354), et
**8 à 33 $** pour Marseille entier (2 934). L'enrichissement proxifié est donc
abordable — c'était l'inconnue qui pouvait renverser le choix.

**Et une optimisation écartée par la mesure, pour qu'on ne la réécrive pas :**
bloquer images, fontes et médias dans Playwright ne fait gagner que **4 %**.
En `waitUntil: 'domcontentloaded'`, Maps ne charge jamais ses tuiles ; le poids
est dans les scripts et le document. Le cache du profil persistant, lui, vaut
cher : il divise par deux le coût d'une navigation. Un profil par utilisateur,
gardé entre les tranches, n'est donc pas seulement une nécessité technique
(`launchPersistentContext` verrouille son répertoire) — c'est aussi ce qui
tient la facture.

**Le risque qui reste entier, et qui devra être tranché avant d'ouvrir :** avec
N workers sur une seule machine, N clients scrapent Google depuis **une seule
IP**. Le spec du chantier n°1 assumait le risque de blocage pour un opérateur ;
ici un blocage arrêterait tous les clients à la fois. Les proxys résidentiels
sont la réponse retenue, non encore implémentée.

## L'appariement, mesuré le 5 septembre 2026 — le vrai goulot du produit

**Ce qui a déclenché la mesure.** Le propriétaire demandait une API qui
fournirait les emails des prospects, la saisie à la main lui paraissant
irréaliste. La réponse est non, et la recherche a trouvé bien plus grave.

### Aucune source ne porte les emails de cette population

| Source | Emails ? |
|---|---|
| API publique Recherche d'entreprises (Etalab) | **aucun champ** — vérifié sur un SIRET réel |
| Pappers (INSEE, INPI, BODACC, greffes) | **aucune donnée de contact**, ils le disent |
| Hunter / Dropcontact / Snov | travaillent **à partir d'un domaine** — 109 prospects sur 139 n'en ont aucun |
| Google Maps | n'expose jamais d'email |

Ces adresses n'existent dans aucune source interrogeable. Inutile de
rouvrir la question sans élément neuf.

### Le vrai goulot : 90 prospects sur 139 rejetés par l'appariement

| Statut d'enrichissement | Prospects |
|---|---|
| `not_found` | **90** |
| `ok` | 39 (dont 37 avec téléphone) |
| `ambiguous` — **en attente de `review`** | 10 |

**Et sur ces 90 « introuvables », ZÉRO n'est réellement absent de Google
Maps.** Tous ont reçu entre 5 et 12 candidats ; l'appariement les a tous
rejetés. `calibrate` chiffre les éliminations : **676 par le rayon, 147 sous
le seuil bas**.

Deux causes distinctes, toutes deux dans `packages/core/src/matching.ts` :

1. **Le rayon de 1 km (`maxDistanceM: 1000`) est trop serré.** Des plombiers
   nantais, catégorie confirmée, sont écartés à 1 858 m, 2 320 m, 2 764 m. Le
   siège social d'un artisan est souvent son domicile, sa fiche Maps son
   atelier.
2. **Le nom pèse 0,65 et vaut ~0 pour cette population.** Le motif récurrent
   est « nom : aucune variante exploitable ». Le SIRET dit `SARL ALLARD`,
   `EPB`, `HYDROVOLT` ; Maps affiche `AB Plomberie`, `Ze Plombier - Nantes`.
   Le nom légal et le nom commercial n'ont souvent rien à voir.

### L'appariement par adresse : un gain réel, partiel, et sous-estimé

Mesuré hors ligne sur les candidats déjà en base (`prospect_enrichment.candidates`
porte l'adresse Maps, le téléphone, la note et le `placeId` — aucun scraping
n'est nécessaire pour rejouer) :

- **17 prospects** ont un candidat à l'adresse exacte (numéro + voie + code
  postal) ; **5** survivent en plus au contrôle de catégorie.
- Les récupérations sont de bonne qualité : `ZE SERVICES (ZE PLOMBIER)` →
  `Ze Plombier - Nantes`, `LES ATELIERS DE SAULE` → `SAULE PLOMBERIE`,
  `BELKACEM ABDOUS (SERF DEPANNAGE PLOMBERIE)` → `Service Dépannage
  Plomberie Chauffage`.
- **Le contrôle de catégorie rejette de vraies correspondances** : `BELENOS`,
  enregistré « BELENOS SERRURERIE, BELENOS PLOMBERIE », est écarté parce que
  Maps le classe « Serrurier ». Idem `REYDEL ENERGIE` → `Reydel ECS.
  Électricité-Plomberie`. Un artisan multi-métiers est la norme.
- **83 sur 100 n'ont aucun candidat à leur adresse** : pour eux l'adresse du
  SIRET est le domicile du gérant ou le cabinet comptable. L'appariement par
  adresse ne les débloque pas.

**Le chiffre de 17 est SOUS-ESTIMÉ, et le piège est instructif.** L'adresse
SIRET porte souvent un préfixe avant le numéro de voie — `BUREAU 3 2 PLACE
JEAN V`, `PORTE 64 11 RUE FELIBIEN`, `ETAGE 1 APPT 59 5 RUE ANITA CONTI`,
`ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX`. Prendre « le premier nombre »
donne le bureau, l'étage ou l'appartement, jamais la rue. Une implémentation
sérieuse doit ignorer ces préfixes, et gérer `71b` / `30 bis`.

### Les 39 appariements existants sont JUSTES — vérifiés un par un

31 concordent sur l'adresse **et** le nom. Les 8 restants ont été inspectés à
l'œil : **tous corrects**, les signalements venant du bug de préfixe
ci-dessus. **Aucun faux positif trouvé.**

C'est le constat le plus utile de cette mesure : le matcher se trompe en
**refusant**, jamais en acceptant. C'est le bon sens de l'erreur vu l'enjeu
(un site publié au nom de la mauvaise entreprise, D5 du chantier n°4) — et
cela autorise à desserrer les seuils avec bien moins de risque qu'il n'y
paraissait.

### Ce qui reste à faire, et n'est pas fait

Un chantier « appariement » : une seconde voie fondée sur l'adresse exacte,
un contrôle de catégorie qui accepte les métiers connexes, et un rayon
desserré — chaque changement mesuré par `calibrate` **avant** d'être
appliqué. Et, gratuitement, les **10 `ambiguous` qui attendent déjà**
`prospeo review`.

### Résolu — la voie adresse, livrée et mesurée le 5 septembre 2026

`packages/core/src/address-match.ts` ajoute une seconde voie de décision : à
l'adresse postale exacte (même numéro, même voie, même code postal) et pour
une catégorie Google qui est **un** métier du bâtiment, un candidat unique
emporte la fusion. Elle ne transforme qu'un `not_found` en `ok` — elle ne
dégrade aucun verdict et n'alimente pas la file de revue.

**Mesuré par `calibrate` sur les 139 prospects, sans une requête Google : 5
fusions gagnées**, relues une par une. La répartition passe de 39 / 10 / 90 à
**44 fusionnés / 10 à trancher / 85 introuvables** — les dix `ambiguous` sont
exactement les mêmes, comme promis.

Les cinq, avec ce qui les a décidées :

| Prospect (SIRET) | Fiche retenue | Distance | Catégorie |
|---|---|---|---|
| LES ATELIERS DE SAULE — 43 rue du Maine | SAULE PLOMBERIE, 43 Rue du Maine | 10 m | Plombier |
| SARL AUBINEAU PLOMBIER CHAUFFAGISTE — 18 rue de la Conardière | Plombier Nantes - BON PLOMBIER, **18b** Rue de la Conardière | 13 m | Plombier |
| EMERS — 20 avenue Petit Breton | Roussel Marc Winbrase, 20 **Av.** Petit Breton | 12 m | Plombier |
| BELKACEM ABDOUS (SERF DEPANNAGE PLOMBERIE) — 19 rue Claude et Simone Millot | Service Dépannage Plomberie Chauffage | 21 m | Chauffagiste |
| GROUPE AMH (RABIER JEAN-MARIE) — 22 **mail** Pablo Picasso | Les Gars des Eaux | 22 m | Plombier |

Trois des quatre pièges de normalisation ont réellement servi : le suffixe de
numéro (`18` contre `18b`), l'abréviation de type de voie (`Av.`), et un type
de voie peu courant (`mail`). Sur les cinq, **le nom ne vaut rien dans trois
cas** — c'est exactement la panne que ce chantier visait.

`LES ATELIERS DE SAULE` est figée en test de régression dans
`matching.test.ts`, avec ses vraies chaînes et ses vraies coordonnées.

Ce que cette voie **ne** résout **pas**, et qu'il ne faut pas croire réglé :

- **`BELENOS` reste `ambiguous`.** Son unique candidat note 0,736, au-dessus
  du seuil bas : le verdict n'est pas `not_found`, et la voie adresse n'y
  touche pas par construction. Il se tranche par `prospeo review`, comme les
  neuf autres. Le spec citait ce cas comme justification de la lecture
  élargie de la catégorie ; la lecture élargie le retient bien — un test le
  prouve — mais c'est le statut de départ qui n'était pas celui qu'on croyait.
  **Étendre la voie aux `ambiguous` fusionnerait BELENOS** : la mutation l'a
  vérifié. C'est une décision, pas un oubli, et elle appartient au
  propriétaire.
- **80 prospects sur 139 restent introuvables.** Pour eux, aucun candidat n'est
  à l'adresse Sirene : c'est le domicile du gérant ou le cabinet comptable.
- **La latitude prise sur le rayon n'a rien rapporté.** La voie adresse
  regarde tous les candidats, y compris ceux que les 1 000 m écartent ; les
  cinq fusions sont pourtant toutes à moins de 25 mètres. La règle reste
  juste — une adresse identique à 2 km dit qu'un géocodage est faux — mais
  elle n'a pas été exercée ici.
- **Deux risques restent ouverts et non couverts** : un second artisan du
  bâtiment à la même adresse dont un seul figure parmi les candidats (A4 ne le
  voit pas, il n'y a qu'un candidat) ; et une adresse de comptable partagée
  par plusieurs entreprises clientes.
- **La confiance écrite sur une fusion par l'adresse est celle du score, et
  elle est basse** — 0,34 à 0,51 pour les cinq. C'est voulu : la voie adresse
  décide à côté du score, pas dedans, et lui donner des points la ferait
  produire des `ambiguous`, ce que sa décision fondatrice lui interdit. La
  fiche du dashboard affichera donc un badge « alerte » sur ces appariements —
  c'est une invitation à la relecture, pas un défaut.

**État d'application au moment où ces lignes sont écrites : mesuré, non
appliqué.** `calibrate --apply` réécrit cinq lignes de `prospect_enrichment`
en base de production, et attend l'accord du propriétaire.

## La question ouverte du lot 3

`prospect_pipeline` ne porte que `status` et `updated_at`. Savoir qu'une
relance a été *tenue* suppose de connaître la `next_action_at` en vigueur au
moment de l'interaction — information que rien ne conserve.

Deux issues, à trancher avant d'ouvrir le lot 3 :

1. une table d'historique du pipeline, une ligne par changement de statut ;
2. une définition plus faible de la série — « un jour avec au moins une
   interaction » —, honnête mais moins signifiante.

Tant que ce n'est pas tranché, ne pas afficher de compteur de série : un
chiffre motivant fondé sur rien est pire que pas de chiffre.

**Inchangée par le lot 2.** Rien dans ce lot n'a touché `prospect_pipeline` ni
ajouté de table d'historique du pipeline ; la question reste ouverte telle
quelle à l'entrée du lot 3.

**Résolue par le lot 3 — option 1 retenue.** La table `pipeline_event`
(`supabase/migrations/20260902120000_pipeline_event.sql`) porte une ligne par
changement de statut, avec la `next_action_at` en vigueur à ce moment précis.
`definirStatut` l'alimente en plus de l'état courant. La série se calcule
donc désormais sur des faits réels datés, pas sur l'option 2 (affaiblie) qui
était envisagée ici. Ce que cette résolution ne couvre pas : voir « Une
source de points restera muette », plus haut — « relance tenue » a besoin
d'un croisement que `pipeline_event` seule ne suffit pas à rendre calculable
côté client.
