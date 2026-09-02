import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ATTENTE_SURVOL, renderWithPreferences } from '../../test-utils.js';
import { Tooltip } from './Tooltip.js';

describe('Tooltip', () => {
  it('garde le contenu hors du DOM tant que rien ne le demande', () => {
    renderWithPreferences(
      <Tooltip contenu="Google ne publie plus le nombre d'avis.">
        <button type="button">non publié</button>
      </Tooltip>,
    );
    expect(screen.queryByText(/ne publie plus/)).toBeNull();
  });

  it('revele le contenu au survol', async () => {
    const user = userEvent.setup();
    renderWithPreferences(
      <Tooltip contenu="Google ne publie plus le nombre d'avis.">
        <button type="button">non publié</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'non publié' }));
    expect(await screen.findByText(/ne publie plus/, {}, ATTENTE_SURVOL)).toBeDefined();
  });

  it('rend l intitule au-dessus du contenu, et non a la place', async () => {
    // `intitule` est rendu par cinq appelants et n'avait aucune couverture :
    // le supprimer du composant n'aurait fait echouer aucun test, alors qu'il
    // nomme la nature de l'explication (« Confiance d'appariement », « Avis »)
    // sans laquelle la phrase seule ne dit pas de quoi elle parle.
    const user = userEvent.setup();
    renderWithPreferences(
      <Tooltip intitule="Confiance d'appariement" contenu="Sous le seuil haut, le rattachement est un pari.">
        <button type="button">94 %</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: '94 %' }));
    const bulle = await screen.findByRole('tooltip', {}, ATTENTE_SURVOL);
    expect(bulle.textContent).toContain("Confiance d'appariement");
    expect(bulle.textContent).toContain('le rattachement est un pari');
  });

  it('expose l infobulle au lecteur d ecran, et la rattache a son declencheur', async () => {
    // « La semantique ARIA » est l'une des trois raisons invoquees pour
    // dependre de Base UI plutot que d'ecrire l'infobulle a la main. Rien ne
    // la verifiait : une regression du cablage aurait laisse une bulle
    // visible a la souris et muette au lecteur d'ecran.
    const user = userEvent.setup();
    renderWithPreferences(
      <Tooltip contenu="Google ne publie plus le nombre d'avis.">
        <button type="button">non publié</button>
      </Tooltip>,
    );
    const declencheur = screen.getByRole('button', { name: 'non publié' });
    await user.hover(declencheur);
    const bulle = await screen.findByRole('tooltip', {}, ATTENTE_SURVOL);

    // Le lien est ce qui compte : un `role="tooltip"` que rien ne reference
    // n'est jamais annonce.
    const decrit = declencheur.getAttribute('aria-describedby');
    expect(decrit).not.toBeNull();
    expect(bulle.getAttribute('id')).toBe(decrit);
  });

  it('revele le contenu au clavier seul, sans souris', async () => {
    // Une infobulle qui ne s'ouvre qu'au survol est une infobulle que les
    // personnes naviguant au clavier ne liront jamais. Aucun événement de
    // pointeur n'est émis ici : `tab()` ne déplace que le focus.
    const user = userEvent.setup();
    renderWithPreferences(
      <Tooltip contenu="Le gabarit du metier l'emporte sur le gabarit actif.">
        <button type="button">?</button>
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: '?' })).toBe(document.activeElement);
    expect(await screen.findByText(/l'emporte/)).toBeDefined();
  });
});
