import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fr } from '../../i18n/fr.js';
import { renderWithPreferences } from '../../test-utils.js';
import { RelectureTab } from './RelectureTab.js';
import type { RelectureTabProps } from './RelectureTab.js';

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

function rendre(surcharges: Partial<RelectureTabProps> = {}) {
  const props: RelectureTabProps = {
    brouillon: BROUILLON,
    compte: { etat: 'pret', expediteur: 'leo@gmail.com' },
    onEnregistrerAdresse: vi.fn(async () => null),
    onEnvoyer: vi.fn(async () => ({ ok: true as const })),
    ...surcharges,
  };
  renderWithPreferences(<RelectureTab {...props} />);
  return props;
}

describe('RelectureTab', () => {
  it('montre l’objet et le corps qui partiront', () => {
    rendre();
    expect(screen.getByText('Votre site ne répond plus')).toBeTruthy();
    expect(screen.getByText('Bonjour,')).toBeTruthy();
  });

  it('nomme l’origine de l’adresse — un robot et un humain ne sont pas le même fait', () => {
    rendre();
    expect(screen.getByText(fr['relecture.origine.saisie'])).toBeTruthy();
    expect(screen.getByText('contact@artisan.fr')).toBeTruthy();
  });

  it('distingue une adresse collectée d’une adresse saisie', () => {
    rendre({ brouillon: { ...BROUILLON, origine: 'collecte' } });
    expect(screen.getByText(fr['relecture.origine.collecte'])).toBeTruthy();
    expect(screen.queryByText(fr['relecture.origine.saisie'])).toBeNull();
  });

  it('nomme l’absence d’adresse plutôt que d’afficher un champ vide', () => {
    // Doctrine : une absence se nomme. Un champ vide se lirait comme une
    // adresse effacée, pas comme une adresse jamais connue.
    rendre({ brouillon: { ...BROUILLON, adresse: null, origine: null } });
    expect(screen.getByText(fr['relecture.origine.aucune'])).toBeTruthy();
  });

  it('n’offre pas d’envoyer sans adresse', () => {
    rendre({ brouillon: { ...BROUILLON, adresse: null, origine: null } });
    const bouton = screen.getByRole('button', { name: fr['relecture.envoyer'] });
    expect(bouton.hasAttribute('disabled')).toBe(true);
  });

  it('n’offre pas d’envoyer sans compte d’envoi utilisable', () => {
    rendre({ compte: { etat: 'sans_jeton' } });
    expect(
      screen.getByRole('button', { name: fr['relecture.envoyer'] }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('n’offre pas d’envoyer deux fois au même prospect', () => {
    rendre({ brouillon: { ...BROUILLON, envoi: { state: 'envoye' } } });
    expect(
      screen.getByRole('button', { name: fr['relecture.envoyer'] }).hasAttribute('disabled'),
    ).toBe(true);
    // Et le dire, pas seulement éteindre : un bouton mort sans motif envoie
    // chercher une remédiation qui n'existe pas.
    expect(screen.getByText(fr['relecture.dejaEnvoye'])).toBeTruthy();
  });

  it('laisse réessayer un envoi qui a échoué', () => {
    rendre({ brouillon: { ...BROUILLON, envoi: { state: 'echoue' } } });
    expect(
      screen.getByRole('button', { name: fr['relecture.envoyer'] }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('nomme l’absence de mail rédigé', () => {
    rendre({ brouillon: { ...BROUILLON, objet: null, corps: null } });
    expect(screen.getByText(fr['relecture.pasDeMail'])).toBeTruthy();
  });

  it('dit de quelle adresse le mail partira, avant le clic', () => {
    rendre();
    expect(screen.getByText(/Le mail partira de leo@gmail.com/)).toBeTruthy();
    expect(screen.getByText(fr['relecture.consequence'])).toBeTruthy();
  });

  it('enregistre une adresse saisie', async () => {
    const user = userEvent.setup();
    const props = rendre({ brouillon: { ...BROUILLON, adresse: null, origine: null } });

    await user.click(screen.getByRole('button', { name: fr['relecture.saisir'] }));
    await user.type(screen.getByLabelText(fr['relecture.destinataire']), 'nouveau@artisan.fr');
    await user.click(screen.getByRole('button', { name: fr['relecture.enregistrer'] }));

    expect(props.onEnregistrerAdresse).toHaveBeenCalledWith('nouveau@artisan.fr');
  });

  it('affiche un mail PARTI dont la suite a échoué sans parler d’échec d’envoi', async () => {
    const user = userEvent.setup();
    const props = rendre({
      onEnvoyer: vi.fn(async () => ({
        ok: false as const,
        etape: 'suite' as const,
        message: 'refus',
      })),
    });

    await user.click(screen.getByRole('button', { name: fr['relecture.envoyer'] }));

    expect(props.onEnvoyer).toHaveBeenCalledTimes(1);
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Le mail est parti');
    // Et surtout PAS le mot d'un envoi refusé : recliquer serait alors le
    // geste évident, et la base refuserait sans expliquer pourquoi.
    expect(alerte.textContent).not.toContain('Gmail a refusé');
  });

  it('nomme un refus de Gmail comme un refus de Gmail', async () => {
    const user = userEvent.setup();
    rendre({
      onEnvoyer: vi.fn(async () => ({
        ok: false as const,
        etape: 'gmail' as const,
        message: 'Gmail : 401',
      })),
    });

    await user.click(screen.getByRole('button', { name: fr['relecture.envoyer'] }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('401');
    expect(alerte.textContent).not.toContain('Le mail est parti');
  });

  it('porte la traçabilité du texte, comme la fiche', () => {
    rendre();
    expect(screen.getByText(/claude-opus-5/)).toBeTruthy();
    expect(screen.getByText(/v3/)).toBeTruthy();
  });
});
