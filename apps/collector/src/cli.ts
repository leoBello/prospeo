import { getTrade } from '@prospeo/core';
import { loadConfig } from './config.js';
import { createClient } from './supabase.js';
import { makeUpsertProspect, runDiscover } from './stages/discover.js';
import { probeUrl } from './stages/probe.js';

const USAGE = `
prospeo <commande> [options]

Commandes
  discover --trade <slug> --postal-code <cp>   Ingère les établissements Sirene
  probe                                        Sonde les URL déclarées
  score                                        Classe et note les prospects

Options
  --limit <n>   Plafond d'enregistrements traités
`;

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
      const { data, error } = await client
        .from('prospect_enrichment')
        .select('prospect_id, declared_url')
        .not('declared_url', 'is', null);
      if (error) throw new Error(error.message);

      let done = 0;
      for (const row of data ?? []) {
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
      process.stdout.write(`probe : ${done} URL sondées\n`);
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
