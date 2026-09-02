import type { ProspectView } from '../../domain/prospect.js';
import type { TranslationKey } from '../../i18n/translate.js';
import { Bientot } from '../kit/Bientot.js';
import { EmptyState } from '../kit/EmptyState.js';
import { useT } from '../preferences.js';
import styles from './HistoriqueTab.module.css';

/** `2026-09-01T14:22:00Z` → `01/09/2026`. */
function jour(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/**
 * La frise des jalons connus.
 *
 * **Ce qu'elle ne montre pas, et pourquoi.** La maquette dessine une frise
 * pas-à-pas — dépôt créé, build réussi, appel passé. Deux sources manquent :
 * `interaction` existe en base mais `ProspectView` ne l'expose pas, et les
 * étapes de déploiement n'ont aucune table (§4.1 du chantier n°6).
 *
 * On montre donc les seules dates que `prospect_site` porte réellement, et on
 * annonce le reste plutôt que de le masquer : un écran amputé se lit comme un
 * oubli, et une frise inventée serait pire.
 */
export function HistoriqueTab({ prospect }: { prospect: ProspectView }) {
  const t = useT();
  const site = prospect.site;

  const jalons: { cle: TranslationKey; date: string }[] = [
    { cle: 'histo.discovered', date: prospect.discoveredAt },
  ];
  if (site?.generatedAt != null) jalons.push({ cle: 'histo.generated', date: site.generatedAt });
  if (site?.publishedAt != null) jalons.push({ cle: 'histo.published', date: site.publishedAt });
  if (site?.contentRejectedAt != null) {
    jalons.push({ cle: 'histo.rejected', date: site.contentRejectedAt });
  }
  if (site?.unpublishedAt != null) {
    jalons.push({ cle: 'histo.unpublished', date: site.unpublishedAt });
  }

  jalons.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <div>
      <div className={styles.frise}>
        {jalons.map((jalon, i) => (
          <div key={jalon.cle} className={styles.evenement}>
            <div className={styles.colonne}>
              <span className={styles.puce} />
              {i === jalons.length - 1 ? null : <span className={styles.trait} />}
            </div>
            <div className={styles.corps}>
              <span className={styles.titre}>{t(jalon.cle)}</span>
              <span className={styles.date}>{jour(jalon.date)}</span>
            </div>
          </div>
        ))}
      </div>

      <Bientot raison={t('histo.detail.reason')}>
        <EmptyState titre={t('histo.detail.title')} detail={t('histo.detail.reason')} />
      </Bientot>
    </div>
  );
}
