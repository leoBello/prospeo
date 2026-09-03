/**
 * La page HTML minimale rendue par les deux rappels — jamais le détail
 * d'un échec (R5 du spec) : un `state` invalide ou un échange de code
 * refusé rend le MÊME message générique, quelle qu'en soit la cause
 * précise, consignée elle dans les journaux du déploiement.
 */
export function pageConfirmation(succes: boolean): string {
  const titre = succes ? 'Connecté' : 'Échec';
  const message = succes
    ? 'Vous pouvez fermer cet onglet.'
    : "La connexion n'a pas abouti. Réessayez depuis Prospeo.";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>Prospeo — ${titre}</title></head><body><h1>${titre}</h1><p>${message}</p></body></html>`;
}
