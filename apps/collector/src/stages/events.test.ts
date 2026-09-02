import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { createEventSink, NULL_SINK, type DeploymentEvent } from './events.js';

const EVENEMENT: DeploymentEvent = {
  prospectId: 'p1',
  step: 'depot',
  outcome: 'reussi',
  detail: 'org/dos-services-51000900400035',
  durationMs: 1234,
};

/**
 * Doublure minimale du client Supabase : seule `from(table).insert(row)` est
 * exercée par `createEventSink`, donc seule cette forme est reproduite — pas
 * de réseau, pas du vrai SDK. `erreur` simule ce que rendrait une écriture
 * refusée par RLS ou une colonne absente après une migration incomplète.
 */
function fauxClient(erreur: { message: string } | null = null) {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      if (table !== 'deployment_event') throw new Error(`table inattendue : ${table}`);
      return {
        async insert(row: Record<string, unknown>) {
          inserts.push(row);
          return { error: erreur };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, inserts };
}

/**
 * Doublure qui lève de façon synchrone dès `from(...)` — un client mal formé,
 * ou une dépendance stubbée à moitié, peut échouer avant même d'atteindre le
 * réseau.
 */
function fauxClientQuiLeveSurFrom(erreur: Error) {
  const client = {
    from(_table: string) {
      throw erreur;
    },
  } as unknown as SupabaseClient<Database>;
  return client;
}

/**
 * Doublure dont `insert(...)` rend une promesse rejetée — c'est la forme que
 * prend réellement une panne réseau, à distinguer du `{ error }` propre que
 * rend le SDK Supabase pour un refus RLS ou similaire.
 */
function fauxClientQuiRejette(erreur: Error) {
  const client = {
    from(table: string) {
      if (table !== 'deployment_event') throw new Error(`table inattendue : ${table}`);
      return {
        insert(_row: Record<string, unknown>) {
          return Promise.reject(erreur);
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  return client;
}

describe('createEventSink', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('insère dans deployment_event avec les champs transmis', async () => {
    const { client, inserts } = fauxClient();
    const sink = createEventSink(client);

    await sink.emit(EVENEMENT);

    expect(inserts).toEqual([
      {
        prospect_id: 'p1',
        step: 'depot',
        outcome: 'reussi',
        detail: 'org/dos-services-51000900400035',
        duration_ms: 1234,
      },
    ]);
  });

  it('ne rejette jamais, même quand le client rend une erreur', async () => {
    // La garantie centrale du fichier : perdre une ligne de journal est un
    // désagrément, interrompre `publish` au milieu de vingt-deux dépôts en
    // est un autre.
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { client } = fauxClient({ message: 'RLS: colonne manquante' });
    const sink = createEventSink(client);

    await expect(sink.emit(EVENEMENT)).resolves.toBeUndefined();
  });

  it('signale l’échec sur stderr, pour qu’un journal incomplet ne passe pas pour complet', async () => {
    const ecriture = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { client } = fauxClient({ message: 'RLS: colonne manquante' });
    const sink = createEventSink(client);

    await sink.emit(EVENEMENT);

    expect(ecriture).toHaveBeenCalledTimes(1);
    expect(ecriture.mock.calls[0]?.[0]).toContain('RLS: colonne manquante');
  });

  it('ne signale rien sur stderr quand l’écriture réussit', async () => {
    const ecriture = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { client } = fauxClient();
    const sink = createEventSink(client);

    await sink.emit(EVENEMENT);

    expect(ecriture).not.toHaveBeenCalled();
  });

  it('écrit null pour detail et durationMs quand ils sont absents', async () => {
    // Le seul endroit où le mappage n'est pas un pur passage : detail et
    // durationMs sont optionnels côté appelant mais doivent atterrir en
    // colonnes null, pas en `undefined`.
    const { client, inserts } = fauxClient();
    const sink = createEventSink(client);

    await sink.emit({ prospectId: 'p2', step: 'depot', outcome: 'reussi' });

    expect(inserts).toEqual([
      {
        prospect_id: 'p2',
        step: 'depot',
        outcome: 'reussi',
        detail: null,
        duration_ms: null,
      },
    ]);
  });

  it('ne rejette jamais et journalise la cause quand from() lève de façon synchrone', async () => {
    const ecriture = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const client = fauxClientQuiLeveSurFrom(new Error('client mal formé'));
    const sink = createEventSink(client);

    await expect(sink.emit(EVENEMENT)).resolves.toBeUndefined();

    expect(ecriture).toHaveBeenCalledTimes(1);
    expect(ecriture.mock.calls[0]?.[0]).toContain('client mal formé');
  });

  it('ne rejette jamais et journalise la cause quand insert() rend une promesse rejetée', async () => {
    // C'est la forme que prend une vraie panne réseau — le cas le plus
    // probable en production, et pourtant le seul qu'aucun test ne tenait
    // avant ce correctif.
    const ecriture = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const client = fauxClientQuiRejette(new Error('ECONNRESET'));
    const sink = createEventSink(client);

    await expect(sink.emit(EVENEMENT)).resolves.toBeUndefined();

    expect(ecriture).toHaveBeenCalledTimes(1);
    expect(ecriture.mock.calls[0]?.[0]).toContain('ECONNRESET');
  });
});

describe('NULL_SINK', () => {
  it('résout sans rien faire et sans client', async () => {
    await expect(NULL_SINK.emit(EVENEMENT)).resolves.toBeUndefined();
  });
});
