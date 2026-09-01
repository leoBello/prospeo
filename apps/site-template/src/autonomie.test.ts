import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Le gabarit doit s'installer et se construire HORS du monorepo.
 *
 * **Le piège, déjà payé une fois.** Le dépôt modèle est copié vers un dépôt
 * par prospect, que Vercel installe avec `npm` et construit seul. Une
 * dépendance en `workspace:*` y fait échouer `npm install` avant même le
 * build — pour les vingt-deux à la fois, et après que les dépôts ont été
 * créés au nom d'entreprises réelles. Le §8 du plan le range parmi les pièges
 * à ne pas repayer, et le chantier n°4 s'est soldé par un commit dédié :
 * « rendre le gabarit autonome — il ne se serait pas installé chez Vercel ».
 *
 * **Ce test n'existait pas.** Le plan du chantier n°5 affirme que « le test
 * existant le prouve » ; il n'y en avait aucun. L'autonomie ne tenait que par
 * la vigilance, et le chantier n°5 vient d'ajouter six dépendances — GSAP,
 * Leaflet, sharp et trois familles de polices. C'est le moment où la
 * vigilance seule cesse de suffire.
 *
 * Ce que ce fichier NE fait pas : lancer un vrai `npm install` dans un dossier
 * temporaire. Ce serait quelques minutes de réseau à chaque exécution de la
 * suite, pour vérifier ce qu'une lecture du manifeste établit déjà. La panne
 * qu'on redoute est déclarative, pas aléatoire.
 */
const manifeste = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};

describe('l’autonomie du gabarit', () => {
  it('ne dépend d’aucun paquet du monorepo', () => {
    // `workspace:` est un protocole de pnpm : `npm` ne sait pas le résoudre et
    // s'arrête. Un chemin `file:../..` échouerait de même une fois le dossier
    // copié seul dans un dépôt.
    const toutes = { ...manifeste.dependencies, ...manifeste.devDependencies };
    for (const [nom, version] of Object.entries(toutes)) {
      expect(version, `${nom} → ${version}`).not.toMatch(/^(workspace:|file:|link:)/);
      expect(nom, 'aucun paquet @prospeo hors du monorepo').not.toMatch(/^@prospeo\//);
    }
  });

  it('déclare sharp, sans quoi aucune image n’est optimisée', () => {
    // Astro 7 ne l'embarque plus. Sans déclaration, le build échoue sur
    // « Could not find Sharp » APRÈS avoir rendu la page — les dix-sept images
    // manquent, et le journal de build ne dit rien d'autre. Défaut rencontré
    // pendant ce chantier.
    expect(manifeste.dependencies['sharp']).toBeDefined();
  });

  it('déclare tout ce que le code importe réellement', () => {
    // Un paquet employé mais non déclaré fonctionne dans le monorepo, où pnpm
    // l'a hissé pour un autre paquet, et casse dans le dépôt du prospect, où
    // il n'y a personne pour le hisser. C'est la forme la plus sournoise du
    // défaut d'autonomie : tout est vert ici, tout échoue là-bas.
    for (const paquet of ['astro', 'gsap', 'leaflet', 'zod']) {
      expect(manifeste.dependencies[paquet], paquet).toBeDefined();
    }
    // Les polices sont des dépendances d'exécution : leurs fichiers partent
    // dans le build. Une seule oubliée donnerait une typographie de repli sur
    // un site sur trois, sans le moindre message.
    const polices = Object.keys(manifeste.dependencies).filter((n) =>
      n.startsWith('@fontsource'),
    );
    expect(polices.length).toBeGreaterThanOrEqual(3);
  });

  it('garde un script de build que Vercel sait appeler', () => {
    // Vercel détecte Astro et lance `npm run build`. Renommer ce script
    // casserait les vingt-deux déploiements d'un coup.
    expect(manifeste.scripts['build']).toBe('astro build');
  });
});
