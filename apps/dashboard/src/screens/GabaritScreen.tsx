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

/**
 * Le texte d'un verdict CONNU — jamais un contrôle que CET écran aurait fait
 * lui-même. N'est appelée que quand `checkedAt` et `checkOk` sont tous deux
 * non nuls : voir `GabaritActifCard`, qui rend l'absence de verdict à part
 * (via `Absent`), plutôt que de laisser cette fonction improviser un texte
 * pour un `checkOk` nul — relevé de revue (tâche 10) : un `checkOk === null`
 * lu comme un succès est le mauvais défaut pour l'affichage d'un verdict.
 */
function texteControle(t: Traducteur, checkedAt: string, checkOk: boolean): string {
  const date = jour(checkedAt);
  return checkOk === false
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
  trades,
  onDesigner,
  enCours,
}: {
  template: SiteTemplateView;
  trades: readonly Trade[];
  onDesigner: (repoFullName: string | null, branch: string) => void;
  enCours: boolean;
}) {
  const t = useT();
  /**
   * Le gabarit désigné ici ne gouverne AUCUN métier existant.
   *
   * `templateRepoFor` résout d'abord le `templateRepo` du métier ; quand tous
   * les métiers en déclarent un, ce qu'on désigne sur cet écran n'atteint
   * personne. L'écran reste juste — il gouvernera le troisième métier — mais
   * ne pas le dire laisserait croire à un changement effectif, quand
   * `gabarit.subtitle` affirme déjà qu'une désignation « substitue » le
   * gabarit livré. Calculé depuis `trades` reçu en prop, jamais depuis une
   * liste recopiée : c'est `trades.ts` qui fait foi, et c'est un choix humain
   * consigné dans `docs/design/HANDOFF.md`.
   */
  const aucunMetierGouverne =
    trades.length > 0 && trades.every((trade) => trade.templateRepo !== undefined);

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
            {/* Un verdict CONNU exige les deux : `checkedAt` ET `checkOk` non
                nuls. Sous le modèle documenté l'un n'arrive jamais sans
                l'autre, mais lire un `checkOk` nul comme un succès reste le
                mauvais défaut pour un affichage de verdict (relevé de revue,
                tâche 10) — l'absence est donc rendue comme telle, via
                `Absent`, jamais devinée comme une réussite. */}
            {template.checkedAt !== null && template.checkOk !== null ? (
              <Badge ton={template.checkOk === false ? 'danger' : 'succes'}>
                {texteControle(t, template.checkedAt, template.checkOk)}
              </Badge>
            ) : (
              <Absent>{t('gabarit.actif.controle.jamais')}</Absent>
            )}
          </div>
          {template.checkOk === false ? (
            <p className={styles.detailEchec}>
              {template.checkDetail ?? t('gabarit.actif.controle.echecSansDetail')}
            </p>
          ) : null}
          <button
            type="button"
            className={styles.revenir}
            disabled={enCours}
            onClick={() => onDesigner(null, 'main')}
          >
            {t('gabarit.actif.revenir')}
          </button>
        </>
      )}
      {aucunMetierGouverne ? (
        <p className={styles.aucunMetier}>{t('gabarit.actif.aucunMetier')}</p>
      ) : null}
    </Card>
  );
}

function DesignerCard({
  onDesigner,
  enCours,
}: {
  onDesigner: (repoFullName: string | null, branch: string) => void;
  enCours: boolean;
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
            ce bundle — mais il n'est écrit NULLE PART pour autant : aucun code
            du collector ne le fait, et les seuls écrivains de `checked_at` /
            `check_ok` les mettent à nul. Le motif de `Bientot` dit donc ce
            manque, et non un prochain passage qui ne viendra pas. Voir
            docs/design/HANDOFF.md. */}
        <Bientot raison={t('gabarit.verifier.raison')}>
          <button type="button" className={styles.verifier}>
            {t('gabarit.verifier.label')}
          </button>
        </Bientot>
        <button type="submit" className={styles.soumettre} disabled={enCours}>
          {enCours ? t('action.pending') : t('gabarit.designer.soumettre')}
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
  /**
   * Enregistre la désignation — une écriture en base, rien de plus. Voir
   * `designerGabarit`. Rend `null` en cas de succès, le message d'erreur
   * sinon — même convention que `PanelActions` (`ui/actions.ts`) : jamais
   * d'exception, que ce bouton devrait alors rattraper.
   */
  onDesigner: (repoFullName: string | null, branch: string) => Promise<string | null>;
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
 * bouton « Vérifier » reste inerte sous `Bientot`. Le motif affiché dit que
 * ce contrôle n'est pas encore écrit — car il ne l'est nulle part : aucun
 * code du collector ne l'exécute, et `docs/design/HANDOFF.md` documente déjà
 * ce manque. Une raison qui promettrait « au prochain passage » enverrait
 * l'opérateur relancer le collector pour revoir « jamais contrôlé ».
 *
 * **Il ne gouverne rien aujourd'hui, et le dit** (`gabarit.actif.aucunMetier`) :
 * les deux métiers de `trades.ts` déclarent chacun leur `templateRepo`, que
 * `templateRepoFor` résout en premier. L'écran est correct et servira au
 * troisième métier ; le livrer est juste, ne pas le dire ne l'est pas.
 *
 * **L'ordre de résolution est affiché, pas seulement implémenté**
 * (`OrdreResolution`) : le gabarit du métier (`trades.ts`), puis le gabarit
 * actif désigné ici, puis la variable d'environnement. Sans cette infobulle,
 * on désigne un dépôt et on se demande pourquoi tel métier ne l'a pas reçu.
 *
 * **Une écriture refusée se voit.** La raison d'être de cet écran est
 * d'ENREGISTRER une désignation ; un refus (RLS, réseau) qui ne laisserait
 * qu'une ligne en console tromperait l'opérateur, qui croirait le
 * changement pris — relevé de revue (tâche 10). `onDesigner` rend donc
 * `null` ou un message, comme `PanelActions`, et ce message reste affiché
 * (`role="alert"`, clé `action.failed`) jusqu'à la tentative suivante — pas
 * un toast qui disparaît avant d'avoir été lu.
 */
export function GabaritScreen({ template, trades, onDesigner, onSignOut = () => {}, nav }: Props) {
  const t = useT();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  /**
   * Enveloppe `onDesigner` : les deux cartes ci-dessous (« revenir au
   * défaut » et « désigner ») visent la même ligne singleton, un seul
   * emplacement d'erreur pour l'écran entier suffit donc. `setErreur(null)`
   * avant de retenter efface un refus précédent, pour ne pas le laisser
   * affiché à côté d'une tentative en cours qui pourrait, elle, réussir.
   */
  const designer = (repoFullName: string | null, branch: string) => {
    setEnCours(true);
    setErreur(null);
    void onDesigner(repoFullName, branch)
      .then((message) => setErreur(message))
      .finally(() => setEnCours(false));
  };

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
            <GabaritActifCard
              template={template}
              trades={trades}
              onDesigner={designer}
              enCours={enCours}
            />
            <DesignerCard onDesigner={designer} enCours={enCours} />

            <Card titre={t('gabarit.metiers.titre')}>
              <p className={styles.aide}>{t('gabarit.metiers.aide')}</p>
              <ul className={styles.listeMetiers}>
                {trades.map((trade) => (
                  <LigneMetier key={trade.slug} trade={trade} />
                ))}
              </ul>
            </Card>
          </div>

          {erreur !== null ? (
            <p className={styles.error} role="alert">
              {t('action.failed', { message: erreur })}
            </p>
          ) : null}

          <p className={styles.portee}>{t('gabarit.portee')}</p>
        </>
      }
    />
  );
}
