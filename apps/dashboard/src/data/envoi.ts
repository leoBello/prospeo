import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';

type Client = SupabaseClient<Database>;

/**
 * Ce que le panneau de relecture a besoin de savoir sur UN prospect.
 *
 * Toutes les absences restent `null` — jamais `''`. Un objet vide et un mail
 * jamais rédigé sont deux faits différents, et l'écran doit pouvoir le dire :
 * l'un se complète, l'autre se rédige.
 */
export interface Brouillon {
  objet: string | null;
  corps: string | null;
  modele: string | null;
  consignes: string | null;
  redigeLe: string | null;
  adresse: string | null;
  origine: Enums<'contact_origin'> | null;
  envoi: { state: Enums<'send_state'> } | null;
}

/**
 * Trois lectures et non une jointure : les trois tables n'ont pas la même
 * cardinalité (un mail par canal, un contact par prospect, N envois), et
 * PostgREST plafonne les relations embarquées — un plafond silencieux ferait
 * passer un envoi existant pour une absence, c'est-à-dire ferait proposer un
 * second envoi à qui en a déjà reçu un.
 *
 * La RLS borne chaque lecture au propriétaire : aucun filtre explicite ici,
 * comme partout ailleurs dans `data/`.
 */
export async function fetchBrouillon(client: Client, prospectId: string): Promise<Brouillon> {
  const { data: message, error: erreurMessage } = await client
    .from('generated_message')
    .select('subject,content,model,prompt_version,created_at')
    .eq('prospect_id', prospectId)
    .eq('channel', 'email')
    // Le plus récent : `generate` peut rejouer, et c'est la dernière rédaction
    // qui sera relue puis envoyée.
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erreurMessage !== null) throw new Error(erreurMessage.message);

  const { data: contact, error: erreurContact } = await client
    .from('prospect_contact')
    .select('email,origin')
    .eq('prospect_id', prospectId)
    .maybeSingle();
  if (erreurContact !== null) throw new Error(erreurContact.message);

  const { data: envoi, error: erreurEnvoi } = await client
    .from('message_send')
    .select('state')
    .eq('prospect_id', prospectId)
    .eq('channel', 'email')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erreurEnvoi !== null) throw new Error(erreurEnvoi.message);

  return {
    objet: message?.subject ?? null,
    corps: message?.content ?? null,
    modele: message?.model ?? null,
    consignes: message?.prompt_version ?? null,
    redigeLe: message?.created_at ?? null,
    adresse: contact?.email ?? null,
    origine: contact?.origin ?? null,
    envoi: envoi === null ? null : { state: envoi.state },
  };
}
