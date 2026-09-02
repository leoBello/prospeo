import { useState } from 'react';
import { estUnRefus } from '@prospeo/core';
import type { Enums } from '@prospeo/db';
import type { PipelineView } from '../domain/prospect.js';
import type { TranslationKey } from '../i18n/translate.js';
import type { EchecDefinirStatut } from './actions.js';
import { useT } from './preferences.js';
import { jour } from './SiteSection.js';
import styles from './ProspectPanel.module.css';

/**
 * L'erreur affichée par cette section, quelle que soit l'action qui l'a
 * produite — `definirStatut` rend un `EchecDefinirStatut` structuré (relevé
 * de revue, tâche 5), `journaliser` une simple chaîne. Une seule union locale
 * plutôt que deux états : les deux actions partagent la même zone d'affichage
 * et ne peuvent jamais être en échec toutes les deux à la fois.
 */
type ErreurSection =
  | ({ readonly source: 'statut' } & EchecDefinirStatut)
  | { readonly source: 'interaction'; readonly message: string };

const STATUTS: readonly Enums<'pipeline_status'>[] = [
  'a_contacter',
  'contacte',
  'relance',
  'interesse',
  'gagne',
  'perdu',
  'ne_pas_contacter',
];

const CANAUX: readonly Enums<'interaction_kind'>[] = ['appel', 'whatsapp', 'email', 'sms', 'note'];

const CLE_STATUT = (s: string): TranslationKey => `pipeline.status.${s}` as TranslationKey;
const CLE_CANAL = (k: string): TranslationKey => `interaction.kind.${k}` as TranslationKey;

interface Props {
  pipeline: PipelineView | null;
  /** Site en ligne : conditionne l'avertissement sur la dépublication différée. */
  siteEnLigne: boolean;
  onDefinirStatut:
    | ((
        status: Enums<'pipeline_status'>,
        nextActionAt: string | null,
      ) => Promise<EchecDefinirStatut | null>)
    | null;
  onJournaliser:
    | ((kind: Enums<'interaction_kind'>, body: string | null) => Promise<string | null>)
    | null;
}

/**
 * Le suivi : statut du pipeline, et journal des échanges.
 *
 * Ces deux tables « attendent elles aussi leur premier écrivain » (plan,
 * tâche 7), et l'attente n'était pas cosmétique. `prospect_pipeline` est vide,
 * donc AUCUN prospect n'a jamais pu porter `ne_pas_contacter` — le retrait
 * immédiat de D5 était du code que rien ne pouvait atteindre. C'est cet écran
 * qui l'ouvre.
 */
export function PipelineSection({
  pipeline,
  siteEnLigne,
  onDefinirStatut,
  onJournaliser,
}: Props) {
  const t = useT();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ErreurSection | null>(null);
  const [consigne, setConsigne] = useState(false);
  const [canal, setCanal] = useState<Enums<'interaction_kind'>>('appel');
  const [note, setNote] = useState('');

  const statut = pipeline?.status ?? null;

  const changerStatut = (valeur: string): void => {
    if (onDefinirStatut === null) return;
    setEnCours(true);
    setErreur(null);
    void onDefinirStatut(valeur as Enums<'pipeline_status'>, pipeline?.nextActionAt ?? null)
      .then((echec) => setErreur(echec === null ? null : { source: 'statut', ...echec }))
      .finally(() => setEnCours(false));
  };

  const consigner = (): void => {
    if (onJournaliser === null) return;
    setEnCours(true);
    setErreur(null);
    setConsigne(false);
    void onJournaliser(canal, note)
      .then((message) => {
        setErreur(message === null ? null : { source: 'interaction', message });
        if (message === null) {
          setNote('');
          setConsigne(true);
        }
      })
      .finally(() => setEnCours(false));
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('panel.section.pipeline')}</h3>

      <label className={styles.control}>
        <span className={styles.fieldLabel}>{t('pipeline.label')}</span>
        <select
          value={statut ?? ''}
          disabled={enCours || onDefinirStatut === null}
          onChange={(e) => changerStatut(e.target.value)}
        >
          {/* L'option vide n'existe que tant qu'aucun statut n'a été posé :
              elle représente l'absence de ligne, pas un statut « aucun ». La
              retirer une fois choisie évite de laisser croire qu'on peut
              revenir à « jamais contacté », ce que la base ne sait pas faire. */}
          {statut === null ? <option value="">{t('pipeline.absent')}</option> : null}
          {STATUTS.map((s) => (
            <option key={s} value={s}>
              {t(CLE_STATUT(s))}
            </option>
          ))}
        </select>
      </label>

      {pipeline !== null ? (
        <p className={styles.trace}>{t('pipeline.updated', { date: jour(pipeline.updatedAt) })}</p>
      ) : null}

      {/* L'aveu qu'il faut faire. Le dashboard tourne dans un navigateur avec
          la clé anonyme : il ne peut détenir aucun jeton Vercel, sous peine de
          le publier dans son propre bundle. Le statut est donc enregistré
          IMMÉDIATEMENT, mais la page reste servie jusqu'au prochain
          `unpublish`. Taire cet écart ferait croire à un retrait accompli — au
          nom, précisément, de quelqu'un qui vient de refuser. */}
      {estUnRefus(statut) && siteEnLigne ? (
        <p className={styles.warning} role="alert">
          {t('pipeline.refusalWarning')}
        </p>
      ) : null}

      {onJournaliser !== null ? (
        <div className={styles.logger}>
          <h4 className={styles.messageTitle}>{t('interaction.title')}</h4>
          <label className={styles.control}>
            <span className={styles.fieldLabel}>{t('interaction.kind')}</span>
            <select
              value={canal}
              disabled={enCours}
              onChange={(e) => setCanal(e.target.value as Enums<'interaction_kind'>)}
            >
              {CANAUX.map((k) => (
                <option key={k} value={k}>
                  {t(CLE_CANAL(k))}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.control}>
            <span className={styles.fieldLabel}>{t('interaction.body')}</span>
            <textarea value={note} rows={2} disabled={enCours} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className={styles.action} disabled={enCours} onClick={consigner}>
            {enCours ? t('action.pending') : t('interaction.submit')}
          </button>
          {consigne ? <p className={styles.trace}>{t('interaction.saved')}</p> : null}
        </div>
      ) : null}

      {erreur !== null ? (
        <p className={styles.error} role="alert">
          {/* Un échec `historique` a quand même écrit le statut : le dire
              avec `action.failed` ferait croire à un clic sans effet, alors
              que c'est le comptage pour le jeu (tâche 6) qui manque, pas le
              statut lui-même. */}
          {erreur.source === 'statut' && erreur.etape === 'historique'
            ? t('pipeline.historyFailed', { message: erreur.message })
            : t('action.failed', { message: erreur.message })}
        </p>
      ) : null}
    </section>
  );
}
