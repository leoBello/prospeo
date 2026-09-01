import { describe, expect, it } from 'vitest';
import {
  checkDomainAvailability,
  domainProposalApplies,
  domainStaleCutoff,
  isDomainCheckStale,
  DOMAIN_PROPOSAL_CATEGORIES,
  RDAP_MIN_INTERVAL_MS,
  rdapDelayMs,
} from './domains.js';

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

describe('domainProposalApplies', () => {
  it('ne propose un domaine qu a qui n en a pas deja un', () => {
    expect(domainProposalApplies('none')).toBe(true);
    expect(domainProposalApplies('social_only')).toBe(true);
    expect(domainProposalApplies('directory_only')).toBe(true);
    // `dead_site` est ecarte comme `has_site` : un site mort a un domaine,
    // deja depose. Le sujet y est de le raviver, pas d en enregistrer un second.
    expect(domainProposalApplies('dead_site')).toBe(false);
    expect(domainProposalApplies('has_site')).toBe(false);
  });

  it('ne propose rien tant que la categorie est inconnue', () => {
    // `null` veut dire que personne n a encore classe ce prospect. Proposer
    // sur cette base reviendrait a affirmer qu il n a pas de site.
    expect(domainProposalApplies(null)).toBe(false);
  });

  it('couvre exactement les categories du filtre de lecture', () => {
    // Le predicat de `score` et le filtre SQL de `domains` doivent bouger
    // ensemble : une categorie ajoutee d un cote sans l autre laisserait
    // ecrire ou conserver une proposition qui ne devrait pas exister.
    expect(DOMAIN_PROPOSAL_CATEGORIES.every(domainProposalApplies)).toBe(true);
  });
});

describe('isDomainCheckStale', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');

  it('considere perimee une verification jamais faite', () => {
    expect(isDomainCheckStale(null, now)).toBe(true);
  });

  it('garde une verification recente', () => {
    expect(isDomainCheckStale('2026-08-25T12:00:00.000Z', now)).toBe(false);
  });

  it('rejoue une verification plus vieille que la fenetre', () => {
    // Un domaine libre en juin peut avoir ete depose depuis. Affirmer « j ai
    // verifie, il est libre » se fait alors dementir en trente secondes.
    expect(isDomainCheckStale('2026-06-01T12:00:00.000Z', now)).toBe(true);
  });

  it('rejoue une date illisible', () => {
    // Ne pas savoir quand on a verifie revient a ne pas avoir verifie.
    expect(isDomainCheckStale('hier matin', now)).toBe(true);
  });

  it('borne la fenetre a trente jours pile', () => {
    const cutoff = domainStaleCutoff(now);
    expect(cutoff).toBe('2026-08-02T12:00:00.000Z');
    // Juste avant la borne : perime. Juste apres : conserve.
    expect(isDomainCheckStale('2026-08-02T11:59:59.000Z', now)).toBe(true);
    expect(isDomainCheckStale('2026-08-02T12:00:01.000Z', now)).toBe(false);
  });
});
