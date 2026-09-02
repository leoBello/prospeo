import type { Enums } from '@prospeo/db';
import type { TranslationKey } from '../../i18n/translate.js';
import { useT } from '../preferences.js';
import { Badge } from './Badge.js';
import type { BadgeTon } from './Badge.js';

type Statut = Enums<'pipeline_status'>;

/**
 * Le ton de chaque statut.
 *
 * `ne_pas_contacter` n'est pas « le pire des statuts » : c'est une obligation
 * de conformité (§11), respectée immédiatement et définitivement. Il porte
 * pour cette raison le trait discontinu, que rien d'autre n'utilise.
 */
const TON: Record<Statut, BadgeTon> = {
  a_contacter: 'neutre',
  contacte: 'accent',
  relance: 'alerte',
  interesse: 'info',
  gagne: 'succes',
  perdu: 'danger',
  ne_pas_contacter: 'danger',
};

const CLE: Record<Statut, TranslationKey> = {
  a_contacter: 'pipeline.status.a_contacter',
  contacte: 'pipeline.status.contacte',
  relance: 'pipeline.status.relance',
  interesse: 'pipeline.status.interesse',
  gagne: 'pipeline.status.gagne',
  perdu: 'pipeline.status.perdu',
  ne_pas_contacter: 'pipeline.status.ne_pas_contacter',
};

/**
 * Le statut de suivi, ou son absence.
 *
 * `null` n'est pas un cas dégénéré : au 1ᵉʳ septembre 2026, 114 prospects sur
 * 139 n'ont aucune ligne dans `prospect_pipeline`. « Jamais contacté » est
 * donc l'affichage le plus fréquent, et il doit se lire comme un état.
 */
export function StatusBadge({ status }: { status: Statut | null }) {
  const t = useT();
  if (status === null) return <Badge ton="neutre">{t('pipeline.absent')}</Badge>;
  return (
    <Badge ton={TON[status]} point discontinu={status === 'ne_pas_contacter'}>
      {t(CLE[status])}
    </Badge>
  );
}
