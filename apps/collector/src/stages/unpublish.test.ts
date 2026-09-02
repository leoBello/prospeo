import { describe, expect, it } from 'vitest';
import type { DeploymentEvent } from './events.js';
import {
  decideUnpublish,
  PEREMPTION_JOURS,
  projetSupprimable,
  runUnpublish,
  unpublishExitCode,
  type SiteEnLigne,
  type UnpublishDeps,
  type UnpublishReport,
} from './unpublish.js';

const NOW = new Date('2026-12-01T12:00:00Z');

/** Un site publié il y a `jours`, sans réponse du prospect. */
const publieIlYA = (jours: number): SiteEnLigne => ({
  prospectId: 'p1',
  vercelProjectId: 'prj_1',
  repoFullName: 'prospeo/dos-51000900400035',
  pipelineStatus: 'a_contacter',
  publishedAt: new Date(NOW.getTime() - jours * 24 * 3600 * 1000),
  unpublishedAt: null,
});

describe('decideUnpublish', () => {
  it('dépublie sans délai un prospect qui a dit non', () => {
    // D5, et la doctrine du socle avant lui : le statut « ne pas contacter »
    // est « respecté immédiatement et définitivement ». Un site portant le nom
    // d'une entreprise qui vient de refuser ne doit pas survivre une heure de
    // plus, quelle que soit sa date de publication.
    const hier = { ...publieIlYA(1), pipelineStatus: 'ne_pas_contacter' as const };
    expect(decideUnpublish(hier, NOW)).toBe('refus');
    expect(decideUnpublish({ ...hier, pipelineStatus: 'perdu' }, NOW)).toBe('refus');
  });

  it('laisse en ligne un site encore jeune et sans réponse', () => {
    expect(decideUnpublish(publieIlYA(PEREMPTION_JOURS - 1), NOW)).toBe('garder');
  });

  it('périme un site resté sans réponse au-delà du délai', () => {
    // « Un site portant le nom d'un tiers, publié sans son accord, ne doit pas
    // vivre indéfiniment sans surveillance » (D5). La péremption est la seule
    // chose qui garantisse qu'un oubli finit par se refermer tout seul.
    expect(decideUnpublish(publieIlYA(PEREMPTION_JOURS), NOW)).toBe('peremption');
    expect(decideUnpublish(publieIlYA(PEREMPTION_JOURS + 30), NOW)).toBe('peremption');
  });

  it('ne périme pas un prospect avec qui l’échange est vivant', () => {
    // Un prospect intéressé ou gagné a vu son site et en discute : le périmer
    // au 90e jour couperait la vente en cours. Le délai vise le SILENCE, pas
    // l'ancienneté.
    for (const statut of ['interesse', 'gagne'] as const) {
      expect(decideUnpublish({ ...publieIlYA(200), pipelineStatus: statut }, NOW)).toBe('garder');
    }
  });

  it('ne fait rien sur un site déjà dépublié', () => {
    // Idempotence : rejouer l'étage ne doit pas retenter une suppression déjà
    // faite, ni recompter un site dans les statistiques du run.
    const deja = { ...publieIlYA(200), unpublishedAt: new Date('2026-11-01') };
    expect(decideUnpublish(deja, NOW)).toBe('garder');
  });

  it('ne fait rien quand la date de publication est inconnue', () => {
    // Sans date, le délai n'a pas de point de départ. Supprimer « dans le
    // doute » détruirait un site peut-être publié la veille ; garder laisse
    // une ligne visible qu'un humain tranchera. La suppression est
    // irréversible, pas l'attente.
    expect(decideUnpublish({ ...publieIlYA(200), publishedAt: null }, NOW)).toBe('garder');
  });
});

describe('projetSupprimable', () => {
  const connus = new Set(['prj_1', 'prj_2']);

  it('autorise la suppression d’un projet que la base connaît', () => {
    expect(projetSupprimable('prj_1', connus)).toBe(true);
  });

  it('REFUSE de supprimer un projet que la base ne connaît pas', () => {
    // Le garde-fou qui compte, et il ne protège pas d'un jeton qui fuit : il
    // protège d'un défaut dans NOTRE code.
    //
    // L'équipe Vercel employée n'est pas dédiée — elle porte vingt projets
    // antérieurs, dont des sites clients réels (`chateau-rosan`,
    // `saisoneo-landing`, un portfolio). D4 voulait un compte séparé ; le
    // compte est partagé, et c'est un fait qu'on ne peut pas changer par du
    // code. Ce qu'on peut faire, c'est rendre INATTEIGNABLE tout projet que le
    // collector n'a pas lui-même créé et enregistré dans `prospect_site`.
    //
    // Même doctrine que `isDeletionWaveSuspect` dans `reconcile.ts` : sur la
    // seule opération irréversible du projet, on refuse le doute plutôt que de
    // l'arbitrer.
    expect(projetSupprimable('prj_portfolio', connus)).toBe(false);
    expect(projetSupprimable('chateau-rosan', connus)).toBe(false);
  });

  it('refuse un identifiant vide', () => {
    // Un identifiant vide passé à l'API Vercel viserait une route inattendue.
    expect(projetSupprimable('', connus)).toBe(false);
    expect(projetSupprimable('   ', connus)).toBe(false);
  });
});

/**
 * Dépendances de test : journalise, ne sort jamais sur le réseau.
 *
 * `horloge` sert de chronomètre à `duration_ms` : par défaut elle est figée
 * sur `NOW` (durée mesurée nulle, ce qui est le cas des tests qui n'observent
 * pas la durée) ; un test qui veut prouver la MESURE la fait avancer.
 */
function fausseDeps(sites: SiteEnLigne[], enregistres?: string[], horloge: () => Date = () => NOW) {
  const journal: string[] = [];
  const events: DeploymentEvent[] = [];
  const deps: UnpublishDeps = {
    events: {
      async emit(e) {
        events.push(e);
      },
    },
    async lireSitesEnLigne() {
      return sites;
    },
    async lireProjetsEnregistres() {
      // Par défaut, la base connaît les projets des sites lus — le cas
      // nominal. Un test passe une liste différente pour éprouver l'écart.
      return new Set(
        enregistres ??
          sites.map((s) => s.vercelProjectId).filter((id): id is string => id !== null),
      );
    },
    async supprimerProjet(id) {
      journal.push(`supprimer:${id}`);
    },
    async marquerDepublie(prospectId) {
      journal.push(`marquer:${prospectId}`);
    },
    maintenant: horloge,
  };
  return { deps, journal, events };
}

describe('runUnpublish', () => {
  it('montre sans agir en mode simulation', async () => {
    // Le plan l'exige : « comme `reconcile` pour les suppressions, cette tâche
    // détruit : elle mérite un mode qui montre avant d'agir ».
    const site = { ...publieIlYA(1), pipelineStatus: 'ne_pas_contacter' as const };
    const { deps, journal } = fausseDeps([site]);
    const r = await runUnpublish(deps, { dryRun: true });

    expect(r.decided.refus).toBe(1);
    expect(r.unpublished).toBe(0);
    expect(journal).toEqual([]);
  });

  it('supprime le projet puis marque la ligne', async () => {
    const site = { ...publieIlYA(1), pipelineStatus: 'ne_pas_contacter' as const };
    const { deps, journal } = fausseDeps([site]);
    const r = await runUnpublish(deps, { dryRun: false });

    expect(r.unpublished).toBe(1);
    // L'ordre compte : marquer avant de supprimer laisserait, si la
    // suppression échoue, une ligne qui prétend que le site est hors ligne
    // alors qu'il est toujours servi au nom d'une entreprise qui a refusé.
    expect(journal).toEqual(['supprimer:prj_1', 'marquer:p1']);
  });

  it('marque la ligne même sans projet Vercel à supprimer', async () => {
    // Un prospect publié sur GitHub mais dont le déploiement n'a jamais abouti
    // n'a pas de projet à supprimer — sa ligne doit tout de même sortir de la
    // file, sans quoi chaque run la reprendrait indéfiniment.
    const site = {
      ...publieIlYA(1),
      pipelineStatus: 'ne_pas_contacter' as const,
      vercelProjectId: null,
    };
    const { deps, journal } = fausseDeps([site]);
    const r = await runUnpublish(deps, { dryRun: false });

    expect(r.unpublished).toBe(1);
    expect(journal).toEqual(['marquer:p1']);
  });

  it('REFUSE de supprimer un projet que la base n’enregistre pas', async () => {
    // Le cas que le garde-fou existe pour attraper : la ligne `prospect_site`
    // porte un identifiant de projet que la table n'enregistre pas — écriture
    // partielle, modification manuelle, ou identifiant venu d'ailleurs.
    //
    // Sans ce contrôle, `unpublish` supprimerait sur l'équipe Vercel PARTAGÉE
    // un projet qui pourrait être `chateau-rosan` ou `saisoneo-landing`.
    const site = { ...publieIlYA(200), vercelProjectId: 'prj_inconnu' };
    const { deps, journal } = fausseDeps([site], ['prj_1', 'prj_2']);
    const r = await runUnpublish(deps, { dryRun: false });

    expect(r.refusedGuard).toBe(1);
    expect(r.unpublished).toBe(0);
    expect(journal).toEqual([]);
    // Et le run échoue : l'incohérence doit se voir.
    expect(unpublishExitCode(r)).toBe(1);
  });

  it('poursuit le lot quand une suppression échoue', async () => {
    const a = { ...publieIlYA(200), prospectId: 'pa', vercelProjectId: 'prj_a' };
    const b = { ...publieIlYA(200), prospectId: 'pb', vercelProjectId: 'prj_b' };
    const { deps, journal } = fausseDeps([a, b]);
    deps.supprimerProjet = async (id) => {
      if (id === 'prj_a') throw new Error('Vercel : 500');
      journal.push(`supprimer:${id}`);
    };

    const r = await runUnpublish(deps, { dryRun: false });
    expect(r.failed).toBe(1);
    expect(r.unpublished).toBe(1);
    // La ligne en échec n'est PAS marquée : le site est toujours en ligne, et
    // la base doit continuer de le dire.
    expect(journal).not.toContain('marquer:pa');
    expect(journal).toContain('marquer:pb');
  });
});

describe('runUnpublish — le journal de l etape « retrait »', () => {
  it('emet retrait/reussi avec le motif, distinct entre refus et peremption', async () => {
    // `retrait` figurait dans l'enumeration de la base, dans l'ordre du
    // pipeline et dans les deux catalogues de traduction, et RIEN ne
    // l'emettait : `publish` et `deploy` avaient ete instrumentes, pas
    // `unpublish`.
    const refus = { ...publieIlYA(1), prospectId: 'pr', pipelineStatus: 'ne_pas_contacter' as const, vercelProjectId: 'prj_r' };
    const perime = { ...publieIlYA(200), prospectId: 'pp', vercelProjectId: 'prj_p' };
    const { deps, events } = fausseDeps([refus, perime]);

    await runUnpublish(deps, { dryRun: false });

    expect(events.map((e) => [e.prospectId, e.step, e.outcome])).toEqual([
      ['pr', 'retrait', 'reussi'],
      ['pp', 'retrait', 'reussi'],
    ]);
    // Le motif est la SEULE chose qui distingue les deux, des mois plus tard.
    expect(events[0]!.detail).toBe('refus du prospect (ne_pas_contacter ou perdu)');
    expect(events[1]!.detail).toBe('péremption à 90 jours sans réponse');
  });

  it('n emet RIEN en simulation — un retrait qui n a pas eu lieu ne se journalise pas', async () => {
    const site = { ...publieIlYA(1), pipelineStatus: 'ne_pas_contacter' as const };
    const { deps, events } = fausseDeps([site]);
    await runUnpublish(deps, { dryRun: true });
    expect(events).toEqual([]);
  });

  it('n emet rien pour un site qu on garde — aucun travail, aucun fait', async () => {
    const { deps, events } = fausseDeps([publieIlYA(1)]);
    const r = await runUnpublish(deps, { dryRun: false });
    expect(r.decided.garder).toBe(1);
    expect(events).toEqual([]);
  });

  it('emet retrait/echoue quand le garde-fou bloque — le site est toujours en ligne', async () => {
    const site = { ...publieIlYA(200), vercelProjectId: 'prj_inconnu' };
    const { deps, events } = fausseDeps([site], ['prj_1', 'prj_2']);
    await runUnpublish(deps, { dryRun: false });

    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe('echoue');
    expect(events[0]!.step).toBe('retrait');
    expect(events[0]!.detail).toContain('garde-fou');
    expect(events[0]!.detail).toContain('prj_inconnu');
  });

  it('emet retrait/echoue avec la cause quand la suppression Vercel echoue', async () => {
    const site = { ...publieIlYA(200), vercelProjectId: 'prj_a' };
    const { deps, events } = fausseDeps([site]);
    deps.supprimerProjet = async () => {
      throw new Error('Vercel : 500');
    };
    await runUnpublish(deps, { dryRun: false });

    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe('echoue');
    expect(events[0]!.detail).toBe('Vercel : 500');
  });

  it('MESURE la duree du retrait au lieu de la laisser nulle', async () => {
    // Horloge qui avance de 400 ms a chaque lecture : la duree emise est
    // l'ecart entre la lecture d'entree et celle de l'emission, donc 400.
    let t = NOW.getTime();
    const horloge = () => {
      const instant = new Date(t);
      t += 400;
      return instant;
    };
    const site = { ...publieIlYA(1), pipelineStatus: 'ne_pas_contacter' as const, vercelProjectId: null };
    const { deps, events } = fausseDeps([site], undefined, horloge);
    await runUnpublish(deps, { dryRun: false });

    expect(events).toHaveLength(1);
    expect(events[0]!.durationMs).toBe(400);
  });
});

describe('unpublishExitCode', () => {
  const vide: UnpublishReport = {
    decided: { garder: 0, refus: 0, peremption: 0 },
    unpublished: 0,
    failed: 0,
    refusedGuard: 0,
  };

  it('sort en zéro quand il n’y avait rien à faire', () => {
    expect(unpublishExitCode({ ...vide, decided: { garder: 22, refus: 0, peremption: 0 } })).toBe(0);
  });

  it('sort en échec sur une suppression ratée', () => {
    // Un site qui devait disparaître et qui est toujours en ligne au nom d'un
    // tiers ayant refusé n'est pas un run réussi.
    expect(unpublishExitCode({ ...vide, failed: 1 })).toBe(1);
  });

  it('sort en échec quand le garde-fou a bloqué une suppression', () => {
    // Le garde-fou qui se déclenche signale une incohérence entre la base et
    // Vercel — pas une situation normale. Elle doit se voir.
    expect(unpublishExitCode({ ...vide, refusedGuard: 1 })).toBe(1);
  });
});
