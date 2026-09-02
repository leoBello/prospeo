import { describe, expect, it } from 'vitest';
import type { DeploymentEventView, DeploymentSite } from './deployment.js';
import {
  dernierEvenementGlobal,
  dernierEvenementPipeline,
  etatDepuisEvenements,
  evenementAffiche,
  joursAvantPeremption,
} from './deployment.js';

/** Un événement minimal, patché au besoin. */
function evenement(patch: Partial<DeploymentEventView> & Pick<DeploymentEventView, 'step' | 'outcome'>): DeploymentEventView {
  return {
    detail: null,
    durationMs: null,
    occurredAt: '2026-09-01T00:00:00Z',
    ...patch,
  };
}

/** L'état de `prospect_site` par défaut : rien encore. */
function site(patch: Partial<DeploymentSite> = {}): DeploymentSite {
  return {
    deploymentUrl: null,
    publishedAt: null,
    unpublishedAt: null,
    ...patch,
  };
}

describe('etatDepuisEvenements', () => {
  it('rend "jamais" quand il n y a ni evenement ni URL', () => {
    expect(etatDepuisEvenements([], site())).toBe('jamais');
  });

  it('rend "en_ligne" pour un site sans aucun evenement mais deja publie', () => {
    // Le cas le plus courant au jour de la livraison : vingt-deux sites
    // publiés avant que cette table d'événements n'existe. Une ligne avec une
    // URL et sans historique n'est PAS un site jamais déployé.
    const s = site({ deploymentUrl: 'https://dos.vercel.app', publishedAt: '2026-08-01T10:00:00Z' });
    expect(etatDepuisEvenements([], s)).toBe('en_ligne');
  });

  it('rend "en_cours" quand le dernier evenement de l etape la plus avancee est "demarre"', () => {
    const events = [
      evenement({ step: 'redaction', outcome: 'reussi', occurredAt: '2026-09-01T10:00:00Z' }),
      evenement({ step: 'depot', outcome: 'reussi', occurredAt: '2026-09-01T10:05:00Z' }),
      evenement({ step: 'projet', outcome: 'reussi', occurredAt: '2026-09-01T10:06:00Z' }),
      evenement({ step: 'build', outcome: 'demarre', occurredAt: '2026-09-01T10:07:00Z' }),
    ];
    expect(etatDepuisEvenements(events, site())).toBe('en_cours');
  });

  it('rend "echec" quand le dernier evenement est "echoue", quel que soit le reste', () => {
    const events = [
      evenement({ step: 'depot', outcome: 'reussi', occurredAt: '2026-09-01T10:00:00Z' }),
      evenement({
        step: 'projet',
        outcome: 'echoue',
        occurredAt: '2026-09-01T10:01:00Z',
        detail: 'Vercel : quota de projets atteint',
      }),
    ];
    expect(etatDepuisEvenements(events, site())).toBe('echec');
  });

  it('rend "retire" des que unpublishedAt est renseignee', () => {
    const events = [evenement({ step: 'redaction', outcome: 'reussi' })];
    expect(etatDepuisEvenements(events, site({ unpublishedAt: '2026-09-01T00:00:00Z' }))).toBe(
      'retire',
    );
  });

  it('rend "retire" meme quand deployment_url reste renseignee — une ligne ne l efface pas au retrait', () => {
    // C'est l'erreur exacte que le lot précédent a déjà dû corriger : tester
    // l'URL seule afficherait "en ligne" pour un site retiré.
    const s = site({
      deploymentUrl: 'https://dos.vercel.app',
      publishedAt: '2026-08-01T10:00:00Z',
      unpublishedAt: '2026-08-20T10:00:00Z',
    });
    expect(etatDepuisEvenements([], s)).toBe('retire');
  });

  it('"retire" prime meme sur un evenement "demarre" plus recent — ex: un retrait en cours', () => {
    const events = [
      evenement({ step: 'retrait', outcome: 'demarre', occurredAt: '2026-08-20T10:00:00Z' }),
    ];
    const s = site({
      deploymentUrl: 'https://dos.vercel.app',
      publishedAt: '2026-08-01T10:00:00Z',
      unpublishedAt: '2026-08-20T10:00:01Z',
    });
    expect(etatDepuisEvenements(events, s)).toBe('retire');
  });

  it('un "build/demarre" qui se repete sur plusieurs runs sans "reussi" reste "en_cours", pas compte en paires', () => {
    // Fait rapporte par la tache qui a instrumente `deploy` : une build encore
    // en cours a la fin d'un run laisse la ligne au run suivant, qui peut
    // ecrire un second "demarre" sans qu'aucun "reussi" ne soit jamais venu
    // clore le premier.
    const events = [
      evenement({ step: 'build', outcome: 'demarre', occurredAt: '2026-09-01T10:00:00Z' }),
      evenement({ step: 'build', outcome: 'demarre', occurredAt: '2026-09-02T10:00:00Z' }),
    ];
    expect(etatDepuisEvenements(events, site())).toBe('en_cours');
  });

  it('un "build/reussi" sans "demarre" dans le meme run est accepte tel quel', () => {
    // Le travail peut s'etaler sur deux executions du CLI : le "demarre" est
    // ecrit au run precedent, disparu du lot d'evenements de celui-ci, et
    // seul "reussi" apparait ici.
    const events = [evenement({ step: 'build', outcome: 'reussi', occurredAt: '2026-09-02T10:00:00Z' })];
    // Sans URL encore enregistree, le pipeline est avance mais pas termine :
    // ce n'est ni un echec, ni "jamais" (des faits existent), ni "en ligne".
    expect(etatDepuisEvenements(events, site())).toBe('en_cours');
  });

  it('l etape "projet" absente (projet Vercel deja existant) n empeche pas de lire "build" plus loin', () => {
    const events = [
      evenement({ step: 'redaction', outcome: 'reussi', occurredAt: '2026-09-01T10:00:00Z' }),
      evenement({ step: 'depot', outcome: 'reussi', occurredAt: '2026-09-01T10:05:00Z' }),
      // Aucun evenement "projet" : aucun travail n'a ete fait, donc rien n'est ecrit.
      evenement({ step: 'build', outcome: 'echoue', occurredAt: '2026-09-01T10:10:00Z', detail: 'build KO' }),
    ];
    expect(etatDepuisEvenements(events, site())).toBe('echec');
  });

  it('un echec sur une etape EN AMONT, plus recent que le "en_ligne/reussi", rend bien "echec"', () => {
    // Le cas que la regle « etape la plus avancee » masquait entierement.
    // `decidePublish` rend 'update' des que l'empreinte du contenu bouge : un
    // `generate` rejoue renvoie donc `publish` sur un depot deja en ligne, et
    // un 403 GitHub y ecrit `depot/echoue` sur un prospect qui porte deja
    // `en_ligne/reussi`. La ligne restait verte et le filtre « En echec » ne
    // la trouvait pas.
    const events = [
      evenement({ step: 'redaction', outcome: 'reussi', occurredAt: '2026-09-01T09:00:00Z' }),
      evenement({ step: 'depot', outcome: 'reussi', occurredAt: '2026-09-01T09:01:00Z' }),
      evenement({ step: 'build', outcome: 'reussi', occurredAt: '2026-09-01T09:05:00Z' }),
      evenement({ step: 'en_ligne', outcome: 'reussi', occurredAt: '2026-09-01T09:06:00Z' }),
      // Le run suivant, deux jours plus tard : GitHub refuse l'ecriture.
      evenement({
        step: 'depot',
        outcome: 'echoue',
        occurredAt: '2026-09-03T09:00:00Z',
        detail: 'GitHub 403 : ecriture refusee',
      }),
    ];
    const s = site({ deploymentUrl: 'https://dos.vercel.app', publishedAt: '2026-09-01T09:06:00Z' });
    expect(etatDepuisEvenements(events, s)).toBe('echec');
  });

  it('un "demarre" en amont plus recent qu un "reussi" avance rend "en_cours", pas "en_ligne"', () => {
    const events = [
      evenement({ step: 'en_ligne', outcome: 'reussi', occurredAt: '2026-09-01T09:06:00Z' }),
      evenement({ step: 'build', outcome: 'demarre', occurredAt: '2026-09-03T09:00:00Z' }),
    ];
    const s = site({ deploymentUrl: 'https://dos.vercel.app', publishedAt: '2026-09-01T09:06:00Z' });
    expect(etatDepuisEvenements(events, s)).toBe('en_cours');
  });

  it('un evenement "echoue" ancien sur une etape depassee par une "reussi" plus recente n empeche pas "en_ligne"', () => {
    const events = [
      evenement({ step: 'build', outcome: 'echoue', occurredAt: '2026-09-01T09:00:00Z', detail: 'timeout' }),
      evenement({ step: 'build', outcome: 'reussi', occurredAt: '2026-09-01T09:05:00Z' }),
      evenement({ step: 'en_ligne', outcome: 'reussi', occurredAt: '2026-09-01T09:06:00Z' }),
    ];
    const s = site({ deploymentUrl: 'https://dos.vercel.app', publishedAt: '2026-09-01T09:06:00Z' });
    expect(etatDepuisEvenements(events, s)).toBe('en_ligne');
  });
});

describe('dernierEvenementPipeline', () => {
  it('rend null en l absence de tout evenement', () => {
    expect(dernierEvenementPipeline([])).toBeNull();
  });

  it('retient l etape la plus AVANCEE dans l ordre du pipeline, pas la plus recente par horodatage', () => {
    // Horodatages volontairement dans le desordre : la fonction ne doit pas
    // supposer un tableau trie.
    const events = [
      evenement({ step: 'build', outcome: 'reussi', occurredAt: '2026-09-01T09:00:00Z' }),
      evenement({ step: 'redaction', outcome: 'reussi', occurredAt: '2026-09-02T09:00:00Z' }),
    ];
    expect(dernierEvenementPipeline(events)?.step).toBe('build');
  });

  it('ignore les evenements perimes d une meme etape, seul le plus recent fait foi', () => {
    const events = [
      evenement({ step: 'build', outcome: 'demarre', occurredAt: '2026-09-01T09:00:00Z' }),
      evenement({ step: 'build', outcome: 'reussi', occurredAt: '2026-09-02T09:00:00Z' }),
    ];
    expect(dernierEvenementPipeline(events)?.outcome).toBe('reussi');
  });
});

describe('dernierEvenementGlobal', () => {
  it('rend null en l absence de tout evenement', () => {
    expect(dernierEvenementGlobal([])).toBeNull();
  });

  it('retient le plus RECENT par horodatage, sans egard pour l ordre du pipeline', () => {
    const events = [
      evenement({ step: 'en_ligne', outcome: 'reussi', occurredAt: '2026-09-01T09:00:00Z' }),
      evenement({ step: 'redaction', outcome: 'echoue', occurredAt: '2026-09-02T09:00:00Z' }),
    ];
    expect(dernierEvenementGlobal(events)?.step).toBe('redaction');
  });

  it('ecarte un horodatage illisible, meme rencontre en premier', () => {
    // Il ne se compare a rien : le retenir ferait dependre le resultat de
    // l'ordre du tableau.
    const events = [
      evenement({ step: 'build', outcome: 'echoue', occurredAt: 'pas-une-date' }),
      evenement({ step: 'depot', outcome: 'reussi', occurredAt: '2026-09-01T09:00:00Z' }),
    ];
    expect(dernierEvenementGlobal(events)?.step).toBe('depot');
  });
});

describe('evenementAffiche', () => {
  it('en echec, nomme l etape qui a ECHOUE et non la plus avancee', () => {
    // Sans cette regle, la ligne rouge afficherait « En ligne » et le detail
    // d'un SUCCES a cote du mot « En echec ».
    const events = [
      evenement({ step: 'en_ligne', outcome: 'reussi', occurredAt: '2026-09-01T09:06:00Z', detail: 'https://dos.vercel.app' }),
      evenement({
        step: 'depot',
        outcome: 'echoue',
        occurredAt: '2026-09-03T09:00:00Z',
        detail: 'GitHub 403 : ecriture refusee',
      }),
    ];
    const affiche = evenementAffiche(events, 'echec');
    expect(affiche?.step).toBe('depot');
    expect(affiche?.detail).toBe('GitHub 403 : ecriture refusee');
  });

  it('hors echec, garde l etape la plus avancee — sinon chaque ligne retomberait sur "redaction"', () => {
    // `publish` reecrit `redaction/reussi` a chaque passage : une regle « le
    // plus recent » ramenerait a « Redaction » un prospect dont le site est
    // en ligne.
    const events = [
      evenement({ step: 'en_ligne', outcome: 'reussi', occurredAt: '2026-09-01T09:06:00Z' }),
      evenement({ step: 'redaction', outcome: 'reussi', occurredAt: '2026-09-03T09:00:00Z' }),
    ];
    expect(evenementAffiche(events, 'en_ligne')?.step).toBe('en_ligne');
  });
});

describe('dernierEvenementPipeline — horodatage illisible', () => {
  it('n est jamais retenu, meme quand il est le premier vu pour son etape', () => {
    // La garde etait placee APRES le cas « premiere occurrence de cette
    // etape » : une date illisible s'installait alors sans condition, exactement
    // l'inverse de ce que son commentaire annoncait.
    const events = [
      evenement({ step: 'build', outcome: 'demarre', occurredAt: 'pas-une-date' }),
      evenement({ step: 'build', outcome: 'reussi', occurredAt: '2026-09-01T09:00:00Z' }),
    ];
    expect(dernierEvenementPipeline(events)?.outcome).toBe('reussi');
  });
});

describe('joursAvantPeremption', () => {
  // Horodatages en heure locale, sans suffixe "Z" — comme `today.test.ts` :
  // `joursCivils` compte en composantes de calendrier LOCALES, et un
  // suffixe UTC ferait dependre le resultat du fuseau de la machine qui
  // execute les tests.
  it('rend null quand le site n a jamais ete publie', () => {
    // Pas 90 par defaut : un site jamais publie n'a pas de date d'origine.
    expect(joursAvantPeremption(null, new Date('2026-09-01T00:00:00'))).toBeNull();
  });

  it('compte 90 jours civils depuis la publication', () => {
    expect(joursAvantPeremption('2026-06-04T10:00:00', new Date('2026-09-02T10:00:00'))).toBe(0);
  });

  it('compte en dates civiles, pas en tranches de 24h — publie hier tard, un jour ecoule des ce matin', () => {
    // Publie hier a 23h, "maintenant" est aujourd'hui a 1h du matin : deux
    // heures d'ecart en millisecondes, mais deja un jour civil ecoule.
    const publishedAt = '2026-09-01T23:30:00';
    const maintenant = new Date('2026-09-02T01:00:00');
    expect(joursAvantPeremption(publishedAt, maintenant)).toBe(89);
  });

  it('rend une valeur negative une fois le delai depasse', () => {
    expect(joursAvantPeremption('2026-01-01T00:00:00', new Date('2026-09-01T00:00:00'))).toBeLessThan(0);
  });
});
