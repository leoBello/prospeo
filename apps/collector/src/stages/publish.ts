import { createHash } from 'node:crypto';
import {
  editeurRenseigne,
  getTrade,
  templateRepoFor,
  type ContenuPublie,
  type SiteFacts,
} from '@prospeo/core';
import type { GithubClient } from '../sources/github.js';

/** Plafond GitHub pour un nom de dépôt. */
const MAX_NOM_DEPOT = 100;

/**
 * Nom du dépôt d'un prospect — déterministe, unique, traçable.
 *
 * **Déterministe** parce que c'est la condition de l'idempotence exigée par la
 * tâche 3 : le nom se recalcule à chaque run à partir du seul prospect, si
 * bien qu'un rejeu retrouve le dépôt existant au lieu d'en créer un second
 * dans une organisation qui porte le nom d'entreprises réelles.
 *
 * **Le SIRET plutôt qu'un hachage court.** Il est la clé unique de la table
 * `prospect` : il garantit l'absence de collision au lieu de la rendre
 * improbable. La base nantaise contient réellement des raisons sociales
 * voisines, et sans discriminant la seconde publication écraserait le site de
 * la première. Il se lit de surcroît dans les deux sens — d'un dépôt on
 * retrouve le prospect sans requête, ce qui compte quand on en administre
 * vingt-deux.
 *
 * Le libellé qui le précède n'est que du confort de lecture ; c'est lui qu'on
 * tronque, jamais le SIRET. Le jour où l'artisan achète et qu'on lui transfère
 * le dépôt (D3), on le renomme.
 */
export function nomDepot(faits: SiteFacts): string {
  const suffixe = faits.siret;
  // GitHub n'accepte que [A-Za-z0-9._-]. Un accent ou une apostrophe y produit
  // un 422 au moment de la création — donc après que le run a commencé à
  // travailler, et sur un prospect au hasard.
  const slug = faits.nomAffiche
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const place = MAX_NOM_DEPOT - suffixe.length - 1;
  const tronque = slug.slice(0, Math.max(0, place)).replace(/-+$/g, '');

  // Un nom de dépôt ne peut pas commencer par un tiret, et une enseigne
  // réduite à des symboles ne laisse rien après nettoyage. Le SIRET seul est
  // alors un nom valide, moins lisible mais parfaitement fonctionnel.
  return tronque === '' ? suffixe : `${tronque}-${suffixe}`;
}

/**
 * Empreinte stable d'un contenu, indépendante de l'ordre des clés.
 *
 * Elle gouverne le « rejouer ne réécrit pas ». `JSON.stringify` ne garantit
 * pas l'ordre des clés à travers un aller-retour — lecture Supabase, écriture
 * GitHub, relecture — et une empreinte qui en dépendrait ferait pousser à
 * chaque run un commit identique dans les vingt-deux dépôts, redéclenchant
 * autant de déploiements Vercel pour rien.
 *
 * L'ordre des TABLEAUX est en revanche conservé : celui des prestations est le
 * seul degré de liberté du modèle et se voit à l'écran. Le réordonner est un
 * changement de contenu, pas un artefact de sérialisation.
 */
export function empreinteContenu(contenu: unknown): string {
  return createHash('sha256').update(canonique(contenu)).digest('hex');
}

function canonique(valeur: unknown): string {
  if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur) ?? 'null';
  if (Array.isArray(valeur)) return `[${valeur.map(canonique).join(',')}]`;
  const entrees = Object.entries(valeur as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entrees.map(([c, v]) => `${JSON.stringify(c)}:${canonique(v)}`).join(',')}}`;
}

/** Ce que la base sait déjà du site d'un prospect. */
export interface EtatSite {
  repoFullName: string;
  /** Empreinte du contenu réellement écrit, `null` si elle n'a pas été enregistrée. */
  empreinte: string | null;
  /**
   * Date de PREMIÈRE publication. C'est elle qui fait courir les 90 jours de
   * la péremption (D5) ; voir `runPublish`, qui la préserve.
   */
  publishedAt?: Date | null;
}

export type PublishAction = 'create' | 'update' | 'skip';

/**
 * Faut-il créer, mettre à jour, ou ne rien faire ?
 *
 * `empreinte: null` mène à `update` plutôt qu'à `skip` : une ligne écrite
 * avant l'introduction de l'empreinte, ou une écriture interrompue entre la
 * création du dépôt et son enregistrement, laisse en ligne un site dont
 * personne ne sait ce qu'il contient. Réécrire coûte un commit ; s'abstenir
 * coûte de ne plus savoir ce qui est publié au nom d'un tiers.
 */
export function decidePublish(etat: EtatSite | null, empreinte: string): PublishAction {
  if (etat === null) return 'create';
  if (etat.empreinte === null) return 'update';
  return etat.empreinte === empreinte ? 'skip' : 'update';
}

export interface PublishReport {
  created: number;
  updated: number;
  skipped: number;
  /** Pannes : réseau, 5xx, écriture refusée par GitHub. */
  failed: number;
  /**
   * Travail délibérément laissé en plan — éditeur non renseigné, faits
   * incomplets, prose incohérente avec les faits. Ce n'est pas une panne,
   * mais quelque chose attend une décision humaine.
   */
  refused: number;
}

/**
 * Comme `enrich` et `reconcile` : un run partiellement réussi n'est pas un
 * succès. Sur vingt-deux prospects, un échec avalé ne se remarque que des
 * jours plus tard, quand un email cite une URL qui n'existe pas.
 */
export function publishExitCode(report: PublishReport): number {
  return report.failed > 0 || report.refused > 0 ? 1 : 0;
}


// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Ce que `publish` écrit en base pour un prospect. */
export interface EtatSiteEcrit {
  repoFullName: string;
  repoUrl: string;
  empreinte: string;
  publishedAt: Date;
  promptVersion: string;
  model: string;
  generatedAt: Date;
}

export interface PublishDeps {
  github: GithubClient;
  /**
   * Dépôt modèle de repli, employé quand le métier n'en déclare pas.
   *
   * Vient de `PROSPEO_GITHUB_TEMPLATE_REPO`. Le métier prime : `trades.ts`
   * porte un modèle par métier, et c'est ce repli qui permettra à une
   * interface de gestion de trancher depuis la base sans toucher au code.
   */
  templateRepoDefaut?: string | undefined;
  lireEtat(prospectId: string): Promise<EtatSite | null>;
  enregistrer(prospectId: string, etat: EtatSiteEcrit): Promise<void>;
  /** Injectée plutôt que `new Date()` : une date de publication se teste. */
  maintenant(): Date;
}

export interface PublishInput {
  prospectId: string;
  contenu: ContenuPublie;
  /**
   * Date à laquelle cette rédaction a été refusée à la relecture, s'il y en a
   * eu une (`prospect_site.content_rejected_at`).
   *
   * Un contenu rejeté ne se publie pas. C'est ce qui donne son sens au bouton
   * du dashboard : sans ce couplage, refuser une rédaction puis lancer
   * `publish` la pousserait quand même, et le clic aurait laissé croire le
   * contraire de ce qu'il faisait.
   */
  rejeteeLe?: Date | null;
}

/**
 * Publie un lot de prospects, un par un.
 *
 * **Séquentiel, et non parallèle.** GitHub limite le débit d'écriture sur un
 * même compte, et le lot ne dépasse pas vingt-deux prospects : la parallélisation
 * gagnerait quelques secondes contre un risque de 429 au milieu du lot, dont
 * la reprise serait à écrire.
 *
 * **Un échec n'interrompt pas le lot** — « aucun étage ne peut corrompre la
 * base sur un échec partiel » (spec du socle, §12). Sur vingt-deux prospects,
 * s'arrêter au premier 403 laisserait les vingt et un autres au point mort
 * sans raison. L'échec est compté, et le décompte décide du code de sortie.
 */
export async function runPublish(
  inputs: readonly PublishInput[],
  deps: PublishDeps,
): Promise<PublishReport> {
  const report: PublishReport = { created: 0, updated: 0, skipped: 0, failed: 0, refused: 0 };

  for (const { prospectId, contenu, rejeteeLe } of inputs) {
    // Un refus humain prime sur tout le reste, et se constate avant le moindre
    // appel réseau — même place et même raison que le contrôle de l'éditeur
    // juste en dessous. `generate` reprendra ce prospect ; `publish` n'a rien
    // à en faire tant qu'une nouvelle rédaction n'a pas été écrite.
    if (rejeteeLe !== undefined && rejeteeLe !== null) {
      console.error(
        `publish : ${prospectId} refusé — rédaction rejetée à la relecture le ` +
          `${rejeteeLe.toISOString().slice(0, 10)}. Rejouez « generate » pour en écrire une autre.`,
      );
      report.refused += 1;
      continue;
    }

    // §11 conformité : un site publié au nom d'un tiers doit nommer son
    // éditeur réel et offrir un moyen d'en demander le retrait. Le contrôle
    // est ici, avant le moindre appel réseau — un dépôt créé ne se « dé-crée »
    // pas, et c'est la publication, pas le build, qui expose une page au monde.
    if (!editeurRenseigne(contenu.editeur)) {
      console.error(
        `publish : ${prospectId} refusé — éditeur non renseigné (voir EDITEUR dans packages/core).`,
      );
      report.refused += 1;
      continue;
    }

    const depot = nomDepot(contenu.faits);
    const empreinte = empreinteContenu(contenu);

    try {
      const etat = await deps.lireEtat(prospectId);
      const action = decidePublish(etat, empreinte);
      if (action === 'skip') {
        report.skipped += 1;
        continue;
      }

      let repoFullName: string;
      let repoUrl: string;
      let sha: string | null = null;

      if (action === 'create') {
        // Le modèle dépend du MÉTIER du prospect, pas du run : un lot peut
        // mêler plombiers et serruriers, chacun partant de son propre dépôt.
        const trade = getTrade(contenu.faits.metier.slug);
        if (trade === undefined) {
          throw new Error(`Métier inconnu : « ${contenu.faits.metier.slug} ».`);
        }
        const cree = await deps.github.creerDepuisModele(
          templateRepoFor(trade, deps.templateRepoDefaut),
          depot,
          `Site de démonstration — ${contenu.faits.nomAffiche}`,
        );
        repoFullName = cree.fullName;
        repoUrl = cree.htmlUrl;

        // La création est ASYNCHRONE côté GitHub : `POST /generate` répond
        // 201 avant que le contenu du modèle ne soit copié. Écrire tout de
        // suite poserait le fichier sur un dépôt vide, que la copie du modèle
        // écraserait deux secondes plus tard — le prospect recevrait alors
        // l'URL d'un site affichant la fiche d'exemple. Mesuré au premier
        // JALON réel, et parfaitement silencieux : le run se déclarait réussi.
        //
        // On attend donc le `sha` du fichier venu du modèle, et on écrit
        // PAR-DESSUS lui — la création devient une mise à jour.
        sha = await deps.github.attendreContenuModele(depot);
      } else {
        repoFullName = etat?.repoFullName ?? depot;
        repoUrl = `https://github.com/${repoFullName}`;
        // Obligatoire en mise à jour : sans le sha du fichier existant,
        // l'API répond 422 et le run croirait avoir republié.
        sha = await deps.github.shaContenu(depot);
      }

      await deps.github.ecrireContenu(depot, contenu, sha);

      const maintenant = deps.maintenant();
      await deps.enregistrer(prospectId, {
        repoFullName,
        repoUrl,
        empreinte,
        // La date de PREMIÈRE publication est préservée. La remettre à jour à
        // chaque republication repousserait indéfiniment la péremption de D5 :
        // un site régénéré tous les deux mois n'expirerait jamais et resterait
        // en ligne au nom d'un tiers sans que personne ne s'en aperçoive. Elle
        // dit « depuis quand ce site est publié », pas « quand on l'a
        // retouché ».
        publishedAt: etat?.publishedAt ?? maintenant,
        promptVersion: contenu.version.promptVersion,
        model: contenu.version.model,
        generatedAt: maintenant,
      });

      if (action === 'create') report.created += 1;
      else report.updated += 1;
    } catch (erreur) {
      // Journalisé AVEC le prospect concerné, comme l'exige le §12 du spec :
      // un message d'erreur qui ne dit pas sur quelle ligne il porte oblige à
      // rejouer le lot entier pour le retrouver.
      console.error(
        `publish : échec sur ${prospectId} (${depot}) — ${
          erreur instanceof Error ? erreur.message : String(erreur)
        }`,
      );
      report.failed += 1;
    }
  }

  return report;
}
