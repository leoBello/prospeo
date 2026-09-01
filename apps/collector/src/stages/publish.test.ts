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
