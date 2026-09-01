import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createGithubClient, CHEMIN_CONTENU } from './github.js';

/** Un `fetch` de test qui enregistre ses appels et rend des réponses scriptées. */
function faussetch(reponses: { status: number; body?: unknown }[]) {
  const appels: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fn = async (url: string, init: RequestInit = {}) => {
    appels.push({ url, init });
    const r = reponses[Math.min(i++, reponses.length - 1)] ?? { status: 200 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body ?? {}),
      json: async () => r.body ?? {},
    } as unknown as Response;
  };
  return { fn: fn as unknown as typeof fetch, appels };
}

const OPTIONS = { token: 'ghp-test', org: 'prospeo-sites', templateRepo: 'site-artisan-template' };

describe('createGithubClient', () => {
  it('authentifie et épingle la version de l’API', async () => {
    const { fn, appels } = faussetch([{ status: 200, body: { full_name: 'o/r', html_url: 'u' } }]);
    await createGithubClient({ ...OPTIONS, fetch: fn }).creerDepuisModele('dos-51000900400035', 'x');

    const entetes = appels[0]?.init.headers as Record<string, string>;
    expect(entetes['Authorization']).toBe('Bearer ghp-test');
    // Sans en-tête de version, GitHub sert la version courante — qui change
    // sans prévenir. Une chaîne cassée par une évolution d'API se découvrirait
    // au milieu d'un lot, après avoir créé la moitié des dépôts.
    expect(entetes['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(entetes['Accept']).toBe('application/vnd.github+json');
  });

  it('crée le dépôt depuis le modèle, en privé', async () => {
    const { fn, appels } = faussetch([
      { status: 201, body: { full_name: 'prospeo-sites/dos', html_url: 'https://github.com/x' } },
    ]);
    const r = await createGithubClient({ ...OPTIONS, fetch: fn }).creerDepuisModele(
      'dos-51000900400035',
      'Site de démonstration',
    );

    expect(appels[0]?.url).toBe(
      'https://api.github.com/repos/prospeo-sites/site-artisan-template/generate',
    );
    const corps = JSON.parse(String(appels[0]?.init.body));
    expect(corps.owner).toBe('prospeo-sites');
    expect(corps.name).toBe('dos-51000900400035');
    // Privé : le dépôt porte le nom d'une entreprise réelle et contient notre
    // travail éditorial. Le SITE est public — c'est Vercel qui le sert — mais
    // rien n'oblige à exposer la source, et D5 prévoit de dépublier sur refus.
    // Un dépôt public resterait, lui, indexé et forkable.
    expect(corps.private).toBe(true);
    expect(r).toEqual({ fullName: 'prospeo-sites/dos', htmlUrl: 'https://github.com/x' });
  });

  it('rend null quand le fichier de contenu n’existe pas encore', async () => {
    // 404 n'est pas une panne ici : c'est la réponse normale sur un dépôt qui
    // vient d'être créé. La confondre avec une erreur ferait échouer chaque
    // première publication.
    const { fn } = faussetch([{ status: 404 }]);
    expect(await createGithubClient({ ...OPTIONS, fetch: fn }).shaContenu('depot')).toBeNull();
  });

  it('écrit le contenu en base64 et transmet le sha en mise à jour', async () => {
    const { fn, appels } = faussetch([{ status: 200, body: { commit: { sha: 'c1' } } }]);
    await createGithubClient({ ...OPTIONS, fetch: fn }).ecrireContenu(
      'depot',
      { bonjour: 'monde' },
      'sha-precedent',
    );

    expect(appels[0]?.url).toBe(
      `https://api.github.com/repos/prospeo-sites/depot/contents/${CHEMIN_CONTENU}`,
    );
    expect(appels[0]?.init.method).toBe('PUT');
    const corps = JSON.parse(String(appels[0]?.init.body));
    // Le `sha` du fichier existant est OBLIGATOIRE en mise à jour : sans lui,
    // l'API répond 422 et l'écriture échoue silencieusement du point de vue du
    // run, qui croirait avoir republié.
    expect(corps.sha).toBe('sha-precedent');
    expect(JSON.parse(Buffer.from(corps.content, 'base64').toString('utf8'))).toEqual({
      bonjour: 'monde',
    });
  });

  it('omet le sha à la première écriture', async () => {
    const { fn, appels } = faussetch([{ status: 201, body: {} }]);
    await createGithubClient({ ...OPTIONS, fetch: fn }).ecrireContenu('depot', {}, null);
    expect(JSON.parse(String(appels[0]?.init.body)).sha).toBeUndefined();
  });

  it('écrit un JSON indenté et terminé par un saut de ligne', async () => {
    // Le fichier sera relu par un humain dans l'interface GitHub, et
    // comparé d'une version à l'autre. Un JSON sur une seule ligne rend
    // chaque régénération illisible en diff — or c'est précisément ce diff
    // qui permet la revue d'une génération.
    const { fn, appels } = faussetch([{ status: 201, body: {} }]);
    await createGithubClient({ ...OPTIONS, fetch: fn }).ecrireContenu('d', { a: 1 }, null);
    const texte = Buffer.from(
      JSON.parse(String(appels[0]?.init.body)).content,
      'base64',
    ).toString('utf8');
    expect(texte).toBe('{\n  "a": 1\n}\n');
  });

  it('remonte une erreur HTTP avec son code et son corps', async () => {
    // Un échec doit dire lequel : 403 = portée du jeton, 404 = organisation ou
    // modèle introuvable, 422 = nom déjà pris. Trois causes, trois corrections
    // différentes, et aucune ne se devine d'un « échec de publication ».
    const { fn } = faussetch([{ status: 403, body: { message: 'Resource not accessible' } }]);
    await expect(
      createGithubClient({ ...OPTIONS, fetch: fn }).creerDepuisModele('d', 'x'),
    ).rejects.toThrow(/403.*Resource not accessible/s);
  });
});

describe('CHEMIN_CONTENU', () => {
  it('désigne exactement le fichier que le gabarit importe', () => {
    // La panne la plus embarrassante que cette chaîne puisse produire, et la
    // plus silencieuse : si `publish` écrit ailleurs que là où
    // `index.astro` lit, le dépôt du prospect construit le contenu D'EXEMPLE
    // du modèle — celui de Dos-Services — sous le nom d'une autre entreprise.
    // Le build réussit, le déploiement réussit, l'URL part dans un email, et
    // c'est l'artisan qui découvre le site de quelqu'un d'autre.
    //
    // Rien ne relie ces deux fichiers : ils vivent dans deux paquets, et le
    // gabarit est délibérément autonome. Ce test EST le lien.
    const page = fileURLToPath(
      new URL('../../../site-template/src/pages/index.astro', import.meta.url),
    );
    const source = readFileSync(page, 'utf8');
    const importe = /from\s+'\.\.\/([^']+)'/g;
    const chemins = [...source.matchAll(importe)].map((m) => `src/${m[1]}`);
    expect(chemins).toContain(CHEMIN_CONTENU);
  });
});
