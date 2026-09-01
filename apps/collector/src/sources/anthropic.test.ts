import { describe, expect, it } from 'vitest';
import { getTrade } from '@prospeo/core';
import { createRedacteur } from './anthropic.js';
import { MODEL } from '../stages/generate.js';

const PLOMBIER = getTrade('plombier')!;

/** Faux `messages.parse` : enregistre les paramètres, ne sort jamais. */
function fauxClient(reponse: Record<string, unknown>) {
  const appels: Record<string, unknown>[] = [];
  const options: (Record<string, unknown> | undefined)[] = [];
  const client = {
    parse: async (params: Record<string, unknown>, opts?: Record<string, unknown>) => {
      appels.push(params);
      options.push(opts);
      return reponse;
    },
  } as never;
  return { client, appels, options };
}

const USAGE = {
  input_tokens: 120,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1800,
  output_tokens: 240,
};

describe('createRedacteur', () => {
  it('place le point de césure du cache à la fin des consignes', async () => {
    // Le cache est un appariement de PRÉFIXE. Les consignes sont identiques
    // d'un prospect à l'autre et forment l'essentiel des jetons d'entrée ;
    // les faits, qui tiennent en dix lignes, doivent venir APRÈS le dernier
    // point de césure. Inverser les deux ne casserait rien de visible : les
    // réponses resteraient correctes, et seule la facture changerait.
    const { client, appels } = fauxClient({ parsed_output: {}, usage: USAGE });
    await createRedacteur({ apiKey: 'k', trade: PLOMBIER, client }).rediger('CONSIGNES', 'FAITS');

    const p = appels[0]!;
    expect(p.system).toEqual([
      { type: 'text', text: 'CONSIGNES', cache_control: { type: 'ephemeral' } },
    ]);
    expect(p.messages).toEqual([{ role: 'user', content: 'FAITS' }]);
  });

  it('emploie le modèle du plan et la réflexion adaptative', async () => {
    const { client, appels } = fauxClient({ parsed_output: {}, usage: USAGE });
    await createRedacteur({ apiKey: 'k', trade: PLOMBIER, client }).rediger('c', 'f');

    expect(appels[0]?.model).toBe(MODEL);
    expect(appels[0]?.model).toBe('claude-opus-4-8');
    // La tâche demande du jugement rédactionnel. `adaptive` laisse le modèle
    // décider de la profondeur, là où un budget fixe serait tantôt gâché,
    // tantôt trop court — et il est de toute façon rejeté par ce modèle.
    expect(appels[0]?.thinking).toEqual({ type: 'adaptive' });
  });

  it('contraint la sortie par le schéma du métier', async () => {
    const { client, appels } = fauxClient({ parsed_output: {}, usage: USAGE });
    await createRedacteur({ apiKey: 'k', trade: PLOMBIER, client }).rediger('c', 'f');
    // `output_config.format`, et non le `output_format` déprécié.
    expect(appels[0]?.output_config).toBeDefined();
    expect((appels[0]?.output_config as Record<string, unknown>).format).toBeDefined();
  });

  it('relève à part les jetons lus depuis le cache', async () => {
    // C'est le seul moyen de CONSTATER que la mise en cache sert, plutôt que
    // de l'espérer. Un compteur qui reste à zéro d'un appel à l'autre signale
    // un invalidateur silencieux dans les consignes.
    const { client } = fauxClient({ parsed_output: {}, usage: USAGE });
    const r = await createRedacteur({ apiKey: 'k', trade: PLOMBIER, client }).rediger('c', 'f');
    expect(r.usage).toEqual({ input: 120, cacheWrite: 0, cacheRead: 1800, output: 240 });
  });

  it('distingue l’écriture du cache de l’entrée de base', async () => {
    // Les deux sont facturées différemment — 6,25 $/MTok contre 5 $ sur la
    // grille Opus 4.8 — et l'écriture ne concerne que le PREMIER appel d'un
    // lot, celui qu'on regarde justement pour décider si la mise en cache
    // vaut le coup. Les additionner rendrait le rapport incapable de dire ce
    // qu'un run a coûté.
    const { client } = fauxClient({
      parsed_output: {},
      usage: { ...USAGE, cache_creation_input_tokens: 1800, cache_read_input_tokens: 0 },
    });
    const r = await createRedacteur({ apiKey: 'k', trade: PLOMBIER, client }).rediger('c', 'f');
    expect(r.usage).toEqual({ input: 120, cacheWrite: 1800, cacheRead: 0, output: 240 });
  });

  it('déclare le workspace quand la clé y est rattachée', async () => {
    // Une clé créée dans un Workspace dédié — ce que `.env.example` recommande
    // pour pouvoir lui fixer un plafond de dépense — est « identity-linked » :
    // l'API refuse par un 400 toute requête qui ne dit pas dans quel workspace
    // elle agit. Constaté au premier appel réel, pas deviné.
    const { client, options } = fauxClient({ parsed_output: {}, usage: USAGE });
    await createRedacteur({
      apiKey: 'k',
      trade: PLOMBIER,
      workspaceId: 'wrkspc_abc',
      client,
    }).rediger('c', 'f');
    expect(options[0]).toEqual({ headers: { 'anthropic-workspace-id': 'wrkspc_abc' } });
  });

  it('n’envoie pas d’en-tête de workspace vide', async () => {
    // Un en-tête creux serait envoyé puis rejeté, là où son absence laisse
    // passer une clé qui n'est rattachée à aucun workspace.
    const { client, options } = fauxClient({ parsed_output: {}, usage: USAGE });
    await createRedacteur({ apiKey: 'k', trade: PLOMBIER, workspaceId: '', client }).rediger('c', 'f');
    expect(options[0]).toBeUndefined();
  });

  it('rend null plutôt que de lever quand l’analyse échoue', async () => {
    // `runGenerate` porte la validation et le comptage des rejets. Lever ici
    // ferait compter une réponse mal formée comme une panne réseau — deux
    // incidents de nature différente, dont l'un se corrige en relançant et
    // l'autre en changeant le prompt.
    const { client } = fauxClient({ parsed_output: null, usage: USAGE });
    const r = await createRedacteur({ apiKey: 'k', trade: PLOMBIER, client }).rediger('c', 'f');
    expect(r.redaction).toBeNull();
  });
});
