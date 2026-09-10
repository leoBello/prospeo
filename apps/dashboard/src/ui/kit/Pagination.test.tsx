import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination.js';
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
