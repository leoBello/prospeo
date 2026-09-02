import type { ReactNode } from 'react';
import type { JeuState } from '../data/useJeu.js';
import { PARAMETRES_PALIER } from '../domain/jeu.js';
import type { BadgeId, EtatBadge, EtatBadgeValeur, Jeu } from '../domain/jeu.js';
import type { TranslationKey } from '../i18n/translate.js';
import type { BadgeTon } from './kit/Badge.js';
import { Badge } from './kit/Badge.js';
import { Tooltip } from './kit/Tooltip.js';
import { useT } from './preferences.js';
import styles from './BandeProgression.module.css';

/**
 * La bande qui suit le titre « Aujourd'hui » (maquette, Main.dc.html
 * ~108-165) : objectif du jour, palier de points, jalons. Elle prend la
 * place de `KpiBand`, retiré avec la première version de cette tâche.
 *
 * **Refonte (tâche 8, second passage).** Le propriétaire a vu deux fautes
 * dans la première livraison : l'anneau de la maquette n'existait pas
 * (une étiquette de texte à la place), et le tableau de bord se lisait
 * comme une panne dès que l'historique manquait — `EmptyState` (deux
 * paragraphes) déséquilibrait la rangée, `loading`/`error` s'effondraient à
 * la hauteur d'une ligne, et les jalons empilaient un mur de « Verrouillé ».
 * Cette version corrige les quatre :
 * - l'anneau SVG existe dans les DEUX cas (`Anneau`, `Objectif`) — rail seul
 *   quand l'objectif est inconnu, arc rempli sinon ;
 * - l'aveu « historique insuffisant » tient dans une ligne calme et une
 *   infobulle, plus dans un bloc à deux paragraphes ;
 * - `loading`/`error` (`Squelette`, `Erreur`) occupent la même carcasse
 *   (mêmes classes, une hauteur plancher commune posée en CSS) que la bande
 *   chargée — voir le docstring de `Squelette` pour ce qu'un test peut, et
 *   ne peut pas, en prouver sous `jsdom` ;
 * - les jalons sont des pastilles compactes (`Pastille`), sans mot visible,
 *   dont l'`aria-label` nomme le jalon et son état et dont l'infobulle porte
 *   le sens.
 *
 * **Alignement sur la maquette — largeur réelle (tâche 8, quatrième passage).**
 * Le troisième passage avait restauré « en base » et « qualifiés »
 * (`Compteurs`, `domain/today.ts`), une extension que la maquette ne prévoit
 * pas. Mesurée dans sa vraie colonne (`ProspectPanel` 720 px + rail 56 px,
 * pas la fenêtre), la bande n'a que ~664 px à 1440 px d'écran : quatre
 * cellules n'y tiennent pas, trois oui — le nombre même que dessine la
 * maquette. `Compteurs` est donc retiré : les deux chiffres qu'il portait
 * (139 en base, 129 qualifiés/scorés au 2 septembre 2026) quittent l'écran,
 * une décision du propriétaire consignée dans le rapport de la tâche 8, pas
 * un oubli.
 *
 * **La doctrine des absences distinctes gouverne tout ce fichier.** Quatre
 * absences de nature différente s'y croisent, et aucune ne se rend par un
 * zéro ni par un vide muet :
 * 1. `objectifDuJour: {connue: false}` — pas assez d'historique pour une
 *    médiane. État du jour de la livraison : la table `pipeline_event` vient
 *    d'être créée. `Objectif` rend cet état par un anneau au rail seul et un
 *    dénominateur textuel, jamais par un « 0 relances tenues » qui se
 *    lirait comme un échec.
 * 2. `serie.jours === 0` — un FAIT mesuré (aucune relance tenue), pas une
 *    absence : rendu comme un vrai zéro, distinct du cas 1. `realiseAujourdHui`
 *    (numérateur de l'anneau) est de la même nature : zéro y est honnête.
 * 3. `palier.complet === false` — le total omet en permanence les relances
 *    tenues (voir `calculerPalier`, domain/jeu.ts) : `Palier` l'écrit à côté
 *    du score, sans transformer la bande en avertissement.
 * 4. `EtatBadge.etat === 'non_mesurable'` — aucun geste ne peut débloquer ce
 *    badge aujourd'hui, contrairement à `'verrouille'`. `Pastille` porte
 *    TROIS formes distinctes (trait, remplissage, icône), jamais deux.
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
 * La forme de chaque pastille de jalon — jamais la seule couleur.
 *
 * `discontinu` marque ce qu'un geste réel peut encore faire bouger
 * (`verrouille`), comme `ne_pas_contacter` dans `StatusBadge`. `rempli`
 * marque ce qui est définitivement tranché, obtenu ou non mesurable, par
 * opposition à verrouillé. Les trois combinaisons de (`discontinu`,
 * `rempli`) sont uniques par état : (false,true), (true,false), (true,true).
 * L'icône (`ICONE_ETAT`) ajoute une TROISIÈME distinction — au-delà de ce
 * que la règle exige — parce qu'une pastille sans le moindre mot visible a
 * besoin d'un repère de forme fort pour qui balaie l'écran sans s'arrêter.
 */
const FORME_PASTILLE: Record<EtatBadgeValeur, { discontinu: boolean; rempli: boolean; ton: BadgeTon }> = {
  obtenu: { discontinu: false, rempli: true, ton: 'succes' },
  verrouille: { discontinu: true, rempli: false, ton: 'neutre' },
  non_mesurable: { discontinu: true, rempli: true, ton: 'info' },
};

const TRAIT_ICONE = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
} as const;

function IconeObtenu() {
  return (
    <svg {...TRAIT_ICONE}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** Le cadenas de la maquette (Main.dc.html, badge « Verrouillé — Première vente »). */
function IconeVerrouille() {
  return (
    <svg {...TRAIT_ICONE}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function IconeNonMesurable() {
  return (
    <svg {...TRAIT_ICONE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M7 7l10 10" />
    </svg>
  );
}

const ICONE_ETAT: Record<EtatBadgeValeur, ReactNode> = {
  obtenu: <IconeObtenu />,
  verrouille: <IconeVerrouille />,
  non_mesurable: <IconeNonMesurable />,
};

/** La flamme de la maquette (Main.dc.html ~l.94, badge de série) — décorative, le mot porte déjà le sens (`SerieEnTete`). */
function IconeFlamme() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1.6.8-3 2-4.4.3 1.6 1 2.4 2 2.4 1.2 0 1.6-1.2 1-7z" />
    </svg>
  );
}

/**
 * Un jalon, en pastille compacte (maquette, ~34px) — refonte tâche 8 : la
 * livraison précédente empilait un `Badge` texte et un mot sous chacun des
 * quatre jalons, quatre fois « Verrouillé »/« Non mesurable » à l'affichage
 * du jour de livraison, un mur de refus. Une pastille ne porte plus aucun
 * mot visible ; c'est son `aria-label` qui nomme le jalon ET son état — la
 * règle du dépôt pour toute pastille à infobulle (« tout badge porte un
 * mot ; toute pastille porte un `aria-label` ») — et l'infobulle qui porte
 * le sens pour qui voit l'écran.
 */
function Pastille({ badge }: { badge: EtatBadge }) {
  const t = useT();
  const forme = FORME_PASTILLE[badge.etat];
  const nom = t(CLE_BADGE[badge.id]);
  const etat = t(CLE_ETAT[badge.etat]);
  const etiquette = t('jeu.badge.aria', { etat, nom });
  // Seul `non_mesurable` a un « pourquoi » qui ne se déduit pas de son nom
  // (voir le docstring de `calculerBadges`, domain/jeu.ts) ; les deux autres
  // se contentent de répéter leur état en toutes lettres dans l'infobulle.
  const contenu = badge.etat === 'non_mesurable' ? t('jeu.badge.nonMesurable.hint') : etat;

  return (
    <Tooltip intitule={nom} contenu={contenu}>
      <span
        className={styles.pastille}
        data-ton={forme.ton}
        data-discontinu={forme.discontinu ? 'true' : undefined}
        data-rempli={forme.rempli ? 'true' : undefined}
        role="img"
        aria-label={etiquette}
        tabIndex={0}
      >
        {ICONE_ETAT[badge.etat]}
      </span>
    </Tooltip>
  );
}

/** Circonférence du rail de l'anneau (r=22, comme la maquette). */
const RAYON_ANNEAU = 22;
const CIRCONFERENCE_ANNEAU = 2 * Math.PI * RAYON_ANNEAU;

/**
 * L'anneau SVG de la maquette (Main.dc.html ~114-124) : le réalisé du jour
 * au centre, son dénominateur dessous. Rendu dans les DEUX cas, objectif
 * connu ou non (voir `Objectif` ci-dessous) — c'est lui qui donne à la
 * bande sa forme, pleine ou en attente, plutôt qu'un bloc qui apparaît ou
 * disparaît selon l'état des données.
 *
 * `pourcentage` reste à 0 quand l'objectif est inconnu : l'arc de
 * progression n'a alors aucune base honnête pour se remplir, et rester au
 * rail seul est le seul énoncé que ce composant peut garantir vrai.
 */
function Anneau({
  pourcentage,
  valeurCentre,
  denominateur,
}: {
  pourcentage: number;
  valeurCentre: number;
  denominateur: string;
}) {
  const decalage = CIRCONFERENCE_ANNEAU - (CIRCONFERENCE_ANNEAU * pourcentage) / 100;
  return (
    <span className={styles.anneau}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" data-anneau="objectif">
        <circle cx="26" cy="26" r={RAYON_ANNEAU} className={styles.anneauFond} data-anneau-partie="fond" />
        <circle
          cx="26"
          cy="26"
          r={RAYON_ANNEAU}
          className={styles.anneauProgres}
          data-anneau-partie="progres"
          strokeDasharray={CIRCONFERENCE_ANNEAU}
          strokeDashoffset={decalage}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span className={styles.anneauCentre}>
        <span className={styles.anneauValeur}>{valeurCentre}</span>
        <span className={styles.anneauDenominateur}>{denominateur}</span>
      </span>
    </span>
  );
}

/**
 * L'objectif du jour : l'anneau, plus l'aveu — jamais un bloc à sa place —
 * quand l'historique ne permet pas encore de le connaître.
 *
 * `Mesure<number>` (voir son docstring, domain/jeu.ts) impose ce branchement
 * en deux, mais plus au prix d'un `EmptyState` (deux paragraphes empilés) au
 * milieu d'une rangée horizontale (relevé du propriétaire, tâche 8, second
 * passage) : l'anneau existe dans les DEUX cas, rail seul quand l'objectif
 * est inconnu, arc rempli sinon.
 *
 * **Correctif de revue (troisième passage).** La maquette n'écrit « Objectif
 * du jour » que dans l'infobulle (l. 120) — l'anneau se suffit, et la place
 * gagnée est ce qui rend la bande dense. La légende visible ne reste donc
 * QUE pour l'aveu « historique insuffisant » : c'est précisément ce que ce
 * lot doit dire, et le retirer serait perdre le seul avertissement de
 * l'écran. Quand l'objectif est connu, `t('jeu.objectif.titre')` migre vers
 * `.accessible` (même utilitaire *sr-only* que `Squelette`) : l'anneau reste
 * NOMMÉ pour un lecteur d'écran dans les deux cas, sans que la maquette n'ait
 * eu à s'en soucier elle-même.
 */
function Objectif({ objectif, realise }: { objectif: Jeu['objectifDuJour']; realise: number }) {
  const t = useT();

  if (!objectif.connue) {
    return (
      <Tooltip intitule={t('jeu.objectif.insuffisant.titre')} contenu={t('jeu.objectif.insuffisant.detail')}>
        <span tabIndex={0} className={styles.objectifCellule}>
          <Anneau pourcentage={0} valeurCentre={realise} denominateur={t('jeu.objectif.denominateur.inconnu')} />
          <span className={styles.objectifLegende}>{t('jeu.objectif.insuffisant.titre')}</span>
        </span>
      </Tooltip>
    );
  }

  // Un objectif de ZERO est un objectif REMPLI, pas un anneau vide — correctif
  // de revue (tâche 8, troisième passage) : `objectif.valeur === 0` reste
  // parfaitement atteignable (une médiane à zéro après une série de jours
  // sans relance tenue), et si une relance est tenue aujourd'hui, l'objectif
  // n'est pas seulement atteint, il est dépassé. Diviser par un dénominateur
  // nul aurait été l'erreur inverse ; y répondre par 0% en était une autre,
  // silencieuse celle-là.
  const pourcentage = objectif.valeur > 0 ? Math.min(100, (realise / objectif.valeur) * 100) : 100;
  return (
    <Tooltip
      intitule={t('jeu.objectif.titre')}
      contenu={`${t('jeu.objectif.valeur', { count: realise })}${t('today.reason.separator')}${t('jeu.objectif.hint')}`}
    >
      <span tabIndex={0} className={styles.objectifCellule}>
        <Anneau
          pourcentage={pourcentage}
          valeurCentre={realise}
          denominateur={t('jeu.objectif.denominateur', { objectif: objectif.valeur })}
        />
        <span className={styles.accessible}>{t('jeu.objectif.titre')}</span>
      </span>
    </Tooltip>
  );
}

/**
 * Les noms de palier de la maquette (Main.dc.html ~127 : « Palier
 * **Prospecteur** → Closer ») — arbitrage du propriétaire (tâche 8,
 * troisième passage) : ce ne sont pas des inventions, ils viennent de la
 * référence visuelle elle-même. Elle n'en nomme que DEUX, et `Palier.numero`
 * n'est borné nulle part dans le domaine (`domain/jeu.ts`) : au-delà du
 * dernier nommé, `libellePalierComplet`/`libellePalierCourt` retombent sur
 * « Palier N » (`jeu.palier.titre`, déjà existante) — un repli honnête
 * plutôt qu'un nom fabriqué pour un palier que la maquette n'a jamais
 * montré, même doctrine que partout ailleurs dans ce fichier.
 *
 * `Record` littéral, comme `CLE_BADGE` : une composition dynamique
 * (`` `jeu.palier.nom.${numero}` ``) échapperait à la recherche textuelle du
 * contrôle d'orphelines de `i18n.test.ts`.
 */
const NOMS_PALIER: Readonly<Record<number, TranslationKey>> = {
  1: 'jeu.palier.nom.1',
  2: 'jeu.palier.nom.2',
};

/** Le palier COURANT : « Palier Prospecteur » (nommé) ou « Palier N » (repli) — jamais le nom nu seul, pour que le mot « Palier » reste présent dans les deux cas. */
function libellePalierComplet(numero: number, t: ReturnType<typeof useT>): string {
  const nom = NOMS_PALIER[numero];
  return nom !== undefined ? t('jeu.palier.avecNom', { nom: t(nom) }) : t('jeu.palier.titre', { numero });
}

/** Le palier SUIVANT : le nom nu (« Closer », comme la maquette) ou « Palier N » (repli) — jamais préfixé, pour ne pas répéter le mot « Palier » deux fois dans l'en-tête. */
function libellePalierCourt(numero: number, t: ReturnType<typeof useT>): string {
  const nom = NOMS_PALIER[numero];
  return nom !== undefined ? t(nom) : t('jeu.palier.titre', { numero });
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
  const actuel = libellePalierComplet(palier.numero, t);
  const suivant = libellePalierCourt(palier.numero + 1, t);
  return (
    <div className={styles.palier}>
      <div className={styles.palierEntete}>
        <span className={styles.palierProgression}>
          <b className={styles.palierActuel}>{actuel}</b>
          <span className={styles.palierFleche}>{t('jeu.palier.fleche')}</span>
          <span className={styles.palierSuivant}>{suivant}</span>
        </span>
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

/**
 * Le squelette de chargement — même carcasse que la bande chargée (relevé du
 * propriétaire, tâche 8, second passage) : la livraison initiale réduisait
 * `loading` à un unique `<p>`, qui s'effondrait à la hauteur d'une ligne
 * pendant tout l'aller-retour réseau. Les trois cellules ci-dessous
 * reprennent les classes réelles (`objectifCellule`, `palier`, `jalons`).
 *
 * **Correctif de revue (troisième passage).** Le bloc `.palier` imite
 * maintenant les QUATRE rangées réelles — en-tête, barre, note, poids — pas
 * trois : `palier.complet === false` (l'état du jour de la livraison, voir
 * `calculerPalier`, domain/jeu.ts) ajoute une rangée réelle (`.palierNote`)
 * que l'ancien squelette omettait, faisant grandir la bande visiblement au
 * moment où les données arrivaient. `min-height` sur `.corpsJeu` (voir
 * BandeProgression.module.css) porte le
 * reste de la garantie : **`jsdom` ne calcule aucune mise en page, donc
 * aucun test de ce fichier ne peut prouver que la hauteur réelle ne bouge
 * pas** — seule l'imitation des rangées (leur NOMBRE) est vérifiable ici, et
 * c'est tout ce que les tests de ce composant affirment.
 *
 * `aria-hidden` sur les blocs eux-mêmes : ce qui compte pour un lecteur
 * d'écran, c'est le texte de chargement, pas la forme des blocs vides.
 */
function Squelette() {
  const t = useT();
  return (
    <div className={styles.corpsJeu} role="status">
      <span className={styles.accessible}>{t('jeu.chargement')}</span>
      <div className={`${styles.objectifCellule} ${styles.squelette}`} aria-hidden="true">
        <span className={styles.squeletteAnneau} />
        <span className={styles.squeletteLigne} style={{ width: '70%' }} />
      </div>
      <div className={`${styles.palier} ${styles.squelette}`} aria-hidden="true" data-squelette-bloc="palier">
        {/* en-tête */}
        <span className={styles.squeletteLigne} data-squelette="ligne" style={{ width: '55%' }} />
        {/* barre */}
        <span className={styles.squeletteBarre} data-squelette="barre" />
        {/* note d'incomplétude — état réel du jour de la livraison, voir le docstring ci-dessus */}
        <span className={styles.squeletteLigne} data-squelette="ligne" style={{ width: '65%' }} />
        {/* poids des trois sources */}
        <span className={styles.squeletteLigne} data-squelette="ligne" style={{ width: '90%' }} />
      </div>
      <div className={`${styles.jalons} ${styles.squelette}`} aria-hidden="true">
        <span className={styles.squelettePastille} />
        <span className={styles.squelettePastille} />
        <span className={styles.squelettePastille} />
        <span className={styles.squelettePastille} />
      </div>
    </div>
  );
}

/**
 * Le message d'échec — même carcasse (classe `corpsJeu`, donc même hauteur
 * plancher CSS) que la bande chargée et que `Squelette`, centré plutôt que
 * réduit à un `<p>` nu. `role="status"` et non `alert` : un jeu qui ne
 * charge pas ne bloque aucune action de l'écran (relancer, ouvrir un
 * prospect) — ce n'est pas une panne au même titre qu'une lecture de
 * prospects en échec.
 */
function Erreur({ message }: { message: string }) {
  const t = useT();
  return (
    <div className={`${styles.corpsJeu} ${styles.corpsJeuErreur}`} role="status">
      <p className={styles.statutErreur}>{t('jeu.erreur', { message })}</p>
    </div>
  );
}

export function BandeProgression({ jeu }: { jeu: JeuState }): ReactNode {
  if (jeu.status === 'loading') {
    return (
      <div className={styles.bande}>
        <Squelette />
      </div>
    );
  }

  if (jeu.status === 'error') {
    return (
      <div className={styles.bande}>
        <Erreur message={jeu.message} />
      </div>
    );
  }

  return (
    <div className={styles.bande}>
      <div className={styles.corpsJeu}>
        <Objectif objectif={jeu.jeu.objectifDuJour} realise={jeu.jeu.realiseAujourdHui} />
        <PalierBande palier={jeu.jeu.palier} />
        <div className={styles.jalons}>
          {jeu.jeu.badges.map((badge) => (
            <Pastille key={badge.id} badge={badge} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Le compteur de série de la barre du haut (maquette, ligne ~94).
 *
 * **Règle changée (tâche 8, second passage).** La première version masquait
 * ce compteur tant que `objectifDuJour` n'était pas connu — donc invisible
 * au jour même de la livraison, alors qu'une série d'un ou deux jours est un
 * fait aussi mesuré qu'une série de dix. `serie.jours` et `objectifDuJour`
 * sont deux mesures DIFFÉRENTES ; les lier était le mauvais critère. Seul
 * `serie.jours` décide désormais : le compteur paraît dès qu'il vaut au
 * moins un jour, et rien ne paraît à zéro — un zéro n'a rien à annoncer dans
 * une barre de titre. `relancesTenues` (domain/jeu.ts) exclut déjà les
 * lignes `origin: 'amorcage'` : une série non nulle ne peut donc jamais
 * reposer sur une reconstitution, seulement sur une observation réelle.
 *
 * `AppShell`/`BarreHaut` reçoivent le résultat en `ReactNode`, sans rien
 * savoir du jeu — même patron que `search` (tâche 2, lot 3).
 *
 * **Correctif de revue (troisième passage).** La maquette écrit « 6 jours »
 * (l. 94), pas « 6 jours d'affilée » : le texte complet — « jours civils
 * consécutifs avec au moins une relance tenue » — vit déjà dans l'infobulle
 * (`jeu.serie.hint`), la répéter dans le badge était une redite. `jeu.serie.jours`
 * et `jeu.serie.auMoins` perdent donc « d'affilée » ; « Au moins » reste,
 * lui, sur `jeu.serie.auMoins` — ce n'est pas une fioriture mais la seule
 * formulation que le code puisse garantir quand `borneAtteinte` est vrai. La
 * flamme de la maquette remplace le point de couleur : le mot (`texte`) porte
 * déjà le sens, l'icône est décorative (`aria-hidden`).
 */
export function SerieEnTete({ jeu }: { jeu: JeuState }): ReactNode {
  const t = useT();
  if (jeu.status !== 'ready' || jeu.jeu.serie.jours < 1) return null;

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
        <Badge ton="alerte">
          <IconeFlamme />
          {texte}
        </Badge>
      </span>
    </Tooltip>
  );
}
