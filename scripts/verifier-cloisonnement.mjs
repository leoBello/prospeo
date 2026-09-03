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

/**
 * Le propriétaire est FIGÉ sur son uuid, jamais déduit par élimination.
 *
 * « Le premier qui n'est pas le témoin » se trompait déjà au troisième
 * compte créé sur l'instance : il aurait désigné un compte arbitraire,
 * inséré un prospect chez lui, et fait tourner les assertions ci-dessous
 * sans plus rien vérifier — SANS RIEN LE SIGNALER. Un contrôle qui ment est
 * pire qu'un contrôle absent ; figer l'uuid et échouer bruyamment s'il
 * manque vaut mieux qu'une déduction qui se trompe en silence.
 */
const PROPRIETAIRE_ID = '131ab48e-055a-4a15-af4b-79ed7a2e4465';
const proprietaire = comptes.users.find((u) => u.id === PROPRIETAIRE_ID);
if (proprietaire === undefined) {
  console.log(`propriétaire introuvable : aucun compte ${PROPRIETAIRE_ID} sur cette instance.`);
  process.exit(1);
}
console.log(`propriétaire : ${proprietaire.email} (${proprietaire.id})\n`);

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

console.log('');
console.log('-- ce que le TÉMOIN voit (sa session, clé publique) --');

// Le sens POSITIF : il voit bien la sienne. Sans cette assertion, une
// politique qui cacherait tout à tout le monde passerait le contrôle
// ci-dessous sans rien protéger, et casserait le dashboard.
const { count: siens } = await client.from('prospect').select('*', { count: 'exact', head: true });
dire(siens >= 1, `prospect : ${siens} ligne(s) visible(s), au moins la sienne attendue`);

/**
 * Le sens NÉGATIF, table par table, et sur une ligne NOMMÉE.
 *
 * **Pourquoi pas « le témoin voit zéro ligne ».** Il en possède
 * légitimement — son prospect, et un job qu'on lui a déposé. Attendre zéro
 * partout faisait échouer ce contrôle sur une situation parfaitement saine,
 * et un contrôle qui crie au loup finit par ne plus être lu.
 *
 * L'invariant juste n'est pas « il ne voit rien », c'est « il ne voit rien
 * DE L'AUTRE ». On prend donc, avec `service_role`, une ligne qui appartient
 * au propriétaire, et on vérifie qu'elle est invisible pour le témoin —
 * preuve plus étroite et bien plus sûre qu'un décompte.
 */
for (const table of TABLES) {
  // La colonne qui rattache une ligne au propriétaire diffère d'une table à
  // l'autre : directe, par le demandeur, ou par le prospect dont elle pend.
  const parProspect = (q) => q.eq('prospect.owner_id', proprietaire.id);
  const selon = {
    prospect: (q) => q.eq('owner_id', proprietaire.id),
    campaign: (q) => q.eq('owner_id', proprietaire.id),
    campaign_job: (q) => q.eq('requested_by', proprietaire.id),
  };
  // Six satellites n'ont PAS de colonne `id` : leur clé primaire EST
  // `prospect_id` (voir la migration initiale). Prendre `id` partout faisait
  // échouer le contrôle sur une erreur de schéma, pas sur une fuite.
  const CLE_PROSPECT = new Set([
    'prospect_enrichment',
    'web_presence',
    'prospect_score',
    'prospect_pipeline',
    'prospect_site',
    'prospect_contact',
  ]);
  const cle = CLE_PROSPECT.has(table) ? 'prospect_id' : 'id';
  const direct = table in selon;
  const colonnes = direct ? cle : `${cle}, prospect!inner(owner_id)`;

  const { data: sienne, error: erreurReference } = await (selon[table] ?? parProspect)(
    admin.from(table).select(colonnes),
  )
    .limit(1)
    .maybeSingle();

  if (erreurReference !== null) {
    dire(false, `${table} : lecture de référence impossible — ${erreurReference.message.slice(0, 50)}`);
    continue;
  }
  if (sienne === null) {
    console.log(`  --    ${table} : le propriétaire n'a aucune ligne, rien à cacher ici`);
    continue;
  }

  const { data: vue, error } = await client
    .from(table)
    .select(cle)
    .eq(cle, sienne[cle])
    .maybeSingle();
  if (error !== null) {
    dire(false, `${table} : ${error.message.slice(0, 60)}`);
    continue;
  }
  dire(
    vue === null,
    `${table} : la ligne ${String(sienne[cle]).slice(0, 8)}… du propriétaire est invisible`,
  );
}

// -------------------------------------- les deux objets de l'application
// `TABLES` les exclut (C4) parce qu'ils n'appartiennent à aucun client — mais
// exclus du filtrage ne veut pas dire exclus du contrôle : une politique
// cassée ici ne serait vue par AUCUN test si ce script se taisait sur elles
// aussi. Ce qu'on attend d'elles se VÉRIFIE, plutôt que de se supposer :
// - toutes deux lisibles par n'importe quel compte authentifié ;
// - `site_template` est de plus ÉCRITE par n'importe quel compte
//   authentifié : c'est le trou connu et borné, consigné dans HANDOFF.md,
//   pas un oubli — ce contrôle doit le CONSTATER, pas le taire.
for (const table of ['site_template', 'worker_heartbeat']) {
  const { error } = await client.from(table).select('*', { count: 'exact', head: true });
  dire(error === null, `${table} : lisible par le témoin authentifié (attendu, C4)`);
}

// `updated_at` seul, jamais `repo_full_name` ni `branch` : la valeur du
// gabarit désigné est un réglage réel de l'instance, et ce contrôle n'a pas
// à le perturber pour prouver que l'écriture passe.
const { error: erreurEcritureGabarit } = await client
  .from('site_template')
  .update({ updated_at: new Date().toISOString() })
  .eq('id', 1);
dire(
  erreurEcritureGabarit === null,
  'site_template : écrivable par le témoin authentifié (le trou connu, borné — voir HANDOFF.md)',
);

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
