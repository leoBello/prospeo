import { Tabs } from '@base-ui/react/tabs';
import { getTrade } from '@prospeo/core';
import type { ProspectView } from '../domain/prospect.js';
import { dataWarnings } from '../domain/coherence.js';
import { MessagesSection } from './MessagesSection.js';
import { PipelineSection } from './PipelineSection.js';
import { SiteSection } from './SiteSection.js';
import { WarningList } from './WarningList.js';
import { FicheTab } from './panel/FicheTab.js';
import { HistoriqueTab } from './panel/HistoriqueTab.js';
import { PanelActions } from './PanelActions.js';
import { Badge } from './kit/Badge.js';
import { StatusBadge } from './kit/StatusBadge.js';
import type { PanelActions as Actions } from './actions.js';
import { useT } from './preferences.js';
import styles from './ProspectPanel.module.css';

interface Props {
  prospect: ProspectView | null;
  /**
   * Les écritures, injectées.
   *
   * `null` rend la fiche strictement consultable, et c'est ce que montent les
   * tests des sections de lecture : un composant qui fabriquerait lui-même son
   * client Supabase ne pourrait plus se rendre sans réseau.
   */
  actions?: Actions | null;
  /** Rang affiché dans la file, pour situer le parcours au clavier. */
  position: { index: number; total: number } | null;
  currentRulesetVersion: string;
  onClose: () => void;
}

/**
 * La fiche d'un prospect, en quatre onglets.
 *
 * **D1 du chantier n°6.** Les sept sections empilées de la version précédente
 * ne sont pas sept sujets : ce sont quatre moments distincts du travail. On
 * consulte l'identité avant d'appeler, la rédaction quand on doute du site,
 * les messages quand on rappelle, l'historique quand on ne se souvient plus.
 * Les empiler supposait qu'on ait besoin des quatre en même temps, ce qui
 * n'arrive jamais.
 *
 * La signature du composant est inchangée : `TodayScreen` n'a pas bougé, et un
 * `git revert` de cette tâche restaure l'écran précédent sans rien d'autre.
 */
export function ProspectPanel({
  prospect,
  position,
  currentRulesetVersion,
  onClose,
  actions = null,
}: Props) {
  const t = useT();

  if (prospect === null) {
    return (
      <aside className={styles.panel} aria-label={t('panel.section.identity')}>
        <p className={styles.placeholder}>{t('panel.empty')}</p>
      </aside>
    );
  }

  const nom = prospect.denominationUsuelle ?? prospect.denomination;
  const warnings = dataWarnings(prospect, currentRulesetVersion);
  const enLigne =
    prospect.site !== null &&
    prospect.site.deploymentUrl !== null &&
    prospect.site.unpublishedAt === null;

  return (
    <aside className={styles.panel} aria-label={nom}>
      <header className={styles.header}>
        <div>
          {position !== null ? (
            <span className={styles.position}>
              {t('panel.position', { index: position.index, total: position.total })}
            </span>
          ) : null}
          <h2 className={styles.name}>{nom}</h2>
          <div className={styles.badges}>
            <StatusBadge status={prospect.pipeline?.status ?? null} />
            {enLigne ? (
              <Badge ton="succes" point>
                {t('site.badge.online')}
              </Badge>
            ) : null}
            {/* Le libellé du métier, jamais son slug : « plombier » est une
                clé de `trades.ts`, pas un mot d'interface — et un métier à
                deux mots s'afficherait « couvreur-zingueur ». Repli sur le
                slug si le métier est inconnu du catalogue : un identifiant
                lisible vaut mieux qu'un badge vide. */}
            <Badge>{getTrade(prospect.tradeSlug)?.label ?? prospect.tradeSlug}</Badge>
          </div>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('panel.close')}>
          ×
        </button>
      </header>

      <WarningList warnings={warnings} />

      <PanelActions prospect={prospect} />

      <Tabs.Root defaultValue="fiche">
        <Tabs.List className={styles.onglets}>
          <Tabs.Tab className={styles.onglet} value="fiche">
            {t('panel.tab.fiche')}
          </Tabs.Tab>
          <Tabs.Tab className={styles.onglet} value="site">
            {t('panel.tab.site')}
          </Tabs.Tab>
          <Tabs.Tab className={styles.onglet} value="messages">
            {t('panel.tab.messages')}
          </Tabs.Tab>
          <Tabs.Tab className={styles.onglet} value="historique">
            {t('panel.tab.historique')}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel className={styles.panneau} value="fiche">
          <FicheTab prospect={prospect} />
        </Tabs.Panel>

        <Tabs.Panel className={styles.panneau} value="site">
          <SiteSection
            site={prospect.site}
            onRejeter={actions === null ? null : () => actions.rejeterRedaction(prospect.id)}
            onAnnulerRejet={actions === null ? null : () => actions.annulerRejet(prospect.id)}
          />
        </Tabs.Panel>

        <Tabs.Panel className={styles.panneau} value="messages">
          <MessagesSection messages={prospect.messages} />
        </Tabs.Panel>

        <Tabs.Panel className={styles.panneau} value="historique">
          <HistoriqueTab prospect={prospect} />
          <PipelineSection
            pipeline={prospect.pipeline}
            // « En ligne » veut dire déployé ET non retiré : une ligne conserve
            // son `deployment_url` après dépublication, et l'avertissement sur
            // le retrait différé n'aurait alors plus lieu d'être.
            siteEnLigne={enLigne}
            onDefinirStatut={
              actions === null
                ? null
                : (status, nextActionAt) => actions.definirStatut(prospect.id, status, nextActionAt)
            }
            onJournaliser={
              actions === null ? null : (kind, body) => actions.journaliser(prospect.id, kind, body)
            }
          />
        </Tabs.Panel>
      </Tabs.Root>
    </aside>
  );
}
