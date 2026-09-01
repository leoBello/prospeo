import type { WorkList } from '../domain/prospect.js';
import type { TranslationKey } from '../i18n/translate.js';
import { ProspectRow } from './ProspectRow.js';
import { useT } from './preferences.js';
import styles from './WorkListSection.module.css';

interface Props {
  titleKey: TranslationKey;
  emptyKey: TranslationKey;
  list: WorkList;
  selectedId: string | null;
  currentRulesetVersion: string;
  onSelect: (id: string) => void;
}

/**
 * Une des listes de travail de l'écran « Aujourd'hui » (§9.2).
 *
 * Le compteur du titre porte `totalCount` et non le nombre de lignes rendues :
 * les listes sont plafonnées, et annoncer le nombre affiché reviendrait à
 * cacher cent prospects derrière un titre rassurant.
 */
export function WorkListSection({
  titleKey,
  emptyKey,
  list,
  selectedId,
  currentRulesetVersion,
  onSelect,
}: Props) {
  const t = useT();
  const caches = list.totalCount - list.items.length;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t(titleKey)}</h2>
        <span className={styles.count}>{t('unit.prospects', { count: list.totalCount })}</span>
      </div>

      {list.items.length === 0 ? (
        // L'état vide dit pourquoi il est vide. « Aucune relance » sans
        // explication se lirait comme une panne de lecture.
        <p className={styles.empty}>{t(emptyKey)}</p>
      ) : (
        <ul className={styles.list}>
          {list.items.map((row) => (
            <ProspectRow
              key={row.prospect.id}
              row={row}
              selected={row.prospect.id === selectedId}
              currentRulesetVersion={currentRulesetVersion}
              onSelect={onSelect}
            />
          ))}
          {caches > 0 ? (
            <li className={styles.overflow}>
              {t('list.overflow', { count: caches })}
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
