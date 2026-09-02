import { Fragment } from 'react';
import type { ReasonFragment } from '../domain/prospect.js';
import { useT } from './preferences.js';
import styles from './Reason.module.css';

/**
 * La raison pour laquelle une ligne figure dans la liste (§9.2).
 *
 * « Cela ne coûte rien et supprime l'effet boîte noire » : sans elle, une file
 * de travail est un ordre qu'on subit sans pouvoir le contester. Une ligne
 * sans raison n'est pas rendue vide — elle ne devrait pas exister, et le
 * composant le laisse voir plutôt que de combler.
 */
export function Reason({ fragments }: { fragments: ReasonFragment[] }) {
  const t = useT();
  if (fragments.length === 0) return null;

  const separateur = t('today.reason.separator');

  /**
   * La raison entière, en clair, pour qui la voit coupée.
   *
   * La ligne de liste la tronque sur un seul trait — c'est le dessin de la
   * maquette, et la densité du §9.4 en dépend. Mais une raison de présence
   * coupée à mi-mot cesse de rendre la file décidable, ce que le chantier
   * interdit explicitement : jusqu'à trois signaux du barème s'y concatènent
   * et le dernier est le premier à disparaître. Le `title` rend le texte
   * complet sans rien coûter à la mise en page — la troncature reste
   * visuelle, l'information ne se perd pas.
   */
  const complet = fragments
    .map((fragment) => (fragment.kind === 'key' ? t(fragment.key, fragment.params) : fragment.text))
    .join(separateur);

  return (
    <span className={styles.reason} title={complet}>
      {fragments.map((fragment, i) => (
        <Fragment key={fragment.kind === 'key' ? fragment.key : `${fragment.text}-${i}`}>
          {i > 0 ? separateur : null}
          {fragment.kind === 'key' ? t(fragment.key, fragment.params) : fragment.text}
        </Fragment>
      ))}
    </span>
  );
}
