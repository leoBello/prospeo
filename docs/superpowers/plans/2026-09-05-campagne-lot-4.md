# Chantier n°7, lot 4 — Google, la saisie de l'adresse, et le premier vrai mail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qu'un vrai mail, relu à l'écran, parte du vrai compte Gmail du propriétaire vers un vrai artisan — et que la fiche du prospect le sache.

**Architecture :** La connexion Google passe par Supabase Auth (`signInWithOAuth`, scope `gmail.send`). L'envoi part **du navigateur**, avec le `provider_token` de la session — aucun identifiant Google durable n'est stocké nulle part (D5). Un panneau de relecture, déjà dessiné par la maquette, montre le destinataire et son origine, l'objet et le corps, puis envoie. L'adresse se saisit à la main : la mesure du 3 septembre a montré que l'étage automatique n'aurait presque rien à visiter.

**Spec :** [`2026-09-03-campagne-prospection-design.md`](../specs/2026-09-03-campagne-prospection-design.md) — D2, D4, D5, D6, §7, §12.1.

**Maquettes, qui gouvernent la mise en page :** `docs/design/maquettes/Campagne.dc.html` (panneau de relecture, lignes 392-500) et `CampagneEtats.dc.html` (les trois états du compte d'envoi, lignes 85-125). Ouvrables via `maquettes/rendu/` après `node docs/design/maquettes/aplatir.mjs`.

**Périmètre élargi d'un cran, et pourquoi.** Le spec livrait la saisie de l'adresse au lot 5, avec l'étage `contacts` automatique. Le §12.2 du spec a **mesuré** que cet étage n'aurait rien à visiter (109 prospects sur 139 n'ont ni site, ni réseau social) et conclut que la saisie manuelle est **le chemin principal**, pas le repli. Sans elle, ce lot ne peut être éprouvé qu'en insérant une ligne en base à la main : il enverrait un mail sans être utilisable pour prospecter. La saisie entre donc ici ; l'étage automatique n'est pas construit, conformément à la conclusion du §12.2.

---

## Global Constraints

- **Tout est en français** : code, commentaires, tests, documentation, et toute chaîne affichée.
- **Aucune chaîne affichée en dur** : tout passe par `t()`, avec sa clé dans `src/i18n/fr.ts` **et** `en.ts`. Une clé sans consommateur hors tests fait échouer la suite.
- **Aucune couleur en dur** : uniquement des `var(--…)` de `ui/theme.css`.
- **Imports en `.js`** même depuis un `.tsx` (ESM/NodeNext).
- **Le vocabulaire vient du kit** (`ui/kit/`) : on l'étend, on ne le double pas.
- **La couleur n'est jamais le seul indicateur d'un état** : tout badge porte un mot, toute pastille un `aria-label`.
- **Une absence se nomme, jamais elle ne se vide**, et des absences de natures différentes restent distinctes.
- **Écris le test d'abord**, vérifie qu'il échoue pour la bonne raison, et prouve que chaque assertion peut échouer.
- **N'écris jamais un test qui prétend voir une mise en page** : `jsdom` ne calcule ni largeur, ni hauteur, ni débordement. La maquette est le seul contrôle qui la voie.
- Pièges connus de cette suite : `getByText` compare le texte **entier du nœud** ; `queryByRole` filtre par défaut sur `hidden: false` ; `getAllByText` **lève** à zéro correspondance.
- **Le texte d'une assertion se lit dans `fr.ts`**, jamais ne s'invente.
- **Aucun secret ne s'écrit dans un test, un journal, un message d'erreur ou un commit.**

### Aucune migration dans ce lot

Les cinq tables nécessaires existent depuis le lot 0 : `prospect_contact` (avec son enum `contact_origin` = `'collecte' | 'saisie'`), `generated_message` (`subject`, `content`, `channel`, `model`, `prompt_version`), `message_send` (avec son index unique partiel `message_send_unique` sur `(prospect_id, channel) where state <> 'echoue'`), `interaction`, `pipeline_event`. **Ce plan n'écrit aucun SQL.**

### Prérequis manuel, déjà fait par le propriétaire

Projet Google Cloud créé, API Gmail activée, écran de consentement en **Testing** avec le propriétaire en test user, scope `https://www.googleapis.com/auth/gmail.send` déclaré, client OAuth « Web application » dont l'URI de redirection est `https://qrtnptlnmfmulgaxgmbm.supabase.co/auth/v1/callback`, et le couple Client ID / Client Secret posé dans Supabase → Authentication → Providers → Google.

**Deux limites connues, à ne jamais présenter comme des pannes :** en Testing, l'autorisation Google expire **7 jours** après le consentement ; et le `provider_token` vit environ une heure sans être renouvelé par Supabase.

### État de départ

`master` à `ce1d5c8`. Dashboard **548 tests / 47 fichiers**, collector **418 / 31**, `pnpm -r typecheck` vert sur les 8 paquets.

---

## File Structure

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `apps/dashboard/src/domain/envoi.ts` | décide : l'état du compte d'envoi, et si un envoi est possible — aucune I/O |
| `apps/dashboard/src/domain/envoi.test.ts` | — |
| `apps/dashboard/src/data/gmail.ts` | l'API Gmail : encodage RFC 822 et l'appel — `fetch` injectable |
| `apps/dashboard/src/data/gmail.test.ts` | — |
| `apps/dashboard/src/data/envoi.ts` | lit le brouillon d'un prospect, écrit l'adresse, exécute la séquence d'envoi |
| `apps/dashboard/src/data/envoi.test.ts` | — |
| `apps/dashboard/src/ui/panel/RelectureTab.tsx` | le panneau de relecture, tel que la maquette le dessine |
| `apps/dashboard/src/ui/panel/RelectureTab.module.css` | — |
| `apps/dashboard/src/ui/panel/RelectureTab.test.tsx` | — |

**Modifiés :**

| Fichier | Ce qui change |
|---|---|
| `apps/dashboard/src/auth/AuthProvider.tsx` | `signInWithGoogle`, et le `provider_token` exposé |
| `apps/dashboard/src/screens/LoginScreen.tsx` | le bouton « Continuer avec Google » |
| `apps/dashboard/src/ui/BandeConditions.tsx` | les trois états du compte d'envoi |
| `apps/dashboard/src/screens/CampagneScreen.tsx` | le panneau, et la ligne qui l'ouvre |
| `apps/dashboard/src/i18n/fr.ts` et `en.ts` | les clés de ce lot |
| `docs/design/HANDOFF.md` | la mesure du `provider_token`, et ce que ce lot laisse inerte |

---

## Tâche 1 : Le domaine de l'envoi

**Files:**
- Create: `apps/dashboard/src/domain/envoi.ts`
- Create: `apps/dashboard/src/domain/envoi.test.ts`

**Interfaces:**
- Produit : `type EtatCompteEnvoi = { etat: 'pret'; expediteur: string } | { etat: 'sans_jeton' } | { etat: 'jeton_expire'; expediteur: string }`, `etatCompteEnvoi(session: Session | null | undefined): EtatCompteEnvoi | null`, `type RefusEnvoi = 'compte' | 'adresse' | 'mail' | 'deja_envoye'`, `refusEnvoi(args): RefusEnvoi | null`.

> **Trois états et non deux, et c'est le cœur de cette tâche.** Le §7.1 du spec l'exige : « connecté avec jeton valide », « connecté sans jeton (session par mot de passe) » et « jeton expiré en cours de campagne » ont trois remédiations distinctes. Les replier sur « pas de jeton » ferait proposer « se reconnecter avec Google » à quelqu'un qui vient de le faire, et « se connecter » à quelqu'un déjà connecté.

- [ ] **Étape 1 : Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { etatCompteEnvoi, refusEnvoi } from './envoi.js';

/** Une session réduite à ce que `etatCompteEnvoi` lit — le reste n'entre pas dans sa décision. */
function session(surcharges: {
  providerToken?: string | null;
  provider?: string;
  email?: string;
}): Session {
  return {
    provider_token: surcharges.providerToken ?? null,
    user: {
      email: surcharges.email ?? 'leo@example.com',
      app_metadata: { provider: surcharges.provider ?? 'email' },
    },
  } as unknown as Session;
}

describe('etatCompteEnvoi', () => {
  it('rend null tant que la session n est pas connue — « on ne sait pas » n est pas « pas de compte »', () => {
    expect(etatCompteEnvoi(undefined)).toBeNull();
  });

  it('rend null quand personne n est connecté', () => {
    expect(etatCompteEnvoi(null)).toBeNull();
  });

  it('rend pret quand le jeton Google est là, avec l adresse qui enverra', () => {
    const r = etatCompteEnvoi(session({ providerToken: 'ya29.xxx', provider: 'google', email: 'leo@gmail.com' }));
    expect(r).toEqual({ etat: 'pret', expediteur: 'leo@gmail.com' });
  });

  it('rend sans_jeton pour une session ouverte par mot de passe', () => {
    // LE DEFAUT QUE CE TEST FERME. Confondu avec `jeton_expire`, l ecran
    // proposerait « se reconnecter et reprendre » a quelqu un qui n a jamais
    // ouvert de session Google — une remediation qui ne remedie a rien.
    expect(etatCompteEnvoi(session({ providerToken: null, provider: 'email' }))).toEqual({
      etat: 'sans_jeton',
    });
  });

  it('rend jeton_expire pour une session Google dont le jeton a disparu', () => {
    const r = etatCompteEnvoi(session({ providerToken: null, provider: 'google', email: 'leo@gmail.com' }));
    expect(r).toEqual({ etat: 'jeton_expire', expediteur: 'leo@gmail.com' });
  });
});

describe('refusEnvoi', () => {
  const complet = {
    compte: { etat: 'pret', expediteur: 'leo@gmail.com' } as const,
    adresse: 'contact@artisan.fr',
    objet: 'Votre site',
    corps: 'Bonjour,',
    envoiExistant: null,
  };

  it('ne refuse rien quand tout est là', () => {
    expect(refusEnvoi(complet)).toBeNull();
  });

  it('refuse sans compte d envoi utilisable', () => {
    expect(refusEnvoi({ ...complet, compte: { etat: 'sans_jeton' } })).toBe('compte');
  });

  it('refuse sans adresse — l absence, pas une chaîne vide', () => {
    expect(refusEnvoi({ ...complet, adresse: null })).toBe('adresse');
  });

  it('refuse quand aucun mail n a été rédigé', () => {
    expect(refusEnvoi({ ...complet, objet: null, corps: null })).toBe('mail');
  });

  it('refuse un prospect à qui le mail est déjà parti', () => {
    // La garantie vit dans l index unique partiel de `message_send` ; cette
    // regle-ci ne fait qu eviter de PROPOSER un geste que la base refusera.
    expect(refusEnvoi({ ...complet, envoiExistant: { state: 'envoye' } })).toBe('deja_envoye');
  });

  it('n empêche pas de réessayer un envoi qui a échoué', () => {
    expect(refusEnvoi({ ...complet, envoiExistant: { state: 'echoue' } })).toBeNull();
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/dashboard test -- envoi`
Expected: échec — `./envoi.js` n'existe pas.

- [ ] **Étape 3 : Écrire `domain/envoi.ts`**

```ts
import type { Session } from '@supabase/supabase-js';
import type { Enums } from '@prospeo/db';

/**
 * L'état du compte d'envoi — TROIS valeurs, et le §7.1 du spec l'exige.
 *
 * « Connecté par mot de passe » et « jeton expiré » se ressemblent (aucun
 * jeton en main) et n'appellent pas la même phrase : le premier n'a jamais
 * ouvert de session Google, le second l'a fait et l'a perdue. Leur
 * remédiation diffère donc, et `CampagneEtats.dc.html` les dessine
 * séparément.
 *
 * `null` est un QUATRIÈME cas, distinct des trois : on ne sait pas encore, ou
 * personne n'est connecté. Le replier sur `sans_jeton` ferait clignoter
 * « aucun compte d'envoi » à chaque chargement.
 */
export type EtatCompteEnvoi =
  | { etat: 'pret'; expediteur: string }
  | { etat: 'sans_jeton' }
  | { etat: 'jeton_expire'; expediteur: string };

export function etatCompteEnvoi(session: Session | null | undefined): EtatCompteEnvoi | null {
  if (session === null || session === undefined) return null;

  const expediteur = session.user.email ?? '';
  // `provider_token` n'existe que juste après l'échange OAuth : Supabase ne le
  // renouvelle pas, et il disparaît au premier rafraîchissement de la session.
  if (typeof session.provider_token === 'string' && session.provider_token !== '') {
    return { etat: 'pret', expediteur };
  }

  // `app_metadata.provider` garde la trace du fournisseur qui a ouvert la
  // session, même une fois le jeton perdu : c'est LUI qui distingue les deux
  // absences.
  const fournisseur = (session.user.app_metadata as { provider?: string }).provider;
  return fournisseur === 'google' ? { etat: 'jeton_expire', expediteur } : { etat: 'sans_jeton' };
}

/** Ce qui manque pour qu'un envoi soit possible — `null` quand rien ne manque. */
export type RefusEnvoi = 'compte' | 'adresse' | 'mail' | 'deja_envoye';

/**
 * Décide si le geste « Envoyer » a un sens, et nomme ce qui manque sinon.
 *
 * **Ne remplace pas la garantie.** L'unicité d'un envoi vit dans l'index
 * partiel `message_send_unique`, en base : cette fonction évite de PROPOSER
 * un geste que la base refuserait, elle ne le garantit pas. Un écran ouvert
 * depuis dix minutes peut se tromper ; la base, non.
 */
export function refusEnvoi(args: {
  compte: EtatCompteEnvoi | null;
  adresse: string | null;
  objet: string | null;
  corps: string | null;
  envoiExistant: { state: Enums<'send_state'> } | null;
}): RefusEnvoi | null {
  if (args.compte === null || args.compte.etat !== 'pret') return 'compte';
  if (args.adresse === null || args.adresse.trim() === '') return 'adresse';
  if (args.objet === null || args.corps === null) return 'mail';
  // `echoue` est le seul état rejouable — le même critère que l'index partiel.
  if (args.envoiExistant !== null && args.envoiExistant.state !== 'echoue') return 'deja_envoye';
  return null;
}
```

- [ ] **Étape 4 : Lancer, vérifier que ça passe**

Run: `pnpm --filter @prospeo/dashboard test -- envoi`
Expected: les douze tests passent.

- [ ] **Étape 5 : Commit**

```bash
git add apps/dashboard/src/domain/envoi.ts apps/dashboard/src/domain/envoi.test.ts
git commit -m "feat(envoi): les trois etats du compte d envoi, et ce qui empeche un envoi"
```

---

## Tâche 2 : Le client Gmail

**Files:**
- Create: `apps/dashboard/src/data/gmail.ts`
- Create: `apps/dashboard/src/data/gmail.test.ts`

**Interfaces:**
- Produit : `interface MailAEnvoyer { de: string; a: string; objet: string; corps: string }`, `encoderMessage(mail: MailAEnvoyer): string` (RFC 822 en base64url), `type ResultatEnvoiGmail = { ok: true; providerMessageId: string } | { ok: false; motif: 'jeton' | 'quota' | 'echec'; message: string }`, `createGmailClient(options: { jeton: string; fetch?: typeof fetch }): { envoyer(mail: MailAEnvoyer): Promise<ResultatEnvoiGmail> }`.

> **L'objet doit être encodé, et c'est un piège réel.** « Votre site ne répond plus » porte des accents ; un en-tête `Subject:` en UTF-8 brut est hors RFC 822 et s'affiche en mojibake chez le destinataire. L'encodage en mot-encodé MIME (`=?UTF-8?B?…?=`) n'est pas un raffinement : c'est ce qui décide si le premier vrai mail est lisible.

- [ ] **Étape 1 : Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { createGmailClient, encoderMessage } from './gmail.js';

const MAIL = {
  de: 'leo@gmail.com',
  a: 'contact@artisan.fr',
  objet: 'Votre site ne répond plus',
  corps: 'Bonjour,\n\nJ’ai vu que votre site ne répondait plus.\n\nLéo',
};

/** Décode le base64url que `encoderMessage` produit, pour lire ce qui partira. */
function decoder(base64url: string): string {
  return Buffer.from(base64url, 'base64url').toString('utf8');
}

describe('encoderMessage', () => {
  it('produit un base64url, jamais un base64 standard', () => {
    // L API Gmail refuse le base64 standard : `+` et `/` y sont invalides, et
    // le remplissage `=` casse l URL.
    const encode = encoderMessage(MAIL);
    expect(encode).not.toMatch(/[+/=]/);
  });

  it('encode l objet accentué en mot-encodé MIME, jamais en UTF-8 brut', () => {
    // LE DEFAUT QUE CE TEST FERME. Un `Subject:` accentué envoye tel quel
    // arrive en mojibake — et c est le premier mot que lit l artisan.
    const brut = decoder(encoderMessage(MAIL));
    expect(brut).toContain('Subject: =?UTF-8?B?');
    expect(brut).not.toContain('Subject: Votre site ne répond plus');
  });

  it('porte l expéditeur, le destinataire et le corps intact', () => {
    const brut = decoder(encoderMessage(MAIL));
    expect(brut).toContain('From: leo@gmail.com');
    expect(brut).toContain('To: contact@artisan.fr');
    // Les sauts de ligne sont signifiants : la maquette dit que la ligne
    // isolee qui porte l URL EST l argument.
    expect(brut).toContain('J’ai vu que votre site ne répondait plus.');
  });

  it('déclare un corps UTF-8, sans quoi les accents du corps se perdent aussi', () => {
    const brut = decoder(encoderMessage(MAIL));
    expect(brut).toContain('Content-Type: text/plain; charset="UTF-8"');
  });
});

describe('createGmailClient — envoyer', () => {
  function fausseReponse(status: number, corps: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(corps),
      json: async () => corps,
    } as unknown as Response;
  }

  it('appelle l API Gmail en Bearer et rend l identifiant du message', async () => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const fausseFetch = (async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      return fausseReponse(200, { id: '18f2c0a' });
    }) as unknown as typeof fetch;

    const client = createGmailClient({ jeton: 'ya29.xxx', fetch: fausseFetch });
    const r = await client.envoyer(MAIL);

    expect(r).toEqual({ ok: true, providerMessageId: '18f2c0a' });
    expect(appels[0]?.url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(appels[0]?.init?.method).toBe('POST');
    const entetes = appels[0]?.init?.headers as Record<string, string>;
    expect(entetes.Authorization).toBe('Bearer ya29.xxx');
  });

  it('nomme « jeton » un 401 — le cas que l écran doit savoir remédier', async () => {
    const fausseFetch = (async () => fausseReponse(401, { error: { message: 'Invalid Credentials' } })) as unknown as typeof fetch;
    const client = createGmailClient({ jeton: 'perime', fetch: fausseFetch });
    const r = await client.envoyer(MAIL);
    expect(r).toEqual({ ok: false, motif: 'jeton', message: expect.any(String) });
  });

  it('nomme « quota » un 429 — le plafond quotidien, pas une panne', async () => {
    const fausseFetch = (async () => fausseReponse(429, { error: { message: 'Rate Limit Exceeded' } })) as unknown as typeof fetch;
    const client = createGmailClient({ jeton: 'ya29.xxx', fetch: fausseFetch });
    const r = await client.envoyer(MAIL);
    expect((r as { motif: string }).motif).toBe('quota');
  });

  it('nomme « echec » tout le reste, en gardant le statut dans le message', async () => {
    const fausseFetch = (async () => fausseReponse(500, { error: { message: 'Backend Error' } })) as unknown as typeof fetch;
    const client = createGmailClient({ jeton: 'ya29.xxx', fetch: fausseFetch });
    const r = await client.envoyer(MAIL);
    expect(r).toEqual({ ok: false, motif: 'echec', message: expect.stringContaining('500') });
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/dashboard test -- gmail`
Expected: échec — `./gmail.js` n'existe pas.

- [ ] **Étape 3 : Écrire `data/gmail.ts`**

```ts
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

/**
 * Encode l'objet en mot-encodé MIME (RFC 2047).
 *
 * Un en-tête ne transporte que de l'ASCII : « Votre site ne répond plus »
 * envoyé tel quel arrive en mojibake. `btoa` ne sait pas encoder de l'UTF-8
 * directement — d'où le passage par `TextEncoder`.
 */
function encoderEntete(valeur: string): string {
  const octets = new TextEncoder().encode(valeur);
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return `=?UTF-8?B?${btoa(binaire)}?=`;
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
  const octets = new TextEncoder().encode(lignes.join('\r\n'));
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  // base64url : `+` → `-`, `/` → `_`, et pas de remplissage.
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
```

- [ ] **Étape 4 : Lancer, vérifier que ça passe**

Run: `pnpm --filter @prospeo/dashboard test -- gmail`
Expected: les huit tests passent.

- [ ] **Étape 5 : Commit**

```bash
git add apps/dashboard/src/data/gmail.ts apps/dashboard/src/data/gmail.test.ts
git commit -m "feat(gmail): l envoi, avec l objet encode en MIME plutot qu en UTF-8 brut"
```

---

## Tâche 3 : La connexion Google

**Files:**
- Modify: `apps/dashboard/src/auth/AuthProvider.tsx`
- Modify: `apps/dashboard/src/screens/LoginScreen.tsx`
- Modify: `apps/dashboard/src/i18n/fr.ts` et `en.ts`
- Test: `apps/dashboard/src/screens/LoginScreen.test.tsx` (existant, à étendre)

**Interfaces:**
- Produit : `Auth` gagne `signInWithGoogle: () => Promise<void>`.

> **`access_type: 'offline'` est délibérément ABSENT.** Il ferait rendre par Google un `provider_refresh_token`, que Supabase rangerait dans la session stockée du navigateur — c'est-à-dire un identifiant Google durable, exactement ce que D5 exclut (« Aucun identifiant Google durable n'est stocké nulle part »). S'en servir exigerait de toute façon le `client_secret`, donc un serveur, que ce lot n'a pas. Le jeton d'une heure est le prix assumé de cette décision.

- [ ] **Étape 1 : Étendre le test de `LoginScreen`**

Ajouter à `apps/dashboard/src/screens/LoginScreen.test.tsx` (garder l'existant intact) :

```ts
it('propose la connexion Google, en plus du mot de passe', async () => {
  // D4 : le compte par mot de passe DOIT continuer de fonctionner — une panne
  // du fournisseur ne doit pas fermer l application.
  const signInWithGoogle = vi.fn(async () => {});
  rendreLoginScreen({ signInWithGoogle });

  const bouton = screen.getByRole('button', { name: fr['login.google'] });
  await userEvent.click(bouton);

  expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  // Le formulaire mot de passe reste : les deux coexistent.
  expect(screen.getByLabelText(fr['login.email'])).toBeInTheDocument();
});
```

L'implémenteur adapte `rendreLoginScreen` (ou l'équivalent déjà présent dans ce fichier) pour injecter un `signInWithGoogle` dans le contexte d'authentification, sur le modèle de la manière dont `signIn` y est déjà injecté. **Lire le fichier existant avant d'écrire** : les noms exacts du helper et des clés `login.*` s'y trouvent, et les clés d'assertion se lisent dans `fr.ts`, jamais ne s'inventent.

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/dashboard test -- LoginScreen`
Expected: échec — la clé `login.google` n'existe pas et aucun bouton ne la porte.

- [ ] **Étape 3 : Ajouter les clés**

Dans `apps/dashboard/src/i18n/fr.ts`, près des autres clés `login.*` :

```ts
  'login.google': 'Continuer avec Google',
  'login.googleAide': 'Nécessaire pour envoyer les mails depuis votre compte.',
```

Dans `apps/dashboard/src/i18n/en.ts`, au même endroit :

```ts
  'login.google': 'Continue with Google',
  'login.googleAide': 'Required to send emails from your account.',
```

- [ ] **Étape 4 : Écrire `signInWithGoogle`**

Dans `apps/dashboard/src/auth/AuthProvider.tsx`, ajouter au type `Auth` :

```ts
  /** Ouvre le flux OAuth Google avec le scope d'envoi. Redirige la page. */
  signInWithGoogle: () => Promise<void>;
```

et, à côté de `signIn` :

```ts
  const signInWithGoogle = useCallback(async () => {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Le scope le plus étroit qui permette d'envoyer : il ne donne AUCUN
        // accès en lecture à la boîte (§7.1 du spec).
        scopes: 'https://www.googleapis.com/auth/gmail.send',
        // `prompt: 'consent'` sans `access_type: 'offline'` : on redemande le
        // consentement à chaque fois SANS obtenir de jeton de rafraîchissement
        // durable — voir la note de la Tâche 3 du plan.
        queryParams: { prompt: 'consent' },
      },
    });
    if (error !== null) throw error;
  }, [client]);
```

puis inclure `signInWithGoogle` dans le `useMemo` de `value` et dans son tableau de dépendances.

- [ ] **Étape 5 : Ajouter le bouton dans `LoginScreen`**

Lire `apps/dashboard/src/screens/LoginScreen.tsx`, puis ajouter le bouton sous le formulaire existant. **Le kit ne porte PAS de composant bouton** (`ui/kit/` = `Badge`, `StatusBadge`, `Tooltip`, `Card`, `EmptyState`, `Bientot`) : reprendre le `<button>` et la classe de module CSS que ce fichier emploie déjà pour sa soumission, sans inventer un second dialecte. Le libellé vient de `t('login.google')`, l'aide de `t('login.googleAide')`. Le formulaire mot de passe reste inchangé.

- [ ] **Étape 6 : Lancer, vérifier que ça passe**

Run: `pnpm --filter @prospeo/dashboard test -- LoginScreen`
Expected: le nouveau test passe, les tests existants de `LoginScreen` aussi.

- [ ] **Étape 7 : Suite complète et typecheck**

Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`
Expected: tout vert. Le test de parité `i18n` doit passer : les deux clés existent dans `fr` et `en`, et ont un consommateur hors test.

- [ ] **Étape 8 : Commit**

```bash
git add apps/dashboard/src/auth/AuthProvider.tsx apps/dashboard/src/screens/LoginScreen.tsx apps/dashboard/src/screens/LoginScreen.test.tsx apps/dashboard/src/i18n/fr.ts apps/dashboard/src/i18n/en.ts
git commit -m "feat(auth): continuer avec Google, scope gmail.send, sans jeton durable"
```

---

## Tâche 4 : Les trois états du compte d'envoi à l'écran

**Files:**
- Modify: `apps/dashboard/src/ui/BandeConditions.tsx`
- Modify: `apps/dashboard/src/ui/BandeConditions.test.tsx`
- Modify: `apps/dashboard/src/i18n/fr.ts` et `en.ts`

**Interfaces:**
- Consomme : `etatCompteEnvoi` (Tâche 1), `signInWithGoogle` (Tâche 3).

> **La maquette gouverne** : `CampagneEtats.dc.html` lignes 85-125 dessine les deux états dégradés, avec leur phrase et leur remédiation. Les textes ci-dessous en sont la transposition ; **ne pas les réinventer**, et ne pas inventer de troisième formulation pour `pret`.

- [ ] **Étape 1 : Ajouter les clés**

Dans `fr.ts` :

```ts
  'campagne.envoi.titre': 'Envoi',
  'campagne.envoi.pret': 'Le mail partira de {expediteur}.',
  'campagne.envoi.sansJeton': 'Aucun compte d’envoi',
  'campagne.envoi.sansJetonDetail':
    'Session ouverte par mot de passe. Le déploiement et la rédaction fonctionnent ; l’envoi, non.',
  'campagne.envoi.sansJetonAide':
    'Envoyer demande un jeton Google, qui ne s’obtient qu’à la connexion. Déployer et rédiger restent disponibles d’ici là.',
  'campagne.envoi.expire': 'Jeton expiré',
  'campagne.envoi.expireDetail':
    'Le jeton d’envoi vit une heure et ne se renouvelle pas seul. Se reconnecter reprend la campagne où elle s’est arrêtée.',
  'campagne.envoi.reconnecter': 'Se reconnecter avec Google',
```

Dans `en.ts`, les mêmes clés traduites.

- [ ] **Étape 2 : Écrire le test qui échoue**

Ajouter à `apps/dashboard/src/ui/BandeConditions.test.tsx` (lire le fichier d'abord pour reprendre son helper de rendu) :

```ts
it('nomme l absence de compte d envoi, sans la confondre avec un jeton expiré', () => {
  rendreBande({ compteEnvoi: { etat: 'sans_jeton' } });
  expect(screen.getByText(fr['campagne.envoi.sansJeton'])).toBeInTheDocument();
  expect(screen.queryByText(fr['campagne.envoi.expire'])).not.toBeInTheDocument();
});

it('nomme le jeton expiré, et propose de se reconnecter', () => {
  rendreBande({ compteEnvoi: { etat: 'jeton_expire', expediteur: 'leo@gmail.com' } });
  expect(screen.getByText(fr['campagne.envoi.expire'])).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: fr['campagne.envoi.reconnecter'] }),
  ).toBeInTheDocument();
});

it('ne propose aucune remédiation quand le compte est prêt', () => {
  rendreBande({ compteEnvoi: { etat: 'pret', expediteur: 'leo@gmail.com' } });
  expect(
    screen.queryByRole('button', { name: fr['campagne.envoi.reconnecter'] }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Étape 3 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/dashboard test -- BandeConditions`
Expected: échec — la bande ne connaît pas encore `compteEnvoi`.

- [ ] **Étape 4 : Rendre les trois états**

Lire `apps/dashboard/src/ui/BandeConditions.tsx`, puis ajouter une condition « Envoi » à côté de celle du worker déjà présente. Elle prend `compteEnvoi: EtatCompteEnvoi | null` en propriété et `onReconnecter: () => void`.

Règles à respecter, toutes déjà écrites dans les guidelines :
- `null` ne rend **rien** : « on ne sait pas encore » ne s'affiche pas comme une panne ;
- chaque état porte **un mot**, pas seulement une couleur (badge du kit, `Badge`) ;
- `pret` affiche `t('campagne.envoi.pret', { expediteur })` et **aucun bouton** ;
- `sans_jeton` et `jeton_expire` portent chacun leur détail et le bouton de reconnexion, qui appelle `onReconnecter`.

- [ ] **Étape 5 : Lancer, vérifier que ça passe**

Run: `pnpm --filter @prospeo/dashboard test -- BandeConditions`
Expected: les trois nouveaux tests passent, les existants aussi.

- [ ] **Étape 6 : Commit**

```bash
git add apps/dashboard/src/ui/BandeConditions.tsx apps/dashboard/src/ui/BandeConditions.test.tsx apps/dashboard/src/i18n/fr.ts apps/dashboard/src/i18n/en.ts
git commit -m "feat(campagne): les trois etats du compte d envoi dans la bande"
```

---

## Tâche 5 : Lire le brouillon d'un prospect

**Files:**
- Create: `apps/dashboard/src/data/envoi.ts`
- Create: `apps/dashboard/src/data/envoi.test.ts`
- Modify: `apps/dashboard/src/data/campagne.ts` (le `select` gagne trois colonnes)

**Interfaces:**
- Produit : `interface Brouillon { objet: string | null; corps: string | null; modele: string | null; consignes: string | null; redigeLe: string | null; adresse: string | null; origine: Enums<'contact_origin'> | null; envoi: { state: Enums<'send_state'> } | null }`, `fetchBrouillon(client, prospectId): Promise<Brouillon>`.

- [ ] **Étape 1 : Écrire le test qui échoue**

```ts
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

  it('rend des absences nommées quand rien n a été rédigé ni saisi', async () => {
    // LE DEFAUT QUE CE TEST FERME. Renvoyer des chaines vides ferait afficher
    // un objet vide et une adresse vide — indiscernables d un mail redige mais
    // sans objet. L absence doit rester `null` jusqu a l ecran.
    const { client } = clientSimule({ message: null, contact: null, envoi: null });

    const b = await fetchBrouillon(client, 'p-1');

    expect(b.objet).toBeNull();
    expect(b.corps).toBeNull();
    expect(b.adresse).toBeNull();
    expect(b.origine).toBeNull();
  });

  it('lit les trois tables, jamais une seule', async () => {
    const { client, tables } = clientSimule({});
    await fetchBrouillon(client, 'p-1');
    expect(tables).toContain('generated_message');
    expect(tables).toContain('prospect_contact');
    expect(tables).toContain('message_send');
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/dashboard test -- data/envoi`
Expected: échec — `./envoi.js` n'existe pas dans `data/`.

- [ ] **Étape 3 : Écrire `fetchBrouillon`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';

type Client = SupabaseClient<Database>;

/**
 * Ce que le panneau de relecture a besoin de savoir sur UN prospect.
 *
 * Toutes les absences restent `null` — jamais `''`. Un objet vide et un mail
 * jamais rédigé sont deux faits différents, et l'écran doit pouvoir le dire.
 */
export interface Brouillon {
  objet: string | null;
  corps: string | null;
  modele: string | null;
  consignes: string | null;
  redigeLe: string | null;
  adresse: string | null;
  origine: Enums<'contact_origin'> | null;
  envoi: { state: Enums<'send_state'> } | null;
}

/**
 * Trois lectures et non une jointure : les trois tables n'ont pas la même
 * cardinalité (un mail par canal, un contact par prospect, N envois), et
 * PostgREST plafonne les relations embarquées — un plafond silencieux ferait
 * passer un envoi existant pour une absence.
 *
 * La RLS borne chaque lecture au propriétaire : aucun filtre explicite ici,
 * comme partout ailleurs dans `data/`.
 */
export async function fetchBrouillon(client: Client, prospectId: string): Promise<Brouillon> {
  const { data: message, error: erreurMessage } = await client
    .from('generated_message')
    .select('subject,content,model,prompt_version,created_at')
    .eq('prospect_id', prospectId)
    .eq('channel', 'email')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erreurMessage !== null) throw new Error(erreurMessage.message);

  const { data: contact, error: erreurContact } = await client
    .from('prospect_contact')
    .select('email,origin')
    .eq('prospect_id', prospectId)
    .maybeSingle();
  if (erreurContact !== null) throw new Error(erreurContact.message);

  const { data: envoi, error: erreurEnvoi } = await client
    .from('message_send')
    .select('state')
    .eq('prospect_id', prospectId)
    .eq('channel', 'email')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erreurEnvoi !== null) throw new Error(erreurEnvoi.message);

  return {
    objet: message?.subject ?? null,
    corps: message?.content ?? null,
    modele: message?.model ?? null,
    consignes: message?.prompt_version ?? null,
    redigeLe: message?.created_at ?? null,
    adresse: contact?.email ?? null,
    origine: contact?.origin ?? null,
    envoi: envoi === null ? null : { state: envoi.state },
  };
}
```

- [ ] **Étape 4 : Lancer, vérifier que ça passe**

Run: `pnpm --filter @prospeo/dashboard test -- data/envoi`
Expected: les trois tests passent.

- [ ] **Étape 5 : Commit**

```bash
git add apps/dashboard/src/data/envoi.ts apps/dashboard/src/data/envoi.test.ts
git commit -m "feat(envoi): lire le brouillon d un prospect, absences comprises"
```

---

## Tâche 6 : Écrire l'adresse, et la séquence d'envoi

**Files:**
- Modify: `apps/dashboard/src/data/envoi.ts`
- Modify: `apps/dashboard/src/data/envoi.test.ts`

**Interfaces:**
- Consomme : `createGmailClient` (Tâche 2), `journaliserInteraction` et `definirStatut` (`data/mutations.ts`, existants).
- Produit : `enregistrerAdresse(client, prospectId, email): Promise<string | null>`, `type ResultatEnvoi = { ok: true } | { ok: false; etape: 'prise' | 'gmail' | 'suite'; message: string }`, `envoyerMail(deps, args): Promise<ResultatEnvoi>`.

> **L'ordre du §7.2 du spec n'est pas négociable** : (1) écrire `message_send` en `en_cours` — c'est là que l'index unique tranche, pas plus tard ; (2) appeler Gmail ; (3) passer en `envoye` avec le `provider_message_id` ; (4) consigner l'échange et faire avancer la fiche **par les fonctions qui existent déjà**. L'étape 4 échouée laisse un mail parti et une fiche en retard : elle doit s'afficher, jamais se taire.

- [ ] **Étape 1 : Écrire les tests qui échouent**

```ts
import { enregistrerAdresse, envoyerMail } from './envoi.js';
import { vi } from 'vitest';

describe('enregistrerAdresse', () => {
  it('écrit l adresse avec l origine « saisie » — jamais « collecte »', async () => {
    // L origine est un FAIT sur la provenance : une adresse tapee par un
    // humain et une adresse trouvee par un robot n engagent pas la meme chose
    // (D6). Rien dans ce lot ne collecte, donc rien n ecrit `collecte`.
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
      prendre: vi.fn(async () => { ordre.push('prendre'); return { ok: true as const, id: 'ms-1' }; }),
      envoyer: vi.fn(async () => { ordre.push('envoyer'); return { ok: true as const, providerMessageId: 'g-1' }; }),
      clore: vi.fn(async () => { ordre.push('clore'); return null; }),
      journaliser: vi.fn(async () => { ordre.push('journaliser'); return null; }),
      avancerFiche: vi.fn(async () => { ordre.push('avancerFiche'); return null; }),
    });

    const r = await envoyerMail(d, args);

    expect(r).toEqual({ ok: true });
    expect(ordre).toEqual(['prendre', 'envoyer', 'clore', 'journaliser', 'avancerFiche']);
  });

  it('n appelle JAMAIS Gmail si la prise échoue — c est l index unique qui tranche', async () => {
    // LE DEFAUT QUE CE TEST FERME. Appeler Gmail avant d avoir pris la ligne
    // ferait partir un second mail au meme artisan quand deux onglets cliquent.
    const d = deps({ prendre: vi.fn(async () => ({ ok: false as const, message: 'doublon' })) });
    const r = await envoyerMail(d, args);
    expect(r).toEqual({ ok: false, etape: 'prise', message: expect.any(String) });
    expect(d.envoyer).not.toHaveBeenCalled();
  });

  it('marque l envoi échoué quand Gmail refuse, et ne touche pas la fiche', async () => {
    const d = deps({ envoyer: vi.fn(async () => ({ ok: false as const, motif: 'jeton' as const, message: 'Gmail : 401' })) });
    const r = await envoyerMail(d, args);
    expect(r).toEqual({ ok: false, etape: 'gmail', message: expect.stringContaining('401') });
    expect(d.echouer).toHaveBeenCalledTimes(1);
    expect(d.avancerFiche).not.toHaveBeenCalled();
  });

  it('signale un mail PARTI dont la suite a échoué, sans prétendre à un échec d envoi', async () => {
    // Le mail est chez l artisan : dire « echec » ferait recliquer, et
    // l index unique refuserait alors sans expliquer pourquoi.
    const d = deps({ avancerFiche: vi.fn(async () => 'ecriture refusée') });
    const r = await envoyerMail(d, args);
    expect(r).toEqual({ ok: false, etape: 'suite', message: expect.any(String) });
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/dashboard test -- data/envoi`
Expected: échec — `enregistrerAdresse` et `envoyerMail` ne sont pas exportés.

- [ ] **Étape 3 : Écrire les deux fonctions**

Ajouter à `apps/dashboard/src/data/envoi.ts` :

```ts
/**
 * Écrit l'adresse saisie à la main.
 *
 * `origin: 'saisie'`, toujours : rien dans ce lot ne collecte d'adresse. Le
 * §12.2 du spec a mesuré que l'étage automatique n'aurait presque rien à
 * visiter (109 prospects sur 139 sans aucune présence web), et conclut de ne
 * pas le construire. Écrire `collecte` ici mentirait sur la provenance.
 */
export async function enregistrerAdresse(
  client: Client,
  prospectId: string,
  email: string,
): Promise<string | null> {
  const { error } = await client.from('prospect_contact').upsert(
    {
      prospect_id: prospectId,
      email: email.trim(),
      origin: 'saisie',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prospect_id' },
  );
  return error === null ? null : error.message;
}

/** Ce que `envoyerMail` a besoin de faire, sans savoir comment. */
export interface EnvoiDeps {
  /** Écrit `message_send` en `en_cours`. L'index unique tranche ICI. */
  prendre(prospectId: string, destinataire: string): Promise<{ ok: true; id: string } | { ok: false; message: string }>;
  envoyer(mail: MailAEnvoyer): Promise<ResultatEnvoiGmail>;
  clore(envoiId: string, providerMessageId: string): Promise<string | null>;
  echouer(envoiId: string, message: string): Promise<string | null>;
  journaliser(prospectId: string, corps: string): Promise<string | null>;
  avancerFiche(prospectId: string): Promise<string | null>;
}

export type ResultatEnvoi =
  | { ok: true }
  | { ok: false; etape: 'prise' | 'gmail' | 'suite'; message: string };

/**
 * La séquence du §7.2, dans son ordre — et l'ordre est la garantie.
 *
 * **`prendre` AVANT Gmail** : c'est l'index unique partiel de `message_send`
 * qui empêche un second mail au même artisan, pas la boucle ni le bouton.
 * Deux onglets ouverts, un rechargement au mauvais moment : seule la base
 * tranche.
 *
 * **L'étape 4 échouée ne se replie pas sur « échec »** : le mail est parti,
 * il est chez le destinataire. Dire « échec » ferait recliquer, et la base
 * refuserait alors sans expliquer pourquoi. `etape: 'suite'` porte cette
 * distinction jusqu'à l'écran.
 */
export async function envoyerMail(
  deps: EnvoiDeps,
  args: { prospectId: string; mail: MailAEnvoyer },
): Promise<ResultatEnvoi> {
  const prise = await deps.prendre(args.prospectId, args.mail.a);
  if (!prise.ok) return { ok: false, etape: 'prise', message: prise.message };

  const resultat = await deps.envoyer(args.mail);
  if (!resultat.ok) {
    await deps.echouer(prise.id, resultat.message);
    return { ok: false, etape: 'gmail', message: resultat.message };
  }

  const erreurCloture = await deps.clore(prise.id, resultat.providerMessageId);
  if (erreurCloture !== null) return { ok: false, etape: 'suite', message: erreurCloture };

  const erreurJournal = await deps.journaliser(args.prospectId, args.mail.corps);
  if (erreurJournal !== null) return { ok: false, etape: 'suite', message: erreurJournal };

  const erreurFiche = await deps.avancerFiche(args.prospectId);
  if (erreurFiche !== null) return { ok: false, etape: 'suite', message: erreurFiche };

  return { ok: true };
}
```

Ajouter les imports nécessaires en tête de fichier : `import type { MailAEnvoyer, ResultatEnvoiGmail } from './gmail.js';`

- [ ] **Étape 4 : Lancer, vérifier que ça passe**

Run: `pnpm --filter @prospeo/dashboard test -- data/envoi`
Expected: les huit tests du fichier passent.

- [ ] **Étape 5 : Commit**

```bash
git add apps/dashboard/src/data/envoi.ts apps/dashboard/src/data/envoi.test.ts
git commit -m "feat(envoi): la sequence du §7.2, et l adresse saisie a la main"
```

---

## Tâche 7 : Le panneau de relecture

**Files:**
- Create: `apps/dashboard/src/ui/panel/RelectureTab.tsx`
- Create: `apps/dashboard/src/ui/panel/RelectureTab.module.css`
- Create: `apps/dashboard/src/ui/panel/RelectureTab.test.tsx`
- Modify: `apps/dashboard/src/i18n/fr.ts` et `en.ts`

**Interfaces:**
- Consomme : `Brouillon` (Tâche 5), `EtatCompteEnvoi` et `refusEnvoi` (Tâche 1).

> **La maquette gouverne**, `Campagne.dc.html` lignes 392-500. Elle montre, dans cet ordre : l'en-tête du prospect, l'état du site avec son URL, le **destinataire et son origine** (avec « Corriger »), l'objet, le corps, la ligne de traçabilité (`Rédigé par … · consignes … · date`), la mention du SMS rédigé mais non envoyable, la phrase « le mail partira de … », et les trois actions. **Aucun test ne verra cette mise en page** — la maquette est le seul contrôle qui la voie.

- [ ] **Étape 1 : Ajouter les clés**

Dans `fr.ts` (et leurs pendants dans `en.ts`) :

```ts
  'relecture.destinataire': 'Destinataire',
  'relecture.origine.saisie': 'Saisie',
  'relecture.origine.collecte': 'Collectée',
  'relecture.origine.aucune': 'Aucune adresse',
  'relecture.origineAide.saisie': 'Adresse saisie à la main dans cet écran.',
  'relecture.origineAide.collecte': 'Adresse relevée automatiquement à l’enrichissement.',
  'relecture.origineAide.aucune':
    'Aucune adresse n’a été trouvée ni saisie. La saisir permet d’envoyer.',
  'relecture.corriger': 'Corriger',
  'relecture.saisir': 'Saisir l’adresse',
  'relecture.enregistrer': 'Enregistrer',
  'relecture.annuler': 'Annuler',
  'relecture.objet': 'Objet',
  'relecture.corps': 'Corps du message',
  'relecture.tracabilite': 'Rédigé par {modele} · consignes {consignes} · {date}',
  'relecture.pasDeMail': 'Aucun mail n’a encore été rédigé pour ce prospect.',
  'relecture.partiraDe': 'Le mail partira de {expediteur}. Les réponses arriveront dans cette boîte.',
  'relecture.consequence': 'À l’envoi, le prospect passe en « contacté » et l’échange rejoint son historique.',
  'relecture.envoyer': 'Envoyer',
  'relecture.dejaEnvoye': 'Déjà envoyé',
  'relecture.echecPrise': 'Un envoi est déjà en cours ou parti pour ce prospect.',
  'relecture.echecGmail': 'Gmail a refusé l’envoi : {message}',
  'relecture.echecSuite':
    'Le mail est parti, mais la suite a échoué : {message}. Le prospect peut être en retard d’un statut.',
```

- [ ] **Étape 2 : Écrire les tests qui échouent**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fr } from '../../i18n/fr.js';
import { RelectureTab } from './RelectureTab.js';

const BROUILLON = {
  objet: 'Votre site ne répond plus',
  corps: 'Bonjour,',
  modele: 'claude-opus-5',
  consignes: 'v3',
  redigeLe: '2026-09-05T11:58:00.000Z',
  adresse: 'contact@artisan.fr',
  origine: 'saisie' as const,
  envoi: null,
};

function rendre(surcharges: Record<string, unknown> = {}) {
  const props = {
    brouillon: BROUILLON,
    compte: { etat: 'pret' as const, expediteur: 'leo@gmail.com' },
    onEnregistrerAdresse: vi.fn(async () => null),
    onEnvoyer: vi.fn(async () => ({ ok: true as const })),
    ...surcharges,
  };
  render(<RelectureTab {...(props as never)} />);
  return props;
}

describe('RelectureTab', () => {
  it('montre l objet et le corps qui partiront', () => {
    rendre();
    expect(screen.getByText('Votre site ne répond plus')).toBeInTheDocument();
  });

  it('nomme l origine de l adresse — un robot et un humain ne sont pas le même fait', () => {
    rendre();
    expect(screen.getByText(fr['relecture.origine.saisie'])).toBeInTheDocument();
  });

  it('nomme l absence d adresse plutôt que d afficher un champ vide', () => {
    // Doctrine : une absence se nomme. Un champ vide se lirait comme une
    // adresse effacee, pas comme une adresse jamais connue.
    rendre({ brouillon: { ...BROUILLON, adresse: null, origine: null } });
    expect(screen.getByText(fr['relecture.origine.aucune'])).toBeInTheDocument();
  });

  it('n offre pas d envoyer sans adresse', () => {
    rendre({ brouillon: { ...BROUILLON, adresse: null, origine: null } });
    const bouton = screen.getByRole('button', { name: fr['relecture.envoyer'] });
    expect(bouton).toBeDisabled();
  });

  it('n offre pas d envoyer sans compte d envoi utilisable', () => {
    rendre({ compte: { etat: 'sans_jeton' as const } });
    expect(screen.getByRole('button', { name: fr['relecture.envoyer'] })).toBeDisabled();
  });

  it('n offre pas d envoyer deux fois au même prospect', () => {
    rendre({ brouillon: { ...BROUILLON, envoi: { state: 'envoye' as const } } });
    expect(screen.getByRole('button', { name: fr['relecture.envoyer'] })).toBeDisabled();
  });

  it('nomme l absence de mail rédigé', () => {
    rendre({ brouillon: { ...BROUILLON, objet: null, corps: null } });
    expect(screen.getByText(fr['relecture.pasDeMail'])).toBeInTheDocument();
  });

  it('enregistre une adresse saisie', async () => {
    const props = rendre({ brouillon: { ...BROUILLON, adresse: null, origine: null } });
    await userEvent.click(screen.getByRole('button', { name: fr['relecture.saisir'] }));
    await userEvent.type(screen.getByLabelText(fr['relecture.destinataire']), 'nouveau@artisan.fr');
    await userEvent.click(screen.getByRole('button', { name: fr['relecture.enregistrer'] }));

    expect(props.onEnregistrerAdresse).toHaveBeenCalledWith('nouveau@artisan.fr');
  });

  it('affiche un mail PARTI dont la suite a échoué sans parler d échec d envoi', async () => {
    const props = rendre({
      onEnvoyer: vi.fn(async () => ({ ok: false as const, etape: 'suite' as const, message: 'refus' })),
    });
    await userEvent.click(screen.getByRole('button', { name: fr['relecture.envoyer'] }));
    expect(props.onEnvoyer).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Le mail est parti/)).toBeInTheDocument();
  });
});
```

- [ ] **Étape 3 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/dashboard test -- RelectureTab`
Expected: échec — `./RelectureTab.js` n'existe pas.

- [ ] **Étape 4 : Écrire le composant**

Construire `RelectureTab.tsx` en suivant la maquette (`Campagne.dc.html` 392-500). **Lire `FicheTab.tsx` d'abord** : c'est le voisin immédiat, il fixe les conventions de ce dossier (structure, nommage des classes, usage de `useT`).

Le kit disponible est exactement : `Badge`, `StatusBadge`, `Tooltip`, `Card`, `EmptyState`, `Bientot` (`ui/kit/`). **Il ne porte pas de bouton** — reprendre le `<button>` + classe de module CSS employé par `FicheTab.tsx` et `CampagneScreen.tsx`. L'origine de l'adresse emploie `Badge` + `Tooltip` (le patron exact que la maquette dessine) ; l'absence de mail rédigé emploie `EmptyState`.

Points que le composant doit tenir, tous éprouvés par les tests ci-dessus :
- l'origine de l'adresse porte **un mot** (`Badge`) et son infobulle ;
- l'absence d'adresse se **nomme**, et ouvre la saisie ;
- l'absence de mail rédigé se **nomme** ;
- le bouton « Envoyer » est désactivé exactement quand `refusEnvoi` rend un motif, jamais autrement ;
- l'échec `etape: 'suite'` affiche `t('relecture.echecSuite', …)`, qui **ne dit pas** que l'envoi a échoué.

Le CSS n'emploie que des `var(--…)` de `ui/theme.css`.

- [ ] **Étape 5 : Lancer, vérifier que ça passe**

Run: `pnpm --filter @prospeo/dashboard test -- RelectureTab`
Expected: les neuf tests passent.

- [ ] **Étape 6 : Commit**

```bash
git add apps/dashboard/src/ui/panel/RelectureTab.tsx apps/dashboard/src/ui/panel/RelectureTab.module.css apps/dashboard/src/ui/panel/RelectureTab.test.tsx apps/dashboard/src/i18n/fr.ts apps/dashboard/src/i18n/en.ts
git commit -m "feat(campagne): le panneau de relecture, tel que la maquette le dessine"
```

---

## Tâche 8 : Brancher le panneau sur l'écran

**Files:**
- Modify: `apps/dashboard/src/screens/CampagneScreen.tsx`
- Modify: `apps/dashboard/src/screens/CampagneScreen.test.tsx`

**Interfaces:**
- Consomme : tout ce que les tâches 1 à 7 produisent.

> **C'est ici que l'assemblage réel a lieu** : le client Supabase, la session, le client Gmail construit avec le `provider_token`, et les fonctions existantes `journaliserInteraction` / `definirStatut`. Le §7.2 exige que l'étape 4 passe **par elles**, pas par du code réécrit — `definirStatut` porte déjà la distinction d'échec entre l'état et l'historique.

- [ ] **Étape 0 : Lire la colonne d'actions existante**

`CampagneScreen.tsx` (~lignes 240-270) porte déjà une colonne d'actions, avec un commentaire qui dit exactement ce que ce lot vient lever :

> *« Les autres etats attendent l'envoi, qui n'existe pas encore. »*

Trois états portent un geste aujourd'hui : `jamais` → `campagne.action.deployer`, `site_echec` → `campagne.action.rejouer`, `en_file` → `campagne.action.retirer`. Le bouton réutilise `styles.action` et le helper `agir(...)`. **Reprendre ce patron, ne pas en introduire un second**, et mettre à jour le commentaire, qui devient faux.

Les états qui gagnent un geste dans ce lot sont ceux que l'envoi débloque, nommés dans `domain/campagne.ts` : **`mail_a_relire`**, **`adresse_manquante`** et **`envoi_echec`**. Les trois ouvrent le même panneau — c'est lui qui sait quoi proposer (saisir l'adresse, relire, réessayer). `envoi_incertain` et `envoye` n'en portent **aucun** : le premier attend, le second est fini.

- [ ] **Étape 1 : Écrire le test qui échoue**

Ajouter à `apps/dashboard/src/screens/CampagneScreen.test.tsx` (lire le fichier d'abord pour reprendre son helper de rendu et son client simulé) :

```tsx
it('ouvre le panneau de relecture depuis une ligne dont le mail attend d être relu', async () => {
  // Le commentaire de la colonne d'actions disait « l'envoi n'existe pas
  // encore » : ce test est ce qui le rend faux.
  rendreEcran({ /* des faits qui produisent `mail_a_relire`, cf. tests existants */ });
  await userEvent.click(screen.getAllByRole('button', { name: fr['campagne.action.relire'] })[0] as HTMLElement);
  expect(screen.getByText(fr['relecture.destinataire'])).toBeInTheDocument();
});

it('n offre aucun geste sur une ligne déjà envoyée', () => {
  rendreEcran({ /* des faits qui produisent `envoye` */ });
  expect(
    screen.queryByRole('button', { name: fr['campagne.action.relire'] }),
  ).not.toBeInTheDocument();
});
```

Ajouter la clé `'campagne.action.relire': 'Relire'` dans `fr.ts` et son pendant anglais, dans le même bloc que les autres `campagne.action.*`.

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run: `pnpm --filter @prospeo/dashboard test -- CampagneScreen`
Expected: échec — aucun bouton « Relire », aucun panneau.

- [ ] **Étape 3 : Brancher**

Dans `CampagneScreen.tsx` :
- un état local porte le `prospectId` dont le panneau est ouvert (`null` = fermé) ;
- à l'ouverture, `fetchBrouillon(client, prospectId)` alimente le panneau ;
- `compte` vient de `etatCompteEnvoi(session)` (session via `useAuth`) ;
- `onEnregistrerAdresse` appelle `enregistrerAdresse`, puis relit le brouillon ;
- `onEnvoyer` construit les `EnvoiDeps` réels et appelle `envoyerMail` :

```ts
const deps: EnvoiDeps = {
  async prendre(prospectId, destinataire) {
    const { data, error } = await client
      .from('message_send')
      .insert({
        prospect_id: prospectId,
        channel: 'email',
        provider: 'gmail',
        recipient: destinataire,
        state: 'en_cours',
        sent_by: session?.user.id ?? null,
      })
      .select('id')
      .single();
    // 23505 : l'index unique partiel a refusé. Ce n'est pas une panne, c'est
    // la garantie qui joue son rôle — même traitement que le dépôt de job.
    if (error !== null) return { ok: false, message: error.message };
    return { ok: true, id: data.id };
  },
  envoyer: (mail) => createGmailClient({ jeton: session?.provider_token ?? '' }).envoyer(mail),
  async clore(envoiId, providerMessageId) {
    const { error } = await client
      .from('message_send')
      .update({ state: 'envoye', provider_message_id: providerMessageId, sent_at: new Date().toISOString() })
      .eq('id', envoiId);
    return error === null ? null : error.message;
  },
  async echouer(envoiId, message) {
    const { error } = await client
      .from('message_send')
      .update({ state: 'echoue', error: message })
      .eq('id', envoiId);
    return error === null ? null : error.message;
  },
  journaliser: (prospectId, corps) => journaliserInteraction(client, prospectId, 'email', corps),
  async avancerFiche(prospectId) {
    const echec = await definirStatut(client, prospectId, 'contacte', null);
    return echec === null ? null : echec.message;
  },
};
```

- [ ] **Étape 4 : Lancer, vérifier que ça passe**

Run: `pnpm --filter @prospeo/dashboard test -- CampagneScreen`
Expected: le nouveau test passe, les tests existants de l'écran aussi.

- [ ] **Étape 5 : Suite complète et typecheck**

Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`
Expected: tout vert.

- [ ] **Étape 6 : Commit**

```bash
git add apps/dashboard/src/screens/CampagneScreen.tsx apps/dashboard/src/screens/CampagneScreen.test.tsx apps/dashboard/src/i18n/fr.ts apps/dashboard/src/i18n/en.ts
git commit -m "feat(campagne): le panneau de relecture branche sur l ecran"
```

---

## Tâche 9 : La mesure du `provider_token`, et le bilan

**Files:**
- Modify: `docs/design/HANDOFF.md`

> **Cette tâche exige le propriétaire**, avec son vrai compte Google : elle ne peut pas être exécutée par un implémenteur. Le contrôleur la mène avec lui.

- [ ] **Étape 1 : Mesurer, ne pas supposer (§12.1 du spec)**

Avec le propriétaire, dans le navigateur :
1. se connecter avec Google, vérifier que la bande affiche « prêt » ;
2. noter l'heure, et l'`expires_at` de la session (console : `await client.auth.getSession()`) ;
3. laisser l'onglet ouvert au-delà du rafraîchissement automatique de la session Supabase ;
4. relire la session et constater si `provider_token` **survit** ou **disparaît**.

Consigner le résultat réel, avec la version de `supabase-js` du dépôt.

- [ ] **Étape 2 : Envoyer un vrai mail**

Sur un prospect réel : saisir une adresse (la sienne, pour le premier essai), relire, envoyer. Vérifier en base : `message_send` en `envoye` avec son `provider_message_id`, une ligne `interaction`, et `prospect_pipeline` passé en `contacte`.

- [ ] **Étape 3 : Écrire la section HANDOFF.md**

Après la section du lot 1 du chantier n°7, ajouter une section « Chantier n°7, lot 4 » qui consigne :
- la durée de vie réellement mesurée du `provider_token`, et le comportement observé ;
- que l'autorisation Google expire à **7 jours** en mode Testing ;
- ce que ce lot laisse inerte : l'étage `contacts` automatique (non construit, mesure du §12.2 à l'appui), la campagne de 10, le mode auto, le détail au clic ;
- le plafond Gmail (500/jour en compte personnel) **non encore affiché à l'écran** si c'est le cas à la livraison.

- [ ] **Étape 4 : Vérification finale**

```bash
pnpm --filter @prospeo/dashboard test
pnpm --filter @prospeo/collector test
pnpm -r typecheck
```

Consigner les décomptes réels, jamais ceux de l'« État de départ » de ce plan.

- [ ] **Étape 5 : Commit**

```bash
git add docs/design/HANDOFF.md
git commit -m "docs(handoff): le lot 4, la duree de vie mesuree du jeton, et ce qui reste inerte"
```

---

## Ce que ce plan ne couvre pas

- **L'étage `contacts` automatique** — non construit, sur la foi de la mesure du §12.2 (109 prospects sur 139 sans aucune présence web). À rouvrir seulement si une source réellement peuplée est identifiée.
- **La campagne de 10 et sa bande** (lot 6), **le mode automatique et ses quatre bornes** (lot 7), **le détail au clic** (lot 8).
- **Le compteur du plafond Gmail** (500/jour) : le §7.3 le demande à l'écran ; il se branchera avec la campagne de 10, qui est le premier lot où il décide réellement d'un envoi.
- **La détection des rebonds** (§12.4) — hors périmètre, et le minimum honnête reste de ne pas prétendre qu'un contact a abouti.
