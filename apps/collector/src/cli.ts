import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTrade } from '@prospeo/core';
import { loadConfig } from './config.js';
import { createClient } from './supabase.js';
import { planScoreWrite } from './stages/classify-score.js';
import { makeUpsertProspect, runDiscover } from './stages/discover.js';
import { probeUrl, shouldProbe } from './stages/probe.js';

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
  probe                                        Sonde les URL déclarées
  score                                        Classe et note les prospects

Options
  --limit <n>   Plafond d'enregistrements traités
  --force       Resonde même les URL encore fraîches
`;

/** Taille de page des lectures Supabase (PostgREST plafonne a max_rows = 1000). */
const PAGE_SIZE = 500;

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
      'id, denomination, date_creation, effectif_code, prospect_enrichment(declared_url, social_urls, phone_e164, rating, review_count), web_presence(category, probed_url, http_status, is_https, final_url, is_parked, has_viewport_meta, last_social_post_at)',
    )
    .order('id')
    .range(from, from + PAGE_SIZE - 1);
}

/** Commandes reconnues. Les étages sont branchés par les tâches 9 à 11. */
const COMMANDS = ['discover', 'probe', 'score'] as const;

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
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
      let limit: number | undefined;
      if (argv.includes('--limit')) {
        const limitRaw = flag(argv, 'limit');
        const parsed = limitRaw === undefined ? Number.NaN : Number(limitRaw);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          process.stderr.write(
            `--limit attend un entier positif, reçu : ${limitRaw ?? '(rien)'}\n`,
          );
          return 1;
        }
        limit = parsed;
      }

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
    case 'probe': {
      const config = loadConfig(process.env);
      const client = createClient(config);
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
      for (const row of rows) {
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
      let pending = 0;
      let eraseFailed = 0;

      for (const p of data ?? []) {
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
          // Toujours false : `discover` filtre déjà `etat_administratif !== 'A'`,
          // aucun établissement cessé n'entre en base.
          isClosed: false,
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
          pending += 1;
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

      process.stdout.write(`score : ${scored} prospects notés, ${pending} en attente de sonde\n`);
      // N'apparaît que si non nul : une ligne « 0 en échec » à chaque run
      // n'apprend rien et noierait le signal les fois où il compte.
      if (eraseFailed > 0) {
        process.stderr.write(
          `score : ${eraseFailed} effacements en échec, catégorie possiblement périmée\n`,
        );
      }
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
