import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import { CampagneScreen } from './CampagneScreen.js';
import type { FaitsLigne, FaitsProspect } from '../domain/campagne.js';

function fait(surcharges: Partial<FaitsProspect> = {}): FaitsProspect {
  return {
    prospectId: 'p-1',
    denomination: 'Aquatech Nantes',
    ville: 'Nantes',
    tradeSlug: 'plombier',
    score: 86,
    presence: 'none',
    statut: 'a_contacter',
    aInteraction: false,
    aMessage: false,
    sitePublie: false,
    ...surcharges,
  };
}

const VIVANT = { beatAt: new Date().toISOString(), inFlight: 0 };

describe('CampagneScreen', () => {
  it('porte la presence web, qui est l argument de vente de la ligne', () => {
    // Valeur lue dans src/i18n/fr.ts, cle `presence.dead_site`. « Votre site
    // ne repond plus, en voici un qui fonctionne » est l argumentaire le plus
    // fort du lot : le badge qui le designe ne peut pas manquer de la ligne.
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait({ presence: 'dead_site' })], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText('Site en panne ou obsolète')).toBeTruthy();
  });

  it('nomme une presence jamais sondee au lieu de laisser la case vide', () => {
    // `null` n est pas une categorie : c est « pas encore sonde ». Valeur lue
    // dans fr.ts, cle `presence.absent`. La taire ferait lire l absence de
    // badge comme une absence de presence web, ce qui est un autre fait.
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait({ presence: null })], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText('Présence web pas encore sondée')).toBeTruthy();
  });

  it('rend le libelle du metier, pas son identifiant technique', () => {
    // `getTrade('plombier').label` vaut « Plombier » (packages/core/src/trades.ts).
    // Afficher le slug ferait lire un identifiant de base a l operateur.
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait({ tradeSlug: 'plombier' })], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    // `getByText` compare le texte ENTIER du noeud : la ligne meta porte le
    // metier, la ville et le score, d ou la regex plutot qu une egalite.
    expect(screen.getByText(/Plombier · Nantes/)).toBeTruthy();
  });

  it('affiche une ligne par prospect du lot', () => {
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait()], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText('Aquatech Nantes')).toBeTruthy();
  });

  it('nomme les prospects ecartes faute de score, au lieu de les taire', () => {
    // Lu dans fr.ts : `campagne.sansScore` porte {count} — fragment stable
    // de la phrase plurielle (count=3 ne prend pas la forme `_one`, cf.
    // `estSingulier`, i18n/translate.ts, qui ne singularise qu'en dessous
    // de deux en français).
    const fragment = 'jamais été scorés';

    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait()], sansScore: 3 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText(new RegExp(fragment))).toBeTruthy();
  });

  it('ne montre rien sur les ecartes quand il n y en a aucun', () => {
    // Assertion negative, ecrite avec soin : `queryByText` rend `null` quand
    // rien ne correspond, et c est CE null qu on affirme. Un `getAllByText`
    // suivi d un `.length === 0` leverait avant d asserter.
    const fragment = 'jamais été scorés';

    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait()], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.queryByText(new RegExp(fragment))).toBeNull();
  });

  it('distingue « le lot est fini » de « aucun prospect qualifie »', () => {
    // Deux vides de natures differentes, deux ecrans. « Pas encore » n est
    // pas « jamais ». Lu dans fr.ts : `campagne.vide.lotFini`.
    const lotFini = 'Le lot est fini';

    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText(lotFini)).toBeTruthy();
  });

  it('dit « aucun prospect qualifie » quand la base est vide, et non « lot fini »', () => {
    // Deux absences de natures differentes. Un tableau vide ne dit pas
    // laquelle : c est `totalProspects` qui le porte, et le deriver de
    // `lot.lignes.length` recreerait exactement la confusion. Lu dans
    // fr.ts : `campagne.vide.aucunProspect` et `campagne.vide.lotFini`.
    const aucunProspect = 'Aucun prospect';
    const lotFini = 'Le lot est fini';

    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={0}
        heartbeat={VIVANT}
        onSignOut={() => {}}
        nav={null}
      />,
    );

    expect(screen.getByText(aucunProspect)).toBeTruthy();
    expect(screen.queryByText(lotFini)).toBeNull();
  });
});
