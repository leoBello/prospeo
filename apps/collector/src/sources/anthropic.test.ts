import { describe, expect, it } from 'vitest';
import { getTrade } from '@prospeo/core';
import { createRedacteur } from './anthropic.js';
import { MODEL } from '../stages/generate.js';

const PLOMBIER = getTrade('plombier')!;

/** Faux `messages.parse` : enregistre les paramètres, ne sort jamais. */
function fauxClient(reponse: Record<string, unknown>) {
  const appels: Record<string, unknown>[] = [];
  const client = {
    parse: async (params: Record<string, unknown>) => {
      appels.push(params);
      return reponse;
    },
  } as never;
  return { client, appels };
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
    expect(r.usage).toEqual({ input: 120, cacheRead: 1800, output: 240 });
  });

  it('compte l’écriture du cache comme de l’entrée pleine', async () => {
    // Le premier appel d'un lot PAIE la constitution du cache, à un tarif
    // supérieur à l'entrée ordinaire. La ranger dans `cacheRead` ferait croire
    // à une économie là où il y a un surcoût, et le premier appel est
    // justement celui qu'on regarde pour décider si le cache vaut le coup.
    const { client } = fauxClient({
      parsed_output: {},
      usage: { ...USAGE, cache_creation_input_tokens: 1800, cache_read_input_tokens: 0 },
    });
    const r = await createRedacteur({ apiKey: 'k', trade: PLOMBIER, client }).rediger('c', 'f');
    expect(r.usage).toEqual({ input: 1920, cacheRead: 0, output: 240 });
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
