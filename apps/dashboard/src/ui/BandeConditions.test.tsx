import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import { BandeConditions, workerVivant } from './BandeConditions.js';

const MAINTENANT = new Date('2026-09-03T12:00:00Z');

describe('workerVivant', () => {
  it('tient un battement recent pour vivant', () => {
    expect(workerVivant('2026-09-03T11:59:55Z', MAINTENANT)).toBe(true);
  });

  it('declare mort au-dela du seuil', () => {
    expect(workerVivant('2026-09-03T11:58:00Z', MAINTENANT)).toBe(false);
  });

  it('traite l absence de battement comme un worker mort, jamais comme un doute', () => {
    // Un worker dont on ne sait rien ne peut pas se voir accorder le benefice
    // du doute : ce serait un bouton qui promet un deploiement que personne
    // n executera.
    expect(workerVivant(null, MAINTENANT)).toBe(false);
  });

  it('traite un horodatage illisible comme un worker mort', () => {
    // Une date que `Date.parse` ne comprend pas rend NaN, et toute comparaison
    // avec NaN est fausse : sans garde explicite, le worker passerait pour
    // mort par accident plutot que par decision. On le decide.
    expect(workerVivant('pas une date', MAINTENANT)).toBe(false);
  });
});

describe('BandeConditions', () => {
  it('annonce le collector a l ecoute quand il bat', () => {
    // Valeur lue dans src/i18n/fr.ts, cle `campagne.worker.ecoute`.
    renderWithPreferences(
      <BandeConditions
        heartbeat={{ beatAt: '2026-09-03T11:59:55Z', inFlight: 0 }}
        maintenant={MAINTENANT}
      />,
    );

    expect(screen.getByText("Collector à l'écoute")).toBeTruthy();
  });

  it('porte la raison ET le remede quand le worker est a l arret', () => {
    // Un bouton eteint qui ne dit pas pourquoi envoie chercher une
    // remediation qui n existe pas — c est l erreur que le bouton
    // « Verifier » de GabaritScreen a deja coutee. Valeurs lues dans fr.ts,
    // cles `campagne.worker.arret` et `campagne.worker.arret.remede`.
    renderWithPreferences(
      <BandeConditions
        heartbeat={{ beatAt: '2026-09-03T11:00:00Z', inFlight: 0 }}
        maintenant={MAINTENANT}
      />,
    );

    expect(screen.getByText("Collector à l'arrêt")).toBeTruthy();
    // `getByText` compare le texte ENTIER du noeud : la raison porte un
    // parametre, d ou le fragment.
    expect(screen.getByText(/Aucun signe de vie depuis 60 min/)).toBeTruthy();
    expect(screen.getByText(/Le relancer avec/)).toBeTruthy();
  });

  it('distingue « jamais entendu » de « silencieux depuis N minutes »', () => {
    // Deux absences de natures differentes. Sans cette distinction, un
    // heartbeat absent afficherait « depuis 0 min » — un fait fabrique, et
    // le seul chiffre de la bande serait faux.
    renderWithPreferences(<BandeConditions heartbeat={null} maintenant={MAINTENANT} />);

    expect(screen.getByText('État du collector inconnu')).toBeTruthy();
    // L autre formulation ne doit surtout pas apparaitre a sa place.
    expect(screen.queryByText(/Aucun signe de vie depuis/)).toBeNull();
  });
});
