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

/**
 * `+33602002360` → `06 02 00 23 60`, la forme que l'on lit à voix haute.
 *
 * Vit ici plutôt que dans `site-facts.ts`, où elle était privée : le dashboard
 * en a besoin pour la colonne « Téléphone » de la veille, qui est une colonne
 * faite pour appeler — un `+33602002360` y est du format machine, qu'on ne lit
 * ni ne compose. La recopier côté interface aurait fait exister deux vérités
 * sur la même donnée.
 *
 * Une entrée qui ne commence pas par `+33` est rendue **telle quelle** : cette
 * fonction met en forme, elle ne valide pas. La validation est le travail de
 * `normalizePhone`, et un numéro étranger affiché intact vaut mieux qu'un
 * numéro tronqué par une découpe qui ne le concerne pas.
 */
export function affichageTelephone(e164: string): string {
  if (!e164.startsWith('+33')) return e164;
  const national = `0${e164.slice(3)}`;
  return national.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}
