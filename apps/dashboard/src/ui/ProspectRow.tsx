import type { WorkRow } from '../domain/prospect.js';
import { dataWarnings } from '../domain/coherence.js';
import { StatusBadge } from './kit/StatusBadge.js';
import { Reason } from './Reason.js';
import { ScoreBar } from './ScoreBar.js';
import styles from './ProspectRow.module.css';

interface Props {
  row: WorkRow;
  selected: boolean;
  currentRulesetVersion: string;
  onSelect: (id: string) => void;
}

/**
 * Une ligne de liste de travail (§9.2, maquette « Relances dues »).
 *
 * C'est un `<button>` et non un `<div>` avec un `role` : la sémantique native
 * apporte gratuitement le focus, l'activation à la touche Entrée et l'annonce
 * correcte par les lecteurs d'écran. Un `div` obligerait à réimplémenter les
 * trois, et l'un des trois serait oublié.
 *
 * Le code postal et la ville, affichés ici avant cette réécriture, en
 * disparaissent : la maquette ne les montre pas, et la fiche du prospect
 * (`panel/FicheTab.tsx`) les affiche déjà en toutes lettres dès l'ouverture
 * du panneau. Le fait n'est donc pas perdu — seulement retiré d'une ligne où
 * il n'aide pas à décider, au profit de la raison de présence et du statut,
 * qui eux le font.
 */
export function ProspectRow({ row, selected, currentRulesetVersion, onSelect }: Props) {
  const { prospect } = row;
  const nom = prospect.denominationUsuelle ?? prospect.denomination;
  const warnings = dataWarnings(prospect, currentRulesetVersion);

  return (
    <li>
      <button
        type="button"
        // L'identifiant sert au défilement automatique vers la ligne
        // sélectionnée au clavier : sans lui, les flèches déplacent une
        // sélection qu'on ne voit plus.
        id={`prospect-${prospect.id}`}
        className={`${styles.row} ${selected ? styles.selected : ''}`}
        // `aria-current` porte l'état de sélection pour qui n'en voit pas la
        // couleur ; le lisère (`.mark`) le porte pour qui distingue mal les
        // teintes du fond.
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(prospect.id)}
      >
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.identity}>
          <span className={styles.topLine}>
            <span className={styles.name}>{nom}</span>
            {/* `pipeline` est `null` pour 137 prospects sur 139 (releve du
                2 septembre 2026) : ce n'est pas un cas dégénéré à
                contourner, `StatusBadge` le nomme.
                `taille="compacte"` : dimensions de la maquette pour une
                ligne (19px/10px), plus petites que celles du panneau — sans
                quoi le badge, plus haut que le nom, gonflait la ligne de
                8px (voir le calcul de densité du rapport). */}
            <StatusBadge status={prospect.pipeline?.status ?? null} taille="compacte" />
          </span>
          <span className={styles.meta}>
            <Reason fragments={row.reason} />
          </span>
        </span>
        <ScoreBar score={prospect.score} warnings={warnings} />
      </button>
    </li>
  );
}
