import type { NormalizedPhone } from './types.js';

/**
 * Normalise un numéro français en E.164 et détermine s'il est mobile.
 * Les préfixes 06 et 07 sont mobiles ; un mobile vaut davantage parce qu'il
 * joint l'artisan directement et ouvre la voie WhatsApp.
 */
export function normalizePhone(raw: string | null): NormalizedPhone | null {
  if (raw === null) return null;

  // Une étiquette AVANT le numéro est tolérée (« Tél : 06 … »), fréquente dans
  // les données scrapées. Une lettre à l'intérieur ou après invalide l'entrée :
  // un faux numéro se paie par un appel à un inconnu.
  const start = raw.search(/[\d+]/);
  if (start === -1) return null;
  const body = raw.slice(start);
  if (/\p{L}/u.test(body)) return null;

  let digits = body.replace(/[^\d+]/g, '');

  if (digits.startsWith('+33')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('0033')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('33') && digits.length === 11) digits = `0${digits.slice(2)}`;

  if (!/^0[1-9]\d{8}$/.test(digits)) return null;

  const kind = digits.startsWith('06') || digits.startsWith('07') ? 'mobile' : 'landline';
  return { e164: `+33${digits.slice(1)}`, kind };
}
