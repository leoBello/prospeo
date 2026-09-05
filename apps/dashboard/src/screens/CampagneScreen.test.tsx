import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import { CampagneScreen } from './CampagneScreen.js';
import type { CampagneScreenProps } from './CampagneScreen.js';
import type { FaitsLigne, FaitsProspect } from '../domain/campagne.js';
import type { Brouillon } from '../data/envoi.js';

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
    estFerme: false,
    aTelephone: true,
    metierConnu: true,
    ...surcharges,
  };
}

const VIVANT = { beatAt: new Date().toISOString(), inFlight: 0 };

/** Aucun de ces tests n'exerce le déclenchement : il a sa propre suite. */
const RIEN = async (): Promise<string | null> => null;

/** Un brouillon complet : le panneau s'ouvre sur quelque chose à relire. */
const BROUILLON: Brouillon = {
  objet: 'Votre site ne répond plus',
  corps: 'Bonjour,',
  modele: 'claude-opus-5',
  consignes: 'v3',
  redigeLe: '2026-09-05T11:58:00.000Z',
  adresse: 'contact@artisan.fr',
  origine: 'saisie',
  envoi: null,
};
const LIRE_BROUILLON = async (): Promise<Brouillon> => BROUILLON;
const RIEN_ADRESSE = async (): Promise<string | null> => null;
const ENVOYER_OK = async () => ({ ok: true }) as const;

/** Site en ligne + mail rédigé + adresse connue : l'état `mail_a_relire`. */
const A_RELIRE: FaitsLigne = {
  job: null,
  derniereEtape: null,
  siteEnLigne: true,
  mailRedige: true,
  adresse: 'contact@artisan.fr',
  envoi: null,
};

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
        onDeposer={RIEN}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
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
        onDeposer={RIEN}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
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
        onDeposer={RIEN}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
      />,
    );

    // `getByText` compare le texte ENTIER du noeud : la ligne meta porte le
    // metier, la ville et le score, d ou la regex plutot qu une egalite.
    expect(screen.getByText(/Plombier · Nantes/)).toBeTruthy();
  });

  it('nomme un score absent au lieu de laisser la ligne se terminer sur un separateur', () => {
    // `classerLot` garde deliberement un suivi sans score : React rend `null`
    // comme RIEN, et la ligne s arretait sur « Plombier · Nantes · ». Le
    // domaine tient la doctrine, le rendu la perdait au dernier metre. Valeur
    // lue dans fr.ts, cle `score.absent` — la meme que `DeploiementsScreen` et
    // `ScoreBar` emploient pour cette absence-la.
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait({ score: null })], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onDeposer={RIEN}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
      />,
    );

    // Le score vit dans son propre `<span>` : `getByText` compare le texte
    // ENTIER du noeud, et l egalite stricte suffit donc ici.
    expect(screen.getByText('pas encore scoré')).toBeTruthy();
  });

  it('affiche une ligne par prospect du lot', () => {
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait()], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onDeposer={RIEN}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
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
        onDeposer={RIEN}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
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
        onDeposer={RIEN}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
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
        onDeposer={RIEN}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
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
        onDeposer={RIEN}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
      />,
    );

    expect(screen.getByText(aucunProspect)).toBeTruthy();
    expect(screen.queryByText(lotFini)).toBeNull();
  });
});

describe('CampagneScreen — le declenchement', () => {
  const MORT = { beatAt: '2020-01-01T00:00:00Z', inFlight: 0 };

  it('depose une demande pour LE prospect de la ligne cliquee', async () => {
    // Le seul geste de cet ecran. Se tromper de prospect deploierait un site
    // au nom d'une entreprise qu'on ne visait pas — et un depot GitHub ne se
    // « de-cree » pas. Libelle lu dans fr.ts, cle `campagne.action.deployer`.
    const deposer = vi.fn(async () => null);
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait({ prospectId: 'p-42' })], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onDeposer={deposer}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Déployer' }));
    expect(deposer).toHaveBeenCalledWith('p-42');
  });

  it('eteint le bouton quand le collector est a l arret', async () => {
    // Un bouton actionnable alors que rien ne l'executera est l'affordance que
    // la doctrine interdit : la demande partirait en base et n'en sortirait
    // jamais, sans que l'operateur sache pourquoi.
    const deposer = vi.fn(async () => null);
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait()], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={MORT}
        onDeposer={deposer}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
      />,
    );

    const bouton = screen.getByRole('button', { name: 'Déployer' });
    expect(bouton).toHaveProperty('disabled', true);
    // Et il PORTE sa raison : un bouton grise muet envoie chercher une
    // remediation qui n'existe pas.
    expect(bouton.getAttribute('title')).toContain('collector');
  });

  it('affiche l echec d une ecriture au lieu de le taire', async () => {
    // Une ecriture refusee qui ne remonte pas laisse croire que le
    // declenchement est parti. Le message RESTE affiche jusqu'a la tentative
    // suivante — pas un message fugace.
    renderWithPreferences(
      <CampagneScreen
        lot={{ lignes: [fait()], sansScore: 0 }}
        lignes={new Map<string, FaitsLigne>()}
        totalProspects={12}
        heartbeat={VIVANT}
        onDeposer={async () => 'RLS'}
        onRetirer={RIEN}
        onSignOut={() => {}}
        nav={null}
        compteEnvoi={null}
        onReconnecter={() => {}}
        onLireBrouillon={LIRE_BROUILLON}
        onEnregistrerAdresse={RIEN_ADRESSE}
        onEnvoyer={ENVOYER_OK}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Déployer' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('CampagneScreen — le panneau de relecture', () => {
  function rendreEcran(ligne: FaitsLigne, surcharges: Partial<CampagneScreenProps> = {}) {
    const props: CampagneScreenProps = {
      lot: { lignes: [fait()], sansScore: 0 },
      lignes: new Map<string, FaitsLigne>([['p-1', ligne]]),
      totalProspects: 12,
      heartbeat: VIVANT,
      onDeposer: RIEN,
      onRetirer: RIEN,
      onSignOut: () => {},
      nav: null,
      compteEnvoi: { etat: 'pret' as const, expediteur: 'leo@gmail.com' },
      onReconnecter: () => {},
      onLireBrouillon: LIRE_BROUILLON,
      onEnregistrerAdresse: RIEN_ADRESSE,
      onEnvoyer: ENVOYER_OK,
      ...surcharges,
    };
    renderWithPreferences(<CampagneScreen {...props} />);
    return props;
  }

  it('ouvre le panneau de relecture depuis une ligne dont le mail attend d’être relu', async () => {
    // Le commentaire de la colonne d'actions disait « l'envoi n'existe pas
    // encore » : ce test est ce qui le rend faux.
    const user = userEvent.setup();
    rendreEcran(A_RELIRE);

    await user.click(screen.getByRole('button', { name: 'Relire' }));

    expect(await screen.findByText('Destinataire')).toBeTruthy();
    expect(screen.getByText('Votre site ne répond plus')).toBeTruthy();
  });

  it('ouvre le même panneau quand l’adresse manque — c’est lui qui sait quoi proposer', async () => {
    const user = userEvent.setup();
    rendreEcran({ ...A_RELIRE, adresse: null });

    await user.click(screen.getByRole('button', { name: 'Relire' }));

    expect(await screen.findByText('Destinataire')).toBeTruthy();
  });

  it('n’offre aucun geste sur une ligne déjà envoyée', () => {
    rendreEcran({
      ...A_RELIRE,
      envoi: { state: 'envoye', sentAt: '2026-09-05T12:00:00.000Z' },
    });
    expect(screen.queryByRole('button', { name: 'Relire' })).toBeNull();
  });

  it('n’offre aucun geste pendant qu’un envoi est en cours', () => {
    // « Incertain » attend : recliquer ne ferait que buter sur l'index unique.
    rendreEcran({ ...A_RELIRE, envoi: { state: 'en_cours', sentAt: null } });
    expect(screen.queryByRole('button', { name: 'Relire' })).toBeNull();
  });

  it('laisse relire un envoi qui a échoué', () => {
    rendreEcran({ ...A_RELIRE, envoi: { state: 'echoue', sentAt: null } });
    expect(screen.getByRole('button', { name: 'Relire' })).toBeTruthy();
  });
});
