import type { WorkRow } from '../domain/prospect.js';
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
 * Une ligne de liste de travail.
 *
 * C'est un `<button>` et non un `<div>` avec un `role` : la sémantique native
 * apporte gratuitement le focus, l'activation à la touche Entrée et l'annonce
 * correcte par les lecteurs d'écran. Un `div` obligerait à réimplémenter les
 * trois, et l'un des trois serait oublié.
 */
export function ProspectRow({ row, selected, currentRulesetVersion, onSelect }: Props) {
  const { prospect } = row;
  const nom = prospect.denominationUsuelle ?? prospect.denomination;

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
        // couleur ; le lisère la porte pour qui distingue mal les teintes.
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(prospect.id)}
      >
        <span className={styles.identity}>
          <span className={styles.name}>{nom}</span>
          <span className={styles.city}>
            {prospect.postalCode} {prospect.city} · <Reason fragments={row.reason} />
          </span>
        </span>
        <ScoreBar score={prospect.score} currentRulesetVersion={currentRulesetVersion} />
      </button>
    </li>
  );
}
