/**
 * Rend les artboards `.dc.html` ouvrables dans un navigateur.
 *
 * Un `.dc.html` n'est pas une page autonome : il est enveloppé dans `<x-dc>`,
 * range ses feuilles et ses polices dans `<helmet>`, et — pour `Main` — porte
 * des gabarits (`{{ x }}`), des conditions (`<sc-if>`) et des boucles
 * (`<sc-for>`) que l'éditeur de canvas résolvait. Ce canvas a été supprimé,
 * et avec lui le seul moyen de regarder les maquettes.
 *
 * Ce script résout tout cela une fois et écrit du HTML statique dans
 * `rendu/`. Les sources restent la référence : ce qui est produit ici est
 * une lecture, pas une seconde vérité — d'où la régénération à la demande
 * plutôt qu'une copie entretenue à la main.
 *
 * Usage, depuis la racine du dépôt :
 *   node docs/design/maquettes/aplatir.mjs
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, 'rendu');

/** Ce dont les maquettes se servent des valeurs qu'elles se donnent elles-mêmes. */
const REGLAGES = { accent: '#6d92ff', gamification: 'affirmee' };

/**
 * Exécute la classe de logique d'une maquette pour obtenir ses valeurs.
 *
 * `DCLogic` est la classe de base de l'éditeur, absente du dépôt : on en
 * fournit le strict nécessaire (les propriétés, un `setState` inerte). Les
 * valeurs qui sont des fonctions — les gestionnaires de clic des onglets —
 * n'ont plus de moteur derrière elles et sont écartées.
 */
function valeurs(source) {
  const debut = source.indexOf('class Component extends DCLogic');
  if (debut === -1) return null;
  const corps = source.slice(debut, source.lastIndexOf('</script>'));
  const base = class {
    constructor(props) {
      this.props = props ?? {};
    }
    setState(partiel) {
      this.state = { ...this.state, ...partiel };
    }
  };
  const fabrique = new Function('DCLogic', `${corps}\nreturn Component;`);
  return new (fabrique(base))(REGLAGES).renderVals();
}

/** `p.nom` ou `nom` — la portée de boucle d'abord, les valeurs globales ensuite. */
function resoudre(chemin, portee, vals) {
  const [tete, ...suite] = chemin.split('.');
  let valeur = tete in portee ? portee[tete] : vals?.[tete];
  for (const bout of suite) valeur = valeur?.[bout];
  return valeur;
}

function substituer(texte, portee, vals) {
  return texte.replace(/\{\{\s*([A-Za-z_][\w.]*)\s*\}\}/g, (_, chemin) => {
    const valeur = resoudre(chemin, portee, vals);
    return valeur === undefined || valeur === null ? '' : String(valeur);
  });
}

// Un bloc SANS bloc imbriqué : la boucle ci-dessous les résout donc du plus
// interne vers le plus externe, ce qui évite d'écrire un vrai analyseur.
const BLOC = /<sc-(for|if)\b([^>]*)>((?:(?!<sc-(?:for|if)\b)[\s\S])*?)<\/sc-\1>/;

function derouler(texte, portee, vals) {
  for (;;) {
    const m = BLOC.exec(texte);
    if (m === null) return substituer(texte, portee, vals);
    const [entier, genre, attributs, corps] = m;
    let rendu = '';
    if (genre === 'if') {
      const cond = /value="\{\{\s*([\w.]+)\s*\}\}"/.exec(attributs);
      if (cond !== null && resoudre(cond[1], portee, vals)) rendu = derouler(corps, portee, vals);
    } else {
      const liste = /list="\{\{\s*([\w.]+)\s*\}\}"/.exec(attributs);
      const alias = /as="(\w+)"/.exec(attributs);
      const items = (liste === null ? null : resoudre(liste[1], portee, vals)) ?? [];
      const nom = alias === null ? 'item' : alias[1];
      rendu = items.map((it) => derouler(corps, { ...portee, [nom]: it }, vals)).join('');
    }
    texte = texte.slice(0, m.index) + rendu + texte.slice(m.index + entier.length);
  }
}

function entre(source, ouvrant, fermant) {
  const a = source.indexOf(ouvrant);
  const b = source.indexOf(fermant);
  return a === -1 || b === -1 ? null : source.slice(a + ouvrant.length, b);
}

function aplatir(fichier) {
  const source = readFileSync(join(ICI, fichier), 'utf8');
  const dc = entre(source, '<x-dc>', '</x-dc>') ?? source;
  const helmet = entre(dc, '<helmet>', '</helmet>') ?? '';
  const apres = dc.indexOf('</helmet>');
  const markup = apres === -1 ? dc : dc.slice(apres + '</helmet>'.length);

  const vals = valeurs(source);
  let plat = vals === null ? markup : derouler(markup, {}, vals);
  // Les gestionnaires d'événement du canvas n'ont plus de moteur derrière eux :
  // les laisser produirait une erreur de console à chaque clic.
  plat = plat.replace(/\son[A-Za-z]+="[^"]*"/g, '');

  const nom = fichier.replace(/\.dc\.html$/, '');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${nom} — maquette Prospeo</title>
${helmet.trim()}
<style>body { margin: 0; background: #0b0d12; }</style>
</head>
<body>
${plat.trim()}
</body>
</html>
`;
}

mkdirSync(SORTIE, { recursive: true });
const sources = readdirSync(ICI).filter((f) => f.endsWith('.dc.html')).sort();
for (const fichier of sources) {
  const nom = fichier.replace(/\.dc\.html$/, '.html');
  writeFileSync(join(SORTIE, nom), aplatir(fichier), 'utf8');
  console.log(`rendu/${nom}`);
}
console.log(`${sources.length} maquettes rendues dans ${SORTIE}`);
