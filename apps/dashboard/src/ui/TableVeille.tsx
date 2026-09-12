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
  /**
   * Les mêmes comptes, mais calculés SANS la recherche.
   *
   * Seule source légitime des trois chiffres qui parlent explicitement de la
   * base : le dénominateur de `veille.compte.a_contacter`, les deux nombres
   * de `veille.compte.toutes`, et le badge des jamais scorés. `comptes`
   * (ci-dessus, potentiellement filtré par une recherche) reste la source de
   * la barre d'onglets et du numérateur de « à contacter » — des chiffres
   * qui ne prétendent décrire que ce que la recherche montre, jamais la base
   * entière (relevé de revue, constat 2).
   */
  comptesEnBase: ComptesVeille;
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
  onglet, comptes, comptesEnBase, page, ordre, totalEnBase, selectedId, now, recherche, ongletPleinSansRecherche,
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
      ? t('veille.compte.a_contacter', { classables: page.total, total: comptesEnBase.sansSuivi })
      : onglet === 'toutes'
        ? t('veille.compte.toutes', { classables: comptesEnBase.parOnglet.toutes, total: totalEnBase })
        : page.total === 0
          ? t('veille.compte.vide')
          : t('veille.compte.statut', { count: page.total, classables });

  return (
    // Nom du landmark : c'est la seule mention de « Toute la veille » à
    // l'écran, ce composant assemblant justement tout ce qu'elle désigne
    // (barre d'onglets, table, pagination) — la barre d'onglets porte sa
    // propre légende (`veille.onglets.aria`), plus étroite, sans faire
    // double emploi avec celle-ci.
    <section className={styles.section} aria-label={t('veille.titre')}>
      <div className={styles.barreHaut}>
        <OngletsVeille onglet={onglet} comptes={comptes} onChoisir={onChoisirOnglet} />
        <span className={styles.espace} />
        <div className={styles.tri}>
          <button type="button" className={styles.boutonTri} onClick={onBasculerOrdre}>
            {t(ordre === 'score_desc' ? 'veille.tri.score_desc' : 'veille.tri.score_asc')}
          </button>
        </div>
      </div>

      <div className={styles.ligneCompte}>
        <span className={styles.titre}>{t(TITRE_ONGLET[onglet])}</span>
        <span className={styles.compte}>{compte}</span>
        {/*
          L'enveloppe `span` autour du badge n'est pas décorative : `Badge` est
          un composant fonction sans `forwardRef`, et `Tooltip.Trigger` a besoin
          d'un vrai nœud à référencer. Passé directement, React émet « Function
          components cannot be given refs » et la référence tombe dans le vide —
          défaut qu'aucun test de ce dépôt ne voit, `jsdom` ne calculant aucun
          placement. `tabIndex` rend le déclencheur atteignable au clavier, sans
          quoi l'explication n'existerait qu'à la souris. C'est le patron de
          `kit/Bientot.tsx`, qui enveloppe un badge de la même façon.
        */}
        {CLASSEMENT_DE_LA_BASE.includes(onglet) && comptesEnBase.sansScore > 0 ? (
          <Tooltip contenu={t('veille.sansScore.hint')}>
            <span tabIndex={0}>
              <Badge ton="alerte" taille="compacte" discontinu>
                {t('veille.sansScore', { count: comptesEnBase.sansScore })}
              </Badge>
            </span>
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
