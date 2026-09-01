import type { ImageMetadata } from 'astro';

/**
 * Les images du gabarit, découvertes sur le disque plutôt qu'énumérées.
 *
 * **Pourquoi un `glob` et non une liste écrite à la main.** Une liste écrite
 * à la main est une seconde source de vérité : elle peut nommer un fichier
 * absent — et le build échouerait alors sur un message d'import, loin de la
 * cause — ou oublier un fichier présent, qui ne serait jamais servi sans que
 * rien ne le signale. Le dossier EST la liste.
 *
 * Conséquence directe, et c'est la plus utile : le schéma de contenu du
 * gabarit contraint `theme.heros` à ce qui existe RÉELLEMENT dans ce dépôt-ci.
 * `packages/core` valide de son côté contre la liste du métier, mais il valide
 * une intention ; ici on valide une présence. Un contenu qui demande
 * `plomberie-09` fait échouer le build du dépôt du prospect, bruyamment, au
 * lieu de déployer une page dont le héros manque.
 *
 * `eager: true` : les métadonnées d'image doivent être disponibles à la
 * composition du gabarit, qui est synchrone. Cela ne charge aucun pixel — Astro
 * ne travaille que sur les métadonnées, et n'encode une image que lorsqu'un
 * composant la demande à une largeur donnée.
 */
function collecter(modules: Record<string, { default: ImageMetadata }>): Map<string, ImageMetadata> {
  const trouvees = new Map<string, ImageMetadata>();
  for (const [chemin, module] of Object.entries(modules)) {
    // `../assets/heros/plomberie-03.jpg` → `plomberie-03`. Le nom de fichier
    // EST le jeton que le modèle choisit : renommer une image sans changer
    // `trades.ts` casse le build, ce qui est le comportement voulu.
    const code = chemin.split('/').pop()?.replace(/\.[^.]+$/, '');
    if (code !== undefined && code !== '') trouvees.set(code, module.default);
  }
  return trouvees;
}

const HEROS = collecter(
  import.meta.glob<{ default: ImageMetadata }>('../assets/heros/*.{jpg,jpeg,png,webp,avif}', {
    eager: true,
  }),
);

const ETAPES = collecter(
  import.meta.glob<{ default: ImageMetadata }>('../assets/etapes/*.{jpg,jpeg,png,webp,avif}', {
    eager: true,
  }),
);

const GALERIE = collecter(
  import.meta.glob<{ default: ImageMetadata }>('../assets/galerie/*.{jpg,jpeg,png,webp,avif}', {
    eager: true,
  }),
);

/**
 * Les codes de héros que CE dépôt sait afficher.
 *
 * Trié : l'ordre d'un `glob` n'est pas garanti, et un schéma dont
 * l'énumération change d'ordre d'un build à l'autre produit des messages
 * d'erreur qui ne se comparent pas.
 */
export const HEROS_DISPONIBLES: readonly string[] = [...HEROS.keys()].sort();

/** Les trois étapes de la section « notre façon de faire », dans l'ordre. */
export const ETAPES_DISPONIBLES: readonly string[] = [...ETAPES.keys()].sort();

/** Les six vues de la galerie, dans l'ordre. */
export const GALERIE_DISPONIBLE: readonly string[] = [...GALERIE.keys()].sort();

/**
 * L'image de héros d'un code, ou une erreur qui dit quoi faire.
 *
 * Lève plutôt que de rendre `undefined` : un héros manquant laisserait une
 * bande vide en haut d'une page déployée au nom d'une entreprise réelle, et
 * personne ne la verrait avant l'artisan. Le schéma de `contrat.ts` rend ce
 * cas inatteignable ; cette garde couvre l'appel direct.
 */
export function imageHeros(code: string): ImageMetadata {
  const image = HEROS.get(code);
  if (image === undefined) {
    throw new Error(
      `Image de héros « ${code} » absente de src/assets/heros/. ` +
        `Disponibles : ${HEROS_DISPONIBLES.join(', ')}.`,
    );
  }
  return image;
}

export function imageEtape(code: string): ImageMetadata {
  const image = ETAPES.get(code);
  if (image === undefined) {
    throw new Error(`Image d’étape « ${code} » absente de src/assets/etapes/.`);
  }
  return image;
}

export function imageGalerie(code: string): ImageMetadata {
  const image = GALERIE.get(code);
  if (image === undefined) {
    throw new Error(`Image de galerie « ${code} » absente de src/assets/galerie/.`);
  }
  return image;
}
