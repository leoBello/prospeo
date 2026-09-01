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

  return (
    <span className={styles.reason}>
      {fragments.map((fragment, i) => (
        <Fragment key={fragment.kind === 'key' ? fragment.key : `${fragment.text}-${i}`}>
          {i > 0 ? separateur : null}
          {fragment.kind === 'key' ? t(fragment.key, fragment.params) : fragment.text}
        </Fragment>
      ))}
    </span>
  );
}
