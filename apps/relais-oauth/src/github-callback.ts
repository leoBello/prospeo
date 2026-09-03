import type { ResultatState } from './state.js';

export interface GithubCallbackDeps {
  verifierState(state: string): ResultatState;
  lireInstallation(installationId: string): Promise<{ compteLibelle: string }>;
  ecrireConnexion(ownerId: string, installationId: string, compteLibelle: string): Promise<void>;
}

export type ResultatCallback = { ok: true } | { ok: false; raison: string };

/**
 * Le rappel `Setup URL` de la GitHub App (R4 du spec). `setup_action` vaut
 * `install` à la première installation, `update` si l'utilisateur modifie
 * les dépôts autorisés — les deux valent une connexion active ; toute
 * autre valeur (GitHub en introduit parfois de nouvelles) est refusée
 * plutôt que traitée à l'aveugle.
 */
export async function traiterRappelGithub(
  deps: GithubCallbackDeps,
  params: { installationId: string | undefined; setupAction: string | undefined; state: string | undefined },
): Promise<ResultatCallback> {
  if (params.state === undefined) return { ok: false, raison: 'state manquant' };
  const verif = deps.verifierState(params.state);
  if (!verif.ok) return { ok: false, raison: `state ${verif.raison}` };
  if (verif.charge.plateforme !== 'github') {
    return { ok: false, raison: 'state signé pour une autre plateforme' };
  }
  if (params.setupAction !== 'install' && params.setupAction !== 'update') {
    return { ok: false, raison: `setup_action inattendu : ${params.setupAction ?? '(absent)'}` };
  }
  if (params.installationId === undefined) {
    return { ok: false, raison: 'installation_id manquant' };
  }

  // Un refus réseau (GitHub) ou d'écriture (Supabase) reste une exception
  // dans ses dépendances — capturée ICI pour ne jamais fuir au-delà de cette
  // fonction : l'appelant (l'enveloppe API) doit toujours pouvoir rendre la
  // page générique de R5, jamais une exception non gérée.
  try {
    const installation = await deps.lireInstallation(params.installationId);
    await deps.ecrireConnexion(verif.charge.ownerId, params.installationId, installation.compteLibelle);
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.message : String(e) };
  }
}
