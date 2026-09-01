import { describe, expect, it } from 'vitest';
import { verifierCoherence } from './site-coherence.js';
import { SITE_CONTENT_VERSION, type SiteContent } from './site-content.js';

const BASE: SiteContent = {
  version: { schema: SITE_CONTENT_VERSION, promptVersion: 'test', model: 'test' },
  faits: {
    nomAffiche: 'Dos-Services',
    metier: { slug: 'plombier', label: 'Plombier' },
    adresse: { rue: '37 Rue Jacques Cartier', codePostal: '44300', ville: 'Nantes' },
    telephone: { e164: '+33602002360', affichage: '06 02 00 23 60' },
    anneeCreation: 2009,
    noteGoogle: 4.6,
    lienMaps: null,
    coordonnees: { lat: 47.2603579, lon: -1.5721302 },
    raisonSociale: 'SOULEYMANE DOSSO (DOS SERVICES)',
    siret: '51000900400035',
  },
  redaction: {
    accroche: 'Votre plombier à Nantes, du dépannage à l’installation',
    presentation:
      'Dos-Services intervient à Nantes chez les particuliers comme chez les ' +
      'professionnels. Vous joignez directement l’artisan au téléphone.',
    prestations: ['depannage', 'chauffe-eau', 'sanitaire'],
    theme: { palette: 'cuivre', typo: 'grotesk-serif', heros: 'plomberie-01' },
  },
};

/** Raccourci : remplace la seule présentation, le reste étant sans effet ici. */
const avec = (presentation: string): SiteContent => ({
  ...BASE,
  redaction: { ...BASE.redaction, presentation },
});

describe('verifierCoherence', () => {
  it('laisse passer une rédaction qui n’avance aucun chiffre', () => {
    expect(verifierCoherence(BASE)).toEqual([]);
  });

  it('accepte une année que les faits confirment', () => {
    expect(verifierCoherence(avec('Installé à Nantes depuis 2009, Dos-Services intervient.'))).toEqual(
      [],
    );
  });

  it('refuse une année que les faits contredisent', () => {
    // Le cas qui coûte cher. Le découpage faits / rédaction protège les
    // champs structurés — le modèle ne peut pas altérer `anneeCreation` — mais
    // il ne protège pas la PROSE, où le modèle écrit librement. « Depuis
    // 2005 » sur une entreprise créée en 2009 est une invention, et elle est
    // publiée sur un site portant le nom de cette entreprise.
    //
    // C'est le seul endroit du contenu généré où la règle « pas d'invention »
    // n'était garantie que par le prompt. Elle l'est désormais par une
    // vérification.
    const ecarts = verifierCoherence(avec('Installé à Nantes depuis 2005, il intervient.'));
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]?.champ).toBe('redaction.presentation');
    expect(ecarts[0]?.message).toContain('2005');
  });

  it('refuse une année quand la base n’en connaît aucune', () => {
    // Pire que la contradiction : l'invention pure. Rien en base ne dit
    // quand l'entreprise a été créée, et le site l'annonce quand même.
    const sansAnnee: SiteContent = { ...BASE, faits: { ...BASE.faits, anneeCreation: null } };
    const ecarts = verifierCoherence({
      ...sansAnnee,
      redaction: { ...sansAnnee.redaction, presentation: 'À votre service depuis 1998 à Nantes.' },
    });
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]?.message).toContain('1998');
  });

  it('ne prend pas un code postal pour une année', () => {
    // « 44300 » contient « 4430 » : une expression trop lâche verrait une
    // année là où il n'y a qu'une adresse, et l'étage refuserait des contenus
    // parfaitement exacts.
    expect(verifierCoherence(avec('Nous intervenons dans tout le 44300 et alentour.'))).toEqual([]);
  });

  it('ne prend pas une durée pour une année', () => {
    // « plus de 10 ans » ne porte aucune date : ce n'est pas au vérificateur
    // de trancher si c'est vrai, seulement de repérer les chiffres qui
    // prétendent être des faits datés.
    expect(verifierCoherence(avec('Plus de 10 ans à intervenir sur Nantes.'))).toEqual([]);
  });

  it('refuse une note que les faits contredisent', () => {
    const ecarts = verifierCoherence(avec('Nos clients nous notent 4,9 sur Google.'));
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]?.message).toContain('4,9');
  });

  it('accepte la note exacte, écrite à la française comme à l’anglaise', () => {
    expect(verifierCoherence(avec('Une note de 4,6 sur Google.'))).toEqual([]);
    expect(verifierCoherence(avec('Une note de 4.6 sur Google.'))).toEqual([]);
  });

  it('refuse un numéro de téléphone qui n’est pas celui de la base', () => {
    // Un numéro faux dans la prose envoie les clients de l'artisan chez
    // quelqu'un d'autre. Le champ structuré est juste ; la phrase, non ; et
    // c'est la phrase qu'on lit.
    const ecarts = verifierCoherence(avec('Appelez-nous au 02 40 12 34 56.'));
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]?.message).toContain('02 40 12 34 56');
  });

  it('accepte le numéro exact, quelle que soit sa ponctuation', () => {
    expect(verifierCoherence(avec('Appelez le 06 02 00 23 60 à toute heure.'))).toEqual([]);
    expect(verifierCoherence(avec('Appelez le 06.02.00.23.60.'))).toEqual([]);
  });

  it('inspecte aussi l’accroche', () => {
    const ecarts = verifierCoherence({
      ...BASE,
      redaction: { ...BASE.redaction, accroche: 'Votre plombier à Nantes depuis 1990' },
    });
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]?.champ).toBe('redaction.accroche');
  });

  it('rapporte tous les écarts, et pas seulement le premier', () => {
    // L'étage `generate` relancera le modèle sur ces écarts. Lui en donner un
    // seul par tour multiplierait les allers-retours, donc le coût, sur une
    // tâche où chaque appel se paie.
    const ecarts = verifierCoherence(avec('Depuis 2001, noté 4,9, appelez le 02 40 12 34 56.'));
    expect(ecarts).toHaveLength(3);
  });
});
