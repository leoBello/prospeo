import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('lit une configuration complete', () => {
    const config = loadConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    });
    expect(config.supabaseUrl).toBe('https://x.supabase.co');
    expect(config.supabaseServiceRoleKey).toBe('secret');
  });

  it('echoue avec un message explicite si une variable manque', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it('refuse une URL invalide', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'pas-une-url', SUPABASE_SERVICE_ROLE_KEY: 'k' })).toThrow();
  });
});
