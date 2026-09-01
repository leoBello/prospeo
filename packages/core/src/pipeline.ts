/**
 * Les statuts du pipeline qui valent REFUS, et le prédicat qui les lit.
 *
 * Une seule liste, parce que deux gardes en dépendent et qu'ils doivent
 * s'accorder : `unpublish` retire le site d'un prospect qui a dit non (D5), et
 * `pitch` refuse de lui rédiger un argumentaire. Recopiée de part et d'autre,
 * elle finirait par diverger, et la divergence produirait exactement le pire
 * enchaînement possible — un message de vente écrit pour un artisan dont on
 * vient de dépublier le site parce qu'il a demandé qu'on le laisse tranquille.
 *
 * C'est la même doctrine que `domainProposalApplies`, qui gouverne pour la
 * même raison les deux bouts de l'invariant « on ne propose un domaine qu'à
 * qui n'en a pas ».
 *
 * Le §11 conformité du spec du socle fonde la règle : le statut « ne pas
 * contacter » est « respecté immédiatement et définitivement ».
 */
export const STATUTS_REFUS: ReadonlySet<string> = new Set(['ne_pas_contacter', 'perdu']);

/**
 * Ce prospect a-t-il dit non ?
 *
 * L'absence de statut n'est pas un refus. Un prospect sans ligne
 * `prospect_pipeline` n'a jamais été contacté — c'est le cas normal au premier
 * run, et c'était celui des 139 lignes de la base le 1er septembre 2026. Le
 * socle dit déjà la même chose autrement, en donnant `a_contacter` par défaut
 * à la colonne.
 */
export function estUnRefus(status: string | null | undefined): boolean {
  return status !== null && status !== undefined && STATUTS_REFUS.has(status);
}
