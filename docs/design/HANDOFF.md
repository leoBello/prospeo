# Handoff — ce que la maquette montre et que la base ne sait pas encore

> Mis à jour à la fin du lot 1. À relire avant d'ouvrir le lot 2.
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

Recensement exhaustif : deux usages de `<Bientot>` en dehors de sa propre
définition et de ses tests (`grep -rn "Bientot" apps/dashboard/src --include=*.tsx | grep -v "kit/Bientot" | grep -v ".test."`).

| Zone | Fichier | Ce qui manque | Débloqué par |
|---|---|---|---|
| Journal pas-à-pas d'un déploiement | `src/ui/panel/HistoriqueTab.tsx` | Aucune table d'événements. `prospect_site` porte un état courant, pas un historique : ni durée d'étape, ni cause d'échec, ni journal. | Migration §4.1 — lot 2 |
| Bouton « Redéployer » | `src/ui/PanelActions.tsx` | `publish` et `deploy` ne s'appellent que depuis le collector en ligne de commande. Aucun déclencheur côté dashboard. | Lot 2 |

## Ce qui n'est pas encore maquetté ni construit

| Sujet | Décision | Blocage |
|---|---|---|
| Écran de suivi des déploiements | D9 | Migration §4.1 |
| Écran de gabarit GitHub | D10 | — (constructible dès le lot 2) |
| Série, objectif, palier, badges | D5 | §4.2 : `prospect_pipeline` écrase son passé, donc « relance tenue » n'a aucune source. La **série** se calcule depuis `interaction.occurred_at`, qui existe. |
| Écran « Base » (les 139 prospects) | hors périmètre du chantier n°6 | — |

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
