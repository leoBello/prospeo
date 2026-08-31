const LEGAL_FORMS = new Set([
  'sarl', 'sas', 'sasu', 'eurl', 'sa', 'snc', 'sci', 'scop', 'scm',
  'ei', 'eirl', 'earl', 'gie', 'selarl', 'sel', 'etablissements', 'ets',
]);

/**
 * Réduit une raison sociale à une forme comparable :
 * minuscules, sans accents, sans forme juridique, ponctuation normalisée.
 */
export function normalizeCompanyName(raw: string): string {
  const deaccented = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritiques combinants
    .toLowerCase();

  const spaced = deaccented
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (spaced === '') return '';

  const kept = spaced.split(' ').filter((word) => !LEGAL_FORMS.has(word));
  return kept.join(' ');
}
