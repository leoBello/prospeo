import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { CleMaitresse } from '@prospeo/coffre';
import type { CoffreDeps, CoffreGithubDeps, PlateformeConnectee } from './coffre.js';
import type { Proprietaire } from './proprietaire.js';
import type { ResultatJetonInstallation } from './sources/github-app.js';

type Client = SupabaseClient<Database>;

/**
 * Le vrai accès Supabase derrière `CoffreDeps`/`CoffreGithubDeps`.
 *
 * `coffre.ts` définit CE QUE `jetonDe`/`jetonInstallationGithub` emploient ;
 * ce fichier construit les implémentations réelles, sur le modèle
 * d'`apps/relais-oauth/src/connexions.ts` qui écrit ce que ce fichier lit.
 */

/** L'inverse exact de `versBytea` (`apps/relais-oauth/src/connexions.ts`) —
 *  vérifié contre la vraie base : PostgREST rend un `bytea` en `\x` suivi
 *  d'hexadécimal. */
function depuisBytea(valeur: string): Buffer {
  return Buffer.from(valeur.replace(/^\\x/, ''), 'hex');
}

/** Pour `jetonDe` (Vercel) : lecture de l'état, lecture et conversion du
 *  secret chiffré, marquage d'état. */
export function creerCoffreDeps(client: Client, cle: CleMaitresse): CoffreDeps {
  return {
    async lireConnexion(proprietaire, plateforme) {
      const { data, error } = await client
        .from('connexion_plateforme')
        .select('id,etat')
        .eq('owner_id', proprietaire)
        .eq('plateforme', plateforme)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data === null ? null : { id: data.id, etat: data.etat };
    },
    async lireSecret(connexionId) {
      const { data, error } = await client
        .from('connexion_secret')
        .select('chiffre,vecteur,etiquette,cle_id')
        .eq('connexion_id', connexionId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data === null) return null;
      return {
        chiffre: depuisBytea(data.chiffre),
        vecteur: depuisBytea(data.vecteur),
        etiquette: depuisBytea(data.etiquette),
        cleId: data.cle_id,
      };
    },
    async marquerEtat(connexionId, etat) {
      const { error } = await client
        .from('connexion_plateforme')
        .update({ etat, etat_constate_at: new Date().toISOString() })
        .eq('id', connexionId);
      if (error) throw new Error(error.message);
    },
    cle,
  };
}

/** Pour `jetonInstallationGithub` : lecture de l'installation (`reference`),
 *  marquage d'état, fabrication du jeton déléguée au client GitHub App. */
export function creerCoffreGithubDeps(
  client: Client,
  githubApp: { creerJetonInstallation(installationId: string): Promise<ResultatJetonInstallation> },
): CoffreGithubDeps {
  return {
    async lireInstallation(proprietaire) {
      const { data, error } = await client
        .from('connexion_plateforme')
        .select('id,etat,reference')
        .eq('owner_id', proprietaire)
        .eq('plateforme', 'github')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data === null
        ? null
        : { connexionId: data.id, etat: data.etat, installationId: data.reference };
    },
    async marquerEtat(connexionId, etat) {
      const { error } = await client
        .from('connexion_plateforme')
        .update({ etat, etat_constate_at: new Date().toISOString() })
        .eq('id', connexionId);
      if (error) throw new Error(error.message);
    },
    creerJetonInstallation: githubApp.creerJetonInstallation,
  };
}

/** Le compte affiché — l'organisation GitHub ou l'équipe Vercel de CET
 *  utilisateur. Une lecture à part de `lireConnexion`/`lireInstallation` :
 *  ni `jetonDe` ni `jetonInstallationGithub` n'en ont besoin, seul
 *  l'appelant de `chaineDeps` (Tâche 6) en a l'usage. */
export async function lireCompteLibelle(
  client: Client,
  proprietaire: Proprietaire,
  plateforme: PlateformeConnectee,
): Promise<string | null> {
  const { data, error } = await client
    .from('connexion_plateforme')
    .select('compte_libelle')
    .eq('owner_id', proprietaire)
    .eq('plateforme', plateforme)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.compte_libelle ?? null;
}
