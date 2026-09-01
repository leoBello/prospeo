import { loadConfig } from './config.js';

const USAGE = `
prospeo <commande> [options]

Commandes
  discover --trade <slug> --postal-code <cp>   Ingère les établissements Sirene
  probe                                        Sonde les URL déclarées
  score                                        Classe et note les prospects

Options
  --limit <n>   Plafond d'enregistrements traités
`;

async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  if (command === undefined || command === '--help') {
    process.stdout.write(USAGE);
    return 0;
  }

  const config = loadConfig(process.env);

  switch (command) {
    default:
      process.stderr.write(`Commande inconnue : ${command}\n${USAGE}`);
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
