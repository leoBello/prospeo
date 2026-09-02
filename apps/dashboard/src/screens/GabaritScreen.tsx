import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Trade } from '@prospeo/core';
import type { SiteTemplateView } from '../data/deployments.js';
import type { TranslationKey, TranslationParams } from '../i18n/translate.js';
import { AppShell } from '../ui/AppShell.js';
import { Badge } from '../ui/kit/Badge.js';
import { Bientot } from '../ui/kit/Bientot.js';
import { Absent, Card } from '../ui/kit/Card.js';
import { Tooltip } from '../ui/kit/Tooltip.js';
import { useT } from '../ui/preferences.js';
import styles from './GabaritScreen.module.css';

type Traducteur = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * `2026-09-01T20:17:31Z` → `01/09/2026`.
 *
 * Dupliqué à dessein, comme le fait déjà `DeploiementsScreen.tsx` — voir son
 * docstring. Trois lignes ne valent pas un import croisé entre écrans sans
 * rapport.
 */
function jour(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/** Le texte du dernier verdict connu — jamais un contrôle que CET écran aurait fait lui-même. */
function texteControle(t: Traducteur, template: SiteTemplateView): string {
  if (template.checkedAt === null) return t('gabarit.actif.controle.jamais');
  const date = jour(template.checkedAt);
  return template.checkOk === false
    ? t('gabarit.actif.controle.echec', { date })
    : t('gabarit.actif.controle.ok', { date });
}

/** L'infobulle qui DIT l'ordre de résolution, pas seulement ne l'implémente pas ailleurs. */
function OrdreResolution() {
  const t = useT();
  return (
    <Tooltip intitule={t('gabarit.ordre.titre')} contenu={t('gabarit.ordre.detail')}>
      <button type="button" className={styles.ordreBouton} aria-label={t('gabarit.ordre.titre')}>
        ?
      </button>
    </Tooltip>
  );
}

function GabaritActifCard({
  template,
  onDesigner,
}: {
  template: SiteTemplateView;
  onDesigner: (repoFullName: string | null, branch: string) => void;
}) {
  const t = useT();
  return (
    <Card titre={t('gabarit.actif.titre')} extra={<OrdreResolution />}>
      {template.repoFullName === null ? (
        <Absent>{t('gabarit.actif.absent')}</Absent>
      ) : (
        <>
          <div className={styles.actifEntete}>
            <span className={styles.repo}>{template.repoFullName}</span>
            <Badge ton="info">{t('gabarit.actif.badge')}</Badge>
          </div>
          <div className={styles.actifMeta}>
            <span>{t('gabarit.actif.branche', { branch: template.branch })}</span>
            <Badge ton={template.checkOk === false ? 'danger' : template.checkedAt === null ? 'neutre' : 'succes'}>
              {texteControle(t, template)}
            </Badge>
          </div>
          {template.checkOk === false ? (
            <p className={styles.detailEchec}>
              {template.checkDetail ?? t('gabarit.actif.controle.echecSansDetail')}
            </p>
          ) : null}
          <button
            type="button"
            className={styles.revenir}
            onClick={() => onDesigner(null, 'main')}
          >
            {t('gabarit.actif.revenir')}
          </button>
        </>
      )}
    </Card>
  );
}

function DesignerCard({
  onDesigner,
}: {
  onDesigner: (repoFullName: string | null, branch: string) => void;
}) {
  const t = useT();
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');

  function soumettre(event: FormEvent) {
    event.preventDefault();
    // Un champ vidé au clavier vaut `''`, pas `null` : la normalisation se
    // fait ICI, avant même que `onDesigner` (donc l'écriture) n'en connaisse
    // quoi que ce soit — voir aussi `designerGabarit`, qui la refait à
    // l'écriture pour la même raison que `fetchSiteTemplate` la refait à la
    // lecture (tâche 6) : deux endroits, une même règle, jamais une confiance
    // aveugle en l'appelant.
    const repoNormalise = repo.trim();
    const brancheNormalisee = branch.trim();
    onDesigner(repoNormalise === '' ? null : repoNormalise, brancheNormalisee === '' ? 'main' : brancheNormalisee);
  }

  return (
    <Card titre={t('gabarit.designer.titre')}>
      <p className={styles.aide}>{t('gabarit.designer.aide')}</p>
      <form className={styles.formulaire} onSubmit={soumettre}>
        <div className={styles.champ}>
          <label className={styles.label} htmlFor="gabarit-repo">
            {t('gabarit.designer.champRepo')}
          </label>
          <input
            id="gabarit-repo"
            className={styles.input}
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
        </div>
        <div className={styles.champBranche}>
          <label className={styles.label} htmlFor="gabarit-branche">
            {t('gabarit.designer.champBranche')}
          </label>
          <input
            id="gabarit-branche"
            className={styles.input}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>
        {/* Le contrôle réel exige un jeton GitHub, qui n'a rien à faire dans
            ce bundle : c'est le collector qui vérifie, à son prochain
            passage. Voir docs/design/HANDOFF.md. */}
        <Bientot raison={t('gabarit.verifier.raison')}>
          <button type="button" className={styles.verifier}>
            {t('gabarit.verifier.label')}
          </button>
        </Bientot>
        <button type="submit" className={styles.soumettre}>
          {t('gabarit.designer.soumettre')}
        </button>
      </form>
    </Card>
  );
}

function LigneMetier({ trade }: { trade: Trade }) {
  const t = useT();
  return (
    <li className={styles.ligneMetier}>
      <span className={styles.metierLabel}>{trade.label}</span>
      {trade.templateRepo === undefined ? (
        <span className={styles.herite}>{t('gabarit.metiers.herite')}</span>
      ) : (
        <>
          <Badge ton="info">{trade.templateRepo}</Badge>
          <span className={styles.exception}>{t('gabarit.metiers.exception')}</span>
        </>
      )}
    </li>
  );
}

interface Props {
  template: SiteTemplateView;
  trades: readonly Trade[];
  /** Enregistre la désignation — une écriture en base, rien de plus. Voir `designerGabarit`. */
  onDesigner: (repoFullName: string | null, branch: string) => void;
  onSignOut?: () => void;
  /** Le rail de navigation, fourni par `App` — voir `TodayScreen` pour le même patron. */
  nav?: ReactNode;
}

/**
 * L'écran du gabarit des sites (D10, chantier n°10).
 *
 * **Ce qu'il fait, et ce qu'il ne fait pas.** Il enregistre le dépôt désigné
 * — une écriture en base, sans secret, que la RLS autorise. Il n'exécute
 * AUCUN contrôle : vérifier qu'un dépôt est accessible, marqué « template »,
 * et qu'il contient `src/content/site.json` exige un jeton GitHub, qui n'a
 * rien à faire dans un bundle navigateur. L'écran affiche donc le dernier
 * verdict connu et sa date (`checked_at`, `check_ok`, `check_detail`), et le
 * bouton « Vérifier » reste inerte sous `Bientot` — sa ligne dans
 * `docs/design/HANDOFF.md` dit pourquoi : le contrôle est fait par le
 * collector à son prochain passage.
 *
 * **L'ordre de résolution est affiché, pas seulement implémenté**
 * (`OrdreResolution`) : le gabarit du métier (`trades.ts`), puis le gabarit
 * actif désigné ici, puis la variable d'environnement. Sans cette infobulle,
 * on désigne un dépôt et on se demande pourquoi tel métier ne l'a pas reçu.
 */
export function GabaritScreen({ template, trades, onDesigner, onSignOut = () => {}, nav }: Props) {
  const t = useT();

  return (
    <AppShell
      onSignOut={onSignOut}
      nav={nav}
      panel={null}
      list={
        <>
          <div className={styles.intro}>
            <h1 className={styles.title}>{t('gabarit.title')}</h1>
            <p className={styles.subtitle}>{t('gabarit.subtitle')}</p>
          </div>

          <div className={styles.pile}>
            <GabaritActifCard template={template} onDesigner={onDesigner} />
            <DesignerCard onDesigner={onDesigner} />

            <Card titre={t('gabarit.metiers.titre')}>
              <p className={styles.aide}>{t('gabarit.metiers.aide')}</p>
              <ul className={styles.listeMetiers}>
                {trades.map((trade) => (
                  <LigneMetier key={trade.slug} trade={trade} />
                ))}
              </ul>
            </Card>
          </div>

          <p className={styles.portee}>{t('gabarit.portee')}</p>
        </>
      }
    />
  );
}
