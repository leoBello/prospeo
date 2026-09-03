import type { VercelRequest, VercelResponse } from '@vercel/node';
import { traiterRappelVercel } from '../../src/vercel-callback.js';
import { pageConfirmation } from '../../src/page.js';
import { verifierState } from '../../src/state.js';
import { createVercelOAuthClient } from '../../src/vercel-oauth.js';
import { createClient } from '../../src/supabase.js';
import { ecrireConnexionVercel } from '../../src/connexions.js';
import { loadRelaisConfig } from '../../src/config.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const config = loadRelaisConfig(process.env);
  const client = createClient(config);
  const vercelOAuth = createVercelOAuthClient({
    clientId: config.vercelOAuthClientId,
    clientSecret: config.vercelOAuthClientSecret,
  });

  const resultat = await traiterRappelVercel(
    {
      verifierState: (state) => verifierState(state, config.oauthStateSecret),
      echangerCode: (code, redirectUri) => vercelOAuth.echangerCode(code, redirectUri),
      ecrireConnexion: (ownerId, compteLibelle, scelle) =>
        ecrireConnexionVercel(client, ownerId, compteLibelle, scelle),
      cle: config.coffreCle,
      redirectUri: config.vercelRedirectUri,
    },
    {
      code: typeof req.query.code === 'string' ? req.query.code : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
    },
  );

  if (!resultat.ok) {
    // La raison précise reste ICI, dans les journaux du déploiement — jamais
    // dans la page rendue au navigateur (R5 du spec).
    console.error('rappel vercel échoué :', resultat.raison);
  }
  res.status(resultat.ok ? 200 : 400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
    pageConfirmation(resultat.ok),
  );
}
