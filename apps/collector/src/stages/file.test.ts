import { describe, expect, it, vi } from 'vitest';
import { prendreProchain, unSeulALaFois, type FileDeps } from './file.js';

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

describe('unSeulALaFois', () => {
  it('ne lance pas un second drainage pendant qu un premier tourne', async () => {
    // LE DEFAUT QUE CE TEST FERME. `drainer` etait appele depuis le callback
    // Realtime ET depuis un balayage toutes les 30 s, sans aucune garde : la
    // concurrence croissait d une unite toutes les 30 s sur une file longue, et
    // cinq clics rapides produisaient cinq boucles d un coup — contre le §6 du
    // spec, qui veut une concurrence bornee a 1.
    let debuts = 0;
    let liberer: (() => void) | null = null;
    const borne = unSeulALaFois(async () => {
      debuts += 1;
      await new Promise<void>((r) => {
        liberer = r;
      });
    });

    void borne();
    void borne();
    void borne();
    await Promise.resolve();

    expect(debuts).toBe(1);

    liberer!();
  });

  it('rend la main au suivant une fois le premier termine', async () => {
    // La garde borne le parallelisme, elle ne ferme pas la porte : sans cela,
    // le worker s arreterait de drainer apres son tout premier passage.
    let debuts = 0;
    const borne = unSeulALaFois(async () => {
      debuts += 1;
    });

    await borne();
    await borne();

    expect(debuts).toBe(2);
  });

  it('libere la garde meme quand le drainage echoue', async () => {
    // Une garde laissee fermee par une exception arreterait le worker POUR
    // TOUJOURS, sans rien dire : la file grossirait et plus rien n en
    // sortirait. La rejection est laissee remonter — c est a l appelant de la
    // journaliser, pas a la garde de l avaler.
    let debuts = 0;
    const borne = unSeulALaFois(async () => {
      debuts += 1;
      throw new Error('drainage interrompu');
    });

    await expect(borne()).rejects.toThrow('drainage interrompu');
    await expect(borne()).rejects.toThrow('drainage interrompu');

    expect(debuts).toBe(2);
  });
});
