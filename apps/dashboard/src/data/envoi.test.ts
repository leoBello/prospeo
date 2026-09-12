import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { enregistrerAdresse, envoyerMail, fetchBrouillon } from './envoi.js';

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

describe('enregistrerAdresse', () => {
  it('écrit l’adresse avec l’origine « saisie » — jamais « collecte »', async () => {
    // L'origine est un FAIT sur la provenance : une adresse tapée par un
    // humain et une adresse trouvée par un robot n'engagent pas la même chose
    // (D6). Rien dans ce lot ne collecte, donc rien n'écrit `collecte`.
    const appels: { valeurs?: unknown }[] = [];
    const client = {
      from: () => ({
        upsert: (valeurs: unknown) => {
          appels.push({ valeurs });
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient<Database>;

    const erreur = await enregistrerAdresse(client, 'p-1', '  contact@artisan.fr  ');

    expect(erreur).toBeNull();
    const v = appels[0]?.valeurs as Record<string, unknown>;
    expect(v.email).toBe('contact@artisan.fr');
    expect(v.origin).toBe('saisie');
  });

  it('rend le message d’écriture plutôt que de le taire', async () => {
    const client = {
      from: () => ({ upsert: () => Promise.resolve({ error: { message: 'RLS' } }) }),
    } as unknown as SupabaseClient<Database>;

    expect(await enregistrerAdresse(client, 'p-1', 'a@b.fr')).toBe('RLS');
  });
});

describe('envoyerMail', () => {
  function deps(surcharges: Record<string, unknown> = {}) {
    return {
      prendre: vi.fn(async () => ({ ok: true as const, id: 'ms-1' })),
      envoyer: vi.fn(async () => ({ ok: true as const, providerMessageId: 'g-1' })),
      clore: vi.fn(async () => null),
      echouer: vi.fn(async () => null),
      journaliser: vi.fn(async () => null),
      avancerFiche: vi.fn(async () => null),
      ...surcharges,
    };
  }
  const args = {
    prospectId: 'p-1',
    mail: { de: 'leo@gmail.com', a: 'contact@artisan.fr', objet: 'O', corps: 'C' },
  };

  it('enchaîne prise, envoi, clôture, journal et fiche — dans cet ordre', async () => {
    const ordre: string[] = [];
    const d = deps({
      prendre: vi.fn(async () => {
        ordre.push('prendre');
        return { ok: true as const, id: 'ms-1' };
      }),
      envoyer: vi.fn(async () => {
        ordre.push('envoyer');
        return { ok: true as const, providerMessageId: 'g-1' };
      }),
      clore: vi.fn(async () => {
        ordre.push('clore');
        return null;
      }),
      journaliser: vi.fn(async () => {
        ordre.push('journaliser');
        return null;
      }),
      avancerFiche: vi.fn(async () => {
        ordre.push('avancerFiche');
        return null;
      }),
    });

    const r = await envoyerMail(d, args);

    expect(r).toEqual({ ok: true });
    expect(ordre).toEqual(['prendre', 'envoyer', 'clore', 'journaliser', 'avancerFiche']);
  });

  it('n’appelle JAMAIS Gmail si la prise échoue — c’est l’index unique qui tranche', async () => {
    // LE DÉFAUT QUE CE TEST FERME. Appeler Gmail avant d'avoir pris la ligne
    // ferait partir un second mail au même artisan quand deux onglets cliquent.
    const d = deps({ prendre: vi.fn(async () => ({ ok: false as const, message: 'doublon' })) });
    const r = await envoyerMail(d, args);
    expect(r).toEqual({ ok: false, etape: 'prise', message: 'doublon' });
    expect(d.envoyer).not.toHaveBeenCalled();
  });

  it('marque l’envoi échoué quand Gmail refuse, et ne touche pas la fiche', async () => {
    const d = deps({
      envoyer: vi.fn(async () => ({
        ok: false as const,
        motif: 'jeton' as const,
        message: 'Gmail : 401',
      })),
    });
    const r = await envoyerMail(d, args);
    expect(r).toEqual({ ok: false, etape: 'gmail', message: expect.stringContaining('401') });
    expect(d.echouer).toHaveBeenCalledTimes(1);
    expect(d.avancerFiche).not.toHaveBeenCalled();
    // Ni journal ni fiche : rien n'est parti, rien ne doit le laisser croire.
    expect(d.journaliser).not.toHaveBeenCalled();
  });

  it('signale un mail PARTI dont la suite a échoué, sans prétendre à un échec d’envoi', async () => {
    // Le mail est chez l'artisan : dire « échec » ferait recliquer, et l'index
    // unique refuserait alors sans expliquer pourquoi.
    const d = deps({ avancerFiche: vi.fn(async () => 'écriture refusée') });
    const r = await envoyerMail(d, args);
    expect(r).toEqual({ ok: false, etape: 'suite', message: 'écriture refusée' });
  });

  it('distingue « suite » d’un échec de clôture, mail parti lui aussi', async () => {
    const d = deps({ clore: vi.fn(async () => 'clôture refusée') });
    const r = await envoyerMail(d, args);
    expect(r).toEqual({ ok: false, etape: 'suite', message: 'clôture refusée' });
    // La suite s'arrête : consigner un échange dont la trace d'envoi n'a pas
    // été close écrirait une fiche en avance sur la base.
    expect(d.journaliser).not.toHaveBeenCalled();
  });
});
