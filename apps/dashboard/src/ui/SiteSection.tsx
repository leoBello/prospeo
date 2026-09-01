import { useState } from 'react';
import type { SiteView } from '../domain/prospect.js';
import { useT } from './preferences.js';
import styles from './ProspectPanel.module.css';

/** `2026-09-01T20:17:31Z` → `01/09/2026`, sans l'heure qui n'apprend rien ici. */
export function jour(iso: string | null): string {
  if (iso === null) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

interface Props {
  site: SiteView | null;
  /** Rendent `null` en cas de succès, le message d'erreur sinon. */
  onRejeter: (() => Promise<string | null>) | null;
  onAnnulerRejet: (() => Promise<string | null>) | null;
}

/**
 * Le site généré, et de quoi refuser sa rédaction.
 *
 * **On n'affiche que ce que le modèle a décidé.** Les faits — téléphone, note,
 * année — sont déjà plus haut sur la fiche, tirés des mêmes colonnes ; les
 * répéter ici laisserait croire qu'il en existe deux versions. Surtout, c'est
 * cette économie qui rend la relecture tenable en une minute, comme l'annonce
 * le §3 du plan : le relecteur ne lit que ce qui a pu être inventé.
 */
export function SiteSection({ site, onRejeter, onAnnulerRejet }: Props) {
  const t = useT();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (site === null) {
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('panel.section.site')}</h3>
        <p className={styles.absent}>{t('site.absent')}</p>
      </section>
    );
  }

  const rejetee = site.contentRejectedAt !== null;

  const agir = (action: () => Promise<string | null>) => () => {
    setEnCours(true);
    setErreur(null);
    void action()
      .then((message) => setErreur(message))
      .finally(() => setEnCours(false));
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('panel.section.site')}</h3>

      {/* L'état d'abord : savoir si la page est en ligne, et depuis quand,
          gouverne tout le reste — la péremption à 90 jours de D5 comme la
          question de savoir si l'URL du message est encore joignable. */}
      <p className={styles.status}>
        {site.unpublishedAt !== null
          ? t('site.unpublished', { date: jour(site.unpublishedAt) })
          : site.deploymentUrl !== null && site.publishedAt !== null
            ? t('site.online', { date: jour(site.publishedAt) })
            : site.publishedAt !== null
              ? t('site.notDeployed')
              : t('site.notPublished')}
      </p>

      {rejetee ? (
        // `role="status"` et non `alert` : c'est un état de la fiche, pas un
        // incident survenu pendant qu'on la regardait.
        <div className={styles.rejected} role="status">
          <strong>{t('site.rejected', { date: jour(site.contentRejectedAt) })}</strong>
          <span>{t('site.rejected.hint')}</span>
        </div>
      ) : null}

      <dl className={styles.fields}>
        {site.deploymentUrl !== null ? (
          <div className={styles.field}>
            <dt className={styles.fieldLabel}>{t('site.field.deployment')}</dt>
            <dd className={styles.fieldValue}>
              {/* `noopener` : une page ouverte par `target="_blank"` garde
                  sinon une référence vers celle-ci et peut la rediriger. */}
              <a href={site.deploymentUrl} target="_blank" rel="noreferrer noopener">
                {site.deploymentUrl}
              </a>
            </dd>
          </div>
        ) : null}
        {site.repoUrl !== null ? (
          <div className={styles.field}>
            <dt className={styles.fieldLabel}>{t('site.field.repo')}</dt>
            <dd className={styles.fieldValue}>
              <a href={site.repoUrl} target="_blank" rel="noreferrer noopener">
                {site.repoUrl}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {site.redaction !== null ? (
        <>
          <p className={styles.hint}>{t('site.redaction.hint')}</p>
          <dl className={styles.fields}>
            <div className={styles.field}>
              <dt className={styles.fieldLabel}>{t('site.field.accroche')}</dt>
              <dd className={styles.fieldValue}>{site.redaction.accroche}</dd>
            </div>
            <div className={styles.field}>
              <dt className={styles.fieldLabel}>{t('site.field.presentation')}</dt>
              <dd className={styles.fieldValue}>{site.redaction.presentation}</dd>
            </div>
            <div className={styles.field}>
              <dt className={styles.fieldLabel}>{t('site.field.prestations')}</dt>
              {/* L'ORDRE est conservé : c'est le seul autre degré de liberté du
                  modèle, et il se voit à l'écran du site. */}
              <dd className={styles.fieldValue}>{site.redaction.prestations.join(' · ')}</dd>
            </div>
          </dl>
        </>
      ) : null}

      {site.model !== null && site.promptVersion !== null ? (
        <p className={styles.trace}>
          {t('site.trace', { model: site.model, version: site.promptVersion })}
        </p>
      ) : null}

      {site.redaction !== null && (rejetee ? onAnnulerRejet : onRejeter) !== null ? (
        <button
          type="button"
          className={styles.action}
          disabled={enCours}
          onClick={agir(rejetee ? onAnnulerRejet! : onRejeter!)}
        >
          {enCours ? t('action.pending') : t(rejetee ? 'site.unreject' : 'site.reject')}
        </button>
      ) : null}

      {erreur !== null ? (
        <p className={styles.error} role="alert">
          {t('action.failed', { message: erreur })}
        </p>
      ) : null}
    </section>
  );
}
