/**
 * Le contrôle qui prouve le cloisonnement — et la seule chose qui le prouve.
 *
 * **Pourquoi il ne suffit pas de vérifier qu'un intrus ne voit rien.** Une
 * politique qui cache tout à tout le monde passerait ce contrôle-là sans rien
 * protéger, et casserait le dashboard. Ce script vérifie donc les DEUX sens :
 * un compte ne voit pas les lignes d'un autre, ET il voit bien les siennes.
 *
 * **Pourquoi il emploie la clé anonyme et non `service_role`.** `service_role`
 * contourne RLS par construction : un contrôle écrit avec elle passerait
 * quelles que soient les politiques. Les lectures se font donc avec la clé
 * publique et une vraie session, comme un navigateur.
 *
 * Il vit au dépôt et se rejoue à chaque chantier qui touche aux politiques.
 *
 *   node scripts/verifier-cloisonnement.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

/** Le compte de vérification, dédié et conservé : le recréer à chaque passage
 *  laisserait des comptes orphelins sur l'instance. */
const EMAIL = 'verification-cloisonnement@prospeo.invalid';
const MOT_DE_PASSE = 'verification-cloisonnement-2026';

/** Les quatorze tables qui portent des données de client. `site_template` et
 *  `worker_heartbeat` en sont exclues : ce sont des objets de l'application. */
const TABLES = [
  'prospect',
  'prospect_enrichment',
  'web_presence',
  'prospect_score',
  'prospect_pipeline',
  'prospect_site',
  'prospect_contact',
  'interaction',
  'generated_message',
  'deployment_event',
  'pipeline_event',
  'message_send',
  'campaign',
  'campaign_job',
];

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let echecs = 0;
const dire = (ok, texte) => {
  if (!ok) echecs += 1;
  console.log(`${ok ? '  ok  ' : '  ÉCHEC'} ${texte}`);
};

// ---------------------------------------------------------------- le compte
const { data: comptes } = await admin.auth.admin.listUsers();
let temoin = comptes.users.find((u) => u.email === EMAIL);
if (temoin === undefined) {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: MOT_DE_PASSE,
    email_confirm: true,
  });
  if (error !== null) {
    console.log(`impossible de créer le compte de vérification : ${error.message}`);
    process.exit(1);
  }
  temoin = data.user;
  console.log(`compte de vérification créé : ${temoin.id}`);
} else {
  console.log(`compte de vérification existant : ${temoin.id}`);
}

const proprietaire = comptes.users.find((u) => u.email !== EMAIL);
console.log(`propriétaire : ${proprietaire?.email} (${proprietaire?.id})\n`);

// -------------------------------------------- une ligne qui lui appartient
// Sans elle, on ne pourrait pas distinguer « cloisonné » de « tout verrouillé ».
// Le SIRET est celui d'un prospect du propriétaire : c'est CE doublon-là que
// l'index (owner_id, siret) doit désormais autoriser, et l'insertion le prouve.
const { data: modele } = await admin
  .from('prospect')
  .select('siret,siren,trade_slug,denomination,address,postal_code,city')
  .eq('owner_id', proprietaire.id)
  .limit(1)
  .single();

const { data: sien } = await admin
  .from('prospect')
  .select('id')
  .eq('owner_id', temoin.id)
  .limit(1)
  .maybeSingle();

if (sien === null) {
  const { error } = await admin.from('prospect').insert({ ...modele, owner_id: temoin.id });
  dire(
    error === null,
    `le MÊME siret peut appartenir à deux propriétaires${error ? ` — ${error.message}` : ''}`,
  );
} else {
  console.log('  ok   le témoin a déjà son prospect (passage précédent)');
}

// -------------------------------------------------- ce que le témoin voit
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { error: erreurSession } = await client.auth.signInWithPassword({
  email: EMAIL,
  password: MOT_DE_PASSE,
});
if (erreurSession !== null) {
  console.log(`connexion du témoin impossible : ${erreurSession.message}`);
  process.exit(1);
}

console.log('\n-- ce que le TÉMOIN voit (sa session, clé publique) --');
const { count: siens } = await client.from('prospect').select('*', { count: 'exact', head: true });
dire(siens === 1, `prospect : ${siens} ligne(s), la sienne seule attendue`);

for (const table of TABLES.filter((t) => t !== 'prospect')) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error !== null) {
    dire(false, `${table} : ${error.message.slice(0, 60)}`);
    continue;
  }
  dire(count === 0, `${table} : ${count} ligne(s), 0 attendue`);
}

// ------------------------------------------- et qu'il ne peut rien écrire
// `with check` autant que `using` : sans lui, le témoin pourrait ÉCRIRE une
// ligne rattachée au prospect d'un autre, même sans pouvoir la relire.
const { data: cible } = await admin
  .from('prospect')
  .select('id')
  .eq('owner_id', proprietaire.id)
  .limit(1)
  .single();
const { error: erreurEcriture } = await client
  .from('interaction')
  .insert({ prospect_id: cible.id, kind: 'note', body: 'tentative de vérification' });
dire(erreurEcriture !== null, "écrire sur le prospect d'un autre est refusé");

await client.auth.signOut();

console.log(
  echecs === 0
    ? '\nCLOISONNEMENT VÉRIFIÉ dans les deux sens.'
    : `\n${echecs} ÉCHEC(S) — le cloisonnement ne tient pas.`,
);
process.exit(echecs === 0 ? 0 : 1);
