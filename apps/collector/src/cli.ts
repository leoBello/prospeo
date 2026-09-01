import { resolveNs } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { domainCandidates, getTrade, MATCHING_CONFIG, nafMatchesTrade } from '@prospeo/core';
import { loadConfig } from './config.js';
import { createClient } from './supabase.js';
import { createGoogleMapsSource } from './sources/google-maps.js';
import { fetchStatusBySiret } from './sources/recherche-entreprises.js';
import { planScoreWrite, type ScoreRowInput } from './stages/classify-score.js';
import { makeUpsertProspect, runDiscover } from './stages/discover.js';
import { checkDomainAvailability, rdapStatus } from './stages/domains.js';
import { runEnrich, type EnrichProspect, type ReviewCandidate } from './stages/enrich.js';
import { probeUrl, shouldProbe } from './stages/probe.js';
import { reconcileExitCode, runReconcile, type ReconcileProspect } from './stages/reconcile.js';
import { applyReviewDecision, type ReviewDecision } from './stages/review.js';

// `.env` vit a la racine du depot. Ni tsx ni Node ne le chargent tout seuls :
// sans cette ligne, la procedure documentee (« copier .env.example en .env »)
// echoue sur une erreur de configuration incomprehensible, et le collector ne
// marche que pour qui a exporte les variables dans son shell.
const ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const USAGE = `
prospeo <commande> [options]

Commandes
  discover --trade <slug> --postal-code <cp>   Ingère les établissements Sirene
  enrich --trade <slug>                        Apparie les fiches Google Maps
  review                                       Tranche les appariements douteux
  probe                                        Sonde les URL déclarées
  score                                        Classe et note les prospects
  reconcile                                    Revérifie l'état Sirene des prospects
  domains                                      Cherche un nom de domaine libre

Options
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

Supprimer des prospects, en deux temps
  1. prospeo reconcile --dry-run
     Ne touche à rien et affiche « n à supprimer ». Vérifier que ce nombre a
     un sens : une API en panne rend « absent » toute la base.
  2. prospeo reconcile --force-deletions <ce nombre exact>
     Rejoue le run et exécute les suppressions. Si le nombre a bougé entre
     les deux passes, la dérogation ne vaut plus et rien n'est supprimé.
`;

/** Taille de page des lectures Supabase (PostgREST plafonne a max_rows = 1000). */
const PAGE_SIZE = 500;

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
function fetchScorePage(client: ReturnType<typeof createClient>, from: number) {
  return client
    .from('prospect')
    .select(
      'id, denomination, date_creation, effectif_code, is_closed, prospect_enrichment(status, declared_url, social_urls, phone_e164, rating, review_count), web_presence(category, probed_url, http_status, is_https, final_url, is_parked, has_viewport_meta, last_social_post_at)',
    )
    .order('id')
    .range(from, from + PAGE_SIZE - 1);
}

/** Commandes reconnues. Les étages sont branchés par les tâches 9 à 11. */
const COMMANDS = ['discover', 'enrich', 'review', 'probe', 'score', 'reconcile', 'domains'] as const;

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
async function fetchClosedIds(client: ReturnType<typeof createClient>): Promise<Set<string>> {
  const closed = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('prospect')
      .select('id')
      .eq('is_closed', true)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) closed.add(row.id);
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return closed;
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
        upsertProspect: makeUpsertProspect(client),
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
          .select('prospect_id, status')
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
        .select('prospect_id', { count: 'exact', head: true })
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
            'prospect_id, candidates, enriched_at, prospect(denomination, denomination_usuelle, address, naf_code, trade_slug)',
          )
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
              process.stdout.write(
                `\n  [${index + 1}] ${c.name}  (confiance ${c.confidence.toFixed(2)})\n`,
              );
              for (const line of c.lines ?? []) process.stdout.write(`      ${line.label}\n`);
              if (c.phone !== null) process.stdout.write(`      tél. ${c.phone}\n`);
              if (c.website !== null) process.stdout.write(`      ${c.website}\n`);
              if (c.rating !== null) process.stdout.write(`      note ${c.rating}\n`);
            });

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
            const { error: writeError } = await client
              .from('prospect_enrichment')
              .upsert(updated, { onConflict: 'prospect_id' });
            if (writeError) throw new Error(writeError.message);
            settled += 1;
          } catch (failure) {
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

      process.stdout.write(`\nreview : ${settled} cas tranchés\n`);
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
      const closed = await fetchClosedIds(client);

      // PostgREST plafonne les reponses (max_rows = 1000). Sans pagination, un
      // run au-dela de ce seuil traiterait une tranche arbitraire et afficherait
      // un compte-rendu de succes complet : la troncature serait invisible.
      // L'ordre explicite rend les pages deterministes.
      const rows: { prospect_id: string; declared_url: string | null }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('prospect_enrichment')
          .select('prospect_id, declared_url')
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
          .select('prospect_id, probed_at')
          .order('prospect_id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) probedAt.set(row.prospect_id, row.probed_at);
        if ((data ?? []).length < PAGE_SIZE) break;
      }

      let done = 0;
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
          process.stderr.write(
            `probe: échec sur ${row.prospect_id} — ${error instanceof Error ? error.message : String(error)}\n`,
          );
        }
      }
      process.stdout.write(`probe : ${done} URL sondées, ${skipped} encore fraîches\n`);
      return 0;
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
        const page = await fetchScorePage(client, from);
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
        const { error: presenceError } = await client
          .from('web_presence')
          .upsert(
            // Pas de `probed_at` : `score` n'a rien sondé. L'écrire écraserait
            // l'horodatage réel posé par `probe` — donc le seul moyen de savoir
            // qu'une sonde est périmée — et, à l'insertion, affirmerait une
            // sonde qui n'a jamais eu lieu.
            { prospect_id: row.prospectId, category: row.category },
            { onConflict: 'prospect_id' },
          );
        if (presenceError) {
          process.stderr.write(
            `score: echec d'ecriture de la categorie sur ${row.prospectId} — ${presenceError.message}\n`,
          );
          continue;
        }

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
      return 0;
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
          const { error } = await client.from('prospect').delete().eq('id', id);
          if (error) throw new Error(error.message);
        },
        // Drapeau de cessation et horodatage dans un seul `update` : une
        // écriture par prospect au lieu de deux, et surtout `false` s'écrit
        // aussi. Tant que seul `true` partait, une cessation enregistrée par
        // erreur restait vraie pour toujours, même après correction de la fiche
        // Sirene, et le barème rendait 0 sans recours.
        setClosed: async (id, closed) => {
          const { error } = await client
            .from('prospect')
            .update({ is_closed: closed, reconciled_at: new Date().toISOString() })
            .eq('id', id);
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
      const closed = await fetchClosedIds(client);


      // Seuls les prospects sans domaine propre : proposer un nom à qui en a
      // déjà un n'a aucun sens.
      const rows: { prospect_id: string; denomination: string; trade_slug: string }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('web_presence')
          .select('prospect_id, prospect(denomination, trade_slug)')
          .in('category', ['none', 'social_only', 'directory_only'])
          .is('domain_checked_at', null)
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
      // `--limit` borne ce que la commande traite reellement, et pas seulement
      // ce qu elle annonce : le valider sans l appliquer serait pire que
      // l ignorer.
      for (const row of rows.slice(0, limit)) {
        if (closed.has(row.prospect_id)) continue;
        const trade = getTrade(row.trade_slug);
        if (trade === undefined) continue;
        const candidates = domainCandidates(row.denomination, trade);

        // On cherche un candidat libre, pas le verdict du dernier essayé.
        // `false` ne se dit que si TOUS ont été tranchés et pris ; il suffit
        // d'un seul « je ne sais pas » pour que le champ reste `null`.
        let available: boolean | null = candidates.length === 0 ? null : false;
        for (const name of candidates) {
          const verdict = await checkDomainAvailability(name, deps);
          if (verdict === true) {
            available = true;
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
          domain_checked_at?: string;
        } = { prospect_id: row.prospect_id, domain_candidates: candidates };
        if (available !== null) {
          write.domain_available = available;
          write.domain_checked_at = new Date().toISOString();
        }

        const { error } = await client
          .from('web_presence')
          .upsert(write, { onConflict: 'prospect_id' });
        if (error) {
          process.stderr.write(`domains: échec sur ${row.prospect_id} — ${error.message}\n`);
          continue;
        }
        if (available === null) undecided += 1;
        else checked += 1;
      }

      process.stdout.write(
        `domains : ${checked} prospects vérifiés` +
          (undecided > 0 ? `, ${undecided} indécis (registre indisponible), à rejouer\n` : '\n'),
      );
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
