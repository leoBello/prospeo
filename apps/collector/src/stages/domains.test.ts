import { describe, expect, it } from 'vitest';
import { checkDomainAvailability, RDAP_MIN_INTERVAL_MS, rdapDelayMs } from './domains.js';

const nxdomain = async (): Promise<string[]> => {
  throw new Error('NXDOMAIN');
};

describe('checkDomainAvailability', () => {
  it('déclare pris un domaine qui résout', async () => {
    const taken = await checkDomainAvailability('allard.fr', {
      resolve: async () => ['1.2.3.4'],
      rdap: async () => 404,
    });
    // Le DNS tranche seul : un domaine qui résout est pris, quoi que dise RDAP.
    expect(taken).toBe(false);
  });

  it('déclare libre un domaine absent du DNS et inconnu du registre', async () => {
    expect(await checkDomainAvailability('allard.fr', { resolve: nxdomain, rdap: async () => 404 })).toBe(true);
  });

  it('déclare pris un domaine absent du DNS mais connu du registre', async () => {
    // Cas réel et fréquent : domaine réservé, sans serveur configuré.
    expect(await checkDomainAvailability('allard.fr', { resolve: nxdomain, rdap: async () => 200 })).toBe(false);
  });

  it('ne conclut rien quand RDAP est indisponible', async () => {
    expect(await checkDomainAvailability('allard.fr', { resolve: nxdomain, rdap: async () => 503 })).toBeNull();
  });

  it('ne conclut rien quand RDAP échoue', async () => {
    const unknown = await checkDomainAvailability('allard.fr', {
      resolve: nxdomain,
      rdap: async () => {
        throw new Error('réseau');
      },
    });
    // Une panne ne doit jamais devenir un argument commercial.
    expect(unknown).toBeNull();
  });
});

describe('rdapDelayMs', () => {
  it('attend le reste de l\'intervalle quand la requête précédente est trop récente', () => {
    expect(rdapDelayMs(1_000, 1_050)).toBe(100);
  });

  it('n\'attend pas quand l\'intervalle est déjà écoulé', () => {
    expect(rdapDelayMs(1_000, 1_200)).toBe(0);
  });

  it('ne dépasse jamais l\'intervalle, même si l\'horloge recule', () => {
    // Une horloge qui recule ne doit pas figer le run pendant des minutes.
    expect(rdapDelayMs(5_000, 1_000)).toBe(RDAP_MIN_INTERVAL_MS);
  });
});
