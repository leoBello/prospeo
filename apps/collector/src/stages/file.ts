/**
 * La file de travail : prendre un job, sans jamais en prendre deux.
 *
 * **Pourquoi une prise en deux temps plutôt qu'une requête atomique.**
 * PostgREST ne sait pas exprimer « mets à jour la plus ancienne ligne en
 * attente et rends-la ». On lit donc une liste, puis on tente une mise à jour
 * CONDITIONNÉE À L'ÉTAT (`state = 'en_attente'`) : si un autre worker est
 * passé entre les deux, la mise à jour ne touche aucune ligne et `prendre`
 * rend `false`. La course se perd proprement au lieu de produire deux workers
 * sur le même dépôt GitHub.
 *
 * Ce module ne touche pas à Supabase : il reçoit ses accès en paramètre, sur
 * le patron de `runPublish` et `runDeploy`. C'est ce qui le rend testable
 * sans base.
 */

export interface Job {
  id: number;
  prospectId: string;
  campaignId: string | null;
  attempts: number;
}

/**
 * Uniquement ce que `prendreProchain` emploie.
 *
 * Clore un job et battre le cœur sont l'affaire du worker : les déclarer ici
 * ferait croire que la prise en dépend, et obligerait chaque test à fabriquer
 * deux fonctions qu'il n'appelle jamais.
 */
export interface FileDeps {
  /** Les jobs en attente, du plus ancien au plus récent. */
  listerEnAttente(): Promise<
    { id: number; prospect_id: string; campaign_id: string | null; attempts: number }[]
  >;
  /** Tente la prise. `false` : un autre l'a eu d'abord. */
  prendre(id: number): Promise<boolean>;
}

export async function prendreProchain(deps: FileDeps): Promise<Job | null> {
  const candidats = await deps.listerEnAttente();

  for (const c of candidats) {
    if (await deps.prendre(c.id)) {
      return {
        id: c.id,
        prospectId: c.prospect_id,
        campaignId: c.campaign_id,
        attempts: c.attempts,
      };
    }
  }

  // Ni « file vide » ni « erreur » : simplement, tout ce qui attendait est
  // parti ailleurs. L'appelant réessaiera au prochain tour.
  return null;
}

/**
 * Borne à UNE l'exécution simultanée d'un drainage.
 *
 * **Pourquoi `prendre` ne suffit pas.** La prise conditionnée à l'état garantit
 * qu'un job n'est jamais traité deux fois — elle ne borne rien d'autre. Deux
 * boucles de drainage prennent simplement deux jobs DIFFÉRENTS et les traitent
 * de front : l'unicité du job est sauve, le parallélisme ne l'est pas.
 *
 * **Pourquoi ce parallélisme est un problème.** Le worker déclenche un drainage
 * sur chaque événement Realtime ET toutes les 30 s en filet. Sans garde, une
 * file de cinq jobs à 45–200 s chacun voyait une boucle de plus toutes les
 * 30 s, et cinq clics rapprochés en produisaient cinq d'un coup. Ce ne sont pas
 * des boucles gratuites : chacune appelle GitHub, Vercel et Anthropic, dont les
 * quotas sont la vraie limite de cette chaîne. Le §6 du spec demande une
 * concurrence bornée, réglable, à 1 par défaut ; c'est le 1 par défaut.
 *
 * La rejection n'est PAS avalée : elle remonte à l'appelant, qui la journalise.
 * La garde se libère dans tous les cas — laissée fermée par une exception, elle
 * arrêterait le worker pour toujours, sans rien dire.
 */
export function unSeulALaFois(action: () => Promise<void>): () => Promise<void> {
  let enCours = false;

  return async () => {
    // Le tour écarté n'est pas perdu : le balayage périodique du worker
    // rappelle `drainer`, et la boucle en cours vide de toute façon la file
    // tant qu'elle y trouve du travail.
    if (enCours) return;
    enCours = true;
    try {
      await action();
    } finally {
      enCours = false;
    }
  };
}
