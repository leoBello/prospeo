import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { fetchBrouillon } from './envoi.js';

/** Client simulé : trois lectures indépendantes, chacune rendue telle quelle. */
function clientSimule(lignes: {
  message?: Record<string, unknown> | null;
  contact?: Record<string, unknown> | null;
  envoi?: Record<string, unknown> | null;
}) {
  const tables: string[] = [];
  const client = {
    from(nom: string) {
      tables.push(nom);
      const donnee =
        nom === 'generated_message'
          ? (lignes.message ?? null)
          : nom === 'prospect_contact'
            ? (lignes.contact ?? null)
            : (lignes.envoi ?? null);
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => Promise.resolve({ data: donnee, error: null }),
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, tables };
}

describe('fetchBrouillon', () => {
  it('rend le mail, son adresse et sa traçabilité', async () => {
    const { client } = clientSimule({
      message: {
        subject: 'Votre site ne répond plus',
        content: 'Bonjour,',
        model: 'claude-opus-5',
        prompt_version: 'v3',
        created_at: '2026-09-05T11:58:00.000Z',
      },
      contact: { email: 'contact@artisan.fr', origin: 'saisie' },
      envoi: null,
    });

    const b = await fetchBrouillon(client, 'p-1');

    expect(b.objet).toBe('Votre site ne répond plus');
    expect(b.adresse).toBe('contact@artisan.fr');
    expect(b.origine).toBe('saisie');
    expect(b.modele).toBe('claude-opus-5');
    expect(b.envoi).toBeNull();
  });

  it('rend des absences nommées quand rien n’a été rédigé ni saisi', async () => {
    // LE DÉFAUT QUE CE TEST FERME. Renvoyer des chaînes vides ferait afficher
    // un objet vide et une adresse vide — indiscernables d'un mail rédigé mais
    // sans objet. L'absence doit rester `null` jusqu'à l'écran.
    const { client } = clientSimule({ message: null, contact: null, envoi: null });

    const b = await fetchBrouillon(client, 'p-1');

    expect(b.objet).toBeNull();
    expect(b.corps).toBeNull();
    expect(b.adresse).toBeNull();
    expect(b.origine).toBeNull();
  });

  it('distingue un objet absent d’un mail jamais rédigé', () => {
    // `subject` est nullable en base : un mail PEUT exister sans objet. Les
    // deux cas rendent `objet: null`, et c'est `corps` qui les sépare — sans
    // quoi l'écran ne saurait pas s'il faut proposer de rédiger ou de
    // compléter.
    return (async () => {
      const { client } = clientSimule({
        message: {
          subject: null,
          content: 'Bonjour,',
          model: 'claude-opus-5',
          prompt_version: 'v3',
          created_at: '2026-09-05T11:58:00.000Z',
        },
      });
      const b = await fetchBrouillon(client, 'p-1');
      expect(b.objet).toBeNull();
      expect(b.corps).toBe('Bonjour,');
    })();
  });

  it('rend l’envoi déjà tenté, qui interdit d’en proposer un second', async () => {
    const { client } = clientSimule({ envoi: { state: 'envoye' } });
    const b = await fetchBrouillon(client, 'p-1');
    expect(b.envoi).toEqual({ state: 'envoye' });
  });

  it('lit les trois tables, jamais une seule', async () => {
    const { client, tables } = clientSimule({});
    await fetchBrouillon(client, 'p-1');
    expect(tables).toContain('generated_message');
    expect(tables).toContain('prospect_contact');
    expect(tables).toContain('message_send');
  });
});
