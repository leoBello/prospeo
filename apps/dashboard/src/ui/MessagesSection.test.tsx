import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MessageView } from '../domain/prospect.js';
import { renderWithPreferences } from '../test-utils.js';
import { MessagesSection } from './MessagesSection.js';

const URL_SITE = 'https://dos-services-51000900400035.vercel.app';

const email: MessageView = {
  channel: 'email',
  subject: 'Une page en ligne pour Dos-Services',
  content: `Bonjour,\n\nJ'ai créé une page.\n\n${URL_SITE}\n\nLéo Bello`,
  promptVersion: 'v1-v1',
  model: 'claude-opus-4-8',
  createdAt: '2026-09-01T23:00:00Z',
};

const sms: MessageView = {
  channel: 'sms',
  subject: null,
  content: `Bonjour, Leo Bello. Page faite de ma propre initiative : ${URL_SITE} - dites-moi si vous voulez que je la retire.`,
  promptVersion: 'v1-v1',
  model: 'claude-opus-4-8',
  createdAt: '2026-09-01T23:00:00Z',
};

describe('MessagesSection', () => {
  it('dit qu’aucun message n’existe, en nommant l’étage qui les écrit', () => {
    renderWithPreferences(<MessagesSection messages={[]} />);
    expect(screen.getByText(/pitch/)).toBeTruthy();
  });

  it('rappelle que rien ne part d’ici', () => {
    // Le §10 du spec le pose et D6 le confirme : le texte est relu, puis copié
    // à la main. Un écran qui alignerait trois messages et un bouton sans le
    // dire laisserait chercher le bouton « envoyer ».
    renderWithPreferences(<MessagesSection messages={[email]} />);
    expect(screen.getByText(/copient à la main/i)).toBeTruthy();
  });

  it('préserve les sauts de ligne du message', () => {
    // Les paragraphes de l'email et la ligne isolée qui porte l'URL sont
    // signifiants : les replier en un bloc ferait relire autre chose que ce
    // qui sera envoyé.
    const { container } = renderWithPreferences(<MessagesSection messages={[email]} />);
    const bloc = container.querySelector('pre');
    expect(bloc?.textContent).toContain('\n\n');
  });

  it('copie l’objet AVEC le corps', async () => {
    // Un email copié sans son objet oblige à revenir le chercher — et c'est
    // exactement le moment où l'on colle celui du prospect précédent.
    const writeText = vi.fn(async (_texte: string) => undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithPreferences(<MessagesSection messages={[email]} />);
    await userEvent.click(screen.getByRole('button', { name: /copier/i }));

    expect(writeText).toHaveBeenCalledOnce();
    const copie = writeText.mock.calls[0]?.[0] ?? '';
    expect(copie).toContain('Une page en ligne pour Dos-Services');
    expect(copie).toContain(URL_SITE);
  });

  it('AVOUE l’échec de la copie', async () => {
    // `navigator.clipboard` n'existe pas hors contexte sécurisé. Un bouton qui
    // échoue en silence est pire qu'un bouton absent : on croit avoir copié,
    // on colle le message précédent, et il part au nom d'une autre entreprise.
    Object.assign(navigator, {
      clipboard: {
        writeText: async () => {
          throw new Error('not allowed');
        },
      },
    });

    renderWithPreferences(<MessagesSection messages={[email]} />);
    await userEvent.click(screen.getByRole('button', { name: /copier/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/copie impossible/i);
  });

  it('mesure le SMS, et lui seul', () => {
    // La longueur est une contrainte du SUPPORT pour le SMS, et un choix de
    // style ailleurs. Afficher un décompte sous l'email n'aiderait personne.
    renderWithPreferences(<MessagesSection messages={[sms, email]} />);
    expect(screen.getByText(/caractères · 1 SMS/)).toBeTruthy();
    expect(screen.getAllByText(/caractères ·/)).toHaveLength(1);
  });

  it('signale les caractères qui font basculer en UCS-2', () => {
    // Le fait non évident que `segmentsSms` existe pour rendre visible : « ç »,
    // les circonflexes et l'apostrophe typographique sont HORS du jeu GSM, et
    // un seul d'entre eux fait compter le message en segments de 70 caractères
    // au lieu de 153.
    renderWithPreferences(
      <MessagesSection messages={[{ ...sms, content: `Bonjour, ça marche ? ${URL_SITE}` }]} />,
    );
    // Le caractère fautif est NOMMÉ : « votre message compte double » sans
    // dire pourquoi ne se corrige pas.
    expect(screen.getByText(/alphabet GSM \(ç\)/)).toBeTruthy();
  });
});
