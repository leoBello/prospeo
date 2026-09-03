import { describe, expect, it } from 'vitest';
import { signerState, verifierState } from './state.js';

const SECRET = 'secret-de-test-jamais-reel';

describe('signerState / verifierState', () => {
  it('rend la charge d origine après un aller-retour', () => {
    const state = signerState({ ownerId: 'u1', plateforme: 'vercel' }, SECRET);
    const resultat = verifierState(state, SECRET);
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.charge.ownerId).toBe('u1');
      expect(resultat.charge.plateforme).toBe('vercel');
    }
  });

  it('refuse un state altéré (charge modifiée)', () => {
    const state = signerState({ ownerId: 'u1', plateforme: 'vercel' }, SECRET);
    const [payload, signature] = state.split('.');
    // On substitue une charge pour un AUTRE propriétaire, signature inchangée.
    const chargeFalsifiee = Buffer.from(
      JSON.stringify({ ownerId: 'attaquant', plateforme: 'vercel', exp: Date.now() + 60000 }),
      'utf8',
    ).toString('base64url');
    const falsifie = `${chargeFalsifiee}.${signature}`;
    expect(verifierState(falsifie, SECRET)).toEqual({ ok: false, raison: 'signature_invalide' });
    void payload;
  });

  it('refuse une signature qui ne correspond pas au secret', () => {
    const state = signerState({ ownerId: 'u1', plateforme: 'vercel' }, SECRET);
    expect(verifierState(state, 'un-autre-secret')).toEqual({
      ok: false,
      raison: 'signature_invalide',
    });
  });

  it('refuse un state expiré', () => {
    const hier = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const state = signerState({ ownerId: 'u1', plateforme: 'vercel' }, SECRET, hier);
    // Vérifié à l'heure ACTUELLE — le state, signé hier, est expiré depuis longtemps.
    expect(verifierState(state, SECRET)).toEqual({ ok: false, raison: 'expire' });
  });

  it('refuse une chaîne mal formée', () => {
    expect(verifierState('pas-un-state-valide', SECRET)).toEqual({
      ok: false,
      raison: 'format_invalide',
    });
  });
});
