import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Trade } from '@prospeo/core';
import { ATTENTE_SURVOL, renderWithPreferences } from '../test-utils.js';
import type { SiteTemplateView } from '../data/deployments.js';
import { GabaritScreen } from './GabaritScreen.js';

/**
 * Un métier minimal, valide au sens du type `Trade`, mais SANS aucun rapport
 * avec `packages/core/src/trades.ts` — le slug et le libellé sont inventés.
 * Un test qui n'utiliserait que les vrais métiers ne prouverait rien : la
 * liste pourrait tout aussi bien être recopiée en dur dans l'écran et
 * produire le même rendu. Seule une liste fabriquée par le test, distincte
 * du catalogue réel, prouve que l'écran lit la prop `trades` et non un
 * import de `TRADES`.
 */
function trade(patch: Partial<Trade> = {}): Trade {
  return {
    slug: 'peintre',
    label: 'Peintre',
    nafCodes: [],
    mapsQueries: [],
    keywords: [],
    categoryLabels: [],
    prestations: [],
    heros: [],
    ...patch,
  };
}

function template(patch: Partial<SiteTemplateView> = {}): SiteTemplateView {
  return {
    repoFullName: null,
    branch: 'main',
    checkedAt: null,
    checkOk: null,
    checkDetail: null,
    ...patch,
  };
}

function rendre(props: Partial<Parameters<typeof GabaritScreen>[0]> = {}) {
  return renderWithPreferences(
    <GabaritScreen
      template={props.template ?? template()}
      trades={props.trades ?? [trade()]}
      onDesigner={props.onDesigner ?? vi.fn()}
      nav={props.nav}
      onSignOut={props.onSignOut}
    />,
  );
}

const PHRASE_AUCUN_METIER =
  'Aucun métier actuel n’est gouverné par ce gabarit : les deux métiers déclarent chacun le leur, qui l’emporte. Il s’appliquera au premier métier sans exception.';

describe('GabaritScreen — la portee reelle du gabarit designe', () => {
  it('dit que le gabarit ne gouverne aucun metier quand TOUS en declarent un', () => {
    // `templateRepoFor` resout d'abord le `templateRepo` du metier : quand
    // tous les metiers en declarent un, ce qu'on designe ici n'atteint
    // personne. `gabarit.subtitle` affirme pourtant qu'une designation
    // « substitue » le gabarit livre — faux pour 100 % du trafic actuel.
    // L'ecran reste juste et servira au troisieme metier ; le taire serait la
    // seule faute.
    rendre({
      template: template({ repoFullName: 'org/gabarit-generique' }),
      trades: [
        trade({ slug: 'a', label: 'A', templateRepo: 'org/a' }),
        trade({ slug: 'b', label: 'B', templateRepo: 'org/b' }),
      ],
    });
    expect(screen.getByText(PHRASE_AUCUN_METIER)).toBeDefined();
  });

  it('se tait des qu UN metier herite — le gabarit designe gouverne alors quelque chose', () => {
    rendre({
      template: template({ repoFullName: 'org/gabarit-generique' }),
      trades: [
        trade({ slug: 'a', label: 'A', templateRepo: 'org/a' }),
        trade({ slug: 'b', label: 'B' }),
      ],
    });
    expect(screen.queryByText(PHRASE_AUCUN_METIER)).toBeNull();
  });
});

describe('GabaritScreen', () => {
  it('rend le rail de navigation transmis, sans quoi il disparaitrait de l ecran', () => {
    rendre({ nav: <div data-testid="rail-nav">rail</div> });
    expect(screen.getByTestId('rail-nav')).toBeDefined();
  });

  it('affiche le gabarit actif avec sa branche et la date de son dernier controle', () => {
    const verifieLe = '2026-09-01T10:00:00Z';
    rendre({
      template: template({
        repoFullName: 'prospeo/gabarit-agence-v2',
        branch: 'main',
        checkedAt: verifieLe,
        checkOk: true,
        checkDetail: null,
      }),
    });
    expect(screen.getByText('prospeo/gabarit-agence-v2')).toBeDefined();
    expect(screen.getByText('Branche main')).toBeDefined();
    const dateAttendue = new Date(verifieLe).toLocaleDateString();
    expect(screen.getByText(`Contrôle réussi le ${dateAttendue}`)).toBeDefined();
  });

  it('dit l absence de gabarit comme un etat nomme, et non comme un champ vide', () => {
    rendre({ template: template({ repoFullName: null }) });
    const absence = screen.getByText('Aucun gabarit désigné — le gabarit livré avec l’application s’applique.');
    // `Absent` pose `data-absent="true"` précisément pour que ce test-ci
    // puisse distinguer un état nommé d'une chaîne vide ou d'un tiret.
    expect(absence.closest('[data-absent="true"]')).not.toBeNull();
  });

  it('affiche le detail d un verdict de controle en echec', () => {
    const detail = 'Dépôt introuvable avec le jeton enregistré.';
    rendre({
      template: template({
        repoFullName: 'prospeo/gabarit-artisan-2026',
        checkedAt: '2026-09-01T10:00:00Z',
        checkOk: false,
        checkDetail: detail,
      }),
    });
    expect(screen.getByText(detail)).toBeDefined();
  });

  it('rend accessible l ordre de resolution : metier, puis gabarit actif, puis variable d environnement', async () => {
    const user = userEvent.setup();
    rendre({ template: template({ repoFullName: 'prospeo/gabarit-agence-v2' }) });
    const declencheur = screen.getByRole('button', { name: 'Ordre de résolution' });
    await user.hover(declencheur);
    const bulle = await screen.findByRole('tooltip', {}, ATTENTE_SURVOL);
    expect(bulle.textContent).toContain('métier');
    expect(bulle.textContent).toContain('variable d’environnement');
  });

  it('rend le bouton Verifier inerte et dit pourquoi', async () => {
    const user = userEvent.setup();
    const { container } = rendre();
    // Meme patron que Bientot.test.tsx : la zone est retiree du parcours
    // clavier, et sa raison ne s'affiche qu'au survol du marqueur.
    const zone = container.querySelector('[aria-disabled="true"]');
    expect(zone).not.toBeNull();
    expect(zone?.querySelector('button')?.textContent).toContain('Vérifier');
    await user.hover(screen.getByText('Bientôt'));
    // Le motif dit que le controle N'EST PAS ECRIT, et non qu'il tournera au
    // prochain passage du collector : aucun code du collector ne l'execute,
    // et les seuls ecrivains de `checked_at` / `check_ok` les mettent a nul.
    // Un motif qui promet une remediation inexistante est pire qu'un
    // « indisponible » generique.
    const raison = await screen.findByText(/n’est pas encore écrit/, {}, ATTENTE_SURVOL);
    expect(raison).toBeDefined();
    expect(raison.textContent).not.toMatch(/prochain passage/);
  });

  it('reflete la prop trades, pas une liste recopiee dans l ecran', () => {
    rendre({
      trades: [
        trade({ slug: 'peintre', label: 'Peintre' }),
        trade({ slug: 'menuisier', label: 'Menuisier', templateRepo: 'prospeo/gabarit-menuisier' }),
      ],
    });
    expect(screen.getByText('Peintre')).toBeDefined();
    expect(screen.getByText('hérite de l’actif')).toBeDefined();
    expect(screen.getByText('Menuisier')).toBeDefined();
    expect(screen.getByText('prospeo/gabarit-menuisier')).toBeDefined();
  });

  it('normalise un champ vide en null avant d appeler onDesigner, jamais une chaine vide', async () => {
    const user = userEvent.setup();
    const onDesigner = vi.fn().mockResolvedValue(null);
    rendre({ onDesigner });
    // Le champ dépôt reste vide : c'est précisément le cas qui, avant
    // normalisation, écrirait '' plutôt que null.
    await user.click(screen.getByRole('button', { name: 'Désigner ce dépôt' }));
    expect(onDesigner).toHaveBeenCalledWith(null, 'main');
  });

  it('designe le depot saisi, branche comprise', async () => {
    const user = userEvent.setup();
    const onDesigner = vi.fn().mockResolvedValue(null);
    rendre({ onDesigner });
    await user.type(screen.getByLabelText('Dépôt (org/nom)'), 'prospeo/gabarit-artisan-2026');
    await user.clear(screen.getByLabelText('Branche'));
    await user.type(screen.getByLabelText('Branche'), 'preview');
    await user.click(screen.getByRole('button', { name: 'Désigner ce dépôt' }));
    expect(onDesigner).toHaveBeenCalledWith('prospeo/gabarit-artisan-2026', 'preview');
  });

  it('permet de revenir au gabarit par defaut quand un depot est actif', async () => {
    const user = userEvent.setup();
    const onDesigner = vi.fn().mockResolvedValue(null);
    rendre({ template: template({ repoFullName: 'prospeo/gabarit-agence-v2' }), onDesigner });
    await user.click(screen.getByRole('button', { name: 'Revenir au gabarit par défaut' }));
    expect(onDesigner).toHaveBeenCalledWith(null, 'main');
  });

  it('affiche un message visible et non transitoire quand l ecriture est refusee', async () => {
    // Relevé de revue (tâche 10) : avant ce correctif, un refus (RLS, réseau)
    // ne finissait qu'en `console.error` — l'opérateur croyait le changement
    // pris. `role="alert"` et la clé `action.failed` sont le patron déjà
    // utilisé par `SiteSection` pour la même famille de refus.
    const user = userEvent.setup();
    const onDesigner = vi.fn().mockResolvedValue('RLS : ecriture refusee');
    rendre({ onDesigner });
    await user.type(screen.getByLabelText('Dépôt (org/nom)'), 'prospeo/gabarit-artisan-2026');
    await user.click(screen.getByRole('button', { name: 'Désigner ce dépôt' }));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Écriture refusée : RLS : ecriture refusee');
  });

  it('traite un checkOk nul comme un verdict inconnu, jamais comme une reussite', () => {
    // `checkOk === null` avec `checkedAt` non nul est hors du modèle
    // documenté, mais lire ce nul comme un succès reste le mauvais défaut
    // pour l'affichage d'un verdict — relevé de revue (tâche 10).
    rendre({
      template: template({
        repoFullName: 'prospeo/gabarit-agence-v2',
        checkedAt: '2026-09-01T10:00:00Z',
        checkOk: null,
      }),
    });
    const absence = screen.getByText('Jamais contrôlé');
    expect(absence.closest('[data-absent="true"]')).not.toBeNull();
    expect(screen.queryByText(/Contrôle réussi le/)).toBeNull();
  });
});
