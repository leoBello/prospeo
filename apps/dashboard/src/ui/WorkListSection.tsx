import type { WorkList } from '../domain/prospect.js';
import type { TranslationKey } from '../i18n/translate.js';
import { ProspectRow } from './ProspectRow.js';
import { Badge } from './kit/Badge.js';
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
 * La bande des relances dues de l'écran « Aujourd'hui » (§9.2) — seule liste
 * de travail restante depuis le retrait de « Nouveaux prospects à fort
 * score », remplacée par la table de veille.
 *
 * Le compteur du titre porte `totalCount` et non le nombre de lignes rendues :
 * la liste est plafonnée, et annoncer le nombre affiché reviendrait à cacher
 * cent prospects derrière un titre rassurant.
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
        {/*
         * Le compteur porte `totalCount` et non le nombre de lignes rendues
         * (voir le commentaire de tête). Il garde le mot « prospect(s) » —
         * la maquette n'affiche qu'un chiffre nu dans une pastille, mais une
         * pastille ne porte jamais une information par sa seule forme (§
         * accessibilité) ; un chiffre seul serait imprononçable pour un
         * lecteur d'écran et illisible hors contexte.
         *
         * Ton toujours neutre, y compris pour « Relances dues » que la
         * maquette teinte en rose : cette teinte n'ajouterait qu'une
         * information portée par la seule couleur, ce que ce dépôt interdit
         * ailleurs (StatusBadge, ScoreBar). Ce n'est pas un oubli.
         */}
        <Badge ton="neutre">{t('unit.prospects', { count: list.totalCount })}</Badge>
        <div className={styles.rule} aria-hidden="true" />
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
