import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ATTENTE_SURVOL, renderWithPreferences } from '../test-utils.js';
import type { JeuState } from '../data/useJeu.js';
import type { EtatBadge, Jeu } from '../domain/jeu.js';
import type { Kpis } from '../domain/today.js';
import { BandeProgression, SerieEnTete } from './BandeProgression.js';

/** Les deux compteurs réels — valeurs de la base au 1er septembre 2026 (voir `domain/today.ts`). */
const KPIS: Kpis = { inBase: 139, qualified: 25 };

/**
 * `Jeu` prêt par défaut, chaque test ne redéfinissant que ce qui l'intéresse
 * — même patron que `vue()` dans `TodayScreen.test.tsx`.
 */
function jeuPret(overrides: Partial<Jeu> = {}): JeuState {
  const defaut: Jeu = {
    objectifDuJour: { connue: true, valeur: 15 },
    realiseAujourdHui: 12,
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

describe('BandeProgression — anneau d objectif', () => {
  it('rend le realise et l objectif dans l anneau, quand la mediane est connue', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 15 }, realiseAujourdHui: 12 })} kpis={KPIS} />,
    );
    expect(screen.getByText('Objectif du jour')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('/ 15')).toBeDefined();
  });

  /**
   * LA preuve centrale du brief : un historique insuffisant se dit comme tel,
   * jamais comme un zero — et l'anneau, lui, existe toujours : rail seul,
   * denominateur textuel, jamais un nombre a la place de l'objectif inconnu.
   */
  it('rend l anneau au rail seul et un denominateur textuel quand l historique est insuffisant', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ objectifDuJour: { connue: false }, realiseAujourdHui: 0 })} kpis={KPIS} />,
    );
    expect(screen.getByText('Historique encore insuffisant')).toBeDefined();
    expect(screen.getByText('pas encore')).toBeDefined();
    // Le realise reste un vrai zero mesure (voir `relancesTenuesAujourdHui`,
    // domain/jeu.ts) : c'est le DENOMINATEUR, lui, qui ne doit jamais devenir
    // un nombre tant que l'objectif est inconnu.
    expect(screen.getByText('0')).toBeDefined();
    expect(screen.queryByText(/^\/ \d+$/)).toBeNull();
    // L'anneau (le SVG de 52px) est bien rendu, pas remplacé par un bloc de
    // texte à sa place.
    expect(document.querySelector('svg[data-anneau="objectif"]')).not.toBeNull();
  });

  it('rend aussi l anneau quand la mediane est connue, meme SVG que le cas insuffisant', () => {
    renderWithPreferences(<BandeProgression jeu={jeuPret()} kpis={KPIS} />);
    expect(document.querySelector('svg[data-anneau="objectif"]')).not.toBeNull();
  });

  it('revele au survol l explication complete de l historique insuffisant, aussi explicite qu avant', async () => {
    const user = userEvent.setup();
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ objectifDuJour: { connue: false } })} kpis={KPIS} />,
    );
    const declencheur = screen.getByText('Historique encore insuffisant').closest('[tabindex]');
    expect(declencheur).not.toBeNull();
    await user.hover(declencheur!);
    expect(
      await screen.findByText(
        'Pas encore un jour civil complet observé : aucune médiane fiable ne peut s’en déduire. Cet objectif apparaîtra dès qu’il y en aura un.',
        {},
        ATTENTE_SURVOL,
      ),
    ).toBeDefined();
  });

  it('distingue l historique insuffisant d une serie deja mesuree a zero — deux absences de nature differente', () => {
    // `serie_sept_jours` ne depend jamais de `objectifDuJour` (voir
    // `calculerBadges`, domain/jeu.ts) : meme avec l'objectif inconnu, ce
    // badge continue de rendre un FAIT reel — verrouille, puisque 0 < 7 —
    // plutot qu'un `non_mesurable` qui confondrait les deux absences. La
    // pastille ne porte plus de mot visible : c'est son `aria-label`
    // (« Verrouillé — Série de sept jours ») qui le prouve.
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
        kpis={KPIS}
      />,
    );
    expect(screen.getByText('Historique encore insuffisant')).toBeDefined();
    expect(screen.getByRole('img', { name: 'Verrouillé — Série de sept jours' })).toBeDefined();
  });
});

describe('BandeProgression — palier', () => {
  it('rend le numero et le total de points', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ palier: { points: 340, seuil: 500, numero: 1, progression: 340, complet: true } })} kpis={KPIS} />,
    );
    expect(screen.getByText('Palier 1')).toBeDefined();
    expect(screen.getByText('340 / 500 points')).toBeDefined();
  });

  it('dit que le total est incomplet quand une source ne peut pas encore etre comptee', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ palier: { points: 320, seuil: 500, numero: 1, progression: 320, complet: false } })} kpis={KPIS} />,
    );
    expect(
      screen.getByText('Total minimal : les relances tenues ne sont pas encore comptées dans ce score.'),
    ).toBeDefined();
  });

  it('ne montre aucune reserve quand le total est complet', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ palier: { points: 340, seuil: 500, numero: 1, progression: 340, complet: true } })} kpis={KPIS} />,
    );
    expect(
      screen.queryByText('Total minimal : les relances tenues ne sont pas encore comptées dans ce score.'),
    ).toBeNull();
  });
});

describe('BandeProgression — jalons, en pastilles', () => {
  const badges: readonly EtatBadge[] = [
    { id: 'premiere_relance_tenue', etat: 'obtenu' },
    { id: 'premier_site_en_ligne', etat: 'verrouille' },
    { id: 'premier_rendez_vous', etat: 'non_mesurable' },
    { id: 'serie_sept_jours', etat: 'verrouille' },
  ];

  it('nomme chaque jalon ET son etat dans l aria-label de sa pastille — plus aucun mot visible', () => {
    renderWithPreferences(<BandeProgression jeu={jeuPret({ badges })} kpis={KPIS} />);
    expect(screen.getByRole('img', { name: 'Obtenu — Première relance tenue' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'Verrouillé — Premier site en ligne' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'Non mesurable — Premier rendez-vous' })).toBeDefined();
    // Plus un seul de ces mots ne doit rester visible tel quel hors de son
    // aria-label — la refonte retire precisement le mur de texte du jour de
    // livraison.
    expect(screen.queryByText('Obtenu')).toBeNull();
    expect(screen.queryByText('Verrouillé')).toBeNull();
    expect(screen.queryByText('Non mesurable')).toBeNull();
  });

  it('donne aux trois etats trois formes distinctes (ton, trait, remplissage), pas deux', () => {
    renderWithPreferences(<BandeProgression jeu={jeuPret({ badges })} kpis={KPIS} />);

    const obtenu = screen.getByRole('img', { name: 'Obtenu — Première relance tenue' });
    const verrouille = screen.getByRole('img', { name: 'Verrouillé — Premier site en ligne' });
    const nonMesurable = screen.getByRole('img', { name: 'Non mesurable — Premier rendez-vous' });

    expect(obtenu.getAttribute('data-ton')).toBe('succes');
    expect(obtenu.getAttribute('data-discontinu')).toBeNull();
    expect(obtenu.getAttribute('data-rempli')).toBe('true');

    expect(verrouille.getAttribute('data-ton')).toBe('neutre');
    expect(verrouille.getAttribute('data-discontinu')).toBe('true');
    expect(verrouille.getAttribute('data-rempli')).toBeNull();

    expect(nonMesurable.getAttribute('data-ton')).toBe('info');
    expect(nonMesurable.getAttribute('data-discontinu')).toBe('true');
    expect(nonMesurable.getAttribute('data-rempli')).toBe('true');

    // Verrouille et non-mesurable partagent le trait discontinu (comme la
    // maquette) mais jamais le meme ton : la troisieme forme n'est donc pas
    // une simple redite de la deuxieme.
    expect(verrouille.getAttribute('data-ton')).not.toBe(nonMesurable.getAttribute('data-ton'));
    expect(screen.getAllByRole('img', { name: /—/ })).toHaveLength(4);
  });

  it('explique au survol pourquoi un badge non mesurable ne peut pas se debloquer aujourd hui', async () => {
    const user = userEvent.setup();
    renderWithPreferences(<BandeProgression jeu={jeuPret({ badges })} kpis={KPIS} />);
    const pastille = screen.getByRole('img', { name: 'Non mesurable — Premier rendez-vous' });
    await user.hover(pastille);
    expect(
      await screen.findByText(
        'Aucun geste ne peut débloquer ce badge aujourd’hui : la mesure qu’il demande n’a pas encore de source fiable côté serveur.',
        {},
        ATTENTE_SURVOL,
      ),
    ).toBeDefined();
  });
});

describe('BandeProgression — les deux compteurs reels (en base, qualifies)', () => {
  it('rend leurs valeurs reelles, quel que soit l etat du jeu', () => {
    renderWithPreferences(<BandeProgression jeu={jeuPret()} kpis={{ inBase: 139, qualified: 25 }} />);
    expect(screen.getByText('139')).toBeDefined();
    expect(screen.getByText('25')).toBeDefined();
    expect(screen.getByText('En base')).toBeDefined();
    expect(screen.getByText('Qualifiés')).toBeDefined();
  });

  it('restent visibles pendant le chargement du jeu, une donnee independante de cette lecture', () => {
    renderWithPreferences(<BandeProgression jeu={{ status: 'loading' }} kpis={{ inBase: 139, qualified: 25 }} />);
    expect(screen.getByText('139')).toBeDefined();
    expect(screen.getByText('25')).toBeDefined();
  });

  it('restent visibles sur un echec de lecture du jeu', () => {
    renderWithPreferences(<BandeProgression jeu={{ status: 'error', message: 'x' }} kpis={{ inBase: 139, qualified: 25 }} />);
    expect(screen.getByText('139')).toBeDefined();
    expect(screen.getByText('25')).toBeDefined();
  });
});

describe('BandeProgression — chargement et erreur, distincts l un de l autre et d un jeu vide', () => {
  it('dit qu elle charge, sans rien affirmer sur l objectif, le palier ou les jalons', () => {
    renderWithPreferences(<BandeProgression jeu={{ status: 'loading' }} kpis={KPIS} />);
    expect(screen.getByText('Chargement du tableau de jeu…')).toBeDefined();
    expect(screen.queryByText('Objectif du jour')).toBeNull();
    expect(screen.queryByText(/Palier/)).toBeNull();
  });

  it('garde, pendant le chargement, la meme carcasse (role de statut) que la bande chargee', () => {
    renderWithPreferences(<BandeProgression jeu={{ status: 'loading' }} kpis={KPIS} />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('nomme l echec de lecture, distinct du chargement et d un jeu vide', () => {
    renderWithPreferences(<BandeProgression jeu={{ status: 'error', message: 'RLS a refusé' }} kpis={KPIS} />);
    expect(screen.getByText('Le tableau de jeu n’a pas pu se charger : RLS a refusé')).toBeDefined();
    expect(screen.queryByText('Chargement du tableau de jeu…')).toBeNull();
    expect(screen.queryByText('Historique encore insuffisant')).toBeNull();
  });

  it('un jeu pret mais sans historique reste distinct du chargement et de l erreur', () => {
    renderWithPreferences(<BandeProgression jeu={jeuPret({ objectifDuJour: { connue: false } })} kpis={KPIS} />);
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

  /**
   * Regle changee (brief tache 8, second passage) : une serie de zero n a
   * rien a annoncer dans une barre de titre, qu elle soit mesuree ou non —
   * a la difference de l ancienne version, qui rendait ce zero comme un
   * fait visible.
   */
  it('n affiche rien quand la serie vaut zero, un fait qui n a rien a dire dans la barre du haut', () => {
    const { container } = renderWithPreferences(
      <SerieEnTete jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 4 }, serie: { jours: 0, borneAtteinte: false } })} />,
    );
    expect(container.textContent).toBe('');
  });

  /**
   * Le coeur du changement de regle : `serie.jours` et `objectifDuJour` sont
   * deux mesures DIFFERENTES (brief tache 8, second passage) — les lier
   * masquait une serie d un ou deux jours au jour meme de la livraison.
   */
  it('affiche le compteur des un jour de serie, meme si l objectif n est pas encore connu', () => {
    renderWithPreferences(
      <SerieEnTete jeu={jeuPret({ objectifDuJour: { connue: false }, serie: { jours: 5, borneAtteinte: false } })} />,
    );
    expect(screen.getByText('5 jours d’affilée')).toBeDefined();
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
