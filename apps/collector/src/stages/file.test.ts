import { describe, expect, it, vi } from 'vitest';
import { prendreProchain, type FileDeps } from './file.js';

/** Un jeu de dépendances où tout réussit, que chaque test spécialise. */
function deps(surcharges: Partial<FileDeps> = {}): FileDeps {
  return {
    listerEnAttente: async () => [],
    prendre: async () => true,
    ...surcharges,
  };
}

describe('prendreProchain', () => {
  it('rend null quand la file est vide, sans tenter de prise', async () => {
    const prendre = vi.fn(async () => true);
    const job = await prendreProchain(deps({ prendre }));

    expect(job).toBeNull();
    // Une prise à vide écrirait en base sans raison, à chaque battement.
    expect(prendre).not.toHaveBeenCalled();
  });

  it('prend le premier job de la liste', async () => {
    const job = await prendreProchain(
      deps({
        listerEnAttente: async () => [
          { id: 7, prospect_id: 'p-7', campaign_id: null, attempts: 0 },
        ],
      }),
    );

    expect(job).toEqual({ id: 7, prospectId: 'p-7', campaignId: null, attempts: 0 });
  });

  it('passe au suivant quand un autre worker a pris le premier', async () => {
    // `prendre` rend `false` quand la mise à jour conditionnelle n'a touché
    // aucune ligne : entre la lecture et l'écriture, quelqu'un d'autre a
    // changé l'état. C'est la course qu'on doit perdre proprement, et non
    // ignorer.
    const prendre = vi.fn(async (id: number) => id !== 7);
    const job = await prendreProchain(
      deps({
        listerEnAttente: async () => [
          { id: 7, prospect_id: 'p-7', campaign_id: null, attempts: 0 },
          { id: 8, prospect_id: 'p-8', campaign_id: 'c-1', attempts: 2 },
        ],
        prendre,
      }),
    );

    expect(job).toEqual({ id: 8, prospectId: 'p-8', campaignId: 'c-1', attempts: 2 });
    expect(prendre).toHaveBeenCalledTimes(2);
  });

  it('rend null quand toute la liste a ete prise par ailleurs', async () => {
    // Distinct du cas « file vide » : ici il y avait du travail, et il est
    // parti. Rendre autre chose que null ferait traiter un job qu'on ne
    // possede pas. Sans l'assertion sur `prendre`, ce test rougirait
    // pareillement si la boucle n'etait jamais parcourue : elle prouve donc
    // qu'une prise a bien ete tentee sur l'unique candidat, et pas seulement
    // que le resultat final est null.
    const prendre = vi.fn(async () => false);
    const job = await prendreProchain(
      deps({
        listerEnAttente: async () => [
          { id: 7, prospect_id: 'p-7', campaign_id: null, attempts: 0 },
        ],
        prendre,
      }),
    );

    expect(job).toBeNull();
    expect(prendre).toHaveBeenCalledTimes(1);
  });
});
