import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contenuPublieSchema } from './content/contrat.js';
import { HEROS_DISPONIBLES } from './content/images.js';

/**
 * Le thème, éprouvé sur la feuille de style RÉELLE.
 *
 * Les valeurs ne sont pas recopiées ici : elles sont lues dans
 * `palettes.css`, c'est-à-dire dans le fichier que le build copie tel quel
 * dans les vingt-deux dépôts. Un test qui recopierait les couleurs
 * vérifierait sa propre copie et resterait vert pendant qu'un site déployé
 * afficherait du gris sur gris.
 */
function lire(nom: string): string {
  return readFileSync(fileURLToPath(new URL(`./styles/${nom}`, import.meta.url)), 'utf8');
}

/** `[data-palette='cuivre'] { --encre: #221a13; … }` → une entrée par palette. */
function palettesDeclarees(): Map<string, Record<string, string>> {
  const css = lire('palettes.css');
  const trouvees = new Map<string, Record<string, string>>();
  for (const bloc of css.matchAll(/\[data-palette='([\w-]+)'\]\s*\{([^}]*)\}/g)) {
    const jetons: Record<string, string> = {};
    for (const jeton of (bloc[2] ?? '').matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      jetons[jeton[1] as string] = jeton[2] as string;
    }
    trouvees.set(bloc[1] as string, jetons);
  }
  return trouvees;
}

function typosDeclarees(): string[] {
  const css = lire('typos.css');
  return [...css.matchAll(/\[data-typo='([\w-]+)'\]/g)].map((m) => m[1] as string);
}

/**
 * Le rapport de contraste WCAG entre deux couleurs.
 *
 * La linéarisation s'applique aux TROIS canaux. L'oublier sur le bleu — une
 * faute d'inattention d'une ligne — rend des ratios plausibles mais faux, et
 * ferait passer pour conformes des palettes qui ne le sont pas. C'est arrivé
 * pendant la conception de ces cinq palettes-ci : quatre d'entre elles
 * paraissaient échouer alors qu'elles réussissaient.
 */
function contraste(a: string, b: string): number {
  const canal = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = (hex: string): number => {
    const n = Number.parseInt(hex.slice(1), 16);
    return (
      0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
    );
  };
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (sombre + 0.05);
}

/**
 * Les sept paires que la page met réellement à l'écran.
 *
 * Ce ne sont pas toutes les combinaisons possibles, mais celles que le gabarit
 * emploie : de l'encre et de l'encre douce sur les deux fonds, l'accent sur
 * les deux fonds — il porte les liens et les yeux de section, donc du texte —
 * et le texte du bouton sur l'accent.
 */
const PAIRES = [
  ['--encre', '--fond'],
  ['--encre', '--surface'],
  ['--encre-douce', '--fond'],
  ['--encre-douce', '--surface'],
  ['--accent', '--fond'],
  ['--accent', '--surface'],
  ['--sur-accent', '--accent'],
] as const;

/** WCAG AA pour le texte normal. */
const SEUIL_AA = 4.5;

describe('les palettes', () => {
  it('atteignent toutes WCAG AA sur les sept paires employées', () => {
    // C'est D6 rendu vérifiable : « les palettes sont éprouvées au contraste à
    // l'écriture du gabarit, une fois pour toutes ». Personne ne relira
    // vingt-deux sites au colorimètre, et une palette illisible ne se voit pas
    // dans un journal de build — elle se découvre sur la page déployée, au nom
    // d'une entreprise réelle.
    //
    // Le test échoue en NOMMANT la palette et la paire fautives : un « expect
    // false to be true » obligerait à refaire le calcul à la main pour savoir
    // laquelle des trente-cinq combinaisons a cédé.
    const fautes: string[] = [];

    for (const [nom, jetons] of palettesDeclarees()) {
      for (const [avant, arriere] of PAIRES) {
        const a = jetons[avant];
        const b = jetons[arriere];
        if (a === undefined || b === undefined) {
          fautes.push(`${nom} : ${avant} ou ${arriere} manque`);
          continue;
        }
        const ratio = contraste(a, b);
        if (ratio < SEUIL_AA) {
          fautes.push(`${nom} : ${avant} sur ${arriere} = ${ratio.toFixed(2)} (< ${SEUIL_AA})`);
        }
      }
    }

    expect(fautes).toEqual([]);
  });

  it('déclarent chacune tous les jetons dont le gabarit se sert', () => {
    // Un jeton manquant ne casse rien : la variable CSS reste vide, et la
    // règle qui l'emploie est simplement ignorée. Le symptôme est du texte
    // noir sur fond transparent dans UNE palette sur cinq — invisible tant
    // qu'on regarde la palette par défaut, et c'est le modèle qui décide de
    // celle qu'un prospect reçoit.
    const attendus = [...new Set(PAIRES.flat()), '--trait'];
    for (const [nom, jetons] of palettesDeclarees()) {
      expect(Object.keys(jetons).sort(), `palette ${nom}`).toEqual([...attendus].sort());
    }
  });

  it('sont exactement celles que le schéma accepte', () => {
    // Les deux listes vivent dans deux fichiers — la feuille de style et le
    // contrat — parce que le gabarit doit rester autonome. Rien n'empêcherait
    // d'en modifier une seule.
    //
    // Le sens de l'écart compte : une palette dans le CSS mais pas dans le
    // schéma est du code mort ; une palette dans le schéma mais pas dans le
    // CSS est une page sans couleurs, validée sans broncher puis déployée.
    // C'est ce second cas que ce test attrape, et il n'a aucun autre garde.
    const duCss = [...palettesDeclarees().keys()].sort();
    const duSchema = [
      ...contenuPublieSchema.shape.redaction.shape.theme.shape.palette.options,
    ].sort();
    expect(duCss).toEqual(duSchema);
  });
});

describe('les typographies', () => {
  it('sont exactement celles que le schéma accepte', () => {
    const duCss = [...typosDeclarees()].sort();
    const duSchema = [
      ...contenuPublieSchema.shape.redaction.shape.theme.shape.typo.options,
    ].sort();
    expect(duCss).toEqual(duSchema);
  });

  it('posent chacune les trois variables de composition', () => {
    // `--police-titre`, `--police-texte` et `--serrage-titre` sont employées
    // par tout le gabarit. Une typographie qui n'en poserait que deux rendrait
    // une page dont les titres retombent sur la police du texte — un défaut
    // qui se lit comme une négligence, pas comme un choix.
    const css = readFileSync(
      fileURLToPath(new URL('./styles/typos.css', import.meta.url)),
      'utf8',
    );
    for (const bloc of css.matchAll(/\[data-typo='([\w-]+)'\]\s*\{([^}]*)\}/g)) {
      const corps = bloc[2] ?? '';
      for (const variable of ['--police-titre', '--police-texte', '--serrage-titre']) {
        expect(corps, `typo ${bloc[1]}`).toContain(variable);
      }
    }
  });

  it('n’appellent aucune police distante', () => {
    // D5. Le CDN Google transmet l'adresse IP du visiteur à un tiers —
    // sanctionné en Allemagne, et inutilement risqué sur la page d'une
    // entreprise qu'on démarche sans son accord. Les fichiers viennent de
    // `@fontsource-variable`, servis depuis le dépôt du prospect.
    const css = lire('typos.css') + lire('theme.css') + lire('palettes.css');
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(css).not.toMatch(/@import\s+url\(\s*['"]?https?:/);
  });
});

describe('les images de héros', () => {
  it('sont celles que le schéma accepte, et elles existent vraiment', () => {
    // Le contrat du gabarit contraint `heros` aux fichiers RÉELLEMENT présents
    // dans ce dépôt-ci, et non à une liste écrite à la main. `packages/core`
    // valide de son côté une intention — ce héros appartient-il au métier ;
    // ici on valide une présence.
    //
    // La différence se paie le jour où quelqu'un retire une image du dépôt
    // modèle : `core` continuerait de laisser le modèle la choisir, et le
    // build du prospect échouerait sur un import introuvable, loin de la
    // cause. Ici, le schéma la refuse d'emblée.
    const duSchema = [
      ...contenuPublieSchema.shape.redaction.shape.theme.shape.heros.options,
    ].sort();
    expect(duSchema).toEqual([...HEROS_DISPONIBLES].sort());
    // Huit variantes : deux plombiers nantais démarchés la même semaine ne
    // doivent pas recevoir la même ouverture.
    expect(HEROS_DISPONIBLES.length).toBeGreaterThanOrEqual(8);
  });
});

describe('l’interrupteur des animations', () => {
  it('empêche toute instanciation sous prefers-reduced-motion', () => {
    // Le §7 en fait un seuil, et D1 le dit « non négociable ». Il ne se vérifie
    // pas sur le HTML rendu : GSAP ne tourne qu'au navigateur. Ce qui SE
    // vérifie, c'est que la garde entoure bien tout le reste.
    //
    // Trois conditions, et la troisième est celle qu'on oublie :
    //
    //  1. la condition est celle de l'absence de préférence, si bien qu'un
    //     visiteur qui demande moins d'animation n'entre jamais dans le bloc ;
    //  2. aucune animation ne vit hors de ce bloc ;
    //  3. l'état de départ (`opacity: 0`) n'est posé nulle part en CSS — sans
    //     quoi une page dont le script ne s'exécute pas resterait BLANCHE,
    //     et c'est le pire mode de panne pour une URL déjà envoyée par email.
    const script = readFileSync(
      fileURLToPath(new URL('./scripts/animation.ts', import.meta.url)),
      'utf8',
    );

    expect(script).toContain("mm.add('(prefers-reduced-motion: no-preference)'");

    // Tout appel d'animation doit venir APRÈS l'ouverture de la garde.
    const garde = script.indexOf('mm.add(');
    for (const appel of script.matchAll(/gsap\.(from|to|set)\(|ScrollTrigger\.batch\(/g)) {
      expect(appel.index, `« ${appel[0]} » est hors de la garde`).toBeGreaterThan(garde);
    }

    // Et rien en CSS ne cache les éléments en attendant le script.
    const css = lire('theme.css');
    const regleApparition = /\.apparition[^{]*\{([^}]*)\}/g;
    for (const bloc of css.matchAll(regleApparition)) {
      expect(bloc[1] ?? '').not.toMatch(/opacity\s*:\s*0/);
      expect(bloc[1] ?? '').not.toMatch(/visibility\s*:\s*hidden/);
    }
  });
});

describe('aucune couleur écrite en dur hors du héros', () => {
  it('interdit ce qui a rendu le bandeau de démonstration invisible', () => {
    // Défaut trouvé à l'œil, en palette `nuit`, et invisible dans les quatre
    // autres. `Bandeau.astro` posait `color: #fff` sur `background:
    // var(--encre)` : sur une palette sombre, l'encre est presque blanche, et
    // le bandeau devenait blanc sur blanc.
    //
    // Ce n'est pas un défaut de style. Ce bandeau est ce qui DÉCLARE que la
    // page est une démonstration non commandée ; illisible, le site se fait
    // passer pour celui de l'artisan (§11 conformité). Le mode de panne est
    // exactement celui que ce projet redoute : silencieux, invisible dans le
    // cas courant, et découvert par la personne concernée.
    //
    // Le héros fait exception, et une seule : son texte repose sur une
    // photographie voilée, pas sur une couleur de palette. Une encre claire y
    // serait illisible une fois sur deux.
    const racine = fileURLToPath(new URL('./components/', import.meta.url));
    const fautifs: string[] = [];

    for (const nom of readdirSync(racine).filter((f) => f.endsWith('.astro'))) {
      if (nom === 'Hero.astro') continue;
      const source = readFileSync(join(racine, nom), 'utf8');
      for (const bloc of source.matchAll(/<style[\s\S]*?<\/style>/g)) {
        // Les commentaires expliquent souvent la règle : les retirer évite de
        // se faire prendre par sa propre documentation.
        const css = bloc[0].replace(/\/\*[\s\S]*?\*\//g, '');
        for (const declaration of css.matchAll(/(?:^|[;{])\s*(color|background(?:-color)?)\s*:([^;}]*)/g)) {
          const valeur = declaration[2] ?? '';
          // `rgba(255,255,255,…)` translucide sur une photo est légitime ;
          // c'est une couleur OPAQUE en dur qui ne suit pas la palette.
          if (/#[0-9a-fA-F]{3,8}|(?:white|black)/.test(valeur)) {
            fautifs.push(`${nom} : ${declaration[1]}:${valeur.trim()}`);
          }
        }
      }
    }

    expect(fautifs).toEqual([]);
  });
});
