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
| `Tooltip` (Base UI) | `src/ui/kit/Tooltip.tsx` | livré |
| `Bientot` | `src/ui/kit/Bientot.tsx` | livré |
| `Card`, `Field`, `Absent` | `src/ui/kit/Card.tsx` | livré |
| `EmptyState` | `src/ui/kit/EmptyState.tsx` | livré |
| `ScoreCompact` | `src/ui/ScoreCompact.tsx` | livré |
| `FicheTab` (présence web, enrichissement, score) | `src/ui/panel/FicheTab.tsx` | livré |
| `HistoriqueTab` | `src/ui/panel/HistoriqueTab.tsx` | livré — zone détail inerte, voir plus bas |
| `PanelActions` | `src/ui/PanelActions.tsx` | livré — bouton inerte, voir plus bas |
| Fiche à 720 px, quatre onglets | `src/ui/ProspectPanel.tsx` | livré |

## Un aller-retour à noter

Pendant l'écriture de l'onglet Fiche, la carte « Présence web » et le statut
d'enrichissement (`enrichment.ok` / `not_found` / `ambiguous` / `blocked`) ont
été perdus dans la réécriture du panneau en quatre onglets, puis restitués
dans `FicheTab.tsx` (commit `a388a9f`, *« restituer la presence web et le
statut d'enrichissement »*).

Les deux sont bien présents à la fin du lot 1 : la carte `panel.section.web`
et les badges d'état d'enrichissement se trouvent dans
`src/ui/panel/FicheTab.tsx`. Ce n'est pas un gap à combler au lot 2 — c'est
consigné ici pour que le prochain lecteur ne les cherche pas ailleurs, ni ne
les recrée en double.

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
