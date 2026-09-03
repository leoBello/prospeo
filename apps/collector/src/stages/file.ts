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
