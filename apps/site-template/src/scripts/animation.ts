import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Les apparitions au défilement — GSAP et ScrollTrigger (D1).
 *
 * **En dépendance locale, jamais en CDN.** Les vingt-deux dépôts se
 * construisent sur Vercel : un `<script src="https://cdn...">` ajouterait une
 * dépendance d'exécution tierce, une requête vers un tiers depuis la page
 * d'une entreprise réelle, et une panne possible qu'aucun de nos tests ne
 * verrait. Vite empaquette ici ce qui est réellement importé.
 *
 * **Pourquoi GSAP et non Framer Motion.** Framer Motion réclame React :
 * l'ajouter à un site sans le moindre état interactif coûterait une île
 * d'hydratation et une quarantaine de kilo-octets pour de la décoration pure.
 * GSAP est agnostique du framework.
 *
 * **Quatre gestes, pas un de plus.** L'animation dispersée est exactement ce
 * qui fait « site fabriqué à la chaîne » ; un seul enchaînement orchestré à
 * l'ouverture vaut mieux que dix effets au survol.
 */

/**
 * L'état de départ est posé ICI, et jamais en CSS.
 *
 * Une règle `.apparition { opacity: 0 }` en attente d'un script laisserait une
 * page BLANCHE si le script ne s'exécute jamais — paquet non chargé, erreur
 * d'exécution, navigateur ancien. Sur le site d'une entreprise réelle dont
 * l'URL vient de partir dans un email, c'est le pire mode de panne possible :
 * silencieux, total, et découvert par l'artisan.
 *
 * En le posant depuis JavaScript, l'absence de JavaScript rend simplement la
 * page telle qu'elle est écrite. C'est la dégradation dans le bon sens.
 */
const DEPART = { opacity: 0, y: 26 } as const;

export function initAnimations(): void {
  /*
   * L'interrupteur, et il coupe TOUT.
   *
   * `gsap.matchMedia()` avec la condition inverse — on n'entre dans le bloc
   * que si le visiteur n'a PAS demandé de réduire les animations. Sous
   * `prefers-reduced-motion: reduce`, aucune animation n'est instanciée, aucun
   * `gsap.set` n'est appelé, aucun ScrollTrigger n'est créé : les éléments
   * restent exactement tels que le HTML les décrit.
   *
   * Ce n'est pas la même chose que de mettre les durées à zéro. Une durée
   * nulle laisse quand même l'état de départ être posé, ce qui produit un
   * clignotement ; et ScrollTrigger continuerait d'écouter le défilement pour
   * rien. La garde est ici, en amont, plutôt qu'à l'intérieur de chaque tween.
   *
   * `matchMedia` et non un simple `window.matchMedia(...).matches` : GSAP
   * réévalue la condition si le réglage système change en cours de session, et
   * défait proprement ce qu'il avait posé.
   */
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ ease: 'power2.out' });

    /*
     * 1. L'ouverture du héros.
     *
     * `gsap.from` et non `set` puis `to` : l'élément est au-dessus de la ligne
     * de flottaison, et `from` pose l'état de départ dans le même tour de
     * boucle que le démarrage de l'animation. Un `set` séparé laisserait une
     * image peinte avant que l'animation ne commence.
     *
     * Pas de ScrollTrigger : le héros est visible d'emblée, il n'y a rien à
     * attendre.
     */
    const entree = document.querySelectorAll('.apparition-hero');
    if (entree.length > 0) {
      gsap.from(entree, { ...DEPART, y: 18, duration: 0.7, stagger: 0.08 });
    }

    /*
     * 2. Les cartes, étapes et vues de galerie.
     *
     * `ScrollTrigger.batch` regroupe les éléments qui entrent dans le champ au
     * même moment et les anime d'un seul geste en cascade. Une instance par
     * élément animée séparément produirait des cascades qui se chevauchent
     * dès qu'une rangée entière apparaît d'un coup — ce qui est le cas sur
     * écran large, où les trois cartes sont sur la même ligne.
     *
     * `once: true` : l'animation ne se rejoue pas en remontant. Une page qui
     * se réanime à chaque passage fatigue et donne l'impression d'un site qui
     * n'a pas fini de charger.
     */
    // `.apparition` seulement — le héros porte `.apparition-hero`, et une
    // classe distincte vaut mieux qu'un `:not()` : les deux gestes ne doivent
    // pas se disputer les mêmes éléments, et un sélecteur d'exclusion se serait
    // désaccordé au premier déplacement de composant.
    const lots = document.querySelectorAll('main .apparition');
    if (lots.length > 0) {
      gsap.set(lots, DEPART);
      ScrollTrigger.batch(lots, {
        start: 'top 88%',
        once: true,
        onEnter: (elements) => {
          gsap.to(elements, {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.09,
            // `overwrite` : si deux lots se recouvrent — un défilement rapide
            // au clavier, par exemple — le second geste remplace le premier au
            // lieu de lutter contre lui et de figer un élément à mi-course.
            overwrite: true,
            // `clearProps` rend la main au CSS une fois l'animation finie :
            // sans lui, GSAP laisse un `transform` et une `opacity` en style
            // en ligne, qui empêchent l'agrandissement au survol de la galerie.
            clearProps: 'opacity,transform',
          });
        },
      });
    }

    /*
     * 3. Le chiffre de la note.
     *
     * Le seul détail gratuit de la page, et il est mérité : ce chiffre est le
     * fait le plus vendeur dont on dispose, et le seul qui soit vérifiable en
     * un clic. Il compte de zéro à sa valeur.
     *
     * La valeur d'arrivée est LUE dans le DOM, jamais passée par le script :
     * elle a déjà été mise en forme à la française par `nombreFr`, et la
     * recomposer ici ferait apparaître « 4.6 » sur la vitrine d'un artisan
     * nantais le temps de l'animation.
     */
    const valeur = document.querySelector<HTMLElement>('.valeur');
    const note = Number(valeur?.textContent?.replace(',', '.'));
    if (valeur !== null && Number.isFinite(note)) {
      const compteur = { n: 0 };
      gsap.to(compteur, {
        n: note,
        duration: 1.1,
        scrollTrigger: { trigger: valeur, start: 'top 85%', once: true },
        onUpdate: () => {
          valeur.textContent = compteur.n.toLocaleString('fr-FR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          });
        },
      });
    }

    /*
     * Le retour de `matchMedia` est le nettoyage.
     *
     * Appelé quand la condition cesse d'être vraie — c'est-à-dire quand le
     * visiteur active la réduction d'animations en cours de session. `revert`
     * défait les tweens ; les ScrollTriggers créés dans ce contexte sont tués
     * par GSAP lui-même.
     */
    return () => {
      gsap.set('.apparition, .apparition-hero', { clearProps: 'opacity,transform' });
    };
  });
}
