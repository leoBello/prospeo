import { describe, expect, it } from 'vitest';
import { createGoogleMapsSource } from './google-maps.js';

describe('createGoogleMapsSource', () => {
  it('compte zéro navigation tant que rien n a été chargé', () => {
    // Aucun navigateur n'est lancé ici : le contexte Playwright n'est créé
    // qu'au premier `search()`. Le compteur doit donc exister et valoir zéro
    // dès la création, sans qu'aucune requête ne parte vers Google.
    const source = createGoogleMapsSource({ userDataDir: '.playwright-profile-test' });
    expect(source.navigations).toBe(0);
  });
});
