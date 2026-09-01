import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getTrade, PALETTES, SITE_CONTENT_VERSION, TYPOS } from '@prospeo/core';

/**
 * Le pont entre `packages/core` et le gabarit.
 *
 * **Rien ne relie ces deux paquets, et c'est délibéré.** Le dépôt modèle est
 * copié vers un dépôt par prospect, que Vercel construit seul : une dépendance
 * `"@prospeo/core": "workspace:*"` y ferait échouer `npm install` avant même le
 * build, pour les vingt-deux. Le gabarit redit donc les listes closes de son
 * côté, volontairement.
 *
 * Ce fichier EST le lien — exactement comme le test de `CHEMIN_CONTENU`, qui
 * relie de la même façon l'écriture de `publish` et l'import d'`index.astro`.
 * Sans lui, les deux copies dérivent en silence, et le symptôme n'apparaît
 * qu'après un déploiement : une palette que le modèle a le droit de choisir
 * mais qu'aucune règle CSS ne définit rend une page sans couleurs. Le contenu
 * valide, le build réussit, l'URL part dans un email.
 *
 * Le collector est le bon endroit : c'est lui qui écrit dans ces dépôts, et le
 * seul paquet qui puisse lire les deux côtés sans créer de dépendance.
 */

function lireGabarit(chemin: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../site-template/${chemin}`, import.meta.url)), 'utf8');
}

describe('les listes closes du thème, des deux côtés', () => {
  it('les palettes de core sont exactement celles que le gabarit sait peindre', () => {
    const css = lireGabarit('src/styles/palettes.css');
    const declarees = [...css.matchAll(/\[data-palette='([\w-]+)'\]/g)].map((m) => m[1]);
    expect([...declarees].sort()).toEqual([...PALETTES].sort());
  });

  it('les typographies de core sont exactement celles que le gabarit sait composer', () => {
    const css = lireGabarit('src/styles/typos.css');
    const declarees = [...css.matchAll(/\[data-typo='([\w-]+)'\]/g)].map((m) => m[1]);
    expect([...declarees].sort()).toEqual([...TYPOS].sort());
  });

  it('chaque héros déclaré dans trades.ts a son fichier dans le gabarit', () => {
    // Le sens de l'écart décide de la gravité, et c'est celui-ci qui compte :
    // un code déclaré dans `trades.ts` sans fichier correspondant est un
    // choix que le modèle peut faire et que le build du prospect ne pourra
    // pas honorer. Le contrat du gabarit le rattraperait — il n'énumère que
    // les fichiers présents — mais il le rattraperait TROP TARD, après un
    // appel payant et au moment de publier.
    //
    // Le métier est le plombier : c'est celui que la base contient (139 sur
    // 139) et le seul dont le dépôt modèle porte les images (D9). Le jour où
    // un serrurier entre en base, son gabarit se forkera de celui-ci et ce
    // test se dédoublera avec lui.
    const dossier = fileURLToPath(
      new URL('../../../site-template/src/assets/heros/', import.meta.url),
    );
    const fichiers = readdirSync(dossier)
      .filter((nom) => /\.(jpe?g|png|webp|avif)$/i.test(nom))
      .map((nom) => nom.replace(/\.[^.]+$/, ''))
      .sort();

    const plombier = getTrade('plombier')!;
    expect(plombier.heros.map((h) => h.code).sort()).toEqual(fichiers);
  });

  it('chaque héros a son texte alternatif, faute de quoi un lecteur d’écran dirait « undefined »', () => {
    // La clé du texte alternatif est CONSTRUITE à partir du code d'image —
    // le seul endroit du gabarit où une clé d'interface ne soit pas écrite en
    // toutes lettres, donc le seul où elle puisse manquer. `estCleUi` protège
    // du pire à l'exécution en retombant sur une description générique ; ce
    // test évite d'avoir à s'en servir.
    const ui = lireGabarit('src/content/ui.ts');
    for (const hero of getTrade('plombier')!.heros) {
      expect(ui, `héros ${hero.code}`).toContain(`'hero.alt.${hero.code}'`);
    }
  });

  it('le gabarit exige la même version de contrat que core', () => {
    // Le contrat est redit dans `contrat.ts`, volontairement. Une version qui
    // divergerait produirait le pire des deux mondes : `generate` écrit du v2,
    // le gabarit n'accepte que du v1, et l'échec survient au build du dépôt du
    // prospect — après la création du dépôt, donc au nom de l'entreprise.
    const contrat = lireGabarit('src/content/contrat.ts');
    expect(contrat).toContain(`z.literal('${SITE_CONTENT_VERSION}')`);
  });
});
