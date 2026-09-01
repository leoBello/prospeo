import { createHash } from 'node:crypto';
import type { SiteFacts } from '@prospeo/core';

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
