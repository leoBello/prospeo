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
  | { nom: 'envoi_echec' }
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
  /** `is_closed` : un établissement cessé n'est plus un prospect. */
  estFerme: boolean;
  /**
   * Un numéro que `normalizePhone` sait composer — pas « la colonne est
   * renseignée ». Voir `toFaitsProspect` : la colonne vient du scraping.
   */
  aTelephone: boolean;
  /** Le `trade_slug` est dans le catalogue de `packages/core/src/trades.ts`. */
  metierConnu: boolean;
}

export interface Lot {
  lignes: FaitsProspect[];
  /**
   * Combien de prospects auraient été éligibles s'ils avaient un score.
   *
   * Ce compte porte une promesse — « les scorer les ferait entrer » — et ne
   * doit donc contenir QUE des prospects que le scoring débloquerait
   * réellement. Un prospect en « ne pas contacter » n'en fait pas partie, ni
   * un prospect sans téléphone : le scorer ne lui en donnerait pas un, et la
   * chaîne le refuserait toujours (voir `eligibleHorsScore`).
   */
  sansScore: number;
}

/**
 * Tout sauf le score : la partie de D3 qu'un scoring ne changerait pas, **et
 * ce que la chaîne sait effectivement traiter.**
 *
 * **Pourquoi la seconde moitié existe.** Les quatre premiers critères viennent
 * de D3 : qui a le droit d'entrer dans le lot. Les quatre suivants n'en
 * viennent pas — ils viennent de `fetchSiteCandidates`
 * (`apps/collector/src/chaine.ts`), c'est-à-dire de ce que le collector accepte
 * de traiter : un établissement vivant, une présence web sondée et pas déjà
 * correcte, un métier du catalogue, un téléphone composable (les deux derniers
 * sont les refus d'`assembleFacts`, que `fetchSiteCandidates` délègue).
 *
 * Les deux listes DOIVENT rester ensemble. Quand elles ont divergé, l'écran
 * proposait « Déployer » sur des prospects que la chaîne refusait en silence :
 * `generer` rendait `null`, `publier` levait « aucun contenu à publier — la
 * rédaction n'a rien écrit », et la ligne affichait donc un motif faux, avec un
 * bouton « Rejouer » qui rejouait le même échec indéfiniment. Trois des vingt
 * lignes du lot étaient dans ce cas, et 92 des 126 prospects scorés recevables
 * n'avaient aucun téléphone. Toucher l'une de ces deux listes sans l'autre
 * recrée exactement ce défaut.
 */
function eligibleHorsScore(f: FaitsProspect): boolean {
  return (
    f.statut === 'a_contacter' &&
    !f.aInteraction &&
    !f.aMessage &&
    !f.sitePublie &&
    !f.estFerme &&
    f.presence !== null &&
    f.presence !== 'has_site' &&
    f.metierConnu &&
    f.aTelephone
  );
}

/**
 * Le tri du lot : score décroissant, et les sans-score en dernier.
 *
 * Un `null` glissé dans une soustraction rendrait `NaN`, et un comparateur
 * qui rend `NaN` laisse l'ordre indéfini — pas trié, pas stable, pas
 * reproductible. On le traite donc explicitement.
 */
function parScoreDecroissant(a: FaitsProspect, b: FaitsProspect): number {
  if (a.score === null) return b.score === null ? 0 : 1;
  if (b.score === null) return -1;
  return b.score - a.score;
}

/**
 * Qui s'affiche : le lot des éligibles, **plus ce qu'on suit déjà**.
 *
 * **Pourquoi `suivis` existe.** D3 dit qui a le droit d'ENTRER dans le lot :
 * jamais contacté, aucun message écrit, aucun site publié. Or déployer un
 * prospect lui écrit un message et lui publie un site — deux critères qui
 * l'excluent aussitôt. S'en servir aussi comme filtre d'affichage faisait
 * donc DISPARAÎTRE la ligne sur laquelle on venait de cliquer, ce qui annule
 * la moitié « suivre » de « lancer et suivre une campagne ».
 *
 * Un prospect suivi reste donc visible quoi qu'en dise D3, et **il n'occupe
 * pas une des `taille` places** : les vingt mieux notés restent vingt, sinon
 * chaque lancement rétrécirait le vivier.
 *
 * `suivis` ne contient que les prospects portant un job non annulé : retirer
 * une demande doit rendre la ligne à son état d'avant, pas la figer à
 * l'écran.
 */
export function classerLot(
  faits: readonly FaitsProspect[],
  taille: number,
  suivis: ReadonlySet<string> = new Set(),
): Lot {
  const recevables = faits.filter(eligibleHorsScore);

  const suivi = faits.filter((f) => suivis.has(f.prospectId));
  const idsSuivis = new Set(suivi.map((f) => f.prospectId));

  const eligibles = recevables
    .filter((f): f is FaitsProspect & { score: number } => f.score !== null)
    // Déjà compté parmi les suivis : l'ajouter une seconde fois casserait la
    // clé de rendu de React et doublerait la ligne.
    .filter((f) => !idsSuivis.has(f.prospectId))
    .sort((a, b) => b.score - a.score)
    .slice(0, taille);

  return {
    lignes: [...suivi, ...eligibles].sort(parScoreDecroissant),
    // Un suivi sans score n'est pas un « écarté faute de score » : il est
    // déjà parti. L'y compter promettrait qu'un scoring le ferait entrer.
    sansScore: recevables.filter((f) => f.score === null && !idsSuivis.has(f.prospectId)).length,
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

/**
 * Le segment « site », depuis son seul fait d'aboutissement et, à défaut,
 * l'avancement du job.
 *
 * `siteEnLigne` est la vérité terrain : un job qui échoue APRÈS coup (un
 * rejeu, par exemple) ne doit jamais l'écraser. Le job n'est consulté que
 * quand ce fait ne tranche pas encore.
 */
function segmentSite(f: FaitsLigne): SegmentEtat {
  if (f.siteEnLigne) return 'ok';
  if (f.job === null) return 'vide';
  if (f.job.state === 'echoue') return 'echec';
  if (f.job.state === 'en_cours') return 'en_cours';
  // 'en_attente', 'termine', 'annule' : rien de plus precis a dire ici que
  // « pas encore en ligne » — le badge, lui, nomme l'attente s'il y en a une.
  return 'vide';
}

/** Le segment « mail », depuis son seul fait : rien d'autre ne le fait varier. */
function segmentMail(f: FaitsLigne): SegmentEtat {
  return f.mailRedige ? 'ok' : 'vide';
}

/**
 * Le segment « envoi », depuis l'envoi lui-même et l'adresse qui le
 * conditionne.
 *
 * Bloqué ≠ échoué (D9, et le test « distingue BLOQUE de ECHOUE ») : une
 * adresse manquante attend un humain, elle n'a rien raté. Ce segment ne rend
 * donc 'bloque' que si le mail est prêt à partir et qu'aucun envoi n'a
 * encore été tenté.
 */
function segmentEnvoi(f: FaitsLigne): SegmentEtat {
  if (f.envoi !== null) {
    if (f.envoi.state === 'envoye') return 'ok';
    if (f.envoi.state === 'echoue') return 'echec';
    return 'en_cours'; // f.envoi.state === 'en_cours'
  }
  return f.mailRedige && f.adresse === null ? 'bloque' : 'vide';
}

/**
 * Le badge, choisi APRÈS les trois segments et par ordre de priorité : c'est
 * la seule chose que la ligne dit en un mot, et c'est là — et seulement
 * là — que l'ordre compte.
 */
function choisirEtat(
  f: FaitsLigne,
  site: SegmentEtat,
  mail: SegmentEtat,
  envoi: SegmentEtat,
): EtatLigne {
  if (f.envoi !== null && f.envoi.state === 'envoye') {
    return { nom: 'envoye', le: f.envoi.sentAt ?? '' };
  }

  if (envoi === 'echec') return { nom: 'envoi_echec' };
  if (envoi === 'en_cours') return { nom: 'envoi_incertain' };

  if (f.job !== null && f.job.state === 'echoue') {
    // Choix assumé : un job en échec reste l'information la plus actionnable
    // et la plus récente, même quand le site est déjà en ligne et le mail
    // déjà prêt (`site` et `mail` le disent, honnêtement, à 'ok'). Le badge
    // nomme la dernière tentative, pas l'état du site — les deux cohabitent
    // sans se contredire : « échec » ne prétend jamais que le site est tombé.
    return {
      nom: 'site_echec',
      // Le détail de l'étape prime sur `last_error` : il vient de l'API qui a
      // refusé, là où `last_error` porte le préfixe d'étape ajouté par le
      // worker. C'est la phrase que la ligne affiche.
      detail: f.derniereEtape?.detail ?? f.job.lastError ?? '',
    };
  }

  // Un job ACTIF passe avant tout état dérivé de faits acquis : il décrit ce
  // qui se passe MAINTENANT, là où « mail à relire » et « adresse manquante »
  // décrivent un acquis qui sera toujours vrai au prochain rendu.
  //
  // LE DÉFAUT QUE CET ORDRE CORRIGE. Testées après « site ok + mail ok », ces
  // deux branches restaient inatteignables sur un prospect déjà publié : la
  // ligne affichait « Rejouer », le clic remettait le job `en_attente`, l'état
  // retombait sur « mail à relire » — sans bouton. Aucun retour visible au
  // clic, aucun rang annoncé, et plus aucun moyen de retirer la demande.
  //
  // Ce que cet ordre ne bouscule PAS : un envoi parti reste au-dessus de tout
  // (branches ci-dessus), et « bloqué » ne devient jamais « échoué » — le
  // segment `envoi` continue de porter 'bloque', et l'adresse manquante
  // réapparaît telle quelle dès le job clos.
  if (f.job !== null && f.job.state === 'en_cours') {
    return {
      nom: 'site_en_cours',
      // `redaction` est la première étape de `deployment_step` : un job pris
      // dont aucun événement n'est encore écrit en est là, et non nulle part.
      etape: f.derniereEtape?.step ?? 'redaction',
    };
  }

  if (f.job !== null && f.job.state === 'en_attente') {
    return { nom: 'en_file', rang: f.job.rang };
  }

  if (site === 'ok' && mail === 'ok') {
    return envoi === 'bloque' ? { nom: 'adresse_manquante' } : { nom: 'mail_a_relire' };
  }

  // Reste ici : aucun job (jamais rien demandé), ou un job 'termine'/'annule'
  // qui n'a fait avancer ni site, ni mail, ni adresse, ni envoi. Choix
  // assumé et verrouillé par les tests : sans qu'aucun de ces faits ait
  // bougé, nommer autre chose que « jamais » inventerait un fait qu'aucun
  // code ne peut rendre vrai.
  return { nom: 'jamais' };
}

export function etatLigne(f: FaitsLigne): {
  site: SegmentEtat;
  mail: SegmentEtat;
  envoi: SegmentEtat;
  etat: EtatLigne;
} {
  const site = segmentSite(f);
  const mail = segmentMail(f);
  const envoi = segmentEnvoi(f);

  return { site, mail, envoi, etat: choisirEtat(f, site, mail, envoi) };
}
