import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { createEventSink } from './stages/events.js';
import type { DeployDeps } from './stages/deploy.js';
import type { EtatSite, PublishDeps } from './stages/publish.js';
import type { GithubClient } from './sources/github.js';
import type { VercelClient } from './sources/vercel.js';

/**
 * Câblage des étages, en un seul endroit.
 *
 * **Pourquoi ce fichier existe.** Les objets `Deps` de `runPublish` et
 * `runDeploy` vivaient en ligne dans les `case` de `cli.ts`, à ~130 lignes
 * chacun. Le worker du chantier n°7 en a besoin des mêmes, pour un seul
 * prospect au lieu d'un lot. Les recopier aurait créé un dialecte, et une
 * correction n'aurait atterri que d'un côté — celui qu'on aurait ouvert.
 *
 * Ce fichier ne décide rien : il ne fait que construire les dépendances. Les
 * étages, eux, sont inchangés.
 */

/**
 * Une ligne de `prospect_site` telle que `fetchSiteRows` la rend.
 *
 * Les neuf champs sont ceux du `select` de `fetchSiteRows` (`cli.ts`), dans
 * le même ordre — `prospect_id`, dixième colonne du `select`, est la clé du
 * `Record<string, LigneSite>` et non un champ de la valeur. En omettre un
 * ferait échouer la construction du type au premier appelant qui le lit, et
 * non ici.
 */
export interface LigneSite {
  content: unknown;
  repo_full_name: string | null;
  repo_url: string | null;
  content_hash: string | null;
  content_rejected_at: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  vercel_project_id: string | null;
  deployment_url: string | null;
}

export function construireDepsPublication(
  client: SupabaseClient<Database>,
  opts: {
    github: GithubClient;
    templateRepoDefaut: string | undefined;
    rows: Record<string, LigneSite>;
  },
): PublishDeps {
  return {
    github: opts.github,
    templateRepoDefaut: opts.templateRepoDefaut,
    async lireEtat(prospectId) {
      const row = opts.rows[prospectId];
      if (row === undefined || row.repo_full_name === null) return null;
      return {
        repoFullName: row.repo_full_name,
        empreinte: row.content_hash,
        publishedAt: row.published_at === null ? null : new Date(row.published_at),
      } satisfies EtatSite;
    },
    async enregistrer(prospectId, etat) {
      const { error } = await client.from('prospect_site').upsert({
        prospect_id: prospectId,
        repo_full_name: etat.repoFullName,
        repo_url: etat.repoUrl,
        content_hash: etat.empreinte,
        prompt_version: etat.promptVersion,
        model: etat.model,
        generated_at: etat.generatedAt.toISOString(),
        published_at: etat.publishedAt.toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    maintenant: () => new Date(),
    events: createEventSink(client),
  };
}

export function construireDepsDeploiement(
  client: SupabaseClient<Database>,
  opts: { vercel: VercelClient; attendreUrl: (projectId: string) => Promise<string | null> },
): DeployDeps {
  return {
    vercel: opts.vercel,
    events: createEventSink(client),
    async enregistrerProjet(prospectId, vercelProjectId) {
      const { error } = await client
        .from('prospect_site')
        .update({ vercel_project_id: vercelProjectId, updated_at: new Date().toISOString() })
        .eq('prospect_id', prospectId);
      if (error) throw new Error(error.message);
    },
    async enregistrerUrl(prospectId, url) {
      const { error } = await client
        .from('prospect_site')
        .update({ deployment_url: url, updated_at: new Date().toISOString() })
        .eq('prospect_id', prospectId);
      if (error) throw new Error(error.message);
    },
    // Le déclenchement double est sans conséquence : l'API Vercel
    // dédoublonne les déploiements identiques faute de `forceNew`.
    attendreUrl: opts.attendreUrl,
    maintenant: () => new Date(),
  };
}

export type EtapeChaine = 'generate' | 'publish' | 'deploy' | 'pitch';

export interface ResultatChaine {
  termine: EtapeChaine[];
  echec: { etape: EtapeChaine; message: string } | null;
  /** `null` : aucune étape n'a su dire ce qu'elle coûtait. Ce n'est pas zéro. */
  coutEur: number | null;
}

export interface ChaineDeps {
  generer(prospectId: string): Promise<number | null>;
  publier(prospectId: string): Promise<void>;
  deployer(prospectId: string): Promise<void>;
  rediger(prospectId: string): Promise<number | null>;
}

/**
 * La chaîne complète sur UN prospect.
 *
 * **L'ordre est une dépendance de données, pas une convention** : publier
 * avant d'avoir généré pousserait un dépôt vide, et rédiger avant d'avoir
 * déployé produirait un mail citant une URL qui n'existe pas. La chaîne
 * s'arrête donc au premier échec au lieu de sauter l'étape fautive.
 *
 * Le rapport nomme l'étape qui a échoué : c'est ce que la ligne de l'écran
 * affichera, et « échoué » tout court n'aiderait personne.
 */
export async function traiterProspect(
  prospectId: string,
  deps: ChaineDeps,
): Promise<ResultatChaine> {
  const termine: EtapeChaine[] = [];
  // `null` tant qu'aucune étape n'a rendu de coût — voir `ResultatChaine`.
  let cout: number | null = null;

  const ajouterCout = (montant: number | null): void => {
    if (montant === null) return;
    cout = cout === null ? montant : cout + montant;
  };

  const etapes: readonly [EtapeChaine, () => Promise<number | null>][] = [
    ['generate', () => deps.generer(prospectId)],
    ['publish', () => deps.publier(prospectId).then(() => null)],
    ['deploy', () => deps.deployer(prospectId).then(() => null)],
    ['pitch', () => deps.rediger(prospectId)],
  ];

  for (const [etape, executer] of etapes) {
    try {
      ajouterCout(await executer());
      termine.push(etape);
    } catch (cause) {
      return {
        termine,
        echec: { etape, message: cause instanceof Error ? cause.message : String(cause) },
        coutEur: cout,
      };
    }
  }

  return { termine, echec: null, coutEur: cout };
}
