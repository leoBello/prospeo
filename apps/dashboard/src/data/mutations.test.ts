import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import {
  annulerRejet,
  definirStatut,
  designerGabarit,
  journaliserInteraction,
  rejeterRedaction,
} from './mutations.js';

/**
 * Client simulé : enregistre l'écriture construite, n'accède à rien.
 *
 * C'est le CÂBLAGE qu'on éprouve — quelle table, quel verbe, quelles colonnes.
 * Une erreur à ce niveau ne se voit pas autrement : Supabase répond sans
 * broncher à un `update` qui ne touche aucune ligne.
 */
/**
 * `erreurParTable` cible l'échec sur UNE table précise, sans toucher aux
 * autres — indispensable pour `definirStatut`, qui écrit désormais sur DEUX
 * tables et dont l'échec partiel (la seconde réussit sans la première, ou
 * l'inverse) est justement ce que ce fichier doit prouver. `erreur` reste le
 * réglage global déjà utilisé par les autres suites, pour ne rien casser.
 */
function fakeClient(
  erreur: { message: string } | null = null,
  erreurParTable: Record<string, { message: string }> = {},
) {
  const appels: { table: string; verbe: string; valeurs: unknown; filtre?: [string, string]; options?: unknown }[] = [];

  const client = {
    from(table: string) {
      const reponse = Promise.resolve({ error: erreurParTable[table] ?? erreur });
      return {
        update(valeurs: unknown) {
          const appel = { table, verbe: 'update', valeurs };
          appels.push(appel);
          return {
            eq(colonne: string, valeur: string) {
              (appel as Record<string, unknown>)['filtre'] = [colonne, valeur];
              return reponse;
            },
          };
        },
        upsert(valeurs: unknown, options?: unknown) {
          appels.push({ table, verbe: 'upsert', valeurs, options });
          return reponse;
        },
        insert(valeurs: unknown) {
          appels.push({ table, verbe: 'insert', valeurs });
          return reponse;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, appels };
}

describe('rejeterRedaction', () => {
  it('horodate le refus SANS effacer le contenu', () => {
    // La décision centrale du geste. Effacer `content` aurait suffi à faire
    // régénérer le prospect, mais on ne saurait plus ce qu'on a refusé — donc
    // rien de ce qui permet de corriger le prompt — ni distinguer « jamais
    // rédigé » de « rédigé puis refusé ».
    const { client, appels } = fakeClient();
    void rejeterRedaction(client, 'p1');

    expect(appels[0]?.table).toBe('prospect_site');
    const valeurs = appels[0]?.valeurs as Record<string, unknown>;
    expect(valeurs['content_rejected_at']).toEqual(expect.any(String));
    expect(valeurs).not.toHaveProperty('content');
  });

  it('ne touche que le prospect visé', async () => {
    const { client, appels } = fakeClient();
    await rejeterRedaction(client, 'p1');
    expect(appels[0]?.filtre).toEqual(['prospect_id', 'p1']);
  });

  it('rend le message d’erreur plutôt que de lever', async () => {
    // Une exception obligerait chaque appelant à un `try` ; une valeur de
    // retour se traite là où l'on sait quoi en afficher.
    const { client } = fakeClient({ message: 'RLS' });
    expect(await rejeterRedaction(client, 'p1')).toBe('RLS');
  });
});

describe('annulerRejet', () => {
  it('remet la date à null', async () => {
    // Le geste inverse doit exister : un refus est un clic, et un clic se fait
    // par erreur. Sans lui, revenir en arrière coûterait un appel payant.
    const { client, appels } = fakeClient();
    await annulerRejet(client, 'p1');
    expect((appels[0]?.valeurs as Record<string, unknown>)['content_rejected_at']).toBeNull();
  });
});

describe('definirStatut', () => {
  it('UPSERT, parce que la table est vide', async () => {
    // Mesuré le 2 septembre 2026 : `prospect_pipeline` ne contient aucune
    // ligne, faute d'écrivain. Un `update` ne toucherait rien — sans erreur —
    // et le premier clic sur chaque prospect serait silencieusement perdu.
    const { client, appels } = fakeClient();
    await definirStatut(client, 'p1', 'ne_pas_contacter', null);

    expect(appels[0]?.table).toBe('prospect_pipeline');
    expect(appels[0]?.verbe).toBe('upsert');
    expect(appels[0]?.options).toEqual({ onConflict: 'prospect_id' });
    expect(appels[0]?.valeurs).toMatchObject({
      prospect_id: 'p1',
      status: 'ne_pas_contacter',
      next_action_at: null,
    });
  });

  it('porte la date de relance quand il y en a une', async () => {
    const { client, appels } = fakeClient();
    await definirStatut(client, 'p1', 'relance', '2026-09-15');
    expect((appels[0]?.valeurs as Record<string, unknown>)['next_action_at']).toBe('2026-09-15');
  });

  it('écrit AUSSI l’historique dans pipeline_event, après l’état, dans la même opération', async () => {
    // Tâche 5 : un changement de statut sans sa ligne d'historique rendrait
    // le jeu (tâche 6) faux en silence — `rendezVousObtenus` et
    // `relancesTenues` ne lisent QUE `pipeline_event`.
    const { client, appels } = fakeClient();
    const resultat = await definirStatut(client, 'p1', 'interesse', '2026-09-20');

    expect(appels).toHaveLength(2);
    expect(appels[0]?.table).toBe('prospect_pipeline');
    expect(appels[1]?.table).toBe('pipeline_event');
    expect(appels[1]?.verbe).toBe('insert');
    expect(resultat).toBeNull();
  });

  it('porte dans l’historique le statut demandé et la next_action_at qui entre en vigueur avec CE changement', async () => {
    // Pas `null` par défaut, pas une autre valeur : celle qui accompagne
    // précisément ce changement de statut — voir `FaitPipeline.nextActionAt`
    // dans `domain/jeu.ts`.
    const { client, appels } = fakeClient();
    await definirStatut(client, 'p1', 'relance', '2026-09-15');

    const valeurs = appels[1]?.valeurs as Record<string, unknown>;
    expect(valeurs['prospect_id']).toBe('p1');
    expect(valeurs['status']).toBe('relance');
    expect(valeurs['next_action_at']).toBe('2026-09-15');
  });

  it('ne marque jamais une écriture réelle comme un "amorcage"', async () => {
    // 'amorcage' est réservé à la reconstitution unique faite par la
    // migration de la tâche 4 (`domain/jeu.ts`, `OrigineEvenementPipeline`).
    // Une écriture qui part de ce fichier observe un fait réel : ce ne peut
    // être qu''observe'.
    const { client, appels } = fakeClient();
    await definirStatut(client, 'p1', 'interesse', null);
    expect((appels[1]?.valeurs as Record<string, unknown>)['origin']).toBe('observe');
  });

  it('n’horodate pas l’historique depuis le navigateur', async () => {
    // Même raison que `journaliserInteraction` : `occurred_at` reste au
    // défaut de la base (`now()`), pour ne pas exposer une horloge de poste
    // décalée.
    const { client, appels } = fakeClient();
    await definirStatut(client, 'p1', 'interesse', null);
    expect(appels[1]?.valeurs).not.toHaveProperty('occurred_at');
  });

  it('n’écrit PAS l’historique quand l’état a échoué — l’échec net n’entraîne pas une écriture partielle', async () => {
    const { client, appels } = fakeClient(null, { prospect_pipeline: { message: 'RLS' } });
    const resultat = await definirStatut(client, 'p1', 'interesse', null);

    expect(appels).toHaveLength(1);
    expect(appels[0]?.table).toBe('prospect_pipeline');
    // Résultat STRUCTURÉ, pas une chaîne composée par ce fichier : `etape`
    // dit à l'appelant lequel des deux écrits a échoué, à charge pour lui de
    // le traduire (relevé de revue — voir `EchecDefinirStatut`).
    expect(resultat).toEqual({ etape: 'etat', message: 'RLS' });
  });

  it('signale — et n’avale PAS — un échec de l’historique une fois l’état déjà écrit, en nommant l’étape qui a échoué', async () => {
    // Le cœur de la tâche : une divergence silencieuse (état changé, jeu
    // resté aveugle à ce changement) est le pire des trois résultats
    // possibles. L'échec doit se voir, et dire LEQUEL des deux écrits a
    // échoué — sans quoi l'opérateur ne sait pas si son geste a pris.
    const { client, appels } = fakeClient(null, { pipeline_event: { message: 'HS' } });
    const resultat = await definirStatut(client, 'p1', 'interesse', null);

    // L'état, lui, a bien été écrit : ce n'est pas la première écriture qui
    // a échoué, sans quoi la seconde n'aurait jamais dû être tentée.
    expect(appels).toHaveLength(2);
    expect(appels[0]?.table).toBe('prospect_pipeline');
    expect(appels[1]?.table).toBe('pipeline_event');

    expect(resultat).toEqual({ etape: 'historique', message: 'HS' });
  });
});

describe('designerGabarit', () => {
  it('ecrit un UPDATE sur la ligne singleton id=1, jamais un INSERT', async () => {
    // `site_template` porte une contrainte `check (id = 1)` : sa ligne unique
    // existe déjà depuis la migration (tâche 2). Un `insert` la violerait dès
    // la première désignation qui suit le seed.
    const { client, appels } = fakeClient();
    await designerGabarit(client, 'prospeo/gabarit-agence-v2', 'main');

    expect(appels[0]?.table).toBe('site_template');
    expect(appels[0]?.verbe).toBe('update');
    expect(appels[0]?.filtre).toEqual(['id', 1]);
  });

  it('normalise un depot vide ou fait d espaces en null, jamais en chaine vide', async () => {
    // La même faute que `fetchSiteTemplate` a dû corriger en lecture (tâche
    // 6) : sans ce garde, '' se lirait plus tard comme une désignation.
    const { client, appels } = fakeClient();
    await designerGabarit(client, '   ', 'main');
    expect((appels[0]?.valeurs as Record<string, unknown>)['repo_full_name']).toBeNull();
  });

  it('replie une branche vide sur "main", plutot que d ecrire une chaine vide', async () => {
    const { client, appels } = fakeClient();
    await designerGabarit(client, 'prospeo/gabarit-agence-v2', '   ');
    expect((appels[0]?.valeurs as Record<string, unknown>)['branch']).toBe('main');
  });

  it('annule le verdict du controle precedent a chaque designation', async () => {
    // Sans ce reset, la carte affichait le verdict de l'ANCIEN dépôt (date et
    // pastille comprises) à côté du nom du NOUVEAU — jusqu'à « Contrôle
    // réussi le … » pour un dépôt jamais contrôlé une seule fois. Produire un
    // nouveau verdict exige un jeton GitHub, qui n'a rien à faire dans ce
    // bundle ; effacer l'ancien n'en a pas besoin.
    const { client, appels } = fakeClient();
    await designerGabarit(client, 'prospeo/gabarit-agence-v2', 'main');
    const valeurs = appels[0]?.valeurs as Record<string, unknown>;
    expect(valeurs['checked_at']).toBeNull();
    expect(valeurs['check_ok']).toBeNull();
    expect(valeurs['check_detail']).toBeNull();
  });

  it('rend le message d’erreur plutôt que de lever', async () => {
    const { client } = fakeClient({ message: 'RLS' });
    expect(await designerGabarit(client, 'prospeo/gabarit-agence-v2', 'main')).toBe('RLS');
  });
});

describe('journaliserInteraction', () => {
  it('EMPILE, parce qu’un journal ne se corrige pas', async () => {
    // Deux appels le même jour sont deux faits, pas une correction du premier.
    // C'est cette chronologie qui dira, dans six mois, ce qu'on avait tenté
    // avant de classer un prospect perdu.
    const { client, appels } = fakeClient();
    await journaliserInteraction(client, 'p1', 'appel', 'Pas de réponse');

    expect(appels[0]?.table).toBe('interaction');
    expect(appels[0]?.verbe).toBe('insert');
    expect(appels[0]?.valeurs).toMatchObject({ prospect_id: 'p1', kind: 'appel', body: 'Pas de réponse' });
  });

  it('accepte le canal SMS, que la migration de la tâche 5 a ajouté', async () => {
    // `interaction_kind` valait ('appel', 'whatsapp', 'email', 'note') : le
    // canal existait dans les messages générés et pas dans le journal.
    const { client, appels } = fakeClient();
    await journaliserInteraction(client, 'p1', 'sms', null);
    expect((appels[0]?.valeurs as Record<string, unknown>)['kind']).toBe('sms');
  });

  it('ne consigne pas une note vide', async () => {
    // Une chaîne vide occuperait une ligne du journal sans rien y dire, et
    // les espaces d'un champ qu'on a ouvert puis quitté ne valent pas mieux.
    const { client, appels } = fakeClient();
    await journaliserInteraction(client, 'p1', 'note', '   ');
    expect((appels[0]?.valeurs as Record<string, unknown>)['body']).toBeNull();
  });

  it('n’horodate pas depuis le navigateur', async () => {
    // `occurred_at` reste au défaut de la base. L'écrire ici exposerait
    // l'horloge du poste, qui peut être décalée de plusieurs minutes, et ferait
    // apparaître des échanges dans le désordre.
    const { client, appels } = fakeClient();
    await journaliserInteraction(client, 'p1', 'email', 'Relance envoyée');
    expect(appels[0]?.valeurs).not.toHaveProperty('occurred_at');
  });
});
