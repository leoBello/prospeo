import { domainProposalApplies } from './domain-name.js';
import { estUnRefus } from './pipeline.js';
import { assembleFacts, type SiteFacts, type SiteFactsInput } from './site-facts.js';
import type { WebPresenceCategory } from './types.js';

/**
 * Les faits d'un message de vente — et rien d'autre.
 *
 * Même contrat que `SiteFacts`, pour la même raison, à un endroit où l'enjeu
 * est plus vif encore. Un site inexact se corrige avant d'être vu ; un message
 * inexact est lu par l'artisan lui-même, qui connaît son entreprise mieux que
 * nous. Le §10 du spec du socle le dit sans détour : « un message contenant un
 * détail inventé sur l'entreprise se retourne contre l'appelant dans les
 * premières secondes de l'échange. »
 *
 * **Les faits de l'entreprise sont ceux du site, littéralement.** `entreprise`
 * porte un `SiteFacts` entier plutôt qu'une sélection : le seuil sur la note,
 * l'année plutôt que l'ancienneté, l'absence de nombre d'avis — toutes ces
 * décisions sont déjà prises et documentées là-bas. Les redécider ici
 * autoriserait le message à mettre en avant une note de 2,6 que le site,
 * lui, cache.
 *
 * Ce que le message ajoute, ce sont les trois faits qui n'existent qu'à ce
 * stade : le site déployé, la raison pour laquelle on démarche, et le domaine
 * libre.
 */
export interface PitchFacts {
  /** Les faits vérifiés de l'entreprise, tels que le site les emploie. */
  entreprise: SiteFacts;
  /** L'URL en ligne. C'est l'argument, et il n'y en a pas d'autre. */
  urlSite: string;
  /**
   * Pourquoi ce prospect est démarché.
   *
   * Ce n'est pas un détail de contexte : c'est ce qui change le message. À un
   * `none` on explique qu'il est introuvable sur le web ; à un `dead_site` que
   * le site qu'il a ne fonctionne plus. Confondre les deux fait dire au
   * message une chose que l'artisan sait fausse dès la première ligne.
   */
  presenceWeb: Exclude<WebPresenceCategory, 'has_site'>;
  /**
   * Un nom de domaine vérifié libre, ou `null`.
   *
   * « J'ai vérifié, serrurier-untel.fr est libre » est l'argument le plus
   * concret dont dispose ce chantier — et le plus périssable : un domaine
   * libre en septembre peut être déposé en octobre, ce que
   * `DOMAIN_FRESHNESS_DAYS` borne déjà côté `domains`.
   */
  domaineLibre: string | null;
}

/**
 * Les clés de `PitchFacts`, énumérées pour être testables.
 *
 * Même discipline que `SITE_FACT_KEYS`, et même but : ajouter un fait au
 * message oblige à passer par ici, donc à écrire d'où la base le tire.
 */
export const PITCH_FACT_KEYS = ['entreprise', 'urlSite', 'presenceWeb', 'domaineLibre'] as const;

/** Ce que la base fournit : le prospect, son site, sa présence, son statut. */
export interface PitchFactsInput {
  prospect: SiteFactsInput;
  /** Ligne `prospect_site`, ou `null` si le prospect n'en a pas. */
  site: { deploymentUrl: string | null; unpublishedAt: Date | null } | null;
  presenceWeb: WebPresenceCategory | null;
  /** `web_presence.domain_free_name`, renseigné par `domains`. */
  domaineLibre: string | null;
  /** `prospect_pipeline.status`, ou `null` si le prospect n'a jamais été contacté. */
  pipelineStatus: string | null;
}

/**
 * Assemble les faits d'un message, ou `null` si ce prospect ne doit pas en
 * recevoir.
 *
 * Quatre refus, dont l'ordre suit la gravité :
 *
 * 1. **Le prospect a dit non.** `ne_pas_contacter` et `perdu` sortent d'emblée.
 *    Le refus est ici plutôt que dans le filtre SQL de l'appelant parce que ce
 *    que cette fonction ne rend pas ne peut pas atteindre le prompt, quelle que
 *    soit la requête. Un `where` oublié est invisible ; un `null` se compte.
 * 2. **Aucun site en ligne.** Sans URL, il ne reste qu'un démarchage ordinaire.
 *    `unpublishedAt` compte autant que l'absence d'URL : `deployment_url`
 *    survit à la dépublication, et un message écrit sur cette seule colonne
 *    enverrait l'artisan vers une adresse morte.
 * 3. **Le prospect a déjà un site correct.** Cohérence avec le barème, qui
 *    écarte `has_site`.
 * 4. **Les refus de `assembleFacts`** — pas de téléphone, métier inconnu. On
 *    s'appuie dessus plutôt que de refaire la règle : un prospect à qui l'on ne
 *    peut pas faire de site n'a pas de message à recevoir.
 *
 * Rendre `null` plutôt que lever suit `assembleFacts` et `buildScoreRow` :
 * l'appelant compte les prospects écartés et poursuit son lot.
 */
export function assemblePitchFacts(input: PitchFactsInput): PitchFacts | null {
  if (estUnRefus(input.pipelineStatus)) return null;

  const url = input.site?.deploymentUrl ?? null;
  if (url === null || url === '') return null;
  if (input.site?.unpublishedAt != null) return null;

  const presence = input.presenceWeb;
  if (presence === null || presence === 'has_site') return null;

  const entreprise = assembleFacts(input.prospect);
  if (entreprise === null) return null;

  return {
    entreprise,
    urlSite: url,
    presenceWeb: presence,
    // Le nom n'est retenu que si la catégorie autorise encore la proposition.
    // La colonne peut porter un reliquat : `domains` l'a écrit quand le
    // prospect était `none`, une sonde ultérieure l'a reclassé `dead_site`, et
    // la même ligne affirmerait alors qu'il a un site et qu'un domaine
    // l'attend. C'est l'état contradictoire que `domainProposalApplies`
    // documente déjà, tenu ici une seconde fois parce que c'est ici qu'il
    // partirait dans un message.
    domaineLibre: domainProposalApplies(presence) ? input.domaineLibre : null,
  };
}
