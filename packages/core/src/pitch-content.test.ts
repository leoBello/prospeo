import { describe, expect, it } from 'vitest';
import {
  PITCH_LIMITS,
  pitchRedactionJsonSchema,
  pitchRedactionSchema,
  segmentsSms,
  SMS_SEGMENTS_MAX,
} from './pitch-content.js';

const valide = {
  email: {
    objet: 'Une page de démonstration pour Dos-Services',
    corps: 'x'.repeat(PITCH_LIMITS.emailCorps.min),
  },
  sms: 'x'.repeat(PITCH_LIMITS.sms.min),
  appel: 'x'.repeat(PITCH_LIMITS.appel.min),
};

describe('pitchRedactionSchema', () => {
  it('accepte les trois canaux du plan, et eux seuls', () => {
    expect(pitchRedactionSchema().safeParse(valide).success).toBe(true);
  });

  it('refuse un champ que le modèle ajouterait de lui-même', () => {
    // `.strict()` sert deux fois, comme pour le site : il ferme la porte au
    // modèle qui livrerait spontanément un `whatsapp` ou un `linkedin` — sa
    // pente naturelle dès qu'une rubrique lui paraît manquer — et il produit
    // `additionalProperties: false`, que les sorties structurées exigent.
    const r = pitchRedactionSchema().safeParse({ ...valide, whatsapp: 'Bonjour !' });
    expect(r.success).toBe(false);
  });

  it('borne le SMS par sa longueur, à l’écriture', () => {
    // Le plan l'exige : « c'est une contrainte de rédaction à passer au modèle,
    // pas une troncature appliquée après coup ». Un SMS tronqué perdrait sa
    // fin — c'est-à-dire la signature et le moyen de dire non.
    const trop = { ...valide, sms: 'x'.repeat(PITCH_LIMITS.sms.max + 1) };
    expect(pitchRedactionSchema().safeParse(trop).success).toBe(false);
  });

  it('borne le plafond du SMS sur deux segments concaténés réels', () => {
    // 306 n'est pas un chiffre rond choisi au jugé : c'est 2 x 153, la taille
    // utile d'un segment dans un message concaténé (les 7 octets d'en-tête
    // amputent les 160 du segment isolé). Le faire dériver de la constante
    // interdit qu'il devienne une préférence d'un jour.
    expect(PITCH_LIMITS.sms.max).toBe(153 * SMS_SEGMENTS_MAX);
  });
});

describe('segmentsSms', () => {
  it('compte un segment pour un message court en alphabet GSM', () => {
    const r = segmentsSms('Bonjour, votre page est en ligne.');
    expect(r.alphabet).toBe('gsm7');
    expect(r.segments).toBe(1);
    expect(r.horsGsm7).toEqual([]);
  });

  it('accepte les accents que l’alphabet GSM contient vraiment', () => {
    // è, é, ù, à, ì, ò sont dans le jeu de base GSM 03.38. Les croire absents
    // ferait rejeter du français parfaitement ordinaire.
    expect(segmentsSms('Vous êtes déjà à jour'.replace('ê', 'e')).alphabet).toBe('gsm7');
    expect(segmentsSms('déjà où').alphabet).toBe('gsm7');
  });

  it('bascule en UCS-2 sur les caractères français que le GSM ignore', () => {
    // Le fait non évident, et celui qui rend le décompte utile : « ç »
    // minuscule, les accents circonflexes et l'apostrophe typographique « ’ »
    // sont HORS du jeu GSM. Un seul d'entre eux fait passer TOUT le message en
    // UCS-2, où un segment ne porte plus que 70 caractères — et un modèle qui
    // rédige en français les produit spontanément.
    for (const c of ['ç', 'ê', 'â', 'î', 'ô', 'û', '’', 'œ']) {
      const r = segmentsSms(`Ceci contient ${c} donc`);
      expect(r.alphabet, c).toBe('ucs2');
      expect(r.horsGsm7, c).toContain(c);
    }
  });

  it('compte l’euro comme deux caractères', () => {
    // L'euro est dans la table d'extension : il est présent, mais il coûte
    // deux septets. Un message calibré au caractère près déborderait sans que
    // sa longueur ait bougé.
    expect(segmentsSms('€'.repeat(81)).segments).toBe(2);
    expect(segmentsSms('x'.repeat(81)).segments).toBe(1);
  });

  it('passe à deux segments au-delà d’un SMS isolé', () => {
    expect(segmentsSms('x'.repeat(160)).segments).toBe(1);
    expect(segmentsSms('x'.repeat(161)).segments).toBe(2);
    // Concaténé, chaque segment ne porte plus que 153 caractères.
    expect(segmentsSms('x'.repeat(306)).segments).toBe(2);
    expect(segmentsSms('x'.repeat(307)).segments).toBe(3);
  });

  it('rend un message vide en zéro segment', () => {
    expect(segmentsSms('').segments).toBe(0);
  });
});

describe('pitchRedactionJsonSchema', () => {
  it('dit à l’API exactement ce que zod validera', () => {
    // Second encodage du MÊME contrat, imposé par les sorties structurées qui
    // attendent un JSON Schema quand ce dépôt est écrit contre zod 3. Les deux
    // dérivent de `PITCH_LIMITS` : aucune valeur n'est recopiée, donc aucune ne
    // peut diverger — et ce test le vérifie plutôt que de le supposer.
    const js = pitchRedactionJsonSchema() as Record<string, any>;
    expect(js.additionalProperties).toBe(false);
    expect(js.required.sort()).toEqual(['appel', 'email', 'sms']);
    expect(js.properties.sms.maxLength).toBe(PITCH_LIMITS.sms.max);
    expect(js.properties.sms.minLength).toBe(PITCH_LIMITS.sms.min);
    expect(js.properties.email.properties.objet.maxLength).toBe(PITCH_LIMITS.emailObjet.max);
    expect(js.properties.email.properties.corps.minLength).toBe(PITCH_LIMITS.emailCorps.min);
    expect(js.properties.email.additionalProperties).toBe(false);
    expect(js.properties.appel.maxLength).toBe(PITCH_LIMITS.appel.max);
  });
});
