import type { Enums } from '@prospeo/db';
import { ONGLETS } from '../domain/veille.js';
import type { ComptesVeille, OngletVeille } from '../domain/veille.js';
import type { TranslationKey } from '../i18n/translate.js';
import { useT } from './preferences.js';
import styles from './OngletsVeille.module.css';

/**
 * La couleur de la pastille de chaque onglet.
 *
 * Reprise du `TON` de `kit/StatusBadge.tsx`, au ton près : un « Relancé »
 * ambre dans la barre doit être le même ambre que dans la colonne. Les tokens
 * sont nommés ici plutôt que déduits d'un `data-ton` parce qu'un onglet n'est
 * pas un badge — il n'a ni fond, ni bordure, ni libellé de badge.
 */
const COULEUR: Record<Enums<'pipeline_status'>, string> = {
  a_contacter: 'var(--color-text-muted)',
  contacte: 'var(--color-accent)',
  relance: 'var(--color-warning)',
  interesse: 'var(--color-info)',
  gagne: 'var(--color-success)',
  perdu: 'var(--color-danger)',
  ne_pas_contacter: 'var(--color-danger)',
};

const CLE: Record<OngletVeille, TranslationKey> = {
  a_contacter: 'pipeline.status.a_contacter',
  contacte: 'pipeline.status.contacte',
  relance: 'pipeline.status.relance',
  interesse: 'pipeline.status.interesse',
  gagne: 'pipeline.status.gagne',
  perdu: 'pipeline.status.perdu',
  ne_pas_contacter: 'pipeline.status.ne_pas_contacter',
  toutes: 'veille.onglet.toutes',
};

interface Props {
  onglet: OngletVeille;
  comptes: ComptesVeille;
  onChoisir: (onglet: OngletVeille) => void;
}

/**
 * Un onglet par statut de suivi, jamais un statut masqué.
 *
 * Les onglets à zéro restent affichés : cinq des huit le sont aujourd'hui
 * (`prospect_pipeline` compte 2 lignes sur 139 prospects, relevé du
 * 2 septembre 2026), et les cacher ferait disparaître les étapes du parcours
 * au moment précis où l'on cherche à savoir où en est la prospection.
 */
export function OngletsVeille({ onglet, comptes, onChoisir }: Props) {
  const t = useT();

  return (
    <div className={styles.barre} role="tablist" aria-label={t('veille.onglets.aria')}>
      {ONGLETS.map((id) => {
        const libelle = t(CLE[id]);
        const compte = comptes.parOnglet[id];
        return (
          <span key={id} style={{ display: 'contents' }}>
            {/* Le trait ne sépare pas deux statuts : il sépare les statuts de
                la vue d'ensemble, qui n'en est pas un. */}
            {id === 'toutes' ? <span className={styles.separateur} aria-hidden="true" /> : null}
            <button
              type="button"
              role="tab"
              className={styles.onglet}
              aria-selected={id === onglet}
              aria-label={t('veille.onglet.compte.aria', { label: libelle, count: compte })}
              onClick={() => onChoisir(id)}
            >
              {id === 'toutes' ? null : (
                <span
                  className={styles.pastille}
                  style={{ background: COULEUR[id], color: COULEUR[id] }}
                  data-discontinu={id === 'ne_pas_contacter' ? 'true' : undefined}
                  aria-hidden="true"
                />
              )}
              {libelle}
              <span className={styles.compte}>{compte}</span>
            </button>
          </span>
        );
      })}
    </div>
  );
}
