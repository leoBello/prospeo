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
  'cta.callAria': 'Appeler {nom} au {telephone}',

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
} as const;

export type UiKey = keyof typeof ui;

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
