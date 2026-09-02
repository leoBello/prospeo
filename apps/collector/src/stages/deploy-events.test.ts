import { describe, expect, it } from 'vitest';
import type { VercelClient } from '../sources/vercel.js';
import { NULL_SINK, type DeploymentEvent, type EventSink } from './events.js';
import {
  deployExitCode,
  runDeploy,
  type DeployDeps,
  type DeployReport,
  type DeploySite,
} from './deploy.js';

/**
 * Puits d'événements factice : collecte dans un tableau plutôt que d'écrire
 * en base, pour qu'on asserte sur les événements réellement émis — pas sur
 * une chaîne affichée.
 */
function fauxEvents() {
  const events: DeploymentEvent[] = [];
  const sink: EventSink = {
    async emit(e) {
      events.push(e);
    },
  };
  return { sink, events };
}

/**
 * Dépendances de test : un client Vercel qui ne sort jamais sur le réseau,
 * et des « écritures » qui atterrissent dans un journal plutôt qu'en base.
 * `attendreUrl` remplace la boucle d'attente réelle (`setTimeout` x 40 dans
 * `cli.ts`) — l'injecter est ce qui rend `runDeploy` testable sans horloge.
 */
function fausseDeps(options: {
  events?: EventSink;
  attendreUrl?: (projectId: string) => Promise<string | null>;
  vercel?: Partial<VercelClient>;
} = {}) {
  const journal: string[] = [];
  const projetsEnregistres: Record<string, string> = {};
  const urlsEnregistrees: Record<string, string> = {};

  const vercel: VercelClient = {
    async creerProjet(nom, repoFullName) {
      journal.push(`creerProjet:${nom}:${repoFullName}`);
      return { id: `proj-${nom}`, name: nom };
    },
    async declencherDeploiement(projectId, repoFullName, ref) {
      journal.push(`declencher:${projectId}:${repoFullName}:${ref}`);
      return 'dpl-1';
    },
    async urlProduction(nomOuId) {
      journal.push(`urlProduction:${nomOuId}`);
      return null;
    },
    async supprimerProjet() {
      // Hors périmètre de `deploy` : jamais appelé ici.
    },
    ...options.vercel,
  };

  const deps: DeployDeps = {
    vercel,
    events: options.events ?? NULL_SINK,
    async enregistrerProjet(prospectId, vercelProjectId) {
      journal.push(`enregistrerProjet:${prospectId}:${vercelProjectId}`);
      projetsEnregistres[prospectId] = vercelProjectId;
    },
    async enregistrerUrl(prospectId, url) {
      journal.push(`enregistrerUrl:${prospectId}:${url}`);
      urlsEnregistrees[prospectId] = url;
    },
    attendreUrl: options.attendreUrl ?? (async () => null),
  };

  return { deps, journal, projetsEnregistres, urlsEnregistrees, vercel };
}

const SITE: DeploySite = {
  prospectId: 'p1',
  repoFullName: 'org/dos-services-51000900400035',
  vercelProjectId: null,
};

describe('runDeploy', () => {
  it('émet projet, build, en_ligne, tous réussis, dans cet ordre — déploiement complet', async () => {
    // Le chemin décrit par la tâche : créer le projet, amorcer le premier
    // déploiement, attendre l'URL, l'enregistrer. Les trois étapes doivent se
    // lire dans le journal, dans l'ordre où le code les franchit.
    const { sink, events } = fauxEvents();
    const { deps, journal } = fausseDeps({
      events: sink,
      attendreUrl: async () => 'https://dos-services.vercel.app',
    });

    const report = await runDeploy([SITE], deps);

    expect(report).toEqual<DeployReport>({ deployed: 1, pending: 0, failed: 0 });
    expect(events.map((e) => `${e.step}:${e.outcome}`)).toEqual([
      'projet:reussi',
      'build:reussi',
      'en_ligne:reussi',
    ]);
    // Et le travail a bien eu lieu, pas seulement le journal.
    expect(journal).toEqual([
      'creerProjet:dos-services-51000900400035:org/dos-services-51000900400035',
      'enregistrerProjet:p1:proj-dos-services-51000900400035',
      'urlProduction:proj-dos-services-51000900400035',
      'declencher:proj-dos-services-51000900400035:org/dos-services-51000900400035:main',
      'enregistrerUrl:p1:https://dos-services.vercel.app',
    ]);
  });

  it('n’émet pas de projet quand le projet Vercel existe déjà', async () => {
    // Le plan est explicite : « un journal qui rapporte du travail que
    // personne n'a fait est pire qu'un journal épars ». Un projet déjà
    // enregistré ne doit pas produire un second événement `projet`.
    const { sink, events } = fauxEvents();
    const { deps, journal } = fausseDeps({
      events: sink,
      vercel: { urlProduction: async () => 'https://deja-la.vercel.app' },
    });

    const report = await runDeploy(
      [{ prospectId: 'p1', repoFullName: 'org/depot', vercelProjectId: 'proj-existant' }],
      deps,
    );

    expect(report.deployed).toBe(1);
    expect(events.some((e) => e.step === 'projet')).toBe(false);
    expect(journal.some((j) => j.startsWith('creerProjet'))).toBe(false);
    expect(journal.some((j) => j.startsWith('enregistrerProjet'))).toBe(false);
  });

  it('émet build/demarre et n’émet pas en_ligne quand l’URL n’est pas encore prête', async () => {
    // L'état intermédiaire réel du plan : un build démarré sans URL n'est pas
    // un trou, c'est un `build`/`demarre` sans `reussi` correspondant. La
    // ligne reste reprise au prochain run — `en_ligne` ne doit donc jamais
    // apparaître ici.
    const { sink, events } = fauxEvents();
    const { deps } = fausseDeps({ events: sink, attendreUrl: async () => null });

    const report = await runDeploy(
      [{ prospectId: 'p1', repoFullName: 'org/depot', vercelProjectId: 'proj-1' }],
      deps,
    );

    expect(report).toEqual<DeployReport>({ deployed: 0, pending: 1, failed: 0 });
    expect(events).toContainEqual(
      expect.objectContaining({ prospectId: 'p1', step: 'build', outcome: 'demarre' }),
    );
    expect(events.some((e) => e.step === 'en_ligne')).toBe(false);
  });

  it('émet echoue avec le message de la panne, et poursuit sur le prospect suivant', async () => {
    // C'est la raison d'être de la tâche : la cause partait sur `stderr` et la
    // base n'en gardait rien. Un échec sur un prospect ne doit de surcroît
    // pas empêcher le traitement — ni le journal — des suivants.
    const { sink, events } = fauxEvents();
    const { deps } = fausseDeps({
      events: sink,
      attendreUrl: async () => 'https://ok.vercel.app',
    });
    deps.vercel.declencherDeploiement = async (projectId) => {
      if (projectId === 'proj-1') throw new Error('Vercel déclenchement : 500 — timeout amont');
      return 'dpl-ok';
    };

    const report = await runDeploy(
      [
        { prospectId: 'p1', repoFullName: 'org/depot1', vercelProjectId: 'proj-1' },
        { prospectId: 'p2', repoFullName: 'org/depot2', vercelProjectId: 'proj-2' },
      ],
      deps,
    );

    expect(report.failed).toBe(1);
    expect(report.deployed).toBe(1);
    const echec = events.find((e) => e.prospectId === 'p1' && e.outcome === 'echoue');
    // Non vide ET porteur du message d'origine — pas un simple « échec ».
    expect(echec?.detail).toContain('Vercel déclenchement : 500 — timeout amont');
    // p2 n'a pas été empêché d'aboutir par la panne sur p1.
    expect(events).toContainEqual(
      expect.objectContaining({ prospectId: 'p2', step: 'en_ligne', outcome: 'reussi' }),
    );
  });

  it('rend un rapport vide sur un lot vide', async () => {
    const { deps } = fausseDeps();
    expect(await runDeploy([], deps)).toEqual<DeployReport>({ deployed: 0, pending: 0, failed: 0 });
  });
});

describe('deployExitCode', () => {
  const vide: DeployReport = { deployed: 0, pending: 0, failed: 0 };

  it('sort en succès sans échec, même avec des builds en attente', () => {
    // « Un build en cours n'est pas un échec : c'est un run à rejouer » —
    // cli.ts, case 'deploy'. `pending` ne doit donc jamais faire échouer le
    // code de sortie.
    expect(deployExitCode({ ...vide, deployed: 5, pending: 3 })).toBe(0);
  });

  it('sort en échec dès qu’un prospect a échoué', () => {
    expect(deployExitCode({ ...vide, deployed: 5, failed: 1 })).toBe(1);
  });
});
