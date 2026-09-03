import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Le `state` signé qui protège les trois routes de ce service.
 *
 * Sans lui, un tiers pourrait appeler `/api/github/callback` ou
 * `/api/vercel/callback` avec un `ownerId` arbitraire et lui faire porter
 * une connexion — R3 du spec. Signé HMAC-SHA256, jamais chiffré : ce qu'il
 * porte (un identifiant et un nom de plateforme) n'est pas un secret,
 * seule sa provenance doit être garantie.
 */

export type Plateforme = 'github' | 'vercel';

export interface ChargeState {
  ownerId: string;
  plateforme: Plateforme;
  exp: number;
}

export type ResultatState =
  | { ok: true; charge: ChargeState }
  | { ok: false; raison: 'signature_invalide' | 'expire' | 'format_invalide' };

/**
 * Dix minutes : assez pour cliquer « installer »/« autoriser » côté
 * GitHub/Vercel, pas assez pour qu'un lien intercepté reste utilisable
 * longtemps après avoir été généré.
 */
const DUREE_VALIDITE_MS = 10 * 60 * 1000;

function signer(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signerState(
  charge: { ownerId: string; plateforme: Plateforme },
  secret: string,
  maintenant: Date = new Date(),
): string {
  const complet: ChargeState = { ...charge, exp: maintenant.getTime() + DUREE_VALIDITE_MS };
  const payload = Buffer.from(JSON.stringify(complet), 'utf8').toString('base64url');
  return `${payload}.${signer(payload, secret)}`;
}

export function verifierState(
  state: string,
  secret: string,
  maintenant: Date = new Date(),
): ResultatState {
  const separateur = state.indexOf('.');
  if (separateur <= 0) return { ok: false, raison: 'format_invalide' };
  const payload = state.slice(0, separateur);
  const signature = state.slice(separateur + 1);

  const attendue = signer(payload, secret);
  const bufSignature = Buffer.from(signature, 'base64url');
  const bufAttendue = Buffer.from(attendue, 'base64url');
  // `timingSafeEqual` exige la même longueur — la vérifier d'abord évite une
  // exception sur une signature tronquée, qui n'est qu'un cas de plus de
  // « signature invalide », pas une panne à part.
  if (bufSignature.length !== bufAttendue.length || !timingSafeEqual(bufSignature, bufAttendue)) {
    return { ok: false, raison: 'signature_invalide' };
  }

  let charge: ChargeState;
  try {
    charge = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ChargeState;
  } catch {
    return { ok: false, raison: 'format_invalide' };
  }
  if (
    typeof charge.ownerId !== 'string' ||
    (charge.plateforme !== 'github' && charge.plateforme !== 'vercel') ||
    typeof charge.exp !== 'number'
  ) {
    return { ok: false, raison: 'format_invalide' };
  }
  if (charge.exp < maintenant.getTime()) return { ok: false, raison: 'expire' };

  return { ok: true, charge };
}
