import type { Kpis } from '../domain/today.js';
import type { TranslationKey } from '../i18n/translate.js';
import { useT } from './preferences.js';
import styles from './KpiBand.module.css';

/**
 * Un indicateur, et le cas où il n'a pas de valeur.
 *
 * `unavailable` n'est pas un zéro déguisé : il affiche « sans objet » et la
 * raison. La spec annonçait des indicateurs proches de zéro les premières
 * semaines (§9.2) ; ils y sont, et un « 0 % » de taux de réponse se lirait
 * comme un échec commercial là où il n'y a simplement pas encore eu de
 * prospection.
 */
function Kpi({
  labelKey,
  value,
  unavailableReason,
}: {
  labelKey: TranslationKey;
  value: string;
  unavailableReason?: TranslationKey;
}) {
  const t = useT();
  const indisponible = unavailableReason !== undefined;

  return (
    <div className={styles.kpi}>
      <b className={indisponible ? styles.valueUnavailable : styles.value}>
        {indisponible ? t('today.kpi.unavailable') : value}
      </b>
      <span className={styles.label}>{t(labelKey)}</span>
      {indisponible ? <span className={styles.reason}>{t(unavailableReason)}</span> : null}
    </div>
  );
}

export function KpiBand({ kpis }: { kpis: Kpis }) {
  return (
    <div className={styles.band}>
      <Kpi labelKey="today.kpi.inBase" value={String(kpis.inBase)} />
      <Kpi labelKey="today.kpi.contacted" value={String(kpis.contacted)} />
      <Kpi labelKey="today.kpi.interested" value={String(kpis.interested)} />
      <Kpi
        labelKey="today.kpi.responseRate"
        value={kpis.responseRate.known ? `${Math.round(kpis.responseRate.value * 100)} %` : ''}
        {...(kpis.responseRate.known ? {} : { unavailableReason: kpis.responseRate.reason })}
      />
    </div>
  );
}
