/**
 * Configuration du dashboard, lue depuis les variables `VITE_*`.
 *
 * Tout ce qui porte ce préfixe est **inliné en clair dans le bundle
 * JavaScript** par Vite et servi à quiconque ouvre l'application. C'est
 * acceptable pour la clé publiable, dont c'est la raison d'être : la
 * protection ne vient pas du secret de la clé mais des politiques RLS, qui
 * n'ouvrent les sept tables qu'au rôle `authenticated`.
 *
 * Ce l'est en revanche catastrophiquement pour la clé `service_role`, qui
 * contourne RLS par construction. Une confusion de copier-coller entre les
 * deux champs voisins du tableau de bord Supabase suffirait à publier la base
 * entière — sans message d'erreur, puisque la clé secrète fonctionne, et même
 * mieux que l'autre. D'où le garde-fou ci-dessous, qui échoue au démarrage.
 */

export interface DashboardConfig {
  url: string;
  /** Clé publiable (`anon`). Publique par construction. */
  anonKey: string;
}

/** Préfixe des clés secrètes de la nouvelle génération Supabase. */
const PREFIXE_SECRET = 'sb_secret_';

/**
 * Détecte un JWT `service_role`.
 *
 * Les clés historiques sont des JWT dont le rôle est inscrit en clair dans la
 * charge utile — codée en base64url, donc illisible à l'œil nu mais
 * parfaitement lisible ici. Les deux clés d'un projet ont la même longueur,
 * le même préfixe `eyJ` et la même allure : rien ne les distingue sans
 * décoder.
 */
function estJwtServiceRole(key: string): boolean {
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  const payload = parts[1];
  if (payload === undefined) return false;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: unknown }).role === 'service_role';
  } catch {
    // Un JWT illisible n'est pas une clé service_role prouvée : on laisse
    // Supabase le rejeter à la première requête plutôt que d'inventer un
    // diagnostic ici.
    return false;
  }
}

function estUrlValide(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function readConfig(env: Record<string, string | undefined>): DashboardConfig {
  const url = env['VITE_SUPABASE_URL'];
  const anonKey = env['VITE_SUPABASE_ANON_KEY'];

  const manquantes: string[] = [];
  if (url === undefined || url === '') manquantes.push('VITE_SUPABASE_URL');
  if (anonKey === undefined || anonKey === '') manquantes.push('VITE_SUPABASE_ANON_KEY');
  if (manquantes.length > 0) {
    throw new Error(
      `Configuration du dashboard incomplète : ${manquantes.join(', ')}. ` +
        'Voir .env.example.',
    );
  }
  // Les deux tests ci-dessus garantissent l'absence de `undefined` ; TypeScript
  // ne le déduit pas d'un tableau d'effets de bord, d'où ces affirmations.
  const urlOk = url as string;
  const keyOk = anonKey as string;

  if (!estUrlValide(urlOk)) {
    throw new Error(`VITE_SUPABASE_URL n'est pas une URL absolue : « ${urlOk} ».`);
  }

  if (keyOk.startsWith(PREFIXE_SECRET) || estJwtServiceRole(keyOk)) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY contient une clé service_role. Cette clé contourne ' +
        'RLS et serait publiée dans le bundle JavaScript : la base entière deviendrait ' +
        'lisible et modifiable par qui trouve l’URL. Utiliser la clé publiable (anon).',
    );
  }

  return { url: urlOk, anonKey: keyOk };
}
