import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';
import type { MailAEnvoyer, ResultatEnvoiGmail } from './gmail.js';

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

/**
 * Écrit l'adresse saisie à la main.
 *
 * `origin: 'saisie'`, toujours : rien dans ce lot ne collecte d'adresse. Le
 * §12.2 du spec a mesuré que l'étage automatique n'aurait presque rien à
 * visiter — 109 prospects sur 139 sans aucune présence web — et conclut de ne
 * pas le construire. Écrire `collecte` ici mentirait sur la provenance, et
 * l'origine est précisément ce que D6 demande de conserver : une adresse tapée
 * par un humain et une adresse trouvée par un robot n'engagent pas la même
 * chose.
 */
export async function enregistrerAdresse(
  client: Client,
  prospectId: string,
  email: string,
): Promise<string | null> {
  const { error } = await client.from('prospect_contact').upsert(
    {
      prospect_id: prospectId,
      email: email.trim(),
      origin: 'saisie',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prospect_id' },
  );
  return error === null ? null : error.message;
}

/** Ce que `envoyerMail` a besoin de faire, sans savoir comment. */
export interface EnvoiDeps {
  /** Écrit `message_send` en `en_cours`. L'index unique tranche ICI. */
  prendre(
    prospectId: string,
    destinataire: string,
  ): Promise<{ ok: true; id: string } | { ok: false; message: string }>;
  envoyer(mail: MailAEnvoyer): Promise<ResultatEnvoiGmail>;
  clore(envoiId: string, providerMessageId: string): Promise<string | null>;
  echouer(envoiId: string, message: string): Promise<string | null>;
  journaliser(prospectId: string, corps: string): Promise<string | null>;
  avancerFiche(prospectId: string): Promise<string | null>;
}

export type ResultatEnvoi =
  | { ok: true }
  | { ok: false; etape: 'prise' | 'gmail' | 'suite'; message: string };

/**
 * La séquence du §7.2, dans son ordre — et l'ordre EST la garantie.
 *
 * **`prendre` avant Gmail.** C'est l'index unique partiel de `message_send`
 * qui empêche un second mail au même artisan, pas la boucle ni le bouton.
 * Deux onglets ouverts, un rechargement au mauvais moment : seule la base
 * tranche, et elle ne peut trancher que si la ligne est écrite AVANT l'appel.
 *
 * **L'étape 4 échouée ne se replie pas sur « échec ».** Le mail est parti, il
 * est chez le destinataire. Dire « échec » ferait recliquer, et la base
 * refuserait alors sans expliquer pourquoi — l'opérateur conclurait que
 * l'envoi n'a jamais marché. `etape: 'suite'` porte cette distinction jusqu'à
 * l'écran : ce qui a échoué, c'est la trace, pas l'envoi.
 */
export async function envoyerMail(
  deps: EnvoiDeps,
  args: { prospectId: string; mail: MailAEnvoyer },
): Promise<ResultatEnvoi> {
  const prise = await deps.prendre(args.prospectId, args.mail.a);
  if (!prise.ok) return { ok: false, etape: 'prise', message: prise.message };

  const resultat = await deps.envoyer(args.mail);
  if (!resultat.ok) {
    // La ligne prise est marquée `echoue`, seul état que l'index unique
    // partiel laisse rejouer : sans cela, un échec réseau condamnerait le
    // prospect à jamais.
    await deps.echouer(prise.id, resultat.message);
    return { ok: false, etape: 'gmail', message: resultat.message };
  }

  const erreurCloture = await deps.clore(prise.id, resultat.providerMessageId);
  if (erreurCloture !== null) return { ok: false, etape: 'suite', message: erreurCloture };

  const erreurJournal = await deps.journaliser(args.prospectId, args.mail.corps);
  if (erreurJournal !== null) return { ok: false, etape: 'suite', message: erreurJournal };

  const erreurFiche = await deps.avancerFiche(args.prospectId);
  if (erreurFiche !== null) return { ok: false, etape: 'suite', message: erreurFiche };

  return { ok: true };
}
