import type { ReactElement, ReactNode } from 'react';
import type { EtatLigne, FaitsLigne, Lot } from '../domain/campagne.js';
import { getTrade } from '@prospeo/core';
import { etatLigne } from '../domain/campagne.js';
import type { TranslationKey } from '../i18n/translate.js';
import { AppShell } from '../ui/AppShell.js';
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
 * **La bande de conditions (état du worker, boîte d'envoi) n'est pas ici non
 * plus** : c'est `BandeConditions`, composant d'une tâche ultérieure. `Lot`
 * porte déjà `heartbeat` pour cette raison-là — le lire maintenant sans rien
 * en afficher serait prématuré, pas manquant.
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
   * `null` : le battement n'a pas pu être lu. Porté dans les props dès ce lot
   * (voir `useCampagne`) pour que la tâche qui affiche `BandeConditions` n'ait
   * pas à retoucher cette interface — mais rien ici ne le lit encore.
   */
  heartbeat: { beatAt: string; inFlight: number } | null;
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
  onSignOut,
  nav,
}: CampagneScreenProps): ReactElement {
  const t = useT();

  return (
    <AppShell
      nav={nav}
      onSignOut={onSignOut}
      panel={null}
      list={
        <div className={styles.page}>
          <header className={styles.entete}>
            <h1 className={styles.titre}>{t('campagne.title')}</h1>
            <p className={styles.sousTitre}>{t('campagne.subtitle')}</p>
          </header>

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
                            <span className={styles.score}>{p.score}</span>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {lot.sansScore > 0 ? (
            <p className={styles.sansScore}>{t('campagne.sansScore', { count: lot.sansScore })}</p>
          ) : null}
        </div>
      }
    />
  );
}
