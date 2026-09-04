import { chiffrer, type CleMaitresse, type Scelle } from './coffre.js';
import type { ResultatState } from './state.js';

export interface VercelCallbackDeps {
  verifierState(state: string): ResultatState;
  echangerCode(code: string, redirectUri: string): Promise<{ accessToken: string; teamId: string | null }>;
  ecrireConnexion(ownerId: string, compteLibelle: string, scelle: Scelle): Promise<void>;
  cle: CleMaitresse;
  redirectUri: string;
}

export type ResultatCallback = { ok: true } | { ok: false; raison: string };

/**
 * Le rappel Redirect URL de l'intégration Vercel (R4 du spec). Le jeton
 * reçu est chiffré ICI, avant tout appel à `ecrireConnexion` — le clair ne
 * voyage jamais jusqu'à `connexions.ts`.
 */
export async function traiterRappelVercel(
  deps: VercelCallbackDeps,
  params: { code: string | undefined; state: string | undefined },
): Promise<ResultatCallback> {
  if (params.state === undefined) return { ok: false, raison: 'state manquant' };
  const verif = deps.verifierState(params.state);
  if (!verif.ok) return { ok: false, raison: `state ${verif.raison}` };
  if (verif.charge.plateforme !== 'vercel') {
    return { ok: false, raison: 'state signé pour une autre plateforme' };
  }
  if (params.code === undefined) return { ok: false, raison: 'code manquant' };

  // Un refus réseau (Vercel) ou d'écriture (Supabase) reste une exception
  // dans ses dépendances — capturée ICI pour ne jamais fuir au-delà de cette
  // fonction : l'appelant (l'enveloppe API) doit toujours pouvoir rendre la
  // page générique de R5, jamais une exception non gérée.
  try {
    const jeton = await deps.echangerCode(params.code, deps.redirectUri);
    const scelle = chiffrer(jeton.accessToken, deps.cle);
    const compteLibelle = jeton.teamId ?? 'compte personnel';
    await deps.ecrireConnexion(verif.charge.ownerId, compteLibelle, scelle);
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.message : String(e) };
  }
}
