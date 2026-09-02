import type { Enums } from '@prospeo/db';
import type { DeploymentEtat } from '../domain/deployment.js';
import type { TranslationKey, TranslationParams } from '../i18n/translate.js';
import { useT } from './preferences.js';
import styles from './EtapesPiste.module.css';

type Etape = Enums<'deployment_step'>;
type Traducteur = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * Les cinq segments de la piste, dans l'ordre réel du pipeline (D5, lot 2).
 *
 * `retrait` n'y figure pas : ce n'est pas une étape de progression vers un
 * site en ligne, c'est ce qui l'efface. Un site retiré ne montre d'ailleurs
 * aucun segment allumé (voir `segments` ci-dessous) — sa progression passée
 * n'a plus de sens à afficher une fois le site retiré.
 */
const ETAPES_PISTE: readonly Etape[] = ['redaction', 'depot', 'projet', 'build', 'en_ligne'];

const CLE_ETAPE: Record<Etape, TranslationKey> = {
  redaction: 'deploiements.etape.redaction',
  depot: 'deploiements.etape.depot',
  projet: 'deploiements.etape.projet',
  build: 'deploiements.etape.build',
  en_ligne: 'deploiements.etape.en_ligne',
  retrait: 'deploiements.etape.retrait',
};

type SegmentEtat = 'ok' | 'run' | 'fail' | 'empty';

/**
 * L'état des cinq segments, dérivé de l'étape courante et de l'état global.
 *
 * Ce n'est PAS une redérivation de `etatDepuisEvenements` (domain/deployment.ts) —
 * l'état arrive déjà décidé dans `etat`. C'est un simple mappage vers une
 * forme d'affichage, comme le fait déjà `StatusBadge` pour `pipeline_status`.
 */
function segments(etape: Etape | null, etat: DeploymentEtat): SegmentEtat[] {
  // Le cas majoritaire au jour un (§brief) : un site en ligne peut n'avoir
  // aucun événement (table créée après coup). La piste ne peut alors pas
  // s'appuyer sur `etape` — elle affiche la seule chose qui soit vraie :
  // toutes les étapes ont forcément eu lieu pour qu'une URL existe.
  if (etat === 'en_ligne') return ETAPES_PISTE.map(() => 'ok');

  // Un site jamais déployé, ou retiré, n'affiche aucune progression : dans
  // le premier cas parce qu'il n'y en a aucune, dans le second parce que la
  // progression passée n'intéresse plus personne — c'est le parti pris de la
  // maquette (voir Deploiements.dc.html, ligne « retiré »).
  if (etat === 'jamais' || etat === 'retire') return ETAPES_PISTE.map(() => 'empty');

  const index = etape === null ? -1 : ETAPES_PISTE.indexOf(etape);
  // Défensif : `en_cours`/`echec` impliquent toujours une étape connue dans
  // `ORDRE_ETAPES` (voir `etatDepuisEvenements`), mais une étape hors de la
  // piste (`retrait`, ou une valeur que la base ajouterait plus tard) ne
  // doit pas faire s'effondrer le rendu — un vide est un défaut moins grave
  // qu'un crash.
  if (index === -1) return ETAPES_PISTE.map(() => 'empty');

  return ETAPES_PISTE.map((_, i) => {
    if (i < index) return 'ok';
    if (i > index) return 'empty';
    return etat === 'echec' ? 'fail' : 'run';
  });
}

/**
 * Le libellé qui nomme l'étape ET l'état — partagé par l'`aria-label` de la
 * piste et par le badge d'état de la ligne (`DeploiementsScreen`), pour que
 * les deux ne puissent jamais diverger.
 */
export function libellePisteEtat(t: Traducteur, etat: DeploymentEtat, etape: Etape | null): string {
  if (etat === 'jamais') return t('deploiements.etat.jamais');
  if (etat === 'retire') return t('deploiements.etat.retire');
  if (etat === 'en_ligne') return t('deploiements.etat.enLigne');
  const etapeTexte = etape === null ? t('deploiements.etape.inconnue') : t(CLE_ETAPE[etape]);
  return t(etat === 'echec' ? 'deploiements.etat.echec' : 'deploiements.etat.enCours', {
    etape: etapeTexte,
  });
}

/**
 * La piste à cinq segments (D9).
 *
 * Deux partis pris, tous deux non décoratifs :
 * - la forme du segment porte l'information, pas sa seule couleur : `ok`,
 *   `run`, `fail` et `empty` sont quatre motifs CSS distincts
 *   (`EtapesPiste.module.css`), lisibles en niveaux de gris ;
 * - `role="img"` avec un `aria-label` unique : la piste se lit comme UNE
 *   information (« où en est ce déploiement »), pas comme cinq éléments
 *   focalisables et sans nom individuel.
 *
 * L'animation du segment `run` vient de `EtapesPiste.module.css` seul ; la
 * règle globale `prefers-reduced-motion` de `theme.css` s'applique déjà à
 * TOUT élément animé (sélecteur `*`), y compris celui-ci — rien à dupliquer
 * ici, seulement à ne pas casser en évitant `!important` local qui la
 * court-circuiterait.
 */
export function EtapesPiste({ etape, etat }: { etape: Etape | null; etat: DeploymentEtat }) {
  const t = useT();
  const etatsSegments = segments(etape, etat);
  const libelle = t('deploiements.piste.aria', { etat: libellePisteEtat(t, etat, etape) });

  return (
    <div className={styles.piste} role="img" aria-label={libelle}>
      {etatsSegments.map((segEtat, i) => (
        // eslint-disable-next-line react/no-array-index-key -- la piste a une longueur fixe et jamais réordonnée.
        <span key={i} className={styles.segment} data-etat={segEtat} />
      ))}
    </div>
  );
}
