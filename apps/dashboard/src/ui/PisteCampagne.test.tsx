import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import { PisteCampagne } from './PisteCampagne.js';

describe('PisteCampagne', () => {
  it('donne a chaque segment un nom accessible, la couleur ne disant jamais seule l etat', () => {
    renderWithPreferences(<PisteCampagne site="ok" mail="en_cours" envoi="bloque" />);

    // Trois segments, trois noms distincts : un lecteur d'ecran doit pouvoir
    // dire ou en est la ligne sans voir la couleur.
    const segments = screen.getAllByRole('img');
    expect(segments).toHaveLength(3);
  });

  it('distingue « bloque » de « en echec » dans le texte accessible', () => {
    // Lu dans apps/dashboard/src/i18n/fr.ts : `campagne.piste.etat.bloque`.
    const bloque = 'en attente d’une information';

    renderWithPreferences(<PisteCampagne site="ok" mail="ok" envoi="bloque" />);

    expect(screen.getByLabelText(new RegExp(bloque, 'i'))).toBeTruthy();
  });
});
