import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';

export interface Auth {
  /** `undefined` tant qu'on ne sait pas encore, `null` quand personne n'est connecté. */
  session: Session | null | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  /** Ouvre le flux OAuth Google avec le scope d'envoi. Redirige la page. */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

/**
 * État de session, tenu par Supabase Auth.
 *
 * Trois états et non deux : « on ne sait pas encore » est distinct de « pas
 * connecté ». Les confondre ferait clignoter l'écran de connexion à chaque
 * chargement, le temps que la session stockée soit relue — et donnerait
 * l'impression d'une déconnexion permanente.
 */
export function AuthProvider({
  client,
  children,
}: {
  client: SupabaseClient<Database>;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let vivant = true;

    void client.auth.getSession().then(({ data }) => {
      if (vivant) setSession(data.session);
    });

    // L'abonnement couvre aussi l'expiration du jeton et le rafraîchissement
    // automatique : sans lui, l'écran resterait affiché alors que les
    // requêtes échouent déjà en 401.
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      if (vivant) setSession(next);
    });

    return () => {
      vivant = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error !== null) throw error;
    },
    [client],
  );

  const signInWithGoogle = useCallback(async () => {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Le scope le plus etroit qui permette d'envoyer : il ne donne AUCUN
        // acces en lecture a la boite (§7.1 du spec).
        scopes: 'https://www.googleapis.com/auth/gmail.send',
        // `prompt: 'consent'` SANS `access_type: 'offline'`. Ce dernier ferait
        // rendre par Google un jeton de rafraichissement, que Supabase rangerait
        // dans la session stockee du navigateur — c'est-a-dire un identifiant
        // Google durable, ce que D5 exclut. Le jeton d'une heure est le prix
        // assume de cette decision.
        queryParams: { prompt: 'consent' },
      },
    });
    if (error !== null) throw error;
  }, [client]);

  const signOut = useCallback(async () => {
    await client.auth.signOut();
  }, [client]);

  const value = useMemo<Auth>(
    () => ({ session, signIn, signInWithGoogle, signOut }),
    [session, signIn, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth hors de AuthProvider.');
  return value;
}
