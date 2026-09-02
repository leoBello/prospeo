import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PipelineView } from '../domain/prospect.js';
import { renderWithPreferences } from '../test-utils.js';
import { PipelineSection } from './PipelineSection.js';

const rien = { onDefinirStatut: null, onJournaliser: null };

describe('PipelineSection', () => {
  it('distingue « jamais contacté » d’un statut choisi', () => {
    // `prospect_pipeline` est vide : aucune ligne n'existe pour aucun prospect.
    // Afficher « À contacter » par défaut ferait croire à une décision prise,
    // alors que personne n'a rien décidé — et la première sélection ne
    // changerait alors rien à l'écran.
    renderWithPreferences(<PipelineSection pipeline={null} siteEnLigne={false} {...rien} />);
    expect(screen.getByRole('combobox')).toHaveProperty('value', '');
    expect(screen.getByText('Jamais contacté')).toBeTruthy();
  });

  it('enregistre le statut choisi', async () => {
    const definir = vi.fn(async () => null);
    renderWithPreferences(
      <PipelineSection
        pipeline={null}
        siteEnLigne={false}
        onDefinirStatut={definir}
        onJournaliser={null}
      />,
    );

    await userEvent.selectOptions(screen.getByRole('combobox'), 'interesse');
    expect(definir).toHaveBeenCalledWith('interesse', null);
  });

  it('AVERTIT que le site reste en ligne après un refus', async () => {
    // L'aveu qu'il faut faire. Le dashboard tourne dans un navigateur avec la
    // clé anonyme : il ne peut détenir aucun jeton Vercel sous peine de le
    // publier dans son propre bundle. Le statut est enregistré immédiatement,
    // la page reste servie jusqu'au prochain `unpublish`.
    //
    // Taire cet écart ferait croire à un retrait accompli — au nom, justement,
    // de quelqu'un qui vient de refuser.
    renderWithPreferences(
      <PipelineSection
        pipeline={{ status: 'ne_pas_contacter', nextActionAt: null, updatedAt: '2026-09-02T09:00:00Z' }}
        siteEnLigne
        {...rien}
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/unpublish/);
  });

  it('n’avertit pas quand il n’y a pas de site en ligne', () => {
    // Un avertissement affiché sans objet est un avertissement qu'on cesse de
    // lire. La majorité des prospects n'ont aucun site déployé.
    renderWithPreferences(
      <PipelineSection
        pipeline={{ status: 'ne_pas_contacter', nextActionAt: null, updatedAt: '2026-09-02T09:00:00Z' }}
        siteEnLigne={false}
        {...rien}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('n’avertit pas sur un statut qui n’est pas un refus', () => {
    renderWithPreferences(
      <PipelineSection
        pipeline={{ status: 'interesse', nextActionAt: null, updatedAt: '2026-09-02T09:00:00Z' }}
        siteEnLigne
        {...rien}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('consigne un échange, et vide le champ après coup', async () => {
    // Le champ qui garde son texte après enregistrement invite à recliquer, et
    // le journal reçoit deux fois la même note.
    const journaliser = vi.fn(async () => null);
    renderWithPreferences(
      <PipelineSection
        pipeline={null}
        siteEnLigne={false}
        onDefinirStatut={null}
        onJournaliser={journaliser}
      />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'Pas de réponse');
    await userEvent.click(screen.getByRole('button', { name: /consigner/i }));

    expect(journaliser).toHaveBeenCalledWith('appel', 'Pas de réponse');
    expect(screen.getByRole('textbox')).toHaveProperty('value', '');
  });

  it('propose le canal SMS, que la tâche 5 a ajouté au journal', async () => {
    // `interaction_kind` valait ('appel', 'whatsapp', 'email', 'note') : on
    // générait un SMS sans pouvoir consigner qu'on l'avait envoyé.
    const journaliser = vi.fn(async () => null);
    renderWithPreferences(
      <PipelineSection
        pipeline={null}
        siteEnLigne={false}
        onDefinirStatut={null}
        onJournaliser={journaliser}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText(/canal/i), 'sms');
    await userEvent.click(screen.getByRole('button', { name: /consigner/i }));
    expect(journaliser).toHaveBeenCalledWith('sms', '');
  });

  it('affiche l’échec d’écriture plutôt que de l’avaler', async () => {
    renderWithPreferences(
      <PipelineSection
        pipeline={null}
        siteEnLigne={false}
        onDefinirStatut={null}
        onJournaliser={async () => 'permission denied'}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /consigner/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('permission denied');
  });

  it('signale un échec de l’ÉTAT du pipeline avec le message générique — rien n’a changé', async () => {
    // `EchecDefinirStatut.etape === 'etat'` : la première écriture a échoué,
    // rien n'a bougé en base. Le message générique (« Écriture refusée ») dit
    // juste : personne ne s'attend à autre chose.
    const definir = vi.fn(async () => ({ etape: 'etat' as const, message: 'RLS' }));
    renderWithPreferences(
      <PipelineSection pipeline={null} siteEnLigne={false} onDefinirStatut={definir} onJournaliser={null} />,
    );

    await userEvent.selectOptions(screen.getByRole('combobox'), 'interesse');
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('RLS');
    expect(alerte.textContent).toContain('Écriture refusée');
  });

  it('distingue un échec de l’HISTORIQUE — le statut, lui, a bien été enregistré (relevé de revue, tâche 5)', async () => {
    // `EchecDefinirStatut.etape === 'historique'` : la première écriture a
    // réussi, `prospect_pipeline` porte déjà le nouveau statut. Un message
    // générique laisserait croire à un clic sans effet ; la clé dédiée dit ce
    // qui compte vraiment — le statut a pris, seul le comptage pour le jeu
    // (tâche 6) manque.
    const definir = vi.fn(async () => ({ etape: 'historique' as const, message: 'HS' }));
    renderWithPreferences(
      <PipelineSection pipeline={null} siteEnLigne={false} onDefinirStatut={definir} onJournaliser={null} />,
    );

    await userEvent.selectOptions(screen.getByRole('combobox'), 'interesse');
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('HS');
    expect(alerte.textContent).toContain('ne sera pas compté');
    expect(alerte.textContent).not.toContain('Écriture refusée');
  });

  it('reste consultable sans aucune écriture branchée', () => {
    renderWithPreferences(<PipelineSection pipeline={null} siteEnLigne={false} {...rien} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
