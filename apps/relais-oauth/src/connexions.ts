import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { Scelle } from './coffre.js';

type Client = SupabaseClient<Database>;

/**
 * Écrit les connexions issues des deux flux OAuth (R4 du spec).
 *
 * **Lire-puis-écrire, jamais `upsert`.** Un `upsert` qui inclurait `id` dans
 * ses colonnes réécrirait l'identifiant à chaque reconnexion — cassant la
 * clé étrangère `connexion_secret.connexion_id on delete cascade` (une
 * mise à jour de clé primaire référencée exige `on update cascade`, que la
 * migration ne pose pas). Lire l'existant, puis `insert` ou `update` selon
 * le cas, garde le même `id` d'une reconnexion à l'autre.
 */

async function idConnexion(
  client: Client,
  ownerId: string,
  plateforme: 'github' | 'vercel',
): Promise<string | null> {
  const { data, error } = await client
    .from('connexion_plateforme')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('plateforme', plateforme)
    .maybeSingle();
  if (error !== null) {
    throw new Error(`connexion_plateforme : lecture impossible — ${error.message}`);
  }
  return data?.id ?? null;
}

/** L'existence d'un compte réel — vérifiée avant de signer un `state` pour lui (Tâche 6). */
export async function proprietaireExiste(client: Client, ownerId: string): Promise<boolean> {
  const { data, error } = await client.auth.admin.getUserById(ownerId);
  if (error !== null) return false;
  return data.user !== null;
}

/**
 * GitHub n'a rien à chiffrer (§2 du spec de l'étape 2) : `reference` porte
 * l'`installation_id` en clair.
 */
export async function ecrireConnexionGithub(
  client: Client,
  ownerId: string,
  installationId: string,
  compteLibelle: string,
): Promise<void> {
  const existant = await idConnexion(client, ownerId, 'github');
  const valeurs = {
    owner_id: ownerId,
    plateforme: 'github' as const,
    reference: installationId,
    compte_libelle: compteLibelle,
    etat: 'active' as const,
    connectee_at: new Date().toISOString(),
  };
  const { error } =
    existant === null
      ? await client.from('connexion_plateforme').insert(valeurs)
      : await client.from('connexion_plateforme').update(valeurs).eq('id', existant);
  if (error !== null) {
    throw new Error(`connexion_plateforme (github) : écriture impossible — ${error.message}`);
  }
}

/** Un `bytea` Postgres s'écrit en texte comme `\x` suivi d'hexadécimal. */
function versBytea(buffer: Buffer): string {
  return `\\x${buffer.toString('hex')}`;
}

/** Vercel a un vrai secret : `scelle` (déjà chiffré par l'appelant, Tâche 8) rejoint `connexion_secret`. */
export async function ecrireConnexionVercel(
  client: Client,
  ownerId: string,
  compteLibelle: string,
  scelle: Scelle,
): Promise<void> {
  const existant = await idConnexion(client, ownerId, 'vercel');
  const valeurs = {
    owner_id: ownerId,
    plateforme: 'vercel' as const,
    compte_libelle: compteLibelle,
    etat: 'active' as const,
    connectee_at: new Date().toISOString(),
  };

  let connexionId: string;
  if (existant === null) {
    const { data, error } = await client
      .from('connexion_plateforme')
      .insert(valeurs)
      .select('id')
      .single();
    if (error !== null || data === null) {
      throw new Error(`connexion_plateforme (vercel) : écriture impossible — ${error?.message}`);
    }
    connexionId = data.id;
  } else {
    const { error } = await client.from('connexion_plateforme').update(valeurs).eq('id', existant);
    if (error !== null) {
      throw new Error(`connexion_plateforme (vercel) : écriture impossible — ${error.message}`);
    }
    connexionId = existant;
  }

  const { data: secretExistant, error: erreurLecture } = await client
    .from('connexion_secret')
    .select('connexion_id')
    .eq('connexion_id', connexionId)
    .maybeSingle();
  if (erreurLecture !== null) {
    throw new Error(`connexion_secret : lecture impossible — ${erreurLecture.message}`);
  }

  const valeursSecret = {
    connexion_id: connexionId,
    chiffre: versBytea(scelle.chiffre),
    vecteur: versBytea(scelle.vecteur),
    etiquette: versBytea(scelle.etiquette),
    cle_id: scelle.cleId,
    ecrit_at: new Date().toISOString(),
  };
  const { error: erreurEcriture } =
    secretExistant === null
      ? await client.from('connexion_secret').insert(valeursSecret)
      : await client.from('connexion_secret').update(valeursSecret).eq('connexion_id', connexionId);
  if (erreurEcriture !== null) {
    throw new Error(`connexion_secret : écriture impossible — ${erreurEcriture.message}`);
  }
}
