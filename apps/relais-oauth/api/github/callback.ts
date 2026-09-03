import type { VercelRequest, VercelResponse } from '@vercel/node';
import { traiterRappelGithub } from '../../src/github-callback.js';
import { pageConfirmation } from '../../src/page.js';
import { verifierState } from '../../src/state.js';
import { createGithubAppClient } from '../../src/github.js';
import { createClient } from '../../src/supabase.js';
import { ecrireConnexionGithub } from '../../src/connexions.js';
import { loadRelaisConfig } from '../../src/config.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const config = loadRelaisConfig(process.env);
  const client = createClient(config);
  const githubApp = createGithubAppClient({ appId: config.githubAppId, clePrivee: config.githubAppPrivateKey });

  const resultat = await traiterRappelGithub(
    {
      verifierState: (state) => verifierState(state, config.oauthStateSecret),
      lireInstallation: (id) => githubApp.lireInstallation(id),
      ecrireConnexion: (ownerId, installationId, compteLibelle) =>
        ecrireConnexionGithub(client, ownerId, installationId, compteLibelle),
    },
    {
      installationId: typeof req.query.installation_id === 'string' ? req.query.installation_id : undefined,
      setupAction: typeof req.query.setup_action === 'string' ? req.query.setup_action : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
    },
  );

  if (!resultat.ok) {
    // La raison précise reste ICI, dans les journaux du déploiement — jamais
    // dans la page rendue au navigateur (R5 du spec).
    console.error('rappel github échoué :', resultat.raison);
  }
  res.status(resultat.ok ? 200 : 400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
    pageConfirmation(resultat.ok),
  );
}
