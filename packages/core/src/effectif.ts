/** Codes de tranche d'effectif INSEE → borne basse de la tranche. */
const TRANCHES: Record<string, number> = {
  '00': 0, '01': 1, '02': 3, '03': 6,
  '11': 10, '12': 20, '21': 50, '22': 100,
  '31': 200, '32': 250, '41': 500, '42': 1000,
  '51': 2000, '52': 5000, '53': 10000,
};

/** `null` quand l'effectif n'est pas renseigné (code 'NN' ou absent). */
export function minHeadcount(code: string | null): number | null {
  if (code === null) return null;
  return TRANCHES[code] ?? null;
}
