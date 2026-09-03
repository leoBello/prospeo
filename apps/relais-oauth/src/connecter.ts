import type { Plateforme } from './state.js';

export interface ConnecterDeps {
  proprietaireExiste(ownerId: string): Promise<boolean>;
  signerState(charge: { ownerId: string; plateforme: Plateforme }): string;
}

export interface LiensInstallation {
  githubInstallUrl: string;
  vercelInstallUrl: string;
}

export type ResultatConnecter =
  | { ok: true; url: string }
  | { ok: false; statut: 400 | 404; raison: string };

/**
 * Le point d'entrée des deux flux (R4 du spec) : vérifie que l'appelant
 * désigne un utilisateur réel AVANT de signer quoi que ce soit — signer un
 * `state` pour un `owner_id` qui n'existe pas ne serait détecté qu'au
 * rappel, bien plus tard, pour rien.
 */
export async function construireRedirection(
  deps: ConnecterDeps,
  liens: LiensInstallation,
  plateforme: string | undefined,
  ownerId: string | undefined,
): Promise<ResultatConnecter> {
  if (plateforme !== 'github' && plateforme !== 'vercel') {
    return { ok: false, statut: 400, raison: 'plateforme doit être « github » ou « vercel ».' };
  }
  if (ownerId === undefined || ownerId === '') {
    return { ok: false, statut: 400, raison: 'owner est obligatoire.' };
  }
  const existe = await deps.proprietaireExiste(ownerId);
  if (!existe) {
    return { ok: false, statut: 404, raison: `aucun utilisateur ${ownerId}.` };
  }
  const state = deps.signerState({ ownerId, plateforme });
  const base = plateforme === 'github' ? liens.githubInstallUrl : liens.vercelInstallUrl;
  return { ok: true, url: `${base}?state=${encodeURIComponent(state)}` };
}
