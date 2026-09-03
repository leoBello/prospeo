import type { VercelRequest, VercelResponse } from '@vercel/node';
import { construireRedirection } from '../src/connecter.js';
import { signerState } from '../src/state.js';
import { createClient } from '../src/supabase.js';
import { proprietaireExiste } from '../src/connexions.js';
import { loadRelaisConfig } from '../src/config.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const config = loadRelaisConfig(process.env);
  const client = createClient(config);

  const resultat = await construireRedirection(
    {
      proprietaireExiste: (ownerId) => proprietaireExiste(client, ownerId),
      signerState: (charge) => signerState(charge, config.oauthStateSecret),
    },
    { githubInstallUrl: config.githubInstallUrl, vercelInstallUrl: config.vercelInstallUrl },
    typeof req.query.plateforme === 'string' ? req.query.plateforme : undefined,
    typeof req.query.owner === 'string' ? req.query.owner : undefined,
  );

  if (!resultat.ok) {
    res.status(resultat.statut).send(resultat.raison);
    return;
  }
  res.redirect(302, resultat.url);
}
