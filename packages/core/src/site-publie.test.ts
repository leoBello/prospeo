import { describe, expect, it } from 'vitest';
import { assembleFacts } from './site-facts.js';
import { composerContenuPublie, EDITEUR, editeurRenseigne } from './site-publie.js';
import { getTrade } from './trades.js';
import type { SiteFactsInput } from './site-facts.js';

const PLOMBIER = getTrade('plombier')!;

const DOS_SERVICES: SiteFactsInput = {
  siret: '51000900400035',
  denomination: 'SOULEYMANE DOSSO (DOS SERVICES)',
  denominationUsuelle: 'DOS SERVICES',
  tradeSlug: 'plombier',
  address: '37 RUE JACQUES CARTIER 44300 NANTES',
  postalCode: '44300',
  city: 'NANTES',
  dateCreation: '2009-02-16',
  latitude: 47.2603579,
  longitude: -1.5721302,
  enrichment: {
    status: 'ok',
    matchedName: 'Dos-Services',
    phoneE164: '+33602002360',
    rating: 4.6,
    mapsUrl: 'https://www.google.com/maps/place/Dos-Services/@47.26,-1.57,17z',
  },
};

const FAITS = assembleFacts(DOS_SERVICES)!;

const THEME = { palette: 'nuit', typo: 'humanist', heros: 'plomberie-04' } as const;

const REDACTION = {
  accroche: 'Votre plombier à Nantes, du dépannage à l’installation',
  presentation:
    'Dos-Services intervient à Nantes chez les particuliers comme chez les ' +
    'professionnels. Vous joignez directement l’artisan au téléphone.',
  prestations: ['chauffe-eau', 'depannage', 'sanitaire'],
  theme: THEME,
};

const VERSION = { schema: 'v1', promptVersion: 'test', model: 'claude-opus-4-8' };

describe('composerContenuPublie', () => {
  it('résout les codes de prestations en libellés, dans l’ordre du modèle', () => {
    // C'est le déplacement qui rend le dépôt généré autonome. Le modèle a
    // choisi des CODES ; le dépôt reçoit des libellés déjà résolus, et n'a
    // donc plus besoin de `trades.ts` — donc plus besoin de `@prospeo/core`,
    // qui ne s'installe pas hors du monorepo.
    const publie = composerContenuPublie(FAITS, REDACTION, PLOMBIER, VERSION);
    expect(publie.redaction.prestations.map((p) => p.label)).toEqual([
      'Chauffe-eau et ballon',
      'Dépannage',
      'Sanitaire',
    ]);
    // L'ordre choisi par le modèle est conservé : la première carte est celle
    // qu'on lit.
    expect(publie.redaction.prestations[0]?.code).toBe('chauffe-eau');
  });

  it('recopie les faits sans y toucher', () => {
    const publie = composerContenuPublie(FAITS, REDACTION, PLOMBIER, VERSION);
    expect(publie.faits).toEqual(FAITS);
  });

  it('inscrit l’éditeur dans le contenu publié', () => {
    // L'éditeur ne peut pas vivre dans le dépôt modèle seul : `publish` doit
    // pouvoir REFUSER de publier quand il n'est pas renseigné, et il ne lit
    // pas les sources du gabarit. Le porter dans le fichier de contenu met la
    // valeur et son garde-fou du même côté.
    const publie = composerContenuPublie(FAITS, REDACTION, PLOMBIER, VERSION);
    expect(publie.editeur).toEqual(EDITEUR);
    expect(publie.editeur.nom).not.toBe('');
  });

  it('refuse un code de prestation étranger au métier', () => {
    // Injoignable après validation du schéma, mais `composerContenuPublie`
    // est exportée et peut être appelée sur des données venues d'ailleurs —
    // d'une reprise, d'un rejeu. Échouer vaut mieux que publier une carte
    // vide.
    expect(() =>
      composerContenuPublie(
        FAITS,
        { ...REDACTION, prestations: ['depannage', 'blindage'] },
        PLOMBIER,
        VERSION,
      ),
    ).toThrow(/blindage/);
  });
});

describe('editeurRenseigne', () => {
  it('reconnaît une identité réelle', () => {
    // §11 conformité : un site publié au nom d'un tiers doit nommer son
    // véritable éditeur et offrir un moyen d'en demander le retrait. Sans
    // cette identité, la publication n'a pas le droit d'avoir lieu — et c'est
    // `publish` (tâche 3) qui applique le refus.
    expect(editeurRenseigne()).toBe(true);
  });

  it('rejette une valeur d’attente', () => {
    expect(editeurRenseigne({ nom: 'À RENSEIGNER', contact: 'x@example.com' })).toBe(false);
    expect(editeurRenseigne({ nom: '', contact: 'leo@exemple.fr' })).toBe(false);
    expect(editeurRenseigne({ nom: 'Léo Bello', contact: '' })).toBe(false);
    // Une adresse qui n'en est pas une ne vaut pas mieux qu'une absente : le
    // mécanisme d'opposition doit être joignable.
    expect(editeurRenseigne({ nom: 'Léo Bello', contact: 'pas-une-adresse' })).toBe(false);
  });
});

describe('le thème, du modèle au dépôt', () => {
  it('traverse la composition sans être retouché', () => {
    // Le thème est le seul choix du modèle qui ne soit pas résolu en chemin :
    // les prestations deviennent des libellés, mais `cuivre` reste `cuivre`.
    // C'est voulu — la valeur est un JETON, pas une couleur. Les couleurs
    // vivent dans la feuille de style du gabarit, qui est copiée dans le
    // dépôt du prospect et n'a besoin de personne pour les connaître.
    //
    // Faire voyager des hexadécimaux à la place rouvrirait précisément ce que
    // D6 ferme : un fichier de contenu porteur de couleurs est un fichier
    // qu'une génération, ou une main dans le dépôt du prospect, peut rendre
    // illisible sans qu'aucun schéma ne s'en aperçoive.
    const publie = composerContenuPublie(FAITS, REDACTION, PLOMBIER, VERSION);
    expect(publie.redaction.theme).toEqual(THEME);
  });
});
