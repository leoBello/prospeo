# Refonte de l'interface — Lot 1 : fondations, vocabulaire, fiche prospect

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la fiche prospect décidable en trois secondes — panneau à 720 px, quatre onglets, score replié — sur un vocabulaire de composants (badge, infobulle, carte, vide, « bientôt ») qui n'existe pas encore.

**Architecture:** Trois couches empilées, chacune livrable seule. (1) Les tokens de `theme.css` changent sans qu'aucun composant bouge. (2) Un dossier `ui/kit/` accueille cinq composants neufs, sans consommateur, donc sans régression possible. (3) `ProspectPanel` est recomposé sur ce kit, ses sections existantes devenant le contenu d'onglets. Base UI fournit le comportement (focus, ARIA, placement) ; les CSS Modules gardent le style.

**Tech Stack:** React 18.3, TypeScript, Vite, CSS Modules, `@base-ui/react` 1.7, Vitest + Testing Library, jsdom.

## Global Constraints

- **Périmètre :** ce lot est le n°1 sur 3. Lot 2 = écrans de déploiement (D9, D10), lot 3 = gamification (D5). Ne rien implémenter d'eux ici.
- **Référence de conception :** `docs/superpowers/plans/2026-09-02-refonte-ui-ux.md`, décisions D1 à D11. Maquettes : `docs/design/maquettes/Main.dc.html` et `Composants.dc.html`.
- **Direction graphique :** D11, « Cockpit » (`DirectionB.dc.html`).
- **Aucune chaîne en dur.** Tout texte affiché passe par `t()`. Toute clé ajoutée à `src/i18n/fr.ts` doit l'être à `src/i18n/en.ts` — le type `TranslationKey` dérive de `fr` et `i18n.test.ts` compare les deux jeux. Oublier l'anglais casse la compilation.
- **Imports en `.js`.** Le projet est en ESM/NodeNext : `import { X } from './X.js'` même pour un fichier `.tsx`.
- **Aucune couleur en dur dans un composant.** Uniquement des `var(--…)` de `theme.css` (règle posée par le chantier 1, condition du thème clair).
- **La couleur n'est jamais le seul indicateur d'un état.** Tout badge porte un mot ; toute pastille porte un `aria-label`.
- **`null` est porteur de sens.** Un satellite absent (`score`, `enrichment`, `presence`, `site`) n'est jamais remplacé par un objet vide ou par des zéros. Un prospect non scoré n'est pas un prospect à zéro.
- **Commandes :** tests `pnpm --filter @prospeo/dashboard test`, types `pnpm --filter @prospeo/dashboard typecheck`. Exécuter depuis la racine du dépôt.
- **Commit à chaque fin de tâche**, jamais avant que les tests passent.

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `apps/dashboard/src/ui/theme.css` | *modifié* — palette D11, échelle typo, contraste AA | 1 |
| `apps/dashboard/index.html` | *modifié* — préchargement des trois fontes | 1 |
| `apps/dashboard/src/ui/kit/Badge.tsx` + `.module.css` | pastille générique, six tons | 2 |
| `apps/dashboard/src/ui/kit/StatusBadge.tsx` | les sept `pipeline_status`, traduits | 2 |
| `apps/dashboard/src/ui/kit/Tooltip.tsx` + `.module.css` | infobulle sur Base UI | 3 |
| `apps/dashboard/src/ui/kit/Bientot.tsx` | affordance « fonctionnalité à venir » | 4 |
| `apps/dashboard/src/ui/kit/Card.tsx` + `.module.css` | carte de faits, carte de chiffre | 5 |
| `apps/dashboard/src/ui/kit/EmptyState.tsx` | vide nommé | 5 |
| `apps/dashboard/src/ui/ScoreCompact.tsx` + `.module.css` | jauge + trois groupes + reçu dépliable | 6 |
| `apps/dashboard/src/ui/ProspectPanel.tsx` | *réécrit* — coquille à onglets, 720 px | 7 |
| `apps/dashboard/src/ui/panel/FicheTab.tsx` | onglet Fiche | 8 |
| `apps/dashboard/src/ui/panel/HistoriqueTab.tsx` | onglet Historique | 9 |
| `apps/dashboard/src/ui/PanelActions.tsx` | barre d'actions primaires | 10 |
| `docs/design/HANDOFF.md` | ce que la maquette montre et que la base ne sait pas | 11 |

---

## Task 1: Les fondations — palette, typographie, contraste

**Files:**
- Modify: `apps/dashboard/src/ui/theme.css`
- Modify: `apps/dashboard/index.html`
- Test: `apps/dashboard/src/ui/theme.test.ts` (créer)

**Interfaces:**
- Consomme : rien.
- Produit : les tokens `--color-*`, `--font-display`, `--font-ui`, `--font-mono`, `--radius-lg`, `--text-2xl`. Toutes les tâches suivantes n'utilisent que ceux-ci.

Cette tâche est isolée par construction : aucun composant ne change, seules les valeurs derrière les variables bougent. C'est ce qui la rend livrable seule.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/theme.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

/**
 * Luminance relative WCAG d'une couleur hexadécimale.
 *
 * Recopiée ici plutôt qu'importée : le test doit pouvoir échouer même si le
 * code applicatif est cassé, et une dépendance de plus pour six lignes de
 * calcul ne se justifie pas.
 */
function luminance(hex: string): number {
  const canal = (n: number) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  );
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((clair as number) + 0.05) / ((sombre as number) + 0.05);
}

/** Lit un token dans un bloc de sélecteur donné. */
function token(selecteur: string, nom: string): string {
  const bloc = css.split(selecteur)[1]?.split('}')[0] ?? '';
  return new RegExp(`${nom}:\\s*([^;]+);`).exec(bloc)?.[1]?.trim() ?? '';
}

describe('theme.css', () => {
  it('donne au texte secondaire le contraste AA, dans les deux themes', () => {
    // La reserve du chantier 1 : cette couleur porte la « raison de presence »
    // de chaque ligne, que le §9.2 tient pour essentielle. A 3,60:1 elle etait
    // sous le seuil, et l'ecart avait ete remonte plutot que corrige.
    const sombre = contraste(token(':root {', '--color-text-muted'), token(':root {', '--color-surface'));
    expect(sombre).toBeGreaterThanOrEqual(4.5);

    const clair = contraste(
      token(":root[data-theme='light']", '--color-text-muted'),
      token(":root[data-theme='light']", '--color-surface'),
    );
    expect(clair).toBeGreaterThanOrEqual(4.5);
  });

  it('declare les trois familles typographiques de D6', () => {
    expect(css).toContain('--font-display:');
    expect(css).toContain('--font-ui:');
    expect(css).toContain('--font-mono:');
  });

  it('n abandonne aucun token utilise par les composants existants', () => {
    // La tache 1 ne doit casser aucun ecran : les composants actuels lisent
    // ces variables, les renommer les rendrait transparents.
    for (const t of ['--color-bg', '--color-surface', '--color-border', '--color-text', '--color-accent', '--color-danger', '--color-warning']) {
      expect(css).toContain(`${t}:`);
    }
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- theme`
Expected: FAIL — `expected 3.6... to be greater than or equal to 4.5` sur le premier test, et `--font-display:` absent sur le second.

- [ ] **Step 3: Appliquer les tokens**

Dans `apps/dashboard/src/ui/theme.css`, remplacer le bloc de commentaire d'en-tête et le `:root` sombre par :

```css
/*
 * Tokens de couleur, d'espacement et de typographie.
 *
 * Tout est déclaré en variables, y compris ce dont un seul thème se sert : la
 * bascule sombre / clair ne change que ces valeurs, jamais un composant. Des
 * couleurs écrites en dur transformeraient l'ajout du thème clair en reprise
 * de chaque fichier — c'est-à-dire, en pratique, en thème clair jamais livré.
 *
 * La palette suit la direction « Cockpit » (D11 du chantier n°6).
 *
 * RÉSERVE LEVÉE : `--color-text-muted` valait #6b7280, soit 3,60:1 sur la
 * surface sombre — sous le seuil AA de 4,5:1, sur la couleur qui porte la
 * raison de présence de chaque ligne. Le chantier n°6 (D7) la tranche.
 * `theme.test.ts` mesure désormais les deux thèmes à chaque exécution.
 */

:root {
  color-scheme: dark;

  --color-bg: #0b0d12;
  --color-surface: #14171f;
  --color-surface-2: #1a1e28;
  --color-surface-3: #232936;
  --color-border: #252b38;
  --color-border-strong: #333c4e;
  --color-text: #e4e8f0;
  --color-text-muted: #98a1b4;
  --color-text-faint: #6b7488;
  --color-accent: #6d92ff;

  /* Teintes dérivées de l'accent pour les trois blocs de la barre de score.
     Un seul accent, décliné en intensité. */
  --color-seg-presence: var(--color-accent);
  --color-seg-vitalite: #5a7de0;
  --color-seg-joignabilite: #3f568f;
  --color-seg-empty: #232936;

  /* Réservés aux états, jamais décoratifs. */
  --color-success: #4fd1a5;
  --color-danger: #ff7a85;
  --color-warning: #f0b45c;
  --color-info: #a78bfa;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 12px;
  --radius-pill: 999px;

  /* D6 — trois familles. La chasse fixe n'est pas un ornement : sans elle les
     colonnes de score ne s'alignent pas d'une ligne à l'autre. */
  --font-display: 'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif;
  --font-ui: 'Instrument Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --font-sans: var(--font-ui);

  --text-xs: 11px;
  --text-sm: 12px;
  --text-md: 13px;
  --text-lg: 15px;
  --text-xl: 20px;
  --text-2xl: 24px;

  --z-panel: 10;
  --z-overlay: 20;
  --z-tooltip: 30;
}

:root[data-theme='light'] {
  color-scheme: light;

  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-surface-2: #f4f4f6;
  --color-surface-3: #e9e9ee;
  --color-border: #e8e8e8;
  --color-border-strong: #cfcfd6;
  --color-text: #1a1a1a;
  --color-text-muted: #6f6f6f;
  --color-text-faint: #8a8a8a;
  --color-accent: #4f46e5;

  --color-seg-presence: var(--color-accent);
  --color-seg-vitalite: #8b85ee;
  --color-seg-joignabilite: #c9c5f7;
  --color-seg-empty: #ececf0;

  --color-success: #0f7a5a;
  --color-danger: #c23b3b;
  --color-warning: #a06a10;
  --color-info: #6d4bd8;
}
```

Puis, plus bas dans le même fichier, remplacer `font-family: var(--font-sans);` de la règle `body` par `font-family: var(--font-ui);`.

- [ ] **Step 4: Charger les fontes**

Dans `apps/dashboard/index.html`, insérer avant `</head>` :

```html
    <!-- Préconnexion avant la feuille : sans elle le navigateur découvre
         fonts.gstatic.com au moment de parser le CSS, ce qui ajoute un aller-
         retour DNS+TLS au premier rendu du texte. -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
    />
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/dashboard test`
Expected: PASS — y compris toute la suite existante, qui ne lit que des noms de tokens conservés.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/ui/theme.css apps/dashboard/src/ui/theme.test.ts apps/dashboard/index.html
git commit -m "feat(ui): les fondations — palette Cockpit, trois fontes, contraste AA

La reserve mesuree du chantier 1 est levee : --color-text-muted passait
a 3,60:1 sur la surface, sous le seuil AA, sur la couleur qui porte la
raison de presence de chaque ligne. theme.test.ts la mesure desormais
dans les deux themes a chaque execution."
```

---

## Task 2: Badge et StatusBadge

**Files:**
- Create: `apps/dashboard/src/ui/kit/Badge.tsx`, `apps/dashboard/src/ui/kit/Badge.module.css`
- Create: `apps/dashboard/src/ui/kit/StatusBadge.tsx`
- Test: `apps/dashboard/src/ui/kit/Badge.test.tsx`

**Interfaces:**
- Consomme : les tokens de la tâche 1.
- Produit :
  - `type BadgeTon = 'neutre' | 'accent' | 'succes' | 'alerte' | 'danger' | 'info'`
  - `Badge(props: { ton?: BadgeTon; point?: boolean; discontinu?: boolean; children: ReactNode })`
  - `StatusBadge(props: { status: Enums<'pipeline_status'> | null })`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/kit/Badge.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../../test-utils.js';
import { Badge } from './Badge.js';
import { StatusBadge } from './StatusBadge.js';

describe('Badge', () => {
  it('rend son contenu et son ton', () => {
    const { container } = renderWithPreferences(<Badge ton="danger">Aucun site</Badge>);
    expect(screen.getByText('Aucun site')).toBeDefined();
    expect(container.querySelector('[data-ton="danger"]')).not.toBeNull();
  });

  it('retombe sur le ton neutre quand aucun n est donne', () => {
    const { container } = renderWithPreferences(<Badge>Plombier</Badge>);
    expect(container.querySelector('[data-ton="neutre"]')).not.toBeNull();
  });
});

describe('StatusBadge', () => {
  it('traduit les sept statuts du pipeline', () => {
    renderWithPreferences(<StatusBadge status="a_contacter" />);
    expect(screen.getByText('À contacter')).toBeDefined();
  });

  it('dit « jamais contacte » plutot que de ne rien afficher quand le suivi est absent', () => {
    // 114 prospects sur 139 n'ont aucune ligne de pipeline. Un badge vide se
    // lirait comme un defaut d'affichage ; l'absence est un etat reel.
    renderWithPreferences(<StatusBadge status={null} />);
    expect(screen.getByText('Jamais contacté')).toBeDefined();
  });

  it('marque « ne pas contacter » autrement que par la couleur', () => {
    // C'est une obligation de conformite (§11), pas une etape du parcours.
    // La forme doit le dire avant la couleur, pour qui ne la distingue pas.
    const { container } = renderWithPreferences(<StatusBadge status="ne_pas_contacter" />);
    expect(container.querySelector('[data-discontinu="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- Badge`
Expected: FAIL — `Failed to resolve import "./Badge.js"`.

- [ ] **Step 3: Écrire les composants**

`apps/dashboard/src/ui/kit/Badge.module.css` :

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
}

/*
 * Le point ne remplace jamais le mot : il le double.
 * Une pastille reduite a sa couleur est illisible pour huit pour cent des
 * hommes, et pour tout le monde en impression noir et blanc.
 */
.point {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-pill);
  background: currentColor;
  flex: none;
}

/* Le trait discontinu distingue une obligation d'une etape. */
.discontinu {
  border-style: dashed;
}

.badge[data-ton='neutre'] {
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-text-muted) 10%, transparent);
  border-color: var(--color-border-strong);
}
.badge[data-ton='accent'] {
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 13%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 28%, transparent);
}
.badge[data-ton='succes'] {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 13%, transparent);
  border-color: color-mix(in srgb, var(--color-success) 28%, transparent);
}
.badge[data-ton='alerte'] {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 13%, transparent);
  border-color: color-mix(in srgb, var(--color-warning) 28%, transparent);
}
.badge[data-ton='danger'] {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 13%, transparent);
  border-color: color-mix(in srgb, var(--color-danger) 28%, transparent);
}
.badge[data-ton='info'] {
  color: var(--color-info);
  background: color-mix(in srgb, var(--color-info) 13%, transparent);
  border-color: color-mix(in srgb, var(--color-info) 30%, transparent);
}
```

`apps/dashboard/src/ui/kit/Badge.tsx` :

```tsx
import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTon = 'neutre' | 'accent' | 'succes' | 'alerte' | 'danger' | 'info';

interface Props {
  ton?: BadgeTon;
  /** Double la couleur d'un point. Ne remplace jamais le libellé. */
  point?: boolean;
  /** Trait discontinu : distingue une obligation d'une étape du parcours. */
  discontinu?: boolean;
  children: ReactNode;
}

/**
 * La pastille d'état.
 *
 * `data-ton` porte le ton plutôt qu'une classe composée : le style se lit
 * depuis le CSS, et le test peut affirmer sur l'état sans dépendre du nom
 * généré par les CSS Modules, qui change à chaque build.
 */
export function Badge({ ton = 'neutre', point = false, discontinu = false, children }: Props) {
  return (
    <span
      className={`${styles.badge} ${discontinu ? styles.discontinu : ''}`}
      data-ton={ton}
      data-discontinu={discontinu ? 'true' : undefined}
    >
      {point ? <span className={styles.point} /> : null}
      {children}
    </span>
  );
}
```

`apps/dashboard/src/ui/kit/StatusBadge.tsx` :

```tsx
import type { Enums } from '@prospeo/db';
import type { TranslationKey } from '../../i18n/translate.js';
import { useT } from '../preferences.js';
import { Badge } from './Badge.js';
import type { BadgeTon } from './Badge.js';

type Statut = Enums<'pipeline_status'>;

/**
 * Le ton de chaque statut.
 *
 * `ne_pas_contacter` n'est pas « le pire des statuts » : c'est une obligation
 * de conformité (§11), respectée immédiatement et définitivement. Il porte
 * pour cette raison le trait discontinu, que rien d'autre n'utilise.
 */
const TON: Record<Statut, BadgeTon> = {
  a_contacter: 'neutre',
  contacte: 'accent',
  relance: 'alerte',
  interesse: 'info',
  gagne: 'succes',
  perdu: 'danger',
  ne_pas_contacter: 'danger',
};

const CLE: Record<Statut, TranslationKey> = {
  a_contacter: 'pipeline.status.a_contacter',
  contacte: 'pipeline.status.contacte',
  relance: 'pipeline.status.relance',
  interesse: 'pipeline.status.interesse',
  gagne: 'pipeline.status.gagne',
  perdu: 'pipeline.status.perdu',
  ne_pas_contacter: 'pipeline.status.ne_pas_contacter',
};

/**
 * Le statut de suivi, ou son absence.
 *
 * `null` n'est pas un cas dégénéré : au 1ᵉʳ septembre 2026, 114 prospects sur
 * 139 n'ont aucune ligne dans `prospect_pipeline`. « Jamais contacté » est
 * donc l'affichage le plus fréquent, et il doit se lire comme un état.
 */
export function StatusBadge({ status }: { status: Statut | null }) {
  const t = useT();
  if (status === null) return <Badge ton="neutre">{t('pipeline.absent')}</Badge>;
  return (
    <Badge ton={TON[status]} point discontinu={status === 'ne_pas_contacter'}>
      {t(CLE[status])}
    </Badge>
  );
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/dashboard test -- Badge`
Expected: PASS, 5 tests.

Aucune clé i18n n'est à ajouter : `pipeline.status.*` et `pipeline.absent` existent déjà dans `fr.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/ui/kit/
git commit -m "feat(ui): Badge et StatusBadge — l'etat cesse d'etre du texte nu

Sept statuts, six tons, et le trait discontinu reserve a
ne_pas_contacter : c'est une obligation de conformite, pas une etape,
et la forme doit le dire avant la couleur."
```

---

## Task 3: L'infobulle, sur Base UI

**Files:**
- Modify: `apps/dashboard/package.json` (dépendance)
- Create: `apps/dashboard/src/ui/kit/Tooltip.tsx`, `apps/dashboard/src/ui/kit/Tooltip.module.css`
- Test: `apps/dashboard/src/ui/kit/Tooltip.test.tsx`

**Interfaces:**
- Consomme : tokens (tâche 1).
- Produit : `Tooltip(props: { intitule?: string; contenu: ReactNode; children: ReactElement })`.

`children` est un `ReactElement` et non un `ReactNode` : Base UI le clone via `render` pour y poser les attributs ARIA et les gestionnaires. Un texte nu n'a rien où les recevoir.

- [ ] **Step 1: Installer Base UI**

```bash
pnpm --filter @prospeo/dashboard add @base-ui/react@^1.7.0
```

Vérifié : `@base-ui/react@1.7.0` déclare `react: ^17 || ^18 || ^19` — React 18.3 du projet est couvert. Ses pairs `date-fns` et `@date-fns/tz` sont marqués `optional`, rien d'autre n'est à installer.

- [ ] **Step 2: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/kit/Tooltip.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../../test-utils.js';
import { Tooltip } from './Tooltip.js';

describe('Tooltip', () => {
  it('garde le contenu hors du DOM tant que rien ne le demande', () => {
    renderWithPreferences(
      <Tooltip contenu="Google ne publie plus le nombre d'avis.">
        <button type="button">non publié</button>
      </Tooltip>,
    );
    expect(screen.queryByText(/ne publie plus/)).toBeNull();
  });

  it('revele le contenu au survol', async () => {
    const user = userEvent.setup();
    renderWithPreferences(
      <Tooltip contenu="Google ne publie plus le nombre d'avis.">
        <button type="button">non publié</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'non publié' }));
    expect(await screen.findByText(/ne publie plus/)).toBeDefined();
  });

  it('revele le contenu au clavier seul, sans souris', async () => {
    // Une infobulle qui ne s'ouvre qu'au survol est une infobulle que les
    // personnes naviguant au clavier ne liront jamais.
    const user = userEvent.setup();
    renderWithPreferences(
      <Tooltip contenu="Le gabarit du metier l'emporte sur le gabarit actif.">
        <button type="button">?</button>
      </Tooltip>,
    );
    await user.tab();
    expect(await screen.findByText(/l'emporte/)).toBeDefined();
  });
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- Tooltip`
Expected: FAIL — `Failed to resolve import "./Tooltip.js"`.

- [ ] **Step 4: Écrire le composant**

`apps/dashboard/src/ui/kit/Tooltip.module.css` :

```css
.popup {
  background: var(--color-bg);
  border: 1px solid var(--color-border-strong);
  color: var(--color-text);
  padding: 7px 10px;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  line-height: 1.4;
  max-width: 250px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
  z-index: var(--z-tooltip);
}

/*
 * L'intitulé nomme la nature de l'explication — « Motif de qualification »,
 * « Ce n'est pas un trou de collecte ». Sans lui, l'infobulle est une phrase
 * qui surgit sans dire de quoi elle parle.
 */
.intitule {
  display: block;
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 2px;
}
```

`apps/dashboard/src/ui/kit/Tooltip.tsx` :

```tsx
import { Tooltip as Base } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface Props {
  /** Nomme la nature de l'explication. Optionnel. */
  intitule?: string;
  contenu: ReactNode;
  /** L'élément déclencheur. Base UI y pose les attributs ARIA. */
  children: ReactElement;
}

/**
 * L'infobulle.
 *
 * **Ce qu'elle porte, et ce qu'elle ne porte pas.** Elle explique le *pourquoi*
 * — pourquoi un champ est vide, pourquoi une confiance d'appariement compte.
 * Elle ne porte jamais une information dont la décision dépend : ce qui compte
 * reste visible sans geste.
 *
 * Base UI plutôt qu'une implémentation maison : le placement qui évite les
 * bords, le délai qui empêche le clignotement au passage de la souris, la
 * révélation au clavier et la sémantique ARIA sont exactement ce qu'on écrit
 * mal quand on l'écrit soi-même.
 */
export function Tooltip({ intitule, contenu, children }: Props) {
  return (
    <Base.Root>
      <Base.Trigger render={children} />
      <Base.Portal>
        <Base.Positioner sideOffset={8}>
          <Base.Popup className={styles.popup}>
            {intitule === undefined ? null : <span className={styles.intitule}>{intitule}</span>}
            {contenu}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/dashboard test -- Tooltip`
Expected: PASS, 3 tests.

Si le troisième échoue parce que le focus n'atteint pas le bouton, c'est que `userEvent.setup()` n'a pas été appelé avant le rendu — le vérifier avant de toucher au composant.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/src/ui/kit/Tooltip.tsx apps/dashboard/src/ui/kit/Tooltip.module.css apps/dashboard/src/ui/kit/Tooltip.test.tsx ../../pnpm-lock.yaml
git commit -m "feat(ui): l'infobulle, sur Base UI

Ce qui manquait n'etait pas le style mais le comportement : placement,
delai, revelation au clavier, semantique ARIA. C'est exactement ce
qu'une bibliotheque headless fournit et ce qu'on ecrit mal soi-meme."
```

---

## Task 4: L'affordance « bientôt disponible »

**Files:**
- Create: `apps/dashboard/src/ui/kit/Bientot.tsx`, `apps/dashboard/src/ui/kit/Bientot.module.css`
- Modify: `apps/dashboard/src/i18n/fr.ts`, `apps/dashboard/src/i18n/en.ts`
- Test: `apps/dashboard/src/ui/kit/Bientot.test.tsx`

**Interfaces:**
- Consomme : `Tooltip` (tâche 3), `Badge` (tâche 2).
- Produit : `Bientot(props: { raison: string; children: ReactNode })`.

**Pourquoi ce composant existe.** La maquette est par endroits en avance sur la base : le suivi pas-à-pas d'un déploiement et l'historique des événements de site n'ont aucune table pour les alimenter (§4.1 et §4.2 du chantier n°6). La consigne est de **montrer quand même le composant**, désactivé, en disant pourquoi. Un écran amputé fait croire à un oubli ; un écran qui annonce sa suite est une promesse tenable.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/kit/Bientot.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../../test-utils.js';
import { Bientot } from './Bientot.js';

describe('Bientot', () => {
  it('affiche le contenu et le marque comme a venir', () => {
    renderWithPreferences(
      <Bientot raison="Aucune table d'evenements de deploiement n'existe encore.">
        <span>Journal de construction</span>
      </Bientot>,
    );
    expect(screen.getByText('Journal de construction')).toBeDefined();
    expect(screen.getByText('Bientôt')).toBeDefined();
  });

  it('dit la raison, et non un « indisponible » sans motif', async () => {
    // Une fonctionnalite grisee sans explication se lit comme une panne.
    const user = userEvent.setup();
    renderWithPreferences(
      <Bientot raison="Aucune table d'evenements de deploiement n'existe encore.">
        <span>Journal de construction</span>
      </Bientot>,
    );
    await user.hover(screen.getByText('Bientôt'));
    expect(await screen.findByText(/table d'evenements/)).toBeDefined();
  });

  it('retire le contenu du parcours clavier et le signale aux lecteurs d ecran', async () => {
    // Laisser tabuler vers un controle inerte est une impasse : on croit
    // l'avoir active, rien ne se passe, et rien ne dit pourquoi.
    const { container } = renderWithPreferences(
      <Bientot raison="Pas encore de source.">
        <button type="button">Redéployer</button>
      </Bientot>,
    );
    const zone = container.querySelector('[aria-disabled="true"]');
    expect(zone).not.toBeNull();
    expect(zone?.getAttribute('inert')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- Bientot`
Expected: FAIL — `Failed to resolve import "./Bientot.js"`.

- [ ] **Step 3: Ajouter les clés i18n**

Dans `apps/dashboard/src/i18n/fr.ts`, avant l'accolade fermante :

```ts
  'bientot.label': 'Bientôt',
  'bientot.aria': 'Fonctionnalité à venir',
```

Dans `apps/dashboard/src/i18n/en.ts`, au même endroit :

```ts
  'bientot.label': 'Soon',
  'bientot.aria': 'Upcoming feature',
```

- [ ] **Step 4: Écrire le composant**

`apps/dashboard/src/ui/kit/Bientot.module.css` :

```css
.zone {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

/*
 * Le contenu reste lisible, pas fantomatique : on doit voir ce qui arrive.
 * 0.55 laisse la structure perceptible tout en la distinguant sans ambiguite
 * de ce qui fonctionne.
 */
.contenu {
  flex: 1;
  min-width: 0;
  opacity: 0.55;
}

.marqueur {
  flex: none;
  cursor: help;
}
```

`apps/dashboard/src/ui/kit/Bientot.tsx` :

```tsx
import type { ReactNode } from 'react';
import { useT } from '../preferences.js';
import { Badge } from './Badge.js';
import { Tooltip } from './Tooltip.js';
import styles from './Bientot.module.css';

interface Props {
  /** Pourquoi ce n'est pas encore là. Une phrase, affichée telle quelle. */
  raison: string;
  children: ReactNode;
}

/**
 * Ce que la maquette montre et que la base ne sait pas encore.
 *
 * Le composant est rendu, visible, mais inerte et annoncé comme tel. Trois
 * choix, chacun pour une raison :
 *
 * - **`inert`** retire tout le sous-arbre du parcours clavier et de l'arbre
 *   d'accessibilité. Sans lui, on tabule vers un bouton qui ne fait rien —
 *   une impasse silencieuse, pire qu'une absence.
 * - **La raison est obligatoire.** Un « indisponible » sans motif se lit comme
 *   une panne, et remonte comme un bug.
 * - **Le marqueur reste hors de la zone inerte**, sinon son infobulle serait
 *   elle aussi inatteignable — on annoncerait sans pouvoir être lu.
 *
 * Chaque usage doit avoir sa ligne dans `docs/design/HANDOFF.md`.
 */
export function Bientot({ raison, children }: Props) {
  const t = useT();
  return (
    <div className={styles.zone}>
      <div className={styles.contenu} aria-disabled="true" inert="">
        {children}
      </div>
      <span className={styles.marqueur}>
        <Tooltip intitule={t('bientot.aria')} contenu={raison}>
          <span tabIndex={0}>
            <Badge ton="info">{t('bientot.label')}</Badge>
          </span>
        </Tooltip>
      </span>
    </div>
  );
}
```

Note sur `inert=""` : React 18 ne connaît pas `inert` comme propriété typée et le sérialise comme attribut si on lui passe une chaîne. `inert={true}` produirait `inert="true"`, que le navigateur accepte aussi, mais TypeScript le refuse sur React 18. Si `tsc` proteste malgré tout, ajouter dans `apps/dashboard/src/vite-env.d.ts` (le créer s'il n'existe pas) :

```ts
declare namespace React {
  interface HTMLAttributes<T> {
    inert?: '' | undefined;
  }
}
```

- [ ] **Step 5: Lancer les tests et le typecheck**

Run: `pnpm --filter @prospeo/dashboard test -- Bientot && pnpm --filter @prospeo/dashboard typecheck`
Expected: PASS, 3 tests, et aucune erreur de type.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/ui/kit/Bientot.tsx apps/dashboard/src/ui/kit/Bientot.module.css apps/dashboard/src/ui/kit/Bientot.test.tsx apps/dashboard/src/i18n/
git commit -m "feat(ui): l'affordance « bientot » — montrer ce qui vient, dire pourquoi

La maquette est par endroits en avance sur la base. Un ecran ampute
fait croire a un oubli ; un ecran qui annonce sa suite est une promesse
tenable. inert retire le sous-arbre du parcours clavier : tabuler vers
un bouton inerte est une impasse silencieuse."
```

---

## Task 5: Card et EmptyState

**Files:**
- Create: `apps/dashboard/src/ui/kit/Card.tsx`, `apps/dashboard/src/ui/kit/Card.module.css`
- Create: `apps/dashboard/src/ui/kit/EmptyState.tsx`
- Test: `apps/dashboard/src/ui/kit/Card.test.tsx`

**Interfaces:**
- Consomme : tokens (tâche 1).
- Produit :
  - `Card(props: { titre?: string; extra?: ReactNode; children: ReactNode })`
  - `Field(props: { label: string; children: ReactNode })`
  - `Absent(props: { children: ReactNode })`
  - `EmptyState(props: { titre: string; detail: string })`

`Absent` est la brique qui porte la doctrine du chantier 1 : l'absence se nomme, elle ne s'efface pas en gris pâle.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/kit/Card.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../../test-utils.js';
import { Absent, Card, Field } from './Card.js';
import { EmptyState } from './EmptyState.js';

describe('Card', () => {
  it('rend son titre et son contenu', () => {
    renderWithPreferences(
      <Card titre="Identité">
        <Field label="SIRET">812 456 789 00023</Field>
      </Card>,
    );
    expect(screen.getByText('Identité')).toBeDefined();
    expect(screen.getByText('SIRET')).toBeDefined();
    expect(screen.getByText('812 456 789 00023')).toBeDefined();
  });

  it('marque l absence comme un etat, sans la faire disparaitre', () => {
    // Quatre prospects sur cinq n'ont ni enrichissement ni score : l'absence
    // est l'affichage le plus frequent de l'application.
    const { container } = renderWithPreferences(<Absent>non publié par la source</Absent>);
    expect(screen.getByText('non publié par la source')).toBeDefined();
    expect(container.querySelector('[data-absent="true"]')).not.toBeNull();
  });
});

describe('EmptyState', () => {
  it('nomme le vide et dit ce qu il signifie', () => {
    renderWithPreferences(
      <EmptyState titre="Aucune relance due" detail="Les engagements tenus disparaissent d'ici." />,
    );
    expect(screen.getByText('Aucune relance due')).toBeDefined();
    expect(screen.getByText(/engagements tenus/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- Card`
Expected: FAIL — `Failed to resolve import "./Card.js"`.

- [ ] **Step 3: Écrire les composants**

`apps/dashboard/src/ui/kit/Card.module.css` :

```css
.card {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.entete {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.titre {
  margin: 0;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-muted);
  font-weight: 600;
}

.extra {
  margin-left: auto;
}

.field {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--text-sm);
  padding: 3px 0;
}

.fieldLabel {
  color: var(--color-text-muted);
  flex: none;
}

.fieldValue {
  text-align: right;
  overflow-wrap: anywhere;
}

/*
 * L'absence est en italique et non en gris pale : elle doit se lire, pas
 * s'effacer. C'est l'etat de quatre prospects sur cinq, et la distinction
 * entre « pas encore collecte » et « non publie par la source » est un acquis
 * du chantier 1 qu'un affichage timide dilapiderait.
 */
.absent {
  font-style: italic;
  color: var(--color-text-faint);
}

.vide {
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-4);
  text-align: center;
}

.videTitre {
  font-size: var(--text-sm);
  font-weight: 600;
  margin: 0 0 3px;
}

.videDetail {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.55;
}
```

`apps/dashboard/src/ui/kit/Card.tsx` :

```tsx
import type { ReactNode } from 'react';
import styles from './Card.module.css';

/** Une carte de faits : un titre discret, des couples libellé/valeur. */
export function Card({
  titre,
  extra,
  children,
}: {
  titre?: string;
  /** Contenu aligné à droite du titre — un badge, le plus souvent. */
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      {titre === undefined && extra === undefined ? null : (
        <header className={styles.entete}>
          {titre === undefined ? null : <h3 className={styles.titre}>{titre}</h3>}
          {extra === undefined ? null : <span className={styles.extra}>{extra}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Un couple libellé / valeur. La valeur est à droite, alignée. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{children}</span>
    </div>
  );
}

/**
 * Une valeur absente, nommée.
 *
 * `data-absent` permet aux tests d'affirmer que l'absence a été rendue *comme
 * telle*, et non remplacée par une chaîne vide ou un tiret — les deux se
 * lisant comme un défaut d'affichage.
 */
export function Absent({ children }: { children: ReactNode }) {
  return (
    <span className={styles.absent} data-absent="true">
      {children}
    </span>
  );
}
```

`apps/dashboard/src/ui/kit/EmptyState.tsx` :

```tsx
import styles from './Card.module.css';

/**
 * Un vide nommé.
 *
 * `detail` n'est pas décoratif : il dit *pourquoi* c'est vide. « Aucune
 * relance due » seul laisse croire à un chargement raté ; « les engagements
 * tenus disparaissent d'ici » dit que le vide est le résultat normal du
 * travail fait.
 */
export function EmptyState({ titre, detail }: { titre: string; detail: string }) {
  return (
    <div className={styles.vide}>
      <p className={styles.videTitre}>{titre}</p>
      <p className={styles.videDetail}>{detail}</p>
    </div>
  );
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/dashboard test -- Card`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/ui/kit/Card.tsx apps/dashboard/src/ui/kit/Card.module.css apps/dashboard/src/ui/kit/EmptyState.tsx apps/dashboard/src/ui/kit/Card.test.tsx
git commit -m "feat(ui): Card, Field, Absent, EmptyState

Absent porte la doctrine du chantier 1 : l'absence se nomme, elle ne
s'efface pas en gris pale — c'est l'etat de quatre prospects sur cinq."
```

---

## Task 6: ScoreCompact — la jauge, les trois groupes, le reçu dépliable

**Files:**
- Create: `apps/dashboard/src/ui/ScoreCompact.tsx`, `apps/dashboard/src/ui/ScoreCompact.module.css`
- Modify: `apps/dashboard/src/i18n/fr.ts`, `apps/dashboard/src/i18n/en.ts`
- Test: `apps/dashboard/src/ui/ScoreCompact.test.tsx`

**Interfaces:**
- Consomme : `Tooltip` (tâche 3), `Absent` (tâche 5), `groupBreakdown` de `../domain/score.js`.
- Produit : `ScoreCompact(props: { score: ScoreView | null })`.

**Le cœur de D2.** Le reçu ligne par ligne **reste intégralement accessible** — c'est lui qui rend le barème réglable et vérifiable, et le chantier 1 l'a voulu ainsi. Il cesse simplement d'être déplié par défaut.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/ScoreCompact.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import type { ScoreView } from '../domain/prospect.js';
import { ScoreCompact } from './ScoreCompact.js';

const score = (patch: Partial<ScoreView> = {}): ScoreView => ({
  total: 74,
  rulesetVersion: 'v3',
  computedAt: '2026-09-02T00:00:00Z',
  breakdown: [
    { code: 'presence_none', label: 'Aucune présence web', points: 30, group: 'presence' },
    { code: 'rating', label: 'Note 4,6', points: 16, group: 'vitalite' },
    { code: 'age', label: 'Plus de 3 ans', points: 10, group: 'vitalite' },
    { code: 'phone_mobile', label: 'Mobile trouvé', points: 18, group: 'joignabilite' },
  ],
  ...patch,
});

describe('ScoreCompact', () => {
  it('affiche le total dans la jauge', () => {
    renderWithPreferences(<ScoreCompact score={score()} />);
    expect(screen.getByText('74')).toBeDefined();
  });

  it('affiche une absence de score comme une absence, jamais comme un zero', () => {
    // 114 prospects sur 139. Un « 0 » les ferait lire comme juges sans valeur,
    // alors qu'ils n'ont pas ete juges.
    const { container } = renderWithPreferences(<ScoreCompact score={null} />);
    expect(container.querySelector('[data-absent="true"]')).not.toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('resume les trois groupes sans deplier le recu', () => {
    renderWithPreferences(<ScoreCompact score={score()} />);
    expect(screen.getByText('Présence')).toBeDefined();
    expect(screen.getByText('Vitalité')).toBeDefined();
    expect(screen.getByText('Joignabilité')).toBeDefined();
    // Le detail ligne par ligne n'est pas rendu tant qu'on ne l'ouvre pas.
    expect(screen.queryByText('Note 4,6')).toBeNull();
  });

  it('deplie le recu ligne par ligne a la demande, libelles du bareme intacts', async () => {
    // Les libelles du breakdown sont des DONNEES, ecrites en francais par le
    // bareme du collector. Les traduire supposerait de reimplementer ici la
    // fabrication des libelles, qui deriverait a la premiere evolution des
    // regles (§9.5).
    const user = userEvent.setup();
    renderWithPreferences(<ScoreCompact score={score()} />);
    await user.click(screen.getByRole('button', { name: /reçu/i }));
    expect(screen.getByText('Note 4,6')).toBeDefined();
    expect(screen.getByText('Aucune présence web')).toBeDefined();
  });

  it('donne a la jauge une description chiffree, la couleur seule ne disant rien', () => {
    renderWithPreferences(<ScoreCompact score={score()} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('74');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- ScoreCompact`
Expected: FAIL — `Failed to resolve import "./ScoreCompact.js"`.

- [ ] **Step 3: Ajouter les clés i18n**

Dans `apps/dashboard/src/i18n/fr.ts` :

```ts
  'score.gauge.aria': 'Score de {total} sur 100',
  'score.outOfShort': 'sur 100',
  'score.receipt.open': 'Voir le reçu ligne par ligne',
  'score.receipt.close': 'Masquer le reçu',
```

Dans `apps/dashboard/src/i18n/en.ts` :

```ts
  'score.gauge.aria': 'Score of {total} out of 100',
  'score.outOfShort': 'out of 100',
  'score.receipt.open': 'Show the line-by-line receipt',
  'score.receipt.close': 'Hide the receipt',
```

- [ ] **Step 4: Écrire le composant**

`apps/dashboard/src/ui/ScoreCompact.module.css` :

```css
.wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tete {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.jauge {
  position: relative;
  width: 84px;
  height: 84px;
  flex: none;
}

.jaugeTexte {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.total {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.surCent {
  font-size: 10px;
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.groupes {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: var(--space-3);
}

.groupe {
  flex: 1;
  min-width: 0;
}

.groupeTete {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
  margin-bottom: 5px;
}

.groupeNom {
  color: var(--color-text-muted);
}

.groupePoints {
  font-family: var(--font-mono);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.piste {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-seg-empty);
  overflow: hidden;
}

.remplissage {
  height: 100%;
}

.bascule {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  color: var(--color-accent);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.recu {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
}

.recuGroupe {
  margin-bottom: var(--space-3);
}

.recuGroupeTitre {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-weight: 500;
}

.ligne {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--text-sm);
  padding: 2px 0;
}

.positif {
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.negatif {
  color: var(--color-danger);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

`apps/dashboard/src/ui/ScoreCompact.tsx` :

```tsx
import { useState } from 'react';
import type { ScoreView } from '../domain/prospect.js';
import { groupBreakdown } from '../domain/score.js';
import type { TranslationKey } from '../i18n/translate.js';
import { Absent } from './kit/Card.js';
import { Tooltip } from './kit/Tooltip.js';
import { useT } from './preferences.js';
import styles from './ScoreCompact.module.css';

const CLE_GROUPE: Record<string, TranslationKey> = {
  presence: 'score.group.presence',
  vitalite: 'score.group.vitalite',
  joignabilite: 'score.group.joignabilite',
  disqualifiant: 'score.group.disqualifiant',
};

/** Plafond de chaque bloc au barème, pour donner une échelle aux barres. */
const PLAFOND: Record<string, number> = {
  presence: 30,
  vitalite: 35,
  joignabilite: 35,
  disqualifiant: 100,
};

const COULEUR: Record<string, string> = {
  presence: 'var(--color-seg-presence)',
  vitalite: 'var(--color-seg-vitalite)',
  joignabilite: 'var(--color-seg-joignabilite)',
  disqualifiant: 'var(--color-danger)',
};

const RAYON = 35;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/**
 * Le score : une jauge, trois groupes, et le reçu à la demande.
 *
 * **D2 du chantier n°6.** Le calcul ligne par ligne du §9.3 reste
 * intégralement accessible — c'est lui qui rend le barème réglable et
 * vérifiable. Il cesse seulement d'être déplié en permanence : sur un panneau
 * qui porte déjà trente champs, un reçu de douze lignes toujours ouvert est ce
 * qui rend l'ensemble illisible.
 *
 * Les trois barres donnent la composition d'un coup d'œil ; leur survol livre
 * le détail du groupe ; le reçu complet est à un clic.
 */
export function ScoreCompact({ score }: { score: ScoreView | null }) {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);

  // Un prospect non scoré n'est pas un prospect à zéro, et la distinction
  // remonte jusqu'à l'écran (§ doctrine du chantier 1).
  if (score === null) {
    return <Absent>{t('score.absent.hint')}</Absent>;
  }

  const groupes = groupBreakdown(score.breakdown);
  const remplissage = Math.max(0, Math.min(1, score.total / 100));

  return (
    <div className={styles.wrap}>
      <div className={styles.tete}>
        <div className={styles.jauge}>
          <svg
            width="84"
            height="84"
            viewBox="0 0 84 84"
            role="img"
            aria-label={t('score.gauge.aria', { total: score.total })}
          >
            <circle cx="42" cy="42" r={RAYON} fill="none" stroke="var(--color-seg-empty)" strokeWidth="8" />
            <circle
              cx="42"
              cy="42"
              r={RAYON}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCONFERENCE}
              strokeDashoffset={CIRCONFERENCE * (1 - remplissage)}
              transform="rotate(-90 42 42)"
            />
          </svg>
          <div className={styles.jaugeTexte}>
            <span className={styles.total}>{score.total}</span>
            <span className={styles.surCent}>{t('score.outOfShort')}</span>
          </div>
        </div>

        <div className={styles.groupes}>
          {groupes.map((groupe) => {
            const points = groupe.lines.reduce((somme, l) => somme + l.points, 0);
            const plafond = PLAFOND[groupe.group] ?? 100;
            const part = Math.max(0, Math.min(1, points / plafond));
            const detail = groupe.lines.map((l) => `${l.label} (${l.points >= 0 ? '+' : ''}${l.points})`).join(' · ');
            return (
              <Tooltip
                key={groupe.group}
                intitule={`${t(CLE_GROUPE[groupe.group] ?? 'score.group.presence')} · ${points} / ${plafond}`}
                contenu={detail}
              >
                <div className={styles.groupe} tabIndex={0}>
                  <div className={styles.groupeTete}>
                    <span className={styles.groupeNom}>
                      {t(CLE_GROUPE[groupe.group] ?? 'score.group.presence')}
                    </span>
                    <span className={styles.groupePoints}>{points}</span>
                  </div>
                  <div className={styles.piste}>
                    <div
                      className={styles.remplissage}
                      style={{ width: `${part * 100}%`, background: COULEUR[groupe.group] }}
                    />
                  </div>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <button type="button" className={styles.bascule} onClick={() => setOuvert(!ouvert)}>
        {ouvert ? t('score.receipt.close') : t('score.receipt.open')}
      </button>

      {ouvert ? (
        <div className={styles.recu}>
          {groupes.map((groupe) => (
            <div key={groupe.group} className={styles.recuGroupe}>
              <h4 className={styles.recuGroupeTitre}>
                {t(CLE_GROUPE[groupe.group] ?? 'score.group.presence')}
              </h4>
              {groupe.lines.map((ligne) => (
                <div key={ligne.code} className={styles.ligne}>
                  {/* Libellé du barème : une DONNÉE, affichée telle quelle. */}
                  <span>{ligne.label}</span>
                  <span className={ligne.points >= 0 ? styles.positif : styles.negatif}>
                    {ligne.points >= 0 ? '+' : ''}
                    {ligne.points}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/dashboard test -- ScoreCompact`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/ui/ScoreCompact.tsx apps/dashboard/src/ui/ScoreCompact.module.css apps/dashboard/src/ui/ScoreCompact.test.tsx apps/dashboard/src/i18n/
git commit -m "feat(ui): ScoreCompact — la jauge, trois groupes, le recu a la demande

Le recu ligne par ligne reste integralement accessible : c'est lui qui
rend le bareme reglable et verifiable. Il cesse seulement d'etre deplie
en permanence sur un panneau qui porte deja trente champs."
```

---

## Task 7: Le panneau à onglets

**Files:**
- Modify: `apps/dashboard/src/ui/ProspectPanel.tsx` (réécriture de la coquille)
- Modify: `apps/dashboard/src/ui/ProspectPanel.module.css`
- Modify: `apps/dashboard/src/i18n/fr.ts`, `apps/dashboard/src/i18n/en.ts`
- Test: `apps/dashboard/src/ui/ProspectPanel.test.tsx` (créer)

**Interfaces:**
- Consomme : `Tabs` de `@base-ui/react/tabs`, `ScoreCompact` (tâche 6), `StatusBadge` (tâche 2), `Badge` (tâche 2).
- Produit : `ProspectPanel` conserve **exactement** sa signature actuelle (`prospect`, `actions`, `position`, `currentRulesetVersion`, `onClose`). `TodayScreen` n'est pas modifié.

La signature est préservée délibérément : cela rend la tâche réversible d'un `git revert`, et évite qu'un écran entier casse pendant que le panneau se refait.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/ProspectPanel.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView } from '../domain/prospect.js';
import { ProspectPanel } from './ProspectPanel.js';

const prospect = (patch: Partial<ProspectView> = {}): ProspectView => ({
  id: 'p1',
  siret: '81245678900023',
  denomination: 'PLOMBERIE GUERIN ET FILS',
  denominationUsuelle: 'Plomberie Guérin & Fils',
  tradeSlug: 'plombier',
  address: '14 rue des Olivettes',
  postalCode: '44000',
  city: 'Nantes',
  dateCreation: '2019-03-12',
  effectifCode: '11',
  isClosed: false,
  discoveredAt: '2026-08-30T00:00:00Z',
  score: null,
  presence: null,
  enrichment: null,
  pipeline: { status: 'relance', nextActionAt: '2026-09-02', updatedAt: '2026-09-01T00:00:00Z' },
  site: null,
  messages: [],
  ...patch,
});

describe('ProspectPanel', () => {
  it('affiche le nom d usage plutot que la denomination legale', () => {
    // « PLOMBERIE GUERIN ET FILS » est ce que dit l'INSEE ; l'enseigne est ce
    // que dira l'interlocuteur au telephone.
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Plomberie Guérin & Fils' })).toBeDefined();
  });

  it('n ouvre qu un onglet a la fois — c est tout l objet de la refonte', () => {
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    // L'onglet Fiche est actif au montage ; le contenu des autres n'est pas rendu.
    expect(screen.getByText('SIRET')).toBeDefined();
    expect(screen.queryByRole('heading', { name: /Historique/ })).toBeNull();
  });

  it('bascule d onglet au clic', async () => {
    const user = userEvent.setup();
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    await user.click(screen.getByRole('tab', { name: /Site/ }));
    expect(await screen.findByText(/étage « generate »/)).toBeDefined();
  });

  it('bascule d onglet aux fleches, sans souris', async () => {
    // La navigation clavier d'un jeu d'onglets est une norme ARIA, pas un
    // confort : c'est Base UI qui la fournit, et ce test verifie qu'elle est
    // bien cablee.
    const user = userEvent.setup();
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    await user.click(screen.getByRole('tab', { name: /Fiche/ }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Site/ })).toHaveProperty('tabIndex', 0);
  });

  it('rend une invite quand aucun prospect n est choisi', () => {
    renderWithPreferences(
      <ProspectPanel prospect={null} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    expect(screen.getByText(/Choisir un prospect/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- ProspectPanel`
Expected: FAIL — pas de `role="tab"` dans le rendu actuel.

- [ ] **Step 3: Ajouter les clés i18n**

Dans `apps/dashboard/src/i18n/fr.ts` :

```ts
  'panel.tab.fiche': 'Fiche',
  'panel.tab.site': 'Site',
  'panel.tab.messages': 'Messages',
  'panel.tab.historique': 'Historique',
```

Dans `apps/dashboard/src/i18n/en.ts` :

```ts
  'panel.tab.fiche': 'Details',
  'panel.tab.site': 'Site',
  'panel.tab.messages': 'Messages',
  'panel.tab.historique': 'History',
```

- [ ] **Step 4: Élargir le panneau**

Dans `apps/dashboard/src/ui/ProspectPanel.module.css`, remplacer la règle `.panel` :

```css
/*
 * 720 px et non 380 (D1).
 *
 * L'ancienne largeur imposait une colonne unique pour trente champs, un recu
 * de score et deux messages entiers. La fiche prend la place ; la liste, qui
 * ne porte qu'un nom, une raison et un score, en a moins besoin.
 */
.panel {
  width: 720px;
  flex: none;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
  overflow-y: auto;
  padding: var(--space-4) var(--space-5);
  z-index: var(--z-panel);
}

.onglets {
  display: flex;
  gap: 2px;
  margin-top: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.onglet {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 var(--space-3);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.onglet[data-active] {
  color: var(--color-text);
  font-weight: 600;
  border-bottom-color: var(--color-accent);
}

.panneau {
  padding-top: var(--space-4);
  outline: none;
}

.badges {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--space-2);
  flex-wrap: wrap;
}

.grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.pleineLargeur {
  grid-column: span 2;
}
```

- [ ] **Step 5: Réécrire la coquille du panneau**

Remplacer intégralement `apps/dashboard/src/ui/ProspectPanel.tsx` :

```tsx
import { Tabs } from '@base-ui/react/tabs';
import type { ProspectView } from '../domain/prospect.js';
import { dataWarnings } from '../domain/coherence.js';
import { MessagesSection } from './MessagesSection.js';
import { PipelineSection } from './PipelineSection.js';
import { SiteSection } from './SiteSection.js';
import { WarningList } from './WarningList.js';
import { FicheTab } from './panel/FicheTab.js';
import { HistoriqueTab } from './panel/HistoriqueTab.js';
import { PanelActions } from './PanelActions.js';
import { Badge } from './kit/Badge.js';
import { StatusBadge } from './kit/StatusBadge.js';
import type { PanelActions as Actions } from './actions.js';
import { useT } from './preferences.js';
import styles from './ProspectPanel.module.css';

interface Props {
  prospect: ProspectView | null;
  /**
   * Les écritures, injectées.
   *
   * `null` rend la fiche strictement consultable, et c'est ce que montent les
   * tests des sections de lecture : un composant qui fabriquerait lui-même son
   * client Supabase ne pourrait plus se rendre sans réseau.
   */
  actions?: Actions | null;
  /** Rang affiché dans la file, pour situer le parcours au clavier. */
  position: { index: number; total: number } | null;
  currentRulesetVersion: string;
  onClose: () => void;
}

/**
 * La fiche d'un prospect, en quatre onglets.
 *
 * **D1 du chantier n°6.** Les sept sections empilées de la version précédente
 * ne sont pas sept sujets : ce sont quatre moments distincts du travail. On
 * consulte l'identité avant d'appeler, la rédaction quand on doute du site,
 * les messages quand on rappelle, l'historique quand on ne se souvient plus.
 * Les empiler supposait qu'on ait besoin des quatre en même temps, ce qui
 * n'arrive jamais.
 *
 * La signature du composant est inchangée : `TodayScreen` n'a pas bougé, et un
 * `git revert` de cette tâche restaure l'écran précédent sans rien d'autre.
 */
export function ProspectPanel({
  prospect,
  position,
  currentRulesetVersion,
  onClose,
  actions = null,
}: Props) {
  const t = useT();

  if (prospect === null) {
    return (
      <aside className={styles.panel} aria-label={t('panel.section.identity')}>
        <p className={styles.placeholder}>{t('panel.empty')}</p>
      </aside>
    );
  }

  const nom = prospect.denominationUsuelle ?? prospect.denomination;
  const warnings = dataWarnings(prospect, currentRulesetVersion);
  const enLigne =
    prospect.site !== null &&
    prospect.site.deploymentUrl !== null &&
    prospect.site.unpublishedAt === null;

  return (
    <aside className={styles.panel} aria-label={nom}>
      <header className={styles.header}>
        <div>
          {position !== null ? (
            <span className={styles.position}>
              {t('panel.position', { index: position.index, total: position.total })}
            </span>
          ) : null}
          <h2 className={styles.name}>{nom}</h2>
          <div className={styles.badges}>
            <StatusBadge status={prospect.pipeline?.status ?? null} />
            {enLigne ? (
              <Badge ton="succes" point>
                {t('site.badge.online')}
              </Badge>
            ) : null}
            <Badge>{prospect.tradeSlug}</Badge>
          </div>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('panel.close')}>
          ×
        </button>
      </header>

      <WarningList warnings={warnings} />

      <PanelActions prospect={prospect} />

      <Tabs.Root defaultValue="fiche">
        <Tabs.List className={styles.onglets}>
          <Tabs.Tab className={styles.onglet} value="fiche">
            {t('panel.tab.fiche')}
          </Tabs.Tab>
          <Tabs.Tab className={styles.onglet} value="site">
            {t('panel.tab.site')}
          </Tabs.Tab>
          <Tabs.Tab className={styles.onglet} value="messages">
            {t('panel.tab.messages')}
          </Tabs.Tab>
          <Tabs.Tab className={styles.onglet} value="historique">
            {t('panel.tab.historique')}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel className={styles.panneau} value="fiche">
          <FicheTab prospect={prospect} />
        </Tabs.Panel>

        <Tabs.Panel className={styles.panneau} value="site">
          <SiteSection
            site={prospect.site}
            onRejeter={actions === null ? null : () => actions.rejeterRedaction(prospect.id)}
            onAnnulerRejet={actions === null ? null : () => actions.annulerRejet(prospect.id)}
          />
        </Tabs.Panel>

        <Tabs.Panel className={styles.panneau} value="messages">
          <MessagesSection messages={prospect.messages} />
        </Tabs.Panel>

        <Tabs.Panel className={styles.panneau} value="historique">
          <HistoriqueTab prospect={prospect} />
          <PipelineSection
            pipeline={prospect.pipeline}
            // « En ligne » veut dire déployé ET non retiré : une ligne conserve
            // son `deployment_url` après dépublication, et l'avertissement sur
            // le retrait différé n'aurait alors plus lieu d'être.
            siteEnLigne={enLigne}
            onDefinirStatut={
              actions === null
                ? null
                : (status, nextActionAt) => actions.definirStatut(prospect.id, status, nextActionAt)
            }
            onJournaliser={
              actions === null ? null : (kind, body) => actions.journaliser(prospect.id, kind, body)
            }
          />
        </Tabs.Panel>
      </Tabs.Root>
    </aside>
  );
}
```

Ajouter la clé manquante dans `fr.ts` (`'site.badge.online': 'Site en ligne',`) et dans `en.ts` (`'site.badge.online': 'Site online',`).

- [ ] **Step 6: Lancer toute la suite**

Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`
Expected: PASS. Les tests existants de `SiteSection`, `MessagesSection` et `PipelineSection` montent ces composants directement et ne sont pas affectés.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/ui/ProspectPanel.tsx apps/dashboard/src/ui/ProspectPanel.module.css apps/dashboard/src/ui/ProspectPanel.test.tsx apps/dashboard/src/i18n/
git commit -m "feat(ui): la fiche en quatre onglets, a 720 px

Les sept sections empilees n'etaient pas sept sujets mais quatre moments
du travail : on consulte l'identite avant d'appeler, la redaction quand
on doute du site, les messages quand on rappelle. Les empiler supposait
qu'on ait besoin des quatre en meme temps, ce qui n'arrive jamais.

La signature du composant est inchangee : TodayScreen n'a pas bouge."
```

---

## Task 8: L'onglet Fiche

**Files:**
- Create: `apps/dashboard/src/ui/panel/FicheTab.tsx`
- Test: `apps/dashboard/src/ui/panel/FicheTab.test.tsx`

**Interfaces:**
- Consomme : `Card`, `Field`, `Absent` (tâche 5), `Tooltip` (tâche 3), `ScoreCompact` (tâche 6), `minHeadcount` de `@prospeo/core`.
- Produit : `FicheTab(props: { prospect: ProspectView })`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/panel/FicheTab.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../../test-utils.js';
import type { ProspectView } from '../../domain/prospect.js';
import { FicheTab } from './FicheTab.js';

const base: ProspectView = {
  id: 'p1',
  siret: '81245678900023',
  denomination: 'PLOMBERIE GUERIN ET FILS',
  denominationUsuelle: 'Plomberie Guérin & Fils',
  tradeSlug: 'plombier',
  address: '14 rue des Olivettes',
  postalCode: '44000',
  city: 'Nantes',
  dateCreation: '2019-03-12',
  effectifCode: '11',
  isClosed: false,
  discoveredAt: '2026-08-30T00:00:00Z',
  score: null,
  presence: null,
  enrichment: null,
  pipeline: null,
  site: null,
  messages: [],
};

describe('FicheTab', () => {
  it('affiche les faits d identite', () => {
    renderWithPreferences(<FicheTab prospect={base} />);
    expect(screen.getByText('81245678900023')).toBeDefined();
    expect(screen.getByText(/rue des Olivettes/)).toBeDefined();
  });

  it('n invente pas un effectif quand l INSEE n en publie pas', () => {
    // `minHeadcount` rend null pour « unite non employeuse » et « inconnu ».
    // Afficher « 0 salarie » inventerait un fait que la source ne donne pas.
    renderWithPreferences(<FicheTab prospect={{ ...base, effectifCode: 'NN' }} />);
    expect(screen.queryByText('0 salarié')).toBeNull();
  });

  it('distingue « pas encore collecte » de « non publie par la source »', () => {
    // C'est un acquis du chantier 1 : les deux absences ne se valent pas. Un
    // tiret unique les confondrait, et on relancerait un enrichissement qui
    // ne peut rien rapporter.
    renderWithPreferences(
      <FicheTab
        prospect={{
          ...base,
          enrichment: {
            status: 'ok',
            phoneE164: '+33612345678',
            phoneKind: 'mobile',
            rating: 4.6,
            reviewCount: null,
            declaredUrl: null,
            matchedName: 'Plomberie Guérin',
            matchConfidence: 0.94,
            enrichedAt: '2026-09-01T00:00:00Z',
          },
        }}
      />,
    );
    expect(screen.getByText('non publié par la source')).toBeDefined();
    expect(screen.getByText('non collecté')).toBeDefined();
  });

  it('dit l absence d enrichissement plutot que de montrer des champs vides', () => {
    renderWithPreferences(<FicheTab prospect={base} />);
    expect(screen.getByText(/étage « enrich »/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- FicheTab`
Expected: FAIL — `Failed to resolve import "./FicheTab.js"`.

- [ ] **Step 3: Écrire le composant**

`apps/dashboard/src/ui/panel/FicheTab.tsx` :

```tsx
import { minHeadcount } from '@prospeo/core';
import type { ProspectView } from '../../domain/prospect.js';
import { Absent, Card, Field } from '../kit/Card.js';
import { Badge } from '../kit/Badge.js';
import { Tooltip } from '../kit/Tooltip.js';
import { ScoreCompact } from '../ScoreCompact.js';
import { useT } from '../preferences.js';
import styles from '../ProspectPanel.module.css';

/**
 * L'onglet consulté avant d'appeler.
 *
 * Deux cartes de faits côte à côte, puis la composition du score. C'est
 * l'ordre du geste : on vérifie à qui on parle, on vérifie qu'on peut le
 * joindre, on se rappelle pourquoi il est dans la file.
 */
export function FicheTab({ prospect }: { prospect: ProspectView }) {
  const t = useT();
  const enrichment = prospect.enrichment;
  const effectif = minHeadcount(prospect.effectifCode);

  return (
    <div className={styles.grille}>
      <Card titre={t('panel.section.identity')}>
        <Field label={t('field.siret')}>{prospect.siret}</Field>
        <Field label={t('field.address')}>
          {`${prospect.address}, ${prospect.postalCode} ${prospect.city}`}
        </Field>
        <Field label={t('field.created')}>
          {prospect.dateCreation ?? <Absent>{t('value.unknown')}</Absent>}
        </Field>
        <Field label={t('field.staff')}>
          {/* `minHeadcount` rend `null` pour les codes « unité non employeuse »
              ou « inconnu » : afficher « 0 salarié » inventerait un fait que
              l'INSEE ne fournit pas. */}
          {effectif === null ? (
            <Absent>{t('value.unknown')}</Absent>
          ) : (
            t('unit.employees', { count: effectif })
          )}
        </Field>
      </Card>

      <Card
        titre={t('panel.section.contact')}
        extra={
          enrichment === null || enrichment.matchConfidence === null ? undefined : (
            <Tooltip
              intitule={t('field.matchConfidence')}
              contenu={t('enrichment.confidence.hint')}
            >
              <span tabIndex={0}>
                <Badge ton={enrichment.matchConfidence >= 0.9 ? 'succes' : 'alerte'}>
                  {`${Math.round(enrichment.matchConfidence * 100)} %`}
                </Badge>
              </span>
            </Tooltip>
          )
        }
      >
        {enrichment === null ? (
          <Absent>{t('enrichment.absent')}</Absent>
        ) : (
          <>
            <Field label={t('field.phone')}>
              {enrichment.phoneE164 === null ? (
                <Absent>{t('value.notCollected')}</Absent>
              ) : (
                enrichment.phoneE164
              )}
            </Field>
            <Field label={t('field.rating')}>
              {enrichment.rating === null ? (
                <Absent>{t('value.notCollected')}</Absent>
              ) : (
                enrichment.rating.toFixed(1)
              )}
            </Field>
            <Field label={t('field.reviewCount')}>
              {enrichment.reviewCount === null ? (
                // Google ne publie plus le nombre d'avis : ce n'est pas un
                // étage manquant, c'est une donnée que la source a retirée.
                // Confondre les deux ferait relancer un enrichissement qui ne
                // peut rien rapporter.
                <Tooltip intitule={t('value.notPublished')} contenu={t('enrichment.reviews.hint')}>
                  <span tabIndex={0}>
                    <Absent>{t('value.notPublished')}</Absent>
                  </span>
                </Tooltip>
              ) : (
                String(enrichment.reviewCount)
              )}
            </Field>
            <Field label={t('field.declaredUrl')}>
              {enrichment.declaredUrl === null ? (
                <Absent>{t('value.notCollected')}</Absent>
              ) : (
                enrichment.declaredUrl
              )}
            </Field>
          </>
        )}
      </Card>

      <div className={styles.pleineLargeur}>
        <Card titre={t('panel.section.score')}>
          <ScoreCompact score={prospect.score} />
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Ajouter les clés i18n manquantes**

Dans `apps/dashboard/src/i18n/fr.ts` :

```ts
  'enrichment.reviews.hint':
    'Google ne publie plus le nombre d’avis depuis août 2026. Relancer l’enrichissement ne remplira pas ce champ.',
  'enrichment.confidence.hint':
    'Confiance de l’appariement avec la fiche Google. Sous le seuil haut, le rattachement est un pari — et c’est au téléphone qu’un faux appariement se paie.',
```

Dans `apps/dashboard/src/i18n/en.ts` :

```ts
  'enrichment.reviews.hint':
    'Google stopped publishing review counts in August 2026. Re-running enrichment will not fill this field.',
  'enrichment.confidence.hint':
    'Confidence in the match with the Google listing. Below the high threshold the match is a bet — and a wrong match is paid for on the phone.',
```

Vérifier que `value.notCollected`, `value.notPublished`, `value.unknown`, `enrichment.absent` et `unit.employees` existent déjà dans `fr.ts` — c'est le cas ; ne pas les redéfinir.

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/dashboard test -- FicheTab`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/ui/panel/FicheTab.tsx apps/dashboard/src/ui/panel/FicheTab.test.tsx apps/dashboard/src/i18n/
git commit -m "feat(ui): l'onglet Fiche — deux cartes, puis le score

L'ordre du geste : on verifie a qui on parle, qu'on peut le joindre,
puis pourquoi il est dans la file. Les deux natures d'absence sont
desormais expliquees a l'ecran et non plus seulement en commentaire."
```

---

## Task 9: L'onglet Historique — et ce qui lui manque

**Files:**
- Create: `apps/dashboard/src/ui/panel/HistoriqueTab.tsx`, `apps/dashboard/src/ui/panel/HistoriqueTab.module.css`
- Test: `apps/dashboard/src/ui/panel/HistoriqueTab.test.tsx`

**Interfaces:**
- Consomme : `Bientot` (tâche 4), `EmptyState` (tâche 5).
- Produit : `HistoriqueTab(props: { prospect: ProspectView })`.

**Le cas d'usage direct de la tâche 4.** La maquette montre une frise mêlant les appels et les événements de site (« Dépôt créé », « Site déployé »). Les interactions existent — `interaction.occurred_at` —, mais **`ProspectView` ne les expose pas**, et les événements de site n'ont aucune table (§4.1). La frise est donc rendue avec les seules dates que `prospect_site` porte, et le reste est annoncé par `Bientot`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/panel/HistoriqueTab.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../../test-utils.js';
import type { ProspectView } from '../../domain/prospect.js';
import { HistoriqueTab } from './HistoriqueTab.js';

const base: ProspectView = {
  id: 'p1',
  siret: '81245678900023',
  denomination: 'PLOMBERIE GUERIN ET FILS',
  denominationUsuelle: 'Plomberie Guérin & Fils',
  tradeSlug: 'plombier',
  address: '14 rue des Olivettes',
  postalCode: '44000',
  city: 'Nantes',
  dateCreation: '2019-03-12',
  effectifCode: '11',
  isClosed: false,
  discoveredAt: '2026-08-30T00:00:00Z',
  score: null,
  presence: null,
  enrichment: null,
  pipeline: null,
  site: null,
  messages: [],
};

describe('HistoriqueTab', () => {
  it('jalonne au moins la decouverte, qui est toujours connue', () => {
    renderWithPreferences(<HistoriqueTab prospect={base} />);
    expect(screen.getByText(/Découvert/)).toBeDefined();
  });

  it('reprend les dates que prospect_site porte reellement', () => {
    renderWithPreferences(
      <HistoriqueTab
        prospect={{
          ...base,
          site: {
            repoUrl: 'https://github.com/prospeo/x',
            deploymentUrl: 'https://x.vercel.app',
            promptVersion: 'v4',
            model: 'claude-opus-5',
            generatedAt: '2026-09-01T14:18:00Z',
            publishedAt: '2026-09-01T14:22:00Z',
            unpublishedAt: null,
            contentRejectedAt: null,
            redaction: null,
          },
        }}
      />,
    );
    expect(screen.getByText(/Rédaction générée/)).toBeDefined();
    expect(screen.getByText(/Site publié/)).toBeDefined();
  });

  it('annonce le journal detaille comme a venir, en disant pourquoi', () => {
    // La maquette montre une frise pas-a-pas. Aucune table d'evenements
    // n'existe : la masquer ferait croire a un oubli, l'inventer serait pire.
    const { container } = renderWithPreferences(<HistoriqueTab prospect={base} />);
    expect(screen.getByText('Bientôt')).toBeDefined();
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- HistoriqueTab`
Expected: FAIL — `Failed to resolve import "./HistoriqueTab.js"`.

- [ ] **Step 3: Ajouter les clés i18n**

Dans `apps/dashboard/src/i18n/fr.ts` :

```ts
  'histo.discovered': 'Découvert en base',
  'histo.generated': 'Rédaction générée',
  'histo.published': 'Site publié',
  'histo.unpublished': 'Site retiré',
  'histo.rejected': 'Rédaction refusée',
  'histo.detail.title': 'Journal détaillé des étapes',
  'histo.detail.reason':
    'Chaque étape de déploiement sera datée ici — dépôt, projet, build, mise en ligne. Il manque pour cela une table d’événements : `prospect_site` ne porte qu’un état courant, pas un historique.',
```

Dans `apps/dashboard/src/i18n/en.ts` :

```ts
  'histo.discovered': 'Added to the base',
  'histo.generated': 'Copy generated',
  'histo.published': 'Site published',
  'histo.unpublished': 'Site taken down',
  'histo.rejected': 'Copy rejected',
  'histo.detail.title': 'Step-by-step deployment log',
  'histo.detail.reason':
    'Every deployment step will be dated here — repository, project, build, go-live. That needs an events table: `prospect_site` holds a current state, not a history.',
```

- [ ] **Step 4: Écrire le composant**

`apps/dashboard/src/ui/panel/HistoriqueTab.module.css` :

```css
.frise {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--space-4);
}

.evenement {
  display: flex;
  gap: var(--space-3);
}

.colonne {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: none;
  width: 10px;
}

.puce {
  width: 9px;
  height: 9px;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  flex: none;
}

.trait {
  flex: 1;
  width: 1px;
  background: var(--color-border);
  min-height: 16px;
}

.corps {
  flex: 1;
  min-width: 0;
  padding-bottom: var(--space-4);
  margin-top: -3px;
}

.titre {
  font-size: var(--text-sm);
  font-weight: 600;
}

.date {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-faint);
  margin-left: var(--space-2);
}
```

`apps/dashboard/src/ui/panel/HistoriqueTab.tsx` :

```tsx
import type { ProspectView } from '../../domain/prospect.js';
import type { TranslationKey } from '../../i18n/translate.js';
import { Bientot } from '../kit/Bientot.js';
import { EmptyState } from '../kit/EmptyState.js';
import { useT } from '../preferences.js';
import styles from './HistoriqueTab.module.css';

/** `2026-09-01T14:22:00Z` → `01/09/2026`. */
function jour(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/**
 * La frise des jalons connus.
 *
 * **Ce qu'elle ne montre pas, et pourquoi.** La maquette dessine une frise
 * pas-à-pas — dépôt créé, build réussi, appel passé. Deux sources manquent :
 * `interaction` existe en base mais `ProspectView` ne l'expose pas, et les
 * étapes de déploiement n'ont aucune table (§4.1 du chantier n°6).
 *
 * On montre donc les seules dates que `prospect_site` porte réellement, et on
 * annonce le reste plutôt que de le masquer : un écran amputé se lit comme un
 * oubli, et une frise inventée serait pire.
 */
export function HistoriqueTab({ prospect }: { prospect: ProspectView }) {
  const t = useT();
  const site = prospect.site;

  const jalons: { cle: TranslationKey; date: string }[] = [
    { cle: 'histo.discovered', date: prospect.discoveredAt },
  ];
  if (site?.generatedAt != null) jalons.push({ cle: 'histo.generated', date: site.generatedAt });
  if (site?.publishedAt != null) jalons.push({ cle: 'histo.published', date: site.publishedAt });
  if (site?.contentRejectedAt != null) {
    jalons.push({ cle: 'histo.rejected', date: site.contentRejectedAt });
  }
  if (site?.unpublishedAt != null) {
    jalons.push({ cle: 'histo.unpublished', date: site.unpublishedAt });
  }

  jalons.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <div>
      <div className={styles.frise}>
        {jalons.map((jalon, i) => (
          <div key={jalon.cle} className={styles.evenement}>
            <div className={styles.colonne}>
              <span className={styles.puce} />
              {i === jalons.length - 1 ? null : <span className={styles.trait} />}
            </div>
            <div className={styles.corps}>
              <span className={styles.titre}>{t(jalon.cle)}</span>
              <span className={styles.date}>{jour(jalon.date)}</span>
            </div>
          </div>
        ))}
      </div>

      <Bientot raison={t('histo.detail.reason')}>
        <EmptyState titre={t('histo.detail.title')} detail={t('histo.detail.reason')} />
      </Bientot>
    </div>
  );
}
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm --filter @prospeo/dashboard test -- HistoriqueTab`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/ui/panel/HistoriqueTab.tsx apps/dashboard/src/ui/panel/HistoriqueTab.module.css apps/dashboard/src/ui/panel/HistoriqueTab.test.tsx apps/dashboard/src/i18n/
git commit -m "feat(ui): l'onglet Historique, et ce qui lui manque

Les seules dates que prospect_site porte reellement sont affichees ; le
journal pas-a-pas est annonce par Bientot avec son motif. Un ecran
ampute se lit comme un oubli, une frise inventee serait pire."
```

---

## Task 10: La barre d'actions primaires

**Files:**
- Create: `apps/dashboard/src/ui/PanelActions.tsx`, `apps/dashboard/src/ui/PanelActions.module.css`
- Test: `apps/dashboard/src/ui/PanelActions.test.tsx`

**Interfaces:**
- Consomme : `Bientot` (tâche 4).
- Produit : `PanelActions(props: { prospect: ProspectView })`.

**Une seule action en plein, les autres en contour.** Le principe de la page marchande vaut ici : une action primaire par écran, répétée, jamais trois boutons qui se disputent. La primaire est l'appel — c'est le geste que l'écran sert.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/dashboard/src/ui/PanelActions.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView } from '../domain/prospect.js';
import { PanelActions } from './PanelActions.js';

const base: ProspectView = {
  id: 'p1',
  siret: '81245678900023',
  denomination: 'PLOMBERIE GUERIN ET FILS',
  denominationUsuelle: 'Plomberie Guérin & Fils',
  tradeSlug: 'plombier',
  address: '14 rue des Olivettes',
  postalCode: '44000',
  city: 'Nantes',
  dateCreation: '2019-03-12',
  effectifCode: '11',
  isClosed: false,
  discoveredAt: '2026-08-30T00:00:00Z',
  score: null,
  presence: null,
  enrichment: null,
  pipeline: null,
  site: null,
  messages: [],
};

const avecTelephone = {
  ...base,
  enrichment: {
    status: 'ok' as const,
    phoneE164: '+33612345678',
    phoneKind: 'mobile' as const,
    rating: null,
    reviewCount: null,
    declaredUrl: null,
    matchedName: null,
    matchConfidence: null,
    enrichedAt: '2026-09-01T00:00:00Z',
  },
};

describe('PanelActions', () => {
  it('fait de l appel un lien tel: — le geste que l ecran sert', () => {
    renderWithPreferences(<PanelActions prospect={avecTelephone} />);
    const lien = screen.getByRole('link', { name: /Appeler/ });
    expect(lien.getAttribute('href')).toBe('tel:+33612345678');
  });

  it('n offre pas d appeler quand aucun numero n a ete collecte', () => {
    // Un bouton d'appel sans numero est une promesse creuse : on clique, rien
    // ne se passe, et rien ne dit pourquoi.
    renderWithPreferences(<PanelActions prospect={base} />);
    expect(screen.queryByRole('link', { name: /Appeler/ })).toBeNull();
    expect(screen.getByText(/Aucun numéro/)).toBeDefined();
  });

  it('ouvre le site en ligne sans laisser la page ouverte nous rediriger', () => {
    renderWithPreferences(
      <PanelActions
        prospect={{
          ...base,
          site: {
            repoUrl: null,
            deploymentUrl: 'https://x.vercel.app',
            promptVersion: null,
            model: null,
            generatedAt: null,
            publishedAt: '2026-09-01T00:00:00Z',
            unpublishedAt: null,
            contentRejectedAt: null,
            redaction: null,
          },
        }}
      />,
    );
    const lien = screen.getByRole('link', { name: /Voir le site/ });
    expect(lien.getAttribute('rel')).toContain('noopener');
  });

  it('annonce le redeploiement comme a venir plutot que d offrir un bouton inerte', () => {
    const { container } = renderWithPreferences(<PanelActions prospect={base} />);
    expect(screen.getByText('Bientôt')).toBeDefined();
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @prospeo/dashboard test -- PanelActions`
Expected: FAIL — `Failed to resolve import "./PanelActions.js"`.

- [ ] **Step 3: Ajouter les clés i18n**

Dans `apps/dashboard/src/i18n/fr.ts` :

```ts
  'action.call': 'Appeler {phone}',
  'action.noPhone': 'Aucun numéro collecté',
  'action.openSite': 'Voir le site',
  'action.redeploy': 'Redéployer',
  'action.redeploy.reason':
    'Le déclenchement d’un déploiement depuis l’interface arrive avec le lot 2. Aujourd’hui, `publish` et `deploy` ne s’appellent que depuis le collector en ligne de commande.',
```

Dans `apps/dashboard/src/i18n/en.ts` :

```ts
  'action.call': 'Call {phone}',
  'action.noPhone': 'No number collected',
  'action.openSite': 'Open the site',
  'action.redeploy': 'Redeploy',
  'action.redeploy.reason':
    'Triggering a deployment from the interface ships with batch 2. Today `publish` and `deploy` are only callable from the command-line collector.',
```

- [ ] **Step 4: Écrire le composant**

`apps/dashboard/src/ui/PanelActions.module.css` :

```css
.barre {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
  flex-wrap: wrap;
}

.bouton {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  background: none;
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-sm);
  text-decoration: none;
  cursor: pointer;
}

.bouton:hover {
  border-color: var(--color-accent);
}

/*
 * Une seule action en plein par ecran. Trois boutons pleins se disputent
 * l'attention et n'en obtiennent aucune.
 */
.primaire {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-bg);
  font-weight: 600;
}

.primaire:hover {
  border-color: var(--color-accent);
  filter: brightness(1.08);
}

.absent {
  font-size: var(--text-sm);
  font-style: italic;
  color: var(--color-text-faint);
}
```

`apps/dashboard/src/ui/PanelActions.tsx` :

```tsx
import type { ProspectView } from '../domain/prospect.js';
import { Bientot } from './kit/Bientot.js';
import { useT } from './preferences.js';
import styles from './PanelActions.module.css';

/**
 * Les actions primaires de la fiche.
 *
 * **Une seule en plein.** L'appel : c'est le geste que l'écran sert, et le
 * reste n'est qu'accessoire. Trois boutons pleins se disputeraient l'attention
 * sans qu'aucun l'obtienne.
 *
 * Le numéro absent ne produit pas un bouton désactivé mais une phrase : un
 * bouton d'appel sans numéro est une promesse creuse — on clique, rien ne se
 * passe, et rien ne dit pourquoi.
 */
export function PanelActions({ prospect }: { prospect: ProspectView }) {
  const t = useT();
  const telephone = prospect.enrichment?.phoneE164 ?? null;
  const enLigne =
    prospect.site !== null &&
    prospect.site.deploymentUrl !== null &&
    prospect.site.unpublishedAt === null;

  return (
    <div className={styles.barre}>
      {telephone === null ? (
        <span className={styles.absent}>{t('action.noPhone')}</span>
      ) : (
        <a className={`${styles.bouton} ${styles.primaire}`} href={`tel:${telephone}`}>
          {t('action.call', { phone: telephone })}
        </a>
      )}

      {enLigne && prospect.site?.deploymentUrl != null ? (
        <a
          className={styles.bouton}
          href={prospect.site.deploymentUrl}
          target="_blank"
          // `noopener` : une page ouverte par `target="_blank"` garde sinon une
          // référence vers celle-ci et peut la rediriger.
          rel="noreferrer noopener"
        >
          {t('action.openSite')}
        </a>
      ) : null}

      <Bientot raison={t('action.redeploy.reason')}>
        <span className={styles.bouton}>{t('action.redeploy')}</span>
      </Bientot>
    </div>
  );
}
```

- [ ] **Step 5: Lancer toute la suite et le typecheck**

Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`
Expected: PASS sur l'ensemble.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/ui/PanelActions.tsx apps/dashboard/src/ui/PanelActions.module.css apps/dashboard/src/ui/PanelActions.test.tsx apps/dashboard/src/i18n/
git commit -m "feat(ui): la barre d'actions — une seule primaire, l'appel

Le numero absent produit une phrase et non un bouton desactive : un
bouton d'appel sans numero est une promesse creuse. Le redeploiement
est annonce par Bientot, le declenchement arrivant au lot 2."
```

---

## Task 11: Le handoff — ce que la maquette montre et que la base ne sait pas

**Files:**
- Create: `docs/design/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-09-02-refonte-ui-ux.md` (corriger D8)
- Modify: `docs/design/maquettes/README.md` (lien mort du canvas)

**Interfaces:**
- Consomme : les usages de `Bientot` posés aux tâches 9 et 10.
- Produit : le document que le lot 2 lit en premier.

- [ ] **Step 1: Recenser les usages de `Bientot`**

```bash
grep -rn "Bientot" apps/dashboard/src --include=*.tsx | grep -v "kit/Bientot" | grep -v ".test."
```

Expected : deux occurrences — `panel/HistoriqueTab.tsx` et `PanelActions.tsx`. Toute occurrence supplémentaire doit avoir sa ligne dans le tableau de l'étape 2.

- [ ] **Step 2: Écrire le handoff**

Créer `docs/design/HANDOFF.md` :

```markdown
# Handoff — ce que la maquette montre et que la base ne sait pas encore

> Mis à jour à la fin du lot 1. À relire avant d'ouvrir le lot 2.
>
> Règle : **toute zone d'interface rendue inerte par `<Bientot>` a sa ligne
> ici.** Une affordance « bientôt » sans entrée dans ce tableau est un oubli,
> pas une décision.

## Ce qui est en place à la fin du lot 1

| Composant | Fichier | État |
|---|---|---|
| Tokens, trois fontes, contraste AA | `src/ui/theme.css` | livré |
| `Badge`, `StatusBadge` | `src/ui/kit/` | livré |
| `Tooltip` (Base UI) | `src/ui/kit/Tooltip.tsx` | livré |
| `Bientot` | `src/ui/kit/Bientot.tsx` | livré |
| `Card`, `Field`, `Absent`, `EmptyState` | `src/ui/kit/` | livré |
| `ScoreCompact` | `src/ui/ScoreCompact.tsx` | livré |
| Fiche à 720 px, quatre onglets | `src/ui/ProspectPanel.tsx` | livré |

## Ce qui est annoncé mais pas alimenté

| Zone | Fichier | Ce qui manque | Débloqué par |
|---|---|---|---|
| Journal pas-à-pas d'un déploiement | `src/ui/panel/HistoriqueTab.tsx` | Aucune table d'événements. `prospect_site` porte un état courant, pas un historique : ni durée d'étape, ni cause d'échec, ni journal. | Migration §4.1 — lot 2 |
| Bouton « Redéployer » | `src/ui/PanelActions.tsx` | `publish` et `deploy` ne s'appellent que depuis le collector en ligne de commande. Aucun déclencheur côté dashboard. | Lot 2 |

## Ce qui n'est pas encore maquetté ni construit

| Sujet | Décision | Blocage |
|---|---|---|
| Écran de suivi des déploiements | D9 | Migration §4.1 |
| Écran de gabarit GitHub | D10 | — (constructible dès le lot 2) |
| Série, objectif, palier, badges | D5 | §4.2 : `prospect_pipeline` écrase son passé, donc « relance tenue » n'a aucune source. La **série** se calcule depuis `interaction.occurred_at`, qui existe. |
| Écran « Base » (les 139 prospects) | hors périmètre du chantier n°6 | — |

## La question ouverte du lot 3

`prospect_pipeline` ne porte que `status` et `updated_at`. Savoir qu'une
relance a été *tenue* suppose de connaître la `next_action_at` en vigueur au
moment de l'interaction — information que rien ne conserve.

Deux issues, à trancher avant d'ouvrir le lot 3 :

1. une table d'historique du pipeline, une ligne par changement de statut ;
2. une définition plus faible de la série — « un jour avec au moins une
   interaction » —, honnête mais moins signifiante.

Tant que ce n'est pas tranché, ne pas afficher de compteur de série : un
chiffre motivant fondé sur rien est pire que pas de chiffre.
```

- [ ] **Step 3: Corriger les deux défauts de la doc du chantier n°6**

Dans `docs/superpowers/plans/2026-09-02-refonte-ui-ux.md`, décision D8, remplacer :

```
**Retenu :** `@base-ui-components/react` pour Tooltip, Tabs, Popover, Select,
```

par :

```
**Retenu :** `@base-ui/react` (1.7.0) pour Tooltip, Tabs, Popover, Select,
```

`@base-ui-components/react` est l'ancien nom du paquet, figé à `1.0.0-rc.0` ; le paquet maintenu est `@base-ui/react`, dont les pairs `date-fns` sont optionnels et qui déclare `react: ^17 || ^18 || ^19`.

Puis, dans le même fichier et dans `docs/design/maquettes/README.md`, remplacer la ligne du canvas en ligne par :

```
> **Maquettes :** `docs/design/maquettes/` — sources des artboards. Le canvas
> en ligne qui les portait a été supprimé ; les fichiers de ce dossier
> suffisent à le reconstruire.
```

- [ ] **Step 4: Vérifier que rien n'est cassé**

Run: `pnpm --filter @prospeo/dashboard test && pnpm --filter @prospeo/dashboard typecheck`
Expected: PASS sur l'ensemble de la suite.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: le handoff du lot 1, et deux corrections

Toute zone rendue inerte par Bientot a desormais sa ligne dans
HANDOFF.md : une affordance « bientot » sans entree est un oubli, pas
une decision.

D8 nommait @base-ui-components/react, ancien nom figé a 1.0.0-rc.0 ; le
paquet maintenu est @base-ui/react. Le lien du canvas, supprime depuis,
est remplace par un renvoi aux sources."
```

---

## Auto-revue

**Couverture des décisions du chantier n°6.** D1 → tâche 7. D2 → tâche 6. D3 → tâche 2. D4 → tâches 3, 8. D6 → tâche 1. D7 → tâche 1. D8 → tâche 3. D11 → tâche 1 (palette). **D5, D9, D10 sont hors périmètre**, renvoyés aux lots 2 et 3 et consignés dans `HANDOFF.md`.

**Cohérence des types.** `BadgeTon` est défini tâche 2 et consommé tâches 2, 4, 8. `Tooltip` prend `{ intitule?, contenu, children }` partout. `Bientot` prend `{ raison, children }` aux tâches 9 et 10. `ScoreCompact` prend `{ score: ScoreView | null }`, consommé tâche 8. `ProspectPanel` conserve sa signature d'origine, donc `TodayScreen` n'est pas modifié.

**Deux points de vigilance à l'exécution**, tous deux signalés dans leur tâche :

1. `inert` n'est pas typé sur React 18 — la déclaration de secours est donnée tâche 4, étape 4.
2. `ProspectPanel.tsx` importe `PanelActions` (tâche 10) et les deux onglets (tâches 8, 9) qui n'existent pas encore à la tâche 7. **Exécuter dans l'ordre 8 → 9 → 10 → 7**, ou accepter que la tâche 7 ne compile qu'une fois la 10 finie. L'ordre du document suit la logique de lecture ; l'ordre d'exécution suit les dépendances.

---

## Handoff d'exécution

Plan complet, enregistré dans `docs/superpowers/plans/2026-09-02-refonte-ui-lot-1.md`. Deux façons de l'exécuter :

1. **Par sous-agents (recommandé)** — un agent neuf par tâche, revue entre chaque, itération rapide.
2. **En ligne dans la session** — exécution par lots avec points de contrôle.
