import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows, POSTGREST_MAX_ROWS, type RangeReader } from './paginate.js';

/**
 * Serveur simulé : rend la tranche fermée [from, to] d'un tableau, en
 * appliquant le plafond `max_rows` exactement comme PostgREST le fait.
 * Aucun accès réseau — c'est l'arithmétique des tranches qu'on éprouve, pas
 * le transport.
 */
function fakeServer<T>(rows: T[], maxRows = POSTGREST_MAX_ROWS) {
  const calls: Array<[number, number]> = [];
  const read: RangeReader<T> = async (from, to) => {
    calls.push([from, to]);
    const width = Math.min(to - from + 1, maxRows);
    return { data: rows.slice(from, from + width), error: null };
  };
  return { read, calls };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('fetchAllRows', () => {
  it('rend un tableau vide quand la table est vide, sans le confondre avec une fin de pagination', async () => {
    const { read, calls } = fakeServer(rows(0));
    await expect(fetchAllRows(read, { pageSize: 10 })).resolves.toEqual([]);
    expect(calls).toEqual([[0, 9]]);
  });

  it('redemande apres une page pleine, car une page pleine ne prouve pas la fin des donnees', async () => {
    const { read, calls } = fakeServer(rows(10));
    const all = await fetchAllRows(read, { pageSize: 10 });
    expect(all).toHaveLength(10);
    // La seconde requête est la seule preuve qu'il n'y avait pas de 11ᵉ ligne.
    expect(calls).toEqual([
      [0, 9],
      [10, 19],
    ]);
  });

  it('ne perd pas la ligne qui deborde de la premiere page', async () => {
    const { read } = fakeServer(rows(11));
    const all = await fetchAllRows(read, { pageSize: 10 });
    expect(all).toHaveLength(11);
    expect(all.map((r) => r.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('demande des tranches contigues et sans recouvrement', async () => {
    const { read, calls } = fakeServer(rows(25));
    await fetchAllRows(read, { pageSize: 10 });
    expect(calls).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it('lit la table entiere au-dela du plafond serveur, la ou une lecture nue en montrerait 1000', async () => {
    const { read } = fakeServer(rows(2500));
    const all = await fetchAllRows(read);
    expect(all).toHaveLength(2500);
    expect(all.at(-1)?.id).toBe(2499);
  });

  it('refuse une taille de page superieure au plafond serveur, qui ferait passer une troncature pour une fin de donnees', async () => {
    const { read } = fakeServer(rows(3000));
    await expect(fetchAllRows(read, { pageSize: POSTGREST_MAX_ROWS + 1 })).rejects.toThrow(
      /plafond/i,
    );
  });

  it('echoue plutot que de rendre la moitie des lignes comme si c etait tout', async () => {
    const read: RangeReader<{ id: number }> = vi
      .fn<RangeReader<{ id: number }>>()
      .mockResolvedValueOnce({ data: rows(10), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'connexion perdue' } });
    await expect(fetchAllRows(read, { pageSize: 10 })).rejects.toThrow(/connexion perdue/);
  });

  it('echoue bruyamment quand le serveur ne s arrete jamais, au lieu de boucler sans fin', async () => {
    // Un serveur qui rend toujours une page pleine : sans garde-fou, la
    // boucle tourne indéfiniment dans l'onglet de l'utilisateur.
    const read: RangeReader<{ id: number }> = async () => ({ data: rows(10), error: null });
    await expect(fetchAllRows(read, { pageSize: 10, hardLimit: 35 })).rejects.toThrow(/35/);
  });
});
