import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';

/**
 * La logique de décision d'un balayage du superviseur — PURE, injectée,
 * jamais un vrai process ni une vraie horloge ici. `cli.ts` assemble
 * l'exécution réelle (voir la Tâche 7 du plan qui introduit ce fichier).
 */
export interface SuperviseurDeps {
  /** Les owner_id dont GitHub ET Vercel sont actifs, à cet instant. */
  decouvrirEligibles(): Promise<Set<string>>;
  /** Les owner_id actuellement suivis (un process démarré, pas encore mort). */
  suivis(): Set<string>;
  /** Démarre un process pour cet utilisateur. Ne bloque pas. */
  demarrer(ownerId: string): void;
  /** Demande l'arrêt propre (SIGTERM) du process de cet utilisateur. */
  arreterProprement(ownerId: string): void;
  /** Tue sans grâce (SIGKILL) — le filet de sécurité sur un battement périmé. */
  tuerSansGrace(ownerId: string): void;
  /** Le dernier battement connu, ou `null` si aucun n'a jamais été écrit. */
  dernierBattement(ownerId: string): Promise<Date | null>;
  maintenant(): Date;
}

/**
 * Un utilisateur suivi, encore éligible, est déclaré bloqué si son battement
 * date de plus de 90 s. Un crash aurait déjà déclenché l'événement `exit`
 * (câblé à part, `cli.ts`) : ce filet ne vise que le cas où le process
 * tourne encore mais ne répond plus (boucle infinie, appel réseau qui ne
 * rend jamais la main).
 */
const SEUIL_PEREMPTION_MS = 90_000;

export async function balayer(deps: SuperviseurDeps): Promise<void> {
  const eligibles = await deps.decouvrirEligibles();
  const suivis = deps.suivis();

  for (const ownerId of eligibles) {
    if (!suivis.has(ownerId)) deps.demarrer(ownerId);
  }

  for (const ownerId of suivis) {
    if (!eligibles.has(ownerId)) {
      deps.arreterProprement(ownerId);
      continue;
    }
    // `null` : jamais démarré, ou pas encore eu le temps d'écrire son premier
    // battement — une absence de nature différente d'un battement périmé, et
    // qui ne doit JAMAIS déclencher ce filet (voir le test dédié).
    const battement = await deps.dernierBattement(ownerId);
    if (battement !== null && deps.maintenant().getTime() - battement.getTime() > SEUIL_PEREMPTION_MS) {
      deps.tuerSansGrace(ownerId);
    }
  }
}

/** Les owner_id dont `connexion_plateforme` porte GitHub ET Vercel actifs. */
export async function decouvrirEligiblesReel(client: SupabaseClient<Database>): Promise<Set<string>> {
  const { data, error } = await client
    .from('connexion_plateforme')
    .select('owner_id,plateforme')
    .eq('etat', 'active')
    .in('plateforme', ['github', 'vercel']);
  if (error) throw new Error(error.message);

  const plateformesParProprietaire = new Map<string, Set<string>>();
  for (const { owner_id, plateforme } of data ?? []) {
    const ensemble = plateformesParProprietaire.get(owner_id) ?? new Set<string>();
    ensemble.add(plateforme);
    plateformesParProprietaire.set(owner_id, ensemble);
  }

  const eligibles = new Set<string>();
  for (const [ownerId, plateformes] of plateformesParProprietaire) {
    if (plateformes.has('github') && plateformes.has('vercel')) eligibles.add(ownerId);
  }
  return eligibles;
}

export interface SuiviBackoff {
  enregistrerDemarrage(ownerId: string, instant: Date): void;
  enregistrerSortie(ownerId: string, instant: Date): void;
  delaiRedemarrageMs(ownerId: string): number;
}

const PALIERS_MS = [5_000, 10_000, 20_000, 60_000];
/** Sous ce temps de fonctionnement, une sortie compte comme un crash en boucle. */
const SEUIL_FONCTIONNEMENT_SAIN_MS = 60_000;

/**
 * Le recul exponentiel d'un redémarrage : 5s, 10s, 20s, plafond 60s. Se
 * réinitialise après 60s de fonctionnement sans sortie — sans quoi un
 * utilisateur qui a connu UN crash resterait pénalisé indéfiniment.
 */
export function creerSuiviBackoff(): SuiviBackoff {
  const demarrages = new Map<string, Date>();
  const compteurs = new Map<string, number>();
  return {
    enregistrerDemarrage(ownerId, instant) {
      demarrages.set(ownerId, instant);
    },
    enregistrerSortie(ownerId, instant) {
      const demarrage = demarrages.get(ownerId);
      const dureeMs = demarrage === undefined ? 0 : instant.getTime() - demarrage.getTime();
      if (dureeMs >= SEUIL_FONCTIONNEMENT_SAIN_MS) {
        compteurs.set(ownerId, 0);
      } else {
        compteurs.set(ownerId, Math.min((compteurs.get(ownerId) ?? 0) + 1, PALIERS_MS.length - 1));
      }
    },
    delaiRedemarrageMs(ownerId) {
      return PALIERS_MS[compteurs.get(ownerId) ?? 0] as number;
    },
  };
}
