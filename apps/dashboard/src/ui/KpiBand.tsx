import type { Kpis } from '../domain/today.js';
import type { TranslationKey } from '../i18n/translate.js';
import { useT } from './preferences.js';
import styles from './KpiBand.module.css';

function Kpi({ labelKey, value }: { labelKey: TranslationKey; value: number }) {
  const t = useT();
  return (
    <div className={styles.kpi}>
      <b className={styles.value}>{value}</b>
      <span className={styles.label}>{t(labelKey)}</span>
    </div>
  );
}

/**
 * La bande d'indicateurs du §9.2.
 *
 * Quatre compteurs de lignes réelles, et aucune moyenne. Le taux de réponse
 * qu'annonçait la spec n'y figure pas : `interaction` enregistre le canal d'un
 * échange, jamais son sens, et le numérateur d'un tel taux n'existe donc pas
 * dans le schéma. « Qualifiés » l'a remplacé — c'est le chiffre qui dit
 * réellement où en est la base, et il met sous les yeux l'écart entre les 139
 * prospects découverts et les 25 que le pipeline a jugés.
 *
 * Les deux derniers resteront à zéro tant que rien n'écrira dans
 * `prospect_pipeline`. La spec l'avait prévu, et l'écran l'affiche plutôt que
 * de le maquiller.
 */
export function KpiBand({ kpis }: { kpis: Kpis }) {
  return (
    <div className={styles.band}>
      <Kpi labelKey="today.kpi.inBase" value={kpis.inBase} />
      <Kpi labelKey="today.kpi.qualified" value={kpis.qualified} />
      <Kpi labelKey="today.kpi.contacted" value={kpis.contacted} />
      <Kpi labelKey="today.kpi.interested" value={kpis.interested} />
    </div>
  );
}
