import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import { EtapesPiste } from './EtapesPiste.js';

/**
 * La piste à cinq segments (D9) : rédaction, dépôt, projet, build, mise en
 * ligne. `retrait` n'y figure pas — voir le docstring du composant.
 *
 * Ce fichier prouve deux choses que le brief pose comme non décoratives :
 * - l'état d'un segment se lit par sa FORME (attribut `data-etat`), jamais
 *   par la seule couleur ;
 * - la piste entière porte un `aria-label` qui nomme l'étape et l'état, si
 *   bien que les cinq états du pipeline restent distinguables sans ouvrir
 *   quoi que ce soit.
 */
describe('EtapesPiste', () => {
  function segmentsRendus() {
    // `role="img"` : la piste se lit comme un tout, pas segment par segment.
    const piste = screen.getByRole('img');
    return Array.from(piste.querySelectorAll('[data-etat]')).map((el) =>
      el.getAttribute('data-etat'),
    );
  }

  it('rend cinq segments, ni plus ni moins', () => {
    renderWithPreferences(<EtapesPiste etape={null} etat="jamais" />);
    expect(segmentsRendus()).toHaveLength(5);
  });

  it('n allume aucun segment pour un site jamais deploye', () => {
    renderWithPreferences(<EtapesPiste etape={null} etat="jamais" />);
    expect(segmentsRendus()).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  });

  it('complete les etapes precedentes et allume l etape courante en cours', () => {
    // build est le 4e des 5 segments (redaction, depot, projet, build, en_ligne).
    renderWithPreferences(<EtapesPiste etape="build" etat="en_cours" />);
    expect(segmentsRendus()).toEqual(['ok', 'ok', 'ok', 'run', 'empty']);
  });

  it('marque l etape courante en echec, forme distincte du segment en cours', () => {
    renderWithPreferences(<EtapesPiste etape="build" etat="echec" />);
    expect(segmentsRendus()).toEqual(['ok', 'ok', 'ok', 'fail', 'empty']);
  });

  it('allume les cinq segments pour un site en ligne, meme sans etape connue', () => {
    // Le cas majoritaire au jour un : 22 sites en ligne, zero evenement.
    // `etapeCourante` vaut alors `null`, et la piste ne doit pas s effondrer.
    renderWithPreferences(<EtapesPiste etape={null} etat="en_ligne" />);
    expect(segmentsRendus()).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('n allume aucun segment pour un site retire, quelle que soit l etape connue', () => {
    // Parti pris de la maquette : un site retire ne montre plus sa progression
    // passee, ce qui distingue visuellement « fini et retire » de « en cours ».
    renderWithPreferences(<EtapesPiste etape="retrait" etat="retire" />);
    expect(segmentsRendus()).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  });

  it('porte un aria-label qui distingue les cinq etats', () => {
    const cas: Array<[Parameters<typeof EtapesPiste>[0]['etat'], Parameters<typeof EtapesPiste>[0]['etape']]> = [
      ['jamais', null],
      ['en_cours', 'build'],
      ['echec', 'build'],
      ['en_ligne', null],
      ['retire', null],
    ];
    const libelles = cas.map(([etat, etape]) => {
      const { unmount } = renderWithPreferences(<EtapesPiste etape={etape} etat={etat} />);
      const libelle = screen.getByRole('img').getAttribute('aria-label');
      unmount();
      return libelle;
    });
    expect(new Set(libelles).size).toBe(5);
  });

  it('nomme l etape ET l etat dans l aria-label, pas l un sans l autre', () => {
    renderWithPreferences(<EtapesPiste etape="build" etat="en_cours" />);
    const libelle = screen.getByRole('img').getAttribute('aria-label');
    expect(libelle).toContain('Build');
    expect(libelle).toMatch(/cours/);
  });
});
