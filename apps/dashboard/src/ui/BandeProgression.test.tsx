import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ATTENTE_SURVOL, renderWithPreferences } from '../test-utils.js';
import type { JeuState } from '../data/useJeu.js';
import type { EtatBadge, Jeu } from '../domain/jeu.js';
import type { Kpis } from '../domain/today.js';
import { BandeProgression, SerieEnTete } from './BandeProgression.js';
import styles from './BandeProgression.module.css';

/** Circonférence du rail de l'anneau — même calcul que `Anneau` (BandeProgression.tsx), recopié pour ne pas dépendre d'un export interne. */
const CIRCONFERENCE_ANNEAU = 2 * Math.PI * 22;

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
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('/ 15')).toBeDefined();
  });

  /**
   * Correctif de revue (troisieme passage) : la maquette n ecrit « Objectif
   * du jour » que dans l infobulle (l.120) — l anneau se suffit visuellement.
   * On verifie la classe reellement appliquee plutot que la seule presence
   * du texte dans le DOM : `getByText` le trouverait de toute facon, meme
   * derriere l utilitaire *sr-only* `.accessible`, `jsdom` ne distinguant pas
   * les deux. Le nom de la classe, lui, prouve laquelle des deux est active.
   */
  it('ne montre plus la legende « Objectif du jour » en clair quand la mediane est connue — seule l infobulle la porte desormais', () => {
    const { container } = renderWithPreferences(<BandeProgression jeu={jeuPret()} kpis={KPIS} />);
    expect(container.getElementsByClassName(styles.objectifLegende!)).toHaveLength(0);
    // L anneau reste NOMME pour un lecteur d ecran malgre tout : la meme
    // phrase migre vers l utilitaire sr-only plutot que de disparaitre.
    const accessible = container.getElementsByClassName(styles.accessible!);
    expect(Array.from(accessible).some((n) => n.textContent === 'Objectif du jour')).toBe(true);
  });

  it('garde en revanche la legende visible « Historique encore insuffisant » — c est precisement ce que ce lot doit dire', () => {
    const { container } = renderWithPreferences(
      <BandeProgression jeu={jeuPret({ objectifDuJour: { connue: false } })} kpis={KPIS} />,
    );
    const legende = container.getElementsByClassName(styles.objectifLegende!);
    expect(legende).toHaveLength(1);
    expect(legende[0]?.textContent).toBe('Historique encore insuffisant');
  });

  /**
   * Correctif de revue (troisieme passage) : un objectif de zero, atteint
   * des qu une seule relance est tenue aujourd hui, doit remplir l anneau —
   * pas le laisser vide comme le faisait `objectif.valeur > 0 ? … : 0`.
   * `stroke-dashoffset` a 0 est la preuve directe d un arc plein, seule
   * grandeur de l anneau que `jsdom` calcule reellement (un attribut SVG,
   * pas une mise en page).
   */
  it('remplit l anneau quand l objectif du jour vaut zero et qu une relance a deja ete tenue', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 0 }, realiseAujourdHui: 1 })} kpis={KPIS} />,
    );
    const progres = document.querySelector('[data-anneau-partie="progres"]');
    expect(progres).not.toBeNull();
    expect(Number(progres!.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5);
  });

  it('remplit aussi l anneau quand l objectif du jour vaut zero et que rien n a encore ete tenue aujourd hui', () => {
    // Un objectif de zero est rempli des sa mesure, meme par un realise nul —
    // c est un objectif vacuement atteint, pas une absence.
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 0 }, realiseAujourdHui: 0 })} kpis={KPIS} />,
    );
    const progres = document.querySelector('[data-anneau-partie="progres"]');
    expect(Number(progres!.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5);
  });

  it('calcule le decalage de l arc proportionnellement au ratio realise / objectif quand l objectif n est pas nul', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 15 }, realiseAujourdHui: 12 })} kpis={KPIS} />,
    );
    const progres = document.querySelector('[data-anneau-partie="progres"]');
    // 12/15 = 80 % : il reste 20 % de rail visible, soit 20 % de la circonference.
    expect(Number(progres!.getAttribute('stroke-dashoffset'))).toBeCloseTo(CIRCONFERENCE_ANNEAU * 0.2, 2);
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
  /**
   * Arbitrage du proprietaire (troisieme passage) : les noms de la maquette
   * (« Palier Prospecteur → Closer ») remplacent le nu « Palier 1 » pour les
   * deux premiers paliers.
   */
  it('nomme le palier courant et le suivant, comme la maquette, pour le premier palier', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ palier: { points: 340, seuil: 500, numero: 1, progression: 340, complet: true } })} kpis={KPIS} />,
    );
    expect(screen.getByText('Palier Prospecteur')).toBeDefined();
    expect(screen.getByText('Closer')).toBeDefined();
    expect(screen.getByText('340 / 500 points')).toBeDefined();
  });

  it('nomme le palier courant meme quand le suivant n a pas de nom dans la maquette', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ palier: { points: 600, seuil: 500, numero: 2, progression: 100, complet: true } })} kpis={KPIS} />,
    );
    expect(screen.getByText('Palier Closer')).toBeDefined();
    // Repli honnete : la maquette ne nomme pas de troisieme palier.
    expect(screen.getByText('Palier 3')).toBeDefined();
  });

  it('retombe sur « Palier N » pour le courant ET le suivant, au dela des noms de la maquette', () => {
    renderWithPreferences(
      <BandeProgression jeu={jeuPret({ palier: { points: 1200, seuil: 500, numero: 3, progression: 200, complet: true } })} kpis={KPIS} />,
    );
    expect(screen.getByText('Palier 3')).toBeDefined();
    expect(screen.getByText('Palier 4')).toBeDefined();
    // Aucun nom fabrique ne doit apparaitre a la place.
    expect(screen.queryByText(/Prospecteur|Closer/)).toBeNull();
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

  /**
   * Ce test ne prouve QUE la presence d un role de statut accessible pendant
   * le chargement — pas une invariance de hauteur : `jsdom` ne calcule
   * aucune mise en page, et la bande chargee ne porte elle-meme aucun
   * `role="status"` (voir le docstring de `Squelette`, BandeProgression.tsx).
   * Le nom du test le dit explicitement pour ne rien laisser croire de plus.
   */
  it('expose un role de statut accessible pendant le chargement (pas une preuve de hauteur — voir le rapport de tache)', () => {
    renderWithPreferences(<BandeProgression jeu={{ status: 'loading' }} kpis={KPIS} />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  /**
   * Correctif de revue (troisieme passage) : l ancien squelette n imitait
   * que trois rangees du palier (ligne, barre, ligne) — la bande chargee en
   * rend jusqu a QUATRE (en-tete, barre, note d incompletude, poids), et
   * c est precisement l etat du jour de la livraison (`palier.complet ===
   * false`, voir `calculerPalier`, domain/jeu.ts). C est ce qui faisait
   * grandir la bande visiblement au moment ou les donnees arrivaient. Seul
   * le NOMBRE de rangees imitees est verifiable ici — pas leur hauteur
   * reelle, que `jsdom` ne calcule pas.
   */
  it('le squelette du palier imite les quatre rangees reelles (dont la note d incompletude), pas seulement trois', () => {
    renderWithPreferences(<BandeProgression jeu={{ status: 'loading' }} kpis={KPIS} />);
    const blocPalier = document.querySelector('[data-squelette-bloc="palier"]');
    expect(blocPalier).not.toBeNull();
    expect(blocPalier!.children).toHaveLength(4);
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
  /**
   * Correctif de revue (troisieme passage) : la maquette ecrit « 6 jours »
   * (l.94), pas « 6 jours d'affilée » — le sens complet vit dans l infobulle
   * (`jeu.serie.hint`).
   */
  it('rend le nombre exact tant que la fenetre lue n est pas atteinte', () => {
    renderWithPreferences(
      <SerieEnTete jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 4 }, serie: { jours: 3, borneAtteinte: false } })} />,
    );
    expect(screen.getByText('3 jours')).toBeDefined();
  });

  it('dit « au moins N jours » quand le decompte a atteint le bord de la fenetre lue', () => {
    renderWithPreferences(
      <SerieEnTete jeu={jeuPret({ objectifDuJour: { connue: true, valeur: 4 }, serie: { jours: 14, borneAtteinte: true } })} />,
    );
    expect(screen.getByText('Au moins 14 jours')).toBeDefined();
    // Jamais le nombre nu, que le code ne peut pas garantir exact ici.
    expect(screen.queryByText('14 jours')).toBeNull();
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
    expect(screen.getByText('5 jours')).toBeDefined();
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
