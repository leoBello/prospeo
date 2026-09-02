import { describe, expect, it } from 'vitest';
import { getTrade, templateRepoFor, type Trade } from '@prospeo/core';
import { gabaritDefautPourPublication, lireGabaritActif } from './site-template.js';

/**
 * Les trois niveaux de résolution assemblés.
 *
 * Vit ICI et non dans le module de production : son docstring d'origine
 * reconnaissait lui-même n'exister que pour les tests, et `cli.ts` ne
 * l'appelait pas. En production ce ne sont jamais deux appels côte à côte —
 * `cli.ts` calcule `gabaritDefautPourPublication(...)` une seule fois pour
 * tout le lot, et c'est `runPublish` qui appelle `templateRepoFor(trade,
 * deps.templateRepoDefaut)` séparément, pour CHAQUE prospect selon son
 * métier. On rejoue les deux à la suite pour qu'un seul test prouve que
 * l'ensemble respecte la priorité du métier — le point que `cli.ts`, non
 * testé, ne peut pas garantir lui-même.
 */
function resoudreTemplateRepo(
  trade: Trade,
  gabaritBase: string | undefined,
  envDefaut: string | undefined,
): string {
  return templateRepoFor(trade, gabaritDefautPourPublication(gabaritBase, envDefaut));
}

/** Métier sans gabarit déclaré — les deux métiers réels en déclarent un. */
const METIER_SANS_GABARIT: Trade = {
  slug: 'test-sans-gabarit',
  label: 'Test',
  nafCodes: [],
  mapsQueries: [],
  keywords: [],
  categoryLabels: [],
  prestations: [],
  heros: [],
};

describe('gabaritDefautPourPublication', () => {
  // Le calcul introduit par la tâche 6 : le repli de niveau 2 (base) prime
  // sur le repli de niveau 3 (environnement). C'est la ligne unique que
  // `cli.ts` emploie pour construire `deps.templateRepoDefaut`.
  it('retient le gabarit actif en base quand il est renseigné', () => {
    expect(gabaritDefautPourPublication('org/depuis-la-base', 'org/depuis-env')).toBe(
      'org/depuis-la-base',
    );
  });

  it('retombe sur la variable d’environnement quand la base est nulle', () => {
    expect(gabaritDefautPourPublication(undefined, 'org/depuis-env')).toBe('org/depuis-env');
  });

  it('rend undefined quand ni la base ni l’environnement ne sont renseignés', () => {
    expect(gabaritDefautPourPublication(undefined, undefined)).toBeUndefined();
  });
});

describe('resoudreTemplateRepo — les trois niveaux ensemble', () => {
  // Ces trois tests exercent la résolution telle qu'elle tourne réellement :
  // `templateRepoFor` (inchangé) reçoit le résultat de
  // `gabaritDefautPourPublication` (nouveau). C'est la combinaison qui
  // compte, pas chaque fonction isolément — un `defaut` correctement calculé
  // ne sert à rien si l'appelant l'utilisait avant de consulter le métier.

  it('le métier prime, même quand la base désigne un autre gabarit', () => {
    const plombier = getTrade('plombier');
    if (plombier === undefined) throw new Error('métier de test introuvable');
    // La base ET l'environnement désignent tous deux un AUTRE dépôt : si l'un
    // des deux l'emportait, ce test le détecterait.
    expect(
      resoudreTemplateRepo(plombier, 'org/gabarit-generique-en-base', 'org/gabarit-env'),
    ).toBe('plombier');
  });

  it('à défaut de gabarit métier, la base gagne', () => {
    expect(
      resoudreTemplateRepo(METIER_SANS_GABARIT, 'org/gabarit-generique-en-base', 'org/gabarit-env'),
    ).toBe('org/gabarit-generique-en-base');
  });

  it('à défaut de gabarit métier et de base, l’environnement gagne', () => {
    expect(resoudreTemplateRepo(METIER_SANS_GABARIT, undefined, 'org/gabarit-env')).toBe(
      'org/gabarit-env',
    );
  });

  it('le gabarit du métier est bien celui que trades.ts déclare, pas un repli', () => {
    // L'assertion d'origine comparait `resoudreTemplateRepo(...)` à
    // `templateRepoFor(plombier, gabaritDefautPourPublication(...))` : les
    // deux membres évaluaient LA MÊME expression, si bien qu'elle passait
    // aussi bien sous un code correct que sous un code fautif. Une valeur
    // littérale, elle, ne peut pas suivre la faute.
    const plombier = getTrade('plombier');
    if (plombier === undefined) throw new Error('métier de test introuvable');
    expect(plombier.templateRepo).toBe('plombier');
    expect(templateRepoFor(plombier, 'org/ignore')).toBe('plombier');
  });
});

describe('lireGabaritActif', () => {
  it('rend le gabarit désigné quand la ligne singleton le porte', async () => {
    const client = clientAvecLigne({ repo_full_name: 'org/gabarit-choisi' });
    await expect(lireGabaritActif(client)).resolves.toBe('org/gabarit-choisi');
  });

  it('rend undefined quand la colonne est nulle — aucun gabarit désigné', async () => {
    const client = clientAvecLigne({ repo_full_name: null });
    await expect(lireGabaritActif(client)).resolves.toBeUndefined();
  });

  // Ces deux tests n'affirment pas seulement que `lireGabaritActif` rend
  // `undefined` en isolation : ils rejouent le calcul réel de
  // `gabaritDefautPourPublication` avec la valeur obtenue, pour prouver ce
  // qui compte vraiment — que l'environnement l'emporte. `?? undefined` ne
  // filtre que le nul : une colonne vide n'est pas nulle, elle serait donc
  // passée telle quelle et aurait battu l'environnement dans ce calcul.
  it('une colonne vide n’est pas un gabarit désigné — l’environnement l’emporte', async () => {
    const client = clientAvecLigne({ repo_full_name: '' });
    const gabaritBase = await lireGabaritActif(client);
    expect(gabaritDefautPourPublication(gabaritBase, 'org/depuis-env')).toBe('org/depuis-env');
  });

  it('une colonne faite uniquement d’espaces n’est pas un gabarit désigné — l’environnement l’emporte', async () => {
    const client = clientAvecLigne({ repo_full_name: '   ' });
    const gabaritBase = await lireGabaritActif(client);
    expect(gabaritDefautPourPublication(gabaritBase, 'org/depuis-env')).toBe('org/depuis-env');
  });

  it('échoue franchement si la ligne singleton est absente', async () => {
    // C'est un état anormal (migration non jouée, ligne supprimée à la main),
    // pas « aucun gabarit désigné » — le confondre avec le cas nul ferait
    // disparaître silencieusement un problème d'infrastructure.
    const client = clientAvecLigne(null);
    await expect(lireGabaritActif(client)).rejects.toThrow(/site_template/);
  });

  it('échoue franchement si Supabase rend une erreur', async () => {
    const client = clientAvecErreur('la connexion a été refusée');
    await expect(lireGabaritActif(client)).rejects.toThrow(/la connexion a été refusée/);
  });
});

// ---------------------------------------------------------------------------
// Client Supabase minimal, ne portant que ce que `lireGabaritActif` emploie.
// ---------------------------------------------------------------------------

function clientAvecLigne(row: { repo_full_name: string | null } | null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof lireGabaritActif>[0];
}

function clientAvecErreur(message: string) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: null, error: { message } };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof lireGabaritActif>[0];
}
