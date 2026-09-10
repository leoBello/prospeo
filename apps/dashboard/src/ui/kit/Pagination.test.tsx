import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { numerosDePage, Pagination } from './Pagination.js';
import { renderWithPreferences } from '../../test-utils.js';

describe('Pagination', () => {
  it('annonce l étendue affichée et la taille de page', () => {
    renderWithPreferences(
      <Pagination page={1} pages={13} premier={1} dernier={10} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByText('1–10 sur 127')).toBeDefined();
    expect(screen.getByText('10 par page')).toBeDefined();
  });

  it('désactive « Précédentes » sur la première page, plutôt que de la masquer', () => {
    // Un bouton qui disparaît déplace ses voisins à chaque changement de page.
    renderWithPreferences(
      <Pagination page={1} pages={13} premier={1} dernier={10} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Précédentes' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Suivantes' }).hasAttribute('disabled')).toBe(false);
  });

  it('désactive « Suivantes » sur la dernière page', () => {
    renderWithPreferences(
      <Pagination page={13} pages={13} premier={121} dernier={127} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Suivantes' }).hasAttribute('disabled')).toBe(true);
  });

  it('marque la page courante par `aria-current`, et non par la seule couleur', () => {
    renderWithPreferences(
      <Pagination page={3} pages={13} premier={21} dernier={30} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByRole('button', { current: 'page' }).getAttribute('aria-label')).toBe('Page 3 sur 13');
  });

  it('dit pourquoi les boutons de page manquent quand il n y a qu une page', () => {
    renderWithPreferences(
      <Pagination page={1} pages={1} premier={1} dernier={1} total={1} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByText('une seule page — les boutons de page ne s’affichent pas')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Suivantes' })).toBeNull();
  });

  it('prévient l appelant de la page demandée', async () => {
    const onAller = vi.fn();
    renderWithPreferences(
      <Pagination page={1} pages={13} premier={1} dernier={10} total={127} taille={10} onAller={onAller} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Suivantes' }));
    expect(onAller).toHaveBeenCalledWith(2);
  });

  it('abrège les pages du milieu sans jamais perdre la première ni la dernière', () => {
    renderWithPreferences(
      <Pagination page={7} pages={13} premier={61} dernier={70} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Page 1 sur 13' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Page 13 sur 13' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Page 4 sur 13' })).toBeNull();
  });
});

describe('numerosDePage', () => {
  // Le cas qui rend le bug visible : à `pages = 8`, un seul numéro sépare la
  // page 1 de la fenêtre autour de la page 4 — ce numéro doit être rendu, pas
  // remplacé par un saut. 7 et 8 encadrent le seuil (pages <= 7 : aucun
  // abrègement) sous lequel l'algorithme d'abrègement n'entre même pas en jeu.
  it('rend le numéro isolé plutôt qu un saut, quand un seul numéro sépare deux groupes (pages = 8)', () => {
    expect(numerosDePage(4, 8)).toEqual([1, 2, 3, 4, 5, 'saut', 8]);
  });

  it('ne déclenche aucun abrègement à pages = 7, le seuil sous lequel tout est rendu', () => {
    expect(numerosDePage(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('abrège des deux côtés quand la page courante est loin des deux bornes (pages = 13)', () => {
    expect(numerosDePage(7, 13)).toEqual([1, 'saut', 6, 7, 8, 'saut', 13]);
  });

  it('rend le numéro isolé côté fin, symétriquement (pages = 13, page proche de la fin)', () => {
    expect(numerosDePage(10, 13)).toEqual([1, 'saut', 9, 10, 11, 12, 13]);
  });

  it.each([
    [1, 8],
    [4, 8],
    [8, 8],
    [1, 13],
    [4, 13],
    [7, 13],
    [10, 13],
    [13, 13],
    [1, 1],
    [1, 7],
  ])('reste strictement croissante et sans doublon pour page=%i, pages=%i', (page, pages) => {
    const numeros = numerosDePage(page, pages).filter((n): n is number => n !== 'saut');
    // Comparer chaque numéro à celui qui le précède : reconstruit en paires
    // pour que `noUncheckedIndexedAccess` ne laisse passer aucun indice creux.
    const paires = numeros.slice(1).map((n, i) => [numeros[i]!, n] as const);
    for (const [precedent, suivant] of paires) {
      expect(suivant).toBeGreaterThan(precedent);
    }
  });

  it.each([
    [1, 8],
    [4, 8],
    [8, 8],
    [1, 13],
    [4, 13],
    [7, 13],
    [10, 13],
    [13, 13],
  ])('ne cache jamais un seul numéro derrière un « saut » (page=%i, pages=%i)', (page, pages) => {
    const sortie = numerosDePage(page, pages);
    for (let i = 0; i < sortie.length; i += 1) {
      if (sortie[i] !== 'saut') continue;
      const avant = sortie[i - 1] as number;
      const apres = sortie[i + 1] as number;
      // Un saut qui ne cacherait qu'un numéro coûterait un clic pour rien :
      // l'écart doit couvrir au moins deux numéros manquants.
      expect(apres - avant).toBeGreaterThan(2);
    }
  });
});
