// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Configuration volontairement minimale.
 *
 * Le site est statique et sans base de données (tâche 0) : pas d'adaptateur,
 * pas d'intégration, aucune île interactive. Chaque ligne ajoutée ici est une
 * ligne qui devra tenir sur les vingt-deux sites générés, et qu'aucun d'eux
 * ne pourra corriger — le fichier de contenu est la SEULE chose qui varie
 * d'un prospect à l'autre (§3 du plan).
 *
 * `site` reste absent : chaque déploiement Vercel reçoit son propre domaine,
 * inconnu à l'heure du build du modèle. La tâche 4 le renseignera par
 * variable d'environnement le jour où une balise canonique deviendra utile.
 */
export default defineConfig({
  build: { inlineStylesheets: 'always' },
});
