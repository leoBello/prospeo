/**
 * Dépublication et péremption — tâche 6, D5.
 *
 * Deux causes de retrait, et une seule mécanique :
 *
 * - **le refus.** Sur passage à `ne_pas_contacter` ou `perdu`, le site est
 *   dépublié sans délai. La doctrine vient du socle : le statut « ne pas
 *   contacter » est « respecté immédiatement et définitivement », et elle vaut
 *   d'autant plus pour une page publiée au nom de l'entreprise qui refuse.
 * - **le silence.** Un site resté sans réponse expire seul au bout de
 *   `PEREMPTION_JOURS`. Un site portant le nom d'un tiers, publié sans son
 *   accord, ne doit pas vivre indéfiniment sans surveillance — et c'est la
 *   seule chose qui garantisse qu'un oubli finisse par se refermer tout seul.
 */

/** Délai de péremption d'un site resté sans réponse (D5). */
export const PEREMPTION_JOURS = 90;

const JOUR_MS = 24 * 3600 * 1000;

/**
 * Statuts qui prouvent que l'échange est vivant.
 *
 * Le délai vise le SILENCE, pas l'ancienneté : périmer au 90e jour le site
 * d'un prospect intéressé couperait une vente en cours.
 */
const ECHANGE_VIVANT = new Set(['interesse', 'gagne']);

/** Statuts qui valent refus, et déclenchent un retrait sans délai. */
const REFUS = new Set(['ne_pas_contacter', 'perdu']);

export interface SiteEnLigne {
  prospectId: string;
  /** `null` quand le déploiement n'a jamais abouti. */
  vercelProjectId: string | null;
  repoFullName: string;
  pipelineStatus: string;
  publishedAt: Date | null;
  unpublishedAt: Date | null;
}

export type UnpublishAction = 'garder' | 'refus' | 'peremption';

/**
 * Que faire de ce site ?
 *
 * `publishedAt` inconnue mène à `garder` : sans date, le délai n'a pas de
 * point de départ. Supprimer « dans le doute » détruirait un site peut-être
 * publié la veille ; garder laisse une ligne visible qu'un humain tranchera.
 * La suppression est irréversible, l'attente non.
 */
export function decideUnpublish(site: SiteEnLigne, now: Date): UnpublishAction {
  if (site.unpublishedAt !== null) return 'garder';
  if (REFUS.has(site.pipelineStatus)) return 'refus';
  if (ECHANGE_VIVANT.has(site.pipelineStatus)) return 'garder';
  if (site.publishedAt === null) return 'garder';

  const age = (now.getTime() - site.publishedAt.getTime()) / JOUR_MS;
  return age >= PEREMPTION_JOURS ? 'peremption' : 'garder';
}

/**
 * Le garde-fou : ne supprimer QUE ce que la base connaît.
 *
 * Il ne protège pas d'un jeton qui fuit — une portée s'en charge. Il protège
 * d'un défaut dans NOTRE code, et c'est le risque réel ici.
 *
 * L'équipe Vercel employée n'est pas dédiée : elle porte une vingtaine de
 * projets antérieurs, dont des sites clients réels et un portfolio. D4 voulait
 * un compte séparé ; le compte est partagé, et aucune ligne de code ne peut
 * changer ce fait. Ce que le code PEUT faire, c'est rendre inatteignable tout
 * projet que le collector n'a pas lui-même créé et enregistré dans
 * `prospect_site` — une boucle qui dérape ne peut alors détruire que son
 * propre travail.
 *
 * Même doctrine que `isDeletionWaveSuspect` dans `reconcile.ts` : sur la seule
 * famille d'opérations irréversibles du projet, on refuse le doute plutôt que
 * de l'arbitrer.
 */
export function projetSupprimable(projectId: string, connus: ReadonlySet<string>): boolean {
  const id = projectId.trim();
  // Un identifiant vide viserait une route inattendue de l'API Vercel.
  if (id === '') return false;
  return connus.has(id);
}

export interface UnpublishReport {
  /** Ce que le run a DÉCIDÉ, indépendamment de ce qu'il a exécuté. */
  decided: { garder: number; refus: number; peremption: number };
  unpublished: number;
  failed: number;
  /** Suppressions bloquées par le garde-fou : une incohérence base / Vercel. */
  refusedGuard: number;
}

export interface UnpublishDeps {
  lireSitesEnLigne(): Promise<SiteEnLigne[]>;
  /**
   * Tous les identifiants de projet Vercel que `prospect_site` enregistre.
   *
   * Lecture DISTINCTE de `lireSitesEnLigne`, et c'est ce qui donne au
   * garde-fou sa valeur. Dériver l'ensemble autorisé des sites qu'on vient de
   * lire en ferait une tautologie : chaque site y figurerait par construction
   * et le contrôle ne pourrait jamais se déclencher.
   *
   * Deux sources séparées rendent au contraire l'écart détectable : une ligne
   * modifiée à la main, une écriture partielle, ou une lecture qui rapporterait
   * un identifiant venu d'ailleurs que de la table.
   */
  lireProjetsEnregistres(): Promise<ReadonlySet<string>>;
  supprimerProjet(vercelProjectId: string): Promise<void>;
  marquerDepublie(prospectId: string): Promise<void>;
  maintenant(): Date;
}

/**
 * `dryRun` décide, compte et n'écrit rien.
 *
 * Le plan l'exige : « comme `reconcile` pour les suppressions, cette tâche
 * détruit : elle mérite un mode qui montre avant d'agir ».
 */
export async function runUnpublish(
  deps: UnpublishDeps,
  options: { dryRun: boolean },
): Promise<UnpublishReport> {
  const report: UnpublishReport = {
    decided: { garder: 0, refus: 0, peremption: 0 },
    unpublished: 0,
    failed: 0,
    refusedGuard: 0,
  };

  const sites = await deps.lireSitesEnLigne();
  // L'ensemble des projets que la base enregistre, lu à part. C'est lui, et
  // lui seul, qui autorise une suppression.
  const connus = await deps.lireProjetsEnregistres();
  const now = deps.maintenant();

  for (const site of sites) {
    const action = decideUnpublish(site, now);
    report.decided[action] += 1;
    if (action === 'garder') continue;
    if (options.dryRun) continue;

    try {
      if (site.vercelProjectId !== null) {
        if (!projetSupprimable(site.vercelProjectId, connus)) {
          console.error(
            `unpublish : ${site.prospectId} — suppression refusée, le projet ` +
              `« ${site.vercelProjectId} » n'est pas enregistré en base.`,
          );
          report.refusedGuard += 1;
          continue;
        }
        await deps.supprimerProjet(site.vercelProjectId);
      }

      // Marquer APRÈS avoir supprimé. L'ordre inverse laisserait, si la
      // suppression échoue, une ligne qui prétend que le site est hors ligne
      // alors qu'il est toujours servi au nom d'une entreprise qui a refusé.
      await deps.marquerDepublie(site.prospectId);
      report.unpublished += 1;
    } catch (erreur) {
      console.error(
        `unpublish : échec sur ${site.prospectId} (${site.repoFullName}) — ${
          erreur instanceof Error ? erreur.message : String(erreur)
        }`,
      );
      report.failed += 1;
    }
  }

  return report;
}

/**
 * Un site qui devait disparaître et qui est toujours en ligne au nom d'un
 * tiers ayant refusé n'est pas un run réussi. Le garde-fou déclenché compte
 * aussi : il signale une incohérence entre la base et Vercel, pas une
 * situation normale.
 */
export function unpublishExitCode(report: UnpublishReport): number {
  return report.failed > 0 || report.refusedGuard > 0 ? 1 : 0;
}
