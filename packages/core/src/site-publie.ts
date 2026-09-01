import type { SiteFacts } from './site-facts.js';
import type { SiteRedaction } from './site-content.js';
import type { SiteTheme } from './site-theme.js';
import type { Prestation, Trade } from './types.js';

/**
 * L'identité de l'éditeur des sites générés.
 *
 * **Ce n'est pas l'artisan.** Les sites portent le nom d'entreprises réelles
 * et sont publiés sans leur accord (D5) ; attribuer l'édition à l'artisan
 * serait faux et le rendrait responsable d'une page qu'il n'a pas écrite. Le
 * §11 conformité impose de nommer le véritable éditeur.
 *
 * `contact` n'est pas décoratif : c'est le **mécanisme d'opposition**. Un
 * artisan qui ne veut pas de cette page doit pouvoir en demander le retrait
 * depuis la page elle-même, sans enquêter sur qui l'a publiée. La demande
 * alimente le statut `ne_pas_contacter`, que D5 fait suivre d'une
 * dépublication immédiate.
 *
 * Elle vit ici, et non dans le gabarit, pour une raison mécanique : `publish`
 * doit pouvoir REFUSER de créer un dépôt tant qu'elle n'est pas renseignée, et
 * `publish` ne lit pas les sources du gabarit. La valeur et son garde-fou
 * doivent être du même côté.
 */
export const EDITEUR = {
  nom: 'Léo Bello',
  contact: 'leobello.wd@gmail.com',
} as const;

export interface Editeur {
  nom: string;
  contact: string;
}

/**
 * L'éditeur est-il réellement renseigné ?
 *
 * Appelée par `publish` (tâche 3), qui refuse de créer un dépôt quand elle
 * rend `false`. Le contrôle est placé là plutôt que dans un test du gabarit :
 * un build local rouge se contourne, une publication refusée non — et c'est
 * la publication, pas le build, qui expose une page au monde.
 */
export function editeurRenseigne(editeur: Editeur = EDITEUR): boolean {
  if (editeur.nom.trim() === '' || editeur.nom.includes('RENSEIGNER')) return false;
  const contact = editeur.contact.trim();
  // Volontairement grossier : on vérifie qu'une adresse a la forme d'une
  // adresse, pas qu'elle existe. Le seul cas qu'il faut fermer est celui de
  // la valeur d'attente laissée en place — `example.com` est réservé par la
  // RFC 2606 précisément pour cet usage, donc jamais joignable.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) return false;
  return !contact.endsWith('example.com');
}

/**
 * Le fichier de contenu tel qu'il est écrit dans le dépôt du prospect.
 *
 * **Distinct de `SiteContent`, et la distinction est structurelle.**
 * `SiteContent` décrit ce qui circule DANS le monorepo, où `@prospeo/core`
 * est disponible : les prestations y sont des codes, que `trades.ts` résout.
 * `ContenuPublie` décrit ce qui part dans un dépôt GitHub autonome, que Vercel
 * construira sans rien connaître de ce monorepo — un `"@prospeo/core":
 * "workspace:*"` y ferait échouer l'installation avant même le build.
 *
 * Les prestations y arrivent donc **déjà résolues**. Le gabarit n'a plus
 * besoin de la liste close : elle a joué son rôle en amont, au moment où le
 * modèle a dû choisir dedans. La garantie « pas de prestation inventée » est
 * acquise à la génération, pas au rendu.
 *
 * Les deux formes se suivent sans se dupliquer : `SiteContent` est ce que le
 * modèle remplit, `ContenuPublie` est ce que le monde lit.
 */
export interface ContenuPublie {
  version: { schema: string; promptVersion: string; model: string };
  editeur: Editeur;
  faits: SiteFacts;
  /**
   * Ce que le modèle a produit, résolu.
   *
   * Les prestations sont regroupées ici bien que leurs libellés viennent du
   * code : c'est leur **choix et leur ordre** qui viennent du modèle, et c'est
   * donc ici qu'un relecteur doit regarder pour voir ce qu'une génération a
   * décidé.
   */
  redaction: {
    accroche: string;
    presentation: string;
    prestations: Prestation[];
    /**
     * La variante visuelle, sous forme de jetons et non de valeurs.
     *
     * `cuivre` reste `cuivre` : les couleurs, les familles de police et les
     * fichiers d'image vivent dans le gabarit, qui est copié dans le dépôt du
     * prospect et n'a besoin de personne pour les connaître.
     *
     * Faire voyager des hexadécimaux à la place rouvrirait ce que D6 ferme.
     * Un fichier de contenu porteur de couleurs est un fichier qu'une
     * génération — ou une main dans le dépôt du prospect — peut rendre
     * illisible sans qu'aucun schéma ne s'en aperçoive, sur une page qui
     * porte le nom d'une entreprise réelle.
     */
    theme: SiteTheme;
  };
}

/**
 * Assemble le fichier qui sera écrit dans le dépôt du prospect.
 *
 * Aucune validation ici : les faits sortent de `assembleFacts`, la rédaction
 * a été validée contre `siteRedactionSchema` à la sortie du modèle. Cette
 * fonction se contente de les rapprocher — et de résoudre les codes, seule
 * opération qui puisse échouer.
 */
export function composerContenuPublie(
  faits: SiteFacts,
  redaction: SiteRedaction,
  trade: Trade,
  version: ContenuPublie['version'],
): ContenuPublie {
  const prestations = redaction.prestations.map((code) => {
    const trouvee = trade.prestations.find((p) => p.code === code);
    if (trouvee === undefined) {
      throw new Error(
        `Prestation « ${code} » inconnue du métier « ${trade.slug} ». ` +
          'La liste close vit dans packages/core/src/trades.ts.',
      );
    }
    return trouvee;
  });

  return {
    version,
    editeur: { ...EDITEUR },
    faits,
    redaction: {
      accroche: redaction.accroche,
      presentation: redaction.presentation,
      prestations,
      theme: redaction.theme,
    },
  };
}
