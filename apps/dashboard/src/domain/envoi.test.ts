import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { etatCompteEnvoi, refusEnvoi } from './envoi.js';

/** Une session réduite à ce que `etatCompteEnvoi` lit — le reste n'entre pas dans sa décision. */
function session(surcharges: {
  providerToken?: string | null;
  provider?: string;
  email?: string;
}): Session {
  return {
    provider_token: surcharges.providerToken ?? null,
    user: {
      email: surcharges.email ?? 'leo@example.com',
      app_metadata: { provider: surcharges.provider ?? 'email' },
    },
  } as unknown as Session;
}

describe('etatCompteEnvoi', () => {
  it('rend null tant que la session n’est pas connue — « on ne sait pas » n’est pas « pas de compte »', () => {
    expect(etatCompteEnvoi(undefined)).toBeNull();
  });

  it('rend null quand personne n’est connecté', () => {
    expect(etatCompteEnvoi(null)).toBeNull();
  });

  it('rend pret quand le jeton Google est là, avec l’adresse qui enverra', () => {
    const r = etatCompteEnvoi(
      session({ providerToken: 'ya29.xxx', provider: 'google', email: 'leo@gmail.com' }),
    );
    expect(r).toEqual({ etat: 'pret', expediteur: 'leo@gmail.com' });
  });

  it('rend sans_jeton pour une session ouverte par mot de passe', () => {
    // LE DÉFAUT QUE CE TEST FERME. Confondu avec `jeton_expire`, l'écran
    // proposerait « se reconnecter et reprendre » à quelqu'un qui n'a jamais
    // ouvert de session Google — une remédiation qui ne remédie à rien.
    expect(etatCompteEnvoi(session({ providerToken: null, provider: 'email' }))).toEqual({
      etat: 'sans_jeton',
    });
  });

  it('retombe sur sans_jeton quand la session ne porte pas de métadonnées', () => {
    // Une session incomplète ne doit pas faire tomber l'écran entier. Elle
    // retombe sur l'état conservateur : celui qui n'autorise aucun envoi.
    const tronquee = { provider_token: null, user: { email: 'leo@example.com' } };
    expect(etatCompteEnvoi(tronquee as unknown as Session)).toEqual({ etat: 'sans_jeton' });
  });

  it('rend jeton_expire pour une session Google dont le jeton a disparu', () => {
    const r = etatCompteEnvoi(
      session({ providerToken: null, provider: 'google', email: 'leo@gmail.com' }),
    );
    expect(r).toEqual({ etat: 'jeton_expire', expediteur: 'leo@gmail.com' });
  });
});

describe('refusEnvoi', () => {
  const complet = {
    compte: { etat: 'pret', expediteur: 'leo@gmail.com' } as const,
    adresse: 'contact@artisan.fr',
    objet: 'Votre site',
    corps: 'Bonjour,',
    envoiExistant: null,
  };

  it('ne refuse rien quand tout est là', () => {
    expect(refusEnvoi(complet)).toBeNull();
  });

  it('refuse sans compte d’envoi utilisable', () => {
    expect(refusEnvoi({ ...complet, compte: { etat: 'sans_jeton' } })).toBe('compte');
  });

  it('refuse sans adresse — l’absence, pas une chaîne vide', () => {
    expect(refusEnvoi({ ...complet, adresse: null })).toBe('adresse');
  });

  it('refuse quand aucun mail n’a été rédigé', () => {
    expect(refusEnvoi({ ...complet, objet: null, corps: null })).toBe('mail');
  });

  it('refuse un prospect à qui le mail est déjà parti', () => {
    // La garantie vit dans l'index unique partiel de `message_send` ; cette
    // règle-ci ne fait qu'éviter de PROPOSER un geste que la base refusera.
    expect(refusEnvoi({ ...complet, envoiExistant: { state: 'envoye' } })).toBe('deja_envoye');
  });

  it('n’empêche pas de réessayer un envoi qui a échoué', () => {
    expect(refusEnvoi({ ...complet, envoiExistant: { state: 'echoue' } })).toBeNull();
  });
});
