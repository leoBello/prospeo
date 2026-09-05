import type { ReactElement } from 'react';
import type { EtatCompteEnvoi } from '../domain/envoi.js';
import { Badge } from './kit/Badge.js';
import { useT } from './preferences.js';
import styles from './BandeConditions.module.css';

/**
 * Les conditions dont dépendent les actions de l'écran, posées **à côté**
 * d'elles.
 *
 * Le dashboard n'appelle ni GitHub ni Vercel : il dépose une demande en base,
 * qu'un collector résident draine. Si ce collector est mort, un bouton
 * « Déployer » promet un déploiement que personne n'exécutera — l'affordance
 * que la doctrine interdit. Cette bande rend ce fait visible **avant** le
 * clic, et c'est sa seule raison d'être.
 *
 * Elle porte deux conditions, et la seconde obéit à la même règle que la
 * première : le compte d'envoi Gmail. La maquette y montre aussi le compteur
 * d'envois du jour — il arrive avec la campagne de 10, seul lot où il décide
 * réellement d'un envoi. On ne l'esquisse pas en attendant : un emplacement
 * grisé annoncerait une capacité que rien ne rend vraie.
 */

/**
 * Six battements manqués.
 *
 * Le worker bat toutes les 10 s. Un seuil à 60 s tolère une latence réseau et
 * un redémarrage court sans clignoter, tout en signalant une vraie panne dans
 * la minute.
 */
export const SEUIL_WORKER_MORT_MS = 60_000;

/**
 * `null` vaut mort, jamais « on ne sait pas ».
 *
 * Accorder le bénéfice du doute rallumerait les boutons dans le seul cas où
 * l'on est certain de ne rien savoir. Un horodatage illisible est traité de
 * même, et **explicitement** : sans la garde, `NaN` rendrait la comparaison
 * fausse et le worker passerait pour mort par accident plutôt que par
 * décision — même résultat, mais que personne n'aurait choisi.
 */
export function workerVivant(beatAt: string | null, maintenant: Date): boolean {
  if (beatAt === null) return false;
  const battement = Date.parse(beatAt);
  if (Number.isNaN(battement)) return false;
  return maintenant.getTime() - battement < SEUIL_WORKER_MORT_MS;
}

/**
 * La moitié « envoi » de la bande.
 *
 * `null` ne rend **rien**, et c'est la règle de toute la bande : « on ne sait
 * pas encore » n'est pas une panne. L'afficher comme telle ferait clignoter
 * « aucun compte d'envoi » à chaque chargement, le temps que la session
 * stockée soit relue.
 *
 * Les deux états dégradés portent chacun **leur** remédiation, et les deux
 * libellés diffèrent — la maquette `CampagneEtats.dc.html` les dessine
 * séparément (1b et 1c). « Se reconnecter et reprendre » proposé à qui n'a
 * jamais ouvert de session Google promettrait de reprendre ce qui n'a jamais
 * commencé : c'est précisément la confusion que les trois états existent pour
 * éviter.
 */
function ConditionEnvoi({
  compte,
  onReconnecter,
}: {
  compte: EtatCompteEnvoi;
  onReconnecter: () => void;
}): ReactElement {
  const t = useT();

  if (compte.etat === 'pret') {
    return (
      <>
        {/* Le badge porte un MOT, jamais la seule teinte. */}
        <Badge ton="succes" point>
          {t('campagne.envoi.titre')}
        </Badge>
        <div className={styles.raison}>
          <p className={styles.raisonTexte}>
            {t('campagne.envoi.pret', { expediteur: compte.expediteur })}
          </p>
        </div>
      </>
    );
  }

  const sansJeton = compte.etat === 'sans_jeton';
  return (
    <>
      <Badge ton="alerte" point>
        {t(sansJeton ? 'campagne.envoi.sansJeton' : 'campagne.envoi.expire')}
      </Badge>
      {/* `role="status"` : la perte du compte d'envoi est annoncée aux
          lecteurs d'écran, qui sinon ne verraient rien apparaître. */}
      <div className={styles.raison} role="status">
        <p className={styles.raisonTexte}>
          {t(sansJeton ? 'campagne.envoi.sansJetonRaison' : 'campagne.envoi.expireRaison')}
        </p>
        {/* Le remède, et pas seulement le symptôme. */}
        <p className={styles.remede}>
          {t(sansJeton ? 'campagne.envoi.sansJetonRemede' : 'campagne.envoi.expireRemede')}
        </p>
      </div>
      <button className={styles.action} type="button" onClick={onReconnecter}>
        {t(sansJeton ? 'campagne.envoi.sansJetonAction' : 'campagne.envoi.expireAction')}
      </button>
    </>
  );
}

export function BandeConditions({
  heartbeat,
  maintenant,
  compteEnvoi,
  onReconnecter,
}: {
  heartbeat: { beatAt: string; inFlight: number } | null;
  maintenant: Date;
  /** `null` : on ne sait pas encore, ou personne n'est connecté. */
  compteEnvoi: EtatCompteEnvoi | null;
  onReconnecter: () => void;
}): ReactElement {
  const t = useT();
  const vivant = workerVivant(heartbeat?.beatAt ?? null, maintenant);

  // Trois états, et non deux. « Jamais entendu parler de lui » n'est pas
  // « silencieux depuis quatorze minutes » : les replier ferait afficher
  // « depuis 0 min », un chiffre que rien ne mesure. C'est la même règle qui
  // sépare « pas encore » de « jamais » partout ailleurs dans ce dépôt.
  const etat = vivant ? 'ecoute' : heartbeat === null ? 'inconnu' : 'arret';

  return (
    <div className={styles.bande}>
      {/* Le badge porte un MOT, pas seulement une teinte. */}
      <Badge ton={vivant ? 'succes' : 'danger'} point>
        {t(etat === 'ecoute' ? 'campagne.worker.ecoute' : etat === 'arret'
          ? 'campagne.worker.arret'
          : 'campagne.worker.inconnu')}
      </Badge>

      {etat === 'ecoute' ? null : (
        // `role="status"` : le passage à l'arrêt est annoncé aux lecteurs
        // d'écran, qui sinon ne verraient rien apparaître.
        <div className={styles.raison} role="status">
          <p className={styles.raisonTexte}>
            {etat === 'arret'
              ? t('campagne.worker.arret.raison', {
                  minutes: Math.floor(
                    (maintenant.getTime() - Date.parse((heartbeat as { beatAt: string }).beatAt)) /
                      60_000,
                  ),
                })
              : t('campagne.worker.inconnu.raison')}
          </p>
          {/* Le remède, et pas seulement le symptôme : un état signalé sans
              ce qu'il faut faire envoie chercher une remédiation qui
              n'existe pas. */}
          <p className={styles.remede}>{t('campagne.worker.arret.remede')}</p>
        </div>
      )}

      {compteEnvoi === null ? null : (
        <ConditionEnvoi compte={compteEnvoi} onReconnecter={onReconnecter} />
      )}
    </div>
  );
}
