/**
 * Détecte si l'on tourne sur macOS, pour afficher le raccourci clavier qui
 * fonctionne réellement — `⌘K` sur macOS, `Ctrl+K` ailleurs.
 *
 * Le paramètre accepte un objet injecté plutôt que de lire `navigator`
 * directement dans le corps de la fonction : les tests simulent ainsi les
 * deux plateformes sans redéfinir un global partagé entre eux — `navigator`
 * est un singleton du document jsdom, et une redéfinition non nettoyée
 * fuirait d'un test à l'autre.
 *
 * `navigator.platform` est dépréciée mais reste, à ce jour, le signal le plus
 * direct ; `userAgent` sert de repli quand elle manque ou ne tranche pas.
 * Sans indice net, on retombe sur Ctrl : afficher `⌘K` sur une plateforme qui
 * n'a pas cette touche serait la faute la plus visible du lot — le raccourci
 * annoncé doit être celui qui marche.
 */
export function estMac(nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator): boolean {
  const plateforme = nav.platform ?? '';
  if (/Mac|iPhone|iPad|iPod/i.test(plateforme)) return true;
  if (plateforme !== '') return false;

  const agent = nav.userAgent ?? '';
  return /Macintosh|Mac OS X/i.test(agent);
}
