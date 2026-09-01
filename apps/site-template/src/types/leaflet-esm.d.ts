/**
 * Les types de Leaflet, rattachés à son fichier ESM.
 *
 * `Zone.astro` importe `leaflet/dist/leaflet-src.esm.js` et non `leaflet`, pour
 * une raison expliquée sur place : `leaflet@1.9.4` ne déclare ni `exports` ni
 * `module` dans son `package.json`, si bien qu'un import du nom nu retombe sur
 * le paquet UMD, dont l'interopérabilité place l'espace de noms tantôt à la
 * racine, tantôt sous `.default`, selon l'outil qui empaquette.
 *
 * Le revers est que TypeScript ne sait pas typer ce chemin : `@types/leaflet`
 * ne décrit que le nom nu. Cette déclaration rebranche les deux — le code
 * d'exécution vise l'ESM, la vérification de types vise les mêmes signatures.
 *
 * Sans elle, `astro check` échoue, et le refuser plutôt que de désactiver la
 * règle est le comportement voulu : `astro check` est ce qui garde les 22
 * dépôts d'un `L.map` mal appelé.
 */
declare module 'leaflet/dist/leaflet-src.esm.js' {
  export * from 'leaflet';
}
