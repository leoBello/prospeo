import type { ReactElement } from 'react';
import type { SegmentEtat } from '../domain/campagne.js';
import type { TranslationKey } from '../i18n/translate.js';
import { useT } from './preferences.js';
import styles from './PisteCampagne.module.css';

/**
 * Les trois segments d'une ligne de campagne : Site · Mail · Envoi.
 *
 * **Trois segments et non cinq.** Les cinq étapes de déploiement restent
 * celles de l'écran « Déploiements » ; les redessiner ici créerait un second
 * vocabulaire pour le même fait (D8). Le détail des cinq s'ouvre au clic sur
 * la ligne — hors périmètre de ce lot, qui ne lit qu'à distance.
 *
 * **Chaque segment porte son propre `aria-label`**, contrairement à
 * `EtapesPiste` qui n'en porte qu'un pour la piste entière : ici, c'est le
 * TROISIÈME segment qui distingue « bloqué » (adresse manquante, tirets
 * ambre) d'« en échec » (plein rouge), et un lecteur d'écran doit pouvoir
 * nommer PRÉCISÉMENT lequel des trois segments porte cette distinction — un
 * label unique pour la piste entière l'aurait noyée dans les deux autres.
 */

const CLE_ETAT: Record<SegmentEtat, TranslationKey> = {
  vide: 'campagne.piste.etat.vide',
  en_cours: 'campagne.piste.etat.enCours',
  ok: 'campagne.piste.etat.ok',
  echec: 'campagne.piste.etat.echec',
  bloque: 'campagne.piste.etat.bloque',
};

// Non typé en `Record<SegmentEtat, string>` : les classes de CSS Modules sont
// `string | undefined` sous `noUncheckedIndexedAccess` (aucune propriété
// nommée, seulement un index signature) — un repli sur `''` en dessous suffit
// puisque les cinq clés existent réellement dans PisteCampagne.module.css.
const CLASSE: Record<SegmentEtat, string | undefined> = {
  vide: styles.vide,
  en_cours: styles.enCours,
  ok: styles.ok,
  echec: styles.echec,
  bloque: styles.bloque,
};

function Segment({ nom, etat }: { nom: TranslationKey; etat: SegmentEtat }) {
  const t = useT();
  return (
    <span
      // `role="img"` plutôt qu'un `div` muet : le segment PORTE une
      // information, il n'est pas décoratif.
      role="img"
      aria-label={t('campagne.piste.segment', { segment: t(nom), etat: t(CLE_ETAT[etat]) })}
      className={`${styles.segment} ${CLASSE[etat] ?? ''}`}
    />
  );
}

export function PisteCampagne({
  site,
  mail,
  envoi,
}: {
  site: SegmentEtat;
  mail: SegmentEtat;
  envoi: SegmentEtat;
}): ReactElement {
  return (
    <div className={styles.piste}>
      <Segment nom="campagne.piste.site" etat={site} />
      <Segment nom="campagne.piste.mail" etat={mail} />
      <Segment nom="campagne.piste.envoi" etat={envoi} />
    </div>
  );
}
