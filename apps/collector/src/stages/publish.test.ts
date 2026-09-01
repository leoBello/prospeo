import { describe, expect, it } from 'vitest';
import type { SiteFacts } from '@prospeo/core';
import {
  decidePublish,
  empreinteContenu,
  nomDepot,
  publishExitCode,
  type EtatSite,
  type PublishReport,
} from './publish.js';

const FAITS: SiteFacts = {
  nomAffiche: 'Dos-Services',
  metier: { slug: 'plombier', label: 'Plombier' },
  adresse: { rue: '37 Rue Jacques Cartier', codePostal: '44300', ville: 'Nantes' },
  telephone: { e164: '+33602002360', affichage: '06 02 00 23 60' },
  anneeCreation: 2009,
  noteGoogle: 4.6,
  lienMaps: null,
  raisonSociale: 'SOULEYMANE DOSSO (DOS SERVICES)',
  siret: '51000900400035',
};

describe('nomDepot', () => {
  it('compose un nom lisible suivi du SIRET', () => {
    expect(nomDepot(FAITS)).toBe('dos-services-51000900400035');
  });

  it('est déterministe : deux appels donnent le même nom', () => {
    // C'est la condition de l'idempotence exigée par la tâche 3. Un nom qui
    // dépendrait de l'horloge, d'un compteur ou d'un aléa ferait créer un
    // SECOND dépôt à chaque rejeu, dans une organisation qui porte le nom
    // d'entreprises réelles.
    expect(nomDepot(FAITS)).toBe(nomDepot(FAITS));
  });

  it('porte le SIRET plutôt qu’une empreinte, pour rester traçable', () => {
    // Le SIRET est la clé unique de `prospect` : il garantit l'absence de
    // collision sans qu'on ait à l'espérer, là où un hachage court ne fait que
    // la rendre improbable. Il se lit de surcroît dans les deux sens — d'un
    // dépôt on retrouve le prospect sans requête.
    //
    // Deux entreprises homonymes existent réellement dans la base nantaise ;
    // sans discriminant, la seconde publication écraserait le site de la
    // première.
    expect(nomDepot(FAITS)).toContain(FAITS.siret);
    const homonyme = { ...FAITS, siret: '52405116600014' };
    expect(nomDepot(homonyme)).not.toBe(nomDepot(FAITS));
  });

  it('retire les accents et la ponctuation que GitHub refuse', () => {
    // GitHub n'accepte que [A-Za-z0-9._-] dans un nom de dépôt. Une apostrophe
    // ou un accent y produit un 422 au moment de la création, c'est-à-dire
    // après que le run a commencé à travailler.
    const nom = nomDepot({
      ...FAITS,
      nomAffiche: "L'Atelier d’Antoine & Fils (Rénovation)",
    });
    expect(nom).toMatch(/^[a-z0-9][a-z0-9-]*-\d{14}$/);
    // La valeur exacte, et non un simple `toMatch` : sans elle, une
    // décomposition Unicode laissée à moitié faite — « rénovation » devenant
    // « re-novation » parce que l'accent combinant n'a pas été retiré mais
    // remplacé par un tiret — passerait le test précédent sans encombre. Le
    // nom resterait valide pour GitHub, et illisible pour nous.
    expect(nom).toBe('l-atelier-d-antoine-fils-renovation-51000900400035');
  });

  it('tronque un nom trop long sans casser le SIRET', () => {
    // GitHub plafonne à 100 caractères. Le SIRET doit survivre à la
    // troncature : c'est lui qui porte l'unicité, le libellé n'est que du
    // confort de lecture.
    const nom = nomDepot({
      ...FAITS,
      nomAffiche: 'NANTES CHAUFFE-EAU PLOMBERIE ALADIN DEPANN HOTEL BERNARD FRANCK ET SES FILS REUNIS',
    });
    expect(nom.length).toBeLessThanOrEqual(100);
    expect(nom.endsWith(FAITS.siret)).toBe(true);
  });

  it('tient debout quand le nom ne laisse aucune lettre', () => {
    // Cas limite réel : une enseigne réduite à des chiffres ou à des symboles.
    // Un nom de dépôt commençant par un tiret est refusé par GitHub.
    const nom = nomDepot({ ...FAITS, nomAffiche: '@@@ ---' });
    expect(nom).toMatch(/^[a-z0-9]/);
    expect(nom).toContain(FAITS.siret);
  });
});

describe('empreinteContenu', () => {
  const contenu = { a: 1, b: { c: 2, d: [3, 4] } };

  it('ne bouge pas quand seul l’ordre des clés change', () => {
    // L'empreinte gouverne le « rejouer ne réécrit pas ». Si elle dépendait de
    // l'ordre de sérialisation — qui n'est garanti par rien à travers un
    // aller-retour JSON — chaque run pousserait un commit identique dans les
    // 22 dépôts, et l'historique deviendrait illisible.
    expect(empreinteContenu({ b: { d: [3, 4], c: 2 }, a: 1 })).toBe(empreinteContenu(contenu));
  });

  it('bouge dès qu’une valeur change', () => {
    expect(empreinteContenu({ ...contenu, a: 2 })).not.toBe(empreinteContenu(contenu));
  });

  it('distingue un tableau réordonné', () => {
    // L'ordre des prestations est le seul degré de liberté du modèle, et il
    // est visible à l'écran : le réordonner EST un changement de contenu.
    expect(empreinteContenu({ ...contenu, b: { c: 2, d: [4, 3] } })).not.toBe(
      empreinteContenu(contenu),
    );
  });
});

describe('decidePublish', () => {
  const EMPREINTE = 'abc123';

  it('crée quand rien n’existe', () => {
    expect(decidePublish(null, EMPREINTE)).toBe('create');
  });

  it('ne fait rien quand le contenu est déjà celui du dépôt', () => {
    // L'idempotence exigée par la tâche 3. Un rejeu sur les 22 prospects ne
    // doit ni recréer un dépôt, ni pousser un commit vide, ni redéclencher
    // 22 déploiements Vercel.
    const etat: EtatSite = { repoFullName: 'org/dos-services-51000900400035', empreinte: EMPREINTE };
    expect(decidePublish(etat, EMPREINTE)).toBe('skip');
  });

  it('met à jour quand le contenu a changé', () => {
    const etat: EtatSite = { repoFullName: 'org/dos-services-51000900400035', empreinte: 'ancien' };
    expect(decidePublish(etat, EMPREINTE)).toBe('update');
  });

  it('met à jour quand la base ignore l’empreinte du dépôt', () => {
    // Une ligne écrite avant l'introduction de l'empreinte, ou une écriture
    // interrompue entre la création du dépôt et l'enregistrement. Réécrire
    // coûte un commit ; s'abstenir laisserait en ligne un site dont personne
    // ne sait ce qu'il contient.
    const etat: EtatSite = { repoFullName: 'org/x-51000900400035', empreinte: null };
    expect(decidePublish(etat, EMPREINTE)).toBe('update');
  });
});

describe('publishExitCode', () => {
  const vide: PublishReport = { created: 0, updated: 0, skipped: 0, failed: 0, refused: 0 };

  it('sort en zéro quand tout a abouti', () => {
    expect(publishExitCode({ ...vide, created: 3 })).toBe(0);
    expect(publishExitCode({ ...vide, skipped: 22 })).toBe(0);
  });

  it('sort en échec dès qu’un prospect a échoué', () => {
    // Comme `enrich` et `reconcile` : un run partiellement réussi n'est pas un
    // succès. Sur 22 prospects, un échec avalé se remarque des jours plus
    // tard, quand l'email cite une URL qui n'existe pas.
    expect(publishExitCode({ ...vide, created: 21, failed: 1 })).toBe(1);
  });

  it('sort en échec quand un prospect a été refusé', () => {
    // `refused` compte le travail délibérément laissé en plan — éditeur non
    // renseigné, faits incomplets, prose incohérente. Ce n'est pas une panne,
    // mais ce n'est pas non plus un run réussi : quelque chose attend une
    // décision humaine.
    expect(publishExitCode({ ...vide, created: 2, refused: 1 })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

import { runPublish, type PublishDeps, type PublishInput } from './publish.js';
import type { ContenuPublie } from '@prospeo/core';

const CONTENU: ContenuPublie = {
  version: { schema: 'v1', promptVersion: 'v1', model: 'claude-opus-4-8' },
  editeur: { nom: 'Léo Bello', contact: 'leobello.wd@gmail.com' },
  faits: FAITS,
  redaction: {
    accroche: 'Votre plombier à Nantes',
    presentation: 'Une présentation suffisamment longue pour être crédible.',
    prestations: [{ code: 'depannage', label: 'Dépannage', description: 'Fuite.' }],
  },
};

const UN: PublishInput = { prospectId: 'p1', contenu: CONTENU };

/** Dépendances de test : enregistre les appels, ne sort jamais sur le réseau. */
function fausseDeps(etats: Record<string, EtatSite> = {}) {
  const journal: string[] = [];
  const ecrits: Record<string, Record<string, unknown>> = {};
  const deps: PublishDeps = {
    github: {
      async creerDepuisModele(templateRepo, nom) {
        journal.push(`creer:${templateRepo}:${nom}`);
        return { fullName: `org/${nom}`, htmlUrl: `https://github.com/org/${nom}` };
      },
      async shaContenu(depot) {
        journal.push(`sha:${depot}`);
        return 'sha-existant';
      },
      async attendreContenuModele(depot) {
        journal.push(`attendre:${depot}`);
        return 'sha-du-modele';
      },
      async ecrireContenu(depot, _contenu, sha) {
        journal.push(`ecrire:${depot}:${sha ?? 'sans-sha'}`);
      },
    },
    async lireEtat(id) {
      return etats[id] ?? null;
    },
    async enregistrer(id, etat) {
      journal.push(`enregistrer:${id}`);
      ecrits[id] = etat as unknown as Record<string, unknown>;
    },
    maintenant: () => new Date('2026-09-01T12:00:00Z'),
  };
  return { deps, journal, ecrits };
}

describe('runPublish', () => {
  it('REFUSE de publier une rédaction rejetée à la relecture', async () => {
    // Le couplage qui donne son sens au bouton « rejeter » du dashboard. Sans
    // lui, refuser une rédaction puis lancer `publish` la pousserait quand
    // même : le clic n'aurait servi à rien, et il aurait de surcroît laissé
    // croire le contraire.
    //
    // Le refus est ANTÉRIEUR au moindre appel réseau — même place et même
    // raison que le contrôle de l'éditeur : un dépôt créé ne se « dé-crée »
    // pas, et c'est la publication qui expose une page au monde.
    const { deps, journal } = fausseDeps();
    const report = await runPublish(
      [{ ...UN, rejeteeLe: new Date('2026-09-02T09:00:00Z') }],
      deps,
    );

    expect(report.refused).toBe(1);
    expect(report.created).toBe(0);
    expect(journal).toEqual([]);
    // Et le run échoue : un lot dont une part attend une décision humaine
    // n'est pas un lot réussi.
    expect(publishExitCode(report)).toBe(1);
  });

  it('publie normalement une rédaction jamais rejetée', async () => {
    // Le champ est optionnel : les appelants qui l'ignorent — et tout ce qui
    // existait avant lui — ne doivent pas voir leur comportement changer.
    const { deps } = fausseDeps();
    expect((await runPublish([{ ...UN, rejeteeLe: null }], deps)).created).toBe(1);
  });

  it('part du dépôt modèle du métier, et non d’un réglage du run', async () => {
    // Décision de l'utilisateur : un modèle par métier, declare dans
    // `trades.ts`, et a terme pilotable depuis une interface de gestion via le
    // repli `templateRepoDefaut`. Un lot peut donc meler les metiers sans
    // qu'on ait a le scinder.
    const { deps, journal } = fausseDeps();
    await runPublish([UN], deps);
    expect(journal[0]).toBe('creer:plombier:dos-services-51000900400035');
  });

  it('crée puis écrit, à la première publication', async () => {
    const { deps, journal } = fausseDeps();
    const report = await runPublish([UN], deps);

    expect(report).toEqual({ created: 1, updated: 0, skipped: 0, failed: 0, refused: 0 });
    // L'attente du modèle est INTERCALÉE entre la création et l'écriture, et
    // l'écriture porte le `sha` du fichier venu du modèle : elle l'écrase au
    // lieu de le précéder.
    expect(journal).toEqual([
      'creer:plombier:dos-services-51000900400035',
      'attendre:dos-services-51000900400035',
      'ecrire:dos-services-51000900400035:sha-du-modele',
      'enregistrer:p1',
    ]);
  });

  it('ne touche pas au réseau quand le contenu n’a pas bougé', async () => {
    // L'idempotence de la tâche 3, mesurée sur les appels réellement émis :
    // un rejeu sur les 22 prospects ne doit pousser aucun commit, donc ne
    // redéclencher aucun déploiement, donc ne rien coûter.
    const empreinte = empreinteContenu(CONTENU);
    const { deps, journal } = fausseDeps({
      p1: { repoFullName: 'org/dos-services-51000900400035', empreinte },
    });
    const report = await runPublish([UN], deps);

    expect(report.skipped).toBe(1);
    expect(journal).toEqual([]);
  });

  it('relit le sha avant de réécrire un contenu modifié', async () => {
    const { deps, journal } = fausseDeps({
      p1: { repoFullName: 'org/dos-services-51000900400035', empreinte: 'ancien' },
    });
    const report = await runPublish([UN], deps);

    expect(report.updated).toBe(1);
    // Pas de `creer` : le dépôt existe. Et le `sha` est relu, sans quoi GitHub
    // répondrait 422 et le run croirait avoir republié.
    expect(journal).toEqual([
      'sha:dos-services-51000900400035',
      'ecrire:dos-services-51000900400035:sha-existant',
      'enregistrer:p1',
    ]);
  });

  it('pose la date de publication une seule fois', async () => {
    // C'est elle qui fait courir les 90 jours de D5. La remettre à jour à
    // chaque republication repousserait indéfiniment la péremption : un site
    // régénéré tous les deux mois n'expirerait JAMAIS, et resterait en ligne
    // au nom d'un tiers sans que personne ne s'en aperçoive. La date dit
    // « depuis quand ce site est publié », pas « quand on l'a retouché ».
    const premier = fausseDeps();
    await runPublish([UN], premier.deps);
    expect(premier.ecrits['p1']?.publishedAt).toEqual(new Date('2026-09-01T12:00:00Z'));

    const ensuite = fausseDeps({
      p1: {
        repoFullName: 'org/dos-services-51000900400035',
        empreinte: 'ancien',
        publishedAt: new Date('2026-06-01T00:00:00Z'),
      },
    });
    await runPublish([UN], ensuite.deps);
    expect(ensuite.ecrits['p1']?.publishedAt).toEqual(new Date('2026-06-01T00:00:00Z'));
  });

  it('refuse de publier quand l’éditeur n’est pas identifiable', async () => {
    // §11 conformité : un site publié au nom d'un tiers doit nommer son
    // éditeur et offrir un moyen d'en demander le retrait. Sans cela la
    // publication n'a pas lieu — et le refus est compté, donc le run échoue.
    const { deps, journal } = fausseDeps();
    const sansEditeur: PublishInput = {
      prospectId: 'p1',
      contenu: { ...CONTENU, editeur: { nom: 'À RENSEIGNER', contact: 'x@example.com' } },
    };
    const report = await runPublish([sansEditeur], deps);

    expect(report.refused).toBe(1);
    expect(report.created).toBe(0);
    expect(journal).toEqual([]);
    expect(publishExitCode(report)).toBe(1);
  });

  it('poursuit le lot quand un prospect échoue', async () => {
    // « Aucun étage ne peut corrompre la base sur un échec partiel »
    // (spec du socle, §12). Sur vingt-deux prospects, interrompre au premier
    // 403 laisserait les vingt et un autres au point mort sans raison.
    const { deps, journal } = fausseDeps();
    deps.github.attendreContenuModele = async () => 'sha-du-modele';
    deps.github.creerDepuisModele = async (_modele, nom) => {
      if (nom.endsWith('51000900400035')) throw new Error('GitHub création : 403 — refusé');
      journal.push(`creer:${nom}`);
      return { fullName: `org/${nom}`, htmlUrl: 'u' };
    };
    const autre: PublishInput = {
      prospectId: 'p2',
      contenu: { ...CONTENU, faits: { ...FAITS, siret: '52405116600014' } },
    };

    const report = await runPublish([UN, autre], deps);
    expect(report.failed).toBe(1);
    expect(report.created).toBe(1);
    expect(journal).toContain('enregistrer:p2');
    expect(journal).not.toContain('enregistrer:p1');
  });
});
