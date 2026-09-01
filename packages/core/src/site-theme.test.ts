import { describe, expect, it } from 'vitest';
import { PALETTES, THEME_DEFAUT, TYPOS, themeSchema } from './site-theme.js';
import { getTrade } from './trades.js';

const PLOMBIER = getTrade('plombier')!;
const SERRURIER = getTrade('serrurier')!;

const THEME = { palette: 'cuivre', typo: 'grotesk-serif', heros: 'plomberie-01' };

describe('themeSchema', () => {
  it('fait CHOISIR le modèle, il ne le laisse pas composer', () => {
    // C'est D6, et c'est la même construction que les prestations : le modèle
    // sélectionne un jeton dans une liste close ou il échoue. La garantie est
    // structurelle et non verbale — il ne PEUT pas produire une couleur au
    // contraste illisible, une police absente du dépôt ou une image qui
    // n'existe pas, parce que le schéma les refuse avant qu'elles n'atteignent
    // un fichier.
    expect(themeSchema(PLOMBIER).safeParse(THEME).success).toBe(true);

    for (const invente of [
      { ...THEME, palette: 'bleu-canard' },
      { ...THEME, typo: 'comic' },
      { ...THEME, heros: 'plomberie-99' },
    ]) {
      expect(themeSchema(PLOMBIER).safeParse(invente).success).toBe(false);
    }
  });

  it('refuse un thème incomplet ou débordant', () => {
    // Les trois axes sont exigés : un thème sans palette laisserait la page
    // sans jeu de couleurs et le build rendrait des variables CSS vides,
    // c'est-à-dire du texte noir sur fond transparent — un défaut qui ne se
    // voit qu'une fois déployé.
    expect(themeSchema(PLOMBIER).safeParse({ palette: 'cuivre', typo: 'humanist' }).success).toBe(
      false,
    );
    // `.strict()`, comme partout ailleurs : un champ inconnu signale un
    // modèle qui a débordé, ou une version qui ne s'entend plus avec celle-ci.
    expect(themeSchema(PLOMBIER).safeParse({ ...THEME, couleurBouton: '#ff0000' }).success).toBe(
      false,
    );
  });

  it('rattache les images de héros au MÉTIER, pas au thème', () => {
    // Une palette vaut pour n'importe quel artisan : elle ne dit rien du
    // travail. Une photographie, si. Un chantier de plomberie en héros du
    // site d'un serrurier est un mensonge visuel sur une page qui porte le
    // nom d'une entreprise réelle — exactement ce que la liste close doit
    // rendre impossible.
    //
    // C'est aussi pourquoi la liste vit dans `trades.ts` à côté des
    // prestations, et non dans ce fichier : ajouter un métier oblige à
    // fournir ses images, comme il oblige déjà à fournir ses prestations.
    // Le sketch de D6 les plaçait ici ; les y laisser aurait mis des noms de
    // plomberie dans un module que D1 veut neutre en métier.
    expect(themeSchema(SERRURIER).safeParse(THEME).success).toBe(false);
    expect(
      themeSchema(SERRURIER).safeParse({ ...THEME, heros: SERRURIER.heros[0]!.code }).success,
    ).toBe(true);
  });

  it('garde un thème par défaut réellement choisissable', () => {
    // `THEME_DEFAUT` habille le fichier d'exemple du gabarit et sert de
    // repli documenté. Une faute de frappe y produirait un dépôt modèle dont
    // le build est rouge — et le dépôt modèle est copié dans les 22 autres
    // avant que quiconque ne regarde.
    expect(PALETTES).toContain(THEME_DEFAUT.palette);
    expect(TYPOS).toContain(THEME_DEFAUT.typo);
  });

  it('énumère assez de héros pour que deux voisins ne se ressemblent pas', () => {
    // Le motif de vente est « voici VOTRE site ». Deux plombiers nantais
    // démarchés la même semaine qui reçoivent la même photographie sous le
    // même bandeau cassent ce motif en une seconde. Huit images × cinq
    // palettes × trois typographies donnent 120 variantes, pour 37 prospects
    // éligibles — mesuré en base le 2 septembre 2026.
    expect(PLOMBIER.heros.length).toBeGreaterThanOrEqual(8);
  });
});
