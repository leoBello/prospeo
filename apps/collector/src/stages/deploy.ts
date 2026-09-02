/**
 * `deploy` — tâche 5 : créer le projet Vercel, amorcer le premier
 * déploiement, enregistrer l'URL de production. Extrait de `cli.ts` pour
 * devenir testable, sur le même patron que `runPublish`.
 *
 * **Pourquoi cette extraction existe.** Avant cette tâche, la cause d'un
 * échec partait sur `stderr` et la base n'en gardait rien — c'est elle que
 * l'écran de suivi doit pouvoir afficher, pas un terminal qu'on ne consulte
 * qu'une fois par semaine.
 */

import type { VercelClient } from '../sources/vercel.js';
import type { EventSink } from './events.js';

/** Ce que `cli.ts` sait déjà d'un site à déployer. */
export interface DeploySite {
  prospectId: string;
  repoFullName: string;
  /** `null` tant qu'aucun projet Vercel n'a été créé pour ce prospect. */
  vercelProjectId: string | null;
}

export interface DeployReport {
  /** URL de production obtenue et enregistrée pendant ce run. */
  deployed: number;
  /**
   * Build démarré, URL pas encore disponible. Rejouer `deploy` reprendra ces
   * lignes : leur `deployment_url` reste nulle, et le projet ne sera pas
   * recréé.
   */
  pending: number;
  failed: number;
}

/**
 * Un build en cours n'est pas un échec, c'est un run à rejouer — même
 * doctrine que le `case 'deploy'` d'origine dans `cli.ts`. Seul `failed`
 * fait échouer le code de sortie.
 */
export function deployExitCode(report: DeployReport): number {
  return report.failed > 0 ? 1 : 0;
}

export interface DeployDeps {
  vercel: VercelClient;
  /**
   * Journal des événements de déploiement (tâche 3). OBLIGATOIRE — pas
   * `events?:` — même raison que dans `PublishDeps` : un champ optionnel
   * laisse un appelant l'oublier sans que rien ne le signale, et c'est alors
   * le journal qui se tait, en silence, sur une partie seulement des runs.
   */
  events: EventSink;
  /** Écrit `vercel_project_id` sur la ligne `prospect_site` du prospect. */
  enregistrerProjet(prospectId: string, vercelProjectId: string): Promise<void>;
  /** Écrit `deployment_url` sur la ligne `prospect_site` du prospect. */
  enregistrerUrl(prospectId: string, url: string): Promise<void>;
  /**
   * Attend qu'un déploiement devienne joignable, dans une limite
   * raisonnable — injectée plutôt que portée ici avec de vrais
   * `setTimeout` : c'est ce qui rend `runDeploy` testable sans horloge.
   * `cli.ts` y branche la boucle de scrutation réelle.
   */
  attendreUrl(projectId: string): Promise<string | null>;
}

/**
 * Déploie un lot de prospects, un par un.
 *
 * **Séquentiel, et non parallèle** — même raison que `runPublish` : Vercel
 * comme GitHub limitent le débit, et le lot ne dépasse pas vingt-deux
 * prospects.
 *
 * **Un échec n'interrompt pas le lot.** « Aucun étage ne peut corrompre la
 * base sur un échec partiel » (spec du socle, §12) : un 403 sur un prospect
 * ne doit pas laisser les autres au point mort.
 */
export async function runDeploy(
  sites: readonly DeploySite[],
  deps: DeployDeps,
): Promise<DeployReport> {
  const report: DeployReport = { deployed: 0, pending: 0, failed: 0 };

  for (const site of sites) {
    const { prospectId, repoFullName } = site;
    const nom = repoFullName.split('/')[1] ?? repoFullName;
    // Retenue pour que le `catch` sache QUELLE étape a échoué — c'est cette
    // granularité que l'écran de suivi doit pouvoir montrer, pas un simple
    // « ça a raté quelque part ».
    let etape: 'projet' | 'build' | 'en_ligne' = 'projet';

    try {
      let projectId = site.vercelProjectId;
      if (projectId === null) {
        const projet = await deps.vercel.creerProjet(nom, repoFullName);
        projectId = projet.id;
        await deps.enregistrerProjet(prospectId, projectId);
        // Émis seulement quand un projet a réellement été créé : un projet
        // déjà là ne doit pas produire un second événement — un journal qui
        // rapporte du travail que ce run n'a pas fait est pire qu'un journal
        // épars.
        await deps.events.emit({
          prospectId,
          step: 'projet',
          outcome: 'reussi',
          detail: projectId,
        });
      }

      etape = 'build';
      let url = await deps.vercel.urlProduction(projectId);
      if (url === null) {
        // Vercel ne déploie pas le HEAD d'un dépôt qu'on vient de lier : il
        // attend le commit suivant, et `publish` a poussé le sien avant que
        // le projet existe. Le premier déploiement doit donc être amorcé.
        await deps.vercel.declencherDeploiement(projectId, repoFullName, 'main');
        url = await deps.attendreUrl(projectId);
        if (url === null) {
          // L'état intermédiaire réel : un build démarré sans URL n'est pas
          // un trou dans le journal, c'est un `build`/`demarre` sans
          // `reussi` correspondant. Le prochain run reprendra la ligne.
          await deps.events.emit({ prospectId, step: 'build', outcome: 'demarre' });
          report.pending += 1;
          process.stdout.write(`deploy : ${nom} en construction, à reprendre au prochain run\n`);
          continue;
        }
      }
      await deps.events.emit({ prospectId, step: 'build', outcome: 'reussi' });

      etape = 'en_ligne';
      await deps.enregistrerUrl(prospectId, url);
      await deps.events.emit({ prospectId, step: 'en_ligne', outcome: 'reussi', detail: url });
      report.deployed += 1;
      process.stdout.write(`deploy : ${url}\n`);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      // Journalisé AVEC le prospect concerné, comme l'exige le §12 du spec.
      console.error(`deploy : échec sur ${prospectId} (${repoFullName}) — ${detail}`);
      // C'est la raison d'être de la tâche : cette ligne partait autrefois
      // sur `stderr` seul, et la base n'en gardait rien.
      await deps.events.emit({ prospectId, step: etape, outcome: 'echoue', detail });
      report.failed += 1;
    }
  }

  return report;
}
