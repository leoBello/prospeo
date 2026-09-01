import type { ProspectView } from './prospect.js';
import { isScoreStale } from './score.js';

/**
 * Ce que la base affirme, et qu'une autre table de la base dément.
 *
 * Le dashboard lit des tables alimentées par des étages indépendants qui ne
 * tournent pas au même moment. `classify` déduit une catégorie de présence de
 * ce qu'`enrich` a trouvé ; `score` chiffre ce que `classify` a conclu. Rien
 * n'oblige ces trois étages à être passés dans cet ordre sur un prospect
 * donné, et rien en base ne marque qu'ils ne l'ont pas été.
 *
 * D'où ce module. Il ne corrige rien — corriger relève du collector — mais il
 * refuse de présenter un chiffre douteux comme un chiffre sûr. C'est la même
 * discipline que l'absence affichée comme absence : la seule chose que
 * l'interface doit à son lecteur, c'est de ne pas être plus affirmative que
 * ses données.
 */
export type DataWarning =
  /** Catégorie `none` alors qu'une URL est déclarée : la catégorie est réfutée. */
  | { kind: 'presence_contradicted'; declaredUrl: string }
  /** Score calculé avant l'enrichissement dont il dépend. */
  | { kind: 'score_predates_enrichment' }
  /** Score calculé sous une autre version du barème. */
  | { kind: 'score_stale_ruleset'; stored: string; current: string };

function instant(iso: string): number | null {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Les signalements d'un prospect, du plus urgent au moins urgent.
 *
 * L'ordre n'est pas cosmétique : un chiffre inversé se corrige avant un
 * chiffre en retard, qui se corrige avant un chiffre calculé sous d'autres
 * règles.
 */
export function dataWarnings(prospect: ProspectView, currentRulesetVersion: string): DataWarning[] {
  const avertissements: DataWarning[] = [];
  const { presence, enrichment, score } = prospect;

  // 1. La catégorie démentie.
  //
  // `none` a une définition stricte : « aucune URL déclarée et aucun réseau
  // social trouvé » (§5.2). Une URL déclarée ne la nuance donc pas, elle la
  // contredit — et l'écart de barème entre `none` (+35) et `has_site` (−100)
  // fait que le prospect n'est pas surévalué, il est du mauvais côté du seuil
  // de qualification. Les autres catégories dérivent au contraire de cette
  // même URL : les signaler serait crier au loup.
  if (
    presence !== null &&
    presence.category === 'none' &&
    enrichment !== null &&
    enrichment.declaredUrl !== null
  ) {
    avertissements.push({ kind: 'presence_contradicted', declaredUrl: enrichment.declaredUrl });
  }

  if (score === null) return avertissements;

  // 2. Le score antérieur aux faits.
  //
  // Comparaison d'horodatages plutôt que de versions : un score peut être au
  // bon barème et n'avoir jamais vu le téléphone, la note ni le site que
  // l'enrichissement a rapportés depuis. C'est le cas des 25 scores en base,
  // calculés à 1 h 52 et enrichis vers 14 h.
  //
  // Un horodatage illisible ne conclut rien : mieux vaut taire un
  // avertissement que d'en inventer un sur une date qu'on n'a pas su lire.
  if (enrichment !== null) {
    const calcule = instant(score.computedAt);
    const enrichi = instant(enrichment.enrichedAt);
    if (calcule !== null && enrichi !== null && calcule < enrichi) {
      avertissements.push({ kind: 'score_predates_enrichment' });
    }
  }

  // 3. Le barème périmé — le plus bénin des trois, mais le seul qui subsiste
  // quand tout le reste a été rejoué.
  if (isScoreStale(score.rulesetVersion, currentRulesetVersion)) {
    avertissements.push({
      kind: 'score_stale_ruleset',
      stored: score.rulesetVersion,
      current: currentRulesetVersion,
    });
  }

  return avertissements;
}
