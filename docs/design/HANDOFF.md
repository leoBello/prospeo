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
