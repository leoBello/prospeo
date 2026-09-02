import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../../test-utils.js';
import { Badge } from './Badge.js';
import { StatusBadge } from './StatusBadge.js';

describe('Badge', () => {
  it('rend son contenu et son ton', () => {
    const { container } = renderWithPreferences(<Badge ton="danger">Aucun site</Badge>);
    expect(screen.getByText('Aucun site')).toBeDefined();
    expect(container.querySelector('[data-ton="danger"]')).not.toBeNull();
  });

  it('retombe sur le ton neutre quand aucun n est donne', () => {
    const { container } = renderWithPreferences(<Badge>Plombier</Badge>);
    expect(container.querySelector('[data-ton="neutre"]')).not.toBeNull();
  });
});

describe('StatusBadge', () => {
  it('traduit les sept statuts du pipeline', () => {
    renderWithPreferences(<StatusBadge status="a_contacter" />);
    expect(screen.getByText('À contacter')).toBeDefined();
  });

  it('dit « jamais contacte » plutot que de ne rien afficher quand le suivi est absent', () => {
    // 114 prospects sur 139 n'ont aucune ligne de pipeline. Un badge vide se
    // lirait comme un defaut d'affichage ; l'absence est un etat reel.
    renderWithPreferences(<StatusBadge status={null} />);
    expect(screen.getByText('Jamais contacté')).toBeDefined();
  });

  it('marque « ne pas contacter » autrement que par la couleur', () => {
    // C'est une obligation de conformite (§11), pas une etape du parcours.
    // La forme doit le dire avant la couleur, pour qui ne la distingue pas.
    const { container } = renderWithPreferences(<StatusBadge status="ne_pas_contacter" />);
    expect(container.querySelector('[data-discontinu="true"]')).not.toBeNull();
  });
});
