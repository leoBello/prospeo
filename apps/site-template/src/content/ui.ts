/**
 * Les textes fixes du gabarit — tout ce qui ne varie PAS d'un prospect à
 * l'autre.
 *
 * Deux fichiers de contenu, et la frontière entre les deux est le sujet :
 *
 * - `site.json` porte ce qui est propre à une entreprise. Il est produit par
 *   la chaîne (faits assemblés depuis la base + rédaction du modèle), écrit
 *   dans le dépôt du prospect, et relu par un humain avant l'envoi.
 * - `ui.ts` — ce fichier — porte le vocabulaire du gabarit lui-même :
 *   « Appeler », « Nos prestations », « Mentions légales ». Il est identique
 *   sur les vingt-deux sites.
 *
 * Mettre ces libellés dans le fichier généré serait une faute : le modèle
 * pourrait alors récrire le bouton d'appel, et la revue humaine devrait
 * vérifier à chaque prospect des mots qui n'avaient aucune raison de changer.
 * Les laisser dans les `.astro` en serait une autre, symétrique : ils
 * échapperaient à toute relecture et s'imprimeraient à l'identique et sans
 * contrôle sur vingt-deux sites portant le nom d'entreprises réelles.
 *
 * Le format reprend celui de `apps/dashboard/src/i18n/fr.ts`, dont le spec du
 * socle dit explicitement que la discipline servait « à valider le format
 * qu'on emploiera pour les sites générés ». La différence : une seule locale.
 * Le site s'adresse aux clients d'un artisan nantais, qui parlent français ;
 * une locale anglaise serait du travail sans lecteur.
 */
export const ui = {
  'demo.banner': 'Maquette réalisée pour {entreprise} — site de démonstration, non commandé.',
  'demo.aria': 'Avertissement : site de démonstration',

  'cta.call': 'Appeler',
  /*
   * L'ordre des mots n'est pas indifférent : le texte VISIBLE doit se
   * retrouver tel quel dans le libellé accessible.
   *
   * « Appeler {nom} au {telephone} » ne contenait pas « Appeler 06 02 00 23 60 »,
   * qui est ce qu'on lit sur le bouton du héros. Lighthouse le signale
   * (`label-content-name-mismatch`), et la conséquence est concrète : une
   * personne qui pilote son navigateur à la voix prononce ce qu'elle VOIT, et
   * la commande ne trouve pas sa cible. C'est le bouton d'appel — le seul
   * élément du site dont l'échec coûte quelque chose.
   *
   * Le nom passe donc APRÈS le numéro : les trois boutons de la page —
   * « Appeler », « 06 02 00 23 60 », « Appeler 06 02 00 23 60 » — sont alors
   * tous contenus dans ce libellé.
   */
  'cta.callAria': 'Appeler {telephone}, {nom}',

  'hero.trade': '{metier} à {ville}',
  'hero.tradeSince': '{metier} à {ville} depuis {annee}',

  'section.services': 'Nos prestations',
  'section.contact': 'Nous contacter',
  'section.legal': 'Mentions légales',

  'contact.phone': 'Téléphone',
  'contact.address': 'Adresse',
  'contact.maps': 'Voir sur Google Maps',

  // « 4,6 sur 5 sur Google » répète « sur » deux fois et se lit mal. La barre
  // oblique est la forme usuelle d'une note, et elle tient sur une ligne de
  // téléphone.
  'rating.value': '{note} / 5 sur Google',

  'legal.publisher': 'Éditeur du site',
  'legal.company': 'Entreprise représentée',
  'legal.siret': 'SIRET',
  'legal.notice':
    'Ce site est une proposition commerciale non sollicitée, réalisée à partir ' +
    "d'informations publiques (base Sirene de l'INSEE et fiche Google Maps). Il " +
    "n'est ni commandé ni approuvé par l'entreprise représentée. Pour en demander " +
    'la modification ou le retrait immédiat, écrivez à {contact}.',
  'legal.sources': 'Sources : base Sirene (INSEE) et fiche Google Maps de l’établissement.',

  // --- En-tête et navigation ------------------------------------------------
  'nav.skip': 'Aller au contenu',
  'nav.aria': 'Navigation principale',
  'nav.services': 'Prestations',
  'nav.method': 'Notre façon de faire',
  'nav.area': 'Zone d’intervention',
  'nav.contact': 'Contact',

  // --- Héros ----------------------------------------------------------------
  'hero.secondary': 'Voir les prestations',
  /*
   * Le texte alternatif du héros dépend de l'image choisie par le modèle.
   *
   * Il décrit ce que la photographie MONTRE, et jamais ce qu'elle prouverait
   * sur l'entreprise. « L'équipe de Dos-Services au travail » serait une
   * affirmation que la base ne porte pas, lue à voix haute par un lecteur
   * d'écran sur le site d'une entreprise réelle — et ce sont des images de
   * banque, identiques sur tous les sites (niveau 2 de D7).
   */
  'hero.alt.plomberie-01': 'Bec de cuivre courbé, une goutte au bord',
  'hero.alt.plomberie-02': 'Salle d’eau terminée, carrelage pierre et miroir rond',
  'hero.alt.plomberie-03': 'Outils et boulons posés sur un établi',
  'hero.alt.plomberie-04': 'Mitigeur en inox brossé sur une vasque blanche',
  'hero.alt.plomberie-05': 'Faisceau de tubes de cuivre et de gaines',
  'hero.alt.plomberie-06': 'Deux tubes de cuivre neufs dans une cloison ouverte',
  'hero.alt.plomberie-07': 'Salle de bain claire avec une baignoire îlot',
  'hero.alt.plomberie-08': 'Conduite rouge le long d’un mur de béton',

  // --- Bandeau de confiance -------------------------------------------------
  //
  // Trois puces, et chacune tombe SEULE. Mesure du 2 septembre 2026 sur les 37
  // prospects éligibles : ville et année pour les 37, note pour 26. C'est donc
  // la note qui manque, et elle manque onze fois.
  'trust.city': 'Basé à {ville}',
  'trust.since': 'En activité depuis {annee}',

  // --- Prestations ----------------------------------------------------------
  'services.eyebrow': 'Ce que nous faisons',
  'services.intro':
    'Chaque intervention est décrite telle qu’elle se déroule, sans promesse de ' +
    'délai ni de tarif.',

  // --- Notre façon de faire (contenu illustratif, niveau 2) -----------------
  //
  // Ce bloc est IDENTIQUE sur tous les sites et n'affirme rien de particulier
  // sur l'entreprise : il décrit la façon dont se passe une intervention chez
  // n'importe quel artisan joignable au téléphone. Chaque phrase a été relue
  // sous cette contrainte — aucune ne parle de délai, d'effectif ni de
  // qualification, qui sont parmi les familles que la base ignore.
  'method.eyebrow': 'Notre façon de faire',
  'method.title': 'Trois temps, et une seule personne',
  'method.intro': 'Du premier appel à la fin du chantier, vous avez le même interlocuteur.',
  'method.step': 'Étape {rang}',
  'method.step1.title': 'Vous appelez',
  'method.step1.text':
    'Vous décrivez la situation au téléphone. C’est l’artisan qui répond, pas un standard.',
  'method.step1.alt': 'Mur d’outils rangés dans un atelier',
  'method.step2.title': 'Le point est fait sur place',
  'method.step2.text':
    'Le déplacement sert à constater, à mesurer, et à vous dire ce que le chantier suppose.',
  'method.step2.alt': 'Équerre, niveau et règles accrochés au mur',
  'method.step3.title': 'Le chantier est mené',
  'method.step3.text':
    'Le travail est fait, les lieux sont rendus propres, et vous savez à qui vous adresser ensuite.',
  'method.step3.alt': 'Douche terminée, carrelage posé',

  // --- En images ------------------------------------------------------------
  'gallery.eyebrow': 'En images',
  'gallery.title': 'Le métier, en images',
  /*
   * La légende dit explicitement que ce sont des images d'illustration.
   *
   * Sans elle, six photographies sous le titre « en images » se lisent comme un
   * portfolio — c'est-à-dire comme une affirmation sur des chantiers que cette
   * entreprise-ci aurait réalisés. La base n'en sait rien, et D7 range cette
   * affirmation au niveau 3, celui des interdits. Une ligne suffit à séparer
   * illustrer de prétendre.
   */
  'gallery.intro': 'Images d’illustration du métier, et non des chantiers de l’entreprise.',
  'gallery.alt': 'Illustration du métier, vue {rang} sur {total}',

  // --- Avis -----------------------------------------------------------------
  'reviews.eyebrow': 'Avis',
  'reviews.title': 'La note publique sur Google',
  'reviews.outOf': 'sur 5',
  'reviews.source': 'Note publiée sur la fiche Google de l’établissement.',
  'reviews.link': 'Voir la fiche sur Google Maps',
  'reviews.starsAria': 'Note de {note} sur 5',

  // --- Zone d'intervention --------------------------------------------------
  'area.eyebrow': 'Zone d’intervention',
  'area.title': 'Où nous trouver',
  'area.intro': 'L’atelier est à {ville}. Le point ci-dessous est l’adresse déclarée.',
  'area.mapAria': 'Carte situant {nom} à {ville}',
  'area.marker': '{nom}, {rue}',

  // --- Questions fréquentes (niveau 2) --------------------------------------
  'faq.eyebrow': 'Questions fréquentes',
  'faq.title': 'Ce qu’on nous demande souvent',
  'faq.q1': 'Comment se passe une première prise de contact ?',
  'faq.a1':
    'Par téléphone. Vous décrivez ce qui se passe, et l’artisan convient avec vous du ' +
    'moment de son passage.',
  'faq.q2': 'Intervenez-vous en rénovation comme en dépannage ?',
  'faq.a2':
    'Les deux. Le détail de ce qui est pris en charge figure dans la section « nos ' +
    'prestations », plus haut sur cette page.',
  'faq.q3': 'Comment obtenir un chiffrage ?',
  /*
   * La réponse ne promet NI gratuité NI délai, et c'est délibéré.
   *
   * « Devis gratuit sous 24 h » est la phrase que porte toute vitrine
   * d'artisan, et c'est exactement pourquoi elle ne peut pas figurer ici : la
   * base ne sait ni si cet artisan facture ses déplacements, ni sous quel délai
   * il répond. Le prompt l'interdit au modèle ; il serait absurde que le
   * gabarit l'écrive à sa place.
   */
  'faq.a3':
    'Le chiffrage se discute directement avec l’artisan, une fois qu’il a vu ce qu’il y ' +
    'a à faire.',

  // --- Contact --------------------------------------------------------------
  'contact.eyebrow': 'Contact',
  /*
   * D8, dit à voix haute plutôt que passé sous silence.
   *
   * L'absence de formulaire est le manque qu'un artisan remarque en premier —
   * c'est le formulaire qu'il croit acheter. L'expliquer en une ligne vaut
   * mieux que de laisser un trou : nous n'avons pas son adresse, et un
   * formulaire qui avalerait une vraie demande client serait un dommage
   * concret causé à quelqu'un qui n'a rien demandé.
   */
  'contact.noForm':
    'Cette page ne porte pas de formulaire : elle n’est pas reliée à la messagerie de ' +
    'l’entreprise, et une demande envoyée depuis ici ne serait lue par personne. Le ' +
    'téléphone est le seul moyen de contact.',
} as const;

export type UiKey = keyof typeof ui;

/**
 * Cette clé existe-t-elle ?
 *
 * Un seul appelant : le texte alternatif du héros, dont la clé est CONSTRUITE
 * à partir du code d'image choisi par le modèle (`hero.alt.plomberie-03`).
 * C'est le seul endroit du gabarit où une clé ne soit pas écrite en toutes
 * lettres, et donc le seul où elle puisse manquer — si quelqu'un dépose un
 * fichier dans `src/assets/heros/` sans ajouter la ligne correspondante ici.
 *
 * Le repli vaut mieux que l'alternative. `t()` laisserait passer une clé
 * inconnue jusqu'à `ui[cle]` valant `undefined`, et un lecteur d'écran
 * prononcerait « undefined » sur la plus grande image d'une page publiée au
 * nom d'une entreprise réelle.
 */
export function estCleUi(valeur: string): valeur is UiKey {
  return Object.hasOwn(ui, valeur);
}

/*
 * L'identité de l'éditeur ne vit PAS ici.
 *
 * Elle est dans `packages/core` (`EDITEUR`) et voyage dans le fichier de
 * contenu, sous la clé `editeur`. La raison est mécanique : `publish` doit
 * pouvoir refuser de créer un dépôt tant qu'elle n'est pas renseignée, et
 * `publish` ne lit pas les sources du gabarit. La valeur et son garde-fou
 * doivent être du même côté — sinon le garde-fou n'en est pas un.
 */

/**
 * Remplace les jetons `{nom}` par les paramètres fournis.
 *
 * Un paramètre absent laisse le jeton en place, exactement comme
 * `apps/dashboard/src/i18n/translate.ts` : substituer une chaîne vide
 * donnerait « Plombier à  depuis  », une phrase qui a l'air d'un défaut de
 * mise en page et que personne ne signale. Le jeton intact, lui, désigne sa
 * propre cause — et sur un site déployé chez un artisan, on préfère un défaut
 * qui se voit à un défaut qui se lit.
 */
export function t(cle: UiKey, params: Record<string, string | number> = {}): string {
  return ui[cle].replace(/\{(\w+)\}/g, (jeton, nom: string) => {
    const valeur = params[nom];
    return valeur === undefined ? jeton : String(valeur);
  });
}

/**
 * Met un nombre à la française : 4.6 → « 4,6 ».
 *
 * Un point décimal sur la vitrine d'un artisan nantais signale un site
 * fabriqué ailleurs — exactement l'impression que la chaîne cherche à éviter.
 * `toLocaleString` avec une locale explicite plutôt que la locale du système :
 * le build tourne sur une machine de développement puis chez Vercel, et rien
 * ne garantit que les deux soient réglées en français.
 */
export function nombreFr(valeur: number): string {
  return valeur.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
