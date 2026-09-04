import { spawn, type ChildProcess } from 'node:child_process';
import { resolveNs } from 'node:dns/promises';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { domainCandidates, getTrade, MATCHING_CONFIG, nafMatchesTrade } from '@prospeo/core';
import {
  loadConfig,
  loadDeployConfig,
  loadGenerateConfig,
  loadPitchConfig,
  loadPublishConfig,
} from './config.js';
import type { Json } from '@prospeo/db';
import { proprietaire as lireProprietaire, type Proprietaire } from './proprietaire.js';
import { createClient, PAGE_SIZE } from './supabase.js';
import { createGoogleMapsSource } from './sources/google-maps.js';
import { fetchStatusBySiret } from './sources/recherche-entreprises.js';
import { planScoreWrite, type ScoreRowInput } from './stages/classify-score.js';
import { makeUpsertProspect, runDiscover } from './stages/discover.js';
import {
  checkDomainAvailability,
  domainProposalApplies,
  domainStaleCutoff,
  rdapStatus,
  DOMAIN_PROPOSAL_CATEGORIES,
} from './stages/domains.js';
import { runEnrich, type EnrichProspect, type ReviewCandidate } from './stages/enrich.js';
import { probeUrl, shouldProbe } from './stages/probe.js';
import { reconcileExitCode, runReconcile, type ReconcileProspect } from './stages/reconcile.js';
import {
  replayEnrichment,
  rewriteFromReplay,
  summarizeReplays,
  type StoredEnrichment,
} from './stages/calibrate.js';
import { applyReviewDecision, type ReviewDecision } from './stages/review.js';
import { segmentsSms, type ContenuPublie } from '@prospeo/core';
import { createPitchRedacteur, createRedacteur } from './sources/anthropic.js';
import { createGithubClient } from './sources/github.js';
import { createVercelClient } from './sources/vercel.js';
import { createEventSink } from './stages/events.js';
import { deployExitCode, runDeploy, type DeploySite } from './stages/deploy.js';
import { runGenerate, type GenerateInput } from './stages/generate.js';
import { publishExitCode, runPublish, type PublishInput } from './stages/publish.js';
import { runPitch, PITCH_TRACE, type PitchInput } from './stages/pitch.js';
import {
  runUnpublish,
  unpublishExitCode,
  type SiteEnLigne,
  type UnpublishDeps,
} from './stages/unpublish.js';
import { gabaritDefautPourPublication, lireGabaritActif } from './site-template.js';
import {
  attendreUrl,
  chaineDeps,
  construireDepsDeploiement,
  construireDepsPublication,
  fetchPitchCandidates,
  fetchSiteCandidates,
  fetchSiteRows,
  traiterProspect,
} from './chaine.js';
import { prendreProchain, unSeulALaFois, type FileDeps } from './stages/file.js';
import { balayer, creerSuiviBackoff, decouvrirEligiblesReel, type SuperviseurDeps } from './superviseur.js';

// `.env` vit a la racine du depot. Ni tsx ni Node ne le chargent tout seuls :
// sans cette ligne, la procedure documentee (« copier .env.example en .env »)
// echoue sur une erreur de configuration incomprehensible, et le collector ne
// marche que pour qui a exporte les variables dans son shell.
const ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const USAGE = `
prospeo <commande> --owner <uuid> [options]

  --owner <uuid> est OBLIGATOIRE sur toutes les commandes ci-dessous. Le
  collector se connecte en service_role, qui contourne RLS : ce drapeau est
  la seule chose qui borne une commande aux données d'un utilisateur. Il est
  répété sur chaque ligne parce qu'une option obligatoire absente de l'aide
  est une option qu'on découvre par une erreur.

Commandes
  discover --owner <uuid> --trade <slug> --postal-code <cp>
                                               Ingère les établissements Sirene
  enrich --owner <uuid> --trade <slug>         Apparie les fiches Google Maps
  review --owner <uuid>                        Tranche les appariements douteux
  calibrate --owner <uuid> [--trade <slug>] [--apply]
                                               Rejoue l'appariement hors ligne
  probe --owner <uuid>                         Sonde les URL déclarées
  score --owner <uuid>                         Classe et note les prospects
  reconcile --owner <uuid>                     Revérifie l'état Sirene des prospects
  domains --owner <uuid>                       Cherche un nom de domaine libre
  generate --owner <uuid> [--trade <slug>]     Rédige le contenu des sites (LLM)
  publish --owner <uuid>                       Crée les dépôts et y écrit le contenu
  deploy --owner <uuid>                        Déploie et enregistre les URL
  unpublish --owner <uuid> [--dry-run]         Dépublie les refus et les périmés
  pitch --owner <uuid> [--force]               Rédige email, SMS et script d'appel
  worker --owner <uuid>                        Draine la file du dashboard, en continu
  superviseur                                  Démarre/surveille/arrête un worker
                                               par utilisateur éligible — SANS --owner

Options
  --owner <uuid>       OBLIGATOIRE. Le propriétaire des données traitées. Un
                       worker sert UN utilisateur et ne draine que sa file.
  --limit <n>          Plafond d'enregistrements traités
  --force              (probe) Resonde même les URL encore fraîches
  --retry-not-found    Rejoue les prospects déjà classés introuvables
  --dry-run            (reconcile) Décide sans rien écrire, puis affiche le
                       décompte par action. Sort en 0, sauf si l'API n'a
                       répondu pour aucun SIRET.
  --force-deletions <n>
                       (reconcile) Exécute la vague de suppressions si, et
                       seulement si, elle en compte exactement n. Ce n'est pas
                       un plafond : tout écart, au-dessus comme en dessous,
                       rend la main au garde-fou. Un plafond confortable se
                       colle une fois dans une tâche planifiée et ne protège
                       plus jamais ; un nombre exact oblige à avoir regardé.
                       La suppression est irréversible et emporte
                       enrichissements, scores et historique.

Calibrer les seuils d'appariement
  calibrate ne sort PAS sur le réseau, hormis la lecture de la base : il
  rejoue l'appariement sur les candidats déjà enregistrés, sous les valeurs
  actuelles de MATCHING_CONFIG, et montre ce que la base deviendrait. Il
  n'écrit rien. La boucle de travail est donc : modifier les cinq nombres
  dans packages/core/src/matching.ts, relancer calibrate, regarder les
  verdicts qui bougent. Aucune requête Google dans cette boucle.

  Une fois les nombres arrêtés, --apply propage les nouveaux verdicts aux
  lignes déjà en base, toujours sans requête Google : les candidats y sont,
  il n'y a qu'à les renoter. Sans --apply, calibrate n'écrit rien.

  --apply ne touche JAMAIS une ligne tranchée en revue par un humain. C'est
  la seule donnée de cette base que rien ne permet de reconstituer, et un
  recalcul qui la contredirait ne ferait aucun bruit. Le décompte des lignes
  ainsi protégées est affiché.

La chaine de vente, dans l'ordre
  generate  ->  publish  ->  deploy

  Les trois etages sont independants et rejouables. generate ecrit le contenu
  en base (colonne prospect_site.content) sans rien publier : on peut donc
  generer un lot, le relire, et ne publier que ce qu'on retient.

  Chacun ne traite que ce qui lui reste a faire. Rejouer la chaine entiere
  apres un run complet ne fait rien, n'appelle aucune API et ne coute rien :
  generate saute les contenus deja ecrits, publish compare l'empreinte du
  contenu a celle du depot, deploy saute les sites qui ont deja une URL.

  --force  (generate) Regenere un contenu deja ecrit. C'est la seule option
           qui depense de l'argent sur un prospect deja traite.

  Les prospects sont pris par SCORE DECROISSANT : --limit 3 traite les trois
  meilleurs, jamais trois au hasard.

  generate compte et affiche les jetons consommes, en separant l'entree,
  l'ecriture de cache et la lecture de cache : elles sont facturees a trois
  tarifs differents, et les additionner masquerait ce que le cache economise.

Depublier, comme le veut D5
  unpublish retire les sites des prospects passes a ne_pas_contacter ou perdu
  — sans delai — et ceux restes sans reponse au-dela de 90 jours. Les
  prospects interesse et gagne en sont exemptes : le delai vise le silence,
  pas l'anciennete.

  Comme reconcile, cette commande detruit : --dry-run decide, compte et
  n'ecrit rien.

Supprimer des prospects, en deux temps
  1. prospeo reconcile --dry-run
     Ne touche à rien et affiche « n à supprimer ». Vérifier que ce nombre a
     un sens : une API en panne rend « absent » toute la base.
  2. prospeo reconcile --force-deletions <ce nombre exact>
     Rejoue le run et exécute les suppressions. Si le nombre a bougé entre
     les deux passes, la dérogation ne vaut plus et rien n'est supprimé.
`;

/**
 * Plafond de prospects enrichis par jour.
 *
 * Il compte des **prospects**, pas des requêtes envoyées à Google, et l'écart
 * est considérable. Un prospect introuvable épuise les trois requêtes de
 * `queriesFor`, et chacune charge sa page de résultats plus une fiche par
 * candidat retenu (`maxCandidates`, cinq par défaut) : jusqu'à **dix-huit
 * navigations** pour un seul prospect, et près de 5 400 pages pour un run
 * plein — soit une dizaine d'heures au délai anti-bot de 3 à 8 secondes.
 *
 * C'est pourtant ce compteur-là qu'on retient, parce que c'est le seul qui
 * survive à un redémarrage : il se relit depuis la base, alors qu'un compteur
 * de navigations exigerait une table.
 *
 * Le volume réellement envoyé à Google est donc rapporté séparément en fin de
 * run, via `source.navigations`, pour rester visible plutôt que deviné.
 */
const DAILY_CAP = 300;

/**
 * Une page de la lecture de `score`. Extrait dans une fonction pour que le
 * littéral passé à `select()` reste un littéral : supabase-js infère le type de
 * la ligne à partir de ce littéral, et toute concaténation l'élargirait en
 * `string`, faisant retomber l'inférence sur `GenericStringError`.
 */
function fetchScorePage(
  client: ReturnType<typeof createClient>,
  proprietaire: Proprietaire,
  from: number,
) {
  return client
    .from('prospect')
    .select(
      'id, denomination, date_creation, effectif_code, is_closed, prospect_enrichment(status, declared_url, social_urls, phone_e164, rating, review_count), web_presence(category, probed_url, http_status, is_https, final_url, is_parked, has_viewport_meta, last_social_post_at)',
    )
    .eq('owner_id', proprietaire)
    .order('id')
    .range(from, from + PAGE_SIZE - 1);
}

/** Commandes reconnues. Les étages sont branchés par les tâches 9 à 11. */
const COMMANDS = [
  'discover',
  'enrich',
  'review',
  'calibrate',
  'probe',
  'score',
  'reconcile',
  'domains',
  'generate',
  'publish',
  'deploy',
  'unpublish',
  'pitch',
  'worker',
  'superviseur',
] as const;

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

/**
 * Lit et valide `--limit`, ou `'invalide'` si la valeur ne tient pas.
 *
 * `Number('abc')` rend NaN, et toute comparaison à NaN est fausse : une garde
 * non validée ne se déclencherait jamais, et la commande partirait sans borne.
 * Le helper est partagé parce que la validation ne l'était pas : `--limit`
 * était annoncé comme option générale et n'était lu que par deux commandes sur
 * six. Un `domains --limit 5`, tapé pour éprouver prudemment un étage neuf,
 * envoyait en réalité jusqu'à 1 260 requêtes au registre `.fr`.
 */
function parseLimit(argv: string[]): number | undefined | 'invalide' {
  if (!argv.includes('--limit')) return undefined;
  const raw = flag(argv, 'limit');
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    process.stderr.write(`--limit attend un entier positif, reçu : ${raw ?? '(rien)'}\n`);
    return 'invalide';
  }
  return parsed;
}

/**
 * Identifiants des prospects marqués cessés par `reconcile`.
 *
 * Le §1 du spec pose comme critère de succès qu'un établissement qui cesse
 * « cesse d'être traité comme un prospect valide ». `is_closed` n'avait
 * pourtant qu'un lecteur, le barème : les étages coûteux continuaient de
 * scraper Google, de sonder des sites et d'interroger le registre pour des
 * entreprises fermées — jusqu'à 270 navigations et quarante minutes par run
 * pour quinze cessations, au détriment des vivantes.
 */
async function fetchClosedIds(
  client: ReturnType<typeof createClient>,
  proprietaire: Proprietaire,
): Promise<Set<string>> {
  const closed = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('prospect')
      .select('id')
      .eq('owner_id', proprietaire)
      .eq('is_closed', true)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) closed.add(row.id);
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return closed;
}

/** Les prospects qui ont déjà au moins un message archivé. */
async function fetchProspectsDejaRediges(
  client: ReturnType<typeof createClient>,
  proprietaire: Proprietaire,
): Promise<Set<string>> {
  const vus = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('generated_message')
      .select('prospect_id, prospect!inner()')
      // `!inner` obligatoire : sans lui, PostgREST vide la relation et rend
      // TOUTES les lignes. Voir le commentaire de `fetchSiteRows`.
      .eq('prospect.owner_id', proprietaire)
      .order('prospect_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) vus.add(r.prospect_id);
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return vus;
}

// Le point d'entrée réel de `tsx`, résolu en JS pur — jamais `npx tsx` : sous
// Windows, `npx` est un script `.cmd`, que `spawn` ne peut invoquer sans
// `shell: true` ; or un enfant lancé via un shell POSIX n'est pas garanti de
// relayer un signal à son propre enfant (`kill()` sur le shell peut laisser
// le vrai process orphelin). `tsx/cli` est un fichier `.mjs` que `node`
// exécute directement, sur les deux plateformes, sans intermédiaire.
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve('tsx/cli');

async function runSuperviseur(): Promise<number> {
  const config = loadConfig(process.env);
  const client = createClient(config);

  const PERIODE_BALAYAGE_MS = 60_000;
  const processus = new Map<string, ChildProcess>();
  const backoff = creerSuiviBackoff();
  let arret = false;

  mkdirSync('logs', { recursive: true });

  const demarrerProcessus = (ownerId: string): void => {
    const enfant = spawn(process.execPath, [TSX_CLI, 'src/cli.ts', 'worker', '--owner', ownerId]);
    processus.set(ownerId, enfant);
    backoff.enregistrerDemarrage(ownerId, new Date());

    const journal = createWriteStream(`logs/worker-${ownerId}.log`, { flags: 'a' });
    enfant.stdout?.pipe(journal);
    enfant.stderr?.pipe(journal);

    enfant.on('exit', () => {
      processus.delete(ownerId);
      backoff.enregistrerSortie(ownerId, new Date());
      if (arret) return;
      // Signal PRINCIPAL de redémarrage (voir `superviseur.ts`) : `balayer`
      // ne redémarre que ce qu'il ne voit pas encore comme suivi, `exit` est
      // ce qui le lui apprend sans attendre le prochain balayage de 60s.
      const delai = backoff.delaiRedemarrageMs(ownerId);
      setTimeout(() => {
        if (!arret) demarrerProcessus(ownerId);
      }, delai);
    });
  };

  const deps: SuperviseurDeps = {
    decouvrirEligibles: () => decouvrirEligiblesReel(client),
    suivis: () => new Set(processus.keys()),
    demarrer: demarrerProcessus,
    arreterProprement: (ownerId) => {
      processus.get(ownerId)?.kill('SIGTERM');
    },
    tuerSansGrace: (ownerId) => {
      processus.get(ownerId)?.kill('SIGKILL');
    },
    async dernierBattement(ownerId) {
      const { data, error } = await client
        .from('worker_heartbeat_utilisateur')
        .select('beat_at')
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data === null ? null : new Date(data.beat_at);
    },
    maintenant: () => new Date(),
  };

  const cycle = (): void => {
    void balayer(deps).catch((cause: unknown) => {
      process.stderr.write(
        `superviseur : balayage interrompu — ${cause instanceof Error ? cause.message : String(cause)}\n`,
      );
    });
  };

  const balayage = setInterval(cycle, PERIODE_BALAYAGE_MS);
  cycle();

  const fermer = (): void => {
    arret = true;
    clearInterval(balayage);
    for (const enfant of processus.values()) enfant.kill('SIGTERM');
    process.stdout.write('superviseur : arrêt demandé, plus aucun démarrage\n');
  };
  process.on('SIGINT', fermer);
  process.on('SIGTERM', fermer);

  process.stdout.write('superviseur : à l’écoute\n');

  await new Promise<void>((resoudre) => {
    const attendre = setInterval(() => {
      if (arret && processus.size === 0) {
        clearInterval(attendre);
        resoudre();
      }
    }, 500);
  });
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  // La commande est validée AVANT le chargement de la configuration : sinon une
  // simple faute de frappe répond « configuration invalide », ce qui envoie
  // chercher un problème qui n'existe pas.
  if (!(COMMANDS as readonly string[]).includes(command)) {
    process.stderr.write(`Commande inconnue : ${command}\n${USAGE}`);
    return 1;
  }

  // LU UNE SEULE FOIS, AVANT LE `switch`, et jamais dans chaque `case`.
  //
  // Le collector se connecte en `service_role`, qui contourne RLS par
  // construction : aucune politique ne le retiendra jamais, et une lecture
  // sans filtre ne leve rien — elle rend simplement les lignes de tout le
  // monde. Le filtre explicite est la SEULE barriere.
  //
  // Repartir la lecture dans les quatorze `case` reviendrait a parier
  // qu'aucune commande future ne l'oubliera. Ici, une commande neuve herite
  // de la garde sans rien faire, et `proprietaire` leve avant le moindre
  // acces reseau : une valeur absente ferait lire la base entiere, une
  // valeur mal formee rendrait zero ligne qu'on prendrait pour « rien a
  // faire ». Les deux echecs sont silencieux, celui-ci est bruyant.
  // `superviseur` sert TOUS les utilisateurs éligibles : c'est la seule
  // commande sans --owner, et elle doit contourner la lecture universelle
  // ci-dessous — sans quoi `lireProprietaire` lèverait avant même
  // d'atteindre son traitement.
  if (command === 'superviseur') {
    return runSuperviseur();
  }

  const proprietaire = lireProprietaire(flag(argv, 'owner'));

  switch (command) {
    case 'discover': {
      const slug = flag(argv, 'trade');
      const postalCode = flag(argv, 'postal-code');
      if (slug === undefined || postalCode === undefined) {
        process.stderr.write('discover exige --trade et --postal-code\n');
        return 1;
      }
      const trade = getTrade(slug);
      if (trade === undefined) {
        process.stderr.write(`Métier inconnu : ${slug}\n`);
        return 1;
      }

      // `--limit` est validé explicitement : `Number.parseInt('abc')` rend NaN,
      // et `seen >= NaN` est toujours faux — la garde ne se déclencherait jamais
      // et la collecte partirait sans limite sur l'API publique.
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;

      const config = loadConfig(process.env);
      const client = createClient(config);
      const report = await runDiscover({
        trade,
        postalCode,
        limit,
        upsertProspect: makeUpsertProspect(client, proprietaire),
      });
      process.stdout.write(
        `discover ${trade.slug} ${postalCode} : ${report.upserted}/${report.seen} enregistrés\n`,
      );
      return 0;
    }
    case 'enrich': {
      const slug = flag(argv, 'trade');
      if (slug === undefined) {
        process.stderr.write('enrich exige --trade\n');
        return 1;
      }
      const trade = getTrade(slug);
      if (trade === undefined) {
        process.stderr.write(`Métier inconnu : ${slug}\n`);
        return 1;
      }

      // Même validation que `discover`, et pour la même raison : `Number('abc')`
      // rend NaN, et toute comparaison à NaN est fausse — la garde ne se
      // déclencherait jamais. Ici l'enjeu est plus lourd que là-bas : un
      // `enrich` sans borne part sur 300 prospects, soit jusqu'à 5 400 pages
      // Google et une dizaine d'heures — voir le calcul au commentaire de
      // `DAILY_CAP` — alors que `--limit` sert justement à éprouver
      // prudemment des seuils non calibrés.
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;

      const config = loadConfig(process.env);
      const client = createClient(config);

      // Prospects sans enrichissement, ou dont le dernier run a été bloqué.
      const enriched = new Map<string, string>();
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect_enrichment')
          .select('prospect_id, status, prospect!inner()')
          // `!inner` obligatoire : sans lui PostgREST vide la relation et
          // rend toutes les lignes. Voir `fetchSiteRows` dans chaine.ts.
          .eq('prospect.owner_id', proprietaire)
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) enriched.set(row.prospect_id, row.status);
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      const prospects: EnrichProspect[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect')
          .select('id, denomination, denomination_usuelle, city, address, latitude, longitude')
          .eq('owner_id', proprietaire)
          .eq('trade_slug', trade.slug)
          // Une entreprise cessee n'est plus un prospect : la scraper
          // consommerait du quota Google au detriment des vivantes.
          .eq('is_closed', false)
          .order('id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          const status = enriched.get(row.id);
          // `not_found` n'est pas rejoué automatiquement : c'est un verdict,
          // pas un échec. `--retry-not-found` le rouvre explicitement.
          if (status === 'ok' || status === 'ambiguous') continue;
          if (status === 'not_found' && !argv.includes('--retry-not-found')) continue;
          prospects.push({
            id: row.id,
            denomination: row.denomination,
            denominationUsuelle: row.denomination_usuelle,
            city: row.city,
            address: row.address,
            latitude: row.latitude,
            longitude: row.longitude,
          });
        }
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      // Plafond journalier : compté depuis la base, donc respecté même après
      // un redémarrage du processus.
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { count, error: countError } = await client
        .from('prospect_enrichment')
        // Le plafond est CELUI DU PROPRIETAIRE. Non filtre, le quota d'un
        // client serait consomme par le scraping d'un autre — un run rendu
        // vide sans qu'aucune erreur ne le dise.
        .select('prospect_id, prospect!inner()', { count: 'exact', head: true })
        .eq('prospect.owner_id', proprietaire)
        .gte('enriched_at', since.toISOString());
      if (countError) throw new Error(countError.message);
      const capRemaining = Math.max(0, DAILY_CAP - (count ?? 0));
      // `--limit` borne le nombre de prospects traités, au même titre que le
      // plafond journalier : c'est le plus contraignant des deux qui s'applique.
      const dailyRemaining = limit === undefined ? capRemaining : Math.min(capRemaining, limit);

      const source = createGoogleMapsSource({
        userDataDir: process.env.PLAYWRIGHT_USER_DATA_DIR ?? '.playwright-profile',
      });

      let report;
      try {
        report = await runEnrich({
          prospects,
          trade,
          config: MATCHING_CONFIG,
          source,
          dailyRemaining,
          upsert: async (row) => {
            // `row.prospect_id` sort de la liste `prospects` batie ci-dessus,
            // filtree sur le proprietaire : PostgREST ne filtre pas un
            // `upsert` sur une relation embarquee, c'est la provenance qui
            // cloisonne.
            const { error } = await client
              .from('prospect_enrichment')
              .upsert(row, { onConflict: 'prospect_id' });
            if (error) throw new Error(error.message);
          },
        });
      } finally {
        await source.close();
      }

      // Les deux familles d'échec sont rapportées séparément : un échec de
      // lecture est un incident isolé, un échec d'écriture veut dire qu'on a
      // scrapé Google sans rien garder.
      process.stdout.write(
        `enrich ${trade.slug} : ${report.ok} appariés, ${report.ambiguous} à trancher, ` +
          `${report.notFound} introuvables, ${report.failed} en échec de lecture, ` +
          `${report.writeFailed} en échec d'écriture ` +
          `(${source.navigations} pages Google chargées)\n`,
      );
      if (report.stoppedByCap) {
        const raison =
          limit !== undefined && limit <= capRemaining
            ? `limite demandée de ${limit} prospects`
            : `plafond journalier de ${DAILY_CAP} prospects`;
        process.stdout.write(`Arrêt : ${raison} atteint.\n`);
      }
      if (report.stoppedByWriteFailures) {
        process.stderr.write(
          "Arrêt : trop d'échecs d'écriture consécutifs — vérifier la migration et les droits de la clé.\n",
        );
      }
      if (report.blocked) {
        process.stderr.write('Arrêt : Google a interposé une vérification.\n');
        // Code 2, distinct du 1 des erreurs d'usage : une automatisation doit
        // pouvoir reconnaître un blocage anti-bot sans lire stderr. Il l'emporte
        // sur le code 1 des échecs d'écriture : c'est la cause à traiter en
        // premier, et relancer avant de l'avoir traitée ne peut que la durcir.
        return 2;
      }
      if (report.stoppedByEmptySearches) {
        process.stderr.write(
          `Arrêt : ${report.emptySearches} prospects d'affilée sans le moindre candidat. ` +
            'La lecture de Google Maps est probablement cassée — un sélecteur renommé ' +
            "rend un tableau vide sans lever d'erreur, et chaque prospect ressort alors " +
            'introuvable à tort.\n' +
            "Vérifier les sélecteurs de `sources/google-maps.ts` sur une recherche réelle, " +
            'puis rejouer ces lignes avec `enrich --retry-not-found`.\n',
        );
        return 1;
      }
      // Une écriture perdue casse le point de reprise du run : le sortir en 0
      // ferait passer « 300 prospects scrapés, rien d'écrit » pour un succès.
      if (report.writeFailed > 0) return 1;
      return 0;
    }
    case 'review': {
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;

      const config = loadConfig(process.env);
      const client = createClient(config);

      // Paginé comme toute lecture du projet : la file ambiguë est courte
      // aujourd'hui, mais une lecture non paginée présenterait une tranche
      // arbitraire comme la file complète le jour où elle ne le sera plus.
      const queue: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect_enrichment')
          .select(
            'prospect_id, candidates, enriched_at, prospect!inner(denomination, denomination_usuelle, address, naf_code, trade_slug)',
          )
          // `prospect!inner(...)` et non `prospect(...)` : c'est le `!inner`
          // qui restreint les lignes de `prospect_enrichment`. Sans lui, la
          // file presenterait a l'operateur les appariements douteux de tous
          // les clients, et sa decision s'ecrirait chez eux.
          .eq('prospect.owner_id', proprietaire)
          .eq('status', 'ambiguous')
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        queue.push(...((data ?? []) as unknown as Record<string, unknown>[]));
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      // L'interface n'est ouverte qu'une fois la file lue : créée avant, elle
      // maintiendrait stdin actif et le processus resterait suspendu si la
      // lecture échouait, au lieu de sortir sur son erreur.
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      let settled = 0;
      let reviewFailed = 0;
      try {
        // `--limit` borne ce que la commande traite reellement, et pas
        // seulement ce qu elle annonce : le valider sans l appliquer serait
        // pire que l ignorer.
        for (const row of queue.slice(0, limit)) {
          // Tout le traitement d'un prospect est protégé, affichage compris.
          // `candidates` vient d'une colonne `jsonb` : une ligne mal formée —
          // un `lines` absent, une `confidence` manquante — lèverait dans le
          // code d'affichage et emporterait la session entière au milieu de la
          // file. Les décisions déjà écrites survivraient, mais l'opérateur
          // devrait tout reprendre.
          try {
            const p = (Array.isArray(row.prospect) ? row.prospect[0] : row.prospect) as
              | Record<string, unknown>
              | null;
            if (p === null || p === undefined) continue;

            const slug = p.trade_slug as string | null;
            const trade = slug === null ? undefined : getTrade(slug);
            const nafOk =
              trade === undefined ? null : nafMatchesTrade(p.naf_code as string | null, trade);

            process.stdout.write(`\n${'─'.repeat(60)}\n`);
            process.stdout.write(
              `${(p.denomination as string | null) ?? '(sans dénomination)'}\n` +
                `${(p.address as string | null) ?? '(sans adresse)'}\n`,
            );
            if (trade === undefined) {
              // Un métier absent de la configuration n'est pas anodin : le
              // drapeau NAF ne peut plus être calculé, et l'opérateur tranche
              // alors sans ce signal. Mieux vaut le dire que le taire.
              process.stdout.write(`⚠ métier « ${slug ?? '?'} » inconnu de la configuration\n`);
            }
            if (nafOk === false) {
              process.stdout.write(
                `⚠ NAF ${p.naf_code as string} étranger au métier ${trade?.label ?? ''}\n`,
              );
            }

            const candidates = (row.candidates ?? []) as ReviewCandidate[];
            candidates.forEach((c, index) => {
              // Les candidats éliminés sont désormais écrits eux aussi, et ils
              // apparaissent donc ici. C'est voulu : un candidat écarté d'un
              // cheveu par le rayon est exactement ce qu'un humain doit
              // pouvoir repêcher, et son repêchage est la réponse à la
              // troisième question de la calibration. Le marqueur dit
              // pourquoi la machine ne le proposait pas.
              const ecarte =
                c.rejectedFor === 'distance'
                  ? '  ✗ écarté : hors rayon'
                  : c.rejectedFor === 'confiance'
                    ? '  ✗ écarté : sous le seuil bas'
                    : '';
              process.stdout.write(
                `\n  [${index + 1}] ${c.name}  (confiance ${c.confidence.toFixed(2)})${ecarte}\n`,
              );
              for (const line of c.lines ?? []) process.stdout.write(`      ${line.label}\n`);
              if (c.phone !== null) process.stdout.write(`      tél. ${c.phone}\n`);
              if (c.website !== null) process.stdout.write(`      ${c.website}\n`);
              if (c.rating !== null) process.stdout.write(`      note ${c.rating}\n`);
            });
            if (candidates.some((c) => c.rejectedFor != null)) {
              process.stdout.write(
                '\n  (les fiches marquées ✗ restent choisissables : les retenir est\n' +
                  '   précisément ce qui dit que le réglage est trop serré)\n',
              );
            }

            const answer = (
              await rl.question('\n  Numéro à retenir, [a]ucun, [p]lus tard : ')
            ).trim();
          // Toute réponse qui n'est pas un nombre vaut report, jamais erreur :
          // devant une file de cas douteux, la faute de frappe la plus probable
          // est une touche parasite, et repasser plus tard est l'interprétation
          // la moins destructrice. Un indice hors bornes, lui, échoue
          // bruyamment — `applyReviewDecision` lève et la boucle journalise
          // sans interrompre la revue.
            const index = /^\d+$/.test(answer) ? Number(answer) - 1 : null;
            const decision: ReviewDecision =
              answer === 'a'
                ? { kind: 'reject' }
                : index === null
                  ? { kind: 'skip' }
                  : { kind: 'accept', index };

            if (decision.kind === 'skip') continue;

            const updated = applyReviewDecision(
              row.prospect_id as string,
              candidates,
              decision,
              // Repris de la ligne existante : trancher un doute n'enrichit
              // rien, et réécrire cet horodatage ferait consommer le quota de
              // scraping du lendemain par une session purement humaine.
              row.enriched_at as string,
            );
            // `row.prospect_id` vient de la file lue ci-dessus, filtree.
            const { error: writeError } = await client
              .from('prospect_enrichment')
              .upsert(updated, { onConflict: 'prospect_id' });
            if (writeError) throw new Error(writeError.message);
            settled += 1;
          } catch (failure) {
            reviewFailed += 1;
            process.stderr.write(
              `review: ${failure instanceof Error ? failure.message : String(failure)}\n`,
            );
          }
        }
      } finally {
        // Fermée même si la revue s'interrompt : une interface ouverte tient
        // stdin, et le processus ne rendrait jamais la main.
        rl.close();
      }

      process.stdout.write(
        `\nreview : ${settled} cas tranchés` +
          (reviewFailed > 0 ? `, ${reviewFailed} en échec d'écriture\n` : '\n'),
      );
      // Une décision humaine perdue est la plus chère de toutes : l'opérateur
      // a tranché, et rien ne le lui redemandera s'il ne le sait pas.
      return reviewFailed > 0 ? 1 : 0;
    }
    case 'calibrate': {
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;

      const slug = flag(argv, 'trade');
      if (slug !== undefined && getTrade(slug) === undefined) {
        process.stderr.write(`Métier inconnu : ${slug}\n`);
        return 1;
      }

      const config = loadConfig(process.env);
      const client = createClient(config);

      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect_enrichment')
          .select(
            'prospect_id, status, matched_name, candidates, decided_by, enriched_at, prospect!inner(denomination, denomination_usuelle, latitude, longitude, trade_slug)',
          )
          // `!inner`, sans quoi `--apply` reecrirait les verdicts d'un autre
          // client sous les seuils qu'un tiers vient de regler.
          .eq('prospect.owner_id', proprietaire)
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      const subjects: StoredEnrichment[] = [];
      let sansMetier = 0;
      for (const row of rows) {
        const p = (Array.isArray(row.prospect) ? row.prospect[0] : row.prospect) as
          | Record<string, unknown>
          | null;
        if (p === null || p === undefined) continue;
        const tradeSlug = p.trade_slug as string | null;
        if (slug !== undefined && tradeSlug !== slug) continue;
        const trade = tradeSlug === null ? undefined : getTrade(tradeSlug);
        if (trade === undefined) {
          // Sans métier, ni la catégorie ni les jetons génériques ne se
          // calculent : rejouer rendrait un score qui n'est comparable à
          // rien. On le dit plutôt que de le compter comme un rejeu.
          sansMetier += 1;
          continue;
        }
        subjects.push({
          prospectId: row.prospect_id as string,
          denomination: (p.denomination as string | null) ?? '(sans dénomination)',
          denominationUsuelle: p.denomination_usuelle as string | null,
          latitude: p.latitude as number | null,
          longitude: p.longitude as number | null,
          trade,
          status: row.status as StoredEnrichment['status'],
          matchedName: row.matched_name as string | null,
          candidates: (row.candidates ?? []) as ReviewCandidate[],
          decidedBy: (row.decided_by ?? 'matcher') as StoredEnrichment['decidedBy'],
          enrichedAt: row.enriched_at as string,
        });
      }

      const c = MATCHING_CONFIG;
      process.stdout.write(
        `calibrate — configuration ${c.version} en vigueur, rejeu hors ligne\n` +
          `  poids : nom ${c.nameWeight}, distance ${c.distanceWeight}, catégorie ${c.categoryWeight}\n` +
          `  rayon : ${c.maxDistanceM} m — seuils : ${c.lowThreshold} (revue) / ${c.highThreshold} (fusion)\n`,
      );

      const replays = subjects.slice(0, limit).map((subject) => replayEnrichment(subject, c));

      for (const replay of replays) {
        process.stdout.write(`\n${'─'.repeat(60)}\n`);
        if (replay.replayed === null) {
          process.stdout.write(`${replay.denomination}  [${replay.stored.status}]\n`);
          process.stdout.write(`  non rejouable : ${replay.unreplayable}\n`);
          continue;
        }
        const verdict =
          replay.stored.status === replay.replayed.status
            ? replay.stored.status
            : `${replay.stored.status} → ${replay.replayed.status}`;
        process.stdout.write(
          `${replay.denomination}  [${verdict}]${replay.changed ? '  ⚠ verdict changé' : ''}\n`,
        );
        if (replay.changed && replay.stored.matchedName !== replay.replayed.matchedName) {
          process.stdout.write(
            `  fiche retenue : ${replay.stored.matchedName ?? 'aucune'} → ` +
              `${replay.replayed.matchedName ?? 'aucune'}\n`,
          );
        }
        for (const scored of replay.replayed.scored) {
          const mark =
            scored.rejectedFor === 'distance'
              ? '✗ hors rayon'
              : scored.rejectedFor === 'confiance'
                ? '✗ sous le seuil bas'
                : '✓ retenu';
          process.stdout.write(
            `\n  ${mark}  ${scored.candidate.name}  ${scored.score.confidence.toFixed(3)}\n`,
          );
          for (const line of scored.score.lines) process.stdout.write(`      ${line.label}\n`);
        }
      }

      let applied = 0;
      let protege = 0;
      let applyFailed = 0;
      if (argv.includes('--apply')) {
        for (let index = 0; index < replays.length; index += 1) {
          const subject = subjects[index];
          const replay = replays[index];
          if (subject === undefined || replay === undefined) continue;
          if (subject.decidedBy === 'human') {
            protege += 1;
            continue;
          }
          const rewritten = rewriteFromReplay(subject, replay);
          if (rewritten === null) continue;
          // Rien n'est écrit quand le verdict ne bouge pas : une écriture
          // inutile ferait remonter la ligne dans tout suivi de modification
          // et coûterait un aller-retour par prospect.
          if (!replay.changed) continue;
          // `subject.prospectId` vient de la lecture filtree ci-dessus.
          const { error } = await client
            .from('prospect_enrichment')
            .upsert(rewritten, { onConflict: 'prospect_id' });
          if (error !== null) {
            applyFailed += 1;
            process.stderr.write(
              `calibrate: échec d'écriture sur ${subject.prospectId} — ${error.message}\n`,
            );
            continue;
          }
          applied += 1;
        }
      }

      const summary = summarizeReplays(replays);
      process.stdout.write(
        `\ncalibrate : ${summary.replayed} lignes rejouées, ${summary.changed} verdicts changés, ` +
          `${summary.unreplayable} non rejouables\n` +
          `  verdicts : ${summary.byStatus.ok} fusionnés, ${summary.byStatus.ambiguous} à trancher, ` +
          `${summary.byStatus.not_found} introuvables\n` +
          `  éliminations : ${summary.eliminated.distance} par le rayon, ` +
          `${summary.eliminated.confiance} sous le seuil bas\n`,
      );
      if (sansMetier > 0) {
        process.stdout.write(`  ${sansMetier} lignes ignorées : métier inconnu de la configuration\n`);
      }
      if (argv.includes('--apply')) {
        process.stdout.write(
          `  appliqué : ${applied} verdicts réécrits` +
            (protege > 0 ? `, ${protege} préservés (tranchés en revue par un humain)` : '') +
            (applyFailed > 0 ? `, ${applyFailed} en échec d'écriture` : '') +
            '\n',
        );
      } else if (summary.changed > 0) {
        process.stdout.write(
          '  Relancer avec --apply pour propager ces verdicts en base, sans requête Google.\n',
        );
      }
      if (summary.unreplayable > 0) {
        process.stdout.write(
          '  Les lignes non rejouables datent d’avant l’enregistrement complet des\n' +
            '  candidats. Un `enrich --retry-not-found` les reconstruit pour les introuvables ;\n' +
            '  une ligne `ok` ou `ambiguous` doit être supprimée à la main pour être reprise.\n',
        );
      }
      return 0;
    }
    case 'probe': {
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;

      const config = loadConfig(process.env);
      const client = createClient(config);
      // Les cessations viennent de `reconcile` et vivent sur `prospect` :
      // les deux lectures ci-dessous portent sur d'autres tables, on ecarte
      // donc en memoire plutot que par une jointure fragile.
      const closed = await fetchClosedIds(client, proprietaire);

      // PostgREST plafonne les reponses (max_rows = 1000). Sans pagination, un
      // run au-dela de ce seuil traiterait une tranche arbitraire et afficherait
      // un compte-rendu de succes complet : la troncature serait invisible.
      // L'ordre explicite rend les pages deterministes.
      const rows: { prospect_id: string; declared_url: string | null }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect_enrichment')
          .select('prospect_id, declared_url, prospect!inner()')
          // `!inner` obligatoire : voir `fetchSiteRows` dans chaine.ts.
          .eq('prospect.owner_id', proprietaire)
          .not('declared_url', 'is', null)
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      const force = argv.includes('--force');
      const now = new Date();

      // Deuxième lecture paginée : les horodatages de sonde.
      const probedAt = new Map<string, string | null>();
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('web_presence')
          .select('prospect_id, probed_at, prospect!inner()')
          .eq('prospect.owner_id', proprietaire)
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) probedAt.set(row.prospect_id, row.probed_at);
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      let done = 0;
      let writeFailed = 0;
      let skipped = 0;
      // `--limit` borne ce que la commande traite reellement, et pas seulement
      // ce qu elle annonce : le valider sans l appliquer serait pire que
      // l ignorer.
      for (const row of rows.slice(0, limit)) {
        if (closed.has(row.prospect_id)) continue;
        if (!shouldProbe(probedAt.get(row.prospect_id) ?? null, now, force)) {
          skipped += 1;
          continue;
        }
        // Un échec isolé ne doit pas avorter le run : même discipline que
        // `discover`, l'écriture est unitaire et l'erreur est journalisée.
        try {
          const result = await probeUrl(row.declared_url as string);
          // `row.prospect_id` vient de la lecture filtree de
          // `prospect_enrichment` ci-dessus.
          const { error: writeError } = await client.from('web_presence').upsert(
            {
              prospect_id: row.prospect_id,
              probed_url: result.url,
              http_status: result.httpStatus,
              is_https: result.isHttps,
              final_url: result.finalUrl,
              is_parked: result.isParked,
              has_viewport_meta: result.hasViewportMeta,
              probed_at: new Date().toISOString(),
            },
            { onConflict: 'prospect_id' },
          );
          if (writeError) throw new Error(writeError.message);
          done += 1;
        } catch (error) {
          writeFailed += 1;
          process.stderr.write(
            `probe: échec sur ${row.prospect_id} — ${error instanceof Error ? error.message : String(error)}\n`,
          );
        }
      }
      process.stdout.write(
        `probe : ${done} URL sondées, ${skipped} encore fraîches` +
          (writeFailed > 0 ? `, ${writeFailed} en échec d'écriture\n` : '\n'),
      );
      // Une écriture perdue casse le point de reprise du run : sortir en 0
      // ferait passer « rien n'a été écrit » pour un succès, et la tâche
      // planifiée ne verrait jamais la panne.
      return writeFailed > 0 ? 1 : 0;
    }
    case 'score': {
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;

      const config = loadConfig(process.env);
      const client = createClient(config);
      // Meme raison que pour `probe` : sans pagination explicite, au-dela de
      // max_rows le rapport annoncerait un succes sur une tranche arbitraire.
      const data: Awaited<ReturnType<typeof fetchScorePage>>['data'] = [];
      let error: { message: string } | null = null;
      for (let from = 0; ; from += PAGE_SIZE) {
        const page = await fetchScorePage(client, proprietaire, from);
        if (page.error) {
          error = page.error;
          break;
        }
        data.push(...(page.data ?? []));
        if ((page.data ?? []).length < PAGE_SIZE) break;
      }
      if (error) throw new Error(error.message);

      let scored = 0;
      // Deux populations distinctes, qui n'appellent pas la même commande :
      // l'une attend un run de `enrich`, l'autre un run de `probe`. Les
      // confondre sous un seul « en attente » cacherait laquelle relancer.
      let pendingEnrichment = 0;
      let pendingProbe = 0;
      let eraseFailed = 0;
      let scoreFailed = 0;
      let presenceFailed = 0;

      // `--limit` borne ce que la commande traite reellement, et pas seulement
      // ce qu elle annonce : le valider sans l appliquer serait pire que
      // l ignorer.
      for (const p of (data ?? []).slice(0, limit)) {
        const enrichment = (Array.isArray(p.prospect_enrichment)
          ? p.prospect_enrichment[0]
          : p.prospect_enrichment) as Record<string, unknown> | null;
        const presence = (Array.isArray(p.web_presence)
          ? p.web_presence[0]
          : p.web_presence) as Record<string, unknown> | null;

        const write = planScoreWrite({
          prospectId: p.id as string,
          declaredUrl: (enrichment?.declared_url as string | null) ?? null,
          socialUrls: (enrichment?.social_urls as string[] | null) ?? [],
          probe:
            presence?.probed_url == null
              ? null
              : {
                  url: presence.probed_url as string,
                  reachable: presence.http_status !== null,
                  httpStatus: (presence.http_status as number | null) ?? null,
                  isHttps: presence.is_https === true,
                  finalUrl: (presence.final_url as string | null) ?? null,
                  hasViewportMeta: presence.has_viewport_meta === true,
                  isParked: presence.is_parked === true,
                },
          rating: (enrichment?.rating as number | null) ?? null,
          reviewCount: (enrichment?.review_count as number | null) ?? null,
          lastSocialPostAt: (presence?.last_social_post_at as string | null) ?? null,
          effectifCode: (p.effectif_code as string | null) ?? null,
          dateCreation: (p.date_creation as string | null) ?? null,
          phoneRaw: (enrichment?.phone_e164 as string | null) ?? null,
          denomination: p.denomination as string,
          // Renseigné par `reconcile`. La valeur codée en dur d'origine
          // rendait le disqualifiant du barème inatteignable.
          isClosed: p.is_closed === true,
          // `null` quand le prospect n'a aucune ligne d'enrichissement, ce qui
          // veut dire que personne ne l'a encore regardé.
          enrichmentStatus:
            (enrichment?.status as ScoreRowInput['enrichmentStatus'] | undefined) ?? null,
        });

        if (write.kind === 'erase') {
          // Effacer plutôt que laisser en place : le score précédent a été
          // calculé sans connaître l'URL qu'on vient de découvrir.
          //
          // Les deux ecritures portent sur `write.prospectId`, issu de
          // `fetchScorePage`, filtree sur le proprietaire. PostgREST ne
          // filtre pas un `delete` ni un `update` sur une relation
          // embarquee : c'est la provenance de l'identifiant qui cloisonne,
          // et c'est pourquoi la lecture qui le produit porte son filtre.
          const { error: eraseScoreError } = await client
            .from('prospect_score')
            .delete()
            .eq('prospect_id', write.prospectId);
          const { error: eraseCategoryError } = await client
            .from('web_presence')
            .update({ category: null })
            .eq('prospect_id', write.prospectId);
          const failure = eraseScoreError ?? eraseCategoryError;
          if (failure) {
            process.stderr.write(
              `score: échec d'effacement sur ${write.prospectId} — ${failure.message}\n`,
            );
            // `pending` ne doit compter que les prospects réellement sortis du
            // classement : si l'un des deux effacements a échoué, la ligne
            // `prospect_score` ou `web_presence.category` peut être restée en
            // place, et compter quand même en `pending` ferait croire à un
            // état propre qui n'a pas été vérifié.
            eraseFailed += 1;
            continue;
          }
          if (write.reason === 'enrichment') pendingEnrichment += 1;
          else pendingProbe += 1;
          continue;
        }

        const row = write.row;

        // L'erreur doit etre verifiee : sans cela une categorie non persistee
        // passe inapercue ET le compteur `scored` s'incremente quand meme,
        // le rapport affirmant un succes qui n'a pas eu lieu.
        // Pas de `probed_at` : `score` n'a rien sondé. L'écrire écraserait
        // l'horodatage réel posé par `probe` — donc le seul moyen de savoir
        // qu'une sonde est périmée — et, à l'insertion, affirmerait une
        // sonde qui n'a jamais eu lieu.
        const presenceWrite: {
          prospect_id: string;
          category: typeof row.category;
          domain_available?: boolean | null;
          domain_candidates?: string[];
          domain_free_name?: string | null;
          domain_checked_at?: string | null;
        } = {
          prospect_id: row.prospectId,
          category: row.category,
        };
        // La catégorie qu'on écrit ici peut rendre caduque la proposition de
        // domaine posée par un run antérieur de `domains`. Un prospect classé
        // `none` en septembre, à qui l'on avait trouvé un domaine libre, puis
        // reclassé `has_site` parce qu'une sonde a fini par joindre son site,
        // gardait sinon les deux affirmations côte à côte sur la même ligne —
        // et c'est la proposition de domaine, pas la catégorie, qui partait
        // dans le message. On l'efface dans le même mouvement que l'écriture
        // qui la rend fausse, plutôt que d'espérer un passage de nettoyage.
        if (!domainProposalApplies(row.category)) {
          presenceWrite.domain_available = null;
          presenceWrite.domain_candidates = [];
          // Le NOM part avec le verdict. C'est lui que `pitch` citerait — « j'ai
          // vérifié, plomberie-allard.fr est libre » — et le laisser derrière un
          // `domain_available` remis à null rendrait l'affirmation atteignable
          // par une autre lecture que celle du booléen.
          presenceWrite.domain_free_name = null;
          // L'horodatage part avec le verdict : le laisser ferait passer pour
          // « vérifié récemment » une ligne dont on vient d'effacer le
          // résultat, et `domains` ne la reprendrait pas si le prospect
          // redevenait éligible.
          presenceWrite.domain_checked_at = null;
        }

        // `row.prospectId` vient de `fetchScorePage`, filtree.
        const { error: presenceError } = await client
          .from('web_presence')
          .upsert(presenceWrite, { onConflict: 'prospect_id' });
        if (presenceError) {
          presenceFailed += 1;
          process.stderr.write(
            `score: echec d'ecriture de la categorie sur ${row.prospectId} — ${presenceError.message}\n`,
          );
          continue;
        }

        // Meme provenance que l'ecriture de la categorie juste au-dessus.
        const { error: scoreError } = await client.from('prospect_score').upsert(
          {
            prospect_id: row.prospectId,
            total: row.total,
            breakdown: row.breakdown,
            ruleset_version: row.rulesetVersion,
            computed_at: new Date().toISOString(),
          },
          { onConflict: 'prospect_id' },
        );
        if (scoreError) {
          scoreFailed += 1;
          process.stderr.write(`score: échec sur ${row.prospectId} — ${scoreError.message}\n`);
          continue;
        }
        scored += 1;
      }

      process.stdout.write(
        `score : ${scored} prospects notés, ${pendingEnrichment} en attente d'enrichissement, ` +
          `${pendingProbe} en attente de sonde\n`,
      );
      // N'apparaît que si non nul : une ligne « 0 en échec » à chaque run
      // n'apprend rien et noierait le signal les fois où il compte.
      if (eraseFailed > 0) {
        process.stderr.write(
          `score : ${eraseFailed} effacements en échec, catégorie possiblement périmée\n`,
        );
      }
      if (scoreFailed > 0 || presenceFailed > 0) {
        process.stderr.write(
          `score : ${presenceFailed} catégories et ${scoreFailed} scores non écrits\n`,
        );
      }
      // `score` sortait en 0 quoi qu'il arrive, alors qu'il comptait déjà ses
      // échecs sans jamais s'en servir : une base entière pouvait rester sans
      // score et le run s'annoncer réussi. C'est le même trou que celui bouché
      // ailleurs, resté ouvert ici parce que le compteur existait — la
      // présence d'un compteur ressemble à un traitement.
      return eraseFailed > 0 || scoreFailed > 0 || presenceFailed > 0 ? 1 : 0;
    }
    case 'reconcile': {
      // `--dry-run` exécute le premier temps — décider — et s'arrête avant la
      // moindre écriture. C'est lui qui donne le nombre exact à déclarer
      // ensuite dans `--force-deletions`.
      const dryRun = argv.includes('--dry-run');

      // `--force-deletions` exige le nombre **exact** de suppressions
      // constatées, et ce n'est pas une coquetterie : un plafond confortable se
      // colle une fois dans une tâche planifiée et ne protège plus jamais —
      // `999999` désarmait la protection à jamais, exactement comme
      // l'interrupteur nu qu'il remplaçait. Un nombre exact oblige à avoir
      // regardé, et devient faux dès que la situation change.
      let deletionBudget: number | undefined;
      if (argv.includes('--force-deletions')) {
        const raw = flag(argv, 'force-deletions');
        const parsed = raw === undefined ? Number.NaN : Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          process.stderr.write(
            `--force-deletions attend le nombre de suppressions vérifiées, reçu : ${raw ?? '(rien)'}\n`,
          );
          return 1;
        }
        deletionBudget = parsed;
      }

      const config = loadConfig(process.env);
      const client = createClient(config);

      // Lecture paginée comme partout ailleurs, et sans prédicat de fraîcheur :
      // `reconciled_at` dit quand un prospect a été vérifié, il ne sert pas à
      // en exclure. Ne revérifier qu'une partie de la base laisserait le reste
      // indéfiniment hors contrôle.
      const prospects: ReconcileProspect[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect')
          .select('id, siret')
          .eq('owner_id', proprietaire)
          .order('id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        prospects.push(...(data ?? []).map((row) => ({ id: row.id, siret: row.siret })));
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      const report = await runReconcile({
        prospects,
        fetchStatus: fetchStatusBySiret,
        // Drapeau distinct du `--force` de `probe`, et non un alias : là-bas il
        // veut dire « resonde des URL encore fraîches », ici « supprime des
        // prospects malgré le garde-fou ». Les confondre ferait vider la base à
        // qui voulait seulement resonder.
        forcedDeletionBudget: deletionBudget,
        dryRun,
        remove: async (id) => {
          // Les dépendances partent en cascade : c'est la définition même de
          // « ne pas conserver ».
          // `owner_id` EN PLUS de `id`, sur la seule operation irreversible
          // de cette base. Le proprietaire est sur la ligne : le filtre est
          // donc direct, et il ne coute rien de l'exiger. Un identifiant
          // errant ne peut alors supprimer que le travail de son proprietaire.
          const { error } = await client
            .from('prospect')
            .delete()
            .eq('id', id)
            .eq('owner_id', proprietaire);
          if (error) throw new Error(error.message);
        },
        // Drapeau de cessation et horodatage dans un seul `update` : une
        // écriture par prospect au lieu de deux, et surtout `false` s'écrit
        // aussi. Tant que seul `true` partait, une cessation enregistrée par
        // erreur restait vraie pour toujours, même après correction de la fiche
        // Sirene, et le barème rendait 0 sans recours.
        setClosed: async (id, closed) => {
          // Meme raison que pour la suppression : le proprietaire est sur la
          // ligne, le filtre est direct et gratuit.
          const { error } = await client
            .from('prospect')
            .update({ is_closed: closed, reconciled_at: new Date().toISOString() })
            .eq('id', id)
            .eq('owner_id', proprietaire);
          if (error) throw new Error(error.message);
        },
      });

      if (dryRun) {
        process.stdout.write(
          `reconcile (--dry-run, aucune écriture) : ${report.decided.keep} à conserver, ` +
            `${report.decided.close} à clore, ${report.decided.delete} à supprimer, ` +
            `${report.failedReads} lectures en échec\n`,
        );
        // Le nombre à reporter tel quel : `--force-deletions` exige l'égalité.
        if (report.decided.delete > 0) {
          process.stdout.write(
            `reconcile : pour exécuter ces suppressions, relancer avec ` +
              `--force-deletions ${report.decided.delete}\n`,
          );
        }
        return reconcileExitCode(report, prospects.length);
      }

      // Les suppressions refusées sont mentionnées sur stdout aussi : qui ne
      // lit que cette ligne verrait « 0 supprimés » sans comprendre pourquoi.
      const refus =
        report.refusedDeletions > 0 ? ` (${report.refusedDeletions} refusées par le garde-fou)` : '';
      process.stdout.write(
        `reconcile : ${report.kept} conservés, ${report.closed} cessés, ` +
          `${report.deleted} supprimés${refus}, ${report.failedReads} lectures en échec, ` +
          `${report.failedWrites} écritures en échec\n`,
      );
      if (report.refusedDeletions > 0) {
        process.stderr.write(
          `reconcile : ${report.refusedDeletions} suppressions refusées par le garde-fou.\n`,
        );
      }
      // Sortie non nulle sur deux motifs, et le second est le plus discret : un
      // run qui a renoncé à sa moitié destructrice n'est pas un succès, et un
      // run qui n'a rien pu décider n'a rien vérifié du tout. Une automatisation
      // doit s'en apercevoir sans lire stderr.
      return reconcileExitCode(report, prospects.length);
    }
    case 'domains': {
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;

      const config = loadConfig(process.env);
      const client = createClient(config);
      // Les cessations viennent de `reconcile` et vivent sur `prospect` :
      // les deux lectures ci-dessous portent sur d'autres tables, on ecarte
      // donc en memoire plutot que par une jointure fragile.
      const closed = await fetchClosedIds(client, proprietaire);


      // Seuls les prospects sans domaine propre : proposer un nom à qui en a
      // déjà un n'a aucun sens.
      //
      // Et on rejoue les vérifications périmées, pas seulement les absentes.
      // Le filtre `domain_checked_at is null` seul ne revenait jamais sur une
      // ligne déjà vue : un « ce domaine est libre » constaté une fois valait
      // ensuite pour toujours, alors que le registre, lui, continue de vivre.
      const staleCutoff = domainStaleCutoff(new Date());

      const rows: {
        prospect_id: string;
        denomination: string;
        denominationUsuelle: string | null;
        trade_slug: string;
      }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('web_presence')
          .select('prospect_id, prospect!inner(denomination, denomination_usuelle, trade_slug)')
          // `prospect!inner(...)` et non `prospect(...)` : sans `!inner`, les
          // lignes de tous les clients remontent avec `prospect: null`, la
          // boucle les ecarte en silence, et le run annonce « 0 verifies »
          // comme s'il n'y avait rien a faire.
          .eq('prospect.owner_id', proprietaire)
          .in('category', [...DOMAIN_PROPOSAL_CATEGORIES])
          .or(`domain_checked_at.is.null,domain_checked_at.lt.${staleCutoff}`)
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          const p = (Array.isArray(row.prospect) ? row.prospect[0] : row.prospect) as
            | Record<string, unknown>
            | null;
          if (p === null) continue;
          rows.push({
            prospect_id: row.prospect_id,
            denomination: p.denomination as string,
            denominationUsuelle: (p.denomination_usuelle as string | null) ?? null,
            trade_slug: p.trade_slug as string,
          });
        }
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      const deps = {
        resolve: (name: string): Promise<string[]> => resolveNs(name),
        rdap: (name: string): Promise<number> => rdapStatus(name),
      };

      let checked = 0;
      let undecided = 0;
      let domainFailed = 0;
      // `--limit` borne ce que la commande traite reellement, et pas seulement
      // ce qu elle annonce : le valider sans l appliquer serait pire que
      // l ignorer.
      for (const row of rows.slice(0, limit)) {
        if (closed.has(row.prospect_id)) continue;
        const trade = getTrade(row.trade_slug);
        if (trade === undefined) continue;
        const candidates = domainCandidates(row.denomination, row.denominationUsuelle, trade);

        // On cherche un candidat libre, pas le verdict du dernier essayé.
        // `false` ne se dit que si TOUS ont été tranchés et pris ; il suffit
        // d'un seul « je ne sais pas » pour que le champ reste `null`.
        let available: boolean | null = candidates.length === 0 ? null : false;
        // Le NOM du premier candidat libre, et pas seulement le fait qu'il en
        // existe un. Le booléen seul ne permet d'écrire qu'« un domaine est
        // libre », ce qu'aucun artisan ne peut vérifier ; le plan veut « j'ai
        // vérifié, serrurier-untel.fr est libre », et c'est le nom qui porte
        // l'argument.
        let libre: string | null = null;
        for (const name of candidates) {
          const verdict = await checkDomainAvailability(name, deps);
          if (verdict === true) {
            available = true;
            libre = name;
            break;
          }
          if (verdict === null) available = null;
        }

        // L'horodatage n'est posé que si l'on a réellement appris quelque
        // chose. Le poser sur un verdict `null` — une panne du registre, une
        // expiration — affirmerait « vérifié » alors qu'on ne sait rien, et le
        // filtre `domain_checked_at is null` ne rejouerait plus jamais ces
        // prospects : une indisponibilité passagère les condamnerait
        // définitivement. C'est la leçon de `probed_at`, qui a déjà coûté une
        // migration au socle.
        const write: {
          prospect_id: string;
          domain_candidates: string[];
          domain_available?: boolean;
          domain_free_name?: string | null;
          domain_checked_at?: string;
        } = { prospect_id: row.prospect_id, domain_candidates: candidates };
        if (available !== null) {
          write.domain_available = available;
          // Explicitement remis à null quand plus rien n'est libre : un nom
          // laissé d'un run précédent survivrait au dépôt du domaine par
          // quelqu'un d'autre, et c'est exactement le fait périssable que
          // `DOMAIN_FRESHNESS_DAYS` existe pour borner.
          write.domain_free_name = libre;
          write.domain_checked_at = new Date().toISOString();
        }

        // `row.prospect_id` vient de la lecture filtree ci-dessus.
        const { error } = await client
          .from('web_presence')
          .upsert(write, { onConflict: 'prospect_id' });
        if (error) {
          domainFailed += 1;
          process.stderr.write(`domains: échec sur ${row.prospect_id} — ${error.message}\n`);
          continue;
        }
        if (available === null) undecided += 1;
        else checked += 1;
      }

      process.stdout.write(
        `domains : ${checked} prospects vérifiés` +
          (undecided > 0 ? `, ${undecided} indécis (registre indisponible), à rejouer` : '') +
          (domainFailed > 0 ? `, ${domainFailed} en échec d'écriture\n` : '\n'),
      );
      // Une écriture perdue casse le point de reprise du run : sortir en 0
      // ferait passer « rien n'a été écrit » pour un succès.
      return domainFailed > 0 ? 1 : 0;
    }
    case 'generate': {
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;
      const force = argv.includes('--force');
      const tradeSlug = flag(argv, 'trade');

      const genConfig = loadGenerateConfig(process.env);
      const client = createClient(loadConfig(process.env));

      const candidats = await fetchSiteCandidates(client, proprietaire, tradeSlug);
      const dejaFait = await fetchSiteRows(client, proprietaire);

      // Un contenu déjà écrit n'est pas régénéré : c'est le seul étage qui
      // dépense de l'argent, et un rejeu distrait coûterait vingt-deux appels.
      //
      // Une rédaction REJETÉE à la relecture fait exception, et c'est ce qui
      // rend le bouton du dashboard utile : le refus remet le prospect dans la
      // file sans qu'il faille se souvenir de passer `--force`, lequel
      // régénérerait aussi les vingt et un contenus que personne n'a contestés.
      const aFaire = candidats.filter((c) => {
        const ligne = dejaFait[c.id];
        return force || ligne?.content == null || ligne.content_rejected_at !== null;
      });
      const lot = limit === undefined ? aFaire : aFaire.slice(0, limit);

      if (lot.length === 0) {
        process.stdout.write(
          `generate : rien à faire (${candidats.length} prospects éligibles, tous déjà générés)\n`,
        );
        return 0;
      }

      // Un rédacteur par métier : les consignes en dépendent, et c'est sur
      // elles que porte la mise en cache du préfixe.
      const parMetier = new Map<string, GenerateInput[]>();
      for (const c of lot) {
        const liste = parMetier.get(c.faits.metier.slug) ?? [];
        liste.push({ prospectId: c.id, faits: c.faits, trade: getTrade(c.faits.metier.slug)! });
        parMetier.set(c.faits.metier.slug, liste);
      }

      let genere = 0;
      let rejete = 0;
      let echoue = 0;
      const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };

      for (const [slug, entrees] of parMetier) {
        const trade = getTrade(slug)!;
        const resultat = await runGenerate(
          entrees,
          createRedacteur({
            apiKey: genConfig.anthropicApiKey,
            workspaceId: genConfig.anthropicWorkspaceId,
            trade,
          }),
        );
        genere += resultat.report.generated;
        rejete += resultat.report.rejected;
        echoue += resultat.report.failed;
        usage.input += resultat.report.usage.input;
        usage.cacheWrite += resultat.report.usage.cacheWrite;
        usage.cacheRead += resultat.report.usage.cacheRead;
        usage.output += resultat.report.usage.output;

        for (const { prospectId, contenu } of resultat.contenus) {
          // `prospectId` vient de `fetchSiteCandidates`, filtree.
          const { error } = await client.from('prospect_site').upsert({
            prospect_id: prospectId,
            // La colonne est `jsonb`. Le contenu a déjà été validé contre son
            // schéma par `runGenerate` ; la conversion ne masque donc aucun
            // contrôle, elle traverse seulement une frontière de typage.
            content: contenu as unknown as Json,
            prompt_version: contenu.version.promptVersion,
            model: contenu.version.model,
            generated_at: new Date().toISOString(),
            // Le refus portait sur le texte qu'on vient de remplacer. Le
            // laisser en place bloquerait `publish` sur une rédaction neuve
            // que personne n'a lue, et remettrait le prospect dans la file de
            // `generate` à chaque run — une boucle qui coûte un appel par tour.
            content_rejected_at: null,
            updated_at: new Date().toISOString(),
          });
          if (error) {
            echoue += 1;
            genere -= 1;
            process.stderr.write(`generate: échec d'écriture sur ${prospectId} — ${error.message}\n`);
          }
        }
      }

      // Le §4 du plan veut que ce qui coûte soit compté ET affiché. Les trois
      // formes d'entrée sont séparées parce qu'elles sont facturées à trois
      // tarifs différents ; les additionner masquerait ce que le cache
      // économise réellement.
      process.stdout.write(
        `generate : ${genere} contenus écrits, ${rejete} rejetés, ${echoue} en échec\n` +
          `  jetons : ${usage.input} entrée, ${usage.cacheWrite} écriture de cache, ` +
          `${usage.cacheRead} lecture de cache, ${usage.output} sortie\n`,
      );
      return echoue > 0 || rejete > 0 ? 1 : 0;
    }

    case 'pitch': {
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;
      const force = argv.includes('--force');

      const pitchConfig = loadPitchConfig(process.env);
      const client = createClient(loadConfig(process.env));

      const candidats = await fetchPitchCandidates(client, proprietaire);
      const dejaRediges = await fetchProspectsDejaRediges(client, proprietaire);

      // Un prospect déjà rédigé n'est pas repris : c'est un étage payant, et un
      // rejeu distrait coûterait autant que le premier passage.
      const aFaire = candidats.filter((c) => force || !dejaRediges.has(c.id));
      const lot = limit === undefined ? aFaire : aFaire.slice(0, limit);

      if (lot.length === 0) {
        process.stdout.write(
          `pitch : rien a faire (${candidats.length} prospects joignables, tous deja rediges)\n`,
        );
        return 0;
      }

      // Un seul rédacteur pour tout le lot, et c'est la différence avec
      // `generate` : les consignes du message ne dépendent d'aucun métier, donc
      // une seule écriture de cache couvre l'ensemble.
      const entrees: PitchInput[] = lot.map((c) => ({ prospectId: c.id, faits: c.faits }));
      const resultat = await runPitch(
        entrees,
        createPitchRedacteur({
          apiKey: pitchConfig.anthropicApiKey,
          workspaceId: pitchConfig.anthropicWorkspaceId,
        }),
      );

      let ecrits = 0;
      let echoue = resultat.report.failed;
      for (const m of resultat.messages) {
        // `m.prospectId` vient de `fetchPitchCandidates`, filtree.
        const { error } = await client.from('generated_message').insert({
          prospect_id: m.prospectId,
          channel: m.canal,
          subject: m.objet,
          content: m.contenu,
          model: PITCH_TRACE.model,
          prompt_version: PITCH_TRACE.promptVersion,
        });
        if (error) {
          echoue += 1;
          process.stderr.write(`pitch: echec d'ecriture sur ${m.prospectId} — ${error.message}\n`);
          continue;
        }
        ecrits += 1;
      }

      const u = resultat.report.usage;
      process.stdout.write(
        `pitch : ${resultat.report.generated} prospects rediges (${ecrits} messages ecrits), ` +
          `${resultat.report.rejected} rejetes, ${echoue} en echec` +
          (resultat.report.refusedEditeur > 0
            ? `, ${resultat.report.refusedEditeur} refuses faute d'editeur renseigne`
            : '') +
          `\n  jetons : ${u.input} entree, ${u.cacheWrite} ecriture de cache, ` +
          `${u.cacheRead} lecture de cache, ${u.output} sortie\n`,
      );

      // Le décompte des segments est une MESURE, pas un verdict : le schéma a
      // déjà borné le SMS en caractères. Elle est affichée parce que le plafond
      // de 306 ne vaut que dans l'alphabet GSM — une seule apostrophe
      // typographique fait basculer le message en UCS-2, où le même texte tient
      // en cinq segments au lieu de deux. Celui qui copie le message doit
      // pouvoir le voir.
      for (const m of resultat.messages.filter((x) => x.canal === 'sms')) {
        const mesure = segmentsSms(m.contenu);
        process.stdout.write(
          `  SMS ${m.prospectId} : ${mesure.caracteres} caracteres, ${mesure.alphabet}, ` +
            `${mesure.segments} segment(s)` +
            (mesure.horsGsm7.length > 0 ? ` — hors GSM : ${mesure.horsGsm7.join(' ')}` : '') +
            '\n',
        );
      }

      return echoue > 0 || resultat.report.rejected > 0 || resultat.report.refusedEditeur > 0
        ? 1
        : 0;
    }

    case 'publish': {
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;

      const pubConfig = loadPublishConfig(process.env);
      const client = createClient(loadConfig(process.env));
      const rows = await fetchSiteRows(client, proprietaire);
      // Le gabarit actif en base prime sur PROSPEO_GITHUB_TEMPLATE_REPO — le
      // métier, lui, continue de primer sur les deux (templateRepoFor,
      // inchangé, tranche entre ce repli et trade.templateRepo plus bas dans
      // runPublish). Voir apps/collector/src/site-template.ts.
      const gabaritActif = await lireGabaritActif(client);

      // On ne publie que ce qui a été généré. L'ordre des étages est une
      // dépendance de données, pas une convention.
      const entrees: PublishInput[] = [];
      for (const [prospectId, row] of Object.entries(rows)) {
        if (row.content === null || row.content === undefined) continue;
        if (row.unpublished_at !== null) continue;
        entrees.push({
          prospectId,
          contenu: row.content as unknown as ContenuPublie,
          // Transmis plutôt que filtré ici : `runPublish` porte la décision et
          // la COMPTE. Écarter la ligne en silence à la lecture ferait
          // disparaître le prospect du rapport, et un contenu refusé qu'on ne
          // republie pas doit se voir — c'est du travail qui attend quelqu'un.
          rejeteeLe:
            row.content_rejected_at === null ? null : new Date(row.content_rejected_at),
        });
      }
      const lot = limit === undefined ? entrees : entrees.slice(0, limit);

      const deps = construireDepsPublication(client, {
        github: createGithubClient({ token: pubConfig.githubToken, org: pubConfig.githubOrg }),
        templateRepoDefaut: gabaritDefautPourPublication(
          gabaritActif,
          pubConfig.githubTemplateRepo,
        ),
        rows,
      });

      const report = await runPublish(lot, deps);
      process.stdout.write(
        `publish : ${report.created} dépôts créés, ${report.updated} mis à jour, ` +
          `${report.skipped} inchangés, ${report.refused} refusés, ${report.failed} en échec\n`,
      );
      return publishExitCode(report);
    }

    case 'deploy': {
      const limit = parseLimit(argv);
      if (limit === 'invalide') return 1;

      const depConfig = loadDeployConfig(process.env);
      const client = createClient(loadConfig(process.env));
      const vercel = createVercelClient({
        token: depConfig.vercelToken,
        teamId: depConfig.vercelTeamId,
      });

      const rows = await fetchSiteRows(client, proprietaire);
      const aDeployer = Object.entries(rows).filter(
        ([, r]) => r.repo_full_name !== null && r.unpublished_at === null && r.deployment_url === null,
      );
      const lot = limit === undefined ? aDeployer : aDeployer.slice(0, limit);

      if (lot.length === 0) {
        process.stdout.write('deploy : rien à faire, tous les sites publiés ont une URL\n');
        return 0;
      }

      const sites: DeploySite[] = lot.map(([prospectId, row]) => ({
        prospectId,
        repoFullName: row.repo_full_name as string,
        vercelProjectId: row.vercel_project_id,
      }));

      const deps = construireDepsDeploiement(client, {
        vercel,
        attendreUrl: (projectId) => attendreUrl(vercel, projectId),
      });

      const report = await runDeploy(sites, deps);
      process.stdout.write(
        `deploy : ${report.deployed} sites en ligne, ${report.pending} en construction, ` +
          `${report.failed} en échec\n`,
      );
      return deployExitCode(report);
    }

    case 'unpublish': {
      const dryRun = argv.includes('--dry-run');
      const depConfig = loadDeployConfig(process.env);
      const client = createClient(loadConfig(process.env));
      const vercel = createVercelClient({
        token: depConfig.vercelToken,
        teamId: depConfig.vercelTeamId,
      });

      const deps: UnpublishDeps = {
        async lireSitesEnLigne() {
          const sites: SiteEnLigne[] = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await client
              .from('prospect_site')
              .select(
                'prospect_id, vercel_project_id, repo_full_name, published_at, unpublished_at, prospect!inner(prospect_pipeline(status))',
              )
              // `!inner` : `unpublish` SUPPRIME des projets Vercel. Sans lui,
              // les sites de tous les clients remonteraient, et le retrait
              // d'un site publie au nom d'une entreprise reelle se
              // declencherait sur la decision d'un tiers.
              .eq('prospect.owner_id', proprietaire)
              .not('repo_full_name', 'is', null)
              .order('prospect_id')
              .range(from, from + PAGE_SIZE - 1);
            if (error) throw new Error(error.message);
            for (const r of data ?? []) {
              const p = (Array.isArray(r.prospect) ? r.prospect[0] : r.prospect) as
                | { prospect_pipeline: unknown }
                | null;
              const pipe = p === null ? null : (Array.isArray(p.prospect_pipeline)
                ? p.prospect_pipeline[0]
                : p.prospect_pipeline) as { status: string } | null;
              sites.push({
                prospectId: r.prospect_id,
                vercelProjectId: r.vercel_project_id,
                repoFullName: r.repo_full_name ?? '',
                // Sans ligne de suivi, le prospect n'a jamais été contacté :
                // `a_contacter` est l'état par défaut de `prospect_pipeline`.
                pipelineStatus: pipe?.status ?? 'a_contacter',
                publishedAt: r.published_at === null ? null : new Date(r.published_at),
                unpublishedAt: r.unpublished_at === null ? null : new Date(r.unpublished_at),
              });
            }
            if ((data ?? []).length < PAGE_SIZE) break;
          }
          return sites;
        },
        async lireProjetsEnregistres() {
          const connus = new Set<string>();
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await client
              .from('prospect_site')
              .select('vercel_project_id, prospect!inner()')
              // Filtre aussi, et c'est SANS DANGER ici : cet ensemble est une
              // liste d'AUTORISATION — `projetSupprimable` n'accepte que ce
              // qui y figure. Le restreindre ne peut donc que refuser une
              // suppression, jamais en permettre une de plus. Comme
              // `lireSitesEnLigne` porte le meme filtre, tout projet a retirer
              // y figure encore.
              .eq('prospect.owner_id', proprietaire)
              .not('vercel_project_id', 'is', null)
              .order('prospect_id')
              .range(from, from + PAGE_SIZE - 1);
            if (error) throw new Error(error.message);
            for (const r of data ?? []) {
              if (r.vercel_project_id !== null) connus.add(r.vercel_project_id);
            }
            if ((data ?? []).length < PAGE_SIZE) break;
          }
          return connus;
        },
        async supprimerProjet(id) {
          await vercel.supprimerProjet(id);
        },
        async marquerDepublie(prospectId) {
          // `prospectId` vient de `lireSitesEnLigne`, filtree ci-dessus.
          const { error } = await client
            .from('prospect_site')
            .update({ unpublished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('prospect_id', prospectId);
          if (error) throw new Error(error.message);
        },
        maintenant: () => new Date(),
        // Le vrai puits, jamais `NULL_SINK` : celui-là est réservé aux tests
        // d'étage. Sans cette ligne, l'étape `retrait` resterait ce qu'elle
        // était — une étape que rien n'émet.
        events: createEventSink(client),
      };

      const report = await runUnpublish(deps, { dryRun });
      process.stdout.write(
        (dryRun ? 'unpublish (simulation) : ' : 'unpublish : ') +
          `${report.decided.refus} refus, ${report.decided.peremption} périmés, ` +
          `${report.decided.garder} conservés` +
          (dryRun
            ? '\n  Rien n\'a été écrit. Relancer sans --dry-run pour exécuter.\n'
            : ` — ${report.unpublished} dépubliés, ${report.refusedGuard} refusés par le garde-fou, ` +
              `${report.failed} en échec\n`),
      );
      return dryRun ? 0 : unpublishExitCode(report);
    }

    case 'worker': {
      const config = loadConfig(process.env);
      const client = createClient(config);

      // 10 s : assez court pour qu'un worker mort se voie vite à l'écran (qui
      // le déclare arrêté au-delà de 60 s), assez long pour ne pas écrire en
      // base en permanence.
      const PERIODE_BATTEMENT_MS = 10_000;
      // Le filet sous Realtime. Un worker qui ne dépend que d'un socket est
      // un worker qui s'endort sans le dire : une déconnexion silencieuse
      // laisserait la file grossir sans que rien n'en sorte.
      const PERIODE_BALAYAGE_MS = 30_000;

      let enCours = 0;
      let arret = false;

      const battre = async (): Promise<void> => {
        // `upsert`, et non `update` : contrairement à l'ancien singleton, cette
        // table n'a PAS de ligne d'amorçage (Tâche 1) — le tout premier battement
        // d'un utilisateur doit INSÉRER sa ligne, les suivants la mettent à jour.
        // `owner_id` est la clé primaire : la cible de conflit est implicite.
        const { error } = await client
          .from('worker_heartbeat_utilisateur')
          .upsert({ owner_id: proprietaire, beat_at: new Date().toISOString(), in_flight: enCours });
        // Journalisé, jamais fatal : perdre un battement est un désagrément,
        // interrompre un déploiement en cours en est un autre. Même doctrine
        // que `createEventSink`.
        if (error) process.stderr.write(`worker : battement échoué — ${error.message}\n`);
      };

      const fileDeps: FileDeps = {
        async listerEnAttente() {
          const { data, error } = await client
            .from('campaign_job')
            .select('id,prospect_id,campaign_id,attempts')
            // LA porte d'entree du worker, et la seule de tout le collector
            // ou un `prospect_id` arrive d'ailleurs que d'une lecture deja
            // filtree : c'est le dashboard qui remplit cette file. Sur
            // `campaign_job` le proprietaire s'appelle `requested_by`, et il
            // est sur la ligne. Un worker par utilisateur (D8) : il ne draine
            // que la file de celui qu'il sert.
            .eq('requested_by', proprietaire)
            .eq('state', 'en_attente')
            .order('requested_at', { ascending: true })
            .limit(20);
          if (error) throw new Error(error.message);
          return data ?? [];
        },
        async prendre(id) {
          // Conditionnée à l'état : c'est CETTE clause qui fait perdre la
          // course proprement quand un autre worker est passé entre la
          // lecture et l'écriture.
          const { data, error } = await client
            .from('campaign_job')
            .update({ state: 'en_cours', started_at: new Date().toISOString() })
            .eq('id', id)
            .eq('requested_by', proprietaire)
            .eq('state', 'en_attente')
            .select('id');
          if (error) throw new Error(error.message);
          return (data ?? []).length === 1;
        },
      };

      /** Clore un job. Local au worker : la prise n'en a pas besoin. */
      const clore = async (
        id: number,
        issue: 'termine' | 'echoue',
        erreur: string | null,
        cout: number | null,
      ): Promise<void> => {
        const { error } = await client
          .from('campaign_job')
          .update({
            state: issue,
            last_error: erreur,
            cost_eur: cout,
            finished_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('requested_by', proprietaire);
        // Journalisé et non relancé : une exception ici sortirait de
        // `traiterUn` par le `finally`, et la boucle s'arrêterait sur un
        // problème d'écriture alors que le déploiement, lui, a réussi.
        if (error) process.stderr.write(`worker : clôture échouée — ${error.message}\n`);
      };

      const deps = chaineDeps(client, proprietaire);

      const traiterUn = async (): Promise<boolean> => {
        // `prendreProchain` lit puis écrit sur Supabase, et `fileDeps` fait un
        // `throw new Error(...)` sur toute erreur réseau — un blip pendant un
        // balayage suffit. Cette lecture n'a AUCUN job « en_cours » en main :
        // la laisser rejeter hors de tout `try` ferait remonter la rejection
        // jusqu'à `drainer`, puis jusqu'aux deux appels fire-and-forget plus
        // bas ; depuis Node 15, une rejection non gérée termine le processus,
        // et un job qu'un tour précédent a laissé `en_cours` resterait bloqué
        // à jamais derrière l'index unique partiel `campaign_job_actif_unique`
        // — plus aucune nouvelle demande sur ce prospect, sans intervention
        // manuelle en base. On distingue donc « la file n'a pas pu être lue »
        // (un incident, à journaliser — le balayage suivant réessaiera) de
        // « la file est vide » (l'état normal, qui ne mérite aucun bruit) :
        // les replier sur le même `return false` silencieux masquerait
        // l'incident.
        let job: Awaited<ReturnType<typeof prendreProchain>>;
        try {
          job = await prendreProchain(fileDeps);
        } catch (cause) {
          process.stderr.write(
            `worker : lecture de la file échouée — ${cause instanceof Error ? cause.message : String(cause)}\n`,
          );
          return false;
        }
        if (job === null) return false;

        enCours += 1;
        await battre();
        try {
          const resultat = await traiterProspect(job.prospectId, deps);
          await clore(
            job.id,
            resultat.echec === null ? 'termine' : 'echoue',
            resultat.echec === null ? null : `${resultat.echec.etape} : ${resultat.echec.message}`,
            resultat.coutEur,
          );
        } catch (cause) {
          // Un échec HORS chaîne (lecture, réseau, RLS) : le job doit être
          // clos malgré tout, faute de quoi il resterait « en cours » pour
          // toujours et l'index unique bloquerait toute nouvelle demande sur
          // ce prospect.
          await clore(
            job.id,
            'echoue',
            cause instanceof Error ? cause.message : String(cause),
            null,
          );
        } finally {
          enCours -= 1;
          await battre();
        }
        return true;
      };

      /**
       * Vide la file, un job à la fois — et **un seul drainage à la fois.**
       *
       * `unSeulALaFois` borne le parallélisme que `prendre` ne borne pas : la
       * prise conditionnée à l'état empêche deux workers de traiter le MÊME
       * job, elle n'empêche pas N boucles d'en traiter N différents de front.
       * Or `drainer` est rappelé sur chaque événement Realtime et toutes les
       * 30 s : sans garde, la concurrence grimpait d'une unité toutes les 30 s
       * sur une file longue, et chaque boucle consomme des quotas GitHub,
       * Vercel et Anthropic — la vraie limite de cette chaîne, et la raison du
       * « concurrence bornée à 1 par défaut » du §6 du spec.
       *
       * **Ne doit JAMAIS rejeter.** `drainer` est appelé en fire-and-forget
       * depuis le callback Realtime et depuis le balayage périodique : une
       * rejection non rattrapée ici tuerait le worker en pleine gestion d'un
       * job, qui resterait `en_cours` pour toujours derrière l'index unique
       * partiel — exactement le scénario que ce `try/catch` existe pour
       * empêcher. `traiterUn` protège déjà sa propre lecture de la file, mais
       * ce filet-ci reste en place : c'est lui, et non une relecture de
       * `traiterUn`, qui garantit que « le balayage rattrape Realtime » reste
       * vrai même si `traiterUn` change un jour.
       */
      const drainer = unSeulALaFois(async (): Promise<void> => {
        try {
          while (!arret && (await traiterUn())) {
            // Rien : la condition fait le travail.
          }
        } catch (cause) {
          process.stderr.write(
            `worker : balayage interrompu par une erreur inattendue — ${cause instanceof Error ? cause.message : String(cause)}\n`,
          );
        }
      });

      /**
       * Lance `drainer` en tâche de fond, sans jamais laisser filer une
       * rejection.
       *
       * Garde redondante avec le `try/catch` interne de `drainer` ci-dessus,
       * et volontairement : un simple `void drainer()` suffit tant que
       * `drainer` ne rejette pas, mais cesse de protéger le worker dès que ce
       * invariant se rompt — par exemple si une future modification de
       * `drainer` ajoute du code après la boucle, hors du `try`. Un job laissé
       * `en_cours` par un worker mort ne se rattrape qu'à la main, en base.
       */
      const lancerDrainage = (): void => {
        void drainer().catch((cause: unknown) => {
          process.stderr.write(
            `worker : drainer a rejeté de façon inattendue — ${cause instanceof Error ? cause.message : String(cause)}\n`,
          );
        });
      };

      // Realtime réveille ; le balayage rattrape ce qu'une déconnexion aurait
      // laissé passer. Les deux, et non l'un ou l'autre.
      const canal = client
        .channel('campagne-file')
        .on(
          'postgres_changes',
          // Volontairement NON filtre sur `requested_by`. Un reveil de trop
          // ne coute qu'une lecture, elle-meme filtree — `listerEnAttente` ne
          // rend que les jobs de ce proprietaire, et un job etranger ne sera
          // donc jamais pris. Un filtre Realtime mal ecrit, lui, echoue sans
          // bruit : le worker ne serait plus reveille que par le balayage des
          // 30 s, et personne ne le verrait.
          { event: 'INSERT', schema: 'public', table: 'campaign_job' },
          () => lancerDrainage(),
        )
        .subscribe();

      const battement = setInterval(() => void battre(), PERIODE_BATTEMENT_MS);
      const balayage = setInterval(() => lancerDrainage(), PERIODE_BALAYAGE_MS);

      // Arrêt propre : on cesse de prendre, on laisse finir ce qui est en
      // cours. Un job abandonné en « en cours » bloquerait le prospect
      // jusqu'à une intervention manuelle, à cause de l'index unique partiel.
      const fermer = async (): Promise<void> => {
        arret = true;
        clearInterval(battement);
        clearInterval(balayage);
        await canal.unsubscribe();
        process.stdout.write('worker : arrêt demandé, plus aucune prise\n');
      };
      process.on('SIGINT', () => void fermer());
      process.on('SIGTERM', () => void fermer());

      process.stdout.write('worker : à l’écoute de campaign_job\n');
      await battre();
      await drainer();

      // La commande ne rend la main que sur signal : `worker` est un
      // processus résident, pas un run borné comme les autres commandes.
      await new Promise<void>((resoudre) => {
        const attendre = setInterval(() => {
          if (arret && enCours === 0) {
            clearInterval(attendre);
            resoudre();
          }
        }, 500);
      });
      return 0;
    }

    default:
      process.stderr.write(`Commande non encore implémentée : ${command}\n`);
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    // `exitCode` et non `process.exit()` : Node termine alors après avoir vidé
    // ses tampons de sortie. Un exit immédiat peut tronquer stdout/stderr quand
    // la sortie part dans un tube, cas courant sous Windows.
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
