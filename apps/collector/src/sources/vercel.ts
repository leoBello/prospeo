/**
 * Le strict nécessaire de l'API Vercel pour les tâches 4 et 6.
 *
 * **Un déploiement se déclenche au PUSH, jamais à la liaison.** Mesuré au
 * premier JALON réel : un projet créé avec `gitRepository` est correctement
 * lié — `link: github prospeo/dos-services-…`, framework `astro` — et compte
 * pourtant ZÉRO déploiement cinq minutes plus tard. Vercel ne déploie pas le
 * HEAD existant d'un dépôt qu'on vient de raccorder ; il attend le commit
 * suivant.
 *
 * Or l'ordre de la chaîne est `publish` puis `deploy` : le commit est poussé
 * AVANT que le projet — donc le webhook — existe. Sans déclenchement
 * explicite, le site n'est jamais construit et `deployment_url` reste nulle
 * indéfiniment, sans la moindre erreur.
 *
 * `deploy` doit donc amorcer le premier déploiement lui-même. Les suivants,
 * eux, partent bien tout seuls : une régénération de contenu pousse un commit
 * sur un dépôt dont le projet existe désormais. D3 avait retenu un dépôt par
 * prospect parce que « l'intégration git de Vercel est par dépôt » — elle sert,
 * mais seulement à partir du second déploiement.
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
  /**
   * Amorce le premier déploiement de production.
   *
   * À n'appeler que lorsque le projet n'en compte aucun : un déclenchement
   * inconditionnel doublerait chaque build déjà lancé par le webhook.
   */
  declencherDeploiement(projectId: string, repoFullName: string, ref: string): Promise<string>;
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

    async declencherDeploiement(projectId, repoFullName, ref) {
      const [org, repo] = repoFullName.split('/');
      const reponse = await appeler(url('/v13/deployments'), {
        method: 'POST',
        headers: entetes(),
        body: JSON.stringify({
          name: repo,
          project: projectId,
          target: 'production',
          // `org` + `repo` plutôt que `repoId` : les deux formes sont acceptées,
          // et celle-ci évite une requête de plus pour résoudre l'identifiant
          // numérique du dépôt.
          gitSource: { type: 'github', org, repo, ref },
        }),
      });
      if (!reponse.ok) return echec(reponse, `déclenchement du déploiement de ${repoFullName}`);
      return ((await reponse.json()) as { id: string }).id;
    },

    async urlProduction(nomOuId) {
      const reponse = await appeler(url(`/v9/projects/${encodeURIComponent(nomOuId)}`), {
        headers: entetes(),
      });
      if (reponse.status === 404) return null;
      if (!reponse.ok) return echec(reponse, `lecture du projet ${nomOuId}`);
      const corps = (await reponse.json()) as {
        targets?: {
          production?: { url?: string; alias?: string[]; readyState?: string } | null;
        } | null;
      };
      const prod = corps.targets?.production ?? null;
      // Un déploiement en cours ou en erreur porte déjà une `url`, qui ne
      // servirait rien. Ne rendre que l'état `READY` évite de faire partir
      // dans un email l'adresse d'une page qui n'existe pas encore — ou qui
      // n'existera jamais.
      if (prod === null || prod.readyState !== 'READY') return null;

      // L'ALIAS, et non l'`url` du déploiement.
      //
      // Mesuré au premier JALON : `url` vaut
      // « dos-services-…-3yuhxrizx-leobellos-projects.vercel.app » et porte une
      // empreinte qui CHANGE à chaque redéploiement. L'alias, lui, vaut
      // « dos-services-….vercel.app » et suit la production.
      //
      // C'est la donnée de vente : elle part dans un email que l'artisan
      // ouvrira peut-être des semaines plus tard, et après une régénération de
      // contenu. Stocker l'URL du déploiement lui ferait voir une version
      // périmée — toujours en ligne, donc sans le moindre signe d'erreur.
      //
      // Le plus court des alias est le canonique : les autres portent le nom
      // de l'équipe ou celui de la branche.
      const alias = [...(prod.alias ?? [])].sort((a, b) => a.length - b.length)[0];
      const retenu = alias ?? prod.url;
      return retenu === undefined ? null : `https://${retenu}`;
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
