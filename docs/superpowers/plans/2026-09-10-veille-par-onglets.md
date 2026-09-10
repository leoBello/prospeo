# La veille par onglets — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la liste « Nouveaux prospects à fort score », qui plafonne à douze lignes et cache le reste, par une table à onglets de statut — dix lignes par page, pagination, et une fiche qui s'ouvre **au-dessus** de la table sans la rétrécir.

**Architecture :** Tout est en mémoire. `useProspects` charge déjà la totalité de la base (`fetchAllRows`, pagination PostgREST comprise) ; le partage par onglet, le classement, le compte et la découpe en pages sont donc des fonctions **pures** de `domain/veille.ts`, sans une requête de plus. L'interface est un empilement de composants sans état — barre d'onglets, table, rangée, pagination — dont `TodayScreen` tient l'état (onglet courant, page courante, ordre de tri, repli du brief). Le panneau de détail cesse d'être un frère de la liste dans une rangée flex pour devenir un **calque** posé sur la coquille.

**Tech Stack :** React 18, TypeScript (ESM/NodeNext), CSS Modules, Vitest + Testing Library, `@prospeo/db` pour l'énumération `pipeline_status`.

**Maquettes, qui gouvernent la mise en page.** Elles sont approuvées et **contraignantes** (voir `docs/design/GUIDELINES.md` §2) :

| Artboard | Ce qu'il fixe |
|---|---|
| `docs/design/maquettes/Veille.dc.html` | l'écran nominal : brief, barre d'onglets, six colonnes, dix rangées, pagination |
| `VeilleDetail.dc.html` | la fiche en surimpression, et ce qu'elle recouvre |
| `VeilleCompacte.dc.html` | la même page en 1440 × 720, brief replié |
| `VeilleEtats.dc.html` | les six absences et vides — c'est **là** que ce dépôt s'est le plus souvent trompé |
| `VeilleArbitrages.dc.html` | les trois décisions du 2026-09-10 et ce qu'elles obligent |

Canvas publié : <https://claude.ai/code/artifact/f30a87ba-b5a5-447b-a81a-cde27141cb6d>.
Rendu local ouvrable : `node docs/design/maquettes/aplatir.mjs`, puis `docs/design/maquettes/rendu/Veille.html`.

**Les quatre décisions, rendues le 2026-09-10, et ce qu'elles obligent :**

| Décision | Ce qu'elle oblige, et qui n'est pas négociable en cours de route |
|---|---|
| **1A** — les prospects sans ligne de suivi vont dans « À contacter » | L'onglet retient `pipeline === null` **et** `pipeline.status === 'a_contacter'`. La colonne « Suivi » les distingue par `StatusBadge` (« Jamais contacté » discontinu / « À contacter » plein). **Aucune migration** : rien ne crée de ligne de suivi. |
| **2A** — la bande « Relances dues » reste | `buildToday` garde sa file de relances **telle quelle**. La table s'ajoute à côté, elle ne la remplace pas. Une ligne peut figurer deux fois sur l'écran, et c'est voulu : une échéance n'est pas un statut. |
| **3-1** — dix lignes par page, taille constante | **Aucun code ne mesure une hauteur pour en déduire une taille de page.** Le repli du brief est un état persistant, pas un réglage de session. |
| **Surimpression** (demandée) | `.body` devient `position: relative` à toutes les largeurs, `.panel` un calque à `--z-panel`, et la bascule à 900 px de `ProspectPanel.module.css` disparaît. Contrepartie assumée : le panneau recouvre les trois colonnes de droite. |

---

## Global Constraints

- **Tout est en français** : code, commentaires, tests, documentation, et toute chaîne affichée. Les commentaires disent le *pourquoi*, jamais le *quoi*.
- **Aucune chaîne affichée en dur** : tout passe par `t()`, avec sa clé dans `src/i18n/fr.ts` **et** `en.ts`. Une clé sans consommateur hors tests fait échouer `i18n/i18n.test.ts` ; une clé composée à l'exécution exige sa ligne dans `COMPOSEES_A_L_EXECUTION`, avec sa raison.
- **Aucune couleur en dur** : uniquement des `var(--…)` de `ui/theme.css`. `ui/guidelines.test.ts` le vérifie sur tous les `*.module.css`.
- **Imports en `.js`** même depuis un `.tsx` (ESM/NodeNext).
- **Le vocabulaire vient du kit** (`ui/kit/`) : on l'étend, on ne le double pas. Pas de huitième statut, pas de second badge.
- **La couleur n'est jamais le seul indicateur d'un état** : tout badge porte un mot, toute pastille un `aria-label`.
- **Une absence se nomme, jamais elle ne se vide**, et des absences de natures différentes restent distinctes. « Pas encore » n'est pas « jamais ».
- **`null` est porteur de sens** : un prospect sans score n'est pas un prospect à zéro.
- **Ne jamais construire une affordance qui annonce un fait qu'aucun code ne peut rendre vrai.**
- **Écris le test d'abord**, vérifie qu'il échoue **pour la bonne raison**, et prouve que chaque assertion peut échouer : casse le code qu'elle couvre, observe le rouge, restaure, observe le vert.
- **Le texte d'une assertion se lit dans `fr.ts`**, jamais ne s'invente — pas même depuis ce plan.
- **N'écris jamais un test qui prétend voir une mise en page.** `jsdom` ne calcule ni largeur, ni hauteur, ni débordement. La conformité visuelle se contrôle à la tâche 10, au navigateur.
- **`@testing-library/jest-dom` n'est PAS installé dans ce dépôt.** Ni `toBeInTheDocument`, ni `toBeDisabled`, ni `toHaveAttribute`, ni `toHaveAccessibleName` n'existent. Les idiomes maison, lisibles dans `ui/ProspectRow.test.tsx` et `ui/kit/Badge.test.tsx` : `expect(screen.getByText(…)).toBeDefined()`, `expect(screen.queryByText(…)).toBeNull()`, `expect(el.getAttribute('aria-current')).toBe('true')`, `expect(container.querySelector('[data-ton="danger"]')).not.toBeNull()`. L'utilitaire de rendu se nomme `renderWithPreferences` (`src/test-utils.tsx`).
- Pièges de cette suite, qui y ont déjà produit des assertions mortes : `getByText`/`queryByText` comparent le texte **entier du nœud** ; `queryByRole` filtre par défaut sur `hidden: false` ; `getAllByText` **lève** à zéro correspondance, donc un `.length > 0` qui suit ne teste rien.
- **Un argument `-- <motif>` ne restreint PAS un run vitest** dans cette configuration : la suite entière s'exécute. Ne prétends jamais avoir lancé un sous-ensemble.

### Aucune migration dans ce chantier

Rien n'est lu qui ne le soit déjà. `prospect_pipeline` n'est pas écrite, `prospect` n'est pas modifiée, `packages/db/src/database.types.ts` n'est pas régénérée. **Ce plan n'écrit aucun SQL.**

### État de départ

`feat/campagne-lot-4` à `5e19ed1`. Dashboard **611 tests / 52 fichiers**, verts. Les cinq artboards de la page « Veille » et `canvas.json` sont déjà au dépôt.

### Chiffres réels de la base, relevés le 2 septembre 2026

`prospect` = 139, `prospect_score` = 129, `prospect_pipeline` = **2**. Autrement dit **137 prospects sur 139 n'ont aucune ligne de suivi**, et **10 n'ont aucun score**. Ces deux faits ne sont pas des cas dégénérés à contourner : ils sont le cas nominal, et c'est ce que les onglets doivent rendre lisible. **Ne pas coder en dur ces nombres** — ils se recomptent depuis les données.

---

## File Structure

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `apps/dashboard/src/domain/veille.ts` | décide : l'onglet d'un prospect, les comptes, le classement, la découpe en pages — aucune I/O, aucun DOM |
| `apps/dashboard/src/domain/veille.test.ts` | — |
| `apps/dashboard/src/ui/OngletsVeille.tsx` | la barre d'onglets : huit boutons, leurs comptes, leurs pastilles |
| `apps/dashboard/src/ui/OngletsVeille.module.css` | — |
| `apps/dashboard/src/ui/OngletsVeille.test.tsx` | — |
| `apps/dashboard/src/ui/RangeeVeille.tsx` | une rangée : six colonnes, dont la dernière contextuelle |
| `apps/dashboard/src/ui/RangeeVeille.module.css` | — |
| `apps/dashboard/src/ui/RangeeVeille.test.tsx` | — |
| `apps/dashboard/src/ui/TableVeille.tsx` | l'en-tête de colonnes, les rangées, le vide nommé, la ligne de compte |
| `apps/dashboard/src/ui/TableVeille.module.css` | — |
| `apps/dashboard/src/ui/TableVeille.test.tsx` | — |
| `apps/dashboard/src/ui/kit/Pagination.tsx` | la barre de pagination — entre au kit : elle est partagée, et l'écran Déploiements la voudra |
| `apps/dashboard/src/ui/kit/Pagination.module.css` | — |
| `apps/dashboard/src/ui/kit/Pagination.test.tsx` | — |
| `apps/dashboard/src/ui/BriefDuJour.tsx` | le brief : bande de progression + relances dues, repliable |
| `apps/dashboard/src/ui/BriefDuJour.module.css` | — |
| `apps/dashboard/src/ui/BriefDuJour.test.tsx` | — |

**Modifiés :**

| Fichier | Ce qui change |
|---|---|
| `apps/dashboard/src/domain/today.ts` | `buildToday` ne produit plus `newHighScore` ; `reasonForScore` et `highlightLines` partent avec lui |
| `apps/dashboard/src/domain/today.test.ts` | les cas de `newHighScore` et de `highlightLines` partent |
| `apps/dashboard/src/screens/TodayScreen.tsx` | le brief, la table, l'état d'onglet/page/tri, la recherche transmise à la table, les `ids` du parcours clavier |
| `apps/dashboard/src/screens/TodayScreen.test.tsx` | les assertions sur l'ancienne liste |
| `apps/dashboard/src/screens/TodayScreen.module.css` | la colonne de liste ne défile plus par elle-même |
| `apps/dashboard/src/ui/AppShell.module.css` | `.body` en `position: relative` à toutes les largeurs |
| `apps/dashboard/src/ui/ProspectPanel.module.css` | `.panel` devient un calque, et la bascule à 900 px disparaît |
| `apps/dashboard/src/ui/theme.css` | `--shadow-panel` |
| `apps/dashboard/src/ui/theme.test.ts` | le nouveau token et son consommateur |
| `apps/dashboard/src/ui/preferences.tsx` | `briefReplie` / `setBriefReplie`, persistés |
| `apps/dashboard/src/ui/preferences.test.tsx` (s'il existe ; sinon couvert par `BriefDuJour.test.tsx`) | — |
| `apps/dashboard/src/i18n/fr.ts` et `en.ts` | les clés de ce chantier, et le retrait des deux clés orphelines |
| `docs/design/HANDOFF.md` | ce que ce chantier livre, et ce qu'il laisse inerte |

**Non touchés, et c'est délibéré :** `ui/WorkListSection.tsx` (il sert encore les relances dues), `ui/ProspectRow.tsx` (idem), `ui/ProspectPanel.tsx` (son contenu ne change pas — seule sa feuille de style bouge), `data/*` (aucune requête nouvelle).

---

## Tâche 1 : Le domaine de la veille — l'onglet d'un prospect

**Files:**
- Create: `apps/dashboard/src/domain/veille.ts`
- Create: `apps/dashboard/src/domain/veille.test.ts`

**Interfaces:**
- Consomme : `ProspectView` de `./prospect.js`, `Enums<'pipeline_status'>` de `@prospeo/db`.
- Produit : `type OngletVeille = Enums<'pipeline_status'> | 'toutes'`, `const ONGLETS: readonly OngletVeille[]`, `ongletDe(prospect: ProspectView): Enums<'pipeline_status'>`.

> **Le cœur de la décision 1A est ici, et nulle part ailleurs.** `ongletDe` est la seule fonction qui décide qu'un prospect sans ligne de suivi appartient à « À contacter ». Elle ne dit rien de ce que la ligne AFFICHE : la distinction « Jamais contacté » / « À contacter » se lit ailleurs, sur `prospect.pipeline`, et c'est ce qui garde les deux absences distinctes malgré l'onglet commun.

- [ ] **Étape 1 : Écrire le test qui échoue**

Crée `apps/dashboard/src/domain/veille.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { ProspectView } from './prospect.js';
import { ONGLETS, ongletDe } from './veille.js';

/** Un prospect réduit à ce que la veille lit. Le reste n'entre dans aucune décision. */
function prospect(surcharges: Partial<ProspectView> = {}): ProspectView {
  return {
    id: 'p1',
    siret: '12345678900011',
    denomination: 'Aquatech Nantes',
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '1 rue des Olivettes',
    postalCode: '44000',
    city: 'Nantes',
    dateCreation: null,
    effectifCode: null,
    isClosed: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    score: null,
    presence: null,
    enrichment: null,
    pipeline: null,
    site: null,
    messages: [],
    ...surcharges,
  };
}

describe('ONGLETS', () => {
  it('porte les sept statuts du pipeline, puis « toutes » — jamais un huitième statut inventé', () => {
    expect(ONGLETS).toEqual([
      'a_contacter',
      'contacte',
      'relance',
      'interesse',
      'gagne',
      'perdu',
      'ne_pas_contacter',
      'toutes',
    ]);
  });
});

describe('ongletDe', () => {
  it('range un prospect sans aucune ligne de suivi dans « à contacter » (décision 1A)', () => {
    // 137 prospects sur 139 sont dans ce cas au 2 septembre 2026. Les laisser
    // hors de tout onglet retirerait 98 % de la base de l'écran.
    expect(ongletDe(prospect({ pipeline: null }))).toBe('a_contacter');
  });

  it('range un prospect au statut « a_contacter » dans le même onglet, sans les confondre pour autant', () => {
    const pose = prospect({
      pipeline: { status: 'a_contacter', nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' },
    });
    expect(ongletDe(pose)).toBe('a_contacter');
    // La distinction survit : elle est portée par `pipeline`, que la rangée lit.
    expect(pose.pipeline).not.toBeNull();
  });

  it('rend le statut de la ligne de suivi quand elle existe', () => {
    for (const statut of ['contacte', 'relance', 'interesse', 'gagne', 'perdu', 'ne_pas_contacter'] as const) {
      expect(
        ongletDe(prospect({ pipeline: { status: statut, nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' } })),
      ).toBe(statut);
    }
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : ÉCHEC — `Failed to resolve import "./veille.js"`.

- [ ] **Étape 3 : Écrire `domain/veille.ts`**

```ts
import type { Enums } from '@prospeo/db';
import type { ProspectView } from './prospect.js';

/** Un onglet de la veille : les sept statuts du pipeline, plus la vue d'ensemble. */
export type OngletVeille = Enums<'pipeline_status'> | 'toutes';

/**
 * L'ordre de la barre d'onglets, qui est celui du parcours réel d'un
 * prospect — puis « toutes », séparée d'un trait.
 *
 * Les sept premiers sont écrits ici plutôt que dérivés de l'énumération de la
 * base : `Enums<'pipeline_status'>` ne porte aucun ordre, et celui de la
 * migration n'est pas celui du parcours.
 */
export const ONGLETS: readonly OngletVeille[] = [
  'a_contacter',
  'contacte',
  'relance',
  'interesse',
  'gagne',
  'perdu',
  'ne_pas_contacter',
  'toutes',
];

/**
 * Dans quel onglet ce prospect se range.
 *
 * **Décision 1A du 2026-09-10.** Un prospect sans ligne de suivi va dans
 * « à contacter » : ils sont 137 sur 139 au 2 septembre 2026, et les laisser
 * hors de tout onglet retirerait 98 % de la base de l'écran. Ce n'est PAS une
 * confusion des deux absences — « jamais contacté » (aucune ligne) reste
 * distinct de « à contacter » (une ligne posée) partout où la ligne s'affiche,
 * parce que `pipeline` continue de valoir `null` et que `StatusBadge` le
 * nomme. Ce que cette fonction décide, c'est où chercher, pas ce qu'on lit.
 */
export function ongletDe(prospect: ProspectView): Enums<'pipeline_status'> {
  return prospect.pipeline?.status ?? 'a_contacter';
}
```

- [ ] **Étape 4 : Lancer, vérifier que ça passe**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : 611 + 4 = **615 tests verts, 53 fichiers**.

- [ ] **Étape 5 : Prouver que les assertions peuvent échouer**

Remplace le corps d'`ongletDe` par `return 'contacte';`, relance : les trois cas d'`ongletDe` doivent virer au rouge. Restaure, relance : vert. Consigne la transcription dans le rapport de tâche.

- [ ] **Étape 6 : Commit**

```bash
git add apps/dashboard/src/domain/veille.ts apps/dashboard/src/domain/veille.test.ts
git commit -m "feat(veille): l'onglet d'un prospect, absences comprises"
```

---

## Tâche 2 : Le domaine de la veille — comptes, classement, pages

**Files:**
- Modify: `apps/dashboard/src/domain/veille.ts`
- Modify: `apps/dashboard/src/domain/veille.test.ts`

**Interfaces:**
- Produit : `const LIGNES_PAR_PAGE = 10`, `type OrdreVeille = 'score_desc' | 'score_asc'`, `interface ComptesVeille { parOnglet: Record<OngletVeille, number>; sansScore: number; sansSuivi: number }`, `comptesVeille(prospects: ProspectView[]): ComptesVeille`, `interface PageVeille { lignes: ProspectView[]; total: number; page: number; pages: number; premier: number; dernier: number }`, `pageVeille(prospects: ProspectView[], onglet: OngletVeille, ordre: OrdreVeille, page: number): PageVeille`.

> **Les prospects jamais scorés sortent du classement, et on le dit.** C'est le précédent déjà posé par l'écran Campagne (`campagne.sansScore`) : un score manquant n'est pas un score nul, et une colonne « Score » n'a pas la place de nommer l'absence. Les exclure en silence serait le mensonge ; `comptesVeille.sansScore` est ce qui l'empêche.
>
> **`LIGNES_PAR_PAGE` est une constante, et le reste.** Décision 3-1 : aucun code ne mesure une hauteur pour en déduire une taille de page. Le projet voisin a essayé, puis abandonné le 2026-09-10 — la hauteur mesurée tombait à zéro sur un portable et la liste n'affichait plus aucune ligne.

- [ ] **Étape 1 : Écrire les tests qui échouent**

Ajoute à `apps/dashboard/src/domain/veille.test.ts` (garde l'import existant, ajoute les noms) :

```ts
import { LIGNES_PAR_PAGE, ONGLETS, comptesVeille, ongletDe, pageVeille } from './veille.js';
import type { ScoreView } from './prospect.js';

/** Un score réduit à son total : la décomposition n'entre dans aucune décision de ce module. */
function score(total: number): ScoreView {
  return { total, rulesetVersion: 'v3', computedAt: '2026-09-02T00:00:00.000Z', breakdown: [] };
}

describe('comptesVeille', () => {
  it('compte chaque onglet, « toutes » valant le total des prospects classables', () => {
    const comptes = comptesVeille([
      prospect({ id: 'a', score: score(80) }),
      prospect({ id: 'b', score: score(70) }),
      prospect({
        id: 'c',
        score: score(60),
        pipeline: { status: 'contacte', nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' },
      }),
    ]);
    expect(comptes.parOnglet.a_contacter).toBe(2);
    expect(comptes.parOnglet.contacte).toBe(1);
    expect(comptes.parOnglet.toutes).toBe(3);
  });

  it('laisse à zéro les onglets sans prospect, plutôt que de les omettre', () => {
    // Un onglet à zéro est une étape du parcours, pas une absence de données :
    // il reste dans la barre, et son compte doit donc exister.
    const comptes = comptesVeille([prospect({ id: 'a', score: score(80) })]);
    for (const onglet of ONGLETS) {
      expect(comptes.parOnglet[onglet], onglet).toBeTypeOf('number');
    }
    expect(comptes.parOnglet.gagne).toBe(0);
  });

  it('compte à part les prospects sans aucune ligne de suivi, scorés ou non', () => {
    // La ligne de compte de l'onglet « À contacter » dit « 127 classables, sur
    // 137 sans aucune ligne de suivi en base ». Le second nombre ne se déduit
    // d'aucun compte d'onglet : les non-scorés n'y figurent pas.
    const comptes = comptesVeille([
      prospect({ id: 'a', score: score(80) }),
      prospect({ id: 'b', score: null }),
      prospect({
        id: 'c',
        score: score(60),
        pipeline: { status: 'contacte', nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' },
      }),
    ]);
    expect(comptes.sansSuivi).toBe(2);
  });

  it('exclut du classement les prospects jamais scorés, et les compte à part', () => {
    // Un prospect sans score n'est pas un prospect à zéro : il ne peut pas
    // être classé, et le taire le ferait disparaître sans explication.
    const comptes = comptesVeille([
      prospect({ id: 'a', score: score(80) }),
      prospect({ id: 'b', score: null }),
      prospect({ id: 'c', score: null }),
    ]);
    expect(comptes.parOnglet.a_contacter).toBe(1);
    expect(comptes.parOnglet.toutes).toBe(1);
    expect(comptes.sansScore).toBe(2);
  });
});

describe('pageVeille', () => {
  const base = Array.from({ length: 23 }, (_, i) =>
    prospect({ id: `p${i}`, denomination: `Prospect ${i}`, score: score(100 - i) }),
  );

  it('rend dix lignes par page, quelle que soit la hauteur de la fenêtre (décision 3-1)', () => {
    expect(LIGNES_PAR_PAGE).toBe(10);
    expect(pageVeille(base, 'a_contacter', 'score_desc', 1).lignes).toHaveLength(10);
  });

  it('classe par score décroissant par défaut', () => {
    const page = pageVeille(base, 'a_contacter', 'score_desc', 1);
    expect(page.lignes[0]?.score?.total).toBe(100);
    expect(page.lignes[9]?.score?.total).toBe(91);
  });

  it('inverse le classement à la demande, sans changer la taille de page', () => {
    const page = pageVeille(base, 'a_contacter', 'score_asc', 1);
    expect(page.lignes[0]?.score?.total).toBe(78);
    expect(page.lignes).toHaveLength(10);
  });

  it('annonce l étendue affichée et le nombre de pages, bornes comprises', () => {
    const derniere = pageVeille(base, 'a_contacter', 'score_desc', 3);
    expect(derniere.total).toBe(23);
    expect(derniere.pages).toBe(3);
    expect(derniere.premier).toBe(21);
    expect(derniere.dernier).toBe(23);
    expect(derniere.lignes).toHaveLength(3);
  });

  it('ramène une page hors bornes à la dernière page, plutôt que de rendre du vide', () => {
    // Changer d'onglet depuis la page 3 d'un onglet plein vers un onglet qui
    // n'a qu'une page rendrait sinon une table vide sur un onglet plein.
    const page = pageVeille(base, 'a_contacter', 'score_desc', 99);
    expect(page.page).toBe(3);
    expect(page.lignes).toHaveLength(3);
  });

  it('rend une page vide, et non une page fantôme, quand l onglet n a personne', () => {
    const page = pageVeille(base, 'gagne', 'score_desc', 1);
    expect(page.lignes).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.pages).toBe(1);
    expect(page.premier).toBe(0);
    expect(page.dernier).toBe(0);
  });

  it('départage deux scores égaux par la dénomination, pour que l ordre ne bouge pas d un rendu à l autre', () => {
    // Sans départage, `sort` n'est stable qu'en apparence : deux lignes de même
    // score peuvent changer de place entre deux pages et l'une serait vue deux
    // fois, l'autre jamais.
    const egaux = [
      prospect({ id: 'z', denomination: 'Zed Plomberie', score: score(50) }),
      prospect({ id: 'a', denomination: 'Aquatech Nantes', score: score(50) }),
    ];
    const page = pageVeille(egaux, 'a_contacter', 'score_desc', 1);
    expect(page.lignes.map((p) => p.id)).toEqual(['a', 'z']);
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : ÉCHEC — `comptesVeille is not a function`, `pageVeille is not a function`, `LIGNES_PAR_PAGE` indéfini.

- [ ] **Étape 3 : Compléter `domain/veille.ts`**

Ajoute, sous ce qui existe :

```ts
/**
 * Le nombre de lignes d'une page. **Une constante, et elle le reste.**
 *
 * Décision 3-1 du 2026-09-10 : aucun code ne mesure la hauteur disponible pour
 * en déduire une taille de page. Le projet voisin l'a essayé puis abandonné le
 * même jour, sur écran réel — la hauteur mesurée tombait à zéro sur un
 * portable, et la liste n'affichait plus AUCUNE ligne. Ce qui s'ajuste à la
 * fenêtre, c'est le repli du brief.
 */
export const LIGNES_PAR_PAGE = 10;

/** L'ordre du classement. Deux valeurs : la table se lit par score, dans un sens ou l'autre. */
export type OrdreVeille = 'score_desc' | 'score_asc';

export interface ComptesVeille {
  /** Un compte par onglet, y compris ceux à zéro : un onglet vide reste une étape du parcours. */
  parOnglet: Record<OngletVeille, number>;
  /**
   * Les prospects sans aucune ligne de suivi en base, **scorés ou non**.
   *
   * Distinct de `parOnglet.a_contacter`, qui ne compte que les classables :
   * la ligne de compte de l'écran dit « N classables, sur M sans aucune ligne
   * de suivi », et M ne se déduit d'aucun compte d'onglet.
   */
  sansSuivi: number;
  /**
   * Les prospects jamais scorés, qui ne figurent dans aucun onglet.
   *
   * Ils ne sont pas classables — un score manquant n'est pas un score nul — et
   * la ligne de compte de l'écran les nomme. Les exclure en silence les
   * ferait disparaître de la base aux yeux de l'opérateur.
   */
  sansScore: number;
}

/** Un prospect entre-t-il au classement ? Non sans score : il n'a pas de rang. */
function classable(prospect: ProspectView): boolean {
  return prospect.score !== null;
}

export function comptesVeille(prospects: ProspectView[]): ComptesVeille {
  const parOnglet = Object.fromEntries(ONGLETS.map((o) => [o, 0])) as Record<OngletVeille, number>;
  let sansScore = 0;
  let sansSuivi = 0;

  for (const prospect of prospects) {
    // Compté AVANT la garde du score : un prospect sans ligne de suivi l'est
    // qu'il ait un score ou non, et c'est ce nombre-là que l'écran annonce.
    if (prospect.pipeline === null) sansSuivi += 1;

    if (!classable(prospect)) {
      sansScore += 1;
      continue;
    }
    parOnglet[ongletDe(prospect)] += 1;
    parOnglet.toutes += 1;
  }

  return { parOnglet, sansScore, sansSuivi };
}

export interface PageVeille {
  lignes: ProspectView[];
  /** Le nombre de lignes de l'onglet, pas celui de la page. */
  total: number;
  /** La page réellement rendue, qui peut différer de celle demandée (bornage). */
  page: number;
  /** Toujours au moins 1 : une table vide a une page, pas zéro. */
  pages: number;
  /** Rang de la première et de la dernière ligne affichées, à partir de 1 ; `0` si vide. */
  premier: number;
  dernier: number;
}

/**
 * La page à afficher : le filtre de l'onglet, le classement, la découpe.
 *
 * Le départage par dénomination n'est pas un raffinement : sans lui, deux
 * prospects de même score peuvent changer de place entre deux appels, et la
 * pagination montrerait alors l'un deux fois et l'autre jamais — avec le bon
 * nombre de lignes, donc sans que rien ne le signale.
 */
export function pageVeille(
  prospects: ProspectView[],
  onglet: OngletVeille,
  ordre: OrdreVeille,
  page: number,
): PageVeille {
  const retenus = prospects
    .filter((p) => classable(p) && (onglet === 'toutes' || ongletDe(p) === onglet))
    .sort((a, b) => {
      const ecart = (b.score?.total ?? 0) - (a.score?.total ?? 0);
      const parScore = ordre === 'score_asc' ? -ecart : ecart;
      return parScore !== 0 ? parScore : a.denomination.localeCompare(b.denomination, 'fr');
    });

  const total = retenus.length;
  const pages = Math.max(1, Math.ceil(total / LIGNES_PAR_PAGE));
  const courante = Math.min(Math.max(1, Math.trunc(page)), pages);
  const debut = (courante - 1) * LIGNES_PAR_PAGE;
  const lignes = retenus.slice(debut, debut + LIGNES_PAR_PAGE);

  return {
    lignes,
    total,
    page: courante,
    pages,
    premier: lignes.length === 0 ? 0 : debut + 1,
    dernier: lignes.length === 0 ? 0 : debut + lignes.length,
  };
}
```

- [ ] **Étape 4 : Lancer, vérifier que ça passe**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : **626 tests verts, 53 fichiers**.

- [ ] **Étape 5 : Prouver que les assertions peuvent échouer**

Trois cassures, une par famille, chacune vérifiée puis restaurée :
1. `sansScore += 1;` → `sansScore += 0;` : le cas « exclut du classement » vire au rouge.
2. `Math.max(1, Math.ceil(...))` → `Math.ceil(...)` : le cas « onglet vide » vire au rouge (`pages` vaut 0).
3. Retire le `localeCompare` du comparateur : le cas « départage » vire au rouge.

- [ ] **Étape 6 : Commit**

```bash
git add apps/dashboard/src/domain/veille.ts apps/dashboard/src/domain/veille.test.ts
git commit -m "feat(veille): comptes par onglet, classement et découpe en pages"
```

---

## Tâche 3 : Les clés d'interface

**Files:**
- Modify: `apps/dashboard/src/i18n/fr.ts`
- Modify: `apps/dashboard/src/i18n/en.ts`

> **Aucune clé n'est inventée ici : chaque libellé est lu dans un artboard approuvé.** Ceux des sept statuts existent déjà (`pipeline.status.*`) et ne sont pas dupliqués. `veille.sansScore` reprend mot pour mot la formulation déjà retenue par l'écran Campagne (`campagne.sansScore`), au « lot » près, devenu « classement ».
>
> Les clés ajoutées ici n'ont **pas encore de consommateur** : `i18n.test.ts` les déclarera orphelines. C'est attendu, et c'est pourquoi cette tâche ne se commite qu'avec la suivante — voir l'étape 3.

- [ ] **Étape 1 : Ajouter les clés à `fr.ts`**

Sous le bloc `today.*`, ajoute :

```ts
  // La veille par onglets (maquettes Veille.dc.html, VeilleEtats.dc.html).
  'veille.titre': 'Toute la veille',
  'veille.onglets.aria': 'Statut de suivi',
  'veille.onglet.toutes': 'Toutes',
  'veille.onglet.compte.aria': '{label} : {count} prospects',
  'veille.onglet.compte.aria_one': '{label} : {count} prospect',

  'veille.compte.a_contacter':
    '{classables} classables, sur {total} sans aucune ligne de suivi en base',
  'veille.compte.statut': '{count} prospects, sur {classables} classables',
  'veille.compte.statut_one': '{count} prospect, sur {classables} classables',
  'veille.compte.vide': 'aucun prospect à ce statut',
  'veille.compte.toutes': '{classables} classables, sur {total} prospects en base',
  'veille.sansScore':
    "{count} jamais scorés, non classables",
  'veille.sansScore_one': '{count} jamais scoré, non classable',
  'veille.sansScore.hint':
    "Un score manquant n'est pas un score nul : ces prospects n'ont pas de rang, et n'apparaissent donc dans aucun onglet. L'étage « score » n'est pas passé sur eux.",

  'veille.colonne.score': 'Score',
  'veille.colonne.prospect': 'Prospect',
  'veille.colonne.presence': 'Présence web',
  'veille.colonne.telephone': 'Téléphone',
  'veille.colonne.site': 'Site',
  'veille.colonne.suivi': 'Suivi',
  'veille.colonne.prochaineAction': 'Prochaine action',
  'veille.colonne.closDepuis': 'Clos depuis',
  'veille.colonne.depuis': 'Depuis',
  'veille.colonne.statut': 'Statut',

  'veille.tri.score_desc': 'Tri : score décroissant',
  'veille.tri.score_asc': 'Tri : score croissant',

  'veille.telephone.mobile': 'mobile',
  'veille.telephone.fixe': 'fixe',
  'veille.telephone.absent': 'aucune coordonnée',
  'veille.telephone.absent.detail': 'étage « enrich » non passé',

  'veille.echeance.aujourdhui': 'aujourd’hui',
  'veille.echeance.retard': 'en retard de {days} j',
  'veille.echeance.retard_one': 'en retard d’un jour',
  'veille.echeance.future': 'dans {days} j',
  'veille.echeance.future_one': 'demain',
  'veille.echeance.absente': 'non datée',
  'veille.depuis': '{days} j',
  'veille.depuis_one': '{days} j',
  'veille.depuis.absente': 'non datée',

  'veille.vide.a_contacter.titre': 'Aucun prospect à contacter',
  'veille.vide.a_contacter.texte':
    'Tous les prospects scorés portent une décision. La collecte en apportera d’autres.',
  'veille.vide.contacte.titre': 'Aucun prospect contacté pour l’instant',
  'veille.vide.contacte.texte':
    'Un prospect arrive ici dès qu’un premier message part. L’onglet reste visible à zéro : c’est une étape du parcours, pas une absence de données.',
  'veille.vide.relance.titre': 'Aucune relance en cours',
  'veille.vide.relance.texte':
    'Un prospect relancé sans réponse arrive ici. L’onglet reste visible à zéro : c’est une étape du parcours, pas une absence de données.',
  'veille.vide.interesse.titre': 'Aucun prospect intéressé pour l’instant',
  'veille.vide.interesse.texte':
    'Un prospect arrive ici quand il répond favorablement. L’onglet reste visible à zéro : c’est une étape du parcours, pas une absence de données.',
  'veille.vide.gagne.titre': 'Aucune vente conclue pour l’instant',
  'veille.vide.gagne.texte':
    'Le premier prospect passé à « Gagné » débloquera aussi le jalon verrouillé du brief. La table est neuve, pas en panne.',
  'veille.vide.perdu.titre': 'Aucun prospect perdu',
  'veille.vide.perdu.texte':
    'Un prospect classé « Perdu » quitte les files de travail mais garde son onglet : on doit pouvoir relire pourquoi une piste s’est fermée.',
  'veille.vide.ne_pas_contacter.titre': 'Aucun refus enregistré',
  'veille.vide.ne_pas_contacter.texte':
    'Un prospect qui demande à ne plus être contacté arrive ici, définitivement. Une liste vide est une bonne nouvelle, pas une panne de lecture.',
  'veille.vide.toutes.titre': 'Aucun prospect classable',
  'veille.vide.toutes.texte':
    'Aucun prospect n’a encore de score : l’étage « score » n’est pas passé. La collecte et le scoring rempliront cette table.',
  'veille.vide.sortie': 'Voir les {count} à contacter',
  'veille.vide.recherche.titre': 'Aucune ligne ne correspond à votre recherche',
  'veille.vide.recherche.texte':
    '{count} prospects sont bien dans cet onglet — aucun ne porte « {query} ».',
  'veille.vide.recherche.texte_one':
    '{count} prospect est bien dans cet onglet — il ne porte pas « {query} ».',
  'veille.vide.recherche.effacer': 'Effacer la recherche',

  'veille.brief.titre': 'Brief du jour',
  'veille.brief.replier': 'Replier le brief',
  'veille.brief.deplier': 'Déplier',
  'veille.brief.objectif': 'Objectif',
  'veille.brief.relances': '{count} relances dues, dont {retard} en retard',
  'veille.brief.relances_one': '{count} relance due, dont {retard} en retard',
  'veille.brief.relances.aucune': 'aucune relance due',

  'pagination.etendue': '{premier}–{dernier} sur {total}',
  'pagination.taille': '{count} par page',
  'pagination.unePage': 'une seule page — les boutons de page ne s’affichent pas',
  'pagination.precedentes': 'Précédentes',
  'pagination.suivantes': 'Suivantes',
  'pagination.page.aria': 'Page {page} sur {pages}',
  'pagination.aria': 'Pagination de la liste',
```

- [ ] **Étape 2 : Ajouter les mêmes clés à `en.ts`**

Mêmes clés, traduites. Les formes `_one` sont obligatoires partout où la forme nue existe (`i18n.test.ts` le vérifie dans les deux catalogues).

```ts
  // Prospect watch, by status tab (mockups Veille.dc.html, VeilleEtats.dc.html).
  'veille.titre': 'All prospects',
  'veille.onglets.aria': 'Follow-up status',
  'veille.onglet.toutes': 'All',
  'veille.onglet.compte.aria': '{label}: {count} prospects',
  'veille.onglet.compte.aria_one': '{label}: {count} prospect',

  'veille.compte.a_contacter': '{classables} rankable, out of {total} with no follow-up row',
  'veille.compte.statut': '{count} prospects, out of {classables} rankable',
  'veille.compte.statut_one': '{count} prospect, out of {classables} rankable',
  'veille.compte.vide': 'no prospect at this status',
  'veille.compte.toutes': '{classables} rankable, out of {total} prospects on record',
  'veille.sansScore': '{count} never scored, not rankable',
  'veille.sansScore_one': '{count} never scored, not rankable',
  'veille.sansScore.hint':
    'A missing score is not a zero score: these prospects have no rank, and therefore appear in no tab. The “score” stage has not run on them.',

  'veille.colonne.score': 'Score',
  'veille.colonne.prospect': 'Prospect',
  'veille.colonne.presence': 'Web presence',
  'veille.colonne.telephone': 'Phone',
  'veille.colonne.site': 'Site',
  'veille.colonne.suivi': 'Follow-up',
  'veille.colonne.prochaineAction': 'Next action',
  'veille.colonne.closDepuis': 'Closed for',
  'veille.colonne.depuis': 'For',
  'veille.colonne.statut': 'Status',

  'veille.tri.score_desc': 'Sort: score, highest first',
  'veille.tri.score_asc': 'Sort: score, lowest first',

  'veille.telephone.mobile': 'mobile',
  'veille.telephone.fixe': 'landline',
  'veille.telephone.absent': 'no contact details',
  'veille.telephone.absent.detail': '“enrich” stage has not run',

  'veille.echeance.aujourdhui': 'today',
  'veille.echeance.retard': '{days} days overdue',
  'veille.echeance.retard_one': 'one day overdue',
  'veille.echeance.future': 'in {days} days',
  'veille.echeance.future_one': 'tomorrow',
  'veille.echeance.absente': 'undated',
  'veille.depuis': '{days} days',
  'veille.depuis_one': '{days} day',
  'veille.depuis.absente': 'undated',

  'veille.vide.a_contacter.titre': 'No prospect left to contact',
  'veille.vide.a_contacter.texte':
    'Every scored prospect carries a decision. Collection will bring more.',
  'veille.vide.contacte.titre': 'No prospect contacted yet',
  'veille.vide.contacte.texte':
    'A prospect lands here as soon as a first message goes out. The tab stays visible at zero: it is a step of the journey, not missing data.',
  'veille.vide.relance.titre': 'No follow-up in progress',
  'veille.vide.relance.texte':
    'A prospect followed up without an answer lands here. The tab stays visible at zero: it is a step of the journey, not missing data.',
  'veille.vide.interesse.titre': 'No interested prospect yet',
  'veille.vide.interesse.texte':
    'A prospect lands here when they answer favourably. The tab stays visible at zero: it is a step of the journey, not missing data.',
  'veille.vide.gagne.titre': 'No sale closed yet',
  'veille.vide.gagne.texte':
    'The first prospect marked “Won” will also unlock the locked milestone in the brief. The table is new, not broken.',
  'veille.vide.perdu.titre': 'No prospect lost',
  'veille.vide.perdu.texte':
    'A prospect marked “Lost” leaves the work queues but keeps its tab: you must be able to read back why a lead closed.',
  'veille.vide.ne_pas_contacter.titre': 'No opt-out recorded',
  'veille.vide.ne_pas_contacter.texte':
    'A prospect who asks not to be contacted again lands here, permanently. An empty list is good news, not a reading failure.',
  'veille.vide.toutes.titre': 'No rankable prospect',
  'veille.vide.toutes.texte':
    'No prospect has a score yet: the “score” stage has not run. Collection and scoring will fill this table.',
  'veille.vide.sortie': 'See the {count} to contact',
  'veille.vide.recherche.titre': 'No row matches your search',
  'veille.vide.recherche.texte':
    '{count} prospects are indeed in this tab — none matches “{query}”.',
  'veille.vide.recherche.texte_one':
    '{count} prospect is indeed in this tab — it does not match “{query}”.',
  'veille.vide.recherche.effacer': 'Clear the search',

  'veille.brief.titre': 'Today’s brief',
  'veille.brief.replier': 'Collapse the brief',
  'veille.brief.deplier': 'Expand',
  'veille.brief.objectif': 'Target',
  'veille.brief.relances': '{count} follow-ups due, {retard} overdue',
  'veille.brief.relances_one': '{count} follow-up due, {retard} overdue',
  'veille.brief.relances.aucune': 'no follow-up due',

  'pagination.etendue': '{premier}–{dernier} of {total}',
  'pagination.taille': '{count} per page',
  'pagination.unePage': 'a single page — page buttons are not shown',
  'pagination.precedentes': 'Previous',
  'pagination.suivantes': 'Next',
  'pagination.page.aria': 'Page {page} of {pages}',
  'pagination.aria': 'List pagination',
```

- [ ] **Étape 3 : Lancer, constater l'échec attendu, ne PAS commiter**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : ÉCHEC de `clés orphelines` — la liste des orphelines contient exactement les clés ajoutées ci-dessus. **C'est le comportement voulu de ce garde-fou**, et il redeviendra vert à la tâche 8, quand tous les consommateurs existeront.

Cette tâche ne se commite donc pas seule : garde le travail dans l'arbre et enchaîne. Les tâches 4 à 8 consomment ces clés une à une ; le commit de chacune inclut les clés qu'elle consomme.

> **Si un agent exécute ce plan tâche par tâche avec un commit obligatoire par tâche**, alors : commite ici avec `git commit --no-verify` **interdit** — à la place, déplace physiquement les clés dans le commit de la tâche qui les consomme (`git add -p`). Aucune exception : une clé sans consommateur est exactement ce que ce test existe pour attraper.

---

## Tâche 4 : La barre d'onglets

**Files:**
- Create: `apps/dashboard/src/ui/OngletsVeille.tsx`
- Create: `apps/dashboard/src/ui/OngletsVeille.module.css`
- Create: `apps/dashboard/src/ui/OngletsVeille.test.tsx`

**Interfaces:**
- Consomme : `ONGLETS`, `OngletVeille`, `ComptesVeille` de `../domain/veille.js`.
- Produit : `function OngletsVeille(props: { onglet: OngletVeille; comptes: ComptesVeille; onChoisir: (o: OngletVeille) => void }): JSX.Element`.

**Maquette :** `Veille.dc.html`, bloc « LA VEILLE » ; `VeilleEtats.dc.html` bloc B pour les comptes pas encore reçus.

> **Les pastilles reprennent les tons de `StatusBadge`, au ton près.** C'est ce qui fait qu'un « Relancé » ambre dans la barre est le même « Relancé » ambre dans la colonne. Un huitième ton, ou un ton différent pour le même statut, est une régression du vocabulaire.
>
> **Chaque onglet porte son compte en toutes lettres pour un lecteur d'écran.** Le chiffre nu à côté du libellé est visuel ; `aria-label` porte « À contacter : 127 prospects ». Sans lui, la barre s'annonce comme huit mots suivis de huit nombres sans lien.

- [ ] **Étape 1 : Écrire le test qui échoue**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComptesVeille } from '../domain/veille.js';
import { OngletsVeille } from './OngletsVeille.js';
import { renderWithPreferences } from '../test-utils.js';

function comptes(surcharges: Partial<ComptesVeille['parOnglet']> = {}): ComptesVeille {
  return {
    parOnglet: {
      a_contacter: 127,
      contacte: 1,
      relance: 1,
      interesse: 0,
      gagne: 0,
      perdu: 0,
      ne_pas_contacter: 0,
      toutes: 129,
      ...surcharges,
    },
    sansScore: 10,
    sansSuivi: 137,
  };
}

describe('OngletsVeille', () => {
  it('rend les huit onglets, y compris ceux à zéro — un onglet vide est une étape du parcours', () => {
    renderWithPreferences(
      <OngletsVeille onglet="a_contacter" comptes={comptes()} onChoisir={() => {}} />,
    );
    const onglets = screen.getAllByRole('tab');
    expect(onglets).toHaveLength(8);
    // Les libellés se lisent dans fr.ts : `pipeline.status.*` et `veille.onglet.toutes`.
    expect(onglets.map((o) => o.textContent)).toEqual([
      'À contacter127',
      'Contacté1',
      'Relancé1',
      'Intéressé0',
      'Gagné0',
      'Perdu0',
      'Ne pas contacter0',
      'Toutes129',
    ]);
  });

  it('marque l onglet courant par `aria-selected`, et non par la seule couleur', () => {
    renderWithPreferences(
      <OngletsVeille onglet="relance" comptes={comptes()} onChoisir={() => {}} />,
    );
    expect(screen.getByRole('tab', { selected: true }).getAttribute('aria-label')).toMatch(/Relancé/);
  });

  it('annonce le compte en toutes lettres, un chiffre nu étant imprononçable', () => {
    renderWithPreferences(
      <OngletsVeille onglet="a_contacter" comptes={comptes()} onChoisir={() => {}} />,
    );
    expect(screen.getByRole('tab', { name: 'À contacter : 127 prospects' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Contacté : 1 prospect' })).toBeDefined();
  });

  it('prévient l appelant de l onglet choisi', async () => {
    const onChoisir = vi.fn();
    renderWithPreferences(
      <OngletsVeille onglet="a_contacter" comptes={comptes()} onChoisir={onChoisir} />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /^Gagné/ }));
    expect(onChoisir).toHaveBeenCalledWith('gagne');
  });
});
```

> **Vérifie d'abord le nom réel de l'utilitaire de rendu.** `src/test-utils.tsx` existe déjà et enveloppe le rendu dans `PreferencesProvider` ; ouvre-le et emploie l'export qu'il expose plutôt que `renderWithPreferences` si le nom diffère. Un composant qui appelle `useT` sans ce fournisseur lève.

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : ÉCHEC — `Failed to resolve import "./OngletsVeille.js"`.

- [ ] **Étape 3 : Écrire `OngletsVeille.module.css`**

```css
/*
 * La barre d'onglets de la veille (maquette Veille.dc.html).
 *
 * Le trait bas de 1px n'est PAS ici : il est porté par `.barreHaut` de
 * `TableVeille`, qui contient aussi le bouton de tri à droite. Chaque onglet le
 * recouvre d'un `margin-bottom: -1px` — c'est ce qui fait que l'onglet courant
 * semble ouvert sur la table, au lieu de flotter au-dessus d'un trait continu.
 */
.barre {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 34px;
  flex: none;
}

.onglet {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 var(--space-3);
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  margin-bottom: -1px;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
}

.onglet:hover {
  color: var(--color-text);
}

.onglet[aria-selected='true'] {
  background: var(--color-surface-2);
  border-bottom-color: var(--color-accent);
  color: var(--color-text);
  font-weight: 600;
}

/*
 * La pastille double le mot, elle ne le remplace jamais : le libellé du statut
 * est toujours écrit à côté, et `aria-hidden` la retire de l'annonce.
 */
.pastille {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-pill);
  flex: none;
}

.pastille[data-discontinu='true'] {
  background: transparent;
  border: 1px dashed currentColor;
}

.compte {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}

.onglet[aria-selected='true'] .compte {
  color: var(--color-text);
}

/* Le trait qui sépare les sept statuts de la vue d'ensemble. */
.separateur {
  width: 1px;
  height: 18px;
  background: var(--color-border-strong);
  align-self: center;
  margin: 0 var(--space-2);
  flex: none;
}
```

- [ ] **Étape 4 : Écrire `OngletsVeille.tsx`**

```tsx
import type { Enums } from '@prospeo/db';
import { ONGLETS } from '../domain/veille.js';
import type { ComptesVeille, OngletVeille } from '../domain/veille.js';
import type { TranslationKey } from '../i18n/translate.js';
import { useT } from './preferences.js';
import styles from './OngletsVeille.module.css';

/**
 * La couleur de la pastille de chaque onglet.
 *
 * Reprise du `TON` de `kit/StatusBadge.tsx`, au ton près : un « Relancé »
 * ambre dans la barre doit être le même ambre que dans la colonne. Les tokens
 * sont nommés ici plutôt que déduits d'un `data-ton` parce qu'un onglet n'est
 * pas un badge — il n'a ni fond, ni bordure, ni libellé de badge.
 */
const COULEUR: Record<Enums<'pipeline_status'>, string> = {
  a_contacter: 'var(--color-text-muted)',
  contacte: 'var(--color-accent)',
  relance: 'var(--color-warning)',
  interesse: 'var(--color-info)',
  gagne: 'var(--color-success)',
  perdu: 'var(--color-danger)',
  ne_pas_contacter: 'var(--color-danger)',
};

const CLE: Record<OngletVeille, TranslationKey> = {
  a_contacter: 'pipeline.status.a_contacter',
  contacte: 'pipeline.status.contacte',
  relance: 'pipeline.status.relance',
  interesse: 'pipeline.status.interesse',
  gagne: 'pipeline.status.gagne',
  perdu: 'pipeline.status.perdu',
  ne_pas_contacter: 'pipeline.status.ne_pas_contacter',
  toutes: 'veille.onglet.toutes',
};

interface Props {
  onglet: OngletVeille;
  comptes: ComptesVeille;
  onChoisir: (onglet: OngletVeille) => void;
}

/**
 * Un onglet par statut de suivi, jamais un statut masqué.
 *
 * Les onglets à zéro restent affichés : cinq des huit le sont aujourd'hui
 * (`prospect_pipeline` compte 2 lignes sur 139 prospects, relevé du
 * 2 septembre 2026), et les cacher ferait disparaître les étapes du parcours
 * au moment précis où l'on cherche à savoir où en est la prospection.
 */
export function OngletsVeille({ onglet, comptes, onChoisir }: Props) {
  const t = useT();

  return (
    <div className={styles.barre} role="tablist" aria-label={t('veille.onglets.aria')}>
      {ONGLETS.map((id) => {
        const libelle = t(CLE[id]);
        const compte = comptes.parOnglet[id];
        return (
          <span key={id} style={{ display: 'contents' }}>
            {/* Le trait ne sépare pas deux statuts : il sépare les statuts de
                la vue d'ensemble, qui n'en est pas un. */}
            {id === 'toutes' ? <span className={styles.separateur} aria-hidden="true" /> : null}
            <button
              type="button"
              role="tab"
              className={styles.onglet}
              aria-selected={id === onglet}
              aria-label={t('veille.onglet.compte.aria', { label: libelle, count: compte })}
              onClick={() => onChoisir(id)}
            >
              {id === 'toutes' ? null : (
                <span
                  className={styles.pastille}
                  style={{ background: COULEUR[id] , color: COULEUR[id] }}
                  data-discontinu={id === 'ne_pas_contacter' ? 'true' : undefined}
                  aria-hidden="true"
                />
              )}
              {libelle}
              <span className={styles.compte}>{compte}</span>
            </button>
          </span>
        );
      })}
    </div>
  );
}
```

> **`style={{ background: … }}` dans un `.tsx` n'est pas une couleur en dur** : la valeur est un `var(--…)` du thème, et `guidelines.test.ts` ne lit que les `*.module.css`. Le token reste la seule source. Ce qui serait interdit, c'est `background: '#f0b45c'`.

- [ ] **Étape 5 : Lancer, vérifier que ça passe**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : les quatre cas d'`OngletsVeille` passent. `clés orphelines` échoue **encore** (les clés des tâches 5 à 8 n'ont toujours pas de consommateur) — c'est attendu.

- [ ] **Étape 6 : Prouver que les assertions peuvent échouer**

Retire `aria-label` du bouton : le cas « annonce le compte en toutes lettres » vire au rouge. Restaure. Remplace `ONGLETS.map` par `ONGLETS.slice(0, 4).map` : le cas des huit onglets vire au rouge. Restaure.

- [ ] **Étape 7 : Commit**

```bash
git add apps/dashboard/src/ui/OngletsVeille.tsx apps/dashboard/src/ui/OngletsVeille.module.css apps/dashboard/src/ui/OngletsVeille.test.tsx
git add -p apps/dashboard/src/i18n/fr.ts apps/dashboard/src/i18n/en.ts   # les clés veille.onglet*, veille.onglets.aria
git commit -m "feat(veille): la barre d'onglets, un par statut de suivi"
```

---

## Tâche 5 : La pagination, au kit

**Files:**
- Create: `apps/dashboard/src/ui/kit/Pagination.tsx`
- Create: `apps/dashboard/src/ui/kit/Pagination.module.css`
- Create: `apps/dashboard/src/ui/kit/Pagination.test.tsx`

**Interfaces:**
- Produit : `function Pagination(props: { page: number; pages: number; premier: number; dernier: number; total: number; taille: number; onAller: (page: number) => void }): JSX.Element`.

**Maquette :** `Veille.dc.html`, bloc « Pagination » ; `VeilleEtats.dc.html` pour le cas d'une seule page.

> **Elle entre au kit, et pas dans `ui/`.** Elle ne connaît ni prospect, ni onglet, ni score : elle prend des nombres et rend une barre. L'écran Déploiements a le même besoin, et un second composant de pagination écrit à côté serait exactement le dialecte que les guidelines interdisent.
>
> **À une seule page, les boutons de page ne s'affichent pas** — mais l'étendue, elle, reste. Cacher toute la barre priverait l'opérateur du seul endroit qui dit combien de lignes l'onglet contient.

- [ ] **Étape 1 : Écrire le test qui échoue**

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination.js';
import { renderWithPreferences } from '../../test-utils.js';

describe('Pagination', () => {
  it('annonce l étendue affichée et la taille de page', () => {
    renderWithPreferences(
      <Pagination page={1} pages={13} premier={1} dernier={10} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByText('1–10 sur 127')).toBeDefined();
    expect(screen.getByText('10 par page')).toBeDefined();
  });

  it('désactive « Précédentes » sur la première page, plutôt que de la masquer', () => {
    // Un bouton qui disparaît déplace ses voisins à chaque changement de page.
    renderWithPreferences(
      <Pagination page={1} pages={13} premier={1} dernier={10} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Précédentes' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Suivantes' }).hasAttribute('disabled')).toBe(false);
  });

  it('désactive « Suivantes » sur la dernière page', () => {
    renderWithPreferences(
      <Pagination page={13} pages={13} premier={121} dernier={127} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Suivantes' }).hasAttribute('disabled')).toBe(true);
  });

  it('marque la page courante par `aria-current`, et non par la seule couleur', () => {
    renderWithPreferences(
      <Pagination page={3} pages={13} premier={21} dernier={30} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByRole('button', { current: 'page' }).getAttribute('aria-label')).toBe('Page 3 sur 13');
  });

  it('dit pourquoi les boutons de page manquent quand il n y a qu une page', () => {
    renderWithPreferences(
      <Pagination page={1} pages={1} premier={1} dernier={1} total={1} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByText('une seule page — les boutons de page ne s’affichent pas')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Suivantes' })).toBeNull();
  });

  it('prévient l appelant de la page demandée', async () => {
    const onAller = vi.fn();
    renderWithPreferences(
      <Pagination page={1} pages={13} premier={1} dernier={10} total={127} taille={10} onAller={onAller} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Suivantes' }));
    expect(onAller).toHaveBeenCalledWith(2);
  });

  it('ne pose jamais un saut sur une seule page manquante', () => {
    // Un saut qui cache exactement un numéro coûte un clic pour rien : la page
    // devient moins atteignable qu'elle ne devrait, sans rien gagner en place.
    expect(numerosDePage(4, 8)).toEqual([1, 2, 3, 4, 5, 'saut', 8]);
  });

  it('rend une sortie strictement croissante, sans doublon ni sauts consécutifs', () => {
    for (const pages of [1, 7, 8, 13, 200]) {
      for (const page of [1, 2, Math.ceil(pages / 2), pages - 1, pages].filter((p) => p >= 1 && p <= pages)) {
        const sortie = numerosDePage(page, pages);
        const nombres = sortie.filter((n): n is number => n !== 'saut');
        expect(nombres[0], `${page}/${pages}`).toBe(1);
        expect(nombres[nombres.length - 1], `${page}/${pages}`).toBe(pages);
        expect(new Set(nombres).size, `${page}/${pages}`).toBe(nombres.length);
        expect([...nombres].sort((a, b) => a - b), `${page}/${pages}`).toEqual(nombres);
        expect(sortie.some((n, i) => n === 'saut' && sortie[i + 1] === 'saut')).toBe(false);
      }
    }
  });

  it('abrège les pages du milieu sans jamais perdre la première ni la dernière', () => {
    renderWithPreferences(
      <Pagination page={7} pages={13} premier={61} dernier={70} total={127} taille={10} onAller={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Page 1 sur 13' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Page 13 sur 13' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Page 4 sur 13' })).toBeNull();
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : ÉCHEC — `Failed to resolve import "./Pagination.js"`.

- [ ] **Étape 3 : Écrire `Pagination.module.css`**

```css
.barre {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 44px;
  border-top: 1px solid var(--color-border);
  flex: none;
}

.etendue {
  font-size: var(--text-xs);
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.espace {
  flex: 1;
}

.pages {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.bouton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-width: 26px;
  height: 26px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: none;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
}

.bouton:hover:not(:disabled) {
  color: var(--color-text);
}

.bouton[aria-current='page'] {
  background: var(--color-surface-2);
  border-color: var(--color-border-strong);
  color: var(--color-text);
  font-weight: 700;
}

/* Les deux boutons de navigation portent un mot, pas une flèche seule. */
.nav {
  border-color: var(--color-border-strong);
  padding: 0 9px;
  font-family: var(--font-ui);
  font-size: var(--text-sm);
}

.bouton:disabled {
  color: var(--color-text-faint);
  border-color: var(--color-border);
  cursor: default;
}

/* Le saut de pages : un texte, jamais un bouton — il ne mène nulle part. */
.saut {
  min-width: 26px;
  text-align: center;
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.unePage {
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}
```

- [ ] **Étape 4 : Écrire `Pagination.tsx`**

```tsx
import { useT } from '../preferences.js';
import { Badge } from './Badge.js';
import styles from './Pagination.module.css';

const CHEVRON = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
} as const;

/**
 * Les numéros de page à montrer : les deux extrémités, les voisines de la
 * page courante, et un saut ailleurs.
 *
 * Treize boutons de page tiendraient dans la largeur ; deux cents non. La
 * règle est écrite ici, séparée du rendu, parce que c'est la seule partie du
 * composant qui décide quelque chose — le reste dessine.
 */
export function numerosDePage(page: number, pages: number): Array<number | 'saut'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const autour = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
  const retenus = [1, ...autour, pages];

  const sortie: Array<number | 'saut'> = [];
  let precedent = 0;
  for (const n of retenus) {
    // Un saut ne s'affiche que s'il cache AU MOINS DEUX numéros. Quand il n'en
    // cache qu'un, c'est ce numéro qu'on rend : un saut posé sur une seule page
    // la rend moins atteignable qu'elle ne devrait, pour un clic de plus et
    // rien en échange.
    if (n - precedent === 2) sortie.push(n - 1);
    else if (n - precedent > 2) sortie.push('saut');
    sortie.push(n);
    precedent = n;
  }
  return sortie;
}

interface Props {
  page: number;
  pages: number;
  premier: number;
  dernier: number;
  total: number;
  /** La taille de page, affichée telle quelle : elle est constante et l'écran le dit. */
  taille: number;
  onAller: (page: number) => void;
}

/**
 * La barre de pagination : ce qu'on voit, sur combien, et comment aller ailleurs.
 *
 * À une seule page, les boutons disparaissent mais **l'étendue reste** : elle
 * est le seul endroit qui dise combien de lignes l'onglet contient, et la
 * masquer avec eux retirerait un fait pour une raison de mise en page.
 */
export function Pagination({ page, pages, premier, dernier, total, taille, onAller }: Props) {
  const t = useT();

  return (
    <nav className={styles.barre} aria-label={t('pagination.aria')}>
      <span className={styles.etendue}>{t('pagination.etendue', { premier, dernier, total })}</span>
      <Badge ton="neutre" taille="compacte" discontinu>
        {t('pagination.taille', { count: taille })}
      </Badge>

      <span className={styles.espace} />

      {pages <= 1 ? (
        <span className={styles.unePage}>{t('pagination.unePage')}</span>
      ) : (
        <div className={styles.pages}>
          <button
            type="button"
            className={`${styles.bouton} ${styles.nav}`}
            disabled={page <= 1}
            onClick={() => onAller(page - 1)}
          >
            <svg {...CHEVRON}><path d="m15 18-6-6 6-6" /></svg>
            {t('pagination.precedentes')}
          </button>

          {numerosDePage(page, pages).map((n, i) =>
            n === 'saut' ? (
              // Un texte et non un bouton : il ne mène nulle part, et un
              // bouton inerte est une affordance qui ment.
              <span key={`saut-${i}`} className={styles.saut} aria-hidden="true">…</span>
            ) : (
              <button
                key={n}
                type="button"
                className={styles.bouton}
                aria-current={n === page ? 'page' : undefined}
                aria-label={t('pagination.page.aria', { page: n, pages })}
                onClick={() => onAller(n)}
              >
                {n}
              </button>
            ),
          )}

          <button
            type="button"
            className={`${styles.bouton} ${styles.nav}`}
            disabled={page >= pages}
            onClick={() => onAller(page + 1)}
          >
            {t('pagination.suivantes')}
            <svg {...CHEVRON}><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Étape 5 : Lancer, vérifier que ça passe**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : les neuf cas de `Pagination` passent.

- [ ] **Étape 6 : Prouver que les assertions peuvent échouer**

Remplace `disabled={page <= 1}` par `disabled={false}` : le cas « désactive Précédentes » vire au rouge. Restaure. Dans `numerosDePage`, remplace `if (pages <= 7)` par `if (pages <= 700)` : le cas de l'abrègement vire au rouge. Restaure.

- [ ] **Étape 7 : Commit**

```bash
git add apps/dashboard/src/ui/kit/Pagination.tsx apps/dashboard/src/ui/kit/Pagination.module.css apps/dashboard/src/ui/kit/Pagination.test.tsx
git add -p apps/dashboard/src/i18n/fr.ts apps/dashboard/src/i18n/en.ts   # les clés pagination.*
git commit -m "feat(kit): la barre de pagination, et le saut de pages"
```

---

## Tâche 6 : La rangée — six colonnes, dont une contextuelle

**Files:**
- Create: `apps/dashboard/src/ui/RangeeVeille.tsx`
- Create: `apps/dashboard/src/ui/RangeeVeille.module.css`
- Create: `apps/dashboard/src/ui/RangeeVeille.test.tsx`

**Interfaces:**
- Consomme : `ProspectView` de `../domain/prospect.js`, `OngletVeille` de `../domain/veille.js`, `joursCivils` de `../domain/today.js`, `StatusBadge` de `./kit/StatusBadge.js`, `Badge` de `./kit/Badge.js`.
- Produit : `function RangeeVeille(props: { prospect: ProspectView; onglet: OngletVeille; selectionne: boolean; now: Date; onSelect: (id: string) => void }): JSX.Element`.

**Maquette :** `Veille.dc.html` (rangées), et surtout `VeilleEtats.dc.html` blocs D et E — **c'est là que se lisent les six absences**.

> **La dernière colonne change de sens selon l'onglet, et c'est le cœur de cette tâche.** Cinq colonnes fixes, une contextuelle : « Suivi » dans « à contacter », « Prochaine action » dans les trois onglets d'engagement, « Clos depuis » / « Depuis » dans les onglets fermés, « Statut » dans « toutes ». Sans cela, cinq onglets sur huit afficheraient une colonne vide.
>
> **Les six absences ont six rendus distincts** (`VeilleEtats`, bloc E) : « Jamais contacté » (badge discontinu) ≠ « À contacter » (badge plein) ; « Présence web pas encore sondée » (discontinu) ≠ une catégorie de présence (plein) ; « aucune coordonnée » (texte en italique, avec l'étage qui n'est pas passé) ≠ un numéro ; « Jamais déployé » (discontinu) ≠ « Dépublié » (plein, ambre — un site retiré est un fait établi, pas une donnée manquante) ; « non datée » (italique) ≠ une échéance.
>
> **La présence web reste neutre de ton.** « Aucune présence web » est le meilleur signal du barème ; l'afficher en vert le ferait lire comme « site correct ». L'information est dans le mot.

- [ ] **Étape 1 : Écrire le test qui échoue**

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProspectView } from '../domain/prospect.js';
import { RangeeVeille } from './RangeeVeille.js';
import { renderWithPreferences } from '../test-utils.js';

const MAINTENANT = new Date('2026-09-10T09:00:00.000Z');

function prospect(surcharges: Partial<ProspectView> = {}): ProspectView {
  return {
    id: 'p1',
    siret: '12345678900011',
    denomination: 'Aquatech Nantes',
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '1 rue des Olivettes',
    postalCode: '44000',
    city: 'Nantes',
    dateCreation: null,
    effectifCode: null,
    isClosed: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    score: { total: 74, rulesetVersion: 'v3', computedAt: '2026-09-02T00:00:00.000Z', breakdown: [] },
    presence: null,
    enrichment: null,
    pipeline: null,
    site: null,
    messages: [],
    ...surcharges,
  };
}

describe('RangeeVeille — les absences, chacune nommée à sa façon', () => {
  it('distingue « jamais contacté » de « à contacter », dans le même onglet', () => {
    // Décision 1A : les deux populations partagent l'onglet, jamais le libellé.
    const { unmount } = renderWithPreferences(
      <RangeeVeille prospect={prospect({ pipeline: null })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('Jamais contacté')).toBeDefined();
    unmount();

    renderWithPreferences(
      <RangeeVeille
        prospect={prospect({ pipeline: { status: 'a_contacter', nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' } })}
        onglet="a_contacter"
        selectionne={false}
        now={MAINTENANT}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('À contacter')).toBeDefined();
    expect(screen.queryByText('Jamais contacté')).toBeNull();
  });

  it('nomme une présence web pas encore sondée, sans la confondre avec « aucune présence web »', () => {
    const { unmount } = renderWithPreferences(
      <RangeeVeille prospect={prospect({ presence: null })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('Présence web pas encore sondée')).toBeDefined();
    unmount();

    renderWithPreferences(
      <RangeeVeille
        prospect={prospect({ presence: { category: 'none', finalUrl: null, httpStatus: null, domainAvailable: null, probedAt: '2026-09-02T00:00:00.000Z' } })}
        onglet="a_contacter"
        selectionne={false}
        now={MAINTENANT}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Aucune présence web')).toBeDefined();
  });

  it('dit quel étage n a pas produit le téléphone, plutôt que de laisser la case vide', () => {
    renderWithPreferences(
      <RangeeVeille prospect={prospect({ enrichment: null })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('aucune coordonnée')).toBeDefined();
    expect(screen.getByText('étage « enrich » non passé')).toBeDefined();
  });

  it('distingue le type de numéro, que le barème paye différemment', () => {
    renderWithPreferences(
      <RangeeVeille
        prospect={prospect({
          enrichment: {
            status: 'ok', phoneE164: '+33612440831', phoneKind: 'mobile', rating: null,
            reviewCount: null, declaredUrl: null, matchedName: null, matchConfidence: null,
            enrichedAt: '2026-09-02T00:00:00.000Z',
          },
        })}
        onglet="a_contacter"
        selectionne={false}
        now={MAINTENANT}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('mobile')).toBeDefined();
  });
});

describe('RangeeVeille — la colonne contextuelle', () => {
  const engage = (nextActionAt: string | null) =>
    prospect({ pipeline: { status: 'contacte', nextActionAt, updatedAt: '2026-09-08T00:00:00.000Z' } });

  it('porte l échéance dans les onglets d engagement, en dates civiles', () => {
    renderWithPreferences(
      <RangeeVeille prospect={engage('2026-09-07T23:00:00.000Z')} onglet="contacte" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    // Trois jours civils, pas deux tranches de 24 h et des poussières.
    expect(screen.getByText('en retard de 3 j')).toBeDefined();
  });

  it('nomme une échéance absente plutôt que d en inventer une', () => {
    renderWithPreferences(
      <RangeeVeille prospect={engage(null)} onglet="contacte" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('non datée')).toBeDefined();
  });

  it('porte le statut dans l onglet « toutes », le seul qui mélange les statuts', () => {
    renderWithPreferences(
      <RangeeVeille prospect={engage(null)} onglet="toutes" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('Contacté')).toBeDefined();
    expect(screen.queryByText('non datée')).toBeNull();
  });
});

describe('RangeeVeille — la sélection', () => {
  it('porte `aria-current`, la couleur ne suffisant jamais à dire un état', () => {
    renderWithPreferences(
      <RangeeVeille prospect={prospect()} onglet="a_contacter" selectionne now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true');
  });

  it('prévient l appelant du prospect choisi', async () => {
    const onSelect = vi.fn();
    renderWithPreferences(
      <RangeeVeille prospect={prospect()} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('p1');
  });
});
```

> **Avant d'écrire une seule assertion, relis `fr.ts`.** Les textes ci-dessus sont ceux du plan ; c'est le catalogue qui fait foi. Quatre assertions mortes sur cinq, aux lots précédents, venaient d'un texte inventé plutôt que lu. Vérifie en particulier `presence.none`, `presence.absent`, `pipeline.absent` et `pipeline.status.a_contacter`, qui existent déjà et ne sont pas réécrits par ce chantier.

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : ÉCHEC — `Failed to resolve import "./RangeeVeille.js"`.

- [ ] **Étape 3 : Écrire `RangeeVeille.module.css`**

```css
/*
 * Six colonnes fixes. La grille est déclarée ICI et nulle part ailleurs :
 * l'en-tête de `TableVeille` la reprend par composition (`.grille`), pour que
 * les colonnes de l'en-tête et celles des rangées ne puissent pas diverger.
 */
.grille {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 186px 136px 126px 140px;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-3);
}

.rangee {
  composes: grille;
  width: 100%;
  /* 44 px : le plancher de cible tactile, et la hauteur qui fait tenir dix
     rangées dans une fenêtre de 720 px avec le brief replié. */
  height: 44px;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font: inherit;
  color: inherit;
  transition: background-color 160ms ease, border-color 160ms ease;
}

.rangee:hover {
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
}

.selectionnee {
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 35%, transparent);
}

.score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.total {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1;
  color: var(--color-text-muted);
}

.total[data-fort='true'] {
  color: var(--color-accent);
}

.segments {
  display: flex;
  gap: 2px;
}

.segment {
  display: block;
  height: 3px;
  border-radius: 2px;
}

.identite {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

/*
 * `min-width: 0` SEUL, jamais `flex: 1` : le nom doit pouvoir RÉTRÉCIR, pas
 * grandir. Avec `flex: 1` il pousserait le badge de métier à l'autre bout de
 * la cellule — le piège déjà payé une fois sur `ProspectRow`.
 */
.nom {
  min-width: 0;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.telephone {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.numero {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.25;
}

.type {
  font-size: 9.5px;
  color: var(--color-text-faint);
  line-height: 1.25;
}

/* L'absence : italique et discrète, jamais une case vide. */
.absent {
  font-size: var(--text-xs);
  font-style: italic;
  color: var(--color-text-faint);
  line-height: 1.25;
}

.detailAbsent {
  composes: absent;
  font-size: 9.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echeance {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.echeance[data-retard='true'] {
  color: var(--color-warning);
}
```

- [ ] **Étape 4 : Écrire `RangeeVeille.tsx`**

```tsx
import type { ReactNode } from 'react';
import { joursCivils } from '../domain/today.js';
import type { ProspectView } from '../domain/prospect.js';
import type { OngletVeille } from '../domain/veille.js';
import type { TranslationKey } from '../i18n/translate.js';
import { Badge } from './kit/Badge.js';
import { StatusBadge } from './kit/StatusBadge.js';
import { useT } from './preferences.js';
import styles from './RangeeVeille.module.css';

/** Les onglets où la dernière colonne porte une échéance : ceux d'un engagement en cours. */
const ENGAGEMENT: readonly OngletVeille[] = ['contacte', 'relance', 'interesse'];

const COULEUR_SEGMENT = [
  'var(--color-seg-presence)',
  'var(--color-seg-vitalite)',
  'var(--color-seg-joignabilite)',
] as const;

/** Le seuil au-delà duquel le score se met à l'accent. Repris de la maquette. */
const SCORE_FORT = 70;

/**
 * L'état du site, en trois mots.
 *
 * `Dépublié` est PLEIN et ambre là où « Jamais déployé » est discontinu : un
 * site retiré est un fait établi, pas une donnée manquante. C'est la même
 * distinction que le trait discontinu porte partout ailleurs dans ce
 * vocabulaire.
 */
function celluleSite(site: ProspectView['site'], t: ReturnType<typeof useT>): ReactNode {
  if (site === null || site.generatedAt === null) {
    return <Badge ton="neutre" taille="compacte" discontinu>{t('deploiements.etat.jamais')}</Badge>;
  }
  if (site.unpublishedAt !== null) {
    return <Badge ton="alerte" taille="compacte">{t('deploiements.etat.retire')}</Badge>;
  }
  if (site.deploymentUrl !== null && site.publishedAt !== null) {
    return <Badge ton="succes" taille="compacte" point>{t('deploiements.etat.enLigne')}</Badge>;
  }
  return <Badge ton="accent" taille="compacte">{t('deploiements.etape.redaction')}</Badge>;
}

/**
 * La colonne contextuelle.
 *
 * Elle change de sens selon l'onglet — c'est ce qui évite d'afficher une
 * colonne vide sur cinq onglets sur huit. Dans « à contacter », elle porte le
 * SUIVI, et c'est là que « jamais contacté » (aucune ligne en base) reste
 * distinct de « à contacter » (une ligne posée) malgré l'onglet commun.
 */
function celluleContexte(
  prospect: ProspectView,
  onglet: OngletVeille,
  now: Date,
  t: ReturnType<typeof useT>,
): ReactNode {
  if (onglet === 'toutes' || onglet === 'a_contacter') {
    return <StatusBadge status={prospect.pipeline?.status ?? null} taille="compacte" />;
  }

  if (ENGAGEMENT.includes(onglet)) {
    const echeance = prospect.pipeline?.nextActionAt ?? null;
    if (echeance === null) return <span className={styles.absent}>{t('veille.echeance.absente')}</span>;
    const date = new Date(echeance);
    if (Number.isNaN(date.getTime())) {
      return <span className={styles.absent}>{t('veille.echeance.absente')}</span>;
    }
    const jours = joursCivils(date, now);
    const cle: TranslationKey =
      jours === 0 ? 'veille.echeance.aujourdhui' : jours > 0 ? 'veille.echeance.retard' : 'veille.echeance.future';
    const params = jours === 0 ? {} : { days: Math.abs(jours), count: Math.abs(jours) };
    return (
      <span className={styles.echeance} data-retard={jours > 0 ? 'true' : undefined}>
        {t(cle, params)}
      </span>
    );
  }

  // Onglets fermés : `updated_at` de la ligne de suivi, la seule date que la
  // table porte pour un dossier clos. Rien n'enregistre encore la date de
  // fermeture elle-même, et l'écrire ici serait l'inventer.
  const maj = prospect.pipeline?.updatedAt ?? null;
  if (maj === null) return <span className={styles.absent}>{t('veille.depuis.absente')}</span>;
  const jours = Math.max(0, joursCivils(new Date(maj), now));
  return <span className={styles.echeance}>{t('veille.depuis', { days: jours, count: jours })}</span>;
}

interface Props {
  prospect: ProspectView;
  onglet: OngletVeille;
  selectionne: boolean;
  now: Date;
  onSelect: (id: string) => void;
}

/**
 * Une rangée de la veille : six colonnes, la dernière contextuelle.
 *
 * C'est un `<button>` et non un `<div role="button">` : la sémantique native
 * apporte le focus, l'activation à Entrée et l'annonce correcte, et l'une des
 * trois serait oubliée en les réimplémentant.
 */
export function RangeeVeille({ prospect, onglet, selectionne, now, onSelect }: Props) {
  const t = useT();
  const nom = prospect.denominationUsuelle ?? prospect.denomination;
  const total = prospect.score?.total ?? null;
  const categorie = prospect.presence?.category ?? null;
  const telephone = prospect.enrichment?.phoneE164 ?? null;
  const type = prospect.enrichment?.phoneKind ?? null;

  return (
    <button
      type="button"
      id={`prospect-${prospect.id}`}
      className={`${styles.rangee} ${selectionne ? styles.selectionnee : ''}`}
      aria-current={selectionne ? 'true' : undefined}
      onClick={() => onSelect(prospect.id)}
    >
      <span className={styles.score}>
        {/* `pageVeille` n'admet que des prospects scorés : `total` ne peut pas
            être nul ici. La garde reste, parce qu'un composant ne se repose
            pas sur l'invariant d'un appelant qu'il ne contrôle pas. */}
        <span className={styles.total} data-fort={total !== null && total >= SCORE_FORT ? 'true' : undefined}>
          {total ?? '—'}
        </span>
        <span className={styles.segments} aria-hidden="true">
          {COULEUR_SEGMENT.map((couleur, i) => (
            <span key={i} className={styles.segment} style={{ width: 11 - i * 2, background: couleur }} />
          ))}
        </span>
      </span>

      <span className={styles.identite}>
        <span className={styles.nom}>{nom}</span>
        <Badge ton="neutre" taille="compacte">{t(`trade.${prospect.tradeSlug}` as TranslationKey)}</Badge>
      </span>

      <span>
        {/* Ton NEUTRE, toujours : « aucune présence web » est le meilleur signal
            du barème, et un vert le ferait lire comme « site correct ».
            L'information est dans le mot. Seule l'absence de sondage porte le
            trait discontinu. */}
        <Badge ton="neutre" taille="compacte" discontinu={categorie === null}>
          {t(categorie === null ? 'presence.absent' : (`presence.${categorie}` as TranslationKey))}
        </Badge>
      </span>

      <span className={styles.telephone}>
        {telephone === null ? (
          <>
            <span className={styles.absent}>{t('veille.telephone.absent')}</span>
            <span className={styles.detailAbsent}>{t('veille.telephone.absent.detail')}</span>
          </>
        ) : (
          <>
            <span className={styles.numero}>{telephone}</span>
            <span className={styles.type}>
              {t(type === 'mobile' ? 'veille.telephone.mobile' : 'veille.telephone.fixe')}
            </span>
          </>
        )}
      </span>

      <span>{celluleSite(prospect.site, t)}</span>
      <span>{celluleContexte(prospect, onglet, now, t)}</span>
    </button>
  );
}
```

> **Deux clés composées à l'exécution entrent ici** : `presence.${categorie}` et `trade.${prospect.tradeSlug}`. La première existe déjà (`presence.none`, `presence.social_only`, …) ; la seconde **n'existe pas encore**. Deux gestes obligatoires à cette étape :
> 1. ajoute `'trade.plombier': 'Plombier'` et `'trade.serrurier': 'Serrurier'` à `fr.ts` et `en.ts` (les deux seuls métiers de `packages/core/src/trades.ts`) ;
> 2. ajoute `'trade.'` à `COMPOSEES_A_L_EXECUTION` dans `i18n/i18n.test.ts`, avec sa raison en commentaire : « `RangeeVeille.tsx` compose `trade.${prospect.tradeSlug}` sur les slugs de `TRADES` ; aucune de ces clés n'apparaît littéralement dans le code. »
> `presence.` n'a **pas** besoin d'y entrer : `Reason`/`today.ts` écrivent déjà ces clés littéralement.

- [ ] **Étape 5 : Lancer, vérifier que ça passe**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : les neuf cas de `RangeeVeille` passent.

- [ ] **Étape 6 : Prouver que les assertions peuvent échouer**

Trois cassures :
1. Dans `celluleContexte`, remplace la branche `a_contacter` par `return null` : le cas « jamais contacté / à contacter » vire au rouge.
2. Remplace `joursCivils(date, now)` par `0` : le cas « en retard de 3 j » vire au rouge.
3. Remplace `discontinu={categorie === null}` par `discontinu={false}` : **le test ne bouge pas** — il n'assertait que le texte. Ajoute alors l'assertion manquante sur `data-discontinu` (voir `kit/Badge.tsx`, qui pose l'attribut) plutôt que de laisser passer une distinction non couverte.

- [ ] **Étape 7 : Commit**

```bash
git add apps/dashboard/src/ui/RangeeVeille.tsx apps/dashboard/src/ui/RangeeVeille.module.css apps/dashboard/src/ui/RangeeVeille.test.tsx apps/dashboard/src/i18n/i18n.test.ts
git add -p apps/dashboard/src/i18n/fr.ts apps/dashboard/src/i18n/en.ts   # veille.telephone.*, veille.echeance.*, veille.depuis*, trade.*
git commit -m "feat(veille): la rangée, ses six colonnes et ses six absences"
```

---

## Tâche 7 : La table — en-tête, ligne de compte, vide nommé

**Files:**
- Create: `apps/dashboard/src/ui/TableVeille.tsx`
- Create: `apps/dashboard/src/ui/TableVeille.module.css`
- Create: `apps/dashboard/src/ui/TableVeille.test.tsx`

**Interfaces:**
- Consomme : `PageVeille`, `ComptesVeille`, `OngletVeille`, `OrdreVeille`, `LIGNES_PAR_PAGE` de `../domain/veille.js` ; `RangeeVeille`, `Pagination`, `OngletsVeille`.
- Produit : `function TableVeille(props: { onglet: OngletVeille; comptes: ComptesVeille; page: PageVeille; ordre: OrdreVeille; totalEnBase: number; selectedId: string | null; now: Date; recherche: string; ongletPleinSansRecherche: number; onChoisirOnglet: (o: OngletVeille) => void; onAllerPage: (p: number) => void; onBasculerOrdre: () => void; onSelect: (id: string) => void; onEffacerRecherche: () => void }): JSX.Element`.

**Maquette :** `Veille.dc.html` (en-tête de colonnes, ligne de compte, pagination) ; `VeilleEtats.dc.html` blocs A, B, C, D.

> **Un onglet vide n'affiche ni en-tête de colonnes, ni barre de pagination.** Des colonnes qui titrent zéro rangée et un « 0 sur 0 » sont du chrome qui ne dit rien. Le vide nommé prend toute la place, et porte une sortie vers l'onglet plein.
>
> **La ligne de compte dit ce que l'onglet montre ET ce qu'il ne montre pas.** Dans « à contacter » et « toutes », elle porte en plus le badge des prospects jamais scorés — ceux-là ne sont dans aucun onglet, et rien d'autre à l'écran ne le dirait.
>
> **Deux vides, deux causes, deux textes** (`VeilleEtats.dc.html`, blocs A et C). Un onglet vide parce qu'aucun prospect n'y est jamais passé n'est pas un onglet vidé par une recherche. `ongletPleinSansRecherche` est ce qui les sépare : si l'onglet contenait des lignes avant que la recherche ne s'applique, c'est la recherche qui le vide, et lui servir « Aucune vente conclue pour l'instant » mentirait sur la cause. C'est exactement la condition que `clefAbsence` porte déjà dans `TodayScreen.tsx` pour les relances dues.

- [ ] **Étape 1 : Écrire le test qui échoue**

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComptesVeille, PageVeille } from '../domain/veille.js';
import type { ProspectView } from '../domain/prospect.js';
import { TableVeille } from './TableVeille.js';
import { renderWithPreferences } from '../test-utils.js';

const MAINTENANT = new Date('2026-09-10T09:00:00.000Z');

function prospect(id: string, total: number): ProspectView {
  return {
    id, siret: '12345678900011', denomination: `Prospect ${id}`, denominationUsuelle: null,
    tradeSlug: 'plombier', address: '', postalCode: '44000', city: 'Nantes', dateCreation: null,
    effectifCode: null, isClosed: false, discoveredAt: '2026-09-01T00:00:00.000Z',
    score: { total, rulesetVersion: 'v3', computedAt: '2026-09-02T00:00:00.000Z', breakdown: [] },
    presence: null, enrichment: null, pipeline: null, site: null, messages: [],
  };
}

const COMPTES: ComptesVeille = {
  parOnglet: { a_contacter: 127, contacte: 1, relance: 1, interesse: 0, gagne: 0, perdu: 0, ne_pas_contacter: 0, toutes: 129 },
  sansScore: 10,
  sansSuivi: 137,
};

function page(surcharges: Partial<PageVeille> = {}): PageVeille {
  return {
    lignes: [prospect('a', 86), prospect('b', 79)],
    total: 127, page: 1, pages: 13, premier: 1, dernier: 2,
    ...surcharges,
  };
}

const props = {
  comptes: COMPTES, ordre: 'score_desc' as const, totalEnBase: 139, selectedId: null,
  now: MAINTENANT, recherche: '', ongletPleinSansRecherche: 0,
  onChoisirOnglet: () => {}, onAllerPage: () => {}, onBasculerOrdre: () => {},
  onSelect: () => {}, onEffacerRecherche: () => {},
};

describe('TableVeille', () => {
  it('titre ses six colonnes, la dernière portant le sens de l onglet ouvert', () => {
    const { unmount } = renderWithPreferences(
      <TableVeille {...props} onglet="a_contacter" page={page()} />,
    );
    for (const titre of ['Score', 'Prospect', 'Présence web', 'Téléphone', 'Site', 'Suivi']) {
      expect(screen.getByText(titre)).toBeDefined();
    }
    unmount();

    renderWithPreferences(<TableVeille {...props} onglet="contacte" page={page()} />);
    expect(screen.getByText('Prochaine action')).toBeDefined();
    expect(screen.queryByText('Suivi')).toBeNull();
  });

  it('nomme les prospects jamais scorés, qui ne sont dans aucun onglet', () => {
    renderWithPreferences(<TableVeille {...props} onglet="a_contacter" page={page()} />);
    expect(screen.getByText('10 jamais scorés, non classables')).toBeDefined();
  });

  it('ne parle des jamais scorés que là où un classement de la base a lieu', () => {
    // Sur un onglet d'une ligne, cette phrase annonce une exclusion d'une
    // liste qui n'existe pas.
    renderWithPreferences(<TableVeille {...props} onglet="contacte" page={page({ total: 1, pages: 1, lignes: [prospect('a', 74)], dernier: 1 })} />);
    expect(screen.queryByText('10 jamais scorés, non classables')).toBeNull();
  });

  it('nomme un onglet vide, et n affiche alors ni colonnes ni pagination', () => {
    renderWithPreferences(
      <TableVeille {...props} onglet="gagne" page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })} />,
    );
    expect(screen.getByText('Aucune vente conclue pour l’instant')).toBeDefined();
    expect(screen.queryByText('Score')).toBeNull();
    expect(screen.queryByText('10 par page')).toBeNull();
  });

  it('offre depuis un onglet vide une sortie vers l onglet plein', async () => {
    const onChoisirOnglet = vi.fn();
    renderWithPreferences(
      <TableVeille {...props} onChoisirOnglet={onChoisirOnglet} onglet="gagne" page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 127 à contacter' }));
    expect(onChoisirOnglet).toHaveBeenCalledWith('a_contacter');
  });

  it('distingue un onglet vidé par la recherche d un onglet vide de naissance', async () => {
    // Deux absences de natures différentes : « personne n'est jamais passé
    // ici » et « votre recherche ne rend rien ». Les confondre ferait annoncer
    // « Aucune vente conclue » à quelqu'un qui a tapé « couvreur ».
    const onEffacerRecherche = vi.fn();
    renderWithPreferences(
      <TableVeille
        {...props}
        onglet="a_contacter"
        recherche="couvreur"
        ongletPleinSansRecherche={127}
        onEffacerRecherche={onEffacerRecherche}
        page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })}
      />,
    );
    expect(screen.getByText('Aucune ligne ne correspond à votre recherche')).toBeDefined();
    expect(
      screen.getByText('127 prospects sont bien dans cet onglet — aucun ne porte « couvreur ».'),
    ).toBeDefined();
    expect(screen.queryByText('Aucun prospect à contacter')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(onEffacerRecherche).toHaveBeenCalled();
  });

  it('garde le vide de l onglet quand la recherche n y est pour rien', () => {
    // L'onglet était déjà vide sans elle : la recherche n'explique pas ce vide.
    renderWithPreferences(
      <TableVeille
        {...props}
        onglet="gagne"
        recherche="couvreur"
        ongletPleinSansRecherche={0}
        page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })}
      />,
    );
    expect(screen.getByText('Aucune vente conclue pour l’instant')).toBeDefined();
  });

  it('bascule l ordre du classement, et le dit', async () => {
    const onBasculerOrdre = vi.fn();
    renderWithPreferences(
      <TableVeille {...props} onBasculerOrdre={onBasculerOrdre} onglet="a_contacter" page={page()} />,
    );
    const tri = screen.getByRole('button', { name: 'Tri : score décroissant' });
    await userEvent.click(tri);
    expect(onBasculerOrdre).toHaveBeenCalled();
  });
});
```

- [ ] **Étape 2 : Lancer, vérifier l'échec**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : ÉCHEC — `Failed to resolve import "./TableVeille.js"`.

- [ ] **Étape 3 : Écrire `TableVeille.module.css`**

```css
.section {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/*
 * Le trait bas est porté ICI et non par `OngletsVeille` : le bouton de tri est
 * à droite dans la même bande, et un trait qui s'arrêterait au dernier onglet
 * laisserait ce bouton flotter au-dessus du vide.
 */
.barreHaut {
  display: flex;
  align-items: stretch;
  height: 34px;
  border-bottom: 1px solid var(--color-border);
  flex: none;
}

.espace {
  flex: 1;
}

.tri {
  align-self: center;
  padding-bottom: var(--space-1);
}

.ligneCompte {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 22px;
  margin: 9px 0;
  flex: none;
}

.titre {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--color-text-faint);
  font-weight: 600;
}

.compte {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/*
 * L'en-tête reprend la grille des rangées par composition : les colonnes de
 * l'en-tête et celles du corps ne peuvent donc pas diverger, faute de valeur à
 * recopier.
 */
.entete {
  composes: grille from './RangeeVeille.module.css';
  height: 22px;
  flex: none;
}

.separateur {
  height: 1px;
  background: var(--color-border);
  flex: none;
}

.corps {
  flex: none;
}

.vide {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin: var(--space-3) 0 var(--space-4);
  padding: var(--space-5);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
}

.videTitre {
  font-size: var(--text-md);
  font-weight: 600;
  text-align: center;
}

.videTexte {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  max-width: 420px;
}

.sortie {
  margin-top: var(--space-1);
}
```

- [ ] **Étape 4 : Écrire `TableVeille.tsx`**

```tsx
import type { ComptesVeille, OngletVeille, OrdreVeille, PageVeille } from '../domain/veille.js';
import { LIGNES_PAR_PAGE } from '../domain/veille.js';
import type { TranslationKey } from '../i18n/translate.js';
import { Badge } from './kit/Badge.js';
import { Pagination } from './kit/Pagination.js';
import { Tooltip } from './kit/Tooltip.js';
import { OngletsVeille } from './OngletsVeille.js';
import { RangeeVeille } from './RangeeVeille.js';
import { useT } from './preferences.js';
import styles from './TableVeille.module.css';

/** Le titre de la sixième colonne, qui change de sens avec l'onglet. */
const COLONNE_CONTEXTE: Record<OngletVeille, TranslationKey> = {
  a_contacter: 'veille.colonne.suivi',
  contacte: 'veille.colonne.prochaineAction',
  relance: 'veille.colonne.prochaineAction',
  interesse: 'veille.colonne.prochaineAction',
  gagne: 'veille.colonne.closDepuis',
  perdu: 'veille.colonne.closDepuis',
  ne_pas_contacter: 'veille.colonne.depuis',
  toutes: 'veille.colonne.statut',
};

const VIDE_TITRE: Record<OngletVeille, TranslationKey> = {
  a_contacter: 'veille.vide.a_contacter.titre',
  contacte: 'veille.vide.contacte.titre',
  relance: 'veille.vide.relance.titre',
  interesse: 'veille.vide.interesse.titre',
  gagne: 'veille.vide.gagne.titre',
  perdu: 'veille.vide.perdu.titre',
  ne_pas_contacter: 'veille.vide.ne_pas_contacter.titre',
  toutes: 'veille.vide.toutes.titre',
};

const VIDE_TEXTE: Record<OngletVeille, TranslationKey> = {
  a_contacter: 'veille.vide.a_contacter.texte',
  contacte: 'veille.vide.contacte.texte',
  relance: 'veille.vide.relance.texte',
  interesse: 'veille.vide.interesse.texte',
  gagne: 'veille.vide.gagne.texte',
  perdu: 'veille.vide.perdu.texte',
  ne_pas_contacter: 'veille.vide.ne_pas_contacter.texte',
  toutes: 'veille.vide.toutes.texte',
};

const TITRE_ONGLET: Record<OngletVeille, TranslationKey> = {
  a_contacter: 'pipeline.status.a_contacter',
  contacte: 'pipeline.status.contacte',
  relance: 'pipeline.status.relance',
  interesse: 'pipeline.status.interesse',
  gagne: 'pipeline.status.gagne',
  perdu: 'pipeline.status.perdu',
  ne_pas_contacter: 'pipeline.status.ne_pas_contacter',
  toutes: 'veille.onglet.toutes',
};

/**
 * Les deux onglets où un classement de la BASE a lieu, et où le compte des
 * prospects jamais scorés a donc un sens.
 *
 * Ailleurs, la phrase annoncerait une exclusion d'une liste qui n'existe pas :
 * sur un onglet d'une ligne, elle pèse plus que ce qu'elle dit.
 */
const CLASSEMENT_DE_LA_BASE: readonly OngletVeille[] = ['a_contacter', 'toutes'];

interface Props {
  onglet: OngletVeille;
  comptes: ComptesVeille;
  page: PageVeille;
  ordre: OrdreVeille;
  /** Le nombre de prospects en base, scorés ou non — il n'est pas déductible des comptes. */
  totalEnBase: number;
  selectedId: string | null;
  now: Date;
  /** Le texte cherché dans la barre du haut. Vide quand rien n'est cherché. */
  recherche: string;
  /**
   * Ce que l'onglet contiendrait SANS la recherche.
   *
   * C'est la seule chose qui distingue un onglet vidé par une recherche d'un
   * onglet vide de naissance. Un composant ne peut pas la recalculer : il ne
   * voit que la page qu'on lui donne.
   */
  ongletPleinSansRecherche: number;
  onChoisirOnglet: (onglet: OngletVeille) => void;
  onAllerPage: (page: number) => void;
  onBasculerOrdre: () => void;
  onSelect: (id: string) => void;
  onEffacerRecherche: () => void;
}

/**
 * Toute la veille : la barre d'onglets, ce que l'onglet montre, la table, la
 * pagination.
 *
 * Un onglet vide n'affiche NI en-tête de colonnes NI pagination : des colonnes
 * qui titrent zéro rangée et un « 0 sur 0 » sont du chrome qui ne dit rien. Le
 * vide nommé prend leur place, et porte une sortie vers l'onglet plein.
 */
export function TableVeille({
  onglet, comptes, page, ordre, totalEnBase, selectedId, now, recherche, ongletPleinSansRecherche,
  onChoisirOnglet, onAllerPage, onBasculerOrdre, onSelect, onEffacerRecherche,
}: Props) {
  const t = useT();
  const vide = page.lignes.length === 0;
  const classables = comptes.parOnglet.toutes;

  // « Vidé par la recherche » suppose que l'onglet contenait quelque chose
  // avant elle. Sans cette condition, un onglet à zéro depuis toujours se
  // verrait attribuer une cause qui n'est pas la sienne.
  const videParRecherche = vide && recherche.trim() !== '' && ongletPleinSansRecherche > 0;

  const compte =
    onglet === 'a_contacter'
      ? t('veille.compte.a_contacter', { classables: page.total, total: comptes.sansSuivi })
      : onglet === 'toutes'
        ? t('veille.compte.toutes', { classables, total: totalEnBase })
        : page.total === 0
          ? t('veille.compte.vide')
          : t('veille.compte.statut', { count: page.total, classables });

  return (
    <section className={styles.section}>
      <div className={styles.barreHaut}>
        <OngletsVeille onglet={onglet} comptes={comptes} onChoisir={onChoisirOnglet} />
        <span className={styles.espace} />
        <div className={styles.tri}>
          <button type="button" onClick={onBasculerOrdre}>
            {t(ordre === 'score_desc' ? 'veille.tri.score_desc' : 'veille.tri.score_asc')}
          </button>
        </div>
      </div>

      <div className={styles.ligneCompte}>
        <span className={styles.titre}>{t(TITRE_ONGLET[onglet])}</span>
        <span className={styles.compte}>{compte}</span>
        {CLASSEMENT_DE_LA_BASE.includes(onglet) && comptes.sansScore > 0 ? (
          <Tooltip label={t('veille.sansScore.hint')}>
            <Badge ton="alerte" taille="compacte" discontinu>
              {t('veille.sansScore', { count: comptes.sansScore })}
            </Badge>
          </Tooltip>
        ) : null}
      </div>

      {videParRecherche ? (
        <div className={styles.vide}>
          <span className={styles.videTitre}>{t('veille.vide.recherche.titre')}</span>
          <span className={styles.videTexte}>
            {t('veille.vide.recherche.texte', { count: ongletPleinSansRecherche, query: recherche.trim() })}
          </span>
          <button type="button" className={styles.sortie} onClick={onEffacerRecherche}>
            {t('veille.vide.recherche.effacer')}
          </button>
        </div>
      ) : vide ? (
        <div className={styles.vide}>
          <span className={styles.videTitre}>{t(VIDE_TITRE[onglet])}</span>
          <span className={styles.videTexte}>{t(VIDE_TEXTE[onglet])}</span>
          {onglet === 'a_contacter' ? null : (
            <button type="button" className={styles.sortie} onClick={() => onChoisirOnglet('a_contacter')}>
              {t('veille.vide.sortie', { count: comptes.parOnglet.a_contacter })}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={styles.entete}>
            <span className={styles.titre}>{t('veille.colonne.score')}</span>
            <span className={styles.titre}>{t('veille.colonne.prospect')}</span>
            <span className={styles.titre}>{t('veille.colonne.presence')}</span>
            <span className={styles.titre}>{t('veille.colonne.telephone')}</span>
            <span className={styles.titre}>{t('veille.colonne.site')}</span>
            <span className={styles.titre}>{t(COLONNE_CONTEXTE[onglet])}</span>
          </div>
          <div className={styles.separateur} />

          <div className={styles.corps}>
            {page.lignes.map((prospect) => (
              <RangeeVeille
                key={prospect.id}
                prospect={prospect}
                onglet={onglet}
                selectionne={prospect.id === selectedId}
                now={now}
                onSelect={onSelect}
              />
            ))}
          </div>

          <span className={styles.espace} />

          <Pagination
            page={page.page}
            pages={page.pages}
            premier={page.premier}
            dernier={page.dernier}
            total={page.total}
            taille={LIGNES_PAR_PAGE}
            onAller={onAllerPage}
          />
        </>
      )}
    </section>
  );
}
```

> **Vérifie la signature réelle de `kit/Tooltip.tsx`** avant d'écrire l'appel : ouvre le fichier et emploie ses props telles qu'elles sont. Si l'infobulle n'accepte pas un enfant arbitraire, rends le badge sans elle et déplace l'explication dans un `title` — mais ne double **pas** le kit avec une seconde infobulle.
>
> Le bouton de tri et le bouton de sortie n'ont pas de classe dédiée dans ce plan : reprends le style de bouton en contour déjà employé ailleurs (`ui/PanelActions.module.css`) plutôt que d'en écrire un troisième.

- [ ] **Étape 5 : Lancer, vérifier que ça passe**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : les huit cas de `TableVeille` passent.

- [ ] **Étape 6 : Prouver que les assertions peuvent échouer**

Remplace `{vide ? (` par `{false ? (` : le cas « onglet vide » vire au rouge (l'en-tête réapparaît). Restaure. Remplace `CLASSEMENT_DE_LA_BASE.includes(onglet)` par `true` : le cas « ne parle des jamais scorés que là où… » vire au rouge. Restaure. Remplace `ongletPleinSansRecherche > 0` par `true` : le cas « garde le vide de l'onglet quand la recherche n'y est pour rien » vire au rouge. Restaure.

- [ ] **Étape 7 : Commit**

```bash
git add apps/dashboard/src/ui/TableVeille.tsx apps/dashboard/src/ui/TableVeille.module.css apps/dashboard/src/ui/TableVeille.test.tsx
git add -p apps/dashboard/src/i18n/fr.ts apps/dashboard/src/i18n/en.ts   # veille.colonne.*, veille.compte.*, veille.vide.*, veille.sansScore*, veille.tri.*, veille.titre
git commit -m "feat(veille): la table, sa ligne de compte et ses vides nommés"
```

---

## Tâche 8 : Le brief repliable, et son état persistant

**Files:**
- Modify: `apps/dashboard/src/ui/preferences.tsx`
- Create: `apps/dashboard/src/ui/BriefDuJour.tsx`
- Create: `apps/dashboard/src/ui/BriefDuJour.module.css`
- Create: `apps/dashboard/src/ui/BriefDuJour.test.tsx`

**Interfaces:**
- Produit : sur `Preferences`, `briefReplie: boolean` et `setBriefReplie: (replie: boolean) => void` ; `function BriefDuJour(props: { jeu: Parameters<typeof BandeProgression>[0]['jeu']; relances: WorkList; selectedId: string | null; currentRulesetVersion: string; emptyKey: TranslationKey; now: Date; onSelect: (id: string) => void }): JSX.Element`.

**Maquette :** `Veille.dc.html` (brief déplié) et `VeilleCompacte.dc.html` (brief replié, et son résumé).

> **Le repli est persistant, pas de session.** Décision 3-1 : c'est le seul réglage qui rende la page tenable sur un écran de portable, et le redemander à chaque visite le rendrait inutile. Il suit donc le patron déjà posé par le thème et la locale dans `preferences.tsx` — `localStorage` enveloppé, dégradation silencieuse quand le navigateur refuse le stockage.
>
> **Replié, le brief ne disparaît pas : il se résume.** Ce qui est dû reste compté sur une ligne. Un brief qui s'efface entièrement ferait manquer une relance en retard le jour où l'on travaille sur un petit écran.

- [ ] **Étape 1 : Étendre `preferences.tsx`**

Ajoute à côté de `CLE_LOCALE` / `CLE_THEME` :

```ts
const CLE_BRIEF = 'prospeo.briefReplie';
```

Ajoute à l'interface `Preferences` :

```ts
  /**
   * Le brief du jour est-il replié ?
   *
   * Persisté, et non tenu en état de session : c'est le seul réglage qui rende
   * la table de veille tenable sur un écran de portable (décision 3-1 du
   * 2026-09-10), et le redemander à chaque visite le rendrait inutile.
   */
  briefReplie: boolean;
  setBriefReplie: (replie: boolean) => void;
```

Dans le composant, à côté des deux autres états :

```ts
  const [briefReplie, setBriefReplieState] = useState<boolean>(
    () => lire(CLE_BRIEF, ['true', 'false'] as const, 'false') === 'true',
  );

  const setBriefReplie = useCallback((replie: boolean) => {
    setBriefReplieState(replie);
    ecrire(CLE_BRIEF, String(replie));
  }, []);
```

Puis ajoute `briefReplie` et `setBriefReplie` à l'objet `value` **et** à son tableau de dépendances `useMemo`.

- [ ] **Étape 2 : Écrire le test qui échoue**

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BriefDuJour } from './BriefDuJour.js';
import { renderWithPreferences } from '../test-utils.js';

const RELANCES = {
  items: [],
  totalCount: 0,
};

const props = {
  jeu: { status: 'idle' } as never,
  relances: RELANCES,
  selectedId: null,
  currentRulesetVersion: 'v3',
  emptyKey: 'today.empty.followUps' as const,
  now: new Date('2026-09-10T09:00:00.000Z'),
  onSelect: () => {},
};

describe('BriefDuJour', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('est déplié par défaut : on ne cache pas ce qui est dû à la première visite', () => {
    renderWithPreferences(<BriefDuJour {...props} />);
    expect(screen.getByRole('button', { name: 'Replier le brief' })).toBeDefined();
  });

  it('se replie en un résumé, qui compte encore ce qui est dû', async () => {
    renderWithPreferences(<BriefDuJour {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Replier le brief' }));
    expect(screen.getByText('Brief du jour')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Déplier' })).toBeDefined();
  });

  it('retient le repli d une visite à l autre', async () => {
    const { unmount } = renderWithPreferences(<BriefDuJour {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Replier le brief' }));
    unmount();

    renderWithPreferences(<BriefDuJour {...props} />);
    expect(screen.getByRole('button', { name: 'Déplier' })).toBeDefined();
  });
});
```

> **`props.jeu` est volontairement pauvre ici.** `BriefDuJour` transmet cet objet à `BandeProgression`, qui a ses propres tests ; le redécrire entièrement dans ce fichier dupliquerait leur couverture. Ouvre `ui/BandeProgression.tsx` pour lire le type réel et emploie la valeur d'attente la plus simple qu'il accepte — pas un `as never` si un état légitime existe.

- [ ] **Étape 3 : Lancer, vérifier l'échec**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : ÉCHEC — `Failed to resolve import "./BriefDuJour.js"`.

- [ ] **Étape 4 : Écrire `BriefDuJour.module.css` et `BriefDuJour.tsx`**

`BriefDuJour.module.css` :

```css
.brief {
  display: flex;
  flex-direction: column;
  flex: none;
}

.replie {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 26px;
  padding: 0 var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  flex: none;
}

.titre {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--color-text-faint);
  font-weight: 600;
}

.resume {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.espace {
  flex: 1;
}

.barreTitre {
  display: flex;
  align-items: center;
  flex: none;
}
```

`BriefDuJour.tsx` :

```tsx
import { useMemo } from 'react';
import { joursCivils } from '../domain/today.js';
import type { WorkList } from '../domain/prospect.js';
import type { TranslationKey } from '../i18n/translate.js';
import { BandeProgression } from './BandeProgression.js';
import { WorkListSection } from './WorkListSection.js';
import { usePreferences, useT } from './preferences.js';
import styles from './BriefDuJour.module.css';

const CHEVRON = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
} as const;

interface Props {
  /** Transmis tel quel à `BandeProgression`, qui seule en connaît la forme. */
  jeu: Parameters<typeof BandeProgression>[0]['jeu'];
  relances: WorkList;
  selectedId: string | null;
  currentRulesetVersion: string;
  emptyKey: TranslationKey;
  now: Date;
  onSelect: (id: string) => void;
}

/**
 * Le brief du jour : ce qu'on vise, et ce qui est dû.
 *
 * Repliable, et **le repli est retenu d'une visite à l'autre** (décision 3-1
 * du 2026-09-10) : c'est le seul réglage qui rende la table de veille tenable
 * sur un écran de portable, et le redemander chaque matin le rendrait inutile.
 *
 * Replié, le brief ne disparaît pas — il se résume, et ce qui est dû reste
 * compté. Un brief qui s'efface entièrement ferait manquer une relance en
 * retard le jour où l'on travaille sur un petit écran, c'est-à-dire le jour
 * où l'on a le plus de raisons de l'avoir replié.
 */
export function BriefDuJour({
  jeu, relances, selectedId, currentRulesetVersion, emptyKey, now, onSelect,
}: Props) {
  const t = useT();
  const { briefReplie, setBriefReplie } = usePreferences();

  // Compté, jamais écrit en dur : c'est un fait sur les données du jour.
  const enRetard = useMemo(
    () =>
      relances.items.filter((row) => {
        const echeance = row.prospect.pipeline?.nextActionAt ?? null;
        if (echeance === null) return false;
        const date = new Date(echeance);
        return !Number.isNaN(date.getTime()) && joursCivils(date, now) > 0;
      }).length,
    [relances, now],
  );

  if (briefReplie) {
    return (
      <div className={styles.replie}>
        <span className={styles.titre}>{t('veille.brief.titre')}</span>
        <span className={styles.resume}>
          {relances.totalCount === 0
            ? t('veille.brief.relances.aucune')
            : t('veille.brief.relances', { count: relances.totalCount, retard: enRetard })}
        </span>
        <span className={styles.espace} />
        <button type="button" onClick={() => setBriefReplie(false)}>
          {t('veille.brief.deplier')}
          <svg {...CHEVRON}><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.brief}>
      <div className={styles.barreTitre}>
        <span className={styles.espace} />
        <button type="button" onClick={() => setBriefReplie(true)}>
          {t('veille.brief.replier')}
          <svg {...CHEVRON}><path d="m18 15-6-6-6 6" /></svg>
        </button>
      </div>

      <BandeProgression jeu={jeu} />

      <WorkListSection
        titleKey="today.section.followUps"
        emptyKey={emptyKey}
        list={relances}
        selectedId={selectedId}
        currentRulesetVersion={currentRulesetVersion}
        onSelect={onSelect}
      />
    </div>
  );
}
```

> **`usePreferences` : vérifie son nom réel dans `ui/preferences.tsx`** avant d'écrire l'import. Le fichier exporte `useT` ; si le hook d'accès complet porte un autre nom, emploie-le — n'en ajoute pas un second.
>
> **`Parameters<typeof BandeProgression>[0]['jeu']`** évite de recopier ici un type que `BandeProgression` possède déjà. Si son fichier exporte le type nommé, importe-le plutôt : c'est plus lisible, et ce plan préfère toujours le nom au tour de passe-passe.

- [ ] **Étape 5 : Lancer, vérifier que ça passe**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : les trois cas de `BriefDuJour` passent.

- [ ] **Étape 6 : Prouver que les assertions peuvent échouer**

Remplace `ecrire(CLE_BRIEF, String(replie));` par une ligne vide : le cas « retient le repli » vire au rouge. Restaure.

- [ ] **Étape 7 : Commit**

```bash
git add apps/dashboard/src/ui/BriefDuJour.tsx apps/dashboard/src/ui/BriefDuJour.module.css apps/dashboard/src/ui/BriefDuJour.test.tsx apps/dashboard/src/ui/preferences.tsx
git add -p apps/dashboard/src/i18n/fr.ts apps/dashboard/src/i18n/en.ts   # veille.brief.*
git commit -m "feat(veille): le brief repliable, son état retenu d'une visite à l'autre"
```

---

## Tâche 9 : L'écran, et le panneau en surimpression

**Files:**
- Modify: `apps/dashboard/src/screens/TodayScreen.tsx`
- Modify: `apps/dashboard/src/screens/TodayScreen.test.tsx`
- Modify: `apps/dashboard/src/screens/TodayScreen.module.css`
- Modify: `apps/dashboard/src/domain/today.ts`
- Modify: `apps/dashboard/src/domain/today.test.ts`
- Modify: `apps/dashboard/src/ui/AppShell.module.css`
- Modify: `apps/dashboard/src/ui/ProspectPanel.module.css`
- Modify: `apps/dashboard/src/ui/theme.css`
- Modify: `apps/dashboard/src/ui/theme.test.ts`
- Modify: `apps/dashboard/src/i18n/fr.ts`, `apps/dashboard/src/i18n/en.ts`

> **Le parcours clavier doit traverser les deux listes.** `ids` concatène les relances dues **puis** les lignes de la page courante de la table. Un prospect présent dans les deux — cas réel, décision 2A — apparaîtrait deux fois dans `ids`, et `indexOf` ramènerait toujours à la première : les flèches buteraient. **Dédoublonne `ids`** en gardant la première occurrence.
>
> **Le panneau devient un calque.** `.body` porte `position: relative` à toutes les largeurs (la règle existait déjà, mais sous `@media (max-width: 900px)` seulement), `.panel` devient `position: absolute` à droite, à `--z-panel`, avec une ombre portée. La bascule à 900 px de `ProspectPanel.module.css` **disparaît** : elle décrivait exactement le comportement qui devient universel.
>
> **Deux clés perdent leur consommateur** : `today.section.newHighScore` et `today.empty.newHighScore`. Elles se retirent de `fr.ts` **et** `en.ts` dans cette tâche, sans quoi `clés orphelines` échoue. `today.empty.search` reste : la recherche filtre encore les relances dues.

- [ ] **Étape 1 : Ajouter le token d'ombre à `theme.css`**

Dans `:root` :

```css
  /* L'ombre du panneau, qui est un calque posé sur la liste : elle porte à
     gauche, et c'est elle qui dit qu'il flotte plutôt qu'il ne pousse. */
  --shadow-panel: -20px 0 48px rgb(0 0 0 / 55%);
```

Dans `:root[data-theme='light']` :

```css
  --shadow-panel: -20px 0 48px rgb(0 0 0 / 14%);
```

`theme.test.ts` vérifie qu'aucun token n'est sans consommateur : le token est employé à l'étape 3, dans la même tâche.

- [ ] **Étape 2 : Retirer `newHighScore` du domaine**

Dans `domain/today.ts` :
- retire `newHighScore` de `TodayLists`, du corps de `buildToday` et de son retour ;
- retire `reasonForScore` et `highlightLines` (plus aucun appelant) ainsi que `MAX_REASON_LINES` ;
- **garde** `MAX_ROWS_PER_LIST`, `joursCivils`, `followUpReason`, `matchesQuery`, `estClos` et `STATUTS_NON_ENGAGES` — la file de relances les emploie toujours ;
- mets à jour le docstring de `buildToday` : il décrit encore « les deux listes de travail du §9.2 ».

Dans `domain/today.test.ts`, retire les cas qui portent sur `newHighScore` et sur `highlightLines`.

- [ ] **Étape 3 : Poser le calque**

`ui/AppShell.module.css` — `.body` :

```css
/*
 * `position: relative` à TOUTES les largeurs, et non plus sous 900 px
 * seulement : le panneau est désormais un calque partout. C'est ce bloc qui
 * lui sert de cadre.
 */
.body {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
}
```

Le bloc `@media (max-width: 900px)` de cette feuille disparaît : il ne portait que ce `position: relative`.

`ui/ProspectPanel.module.css` — `.panel` :

```css
/*
 * Le panneau est un CALQUE, pas un frère de la liste.
 *
 * Posé à côté d'elle, il rejouait la mise en page de toute la table à chaque
 * ouverture : six colonnes recalculées, des largeurs qui sautent, et un
 * classement qu'on relit au lieu de le suivre. En surimpression, la table
 * garde sa largeur et ses colonnes ne bougent pas.
 *
 * Ce qu'il faut assumer, et qui est dessiné dans `VeilleDetail.dc.html` : le
 * panneau RECOUVRE les trois colonnes de droite. Restent lisibles à gauche le
 * score, le nom et la présence web — ceux qui servent à naviguer aux flèches
 * pendant que la fiche est ouverte.
 */
.panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 720px;
  max-width: 100%;
  border-left: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
  overflow-y: auto;
  padding: var(--space-4) var(--space-5);
  z-index: var(--z-panel);
}
```

Le bloc `@media (max-width: 900px)` de cette feuille disparaît : il décrivait exactement le comportement qui devient universel. `max-width: 100%` remplace `45vw` — le panneau ne rétrécit plus la liste, il n'y a donc plus de largeur à lui préserver, mais il ne doit pas déborder d'une fenêtre étroite.

`screens/TodayScreen.module.css` : retire tout `overflow-y: auto` de la colonne de liste s'il y en a un — la page coule et défile normalement (décision 3-1), et un défilement interne ramènerait une seconde barre.

- [ ] **Étape 4 : Câbler `TodayScreen`**

Remplace les deux `WorkListSection` par `<BriefDuJour …>` et `<TableVeille …>`, et ajoute l'état :

```tsx
  const [onglet, setOnglet] = useState<OngletVeille>('a_contacter');
  const [numeroPage, setNumeroPage] = useState(1);
  const [ordre, setOrdre] = useState<OrdreVeille>('score_desc');

  const comptes = useMemo(() => comptesVeille(prospectsFiltres), [prospectsFiltres]);
  const page = useMemo(
    () => pageVeille(prospectsFiltres, onglet, ordre, numeroPage),
    [prospectsFiltres, onglet, ordre, numeroPage],
  );

  /**
   * Changer d'onglet, d'ordre ou de recherche ramène à la première page.
   *
   * Sans cela, passer d'un onglet de treize pages à un onglet d'une page
   * afficherait une table vide sur un onglet plein. `pageVeille` borne déjà la
   * page rendue ; ce que ce geste corrige, c'est l'état, qui resterait sinon
   * sur un numéro que plus rien ne justifie.
   */
  const choisirOnglet = useCallback((cible: OngletVeille) => {
    setOnglet(cible);
    setNumeroPage(1);
  }, []);

  /**
   * Ce que l'onglet courant contiendrait SANS la recherche.
   *
   * C'est la seule chose qui distingue « votre recherche ne rend rien » de
   * « personne n'est jamais passé par cet onglet » — deux absences de natures
   * différentes, que `TableVeille` rend de deux façons. Calculé sur
   * `prospects`, jamais sur `prospectsFiltres`, sans quoi il vaudrait
   * toujours zéro au moment précis où il sert.
   */
  const ongletPleinSansRecherche = useMemo(
    () => comptesVeille(prospects).parOnglet[onglet],
    [prospects, onglet],
  );
```

Et remets `setNumeroPage(1)` dans le `onChange` de la recherche, ainsi que dans `onBasculerOrdre`. Passe à `TableVeille` : `recherche={recherche}`, `ongletPleinSansRecherche={ongletPleinSansRecherche}`, `onEffacerRecherche={() => { setRecherche(''); setNumeroPage(1); }}`, et `totalEnBase={prospects.length}`.

Les `ids` du parcours clavier :

```tsx
  /**
   * L'ordre du parcours clavier est l'ordre visuel : les relances dues, puis
   * la page courante de la table.
   *
   * Dédoublonné : un prospect relancé figure dans les DEUX (décision 2A, la
   * bande et l'onglet « Relancé » se recouvrent), et `indexOf` ramènerait
   * toujours à sa première occurrence — les flèches buteraient sur lui.
   */
  const ids = useMemo(() => {
    const vus = new Set<string>();
    const sortie: string[] = [];
    for (const id of [...today.followUps.items.map((r) => r.prospect.id), ...page.lignes.map((p) => p.id)]) {
      if (vus.has(id)) continue;
      vus.add(id);
      sortie.push(id);
    }
    return sortie;
  }, [today, page]);
```

- [ ] **Étape 5 : Mettre à jour `TodayScreen.test.tsx`**

Les cas qui affirmaient sur « Nouveaux prospects à fort score » deviennent des cas sur la table. Ajoute au minimum :

```tsx
  it('montre la table par onglets à la place de l ancienne liste plafonnée', () => {
    // L'ancienne liste s'arrêtait à douze lignes et annonçait le reste par
    // « N de plus, non affichés ici ». C'est le défaut que ce chantier corrige.
    render(<TodayScreen {...props} prospects={quinzeProspectsScores()} />);
    expect(screen.getByRole('tablist', { name: 'Statut de suivi' })).toBeDefined();
    expect(screen.getAllByRole('tab')).toHaveLength(8);
    expect(screen.queryByText(/de plus, non affichés ici/)).toBeNull();
  });

  it('ne descend jamais sous dix lignes affichées quand l onglet en contient plus', () => {
    render(<TodayScreen {...props} prospects={quinzeProspectsScores()} />);
    expect(screen.getByText('1–10 sur 15')).toBeDefined();
  });

  it('parcourt les relances puis la table sans buter sur un prospect présent dans les deux', async () => {
    // Décision 2A : la bande « Relances dues » et l'onglet « Relancé » se
    // recouvrent, et le MÊME prospect figure dans les deux. Sans
    // dédoublonnage des `ids`, `indexOf` ramènerait toujours à sa première
    // occurrence et la flèche resterait bloquée sur lui.
    const relance: ProspectView = {
      ...prospectScore('r1', 90),
      pipeline: { status: 'relance', nextActionAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z' },
    };
    const autre = prospectScore('a1', 80);
    render(<TodayScreen {...props} prospects={[relance, autre]} now={new Date('2026-09-10T09:00:00.000Z')} />);

    // Première flèche : la ligne de relance, en tête de la bande.
    await userEvent.keyboard('{ArrowDown}');
    expect(document.getElementById('prospect-r1')?.getAttribute('aria-current')).toBe('true');

    // Seconde flèche : la ligne SUIVANTE de la table, et non un retour sur
    // `r1` — qui figure pourtant aussi dans l'onglet « À contacter ».
    await userEvent.keyboard('{ArrowDown}');
    expect(document.getElementById('prospect-a1')?.getAttribute('aria-current')).toBe('true');
  });
```

> `prospectScore(id, total)` est la fabrique de ce fichier de test : si `TodayScreen.test.tsx` en a déjà une, emploie-la sous son nom réel plutôt que d'en écrire une seconde.

- [ ] **Étape 6 : Retirer les deux clés orphelines**

Retire de `fr.ts` **et** `en.ts` : `today.section.newHighScore`, `today.empty.newHighScore`.

- [ ] **Étape 7 : Lancer la suite entière, et le typecheck**

Run : `pnpm --filter @prospeo/dashboard test`
Attendu : **tout vert**, `clés orphelines` compris — c'est ici que le garde-fou laissé rouge depuis la tâche 3 redevient vert.

Run : `pnpm -r typecheck`
Attendu : vert sur les 8 paquets.

- [ ] **Étape 8 : Commit**

```bash
git add apps/dashboard/src
git commit -m "feat(veille): la table branchée sur l'écran, et le panneau en calque"
```

---

## Tâche 10 : La relecture de conformité à la maquette

**Files:**
- Modify: `docs/design/HANDOFF.md`
- Aucun fichier de code n'est censé changer ici. Si un écart est trouvé, il se corrige — et la correction fait l'objet d'un commit distinct, cité dans le rapport.

> **C'est la seule tâche qui voie une mise en page, et c'est pour ça qu'elle existe.** Les 6xx tests de ce dépôt tournent sous `jsdom`, qui ne calcule ni largeur, ni hauteur, ni débordement : trois défauts visuels ont déjà traversé 446, puis 460, puis 468 tests verts. La maquette est le seul contrôle qui les voie, et il faut le passer à la main.

- [ ] **Étape 1 : Régénérer les rendus de maquette**

```bash
node docs/design/maquettes/aplatir.mjs
```

Ouvre `docs/design/maquettes/rendu/Veille.html`, `VeilleDetail.html`, `VeilleCompacte.html`, `VeilleEtats.html` dans un navigateur, à côté de l'application lancée par `pnpm --filter @prospeo/dashboard dev`.

- [ ] **Étape 2 : Comparer, point par point, à 1440 × 900**

Fenêtre réduite à **exactement 1440 × 900**, brief déplié, onglet « À contacter ». Coche chaque ligne, ou note l'écart :

- [ ] Huit onglets, dans l'ordre : À contacter, Contacté, Relancé, Intéressé, Gagné, Perdu, Ne pas contacter, | Toutes.
- [ ] La pastille de chaque onglet a la couleur du `StatusBadge` du même statut ; celle de « Ne pas contacter » est un anneau discontinu.
- [ ] Six colonnes, dans l'ordre : Score, Prospect, Présence web, Téléphone, Site, puis le titre contextuel.
- [ ] **Dix rangées** affichées, hauteur 44 px, et la barre de pagination visible **sans faire défiler la page**.
- [ ] Aucun débordement horizontal : aucun texte tronqué au milieu d'un mot, aucun badge coupé.
- [ ] Le nom long se tronque par une ellipse **avant** le badge de métier, jamais après.
- [ ] La ligne de compte porte le badge « N jamais scorés, non classables », discontinu et ambre.

- [ ] **Étape 3 : Le panneau en surimpression**

- [ ] Ouvre une fiche : **les colonnes de la table ne bougent pas** — vérifie en repérant la position horizontale de la colonne « Prospect » avant et après.
- [ ] Le panneau porte une ombre à sa gauche, et couvre la droite de la table.
- [ ] Les flèches ↑ ↓ continuent de changer de prospect pendant que la fiche est ouverte.
- [ ] Échap ferme le panneau ; la ligne reste surlignée.

- [ ] **Étape 4 : La fenêtre de portable, 1440 × 720**

- [ ] Brief replié : **dix rangées et la pagination tiennent, la page ne défile pas.** C'est la mesure faite sur la maquette (`VeilleCompacte`, 720 px pile) ; si l'application défile, c'est un écart à corriger, pas une fatalité.
- [ ] Le résumé du brief compte encore les relances dues et celles en retard.
- [ ] Recharge la page : le brief est **toujours** replié.

- [ ] **Étape 5 : Les états**

Ouvre chaque onglet à zéro et vérifie contre `VeilleEtats.dc.html` :

- [ ] Le vide porte son titre, son texte et sa sortie vers « À contacter ».
- [ ] Ni en-tête de colonnes, ni barre de pagination sur un onglet vide.
- [ ] Onglet « Contacté » : la colonne contextuelle titre « Prochaine action » ; une échéance absente s'affiche « non datée » en italique, jamais une case vide.
- [ ] Onglet « À contacter » : « Jamais contacté » est discontinu, « À contacter » est plein.
- [ ] Un prospect sans enrichissement affiche « aucune coordonnée » et « étage « enrich » non passé ».
- [ ] Bascule le thème clair (préférences) : aucune couleur ne disparaît, aucun texte ne passe sous le seuil de contraste.

- [ ] **Étape 6 : Consigner dans `HANDOFF.md`**

Ajoute une section « La veille par onglets » qui dit, sans ménagement :
- ce que le chantier livre, et ce qui reste inerte — les cinq onglets à zéro le sont **parce que `prospect_pipeline` compte deux lignes**, pas parce que le code est faux ;
- les écarts trouvés à l'étape 2-5 et **non corrigés**, chacun avec sa raison ;
- le fait que `today.section.newHighScore` et `today.empty.newHighScore` ont disparu, et que la liste plafonnée avec elles.

- [ ] **Étape 7 : Lancer la suite complète une dernière fois, et commiter**

```bash
pnpm --filter @prospeo/dashboard test
pnpm -r typecheck
git add docs/design/HANDOFF.md
git commit -m "docs(veille): la relecture de conformité, et ce qui reste inerte"
```

---

## Ce que ce plan ne fait pas

Énoncé pour qu'aucune de ces absences ne soit prise pour un oubli :

- **Aucune migration, aucune écriture en base.** Les cinq onglets à zéro le restent tant que `prospect_pipeline` ne s'alimente pas. Les remplir n'est pas l'affaire de ce chantier.
- **Aucun filtre.** La maquette ne dessine pas de panneau de filtres pour la veille ; en ajouter un serait inventer une affordance qu'aucun artboard approuvé ne porte.
- **Aucun tri autre que par score.** Le bouton bascule entre décroissant et croissant, et rien d'autre. Un tri par échéance ou par commune se maquetterait avant de s'écrire.
- **Aucune action de masse.** Pas de case à cocher, pas de barre d'actions groupées : `Deploiements.dc.html` en porte une, la veille non.
- **`ProspectPanel.tsx` n'est pas retouché.** Seule sa feuille de style bouge. Son contenu, ses quatre onglets et sa jauge restent ceux de `Main.dc.html`.
- **Le bloc B de `VeilleEtats.dc.html` — les comptes affichés « — » avant la réponse — n'est pas implémenté, et n'a pas à l'être ici.** Il dessine un état que cette architecture ne produit pas : `App.tsx` monte `TodayScreen` **après** les gardes de `useProspects`, et l'écran ne se rend donc jamais pendant le chargement. L'artboard reste au dépôt parce qu'il gouvernera le jour où la table lira par pages côté serveur — ce qui n'est pas ce chantier. À consigner tel quel dans `HANDOFF.md`, pour qu'une relecture ne le prenne pas pour un oubli.
- **La sortie d'une ligne hors de son onglet** — le bloc F de `VeilleEtats.dc.html`, avec son « Aquatech Nantes est passé à Contacté » et son « Annuler » — **n'est pas implémentée ici.** Elle suppose une action de statut depuis la fiche qui prévienne la table, et un rappel annulable ; c'est un chantier à part, dessiné pour décider de sa forme. **À l'usage, la ligne disparaîtra donc de l'onglet sans un mot.** C'est le défaut connu que ce plan laisse derrière lui, et il doit figurer dans `HANDOFF.md` à la tâche 10.
