import { describe, expect, it } from 'vitest';
import { getTrade, type SiteFacts } from '@prospeo/core';
import {
  consignes,
  factsMessage,
  PROMPT_VERSION,
  runGenerate,
  type GenerateDeps,
  type GenerateInput,
} from './generate.js';

const PLOMBIER = getTrade('plombier')!;

const FAITS: SiteFacts = {
  nomAffiche: 'Dos-Services',
  metier: { slug: 'plombier', label: 'Plombier' },
  adresse: { rue: '37 Rue Jacques Cartier', codePostal: '44300', ville: 'Nantes' },
  telephone: { e164: '+33602002360', affichage: '06 02 00 23 60' },
  anneeCreation: 2009,
  noteGoogle: 4.6,
  lienMaps: 'https://maps.example/x',
  raisonSociale: 'SOULEYMANE DOSSO (DOS SERVICES)',
  siret: '51000900400035',
};

const REDACTION_VALIDE = {
  accroche: 'Votre plombier à Nantes, dépannage et installation',
  presentation:
    'Dos-Services intervient à Nantes chez les particuliers comme chez les professionnels, ' +
    'pour un dépannage comme pour une installation complète. Vous joignez directement ' +
    'l’artisan au téléphone.',
  prestations: ['depannage', 'chauffe-eau', 'sanitaire'],
};

describe('consignes', () => {
  const texte = consignes(PLOMBIER);

  it('énonce ce que le modèle IGNORE, et pas seulement ce qu’il sait', () => {
    // C'est le point le plus important du prompt, et il est contre-intuitif.
    // Le §10 du spec du socle le dit : « un modèle à qui l'on ne dit pas ce
    // qu'il ignore comble les trous : c'est son métier. » Lui donner la liste
    // des faits disponibles ne suffit donc pas — il faut lui nommer
    // explicitement les rubriques qu'une vitrine d'artisan comporte
    // d'ordinaire et sur lesquelles la base ne sait RIEN, sans quoi il les
    // remplira de plausible.
    //
    // Les familles échantillonnées ci-dessous sont celles que la mesure a
    // montrées absentes de la base, et celles qu'un artisan se fait reprocher
    // au téléphone quand elles sont fausses.
    //
    // « clientèle » a été ajoutée en v2 après le premier appel réel : le
    // modèle avait écrit « nous intervenons chez les particuliers », ce que la
    // base ne sait pas. Ce n'était pas un caprice du modèle, c'était un trou
    // dans la règle — il n'avait jamais été prévenu de cette absence-là.
    for (const inconnu of ['horaires', 'délai', 'certification', 'tarif', 'avis', 'clientèle']) {
      expect(texte.toLowerCase()).toContain(inconnu);
    }
  });

  it('donne la liste close des prestations du métier', () => {
    for (const p of PLOMBIER.prestations) expect(texte).toContain(p.code);
  });

  it('ne donne pas les prestations d’un autre métier', () => {
    expect(consignes(getTrade('serrurier')!)).not.toContain('chauffe-eau');
  });

  it('ne contient AUCUN fait de prospect', () => {
    // La condition de la mise en cache du préfixe (tâche 2) : les consignes
    // sont l'essentiel des jetons d'entrée et doivent être identiques d'un
    // prospect à l'autre. Un seul nom d'entreprise glissé ici invaliderait le
    // cache à chaque appel — silencieusement, puisque la réponse resterait
    // correcte et que seule la facture bougerait.
    expect(texte).not.toContain('Dos-Services');
    expect(texte).not.toContain('44300');
    expect(texte).not.toContain('06 02 00 23 60');
  });

  it('est identique d’un appel à l’autre pour un même métier', () => {
    // Le cache est un appariement de préfixe : le moindre octet qui change —
    // une date, un identifiant de run — le fait manquer.
    expect(consignes(PLOMBIER)).toBe(consignes(PLOMBIER));
  });

  it('annonce les bornes de longueur plutôt que de les faire découvrir', () => {
    // Une contrainte de rédaction se donne à l'écriture. Un texte trop long
    // rejeté par le schéma coûte un second appel entier ; tronqué après coup,
    // il coûterait une phrase coupée en plein milieu sur un site déployé.
    expect(texte).toMatch(/80/);
    expect(texte).toMatch(/400/);
  });
});

describe('factsMessage', () => {
  it('ne mentionne pas un fait que la base ignore', () => {
    // Un « note Google : non renseignée » dans le prompt est une invitation :
    // le modèle voit la rubrique, la juge attendue, et la comble. Ce que la
    // base ignore ne doit pas apparaître du tout — pas même en creux.
    const sansNote = factsMessage({ ...FAITS, noteGoogle: null, anneeCreation: null });
    expect(sansNote.toLowerCase()).not.toContain('note');
    expect(sansNote.toLowerCase()).not.toContain('création');
    expect(sansNote).toContain('Dos-Services');
    expect(sansNote).toContain('Nantes');
  });

  it('porte les faits présents', () => {
    const texte = factsMessage(FAITS);
    expect(texte).toContain('4,6');
    expect(texte).toContain('2009');
  });

  it('ne transmet ni SIRET ni raison sociale', () => {
    // Ces deux-là ne servent qu'aux mentions légales, où ils sont recopiés
    // par le code. Les donner au modèle l'inviterait à les faire figurer dans
    // sa prose : « SOULEYMANE DOSSO » est un état civil, et l'artisan se
    // présente comme « Dos-Services ».
    const texte = factsMessage(FAITS);
    expect(texte).not.toContain('51000900400035');
    expect(texte).not.toContain('SOULEYMANE');
  });
});

/** Client bidon : aucun appel réseau, réponses scriptées. */
function fausseDeps(
  reponses: unknown[],
  usage = { input: 1200, cacheWrite: 0, cacheRead: 900, output: 300 },
) {
  const appels: { system: string; user: string }[] = [];
  let i = 0;
  const deps: GenerateDeps = {
    async rediger(systeme, utilisateur) {
      appels.push({ system: systeme, user: utilisateur });
      const r = reponses[Math.min(i++, reponses.length - 1)];
      if (r instanceof Error) throw r;
      return { redaction: r, usage };
    },
  };
  return { deps, appels };
}

const UN: GenerateInput = { prospectId: 'p1', faits: FAITS, trade: PLOMBIER };

describe('runGenerate', () => {
  it('compose un contenu publiable et trace sa provenance', async () => {
    const { deps } = fausseDeps([REDACTION_VALIDE]);
    const r = await runGenerate([UN], deps);

    expect(r.report.generated).toBe(1);
    const contenu = r.contenus[0]?.contenu;
    expect(contenu?.redaction.prestations.map((p) => p.label)).toEqual([
      'Dépannage',
      'Chauffe-eau et ballon',
      'Sanitaire',
    ]);
    // Même doctrine que `MATCHING_CONFIG.version` et le barème : un contenu
    // relu dans six mois doit dire sous quelles consignes il a été écrit.
    expect(contenu?.version.promptVersion).toBe(PROMPT_VERSION);
  });

  it('sépare les consignes des faits, pour que le cache serve', async () => {
    const { deps, appels } = fausseDeps([REDACTION_VALIDE]);
    await runGenerate([UN], deps);
    expect(appels[0]?.system).toContain('depannage');
    expect(appels[0]?.system).not.toContain('Dos-Services');
    expect(appels[0]?.user).toContain('Dos-Services');
  });

  it('rejette une rédaction qui invente un chiffre', async () => {
    // Le garde-fou de `verifierCoherence`, appliqué là où il compte : à la
    // sortie du modèle, avant que quoi que ce soit soit écrit. « Depuis 2005 »
    // sur une entreprise créée en 2009 est une invention, et le §4 du plan
    // veut un échec franc plutôt qu'un contenu approximatif rattrapé à la
    // main.
    const { deps } = fausseDeps([
      {
        ...REDACTION_VALIDE,
        presentation:
          'Installé à Nantes depuis 2005, Dos-Services intervient chez les particuliers ' +
          'comme chez les professionnels, pour tout dépannage de plomberie.',
      },
    ]);
    const r = await runGenerate([UN], deps);
    expect(r.report.generated).toBe(0);
    expect(r.report.rejected).toBe(1);
    expect(r.contenus).toEqual([]);
  });

  it('rejette une rédaction hors du contrat', async () => {
    // Une réponse qui ne valide pas est un échec franc, pas un contenu
    // approximatif : deux prestations au lieu de trois, ou une prestation
    // inventée, ne se rattrapent pas.
    const { deps } = fausseDeps([
      { ...REDACTION_VALIDE, prestations: ['depannage', 'devis-gratuit', 'sanitaire'] },
    ]);
    expect((await runGenerate([UN], deps)).report.rejected).toBe(1);
  });

  it('additionne ce que le lot a coûté', async () => {
    // §4 du plan : « tout ce qui coûte est compté et affiché ». Les jetons lus
    // depuis le cache sont comptés à part — c'est le seul moyen de constater
    // que la mise en cache du préfixe sert réellement, plutôt que de l'espérer.
    const { deps } = fausseDeps([REDACTION_VALIDE, REDACTION_VALIDE]);
    const deux = [UN, { ...UN, prospectId: 'p2' }];
    const r = await runGenerate(deux, deps);
    expect(r.report.usage).toEqual({ input: 2400, cacheWrite: 0, cacheRead: 1800, output: 600 });
  });

  it('poursuit le lot quand un appel échoue', async () => {
    const { deps } = fausseDeps([new Error('529 overloaded'), REDACTION_VALIDE]);
    const r = await runGenerate([UN, { ...UN, prospectId: 'p2' }], deps);
    expect(r.report.failed).toBe(1);
    expect(r.report.generated).toBe(1);
  });
});
