import type { Enums } from '@prospeo/db';

/**
 * Le cœur testable de l'écran de campagne : qui entre dans le lot, et où en
 * est chaque ligne.
 *
 * **Aucun accès réseau ici.** Ce module reçoit des faits et rend des états —
 * même partage des rôles qu'entre `data/queries.ts` et `domain/prospect.ts`.
 * C'est ce qui permet de prouver les règles de D3 et D9 sans base.
 */

export type SegmentEtat = 'vide' | 'en_cours' | 'ok' | 'echec' | 'bloque';

/**
 * L'état d'une ligne, en union discriminée plutôt qu'en chaîne.
 *
 * Une chaîne obligerait l'écran à la comparer à des littéraux, et rien
 * n'empêcherait d'en inventer un huitième. Ici, ajouter un état sans traiter
 * son rendu ne compile pas.
 */
export type EtatLigne =
  | { nom: 'jamais' }
  | { nom: 'en_file'; rang: number }
  | { nom: 'site_en_cours'; etape: Enums<'deployment_step'> }
  | { nom: 'site_echec'; detail: string }
  | { nom: 'mail_a_relire' }
  | { nom: 'adresse_manquante' }
  | { nom: 'envoi_incertain' }
  | { nom: 'envoye'; le: string };

export interface FaitsProspect {
  prospectId: string;
  denomination: string;
  ville: string;
  tradeSlug: string;
  /** `null` : jamais scoré. Ce n'est pas zéro — voir `classerLot`. */
  score: number | null;
  presence: Enums<'web_presence_category'> | null;
  statut: Enums<'pipeline_status'>;
  aInteraction: boolean;
  aMessage: boolean;
  sitePublie: boolean;
}

export interface Lot {
  lignes: FaitsProspect[];
  /**
   * Combien de prospects auraient été éligibles s'ils avaient un score.
   *
   * Ce compte porte une promesse — « les scorer les ferait entrer » — et ne
   * doit donc contenir QUE des prospects que le scoring débloquerait
   * réellement. Un prospect en « ne pas contacter » n'en fait pas partie.
   */
  sansScore: number;
}

/** Tout sauf le score : la partie de D3 qu'un scoring ne changerait pas. */
function eligibleHorsScore(f: FaitsProspect): boolean {
  return f.statut === 'a_contacter' && !f.aInteraction && !f.aMessage && !f.sitePublie;
}

export function classerLot(faits: readonly FaitsProspect[], taille: number): Lot {
  const recevables = faits.filter(eligibleHorsScore);

  return {
    lignes: recevables
      .filter((f): f is FaitsProspect & { score: number } => f.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, taille),
    sansScore: recevables.filter((f) => f.score === null).length,
  };
}

export interface FaitsLigne {
  job: { state: Enums<'campaign_job_state'>; lastError: string | null; rang: number } | null;
  derniereEtape: {
    step: Enums<'deployment_step'>;
    outcome: Enums<'deployment_outcome'>;
    detail: string | null;
  } | null;
  siteEnLigne: boolean;
  mailRedige: boolean;
  /** `null` : ni collectée ni saisie. Une absence, pas un échec (D9). */
  adresse: string | null;
  envoi: { state: Enums<'send_state'>; sentAt: string | null } | null;
}

export function etatLigne(f: FaitsLigne): {
  site: SegmentEtat;
  mail: SegmentEtat;
  envoi: SegmentEtat;
  etat: EtatLigne;
} {
  // L'ordre des cas suit celui de la chaîne, du plus avancé au moins avancé :
  // un mail parti prime sur tout le reste, et un échec de dépôt sur ce qui ne
  // s'est jamais produit.
  if (f.envoi !== null && f.envoi.state === 'envoye') {
    return {
      site: 'ok',
      mail: 'ok',
      envoi: 'ok',
      etat: { nom: 'envoye', le: f.envoi.sentAt ?? '' },
    };
  }

  if (f.envoi !== null && f.envoi.state === 'en_cours') {
    return { site: 'ok', mail: 'ok', envoi: 'en_cours', etat: { nom: 'envoi_incertain' } };
  }

  if (f.job !== null && f.job.state === 'echoue') {
    return {
      site: 'echec',
      mail: 'vide',
      envoi: 'vide',
      // Le détail de l'étape prime sur `last_error` : il vient de l'API qui a
      // refusé, là où `last_error` porte le préfixe d'étape ajouté par le
      // worker. C'est la phrase que la ligne affiche.
      etat: { nom: 'site_echec', detail: f.derniereEtape?.detail ?? f.job.lastError ?? '' },
    };
  }

  if (f.siteEnLigne && f.mailRedige) {
    return f.adresse === null
      ? { site: 'ok', mail: 'ok', envoi: 'bloque', etat: { nom: 'adresse_manquante' } }
      : { site: 'ok', mail: 'ok', envoi: 'vide', etat: { nom: 'mail_a_relire' } };
  }

  if (f.job !== null && f.job.state === 'en_cours') {
    return {
      site: 'en_cours',
      mail: 'vide',
      envoi: 'vide',
      etat: {
        nom: 'site_en_cours',
        // `redaction` est la première étape de `deployment_step` : un job pris
        // dont aucun événement n'est encore écrit en est là, et non nulle part.
        etape: f.derniereEtape?.step ?? 'redaction',
      },
    };
  }

  if (f.job !== null && f.job.state === 'en_attente') {
    return {
      site: 'vide',
      mail: 'vide',
      envoi: 'vide',
      etat: { nom: 'en_file', rang: f.job.rang },
    };
  }

  return { site: 'vide', mail: 'vide', envoi: 'vide', etat: { nom: 'jamais' } };
}
