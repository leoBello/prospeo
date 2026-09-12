import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { AuthProvider, useAuth } from './AuthProvider.js';

/**
 * Les arguments que `signInWithGoogle` passe à Supabase.
 *
 * Déclarés, et non inférés d'un `vi.fn()` sans paramètre : une espionne sans
 * signature rend un tuple d'arguments VIDE, et `mock.calls[0][0]` ne compile
 * pas — ou pire, se rattrape par un `as` qui rendrait l'assertion aveugle.
 */
interface ArgsOAuth {
  provider: string;
  options: { scopes?: string; queryParams?: Record<string, string> };
}

function espionOAuth() {
  return vi.fn(async (_args: ArgsOAuth) => ({ error: null as Error | null }));
}

/** Le client réduit à ce que `AuthProvider` appelle — le reste n'entre pas en jeu. */
function faussClient(signInWithOAuth: ReturnType<typeof espionOAuth>): SupabaseClient<Database> {
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ error: null }),
      signInWithOAuth,
      signOut: async () => ({ error: null }),
    },
  } as unknown as SupabaseClient<Database>;
}

function Sonde() {
  const { signInWithGoogle } = useAuth();
  return (
    <button type="button" onClick={() => void signInWithGoogle()}>
      google
    </button>
  );
}

describe('signInWithGoogle', () => {
  it('demande le scope d’envoi, et lui seul', async () => {
    // `gmail.send` ne donne AUCUN accès en lecture à la boîte (§7.1). Un scope
    // plus large ferait consentir l'utilisateur à davantage que ce que
    // l'application fait.
    const signInWithOAuth = espionOAuth();
    const user = userEvent.setup();

    render(
      <AuthProvider client={faussClient(signInWithOAuth)}>
        <Sonde />
      </AuthProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'google' }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    const args = signInWithOAuth.mock.calls[0]?.[0];
    expect(args?.provider).toBe('google');
    expect(args?.options.scopes).toBe('https://www.googleapis.com/auth/gmail.send');
  });

  it('ne demande JAMAIS access_type offline — D5 interdit tout identifiant Google durable', async () => {
    // LE DÉFAUT QUE CE TEST FERME, et il ne se verrait pas autrement : avec
    // `access_type: 'offline'`, Google rendrait un jeton de rafraîchissement
    // que Supabase rangerait dans la session stockée du navigateur. Tout
    // marcherait mieux — l'envoi cesserait d'expirer au bout d'une heure — et
    // c'est justement pour ça que la tentation est réelle. Rien à l'écran ne
    // dirait qu'un identifiant durable vient d'être posé là.
    const signInWithOAuth = espionOAuth();
    const user = userEvent.setup();

    render(
      <AuthProvider client={faussClient(signInWithOAuth)}>
        <Sonde />
      </AuthProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'google' }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    const args = signInWithOAuth.mock.calls[0]?.[0];
    // `toBeDefined` d'abord : sans lui, `args?.options` vaudrait `undefined`
    // et les deux assertions suivantes passeraient sans rien lire.
    expect(args).toBeDefined();
    expect(args?.options.queryParams).not.toHaveProperty('access_type');
    expect(JSON.stringify(args)).not.toContain('offline');
  });

  it('remonte l’échec plutôt que de le taire', async () => {
    const signInWithOAuth = espionOAuth();
    signInWithOAuth.mockResolvedValue({ error: new Error('provider disabled') });
    const user = userEvent.setup();
    const vu: string[] = [];

    function SondeQuiAttrape() {
      const { signInWithGoogle } = useAuth();
      return (
        <button
          type="button"
          onClick={() => {
            void signInWithGoogle().catch((cause: unknown) => {
              vu.push(cause instanceof Error ? cause.message : String(cause));
            });
          }}
        >
          google
        </button>
      );
    }

    render(
      <AuthProvider client={faussClient(signInWithOAuth)}>
        <SondeQuiAttrape />
      </AuthProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'google' }));

    await waitFor(() => expect(vu).toEqual(['provider disabled']));
  });
});
