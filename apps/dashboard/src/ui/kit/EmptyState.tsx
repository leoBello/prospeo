import styles from './Card.module.css';

/**
 * Un vide nommé.
 *
 * `detail` n'est pas décoratif : il dit *pourquoi* c'est vide. « Aucune
 * relance due » seul laisse croire à un chargement raté ; « les engagements
 * tenus disparaissent d'ici » dit que le vide est le résultat normal du
 * travail fait.
 */
export function EmptyState({ titre, detail }: { titre: string; detail: string }) {
  return (
    <div className={styles.vide}>
      <p className={styles.videTitre}>{titre}</p>
      <p className={styles.videDetail}>{detail}</p>
    </div>
  );
}
