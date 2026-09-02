import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../../test-utils.js';
import { Absent, Card, Field } from './Card.js';
import { EmptyState } from './EmptyState.js';

describe('Card', () => {
  it('rend son titre et son contenu', () => {
    renderWithPreferences(
      <Card titre="Identité">
        <Field label="SIRET">812 456 789 00023</Field>
      </Card>,
    );
    expect(screen.getByText('Identité')).toBeDefined();
    expect(screen.getByText('SIRET')).toBeDefined();
    expect(screen.getByText('812 456 789 00023')).toBeDefined();
  });

  it('marque l absence comme un etat, sans la faire disparaitre', () => {
    // Quatre prospects sur cinq n'ont ni enrichissement ni score : l'absence
    // est l'affichage le plus frequent de l'application.
    const { container } = renderWithPreferences(<Absent>non publié par la source</Absent>);
    expect(screen.getByText('non publié par la source')).toBeDefined();
    expect(container.querySelector('[data-absent="true"]')).not.toBeNull();
  });
});

describe('EmptyState', () => {
  it('nomme le vide et dit ce qu il signifie', () => {
    renderWithPreferences(
      <EmptyState titre="Aucune relance due" detail="Les engagements tenus disparaissent d'ici." />,
    );
    expect(screen.getByText('Aucune relance due')).toBeDefined();
    expect(screen.getByText(/engagements tenus/)).toBeDefined();
  });
});
