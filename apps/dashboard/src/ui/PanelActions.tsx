import type { ProspectView } from '../domain/prospect.js';
import { Bientot } from './kit/Bientot.js';
import { useT } from './preferences.js';
import styles from './PanelActions.module.css';

/**
 * Les actions primaires de la fiche.
 *
 * **Une seule en plein.** L'appel : c'est le geste que l'écran sert, et le
 * reste n'est qu'accessoire. Trois boutons pleins se disputeraient l'attention
 * sans qu'aucun l'obtienne.
 *
 * Le numéro absent ne produit pas un bouton désactivé mais une phrase : un
 * bouton d'appel sans numéro est une promesse creuse — on clique, rien ne se
 * passe, et rien ne dit pourquoi.
 */
export function PanelActions({ prospect }: { prospect: ProspectView }) {
  const t = useT();
  const telephone = prospect.enrichment?.phoneE164 ?? null;
  const enLigne =
    prospect.site !== null &&
    prospect.site.deploymentUrl !== null &&
    prospect.site.unpublishedAt === null;

  return (
    <div className={styles.barre}>
      {telephone === null ? (
        <span className={styles.absent}>{t('action.noPhone')}</span>
      ) : (
        <a className={`${styles.bouton} ${styles.primaire}`} href={`tel:${telephone}`}>
          {t('action.call', { phone: telephone })}
        </a>
      )}

      {enLigne && prospect.site?.deploymentUrl != null ? (
        <a
          className={styles.bouton}
          href={prospect.site.deploymentUrl}
          target="_blank"
          // `noopener` : une page ouverte par `target="_blank"` garde sinon une
          // référence vers celle-ci et peut la rediriger.
          rel="noreferrer noopener"
        >
          {t('action.openSite')}
        </a>
      ) : null}

      <Bientot raison={t('action.redeploy.reason')}>
        <span className={styles.bouton}>{t('action.redeploy')}</span>
      </Bientot>
    </div>
  );
}
