import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { RawEstablishment, Trade } from '@prospeo/core';
import { searchEstablishments } from '../sources/recherche-entreprises.js';

export interface DiscoverReport {
  seen: number;
  upserted: number;
}

export interface DiscoverDeps {
  trade: Trade;
  postalCode: string;
  limit?: number;
  source?: () => AsyncIterable<RawEstablishment>;
  upsertProspect: (row: RawEstablishment) => Promise<void>;
}

/**
 * Idempotent : l'upsert se fait sur le SIRET, rejouer la commande ne duplique
 * rien. L'écriture est unitaire, un échec isolé ne compromet pas le reste.
 */
export async function runDiscover(deps: DiscoverDeps): Promise<DiscoverReport> {
  const iterate =
    deps.source ?? (() => searchEstablishments({ trade: deps.trade, postalCode: deps.postalCode }));

  let seen = 0;
  let upserted = 0;

  for await (const row of iterate()) {
    if (deps.limit !== undefined && seen >= deps.limit) break;
    seen += 1;
    try {
      await deps.upsertProspect(row);
      upserted += 1;
    } catch (error) {
      process.stderr.write(
        `discover: échec sur ${row.siret} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return { seen, upserted };
}

/** Écriture Supabase, séparée pour rester testable sans réseau. */
export function makeUpsertProspect(client: SupabaseClient<Database>) {
  return async (row: RawEstablishment): Promise<void> => {
    const { error } = await client.from('prospect').upsert(
      {
        siret: row.siret,
        siren: row.siren,
        trade_slug: row.tradeSlug,
        denomination: row.denomination,
        denomination_usuelle: row.denominationUsuelle,
        naf_code: row.nafCode,
        address: row.address,
        postal_code: row.postalCode,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
        date_creation: row.dateCreation,
        effectif_code: row.effectifCode,
        is_entrepreneur_individuel: row.isEntrepreneurIndividuel,
        is_head_office: row.isHeadOffice,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'siret' },
    );
    if (error) throw new Error(error.message);
  };
}
