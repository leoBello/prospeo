import {
  getTrade,
  siteContentSchema,
  verifierCoherence,
  type Prestation,
  type SiteContent,
} from '@prospeo/core';

/**
 * Valide le fichier de contenu, ou fait échouer le build.
 *
 * C'est la contrepartie exacte de la promesse du §3 du plan — « aucune
 * génération ne peut casser un build » — et elle ne tient que si l'inverse est
 * vrai aussi : un contenu invalide doit s'arrêter ICI, bruyamment, plutôt que
 * de rendre une page où le téléphone manque. Cette page-là serait déployée,
 * son URL partirait dans un email, et c'est l'artisan qui découvrirait le
 * défaut.
 *
 * Le même schéma sert trois fois, et c'est délibéré : il valide la réponse du
 * modèle (tâche 2), il décrit le fichier écrit dans le dépôt (tâche 3), et il
 * garde l'entrée du build (ici). Un seul schéma, donc une seule vérité — un
 * second, recopié dans le gabarit, divergerait au premier changement et
 * laisserait passer précisément ce que le premier refuse.
 */
export function chargerContenu(brut: unknown): SiteContent {
  const slug = (brut as { faits?: { metier?: { slug?: unknown } } })?.faits?.metier?.slug;
  if (typeof slug !== 'string') {
    throw new Error(
      'Fichier de contenu illisible : `faits.metier.slug` est absent. ' +
        'Le schéma dépend du métier — sans lui, rien ne peut être validé.',
    );
  }

  const trade = getTrade(slug);
  if (trade === undefined) {
    throw new Error(
      `Métier inconnu : « ${slug} ». Les métiers connus vivent dans ` +
        'packages/core/src/trades.ts, avec leur liste close de prestations.',
    );
  }

  const parsed = siteContentSchema(trade).safeParse(brut);
  if (!parsed.success) {
    // Le détail des champs fautifs, et pas seulement « contenu invalide » :
    // ce message s'affichera dans un journal de build Vercel, loin de la
    // machine qui a produit le fichier.
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(racine)'} : ${i.message}`)
      .join('\n');
    throw new Error(`Fichier de contenu invalide :\n${details}`);
  }

  // Le schéma valide la FORME ; il ne peut rien dire de la prose. Un contenu
  // parfaitement conforme peut annoncer « depuis 2005 » sur une entreprise
  // créée en 2009, et c'est cette page-là qui serait déployée puis envoyée à
  // l'artisan. La vérification de cohérence est donc à la même hauteur que la
  // validation : bloquante, et au build.
  const ecarts = verifierCoherence(parsed.data);
  if (ecarts.length > 0) {
    const details = ecarts.map((e) => `  - ${e.champ} : ${e.message}`).join('\n');
    throw new Error(
      `La rédaction avance des faits que la base ne porte pas :\n${details}\n` +
        'Régénérer le contenu plutôt que de corriger à la main : le prompt est en cause.',
    );
  }
  return parsed.data;
}

/**
 * Les prestations retenues, dans l'ordre choisi par le modèle, résolues en
 * libellés.
 *
 * Le fichier de contenu ne porte que des `code`. `label` et `description`
 * viennent de `trades.ts` et vont à l'écran sans jamais passer par le modèle :
 * c'est ce qui rend structurellement impossible qu'un site annonce une
 * prestation inventée, plutôt que de le rendre seulement improbable.
 *
 * L'ordre, lui, est le seul degré de liberté laissé au modèle — et il compte,
 * puisque la première carte est celle qu'on lit.
 */
export function prestationsRetenues(contenu: SiteContent): Prestation[] {
  const trade = getTrade(contenu.faits.metier.slug);
  if (trade === undefined) return [];
  return contenu.redaction.prestations.flatMap((code) => {
    const trouvee = trade.prestations.find((p) => p.code === code);
    // Injoignable après validation — le schéma n'accepte que ces codes — mais
    // `find` rend `Prestation | undefined` et `noUncheckedIndexedAccess` est
    // actif : `flatMap` écarte le cas sans qu'une assertion mente au lecteur.
    return trouvee === undefined ? [] : [trouvee];
  });
}
