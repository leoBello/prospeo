/**
 * L'API Gmail, réduite à l'envoi.
 *
 * Aucune bibliothèque cliente : une requête, un corps RFC 822. Même choix que
 * `sources/github.ts` côté collector — garder le contrôle exact des en-têtes.
 *
 * **L'appel part du navigateur** (D5) : le jeton est celui de la session, il
 * vit une heure, et rien de durable n'est stocké.
 */

const ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface MailAEnvoyer {
  de: string;
  a: string;
  objet: string;
  corps: string;
}

/** Base64 d'une suite d'octets UTF-8 — `btoa` ne sait pas encoder l'UTF-8 lui-même. */
function base64DUtf8(valeur: string): string {
  const octets = new TextEncoder().encode(valeur);
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire);
}

/**
 * Encode l'objet en mot-encodé MIME (RFC 2047).
 *
 * Un en-tête ne transporte que de l'ASCII : « Votre site ne répond plus »
 * envoyé tel quel arrive en mojibake — et c'est le premier mot que lit
 * l'artisan.
 */
function encoderEntete(valeur: string): string {
  return `=?UTF-8?B?${base64DUtf8(valeur)}?=`;
}

/** Le message complet, en base64url — la seule forme que l'API Gmail accepte. */
export function encoderMessage(mail: MailAEnvoyer): string {
  const lignes = [
    `From: ${mail.de}`,
    `To: ${mail.a}`,
    `Subject: ${encoderEntete(mail.objet)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    mail.corps,
  ];
  // base64url : « + » → « - », « / » → « _ », et pas de remplissage.
  return base64DUtf8(lignes.join('\r\n'))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export type ResultatEnvoiGmail =
  | { ok: true; providerMessageId: string }
  | { ok: false; motif: 'jeton' | 'quota' | 'echec'; message: string };

export function createGmailClient(options: { jeton: string; fetch?: typeof fetch }): {
  envoyer(mail: MailAEnvoyer): Promise<ResultatEnvoiGmail>;
} {
  const appeler = options.fetch ?? fetch;
  return {
    async envoyer(mail) {
      const reponse = await appeler(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.jeton}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoderMessage(mail) }),
      });

      if (reponse.ok) {
        const corps = (await reponse.json()) as { id: string };
        return { ok: true, providerMessageId: corps.id };
      }

      const detail = await reponse.text().catch(() => '');
      // Trois motifs, parce que trois remédiations : se reconnecter, attendre
      // demain, ou réessayer. Un « échec » unique les confondrait.
      //
      // Le message porte le statut et le détail de Google, jamais le jeton :
      // il finit dans `message_send.error`, donc en base et sous les yeux.
      if (reponse.status === 401) {
        return { ok: false, motif: 'jeton', message: `Gmail : ${reponse.status} — ${detail}` };
      }
      if (reponse.status === 429 || reponse.status === 403) {
        return { ok: false, motif: 'quota', message: `Gmail : ${reponse.status} — ${detail}` };
      }
      return { ok: false, motif: 'echec', message: `Gmail : ${reponse.status} — ${detail}` };
    },
  };
}
