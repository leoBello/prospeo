import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import type { JeuState } from '../data/useJeu.js';
import type { EtatBadge, Jeu } from '../domain/jeu.js';
import { BandeProgression, SerieEnTete } from './BandeProgression.js';

/**
 * `Jeu` prêt par défaut, chaque test ne redéfinissant que ce qui l'intéresse
 * — même patron que `vue()` dans `TodayScreen.test.tsx`.
 */
function jeuPret(overrides: Partial<Jeu> = {}): JeuState {
  const defaut: Jeu = {
    objectifDuJour: { connue: true, valeur: 12 },
    serie: { jours: 6, borneAtteinte: false },
    palier: { points: 340, seuil: 500, numero: 1, progression: 340, complet: true },
    badges: [
      { id: 'premiere_relance_tenue', etat: 'obtenu' },
      { id: 'premier_site_en_ligne', etat: 'verrouille' },
      { id: 'premier_rendez_vous', etat: 'verrouille' },
      { id: 'serie_sept_jours', etat: 'verrouille' },
    ],
    ...overrides,
  };
  return { status: 'ready', jeu: defaut };
}

describe('BandeProgression — objectif du jour', () => {
  it('rend la valeur reelle quand la mediane est connue', () => {
    renderWithPreferences(<BandeProgression jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 12 } })} />);
    expect(screen.getByText('12 relances tenues')).toBeDefined();
  });

  /**
   * LA preuve centrale du brief : un historique insuffisant se dit comme tel,
   * jamais comme un zero. `objectifDuJour: {connue: false}` est l'etat du
   * jour de la livraison — la table `pipeline_event` vient d'etre creee.
   */
  it('dit que l historique est insuffisant, jamais un zero qui se lirait comme un echec', () => {
    renderWithPreferences(<BandeProgression jeu={jeuPret({ objectifDuJour: { connue: false } })} />);
    expect(screen.getByText('Historique encore insuffisant')).toBeDefined();
    expect(
      screen.getByText(
        'Pas encore un jour civil complet observé : aucune médiane fiable ne peut s’en déduire. Cet objectif apparaîtra dès qu’il y en aura un.',
      ),
    ).toBeDefined();
    // Ni un `0` nu, ni la valeur de l'objectif (« N relances tenues ») que
    // rendrait un historique suffisant — le motif exige un chiffre en tete
    // pour ne pas se confondre avec « Première relance tenue » (titre d'un
    // jalon) ou « +40 pts · relance tenue » (poids du palier), tous deux
    // presents par ailleurs sur cette bande.
    expect(screen.queryByText(/^\d+ relances? tenues?$/)).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('distingue l historique insuffisant d une serie deja mesuree a zero — deux absences de nature differente', () => {
    // `serie_sept_jours` ne depend jamais de `objectifDuJour` (voir
    // `calculerBadges`, domain/jeu.ts) : meme avec l'objectif inconnu, ce
    // badge continue de rendre un FAIT reel — verrouille, puisque 0 < 7 —
    // plutot qu'un `non_mesurable` qui confondrait les deux absences.
    renderWithPreferences(
      <BandeProgression
        jeu={jeuPret({
          objectifDuJour: { connue: false },
          serie: { jours: 0, borneAtteinte: false },
          badges: [
            { id: 'premiere_relance_tenue', etat: 'non_mesurable' },
            { id: 'premier_site_en_ligne', etat: 'verrouille' },
            { id: 'premier_rendez_vous', etat: 'verrouille' },
            { id: 'serie_sept_jours', etat: 'verrouille' },
          ],
        })}
      />,
    );
    expect(screen.getByText('Historique encore insuffisant')).toBeDefined();
    expect(screen.getByText('Série de sept jours')).toBeDefined();
    // Le badge de série est bien un fait mesuré (verrouillé), pas une
    // troisième copie de l'absence de l'objectif.
    expect(screen.getByText('Série de sept jours').closest('span')?.parentElement?.textContent).toContain(
      'Verrouillé',
    );
  });
});

describe('BandeProgression — palier', () => {
  it('rend le numero et le total de points', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ palier: { points: 340, seuil: 500, numero: 1, progression: 340, complet: true } })} />,
    );
    expect(screen.getByText('Palier 1')).toBeDefined();
    expect(screen.getByText('340 / 500 points')).toBeDefined();
  });

  it('dit que le total est incomplet quand une source ne peut pas encore etre comptee', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ palier: { points: 320, seuil: 500, numero: 1, progression: 320, complet: false } })} />,
    );
    expect(
      screen.getByText('Total minimal : les relances tenues ne sont pas encore comptées dans ce score.'),
    ).toBeDefined();
  });

  it('ne montre aucune reserve quand le total est complet', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ palier: { points: 340, seuil: 500, numero: 1, progression: 340, complet: true } })} />,
    );
    expect(
      screen.queryByText('Total minimal : les relances tenues ne sont pas encore comptées dans ce score.'),
    ).toBeNull();
  });
});

describe('BandeProgression — jalons', () => {
  const badges: readonly EtatBadge[] = [
    { id: 'premiere_relance_tenue', etat: 'obtenu' },
    { id: 'premier_site_en_ligne', etat: 'verrouille' },
    { id: 'premier_rendez_vous', etat: 'non_mesurable' },
    { id: 'serie_sept_jours', etat: 'verrouille' },
  ];

  it('rend le mot de chacun des trois etats — jamais la seule couleur pour les distinguer', () => {
    // Un seul badge par etat ici : `getByText` leve a plus d'une occurrence,
    // et `badges` ci-dessus porte deux fois « Verrouillé ».
    renderWithPreferences(
      <BandeProgression
        jeu={jeuPret({
          badges: [
            { id: 'premiere_relance_tenue', etat: 'obtenu' },
            { id: 'premier_site_en_ligne', etat: 'verrouille' },
            { id: 'premier_rendez_vous', etat: 'non_mesurable' },
          ],
        })}
      />,
    );
    expect(screen.getByText('Obtenu')).toBeDefined();
    expect(screen.getByText('Verrouillé')).toBeDefined();
    expect(screen.getByText('Non mesurable')).toBeDefined();
  });

  it('donne aux trois etats trois formes distinctes (ton et trait), pas deux', () => {
    const { container } = renderWithPreferences(<BandeProgression jeu={jeuPret({ badges })} />);

    const obtenu = screen.getByText('Première relance tenue').closest('[data-ton]');
    const verrouille = screen.getByText('Premier site en ligne').closest('[data-ton]');
    const nonMesurable = screen.getByText('Premier rendez-vous').closest('[data-ton]');

    expect(obtenu?.getAttribute('data-ton')).toBe('succes');
    expect(obtenu?.getAttribute('data-discontinu')).toBeNull();

    expect(verrouille?.getAttribute('data-ton')).toBe('neutre');
    expect(verrouille?.getAttribute('data-discontinu')).toBe('true');

    expect(nonMesurable?.getAttribute('data-ton')).toBe('info');
    expect(nonMesurable?.getAttribute('data-discontinu')).toBe('true');

    // Verrouille et non-mesurable partagent le trait discontinu (comme la
    // maquette) mais jamais le meme ton : la troisieme forme n'est donc pas
    // une simple redite de la deuxieme.
    expect(verrouille?.getAttribute('data-ton')).not.toBe(nonMesurable?.getAttribute('data-ton'));
    // Les quatre jalons de `badges` ci-dessus rendent chacun un `Badge`.
    expect(container.querySelectorAll('[data-ton]')).toHaveLength(4);
  });

  it('explique pourquoi un badge non mesurable ne peut pas se debloquer aujourd hui', () => {
    renderWithPreferences(<BandeProgression jeu={jeuPret({ badges })} />);
    // Le texte vit dans l'infobulle (kit/Tooltip) : present dans le document,
    // meme avant survol (Base UI le monte au clic/focus, pas nécessairement
    // avant), donc on verifie plutot le declencheur accessible au clavier.
    expect(screen.getByText('Non mesurable').closest('[tabindex]')).not.toBeNull();
  });
});

describe('BandeProgression — chargement et erreur, distincts l un de l autre et d un jeu vide', () => {
  it('dit qu elle charge, sans rien affirmer sur l objectif, le palier ou les jalons', () => {
    renderWithPreferences(<BandeProgression jeu={{ status: 'loading' }} />);
    expect(screen.getByText('Chargement du tableau de jeu…')).toBeDefined();
    expect(screen.queryByText('Objectif du jour')).toBeNull();
    expect(screen.queryByText(/Palier/)).toBeNull();
  });

  it('nomme l echec de lecture, distinct du chargement et d un jeu vide', () => {
    renderWithPreferences(<BandeProgression jeu={{ status: 'error', message: 'RLS a refusé' }} />);
    expect(screen.getByText('Le tableau de jeu n’a pas pu se charger : RLS a refusé')).toBeDefined();
    expect(screen.queryByText('Chargement du tableau de jeu…')).toBeNull();
    expect(screen.queryByText('Historique encore insuffisant')).toBeNull();
  });

  it('un jeu pret mais sans historique reste distinct du chargement et de l erreur', () => {
    renderWithPreferences(<BandeProgression jeu={jeuPret({ objectifDuJour: { connue: false } })} />);
    expect(screen.getByText('Historique encore insuffisant')).toBeDefined();
    expect(screen.queryByText('Chargement du tableau de jeu…')).toBeNull();
    expect(screen.queryByText(/n’a pas pu se charger/)).toBeNull();
  });
});

describe('SerieEnTete — le compteur de serie de la barre du haut', () => {
  it('rend le nombre exact tant que la fenetre lue n est pas atteinte', () => {
    renderWithPreferences(
      <SerieEnTete jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 4 }, serie: { jours: 3, borneAtteinte: false } })} />,
    );
    expect(screen.getByText('3 jours d’affilée')).toBeDefined();
  });

  it('dit « au moins N jours » quand le decompte a atteint le bord de la fenetre lue', () => {
    renderWithPreferences(
      <SerieEnTete jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 4 }, serie: { jours: 14, borneAtteinte: true } })} />,
    );
    expect(screen.getByText('Au moins 14 jours d’affilée')).toBeDefined();
    // Jamais le nombre nu, que le code ne peut pas garantir exact ici.
    expect(screen.queryByText('14 jours d’affilée')).toBeNull();
  });

  it('rend une serie mesuree a zero comme un vrai zero, une fois l objectif connu', () => {
    renderWithPreferences(
      <SerieEnTete jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 0 }, serie: { jours: 0, borneAtteinte: false } })} />,
    );
    expect(screen.getByText('0 jour d’affilée')).toBeDefined();
  });

  /**
   * La regle du point 1 du brief s'applique EN PREMIER au compteur de la
   * barre : meme avec une serie deja mesuree, rien ne s'affiche tant que
   * l'objectif ne peut trancher — le jour de la livraison, precisement.
   */
  it('n affiche rien tant que l historique ne permet pas de trancher, meme avec une serie deja mesuree', () => {
    const { container } = renderWithPreferences(
      <SerieEnTete jeu={jeuPret({ objectifDuJour: { connue: false }, serie: { jours: 5, borneAtteinte: false } })} />,
    );
    expect(container.textContent).toBe('');
  });

  it('n affiche rien pendant le chargement', () => {
    const { container } = renderWithPreferences(<SerieEnTete jeu={{ status: 'loading' }} />);
    expect(container.textContent).toBe('');
  });

  it('n affiche rien sur un echec de lecture', () => {
    const { container } = renderWithPreferences(<SerieEnTete jeu={{ status: 'error', message: 'x' }} />);
    expect(container.textContent).toBe('');
  });
});
