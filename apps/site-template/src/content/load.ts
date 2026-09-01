import { contenuPublieSchema, type ContenuPublie } from './contrat.js';

/**
 * Valide le fichier de contenu, ou fait échouer le build.
 *
 * C'est la contrepartie exacte de la promesse du §3 du plan — « aucune
 * génération ne peut casser un build » — et elle ne tient que si l'inverse est
 * vrai aussi : un contenu invalide doit s'arrêter ICI, bruyamment, plutôt que
 * de rendre une page où le téléphone manque. Cette page-là serait déployée,
 * son URL partirait dans un email, et c'est l'artisan qui découvrirait le
 * défaut.
 */
export function chargerContenu(brut: unknown): ContenuPublie {
  const parsed = contenuPublieSchema.safeParse(brut);
  if (!parsed.success) {
    // Le détail des champs fautifs, et pas seulement « contenu invalide » :
    // ce message s'affichera dans un journal de build Vercel, loin de la
    // machine qui a produit le fichier et de qui saurait le relire.
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(racine)'} : ${i.message}`)
      .join('\n');
    throw new Error(`Fichier de contenu invalide :\n${details}`);
  }
  return parsed.data;
}
