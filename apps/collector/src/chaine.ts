import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assembleFacts,
  assemblePitchFacts,
  getTrade,
  type ContenuPublie,
  type PitchFacts,
  type SiteFacts,
} from '@prospeo/core';
import type { Database, Json } from '@prospeo/db';
import {
  loadDeployConfig,
  loadGenerateConfig,
  loadPitchConfig,
  loadPublishConfig,
} from './config.js';
import { gabaritDefautPourPublication, lireGabaritActif } from './site-template.js';
import { createClient, PAGE_SIZE } from './supabase.js';
import { createPitchRedacteur, createRedacteur } from './sources/anthropic.js';
import { createGithubClient, type GithubClient } from './sources/github.js';
import { createVercelClient, type VercelClient } from './sources/vercel.js';
import { createEventSink } from './stages/events.js';
import { runDeploy, type DeployDeps } from './stages/deploy.js';
import { runGenerate } from './stages/generate.js';
import { PITCH_TRACE, runPitch } from './stages/pitch.js';
import { runPublish, type EtatSite, type PublishDeps } from './stages/publish.js';

/**
 * Câblage des étages, en un seul endroit.
 *
 * **Pourquoi ce fichier existe.** Les objets `Deps` de `runPublish` et
 * `runDeploy` vivaient en ligne dans les `case` de `cli.ts`, à ~130 lignes
 * chacun. Le worker du chantier n°7 en a besoin des mêmes, pour un seul
 * prospect au lieu d'un lot. Les recopier aurait créé un dialecte, et une
 * correction n'aurait atterri que d'un côté — celui qu'on aurait ouvert.
 *
 * Ce fichier ne décide rien : il ne fait que construire les dépendances. Les
 * étages, eux, sont inchangés.
 *
 * **Pourquoi les lectures y ont suivi.** `fetchSiteCandidates`,
 * `fetchPitchCandidates`, `fetchSiteRows` et `attendreUrl` étaient privées à
 * `cli.ts` alors qu'elles n'ont jamais rien eu de la ligne de commande : ce
 * sont les entrées de la chaîne, et le worker en a besoin autant que les
 * commandes. Elles sont déplacées telles quelles, sans une ligne réécrite —
 * `cli.ts` les consomme désormais d'ici.
 */

/**
 * Une ligne de `prospect_site` telle que `fetchSiteRows` la rend.
 *
 * Les neuf champs sont ceux du `select` de `fetchSiteRows` (plus bas), dans
 * le même ordre — `prospect_id`, dixième colonne du `select`, est la clé du
 * `Record<string, LigneSite>` et non un champ de la valeur. En omettre un
 * ferait échouer la construction du type au premier appelant qui le lit, et
 * non ici.
 */
export interface LigneSite {
  content: unknown;
  repo_full_name: string | null;
  repo_url: string | null;
  content_hash: string | null;
  content_rejected_at: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  vercel_project_id: string | null;
  deployment_url: string | null;
}

export function construireDepsPublication(
  client: SupabaseClient<Database>,
  opts: {
    github: GithubClient;
    templateRepoDefaut: string | undefined;
    rows: Record<string, LigneSite>;
  },
): PublishDeps {
  return {
    github: opts.github,
    templateRepoDefaut: opts.templateRepoDefaut,
    async lireEtat(prospectId) {
      const row = opts.rows[prospectId];
      if (row === undefined || row.repo_full_name === null) return null;
      return {
        repoFullName: row.repo_full_name,
        empreinte: row.content_hash,
        publishedAt: row.published_at === null ? null : new Date(row.published_at),
      } satisfies EtatSite;
    },
    async enregistrer(prospectId, etat) {
      const { error } = await client.from('prospect_site').upsert({
        prospect_id: prospectId,
        repo_full_name: etat.repoFullName,
        repo_url: etat.repoUrl,
        content_hash: etat.empreinte,
        prompt_version: etat.promptVersion,
        model: etat.model,
        generated_at: etat.generatedAt.toISOString(),
        published_at: etat.publishedAt.toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    maintenant: () => new Date(),
    events: createEventSink(client),
  };
}

export function construireDepsDeploiement(
  client: SupabaseClient<Database>,
  opts: { vercel: VercelClient; attendreUrl: (projectId: string) => Promise<string | null> },
): DeployDeps {
  return {
    vercel: opts.vercel,
    events: createEventSink(client),
    async enregistrerProjet(prospectId, vercelProjectId) {
      const { error } = await client
        .from('prospect_site')
        .update({ vercel_project_id: vercelProjectId, updated_at: new Date().toISOString() })
        .eq('prospect_id', prospectId);
      if (error) throw new Error(error.message);
    },
    async enregistrerUrl(prospectId, url) {
      const { error } = await client
        .from('prospect_site')
        .update({ deployment_url: url, updated_at: new Date().toISOString() })
        .eq('prospect_id', prospectId);
      if (error) throw new Error(error.message);
    },
    // Le déclenchement double est sans conséquence : l'API Vercel
    // dédoublonne les déploiements identiques faute de `forceNew`.
    attendreUrl: opts.attendreUrl,
    maintenant: () => new Date(),
  };
}

/**
 * Ce qu'une garde de rejeu doit dire avant d'agir sur UN prospect.
 *
 * Un booléen ne suffit pas : « rien à faire » recouvre deux situations que
 * `chaineDeps` doit traiter à l'opposé l'une de l'autre. Un travail déjà fait
 * se tait — `chaineDeps` rend `null`, un rejeu de la chaîne ne coûte rien. Un
 * site retiré par un humain (`unpublished_at`) ne doit au contraire JAMAIS se
 * taire : le republier au nom d'une entreprise qui a demandé son retrait est
 * ce que ce dépôt prend le plus au sérieux, et `chaineDeps` doit lever.
 */
export type DecisionEtape =
  | { faire: true }
  | { faire: false; motif: 'deja_fait' }
  | { faire: false; motif: 'retire' };

/**
 * Faut-il (re)générer le contenu d'un prospect ?
 *
 * Même critère que le mode lot de `cli.ts` (`case 'generate'`, filtre
 * `aFaire`) : un contenu déjà écrit et non rejeté n'est pas repayé — c'est le
 * seul étage qui dépense de l'argent sur un appel au modèle. Une rédaction
 * REJETÉE à la relecture fait exception et doit être refaite : c'est
 * précisément ce que le bouton du dashboard sert à déclencher, sans qu'il
 * faille se souvenir de passer `--force`.
 */
export function decideGeneration(
  ligne: Pick<LigneSite, 'content' | 'content_rejected_at'> | undefined,
): DecisionEtape {
  const dejaEcrit = ligne?.content != null && ligne.content_rejected_at === null;
  return dejaEcrit ? { faire: false, motif: 'deja_fait' } : { faire: true };
}

/**
 * Faut-il publier ce prospect ?
 *
 * Un site dépublié (`unpublished_at !== null`) l'a été SANS DÉLAI, au moment
 * où le prospect est passé « ne pas contacter » ou « perdu » (D5). Le
 * republier n'est pas un cas silencieux qu'un `null` pourrait laisser passer
 * inaperçu : c'est une exception forte.
 */
export function decidePublication(
  ligne: Pick<LigneSite, 'unpublished_at'> | undefined,
): DecisionEtape {
  if (ligne?.unpublished_at != null) return { faire: false, motif: 'retire' };
  return { faire: true };
}

/**
 * Faut-il déployer ce prospect ?
 *
 * Les deux motifs de silence coexistent ici, contrairement aux autres
 * gardes : un site déjà en ligne (`deployment_url` renseignée) n'a rien à
 * gagner à un redéploiement — même critère que `case 'deploy'` en lot. Le
 * retrait est vérifié EN PREMIER : un site retiré ne redéploie jamais, même
 * s'il n'a par ailleurs aucune URL encore enregistrée.
 */
export function decideDeploiement(
  ligne: Pick<LigneSite, 'unpublished_at' | 'deployment_url'> | undefined,
): DecisionEtape {
  if (ligne?.unpublished_at != null) return { faire: false, motif: 'retire' };
  if (ligne?.deployment_url != null) return { faire: false, motif: 'deja_fait' };
  return { faire: true };
}

/**
 * Faut-il rédiger un message pour ce prospect ?
 *
 * Même critère que le mode lot de `cli.ts` (`case 'pitch'`,
 * `fetchProspectsDejaRediges`) : l'écriture dans `generated_message` est un
 * `insert`, pas un `upsert` — rejouer sans cette garde empile des messages en
 * double sur le même prospect.
 */
export function decideRedaction(dejaRedige: boolean): DecisionEtape {
  return dejaRedige ? { faire: false, motif: 'deja_fait' } : { faire: true };
}

export type EtapeChaine = 'generate' | 'publish' | 'deploy' | 'pitch';

export interface ResultatChaine {
  termine: EtapeChaine[];
  echec: { etape: EtapeChaine; message: string } | null;
  /** `null` : aucune étape n'a su dire ce qu'elle coûtait. Ce n'est pas zéro. */
  coutEur: number | null;
}

export interface ChaineDeps {
  generer(prospectId: string): Promise<number | null>;
  publier(prospectId: string): Promise<void>;
  deployer(prospectId: string): Promise<void>;
  rediger(prospectId: string): Promise<number | null>;
}

/**
 * La chaîne complète sur UN prospect.
 *
 * **L'ordre est une dépendance de données, pas une convention** : publier
 * avant d'avoir généré pousserait un dépôt vide, et rédiger avant d'avoir
 * déployé produirait un mail citant une URL qui n'existe pas. La chaîne
 * s'arrête donc au premier échec au lieu de sauter l'étape fautive.
 *
 * Le rapport nomme l'étape qui a échoué : c'est ce que la ligne de l'écran
 * affichera, et « échoué » tout court n'aiderait personne.
 */
export async function traiterProspect(
  prospectId: string,
  deps: ChaineDeps,
): Promise<ResultatChaine> {
  const termine: EtapeChaine[] = [];
  // `null` tant qu'aucune étape n'a rendu de coût — voir `ResultatChaine`.
  let cout: number | null = null;

  const ajouterCout = (montant: number | null): void => {
    if (montant === null) return;
    cout = cout === null ? montant : cout + montant;
  };

  const etapes: readonly [EtapeChaine, () => Promise<number | null>][] = [
    ['generate', () => deps.generer(prospectId)],
    ['publish', () => deps.publier(prospectId).then(() => null)],
    ['deploy', () => deps.deployer(prospectId).then(() => null)],
    ['pitch', () => deps.rediger(prospectId)],
  ];

  for (const [etape, executer] of etapes) {
    try {
      ajouterCout(await executer());
      termine.push(etape);
    } catch (cause) {
      return {
        termine,
        echec: { etape, message: cause instanceof Error ? cause.message : String(cause) },
        coutEur: cout,
      };
    }
  }

  return { termine, echec: null, coutEur: cout };
}

/**
 * Les prospects éligibles à un site, du meilleur score au moins bon.
 *
 * L'ordre n'est pas cosmétique : c'est lui qui donne son sens à `--limit`.
 * « Trois prospects » doit vouloir dire les trois meilleurs, pas trois au
 * hasard — sans quoi éprouver prudemment un étage neuf sur un petit lot
 * reviendrait à l'éprouver sur un échantillon quelconque.
 *
 * Le filtrage final est délégué à `assembleFacts`, qui écarte déjà les
 * prospects sans téléphone et les métiers inconnus. Le refaire ici en dupliquerait
 * la règle, et les deux divergeraient.
 */
export async function fetchSiteCandidates(
  client: ReturnType<typeof createClient>,
  tradeSlug: string | undefined,
): Promise<{ id: string; faits: SiteFacts; total: number }[]> {
  const lignes: { id: string; faits: SiteFacts; total: number }[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client
      .from('prospect')
      .select(
        'id, siret, denomination, denomination_usuelle, trade_slug, address, postal_code, city, date_creation, latitude, longitude, is_closed, prospect_enrichment(status, matched_name, phone_e164, rating, maps_url), web_presence(category), prospect_score(total)',
      )
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (tradeSlug !== undefined) query = query.eq('trade_slug', tradeSlug);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      // Un établissement cessé n'est pas un prospect : lui publier un site au
      // nom d'une entreprise qui n'existe plus serait le pire des envois.
      if (row.is_closed === true) continue;

      const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
      const enr = one(row.prospect_enrichment);
      const wp = one(row.web_presence);
      const sc = one(row.prospect_score);

      // `has_site` est écarté ici comme il l'est du barème : proposer une
      // vitrine à qui en a déjà une correcte n'a pas de sens. Une catégorie
      // absente veut dire « pas encore sondé », donc pas encore décidable.
      if (wp === null || wp.category === null || wp.category === 'has_site') continue;
      if (sc === null) continue;

      const faits = assembleFacts({
        siret: row.siret,
        denomination: row.denomination,
        denominationUsuelle: row.denomination_usuelle,
        tradeSlug: row.trade_slug,
        address: row.address,
        postalCode: row.postal_code,
        city: row.city,
        dateCreation: row.date_creation,
        latitude: row.latitude,
        longitude: row.longitude,
        enrichment:
          enr === null
            ? null
            : {
                status: enr.status,
                matchedName: enr.matched_name,
                phoneE164: enr.phone_e164,
                rating: enr.rating,
                mapsUrl: enr.maps_url,
              },
      });
      if (faits === null) continue;

      lignes.push({ id: row.id, faits, total: sc.total });
    }
    if ((data ?? []).length < PAGE_SIZE) break;
  }

  return lignes.sort((a, b) => b.total - a.total);
}

/**
 * Les prospects à qui l'on peut écrire, du meilleur score au moins bon.
 *
 * Le filtrage est délégué à `assemblePitchFacts`, qui porte les quatre refus —
 * le prospect a dit non, il n'a pas de site en ligne, il en a déjà un correct,
 * ou `assembleFacts` l'écarte déjà. Les refaire ici en dupliquerait la règle,
 * et les deux divergeraient : la version SQL est celle qu'on relit le moins.
 *
 * La jointure sur `prospect_site` n'est pas un filtre serveur mais un
 * enrichissement : un prospect sans site remonte avec `site: null`, et c'est
 * `assemblePitchFacts` qui le renvoie. Filtrer côté serveur rendrait le
 * décompte des écartés impossible à établir.
 */
export async function fetchPitchCandidates(
  client: ReturnType<typeof createClient>,
): Promise<{ id: string; faits: PitchFacts; total: number }[]> {
  const lignes: { id: string; faits: PitchFacts; total: number }[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('prospect')
      .select(
        'id, siret, denomination, denomination_usuelle, trade_slug, address, postal_code, city, date_creation, is_closed, prospect_enrichment(status, matched_name, phone_e164, rating, maps_url), web_presence(category, domain_free_name), prospect_score(total), prospect_pipeline(status), prospect_site(deployment_url, unpublished_at)',
      )
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      // Un établissement cessé n'est pas un prospect : lui écrire au nom d'une
      // entreprise qui n'existe plus serait le pire des envois.
      if (row.is_closed === true) continue;

      const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
      const enr = one(row.prospect_enrichment);
      const wp = one(row.web_presence);
      const sc = one(row.prospect_score);
      const pl = one(row.prospect_pipeline);
      const site = one(row.prospect_site);

      const faits = assemblePitchFacts({
        prospect: {
          siret: row.siret,
          denomination: row.denomination,
          denominationUsuelle: row.denomination_usuelle,
          tradeSlug: row.trade_slug,
          address: row.address,
          postalCode: row.postal_code,
          city: row.city,
          dateCreation: row.date_creation,
          // Le message de vente n'a pas de carte : ces deux champs ne servent
          // qu'à satisfaire le contrat partagé avec `assembleFacts`.
          latitude: null,
          longitude: null,
          enrichment:
            enr === null
              ? null
              : {
                  status: enr.status,
                  matchedName: enr.matched_name,
                  phoneE164: enr.phone_e164,
                  rating: enr.rating,
                  mapsUrl: enr.maps_url,
                },
        },
        site:
          site === null
            ? null
            : {
                deploymentUrl: site.deployment_url,
                unpublishedAt: site.unpublished_at === null ? null : new Date(site.unpublished_at),
              },
        presenceWeb: wp?.category ?? null,
        domaineLibre: wp?.domain_free_name ?? null,
        pipelineStatus: pl?.status ?? null,
      });
      if (faits === null) continue;

      lignes.push({ id: row.id, faits, total: sc?.total ?? 0 });
    }
    if ((data ?? []).length < PAGE_SIZE) break;
  }

  return lignes.sort((a, b) => b.total - a.total);
}

/** L'état de site déjà enregistré, par prospect. */
export async function fetchSiteRows(client: ReturnType<typeof createClient>) {
  const rows: Record<string, {
    content: unknown;
    repo_full_name: string | null;
    repo_url: string | null;
    content_hash: string | null;
    content_rejected_at: string | null;
    published_at: string | null;
    unpublished_at: string | null;
    vercel_project_id: string | null;
    deployment_url: string | null;
  }> = {};
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('prospect_site')
      .select(
        'prospect_id, content, repo_full_name, repo_url, content_hash, content_rejected_at, published_at, unpublished_at, vercel_project_id, deployment_url',
      )
      .order('prospect_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) rows[r.prospect_id] = r;
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Attend qu'un déploiement devienne joignable, dans une limite raisonnable.
 *
 * Un build Astro d'une page prend une dizaine de secondes ; on laisse large
 * pour la file d'attente Vercel. Passé le délai, on rend `null` plutôt que
 * d'attendre indéfiniment : le run se termine, la ligne garde son URL nulle,
 * et le prochain `deploy` la reprendra sans rien recréer.
 */
const ATTENTE_DEPLOIEMENT_TENTATIVES = 40;
const ATTENTE_DEPLOIEMENT_INTERVALLE_MS = 5_000;

export async function attendreUrl(
  vercel: ReturnType<typeof createVercelClient>,
  projectId: string,
): Promise<string | null> {
  for (let essai = 0; essai < ATTENTE_DEPLOIEMENT_TENTATIVES; essai += 1) {
    const url = await vercel.urlProduction(projectId);
    if (url !== null) return url;
    await new Promise((r) => setTimeout(r, ATTENTE_DEPLOIEMENT_INTERVALLE_MS));
  }
  return null;
}

/**
 * Les quatre accès réels de `traiterProspect`, pour UN prospect.
 *
 * Chaque étage reçoit un lot d'un seul élément : `runPublish` et `runDeploy`
 * sont déjà séquentiels et bornés, et leur passer un singleton évite
 * d'écrire une seconde version « pour un ». Les rapports rendus sont
 * convertis en exception quand ils comptent un échec — `traiterProspect`
 * raisonne sur des exceptions, pas sur des compteurs.
 *
 * **Le coût rendu est `null`, délibérément.** Les étages comptent des JETONS,
 * à trois tarifs distincts (entrée, écriture de cache, lecture de cache,
 * sortie), et rien dans ce dépôt ne porte de table de prix. Convertir ici
 * demanderait d'inventer des tarifs, c'est-à-dire de produire un chiffre
 * fondé sur rien — précisément ce que la doctrine interdit. `cost_eur` reste
 * donc nul jusqu'à ce qu'une table de prix existe, et le total d'une
 * campagne s'annoncera partiel (lot 6).
 */
export function chaineDeps(client: SupabaseClient<Database>): ChaineDeps {
  return {
    async generer(prospectId) {
      const genConfig = loadGenerateConfig(process.env);
      const candidats = await fetchSiteCandidates(client, undefined);
      const cible = candidats.find((c) => c.id === prospectId);
      // Hors des critères de `fetchSiteCandidates` (score, métier, éligibilité
      // web) : ce n'est pas un échec, juste rien à générer pour ce prospect.
      if (cible === undefined) return null;

      const rows = await fetchSiteRows(client);
      const decision = decideGeneration(rows[prospectId]);
      // `deja_fait` : un contenu est déjà écrit et n'a pas été rejeté à la
      // relecture. Un rejeu ne doit pas repayer un appel au modèle — c'est le
      // seul étage de la chaîne qui coûte de l'argent.
      if (!decision.faire) return null;

      const trade = getTrade(cible.faits.metier.slug);
      if (trade === undefined) throw new Error(`métier inconnu : ${cible.faits.metier.slug}`);

      const resultat = await runGenerate(
        [{ prospectId, faits: cible.faits, trade }],
        createRedacteur({
          apiKey: genConfig.anthropicApiKey,
          workspaceId: genConfig.anthropicWorkspaceId,
          trade,
        }),
      );
      if (resultat.report.failed > 0) throw new Error('la rédaction du contenu a échoué');
      if (resultat.report.rejected > 0) {
        throw new Error('contenu refusé par le schéma — rejouer la rédaction');
      }

      for (const { contenu } of resultat.contenus) {
        const { error } = await client.from('prospect_site').upsert({
          prospect_id: prospectId,
          content: contenu as unknown as Json,
          prompt_version: contenu.version.promptVersion,
          model: contenu.version.model,
          generated_at: new Date().toISOString(),
          // Le refus portait sur le texte qu'on vient de remplacer : le
          // laisser bloquerait `publish` sur une rédaction neuve.
          content_rejected_at: null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
      }
      return null;
    },

    async publier(prospectId) {
      const pubConfig = loadPublishConfig(process.env);
      const rows = await fetchSiteRows(client);
      const ligne = rows[prospectId];
      if (ligne === undefined || ligne.content == null) {
        throw new Error('aucun contenu à publier — la rédaction n’a rien écrit');
      }

      const decision = decidePublication(ligne);
      if (!decision.faire) {
        // `decidePublication` ne rend jamais `deja_fait` : ici, `motif` vaut
        // toujours `retire`. Un site dépublié l'a été SANS DÉLAI, au moment où
        // le prospect est passé « ne pas contacter » ou « perdu » (D5). Le
        // republier au nom d'une entreprise qui a demandé son retrait est ce
        // que ce dépôt prend le plus au sérieux : ce n'est pas un « rien à
        // faire » silencieux, la chaîne doit s'arrêter net et le dire.
        throw new Error('publication refusée : le site a été retiré (unpublished_at renseigné)');
      }

      const gabaritActif = await lireGabaritActif(client);
      const deps = construireDepsPublication(client, {
        github: createGithubClient({ token: pubConfig.githubToken, org: pubConfig.githubOrg }),
        templateRepoDefaut: gabaritDefautPourPublication(
          gabaritActif,
          pubConfig.githubTemplateRepo,
        ),
        rows,
      });

      const report = await runPublish(
        [
          {
            prospectId,
            contenu: ligne.content as unknown as ContenuPublie,
            rejeteeLe:
              ligne.content_rejected_at === null ? null : new Date(ligne.content_rejected_at),
          },
        ],
        deps,
      );
      // `runPublish` a déjà écrit la cause dans `deployment_event` : l'écran
      // l'affichera depuis là, avec plus de détail que ce message.
      if (report.failed > 0) throw new Error('la création du dépôt a échoué');
      if (report.refused > 0) throw new Error('publication refusée — voir le journal du site');
    },

    async deployer(prospectId) {
      const depConfig = loadDeployConfig(process.env);
      const vercel = createVercelClient({
        token: depConfig.vercelToken,
        teamId: depConfig.vercelTeamId,
      });
      const rows = await fetchSiteRows(client);
      const ligne = rows[prospectId];
      if (ligne === undefined || ligne.repo_full_name === null) {
        throw new Error('aucun dépôt à déployer');
      }

      const decision = decideDeploiement(ligne);
      if (!decision.faire) {
        if (decision.motif === 'retire') {
          // Même gravité que pour `publier`, et pour la même raison : un site
          // retiré ne doit jamais redéployer, même s'il n'a par ailleurs
          // aucune URL de production encore enregistrée.
          throw new Error('déploiement refusé : le site a été retiré (unpublished_at renseigné)');
        }
        // `deja_fait` : `deployment_url` est déjà renseignée, le site est en
        // ligne — rien à gagner à relancer un déploiement identique.
        return;
      }

      const report = await runDeploy(
        [
          {
            prospectId,
            repoFullName: ligne.repo_full_name,
            vercelProjectId: ligne.vercel_project_id,
          },
        ],
        construireDepsDeploiement(client, {
          vercel,
          attendreUrl: (projectId) => attendreUrl(vercel, projectId),
        }),
      );
      if (report.failed > 0) throw new Error('le déploiement a échoué');
      // `pending` n'est PAS une erreur : le build tourne chez Vercel et un
      // rejeu récupérera l'URL. C'est le comportement documenté de `runDeploy`
      // depuis le chantier n°4, et la chaîne continue vers `pitch` — le mail
      // ne partira de toute façon qu'après relecture humaine.
    },

    async rediger(prospectId) {
      const pitchConfig = loadPitchConfig(process.env);
      const candidats = await fetchPitchCandidates(client);
      const cible = candidats.find((c) => c.id === prospectId);
      // Non joignable (ni téléphone ni site déployé) : rien à rédiger, et ce
      // n'est pas un échec de la chaîne. L'écran le dira par son troisième
      // segment.
      if (cible === undefined) return null;

      // Même critère que le mode lot (`fetchProspectsDejaRediges`) : interrogé
      // pour UN prospect plutôt que la table entière, puisque c'est tout ce
      // dont on a besoin ici.
      const { data: messagesExistants, error: lectureError } = await client
        .from('generated_message')
        .select('prospect_id')
        .eq('prospect_id', prospectId)
        .limit(1);
      if (lectureError) throw new Error(lectureError.message);

      const decision = decideRedaction((messagesExistants ?? []).length > 0);
      // `deja_fait` : l'écriture ci-dessous est un `insert`, pas un `upsert` —
      // rejouer sans cette garde empile des `generated_message` en double sur
      // le même prospect.
      if (!decision.faire) return null;

      const resultat = await runPitch(
        [{ prospectId, faits: cible.faits }],
        createPitchRedacteur({
          apiKey: pitchConfig.anthropicApiKey,
          workspaceId: pitchConfig.anthropicWorkspaceId,
        }),
      );
      if (resultat.report.failed > 0) throw new Error('la rédaction du message a échoué');
      // Symétrique à `generer` ci-dessus : `runPitch` incrémente `rejected`
      // quand le contenu sort de son contrat, et ne pousse alors RIEN dans
      // `messages` — sans lever. Comme on ne passe qu'un prospect, un rejet
      // laisserait `messages` vide, la boucle d'écriture ne ferait rien, et la
      // fonction rendrait `null` : le job se clorait `termine`, sans le
      // moindre `generated_message` écrit ni `last_error` — un échec réel
      // rendu indiscernable d'un succès.
      if (resultat.report.rejected > 0) {
        throw new Error('message refusé par le schéma — rejouer la rédaction');
      }
      if (resultat.report.refusedEditeur > 0) {
        throw new Error('éditeur non renseigné — voir EDITEUR dans packages/core');
      }

      for (const m of resultat.messages) {
        const { error } = await client.from('generated_message').insert({
          prospect_id: m.prospectId,
          channel: m.canal,
          subject: m.objet,
          content: m.contenu,
          model: PITCH_TRACE.model,
          prompt_version: PITCH_TRACE.promptVersion,
        });
        if (error) throw new Error(error.message);
      }
      return null;
    },
  };
}
