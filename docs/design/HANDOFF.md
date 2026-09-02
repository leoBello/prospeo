# Handoff — ce que la maquette montre et que la base ne sait pas encore

> Mis à jour à la fin du lot 1, puis à la fin du lot 2. À relire avant
> d'ouvrir le lot 3.
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

## Ce qui n'est pas encore maquetté ni construit

| Sujet | Décision | Blocage |
|---|---|---|
| Série, objectif, palier, badges | D5 | §4.2 : `prospect_pipeline` écrase son passé, donc « relance tenue » n'a aucune source. La **série** se calcule depuis `interaction.occurred_at`, qui existe. Question ouverte du lot 3, ci-dessous — inchangée par ce lot. |
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
