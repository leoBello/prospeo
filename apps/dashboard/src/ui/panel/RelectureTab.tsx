import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Brouillon } from '../../data/envoi.js';
import type { EtatCompteEnvoi, RefusEnvoi } from '../../domain/envoi.js';
import { refusEnvoi } from '../../domain/envoi.js';
import type { ResultatEnvoi } from '../../data/envoi.js';
import type { TranslationKey } from '../../i18n/translate.js';
import { Badge } from '../kit/Badge.js';
import type { BadgeTon } from '../kit/Badge.js';
import { EmptyState } from '../kit/EmptyState.js';
import { Tooltip } from '../kit/Tooltip.js';
import { useT } from '../preferences.js';
import styles from './RelectureTab.module.css';

/**
 * L'origine de l'adresse, avec son ton et son explication.
 *
 * Trois valeurs et non deux : « collectée », « saisie », et l'ABSENCE. Une
 * adresse trouvée par un robot et une adresse tapée par un humain n'engagent
 * pas la même chose (D6) ; et n'en avoir aucune est un troisième fait, qui se
 * nomme plutôt que de laisser un champ vide — un champ vide se lirait comme
 * une adresse effacée.
 *
 * `Record` sur l'énumération de la base : une origine ajoutée sans son entrée
 * ici est une erreur de compilation, pas un badge muet en production.
 */
const ORIGINE: Record<'saisie' | 'collecte' | 'aucune', { cle: TranslationKey; aide: TranslationKey; ton: BadgeTon }> =
  {
    saisie: {
      cle: 'relecture.origine.saisie',
      aide: 'relecture.origineAide.saisie',
      ton: 'accent',
    },
    collecte: {
      cle: 'relecture.origine.collecte',
      aide: 'relecture.origineAide.collecte',
      ton: 'info',
    },
    aucune: {
      cle: 'relecture.origine.aucune',
      aide: 'relecture.origineAide.aucune',
      ton: 'neutre',
    },
  };

/** Ce que le motif de refus fait dire à l'écran, quand il a quelque chose à dire. */
const MOTIF_VISIBLE: Partial<Record<RefusEnvoi, TranslationKey>> = {
  deja_envoye: 'relecture.dejaEnvoye',
};

export interface RelectureTabProps {
  brouillon: Brouillon;
  /** `null` : on ne sait pas encore quel compte enverra. */
  compte: EtatCompteEnvoi | null;
  onEnregistrerAdresse: (email: string) => Promise<string | null>;
  onEnvoyer: () => Promise<ResultatEnvoi>;
}

/**
 * Le panneau de relecture — ce qu'on lit avant d'envoyer.
 *
 * Il suit `Campagne.dc.html` (392-500) : le destinataire et son origine,
 * l'objet, le corps tel qu'il partira, la traçabilité du texte, puis le pied
 * qui dit **avant le clic** de quelle adresse le mail part et ce que l'envoi
 * engage.
 *
 * **Les sauts de ligne du corps sont signifiants** : la ligne isolée qui porte
 * l'URL EST l'argument de vente. Les replier ferait relire autre chose que ce
 * qui partira — d'où le `pre-wrap` du CSS, qui n'est pas un détail de style.
 */
export function RelectureTab({
  brouillon,
  compte,
  onEnregistrerAdresse,
  onEnvoyer,
}: RelectureTabProps): ReactElement {
  const t = useT();
  const [saisie, setSaisie] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const refus = refusEnvoi({
    compte,
    adresse: brouillon.adresse,
    objet: brouillon.objet,
    corps: brouillon.corps,
    envoiExistant: brouillon.envoi,
  });
  const origine = ORIGINE[brouillon.adresse === null ? 'aucune' : (brouillon.origine ?? 'collecte')];
  // `?? null` et non le seul test de `null` : la table est PARTIELLE — tous
  // les motifs n'ont pas de phrase — et un `undefined` traité comme « il y a
  // une clé » ferait traduire `undefined`.
  const motifVisible = refus === null ? null : (MOTIF_VISIBLE[refus] ?? null);

  async function enregistrer() {
    if (saisie === null) return;
    setErreur(null);
    const message = await onEnregistrerAdresse(saisie.trim());
    if (message !== null) {
      setErreur(t('relecture.adresseEchec', { message }));
      return;
    }
    setSaisie(null);
  }

  async function envoyer() {
    setErreur(null);
    setEnCours(true);
    try {
      const resultat = await onEnvoyer();
      if (resultat.ok) return;
      // Trois échecs, trois phrases. Replier « suite » sur « échec d'envoi »
      // ferait recliquer sur un mail DÉJÀ parti, et la base refuserait alors
      // sans expliquer pourquoi.
      setErreur(
        resultat.etape === 'suite'
          ? t('relecture.echecSuite', { message: resultat.message })
          : resultat.etape === 'gmail'
            ? t('relecture.echecGmail', { message: resultat.message })
            : t('relecture.echecPrise'),
      );
    } finally {
      // Dans le `finally` : sur un échec, le bouton doit redevenir
      // actionnable, sans quoi une panne réseau condamne le panneau.
      setEnCours(false);
    }
  }

  return (
    <div className={styles.panneau}>
      <section className={styles.bloc}>
        <h3 className={styles.intitule}>{t('relecture.destinataire')}</h3>
        {saisie === null ? (
          <div className={styles.ligne}>
            {/* Vide quand il n'y a pas d'adresse : c'est le badge voisin qui
                NOMME l'absence, avec son infobulle. La redire ici l'écrirait
                deux fois de suite. */}
            <span className={styles.adresse}>{brouillon.adresse}</span>
            <Tooltip intitule={t(origine.cle)} contenu={t(origine.aide)}>
              {/* Le badge porte un MOT : l'origine ne se devine pas d'une teinte. */}
              <span>
                <Badge ton={origine.ton} taille="compacte">
                  {t(origine.cle)}
                </Badge>
              </span>
            </Tooltip>
            <button className={styles.secondaire} type="button" onClick={() => setSaisie('')}>
              {t(brouillon.adresse === null ? 'relecture.saisir' : 'relecture.corriger')}
            </button>
          </div>
        ) : (
          <div className={styles.ligne}>
            <label className={styles.etiquette} htmlFor="relecture-adresse">
              {t('relecture.destinataire')}
            </label>
            <input
              id="relecture-adresse"
              className={styles.champ}
              type="email"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
            />
            <button className={styles.secondaire} type="button" onClick={() => void enregistrer()}>
              {t('relecture.enregistrer')}
            </button>
            <button className={styles.secondaire} type="button" onClick={() => setSaisie(null)}>
              {t('relecture.annuler')}
            </button>
          </div>
        )}
      </section>

      {brouillon.objet === null && brouillon.corps === null ? (
        <EmptyState titre={t('relecture.pasDeMail')} detail={t('relecture.consequence')} />
      ) : (
        <>
          <section className={styles.bloc}>
            <h3 className={styles.intitule}>{t('relecture.objet')}</h3>
            <p className={styles.objet}>{brouillon.objet}</p>
          </section>

          <section className={styles.bloc}>
            <h3 className={styles.intitule}>{t('relecture.corps')}</h3>
            <p className={styles.corps}>{brouillon.corps}</p>
            {brouillon.modele === null ? null : (
              // La traçabilité, comme sur la fiche : un texte relu dans six
              // mois doit dire sous quelles consignes il a été écrit.
              <p className={styles.tracabilite}>
                {t('relecture.tracabilite', {
                  modele: brouillon.modele,
                  consignes: brouillon.consignes ?? '?',
                  date: brouillon.redigeLe ?? '?',
                })}
              </p>
            )}
          </section>
        </>
      )}

      <footer className={styles.pied}>
        {compte !== null && compte.etat === 'pret' ? (
          <p className={styles.avant}>
            {t('relecture.partiraDe', { expediteur: compte.expediteur })}
          </p>
        ) : null}
        <p className={styles.avant}>{t('relecture.consequence')}</p>

        {/* Le motif, et pas seulement le bouton éteint : un bouton mort qui ne
            dit pas pourquoi envoie chercher une remédiation qui n'existe pas. */}
        {motifVisible === null ? null : <p className={styles.motif}>{t(motifVisible)}</p>}

        {erreur === null ? null : (
          <p className={styles.erreur} role="alert">
            {erreur}
          </p>
        )}

        <button
          className={styles.principal}
          type="button"
          disabled={refus !== null || enCours}
          onClick={() => void envoyer()}
        >
          {enCours ? t('relecture.envoiEnCours') : t('relecture.envoyer')}
        </button>
      </footer>
    </div>
  );
}
