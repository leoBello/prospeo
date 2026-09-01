import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { pitchRedactionJsonSchema, siteRedactionJsonSchema, type Trade } from '@prospeo/core';
import { MODEL, type GenerateDeps, type Usage } from '../stages/generate.js';
import type { PitchDeps } from '../stages/pitch.js';

/**
 * Plafond de sortie.
 *
 * La réponse tient en trois champs dont le plus long est plafonné à 400
 * caractères : quelques centaines de jetons suffisent. On laisse néanmoins de
 * la marge pour la réflexion adaptative, qui consomme des jetons de sortie et
 * dont le volume n'est pas prévisible. Un plafond trop bas tronquerait la
 * réponse en plein milieu et coûterait un second appel entier.
 */
const MAX_TOKENS = 8000;

/**
 * Le client de rédaction, seul point de l'étage qui sorte sur le réseau.
 *
 * Il est isolé ici pour que `runGenerate` — donc toute la logique de
 * validation, de rejet et de comptage — s'éprouve sans clé d'API et sans
 * appel. C'est le même parti que `DomainDeps` dans `domains.ts` et que
 * l'injection de `fetch` dans `github.ts`.
 */
export interface RedacteurOptions extends AppelOptions {
  trade: Trade;
}

/**
 * Options communes aux deux rédacteurs.
 *
 * `trade` n'y figure pas : il ne concerne que le site, dont le schéma de
 * sortie énumère les prestations du métier. Le message, lui, n'en a aucun
 * besoin — ce qui lui vaut une unique entrée de cache pour tout le lot.
 */
export interface AppelOptions {
  apiKey: string;
  /**
   * Workspace auquel la clé est rattachée.
   *
   * Une clé créée dans un Workspace dédié — ce que fait `.env.example` pour
   * pouvoir lui fixer un plafond de dépense — est « identity-linked » : l'API
   * REFUSE toute requête qui ne dit pas dans quel workspace elle agit, avec
   * un 400 explicite. Ce n'est donc pas une option de confort.
   *
   * Le SDK sait lire `ANTHROPIC_WORKSPACE_ID`, mais seulement par le chemin
   * des profils de configuration — pas quand on lui passe une clé
   * directement, ce que fait le collector. On pose donc l'en-tête nous-mêmes.
   */
  workspaceId?: string | undefined;
  /** Injectable pour les tests ; le SDK réel par défaut. */
  client?: Pick<Anthropic['messages'], 'parse'>;
}

/**
 * La fabrique commune : un appel structuré, contraint par un JSON Schema.
 *
 * Les deux étages qui appellent le modèle ne diffèrent que par ce schéma.
 * Tout le reste — point de césure du cache, réflexion adaptative, en-tête de
 * workspace, relevé des quatre compteurs — est identique, et le recopier
 * laisserait les deux chemins diverger sur des détails qui ne se voient que
 * sur une facture.
 */
function creerAppel(
  options: AppelOptions,
  schemaSortie: Record<string, unknown>,
): (systeme: string, utilisateur: string) => Promise<{ redaction: unknown; usage: Usage }> {
  const messages = options.client ?? new Anthropic({ apiKey: options.apiKey }).messages;

  // Absent plutôt que vide : un en-tête `anthropic-workspace-id` creux serait
  // envoyé et rejeté, là où son absence laisse passer une clé qui n'est
  // rattachée à aucun workspace.
  const enTetes =
    options.workspaceId === undefined || options.workspaceId === ''
      ? undefined
      : { 'anthropic-workspace-id': options.workspaceId };

  return async (systeme, utilisateur) => {
    const reponse = await messages.parse(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,

        // La tâche demande du jugement rédactionnel : quelles prestations
        // mettre en avant, comment tourner une accroche qui ne promet rien.
        // `adaptive` laisse le modèle décider de la profondeur, plutôt que de
        // lui imposer un budget qui serait tantôt gâché, tantôt trop court.
        thinking: { type: 'adaptive' },

        // Les consignes vont dans `system`, avec le point de césure du cache
        // à leur fin. Elles sont identiques d'un prospect à l'autre et forment
        // l'essentiel des jetons d'entrée ; les faits, qui tiennent en dix
        // lignes, passent APRÈS dans le message utilisateur.
        //
        // L'ordre de rendu est `tools` → `system` → `messages`, et le cache
        // est un appariement de PRÉFIXE : tout ce qui varie doit venir après
        // le dernier point de césure, sans quoi le cache est manqué à chaque
        // appel — silencieusement, la réponse restant correcte.
        system: [{ type: 'text', text: systeme, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: utilisateur }],

        // Sorties structurées contre le contrat de `packages/core`, dans son
        // encodage JSON Schema. Le helper `zodOutputFormat` du SDK n'accepte
        // que des schémas `zod/v4` ; ce dépôt est écrit contre l'API classique
        // de zod 3, et la convertir partout pour un seul appel serait un
        // chantier sans rapport avec celui-ci.
        //
        // Les deux encodages dérivent des mêmes constantes et un test de
        // `packages/core` les compare, si bien que l'API contraint à
        // l'écriture exactement ce que zod validera à la lecture.
        output_config: { format: jsonSchemaOutputFormat(schemaSortie as never) },
      },
      enTetes === undefined ? undefined : { headers: enTetes },
    );

    // `parsed_output` vaut `null` quand l'analyse a échoué. On rend l'objet
    // brut plutôt que de lever : l'étage porte déjà la validation et le
    // comptage des rejets, et c'est lui qui doit décider — un `throw` ici
    // ferait compter l'incident comme une panne réseau.
    return { redaction: reponse.parsed_output ?? null, usage: lireUsage(reponse.usage) };
  };
}

export function createRedacteur(options: RedacteurOptions): GenerateDeps {
  return { rediger: creerAppel(options, siteRedactionJsonSchema(options.trade)) };
}

/**
 * Le rédacteur des messages de vente (tâche 5).
 *
 * Aucun métier en paramètre, et c'est ce qui fait toute la différence de coût :
 * les consignes du message sont les mêmes pour tout le monde, donc une seule
 * écriture de cache couvre le lot entier, là où le site en réclame une par
 * métier.
 */
export function createPitchRedacteur(options: AppelOptions): PitchDeps {
  return { rediger: creerAppel(options, pitchRedactionJsonSchema()) };
}

/**
 * Les jetons consommés, dans la forme que le rapport additionne.
 *
 * Les trois formes d'entrée sont relevées SÉPARÉMENT parce qu'elles sont
 * facturées séparément : entrée de base, écriture de cache à 1,25x, lecture
 * de cache à 0,1x. Les additionner rendrait le rapport incapable de dire ce
 * qu'un run a réellement coûté, ce que le §4 du plan exige.
 *
 * `cache_read_input_tokens` a de surcroît une valeur de diagnostic : un
 * compteur qui reste à zéro d'un appel à l'autre signale un invalidateur
 * silencieux dans les consignes.
 */
function lireUsage(usage: {
  input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  output_tokens?: number | null;
}): Usage {
  return {
    input: usage.input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
  };
}
