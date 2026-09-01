import { describe, expect, it } from 'vitest';
import { assemblePitchFacts, PITCH_FACT_KEYS, type PitchFactsInput } from './pitch-facts.js';

/** Un prospect complet, dont chaque test retire ou modifie une pièce. */
const base: PitchFactsInput = {
  prospect: {
    siret: '51000900400035',
    denomination: 'DOSSO SOULEYMANE',
    denominationUsuelle: 'DOS-SERVICES',
    tradeSlug: 'plombier',
    address: '37 RUE JACQUES CARTIER 44300 NANTES',
    postalCode: '44300',
    city: 'NANTES',
    dateCreation: '2009-04-01',
    enrichment: {
      status: 'ok',
      matchedName: 'Dos-Services',
      phoneE164: '+33602002360',
      rating: 4.8,
      mapsUrl: 'https://maps.google.com/?cid=1',
    },
  },
  site: {
    deploymentUrl: 'https://dos-services-51000900400035.vercel.app',
    unpublishedAt: null,
  },
  presenceWeb: 'none',
  domaineLibre: 'dos-services.fr',
  pipelineStatus: 'a_contacter',
};

describe('assemblePitchFacts', () => {
  it('assemble les faits d’un prospect dont le site est en ligne', () => {
    const f = assemblePitchFacts(base);
    expect(f).not.toBeNull();
    expect(f?.entreprise.nomAffiche).toBe('Dos-Services');
    expect(f?.urlSite).toBe('https://dos-services-51000900400035.vercel.app');
    expect(f?.presenceWeb).toBe('none');
    expect(f?.domaineLibre).toBe('dos-services.fr');
  });

  it('REFUSE un prospect qui a dit non', () => {
    // Le garde-fou qui compte, et la raison d'être de cette fonction. Le §11
    // conformité veut le statut « ne pas contacter » respecté « immédiatement
    // et définitivement » ; D5 fait déjà dépublier son site. Lui rédiger un
    // argumentaire de vente dans la foulée serait la contradiction la plus
    // coûteuse que ce projet puisse produire.
    //
    // Le refus est ICI et non dans le filtre SQL du CLI : ce que cette
    // fonction ne rend pas ne peut pas atteindre le prompt, quelle que soit la
    // requête qui l'appelle. Un filtre oublié dans un `select` est invisible ;
    // un `null` se compte.
    for (const statut of ['ne_pas_contacter', 'perdu']) {
      expect(assemblePitchFacts({ ...base, pipelineStatus: statut })).toBeNull();
    }
  });

  it('REFUSE un prospect sans site déployé', () => {
    // Le message n'a qu'un seul argument concret : « voici à quoi ressemblerait
    // votre site, il est en ligne, allez le voir ». Sans URL il ne reste qu'un
    // démarchage ordinaire, que ce chantier n'a aucune raison d'écrire.
    expect(
      assemblePitchFacts({ ...base, site: { deploymentUrl: null, unpublishedAt: null } }),
    ).toBeNull();
    expect(assemblePitchFacts({ ...base, site: null })).toBeNull();
  });

  it('REFUSE un prospect dont le site vient d’être dépublié', () => {
    // `deployment_url` SURVIT à la dépublication : la colonne garde la trace de
    // ce qui a existé (tâche 6). Un message écrit sur cette seule colonne
    // enverrait donc l'artisan vers une adresse morte — et, s'il a été dépublié
    // sur refus, vers une adresse morte qu'il avait demandé de retirer.
    expect(
      assemblePitchFacts({
        ...base,
        site: { deploymentUrl: base.site?.deploymentUrl ?? null, unpublishedAt: new Date() },
      }),
    ).toBeNull();
  });

  it('REFUSE un prospect qui a déjà un site correct', () => {
    // Cohérence avec le barème, qui écarte `has_site` : proposer une vitrine à
    // qui en a déjà une n'a pas de sens, et le message le dirait avec aplomb
    // puisque le modèle croirait sur parole ce qu'on lui donne.
    expect(assemblePitchFacts({ ...base, presenceWeb: 'has_site' })).toBeNull();
    expect(assemblePitchFacts({ ...base, presenceWeb: null })).toBeNull();
  });

  it('hérite des refus de assembleFacts', () => {
    // Pas de téléphone, pas de métier connu : `assembleFacts` refuse déjà, et
    // `assemblePitchFacts` s'appuie dessus plutôt que de refaire la règle. Un
    // prospect à qui l'on ne peut pas faire de site n'a pas de message à
    // recevoir — c'est la même population, par construction.
    const sansTel = {
      ...base,
      prospect: { ...base.prospect, enrichment: { ...base.prospect.enrichment!, phoneE164: null } },
    };
    expect(assemblePitchFacts(sansTel)).toBeNull();
  });

  it('n’avance aucun domaine libre quand la vérification n’a rien donné', () => {
    // Mesuré le 1er septembre 2026 : `domain_available` est nul sur 134 lignes
    // sur 134, l'étage `domains` n'ayant jamais tourné. C'est donc le cas
    // NORMAL aujourd'hui, pas le cas limite — et le message doit rester
    // écrivable sans cet argument.
    expect(assemblePitchFacts({ ...base, domaineLibre: null })?.domaineLibre).toBeNull();
  });

  it('ne propose jamais de domaine à un site mort', () => {
    // `dead_site` a déjà un domaine, déposé par son propriétaire : le sujet
    // est de le raviver, pas d'en enregistrer un second. C'est la règle que
    // `DOMAIN_PROPOSAL_CATEGORIES` pose côté `domains` ; on la tient aussi ici,
    // parce qu'une ligne périmée en base pourrait encore porter un nom.
    const mort = { ...base, presenceWeb: 'dead_site' as const, domaineLibre: 'ancien.fr' };
    expect(assemblePitchFacts(mort)?.domaineLibre).toBeNull();
    expect(assemblePitchFacts(mort)?.presenceWeb).toBe('dead_site');
  });

  it('énumère ses champs, pour qu’un fait ajouté doive s’expliquer', () => {
    // Même discipline que `SITE_FACT_KEYS` : ajouter un fait au message oblige
    // à passer par cette liste, donc à écrire d'où la base le tire. Un champ
    // glissé dans le prompt n'aurait, lui, aucune source.
    expect(Object.keys(assemblePitchFacts(base)!).sort()).toEqual([...PITCH_FACT_KEYS].sort());
  });
});
