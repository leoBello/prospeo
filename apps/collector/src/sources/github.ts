/**
 * Le strict nécessaire de l'API GitHub pour la tâche 3.
 *
 * Trois opérations, pas une de plus : créer un dépôt depuis le modèle, lire le
 * `sha` du fichier de contenu, l'écrire. Aucune bibliothèque cliente — Octokit
 * apporterait une surface d'API entière et ses dépendances pour trois requêtes
 * dont on veut contrôler exactement les en-têtes et les corps.
 *
 * `fetch` est injecté comme `DomainDeps` l'est dans `domains.ts` : c'est ce qui
 * permet d'éprouver la totalité de cet étage sans jamais toucher au réseau, et
 * donc de l'écrire avant même que l'organisation dédiée existe.
 */

const BASE = 'https://api.github.com';

/**
 * Version d'API épinglée.
 *
 * Sans cet en-tête, GitHub sert la version courante — qui change sans
 * prévenir. Une chaîne cassée par une évolution d'API se découvrirait au
 * milieu d'un lot, après avoir créé la moitié des dépôts.
 */
const API_VERSION = '2022-11-28';

/**
 * Emplacement du fichier de contenu dans le dépôt.
 *
 * C'est le SEUL fichier que `publish` écrit par-dessus le modèle (tâche 3).
 * Le chemin doit donc correspondre exactement à celui qu'importe
 * `apps/site-template/src/pages/index.astro` ; s'ils divergent, le dépôt du
 * prospect construira le contenu d'exemple du modèle — celui de Dos-Services —
 * sous le nom d'une autre entreprise. C'est la panne la plus embarrassante que
 * cette chaîne puisse produire, et elle serait silencieuse : le build
 * réussirait.
 */
export const CHEMIN_CONTENU = 'src/content/site.json';

export interface GithubOptions {
  token: string;
  /** Organisation dédiée (D4). Le jeton n'a de portée que sur elle. */
  org: string;
  fetch?: typeof fetch;
}

export interface DepotCree {
  fullName: string;
  htmlUrl: string;
}

export interface GithubClient {
  /**
   * `templateRepo` est un ARGUMENT et non une option du client : le modèle
   * dépend du métier du prospect traité (`Trade.templateRepo`), pas du run.
   * Un même lot peut donc mêler des plombiers et des serruriers sans qu'on
   * ait à construire deux clients ni à le scinder.
   */
  creerDepuisModele(templateRepo: string, nom: string, description: string): Promise<DepotCree>;
  shaContenu(depot: string): Promise<string | null>;
  ecrireContenu(depot: string, contenu: unknown, sha: string | null): Promise<void>;
}

export function createGithubClient(options: GithubOptions): GithubClient {
  const appeler = options.fetch ?? fetch;

  const entetes = (): Record<string, string> => ({
    Authorization: `Bearer ${options.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'Content-Type': 'application/json',
    'User-Agent': 'ProspeoBot/1.0',
  });

  /**
   * Remonte une erreur HTTP avec son code ET son corps.
   *
   * Un échec doit dire lequel : 403 signale la portée du jeton, 404 une
   * organisation ou un modèle introuvable — ou un modèle non marqué
   * « template » —, 422 un nom déjà pris. Trois causes, trois corrections
   * différentes, et aucune ne se devine d'un « échec de publication ».
   */
  const echec = async (reponse: Response, quoi: string): Promise<never> => {
    const corps = await reponse.text().catch(() => '');
    throw new Error(`GitHub ${quoi} : ${reponse.status} — ${corps}`);
  };

  return {
    async creerDepuisModele(templateRepo, nom, description) {
      const reponse = await appeler(
        `${BASE}/repos/${options.org}/${templateRepo}/generate`,
        {
          method: 'POST',
          headers: entetes(),
          body: JSON.stringify({
            owner: options.org,
            name: nom,
            description,
            // Privé. Le dépôt porte le nom d'une entreprise réelle et contient
            // notre travail éditorial ; le SITE est public, c'est Vercel qui
            // le sert. Rien n'oblige à exposer la source, et D5 prévoit de
            // dépublier sur refus — un dépôt public resterait indexé et
            // forkable bien après.
            private: true,
            include_all_branches: false,
          }),
        },
      );
      if (!reponse.ok) return echec(reponse, `création de ${nom}`);
      const corps = (await reponse.json()) as { full_name: string; html_url: string };
      return { fullName: corps.full_name, htmlUrl: corps.html_url };
    },

    async shaContenu(depot) {
      const reponse = await appeler(
        `${BASE}/repos/${options.org}/${depot}/contents/${CHEMIN_CONTENU}`,
        { headers: entetes() },
      );
      // 404 n'est pas une panne : c'est la réponse normale sur un dépôt qui
      // vient d'être créé. La confondre avec une erreur ferait échouer chaque
      // première publication.
      if (reponse.status === 404) return null;
      if (!reponse.ok) return echec(reponse, `lecture du contenu de ${depot}`);
      return ((await reponse.json()) as { sha: string }).sha;
    },

    async ecrireContenu(depot, contenu, sha) {
      // Indenté et terminé par un saut de ligne : ce fichier sera relu par un
      // humain dans l'interface GitHub et comparé d'une version à l'autre. Un
      // JSON sur une seule ligne rend chaque régénération illisible en diff —
      // or c'est ce diff qui permet la revue d'une génération.
      const texte = `${JSON.stringify(contenu, null, 2)}\n`;
      const reponse = await appeler(
        `${BASE}/repos/${options.org}/${depot}/contents/${CHEMIN_CONTENU}`,
        {
          method: 'PUT',
          headers: entetes(),
          body: JSON.stringify({
            message: 'contenu du site (généré)',
            content: Buffer.from(texte, 'utf8').toString('base64'),
            // Obligatoire en mise à jour, interdit à la création. Sans lui,
            // l'API répond 422 et le run croirait avoir republié.
            ...(sha === null ? {} : { sha }),
          }),
        },
      );
      if (!reponse.ok) return echec(reponse, `écriture du contenu de ${depot}`);
    },
  };
}
