import type { Session } from '@supabase/supabase-js';
import type { Enums } from '@prospeo/db';

/**
 * L'état du compte d'envoi — TROIS valeurs, et le §7.1 du spec l'exige.
 *
 * « Connecté par mot de passe » et « jeton expiré » se ressemblent (aucun
 * jeton en main) et n'appellent pas la même phrase : le premier n'a jamais
 * ouvert de session Google, le second l'a fait et l'a perdue. Leur
 * remédiation diffère donc, et `CampagneEtats.dc.html` les dessine
 * séparément.
 *
 * `null` est un QUATRIÈME cas, distinct des trois : on ne sait pas encore, ou
 * personne n'est connecté. Le replier sur `sans_jeton` ferait clignoter
 * « aucun compte d'envoi » à chaque chargement.
 */
export type EtatCompteEnvoi =
  | { etat: 'pret'; expediteur: string }
  | { etat: 'sans_jeton' }
  | { etat: 'jeton_expire'; expediteur: string };

export function etatCompteEnvoi(session: Session | null | undefined): EtatCompteEnvoi | null {
  if (session === null || session === undefined) return null;

  const expediteur = session.user.email ?? '';
  // `provider_token` n'existe que juste après l'échange OAuth : Supabase ne le
  // renouvelle pas, et il disparaît au premier rafraîchissement de la session.
  if (typeof session.provider_token === 'string' && session.provider_token !== '') {
    return { etat: 'pret', expediteur };
  }

  // `app_metadata.provider` garde la trace du fournisseur qui a ouvert la
  // session, même une fois le jeton perdu : c'est LUI qui distingue les deux
  // absences.
  const fournisseur = (session.user.app_metadata as { provider?: string }).provider;
  return fournisseur === 'google' ? { etat: 'jeton_expire', expediteur } : { etat: 'sans_jeton' };
}

/** Ce qui manque pour qu'un envoi soit possible — `null` quand rien ne manque. */
export type RefusEnvoi = 'compte' | 'adresse' | 'mail' | 'deja_envoye';

/**
 * Décide si le geste « Envoyer » a un sens, et nomme ce qui manque sinon.
 *
 * **Ne remplace pas la garantie.** L'unicité d'un envoi vit dans l'index
 * partiel `message_send_unique`, en base : cette fonction évite de PROPOSER
 * un geste que la base refuserait, elle ne le garantit pas. Un écran ouvert
 * depuis dix minutes peut se tromper ; la base, non.
 */
export function refusEnvoi(args: {
  compte: EtatCompteEnvoi | null;
  adresse: string | null;
  objet: string | null;
  corps: string | null;
  envoiExistant: { state: Enums<'send_state'> } | null;
}): RefusEnvoi | null {
  if (args.compte === null || args.compte.etat !== 'pret') return 'compte';
  if (args.adresse === null || args.adresse.trim() === '') return 'adresse';
  if (args.objet === null || args.corps === null) return 'mail';
  // `echoue` est le seul état rejouable — le même critère que l'index partiel.
  if (args.envoiExistant !== null && args.envoiExistant.state !== 'echoue') return 'deja_envoye';
  return null;
}
