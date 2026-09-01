import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

const URL_VALIDE = 'https://abcdefghijklmnop.supabase.co';

/** Fabrique un JWT Supabase historique portant le rôle demandé. */
function jwtAvecRole(role: string): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role })}.signature`;
}

describe('readConfig', () => {
  it('accepte une cle publiable de la nouvelle generation', () => {
    const config = readConfig({
      VITE_SUPABASE_URL: URL_VALIDE,
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_AbCdEf0123456789',
    });
    expect(config.url).toBe(URL_VALIDE);
  });

  it('accepte un JWT anon historique', () => {
    const config = readConfig({
      VITE_SUPABASE_URL: URL_VALIDE,
      VITE_SUPABASE_ANON_KEY: jwtAvecRole('anon'),
    });
    expect(config.url).toBe(URL_VALIDE);
  });

  it('refuse une cle secrete de la nouvelle generation, qui contournerait RLS depuis le bundle public', () => {
    expect(() =>
      readConfig({
        VITE_SUPABASE_URL: URL_VALIDE,
        VITE_SUPABASE_ANON_KEY: 'sb_secret_AbCdEf0123456789',
      }),
    ).toThrow(/service_role|secr/i);
  });

  it('refuse un JWT service_role, dont rien dans l apparence ne le distingue d une cle anon', () => {
    expect(() =>
      readConfig({
        VITE_SUPABASE_URL: URL_VALIDE,
        VITE_SUPABASE_ANON_KEY: jwtAvecRole('service_role'),
      }),
    ).toThrow(/service_role/i);
  });

  it('nomme la variable manquante plutot que d echouer a la premiere requete', () => {
    expect(() => readConfig({ VITE_SUPABASE_URL: URL_VALIDE })).toThrow(/VITE_SUPABASE_ANON_KEY/);
    expect(() => readConfig({ VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' })).toThrow(
      /VITE_SUPABASE_URL/,
    );
  });

  it('refuse une URL qui n en est pas une', () => {
    expect(() =>
      readConfig({ VITE_SUPABASE_URL: 'abcdefg.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' }),
    ).toThrow(/VITE_SUPABASE_URL/);
  });
});
