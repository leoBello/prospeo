import type { ReactNode } from 'react';
import type { JeuState } from '../data/useJeu.js';
import { PARAMETRES_PALIER } from '../domain/jeu.js';
import type { BadgeId, EtatBadge, EtatBadgeValeur, Jeu } from '../domain/jeu.js';
import type { TranslationKey } from '../i18n/translate.js';
import type { BadgeTon } from './kit/Badge.js';
import { Badge } from './kit/Badge.js';
import { EmptyState } from './kit/EmptyState.js';
import { Tooltip } from './kit/Tooltip.js';
import { useT } from './preferences.js';
import styles from './BandeProgression.module.css';

/**
 * La bande qui suit le titre « Aujourd'hui » (maquette, Main.dc.html
 * ~108-165) : objectif du jour, palier de points, jalons. Elle prend la
 * place de `KpiBand`, retiré avec cette tâche — voir le rapport de la tâche 8
 * pour ce que devient chacun de ses quatre compteurs.
 *
 * **La doctrine des absences distinctes gouverne tout ce fichier.** Quatre
 * absences de nature différente s'y croisent, et aucune ne se rend par un
 * zéro ni par un vide muet :
 * 1. `objectifDuJour: {connue: false}` — pas assez d'historique pour une
 *    médiane. État du jour de la livraison : la table `pipeline_event` vient
 *    d'être créée. `Objectif` ci-dessous rend cet état par `EmptyState`,
 *    jamais par un « 0 relances tenues » qui se lirait comme un échec.
 * 2. `serie.jours === 0` — un FAIT mesuré (aucune relance tenue), pas une
 *    absence : rendu comme un vrai zéro, distinct du cas 1.
 * 3. `palier.complet === false` — le total omet en permanence les relances
 *    tenues (voir `calculerPalier`, domain/jeu.ts) : `Palier` l'écrit à côté
 *    du score, sans transformer la bande en avertissement.
 * 4. `EtatBadge.etat === 'non_mesurable'` — aucun geste ne peut débloquer ce
 *    badge aujourd'hui, contrairement à `'verrouille'`. `BadgeJalon` porte
 *    TROIS formes distinctes (mot affiché, trait, pastille), jamais deux.
 */

/**
 * Les quatre `BadgeId` écrits littéralement, comme `CLE_STATUT` dans
 * `kit/StatusBadge.tsx` — et pour la même raison : une composition dynamique
 * (`jeu.badge.${id}`) échapperait à la recherche textuelle du contrôle
 * d'orphelines de `i18n.test.ts` et exigerait une ligne d'exception. Un
 * `Record` littéral rend chaque clé trouvable telle quelle, sans y toucher.
 */
const CLE_BADGE: Record<BadgeId, TranslationKey> = {
  premiere_relance_tenue: 'jeu.badge.premiere_relance_tenue',
  premier_site_en_ligne: 'jeu.badge.premier_site_en_ligne',
  premier_rendez_vous: 'jeu.badge.premier_rendez_vous',
  serie_sept_jours: 'jeu.badge.serie_sept_jours',
};

/** Même raison que `CLE_BADGE` ci-dessus. */
const CLE_ETAT: Record<EtatBadgeValeur, TranslationKey> = {
  obtenu: 'jeu.badge.etat.obtenu',
  verrouille: 'jeu.badge.etat.verrouille',
  non_mesurable: 'jeu.badge.etat.non_mesurable',
};

/**
 * La forme visuelle de chacun des trois états — jamais la seule couleur.
 *
 * `obtenu` et `verrouille` reprennent le trait de la maquette (plein vs
 * discontinu, comme `ne_pas_contacter` dans `StatusBadge`). `non_mesurable`
 * a besoin d'une TROISIÈME forme, que la maquette ne montre pas : le même
 * trait discontinu que `verrouille`, mais avec la pastille de `obtenu` —
 * une combinaison qu'aucun des deux autres états n'emploie. Le mot que porte
 * `CLE_ETAT` distingue déjà les trois sans recourir à la couleur ; la forme
 * ci-dessous double cette distinction pour qui balaie l'écran sans lire.
 */
const FORME_ETAT: Record<EtatBadgeValeur, { discontinu: boolean; point: boolean; ton: BadgeTon }> = {
  obtenu: { discontinu: false, point: true, ton: 'succes' },
  verrouille: { discontinu: true, point: false, ton: 'neutre' },
  non_mesurable: { discontinu: true, point: true, ton: 'info' },
};

function BadgeJalon({ badge }: { badge: EtatBadge }) {
  const t = useT();
  const forme = FORME_ETAT[badge.etat];
  const contenu = (
    <span className={styles.jalon}>
      <Badge ton={forme.ton} discontinu={forme.discontinu} point={forme.point}>
        {t(CLE_BADGE[badge.id])}
      </Badge>
      <span className={styles.jalonEtat}>{t(CLE_ETAT[badge.etat])}</span>
    </span>
  );
  // Seul `non_mesurable` porte une infobulle : c'est le seul des trois états
  // dont le « pourquoi » n'est pas déjà évident (voir `PARAMETRES_PALIER` et
  // le docstring de `calculerBadges`, domain/jeu.ts).
  if (badge.etat !== 'non_mesurable') return contenu;
  return (
    <Tooltip intitule={t(CLE_ETAT[badge.etat])} contenu={t('jeu.badge.nonMesurable.hint')}>
      <span tabIndex={0}>{contenu}</span>
    </Tooltip>
  );
}

/**
 * L'objectif du jour, ou l'aveu qu'il n'y en a pas encore.
 *
 * `Mesure<number>` (voir son docstring, domain/jeu.ts) impose ce branchement
 * en deux : ce fichier n'a pas le droit de réduire `{connue: false}` à un
 * `0` affiché, qui se lirait comme un objectif atteint... par échec.
 */
function Objectif({ objectif }: { objectif: Jeu['objectifDuJour'] }) {
  const t = useT();
  if (!objectif.connue) {
    return (
      <EmptyState
        titre={t('jeu.objectif.insuffisant.titre')}
        detail={t('jeu.objectif.insuffisant.detail')}
      />
    );
  }
  return (
    <Tooltip intitule={t('jeu.objectif.titre')} contenu={t('jeu.objectif.hint')}>
      <span tabIndex={0} className={styles.objectif}>
        <span className={styles.objectifTitre}>{t('jeu.objectif.titre')}</span>
        <span className={styles.objectifValeur}>{t('jeu.objectif.valeur', { count: objectif.valeur })}</span>
      </span>
    </Tooltip>
  );
}

/**
 * Le palier de points, avec sa note d'incomplétude quand `complet` est faux —
 * voir le docstring de `Palier` (domain/jeu.ts) : le total omet alors en
 * permanence les relances tenues, faute de cumul honnête. La note se lit à
 * côté du score, jamais en alarme : c'est une réserve, pas une panne.
 */
function PalierBande({ palier }: { palier: Jeu['palier'] }) {
  const t = useT();
  const pourcentage = palier.seuil === 0 ? 0 : Math.min(100, (palier.progression / palier.seuil) * 100);
  return (
    <div className={styles.palier}>
      <div className={styles.palierEntete}>
        <span>{t('jeu.palier.titre', { numero: palier.numero })}</span>
        <span className={styles.palierPoints}>
          {t('jeu.palier.points', { points: palier.points, seuil: palier.seuil })}
        </span>
      </div>
      <div className={styles.barre}>
        <div className={styles.barreRemplie} style={{ width: `${pourcentage}%` }} />
      </div>
      {palier.complet ? null : <p className={styles.palierNote}>{t('jeu.palier.incomplet')}</p>}
      <div className={styles.poids}>
        <span>{t('jeu.palier.poids.relanceTenue', { points: PARAMETRES_PALIER.points.relanceTenue })}</span>
        <span>{t('jeu.palier.poids.siteMisEnLigne', { points: PARAMETRES_PALIER.points.siteMisEnLigne })}</span>
        <span>{t('jeu.palier.poids.rendezVousObtenu', { points: PARAMETRES_PALIER.points.rendezVousObtenu })}</span>
      </div>
    </div>
  );
}

export function BandeProgression({ jeu }: { jeu: JeuState }): ReactNode {
  const t = useT();

  // `loading` et `error` sont deux états distincts l'un de l'autre ET d'un
  // jeu vide (§ méthode du brief) : ni l'un ni l'autre ne montre l'anneau,
  // le palier ou les jalons, qui n'existent pas encore à ce stade.
  if (jeu.status === 'loading') {
    return (
      <div className={styles.bande}>
        <p className={styles.statut}>{t('jeu.chargement')}</p>
      </div>
    );
  }

  if (jeu.status === 'error') {
    // `role="status"` et non `alert` : un jeu qui ne charge pas ne bloque
    // aucune action de l'écran (relancer, ouvrir un prospect) — ce n'est pas
    // une panne au même titre qu'une lecture de prospects en échec.
    return (
      <div className={styles.bande}>
        <p className={styles.statutErreur} role="status">
          {t('jeu.erreur', { message: jeu.message })}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.bande}>
      <Objectif objectif={jeu.jeu.objectifDuJour} />
      <PalierBande palier={jeu.jeu.palier} />
      <div className={styles.jalons}>
        {jeu.jeu.badges.map((badge) => (
          <BadgeJalon key={badge.id} badge={badge} />
        ))}
      </div>
    </div>
  );
}

/**
 * Le compteur de série de la barre du haut (maquette, ligne ~94).
 *
 * `null` tant que `objectifDuJour` ne peut trancher — la règle qui gouverne
 * tout cet écran s'applique ici EN PREMIER (brief, tâche 8) : `serie.jours`
 * est toujours une vraie valeur (voir le docstring de `Serie`,
 * domain/jeu.ts), y compris zéro, mais l'afficher dans la barre alors que la
 * base vient d'être amorcée lirait comme un chiffre motivant sans le moindre
 * fondement — exactement la faute qu'un zéro nu commettrait pour l'objectif.
 * `objectifDuJour.connue` sert de signal partagé (« a-t-on assez d'historique
 * pour faire confiance au jeu ? ») plutôt qu'un second seuil inventé ici.
 *
 * `AppShell`/`BarreHaut` reçoivent le résultat en `ReactNode`, sans rien
 * savoir du jeu — même patron que `search` (tâche 2, lot 3).
 */
export function SerieEnTete({ jeu }: { jeu: JeuState }): ReactNode {
  const t = useT();
  if (jeu.status !== 'ready' || !jeu.jeu.objectifDuJour.connue) return null;

  const { serie } = jeu.jeu;
  // `borneAtteinte` : le décompte s'est arrêté au bord de la fenêtre lue, pas
  // sur un vrai jour manquant — la vraie série peut être plus longue. « Au
  // moins N jours » est le seul énoncé que le code peut garantir ; un nombre
  // exact mentirait par défaut.
  const texte = serie.borneAtteinte
    ? t('jeu.serie.auMoins', { count: serie.jours })
    : t('jeu.serie.jours', { count: serie.jours });

  return (
    <Tooltip intitule={t('jeu.serie.titre')} contenu={t('jeu.serie.hint')}>
      <span tabIndex={0}>
        <Badge ton="alerte" point>
          {texte}
        </Badge>
      </span>
    </Tooltip>
  );
}
