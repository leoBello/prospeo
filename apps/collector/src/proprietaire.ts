/**
 * L'identifiant du locataire pour le compte duquel une commande travaille.
 *
 * **Un type marqué, et non un `string`.** Le collector emploie la clé
 * `service_role`, qui contourne RLS par construction : aucune politique ne le
 * retiendra jamais. Le filtre explicite est la SEULE barrière, et un
 * `string` de plus dans une signature se laisse oublier ou intervertir avec
 * un `prospectId`. Le marquage fait échouer la compilation à sa place.
 */
export type Proprietaire = string & { readonly __marque: unique symbol };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Refuse bruyamment plutôt que de laisser passer.
 *
 * Une valeur absente ferait lire la base entière ; une valeur mal formée
 * rendrait zéro ligne, qu'on prendrait pour « rien à faire ». Les deux échecs
 * sont silencieux, et c'est précisément pourquoi ils lèvent ici.
 */
export function proprietaire(brut: string | undefined): Proprietaire {
  if (brut === undefined || brut === '') {
    throw new Error(
      '--owner <uuid> est obligatoire : sans lui, la commande lirait la base de tous les utilisateurs.',
    );
  }
  if (!UUID.test(brut)) {
    throw new Error(`--owner attend un uuid, reçu « ${brut} ».`);
  }
  return brut as Proprietaire;
}
