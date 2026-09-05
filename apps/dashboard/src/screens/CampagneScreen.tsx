import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { EtatLigne, FaitsLigne, Lot } from '../domain/campagne.js';
import type { EtatCompteEnvoi } from '../domain/envoi.js';
import type { Brouillon, ResultatEnvoi } from '../data/envoi.js';
import type { MailAEnvoyer } from '../data/gmail.js';
import { RelectureTab } from '../ui/panel/RelectureTab.js';
import { getTrade } from '@prospeo/core';
import { etatLigne } from '../domain/campagne.js';
import type { TranslationKey } from '../i18n/translate.js';
import { AppShell } from '../ui/AppShell.js';
import { BandeConditions, workerVivant } from '../ui/BandeConditions.js';
import { PisteCampagne } from '../ui/PisteCampagne.js';
import { Badge } from '../ui/kit/Badge.js';
import type { BadgeTon } from '../ui/kit/Badge.js';
import { EmptyState } from '../ui/kit/EmptyState.js';
import { CLE_PRESENCE, TON_PRESENCE } from '../ui/presence.js';
import { useT } from '../ui/preferences.js';
import styles from './CampagneScreen.module.css';

/**
 * L'écran de campagne.
 *
 * **Il lit, il n'agit pas encore** (chantier n°7, tâches 8-9) : les actions
 * (déployer, relire, renvoyer…) arrivent avec la file, tâche 11. Livrer un
 * bouton avant son exécutant produirait une affordance qui annonce un fait
 * qu'aucun code ne rend vrai — c'est pour cette raison que `campagne.action.*`
 * n'existe dans aucun catalogue et qu'aucune colonne d'actions n'apparaît
 * ci-dessous, contrairement à la maquette `Campagne.html` : elle montre
 * l'écran complet, celui-ci n'en est que la lecture.
 *
 * **La bande de conditions y est**, elle, et à sa place de la maquette :
 * juste sous l'en-tête, au-dessus de la liste. Une condition qui gouverne des
 * boutons se lit à côté d'eux. Elle ne porte encore que la moitié « worker »
 * — la boîte d'envoi Gmail arrive avec la connexion Google.
 */

/**
 * Le ton du badge d'état, choisi sur le MÊME modèle que `TON_ETAT` de
 * `DeploiementsScreen.tsx` : un `Record` exhaustif sur l'union discriminée,
 * plutôt qu'un second composant à côté de `kit/Badge.tsx` — voir le
 * docstring de `cleEtat` ci-dessous pour la raison symétrique côté libellé.
 */
const TON_ETAT: Record<EtatLigne['nom'], BadgeTon> = {
  jamais: 'neutre',
  en_file: 'neutre',
  site_en_cours: 'accent',
  site_echec: 'danger',
  mail_a_relire: 'accent',
  adresse_manquante: 'alerte',
  envoi_incertain: 'accent',
  envoi_echec: 'danger',
  envoye: 'succes',
};

/** Le libellé d'un état. Une clé par variante : ajouter un état sans son libellé ne compile pas. */
function cleEtat(etat: EtatLigne): TranslationKey {
  switch (etat.nom) {
    case 'jamais':
      return 'campagne.etat.jamais';
    case 'en_file':
      return 'campagne.etat.enFile';
    case 'site_en_cours':
      return 'campagne.etat.siteEnCours';
    case 'site_echec':
      return 'campagne.etat.siteEchec';
    case 'mail_a_relire':
      return 'campagne.etat.mailARelire';
    case 'adresse_manquante':
      return 'campagne.etat.adresseManquante';
    case 'envoi_incertain':
      return 'campagne.etat.envoiIncertain';
    case 'envoi_echec':
      return 'campagne.etat.envoiEchec';
    case 'envoye':
      return 'campagne.etat.envoye';
  }
}

export interface CampagneScreenProps {
  lot: Lot;
  lignes: Map<string, FaitsLigne>;
  totalProspects: number;
  /**
   * `null` : aucun battement n'a jamais été enregistré, ou la lecture a
   * échoué. `BandeConditions` en fait un état à part — « on ne sait rien de
   * lui » n'est pas « il s'est tu il y a quatorze minutes », et les replier
   * afficherait « depuis 0 min », un chiffre que rien ne mesure.
   */
  heartbeat: { beatAt: string; inFlight: number } | null;
  /**
   * L'état du compte d'envoi Gmail, ou `null` quand on ne sait pas encore.
   *
   * Traversé plutôt que lu ici : l'écran ne connaît pas la session, et c'est
   * `App` qui la tient. Le distinguer de « pas de compte » est la raison
   * d'être des trois états — voir `domain/envoi.ts`.
   */
  compteEnvoi: EtatCompteEnvoi | null;
  /** Rouvre le flux Google. Appelée par la remédiation de la bande. */
  onReconnecter: () => void;
  /**
   * Les trois gestes du panneau de relecture, **injectés** comme le sont déjà
   * `onDeposer` et `onRetirer`.
   *
   * Cet écran ne connaît ni le client Supabase ni la session : c'est `App` qui
   * les tient, et c'est ce qui permet aux dix-sept tests de ce fichier de le
   * rendre sans base. Y faire entrer un client casserait ce partage pour ce
   * seul lot.
   */
  onLireBrouillon: (prospectId: string) => Promise<Brouillon>;
  onEnregistrerAdresse: (prospectId: string, email: string) => Promise<string | null>;
  onEnvoyer: (prospectId: string, mail: MailAEnvoyer) => Promise<ResultatEnvoi>;
  /**
   * Déposer une demande, et la retirer. Rendent `null` en cas de succès et le
   * message d'erreur sinon — la convention de `designerGabarit` et de
   * `PanelActions`, adoptée après qu'une écriture refusée par la RLS n'ait été
   * journalisée qu'en console, l'opérateur croyant le changement pris.
   *
   * L'écran ne connaît pas le client Supabase : c'est `App` qui les câble.
   */
  onDeposer: (prospectId: string) => Promise<string | null>;
  onRetirer: (prospectId: string) => Promise<string | null>;
  onSignOut: () => void;
  nav: ReactNode;
}

/** L'état d'une ligne dont rien n'est encore connu : jamais touchée. */
const LIGNE_VIERGE: FaitsLigne = {
  job: null,
  derniereEtape: null,
  siteEnLigne: false,
  mailRedige: false,
  adresse: null,
  envoi: null,
};

export function CampagneScreen({
  lot,
  lignes,
  totalProspects,
  heartbeat,
  onDeposer,
  onRetirer,
  onSignOut,
  nav,
  compteEnvoi,
  onReconnecter,
  onLireBrouillon,
  onEnregistrerAdresse,
  onEnvoyer,
}: CampagneScreenProps): ReactElement {
  const t = useT();
  const maintenant = new Date();
  // Le worker mort n'éteint pas les boutons par prudence : il les éteint
  // parce qu'une demande déposée maintenant ne partirait pas. La raison est
  // portée par `BandeConditions`, juste au-dessus, et l'infobulle du bouton
  // la répète là où le geste se fait.
  const executable = workerVivant(heartbeat?.beatAt ?? null, maintenant);
  // Reste affichée jusqu'à la tentative suivante — pas un message fugace qui
  // disparaît avant d'avoir été lu (même parti que `GabaritScreen`).
  const [erreur, setErreur] = useState<string | null>(null);

  const agir = (action: Promise<string | null>): void => {
    void action.then(setErreur);
  };

  // Le prospect dont le panneau est ouvert, et son brouillon. Deux états et
  // non un : `ouvert` sans `brouillon` est le temps de la lecture, et le
  // replier ferait clignoter un panneau vide — la même distinction que
  // partout ailleurs entre « on ne sait pas encore » et « il n'y a rien ».
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);

  const ouvrirRelecture = (prospectId: string): void => {
    setOuvert(prospectId);
    setBrouillon(null);
    void onLireBrouillon(prospectId).then(setBrouillon);
  };

  const relire = (prospectId: string): void => {
    void onLireBrouillon(prospectId).then(setBrouillon);
  };

  return (
    <AppShell
      nav={nav}
      onSignOut={onSignOut}
      panel={
        ouvert === null || brouillon === null ? null : (
          <aside className={styles.panneau}>
            <RelectureTab
              brouillon={brouillon}
              compte={compteEnvoi}
              onEnregistrerAdresse={async (email) => {
                const echec = await onEnregistrerAdresse(ouvert, email);
                // Relu après l'écriture : le panneau doit montrer l'adresse
                // telle qu'elle est en base, pas telle qu'elle a été tapée.
                if (echec === null) relire(ouvert);
                return echec;
              }}
              onEnvoyer={async () => {
                const resultat = await onEnvoyer(ouvert, {
                  de: compteEnvoi !== null && compteEnvoi.etat === 'pret' ? compteEnvoi.expediteur : '',
                  a: brouillon.adresse ?? '',
                  objet: brouillon.objet ?? '',
                  corps: brouillon.corps ?? '',
                });
                // Relu même en échec : `message_send` a bougé dans tous les
                // cas, et le panneau doit cesser de proposer un envoi que la
                // base refuserait désormais.
                relire(ouvert);
                return resultat;
              }}
            />
          </aside>
        )
      }
      list={
        <div className={styles.page}>
          <header className={styles.entete}>
            <h1 className={styles.titre}>{t('campagne.title')}</h1>
            <p className={styles.sousTitre}>{t('campagne.subtitle')}</p>
          </header>

          <BandeConditions
            heartbeat={heartbeat}
            maintenant={maintenant}
            compteEnvoi={compteEnvoi}
            onReconnecter={onReconnecter}
          />

          {lot.lignes.length === 0 ? (
            // Deux vides de natures différentes, deux écrans. Le second ne se
            // DÉRIVE PAS d'un tableau vide : c'est `totalProspects`, une
            // propriété à part entière, qui les distingue — un lot vide et
            // une base vide sont deux faits différents que `lot.lignes.length
            // === 0` seul ne saurait pas séparer (doctrine des absences).
            <EmptyState
              titre={totalProspects === 0 ? t('campagne.vide.aucunProspect') : t('campagne.vide.lotFini')}
              detail={
                totalProspects === 0
                  ? t('campagne.vide.aucunProspect.detail')
                  : t('campagne.vide.lotFini.detail')
              }
            />
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('campagne.col.prospect')}</th>
                  <th scope="col" className={styles.colPiste}>
                    {t('campagne.col.piste')}
                  </th>
                  <th scope="col" className={styles.colEtat}>
                    {t('campagne.col.etat')}
                  </th>
                  {/* Sans intitulé : la colonne ne porte que des boutons, qui
                      se nomment eux-mêmes. Mais la cellule doit EXISTER — en
                      `table-layout: fixed`, ce sont les cellules de la
                      première rangée qui fixent les largeurs, et une colonne
                      absente de l'en-tête absorbe tout l'espace restant. */}
                  <th scope="col" className={styles.colAction} />
                </tr>
              </thead>
              <tbody>
                {lot.lignes.map((p) => {
                  const r = etatLigne(lignes.get(p.prospectId) ?? LIGNE_VIERGE);
                  return (
                    <tr key={p.prospectId} data-etat={r.etat.nom}>
                      <td>
                        <div className={styles.identite}>
                          <div className={styles.ligneNom}>
                            <span className={styles.nom}>{p.denomination}</span>
                            {/* La presence web n'est pas decorative : c'est
                                elle qui porte l'argument de vente. « Votre
                                site ne repond plus, en voici un qui
                                fonctionne » est le plus fort du lot, et ce
                                badge le designe d'un coup d'oeil.

                                `null` n'est pas une categorie : c'est
                                « pas encore sonde ». On le NOMME plutot que
                                de laisser la case vide, et sur un ton neutre
                                pour ne pas lui preter une valeur de vente
                                qu'aucune sonde n'a mesuree. */}
                            <Badge
                              ton={p.presence === null ? 'neutre' : TON_PRESENCE[p.presence]}
                              taille="compacte"
                            >
                              {t(p.presence === null ? 'presence.absent' : CLE_PRESENCE[p.presence])}
                            </Badge>
                          </div>
                          <span className={styles.meta}>
                            {getTrade(p.tradeSlug)?.label ?? p.tradeSlug} · {p.ville} ·{' '}
                            {/* React rend `null` comme RIEN : la ligne
                                s'arrêtait sur « Plombier · Nantes · ».
                                `classerLot` garde délibérément un suivi sans
                                score — le domaine tenait la doctrine, le rendu
                                la perdait au dernier mètre. Même clé que
                                `DeploiementsScreen` et `ScoreBar` : une seule
                                façon de nommer cette absence-là. */}
                            <span className={styles.score}>
                              {p.score === null ? t('score.absent') : p.score}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className={styles.colPiste}>
                        <PisteCampagne site={r.site} mail={r.mail} envoi={r.envoi} />
                      </td>
                      <td className={styles.colEtat}>
                        {/* Le badge porte un MOT, jamais une couleur seule. */}
                        <Badge ton={TON_ETAT[r.etat.nom]} point>
                          {t(cleEtat(r.etat), r.etat.nom === 'en_file' ? { rang: r.etat.rang } : {})}
                        </Badge>
                        {r.etat.nom === 'site_echec' ? (
                          // La cause est DANS la ligne, pas derrière un
                          // journal à ouvrir — même parti que D9 du
                          // chantier n°6.
                          <p className={styles.cause}>{r.etat.detail}</p>
                        ) : null}
                      </td>
                      <td className={styles.colAction}>
                        {/* « Site en cours » ne porte AUCUN geste : il n'y a
                            rien a faire pendant qu'il tourne, et un bouton
                            « Detail » promettrait un ecran que ce lot ne
                            construit pas. « Envoi incertain » non plus — il
                            attend, et recliquer ne ferait que buter sur
                            l'index unique. « Envoye » est fini. Les trois
                            etats que l'envoi debloque ouvrent le MEME panneau :
                            c'est lui qui sait quoi proposer. */}
                        {r.etat.nom === 'jamais' || r.etat.nom === 'site_echec' ? (
                          <button
                            type="button"
                            className={styles.action}
                            disabled={!executable}
                            title={executable ? undefined : t('campagne.action.impossible')}
                            onClick={() => agir(onDeposer(p.prospectId))}
                          >
                            {t(
                              r.etat.nom === 'jamais'
                                ? 'campagne.action.deployer'
                                : 'campagne.action.rejouer',
                            )}
                          </button>
                        ) : r.etat.nom === 'en_file' ? (
                          <button
                            type="button"
                            className={styles.action}
                            onClick={() => agir(onRetirer(p.prospectId))}
                          >
                            {t('campagne.action.retirer')}
                          </button>
                        ) : r.etat.nom === 'mail_a_relire' ||
                          r.etat.nom === 'adresse_manquante' ||
                          r.etat.nom === 'envoi_echec' ? (
                          <button
                            type="button"
                            className={styles.action}
                            onClick={() => ouvrirRelecture(p.prospectId)}
                          >
                            {t('campagne.action.relire')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {erreur !== null ? (
            <p className={styles.erreur} role="alert">
              {t('action.failed', { message: erreur })}
            </p>
          ) : null}

          {lot.sansScore > 0 ? (
            <p className={styles.sansScore}>{t('campagne.sansScore', { count: lot.sansScore })}</p>
          ) : null}
        </div>
      }
    />
  );
}
