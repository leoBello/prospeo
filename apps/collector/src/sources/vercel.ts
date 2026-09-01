/**
 * Le strict nécessaire de l'API Vercel pour les tâches 4 et 6.
 *
 * **Le déploiement n'est pas déclenché ici, et c'est le point de conception.**
 * Le projet Vercel est raccordé au dépôt GitHub ; à partir de là, chaque
 * commit poussé par `publish` déclenche un déploiement tout seul. `deploy` n'a
 * donc que deux choses à faire : créer le projet une fois, puis relire l'URL
 * de production.
 *
 * Déclencher les déploiements à la main aurait demandé de gérer les identifiants
 * de dépôt, les références de branche et l'attente d'un build — pour reproduire
 * ce que l'intégration git fait déjà, et en s'en désynchronisant au premier
 * commit poussé autrement. D3 avait retenu un dépôt par prospect précisément
 * parce que « l'intégration git de Vercel est par dépôt » : autant l'utiliser.
 *
 * **Prérequis manuel, à faire une fois :** l'application GitHub de Vercel doit
 * être installée sur l'organisation dédiée, faute de quoi la création de projet
 * échoue en 403 sans que rien dans le code puisse y remédier.
 */

const BASE = 'https://api.vercel.com';

export interface VercelOptions {
  token: string;
  /** Identifiant d'équipe (D4). Vide sur un compte personnel sans équipe. */
  teamId?: string | undefined;
  fetch?: typeof fetch;
}

export interface ProjetVercel {
  id: string;
  name: string;
}

export interface VercelClient {
  creerProjet(nom: string, repoFullName: string): Promise<ProjetVercel>;
  /** `null` tant qu'aucun déploiement de production n'a abouti. */
  urlProduction(nomOuId: string): Promise<string | null>;
  supprimerProjet(nomOuId: string): Promise<void>;
}

export function createVercelClient(options: VercelOptions): VercelClient {
  const appeler = options.fetch ?? fetch;

  /**
   * Le paramètre d'équipe n'est ajouté que s'il est renseigné.
   *
   * Un `teamId=` vide n'est pas neutre : Vercel le lit comme une équipe
   * nommée « chaîne vide » et répond 403. `.env.example` documente que la
   * variable reste vide sur un compte personnel — il faut donc que le vide
   * fasse disparaître le paramètre, pas qu'il l'envoie creux.
   */
  const url = (chemin: string): string => {
    const t = options.teamId;
    return t === undefined || t === '' ? `${BASE}${chemin}` : `${BASE}${chemin}?teamId=${t}`;
  };

  const entetes = (): Record<string, string> => ({
    Authorization: `Bearer ${options.token}`,
    'Content-Type': 'application/json',
  });

  const echec = async (reponse: Response, quoi: string): Promise<never> => {
    const corps = await reponse.text().catch(() => '');
    throw new Error(`Vercel ${quoi} : ${reponse.status} — ${corps}`);
  };

  return {
    async creerProjet(nom, repoFullName) {
      const reponse = await appeler(url('/v11/projects'), {
        method: 'POST',
        headers: entetes(),
        body: JSON.stringify({
          name: nom,
          // Déclaré explicitement plutôt que laissé à la détection. Vercel
          // devine d'ordinaire juste, mais une détection ratée produit un
          // build vide déployé SANS ERREUR — une page blanche en ligne au nom
          // d'une entreprise réelle, ce qui est pire qu'un échec franc.
          framework: 'astro',
          gitRepository: { type: 'github', repo: repoFullName },
        }),
      });
      if (!reponse.ok) return echec(reponse, `création du projet ${nom}`);
      const corps = (await reponse.json()) as { id: string; name: string };
      return { id: corps.id, name: corps.name };
    },

    async urlProduction(nomOuId) {
      const reponse = await appeler(url(`/v9/projects/${encodeURIComponent(nomOuId)}`), {
        headers: entetes(),
      });
      if (reponse.status === 404) return null;
      if (!reponse.ok) return echec(reponse, `lecture du projet ${nomOuId}`);
      const corps = (await reponse.json()) as {
        targets?: { production?: { url?: string; readyState?: string } | null } | null;
      };
      const prod = corps.targets?.production ?? null;
      // Un déploiement en cours ou en erreur porte déjà une `url`, qui ne
      // servirait rien. Ne rendre que l'état `READY` évite de faire partir
      // dans un email l'adresse d'une page qui n'existe pas encore — ou qui
      // n'existera jamais.
      if (prod === null || prod.readyState !== 'READY') return null;
      return prod.url === undefined ? null : `https://${prod.url}`;
    },

    async supprimerProjet(nomOuId) {
      const reponse = await appeler(url(`/v9/projects/${encodeURIComponent(nomOuId)}`), {
        method: 'DELETE',
        headers: entetes(),
      });
      // 404 sur une suppression est le résultat recherché : le projet n'est
      // plus là. La tâche 6 dépublie sur refus (D5), et un refus doit aboutir
      // même si un run précédent avait déjà fait le travail à moitié.
      if (reponse.status === 404) return;
      if (!reponse.ok) return echec(reponse, `suppression du projet ${nomOuId}`);
    },
  };
}
