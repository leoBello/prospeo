# L'appariement par adresse — plan d'implémentation

> **Pour les agents :** COMPÉTENCE REQUISE — `superpowers:subagent-driven-development`
> (recommandée) ou `superpowers:executing-plans` pour exécuter ce plan tâche par
> tâche. Les étapes portent des cases à cocher (`- [ ]`).

**Objectif :** ajouter à l'appariement Google Maps ↔ SIRET une seconde voie de
décision, fondée sur l'adresse postale exacte, qui transforme un `not_found` en
`ok` quand une fiche du bâtiment se trouve à l'adresse déclarée — sans jamais
dégrader un verdict ni alimenter la file de revue.

**Architecture :** un nouveau module `packages/core/src/address-match.ts`,
voisin de `name-match.ts` et de même forme, qui normalise une adresse postale
française et décide si deux adresses désignent le même point.
`packages/core/src/matching.ts` l'appelle depuis `scoreCandidate` (qui pose une
quatrième ligne de justification `adresse`, sans points) et depuis
`selectMatch`, dans la **seule** branche où plus aucun candidat n'est retenu.
`calibrate` compte et affiche à part les fusions ainsi gagnées, pour qu'elles
soient relues une par une avant tout `--apply`.

**Pile technique :** TypeScript ESM/NodeNext, vitest, pnpm workspaces. Aucune
dépendance nouvelle. Aucune migration, aucun écran, aucune requête Google.

**Spec de référence :** `docs/superpowers/specs/2026-09-05-appariement-par-adresse-design.md`
— **approuvé.** Ses décisions A1 à A6 sont citées par leur nom dans les tâches.

---

## Contraintes globales

Elles font partie des exigences de **chaque** tâche.

- **Tout est en français** : commentaires, messages de test, libellés,
  documentation. Les identifiants du nouveau module sont français
  (`normaliserAdresse`, `memeAdresse`, `estCategorieBatiment`), comme
  `estUnRefus` ou `segmentsSms` ailleurs dans `packages/core`. Les champs
  ajoutés à un type **existant** suivent leurs voisins : `MatchScore` porte
  déjà `categoryMatch` et `nameSimilarity`, donc `sameAddress` et
  `addressMatch` s'y écrivent en anglais. Les **codes** de `MatchLine` sont
  déjà français (`'nom'`, `'distance'`, `'categorie'`) : le nouveau est
  `'adresse'`.
- **Les commentaires disent le *pourquoi*, jamais le *quoi*.**
- **Imports en `.js`**, même depuis un `.ts` (ESM/NodeNext).
- **Écris le test d'abord**, lance-le, **vérifie qu'il échoue pour la bonne
  raison**, et transcris la sortie. Un récit sans transcription n'est pas une
  preuve.
- **`pnpm test -- <motif>` ne restreint PAS un run vitest dans ce dépôt.** La
  suite entière s'exécute quoi qu'il arrive. Ne prétends jamais avoir lancé un
  sous-ensemble. Les commandes de ce plan lancent donc toujours la suite
  entière d'un paquet, et l'attendu porte sur le fichier concerné dans cette
  sortie.
- **Référence de départ, mesurée le 5 septembre 2026 :**
  `pnpm --filter @prospeo/core test` → **209 tests / 19 fichiers** ;
  `pnpm --filter @prospeo/collector test` → **418 tests / 31 fichiers** ;
  `pnpm -r typecheck` vert sur les 8 paquets. Ces totaux ne doivent que
  croître.
- **Aucune migration, aucun écran, aucun texte d'interface** dans ce chantier.
  `src/i18n/fr.ts` et `en.ts` ne sont pas touchés.
- **Les valeurs d'adresse et de catégorie des tests sont relevées en base
  réelle** (`prospect.address`, `prospect_enrichment.candidates`), et non
  inventées. Elles sont recopiées dans les tâches ci-dessous, littéralement.
  Les deux seules exceptions, signalées à leur place, sont les suffixes de
  numéro `71b` et `30 bis`, cités par le spec §A2 et greffés sur une rue
  réelle.
- **Message de commit** : en français, et il se termine par
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Ce que la lecture des données a établi avant d'écrire ce plan

Ces chaînes viennent de la base de production, lues en lecture seule le
5 septembre 2026. Elles servent de matériau à tous les tests.

**Adresses SIRET à préfixe, réelles :**

| Prospect | `prospect.address` |
|---|---|
| `EPB` | `BUREAU 3 2 PLACE JEAN V 44000 NANTES` |
| `IDEAL` | `PORTE 64 11 RUE FELIBIEN 44000 NANTES` |
| `MSA PLOMBERIE CHAUFFAGE ELECTRICITE` | `10E ETAGE PORTE A 8 RUE DE SAINT JEAN DE LUZ 44200 NANTES` |
| `ABDELGHANI HACINI (HA SERVICES ENERGIES)` | `ETAGE 1 APPT 59 5 RUE ANITA CONTI 44300 NANTES` |
| `KHALED KHLAIFI (KHLAIFI - TRANSPORT)` | `APPT 47 ETAGE 1 BAT LA RIVETIERE 4 RUE PIERRE BOUGUER 44300 NANTES` |
| `BELENOS (BELENOS SERRURERIE, BELENOS PLOMBERIE)` | `ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX 44300 NANTES` |
| `SARL ALLARD` | `5 RUE LE NOTRE 44000 NANTES` |
| `SARL THERET` | `9 AVENUE GENERAL MARCHAND 44000 NANTES` |
| `LEAT CHHUN (LC INSTALLATEUR THERMIQUE)` | `211 ROUTE DE SAINTE LUCE 44300 NANTES` |

**Les trois cas nommés par le spec, tels qu'ils sont réellement en base :**

- `SARL THERET`, statut **`not_found`**, adresse `9 AVENUE GENERAL MARCHAND
  44000 NANTES`. Son candidat le mieux noté après le premier est
  `C'est le Plombier`, adresse `9 Rue Kléber, 44000 Nantes`, catégorie
  `Plombier`, confiance 0,461. **Même numéro, même code postal, rue
  différente : il ne doit pas s'apparier.**
- `LEAT CHHUN (LC INSTALLATEUR THERMIQUE)`, statut **`not_found`**, adresse
  `211 ROUTE DE SAINTE LUCE 44300 NANTES`. Son candidat
  `Sésame Boulangerie-Pâtisserie`, adresse `211 Rte de Sainte-Luce, 44300
  Nantes`, catégorie **`Boulangerie`** (et non « Boulangerie-Pâtisserie », qui
  est le *nom* de la fiche), confiance 0,238. **L'adresse coïncide ; c'est la
  catégorie qui doit le rejeter.**
- `BELENOS (BELENOS SERRURERIE, BELENOS PLOMBERIE)`, adresse
  `ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX 44300 NANTES`, métier
  `plombier`. Candidat unique `Serrurier Nantes Bélénos`, adresse
  `1 Rue du Benelux, 44300 Nantes`, catégorie `Serrurier`, confiance **0,736**.

**Fait non prévu par le spec, à connaître avant la tâche 4.** BELENOS n'est pas
`not_found` : sa confiance de 0,736 dépasse `lowThreshold` (0,55), son unique
candidat est donc *retenu*, et l'absence de candidat au-dessus de
`highThreshold` rend le verdict **`ambiguous`**. Or A1 restreint la voie adresse
aux `not_found`. **Ce plan implémente A1 tel qu'approuvé : BELENOS restera
`ambiguous` et se tranchera par `prospeo review`, comme les neuf autres.**
Le spec dit que le cas BELENOS doit être « accepté » : il l'est au niveau où
l'affirmation porte — la voie adresse *retient* ce candidat (adresse identique,
catégorie « Serrurier » reconnue comme métier du bâtiment), ce que la tâche 4
prouve par un test dédié. Un second test prouve qu'un `ambiguous` n'est pas
dégradé pour autant. Ne « corrige » pas ce comportement de ta propre initiative :
étendre la voie aux `ambiguous` contredirait la première phrase de A1.

**Format des adresses Maps, observé :** `9 Rue Kléber, 44000 Nantes`,
`211 Rte de Sainte-Luce, 44300 Nantes`, `1 Rue du Benelux, 44300 Nantes`,
`41 Bd Michelet CS 22201, 44322 Nantes CEDEX 3`,
`ZA de la Distribution : Lot 12, 44200 Nantes, France`, et `null`.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `packages/core/src/trades.ts` | *modifié* — accueille `CATEGORIES_BATIMENT`, la donnée « métiers du bâtiment », à côté des `Trade` | 1 |
| `packages/core/src/trades.test.ts` | *modifié* — garde-fous sur cette liste | 1 |
| `packages/core/src/address-match.ts` | **créé** — normalisation d'une adresse postale, comparaison, test de catégorie bâtiment. Le voisin de `name-match.ts`, même forme | 2, 3 |
| `packages/core/src/address-match.test.ts` | **créé** — les pièges réels, cas par cas | 2, 3 |
| `packages/core/src/index.ts` | *modifié* — réexporte le nouveau module | 2 |
| `packages/core/src/matching.ts` | *modifié* — `MatchSubject.address`, la ligne `adresse`, la voie adresse dans `selectMatch`, `via` sur le verdict `ok` | 4 |
| `packages/core/src/matching.test.ts` | *modifié* — les quatre cas imposés par le spec §6 | 4 |
| `apps/collector/src/stages/enrich.ts` | *modifié* — passe l'adresse du prospect au sujet d'appariement | 5 |
| `apps/collector/src/stages/calibrate.ts` | *modifié* — rejoue avec l'adresse, distingue les fusions par voie adresse | 5 |
| `apps/collector/src/stages/calibrate.test.ts` | *modifié* — le rejeu gagne une fusion par l'adresse | 5 |
| `apps/collector/src/cli.ts` | *modifié* — lit `address`, affiche le récapitulatif à relire | 5 |
| `docs/design/HANDOFF.md` | *modifié* — consigne la mesure réelle et ce qu'elle a donné | 6 |

---

## Tâche 1 : la liste des métiers du bâtiment, à côté des `Trade`

**Fichiers :**
- Modifier : `packages/core/src/trades.ts`
- Test : `packages/core/src/trades.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit : `export const CATEGORIES_BATIMENT: readonly string[]` — des mots
  **déjà normalisés** (minuscules, sans accents, un seul mot chacun), destinés
  à une comparaison mot à mot avec un libellé de catégorie Google. La tâche 3
  s'en sert dans `estCategorieBatiment`.

**Pourquoi c'est une donnée et pas une constante cachée (spec A3) :** la liste
vit à côté des `Trade` parce qu'elle est du même ordre qu'eux — le jour où l'on
ajoute un métier, on regarde ce fichier. Elle est délibérément **plus large**
que l'union des `categoryLabels` : à l'adresse exacte, la question n'est plus
« est-ce le métier cherché ? » mais « est-ce *un* métier du bâtiment ? ».

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajoute à la fin de `packages/core/src/trades.test.ts` (et complète l'import en
tête du fichier avec `CATEGORIES_BATIMENT`) :

```ts
describe('CATEGORIES_BATIMENT', () => {
  it('contient les cinq métiers que le spec exige au minimum', () => {
    for (const metier of ['electricien', 'couvreur', 'macon', 'menuisier', 'chauffagiste']) {
      expect(CATEGORIES_BATIMENT).toContain(metier);
    }
  });

  it('couvre tous les libellés de catégorie des métiers configurés', () => {
    // La voie adresse ne doit jamais refuser ce que le score, lui, accepte
    // déjà comme confirmation du métier.
    for (const trade of TRADES) {
      for (const label of trade.categoryLabels) {
        expect(CATEGORIES_BATIMENT).toContain(label);
      }
    }
  });

  it('exclut « depannage », mauvais discriminant déjà identifié', () => {
    // Il qualifie autant l'électroménager que l'automobile : voir le
    // commentaire de `matchesCategory` dans matching.ts.
    expect(CATEGORIES_BATIMENT).not.toContain('depannage');
  });

  it('ne contient que des mots déjà normalisés, comparables tels quels', () => {
    // La comparaison se fait mot à mot contre un libellé Google normalisé :
    // une entrée accentuée ou composée n'y serait jamais retrouvée, et le
    // manque serait silencieux.
    for (const mot of CATEGORIES_BATIMENT) {
      expect(mot).toBe(mot.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
      expect(mot).not.toContain(' ');
      expect(mot).not.toBe('');
    }
  });
});
```

Vérifie l'en-tête du fichier de test : il doit importer `describe`, `expect`,
`it` depuis `vitest`, et `CATEGORIES_BATIMENT` ainsi que `TRADES` depuis
`./trades.js`.

- [ ] **Étape 2 : lancer les tests et vérifier l'échec**

Lance : `pnpm --filter @prospeo/core test`
Attendu : la suite échoue, `src/trades.test.ts` en rouge, sur une erreur de
compilation/exécution du type `CATEGORIES_BATIMENT is not exported` ou
`does not exist`. **Transcris la ligne d'erreur.** Si l'échec dit autre chose,
arrête-toi : le test ne mesure pas ce qu'on croit.

- [ ] **Étape 3 : écrire la liste**

Dans `packages/core/src/trades.ts`, juste **au-dessus** de
`export const TRADES`, ajoute :

```ts
/**
 * Les métiers du bâtiment, au sens de la voie adresse.
 *
 * **Une donnée, pas une constante cachée** (A3 du spec de l'appariement par
 * adresse). Elle vit ici, avec les `Trade`, parce qu'elle se relit et se
 * complète au même moment qu'eux.
 *
 * Elle est délibérément **plus large que l'union des `categoryLabels`** : à
 * l'adresse exacte, la question n'est plus « est-ce le métier cherché ? »
 * mais « est-ce *un* métier du bâtiment ? ». C'est ce qui sépare les deux cas
 * mesurés du 5 septembre 2026 : une boulangerie à l'adresse d'un plombier est
 * un autre commerce dans le même immeuble ; un artisan classé « Serrurier »
 * quand on cherchait un plombier est le bon artisan sous une étiquette
 * voisine — et l'artisan multi-métiers est la norme.
 *
 * Trois mots sont écartés exprès, parce qu'ils ne discriminent rien :
 * « depannage », qui qualifie aussi bien l'électroménager que l'automobile
 * (voir `matchesCategory`) ; « peinture », qui vaut pour un magasin ou une
 * carrosserie, quand « peintre » désigne bien un artisan ; « travaux », qui
 * n'est un métier de personne.
 *
 * Les entrées sont **déjà normalisées** — minuscules, sans accents, un seul
 * mot — parce qu'elles sont comparées mot à mot à un libellé Google lui aussi
 * réduit. Une entrée accentuée ne serait jamais retrouvée, et le manque
 * serait silencieux.
 */
export const CATEGORIES_BATIMENT: readonly string[] = [
  'plombier', 'plomberie', 'chauffagiste', 'chauffage', 'climatisation', 'sanitaire',
  'serrurier', 'serrurerie', 'metallier', 'metallerie',
  'electricien', 'electricite',
  'couvreur', 'couverture', 'zingueur', 'zinguerie',
  'macon', 'maconnerie',
  'menuisier', 'menuiserie', 'charpentier', 'charpente',
  'carreleur', 'carrelage', 'platrier', 'platrerie', 'plaquiste',
  'peintre', 'vitrier', 'vitrerie',
  'isolation', 'etancheite', 'ravalement', 'terrassement',
  'renovation', 'batiment',
];
```

- [ ] **Étape 4 : relancer et vérifier le vert**

Lance : `pnpm --filter @prospeo/core test`
Attendu : `src/trades.test.ts` vert, et le total du paquet passe de **209** à
**213 tests**, toujours sur 19 fichiers. Transcris les deux dernières lignes de
la sortie.

- [ ] **Étape 5 : prouver qu'une assertion sait échouer**

Retire temporairement `'couvreur'` de la liste, relance
`pnpm --filter @prospeo/core test`, **observe le rouge** sur
« contient les cinq métiers que le spec exige au minimum », transcris-le,
puis restaure et observe le vert. Une assertion dont on n'a pas vu le rouge
n'est pas une assertion.

- [ ] **Étape 6 : commit**

```bash
git add packages/core/src/trades.ts packages/core/src/trades.test.ts
git commit -m "$(cat <<'EOF'
feat(core): la liste des métiers du bâtiment, à côté des métiers

Elle sert la voie adresse : à l'adresse exacte, la question n'est plus « est-ce
le métier cherché ? » mais « est-ce un métier du bâtiment ? ». Plus large que
l'union des categoryLabels, et privée des mots qui ne discriminent rien.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tâche 2 : normaliser une adresse postale française

**Fichiers :**
- Créer : `packages/core/src/address-match.ts`
- Créer : `packages/core/src/address-match.test.ts`
- Modifier : `packages/core/src/index.ts`

**Interfaces :**
- Consomme : rien de la tâche 1.
- Produit :
  ```ts
  export interface AdressePostale {
    numero: string | null;
    motsVoie: string[];
    codePostal: string | null;
  }
  export function normaliserAdresse(brut: string | null): AdressePostale;
  ```
  La tâche 3 y ajoute `memeAdresse` et `estCategorieBatiment` ; la tâche 4 les
  appelle depuis `matching.ts`.

**Le piège qui a déjà coûté une mesure fausse (spec A2, HANDOFF) :** prendre
« le premier nombre » d'une adresse SIRET donne le bureau, l'étage ou
l'appartement, jamais la rue. `BUREAU 3 2 PLACE JEAN V` vaut 2, pas 3.
La règle retenue : **le numéro de voie est le nombre qui précède le type de
voie**, en tolérant un suffixe entre les deux.

- [ ] **Étape 1 : écrire le fichier de test**

Crée `packages/core/src/address-match.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { normaliserAdresse } from './address-match.js';

describe('normaliserAdresse — les préfixes avant le numéro de voie', () => {
  // Toutes ces chaînes sont des `prospect.address` réels, relevés le
  // 5 septembre 2026. Prendre « le premier nombre » rendrait ici le bureau,
  // l'étage ou l'appartement : c'est l'erreur qui a faussé la première mesure
  // de ce chantier.

  it('ignore un numéro de bureau', () => {
    expect(normaliserAdresse('BUREAU 3 2 PLACE JEAN V 44000 NANTES')).toEqual({
      numero: '2',
      motsVoie: ['jean', 'v'],
      codePostal: '44000',
    });
  });

  it('ignore un numéro de porte', () => {
    expect(normaliserAdresse('PORTE 64 11 RUE FELIBIEN 44000 NANTES')).toEqual({
      numero: '11',
      motsVoie: ['felibien'],
      codePostal: '44000',
    });
  });

  it('ignore un étage et un appartement enchaînés', () => {
    expect(normaliserAdresse('ETAGE 1 APPT 59 5 RUE ANITA CONTI 44300 NANTES')).toEqual({
      numero: '5',
      motsVoie: ['anita', 'conti'],
      codePostal: '44300',
    });
  });

  it('ignore un étage écrit « 10E » suivi d’une porte lettrée', () => {
    expect(
      normaliserAdresse('10E ETAGE PORTE A 8 RUE DE SAINT JEAN DE LUZ 44200 NANTES'),
    ).toEqual({
      numero: '8',
      motsVoie: ['saint', 'jean', 'luz'],
      codePostal: '44200',
    });
  });

  it('ignore un appartement, un étage et un bâtiment enchaînés', () => {
    expect(
      normaliserAdresse('APPT 47 ETAGE 1 BAT LA RIVETIERE 4 RUE PIERRE BOUGUER 44300 NANTES'),
    ).toEqual({
      numero: '4',
      motsVoie: ['pierre', 'bouguer'],
      codePostal: '44300',
    });
  });

  it('ignore un nom de zone d’activité, apostrophe comprise', () => {
    expect(
      normaliserAdresse("ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX 44300 NANTES"),
    ).toEqual({
      numero: '1',
      motsVoie: ['benelux'],
      codePostal: '44300',
    });
  });
});

describe('normaliserAdresse — les suffixes de numéro', () => {
  // Ces deux formes sont citées nommément par le spec §A2. La rue employée
  // est réelle ; le suffixe est greffé dessus, faute d’occurrence en base.

  it('rend le même numéro pour « 71 » et « 71B »', () => {
    expect(normaliserAdresse('71 RUE DU BENELUX 44300 NANTES').numero).toBe('71');
    expect(normaliserAdresse('71B RUE DU BENELUX 44300 NANTES').numero).toBe('71');
  });

  it('rend le même numéro pour « 30 BIS » et « 30 B »', () => {
    expect(normaliserAdresse('30 BIS RUE DU BENELUX 44300 NANTES').numero).toBe('30');
    expect(normaliserAdresse('30 B RUE DU BENELUX 44300 NANTES').numero).toBe('30');
  });
});

describe('normaliserAdresse — les abréviations et les mots-outils', () => {
  it('reconnaît « Rte » comme « ROUTE » et rend la même voie', () => {
    // Le type de voie ne porte aucune identité : il sert d’ancre, puis il
    // s’ignore. Chaîne Maps réelle contre chaîne SIRET réelle.
    expect(normaliserAdresse('211 Rte de Sainte-Luce, 44300 Nantes')).toEqual({
      numero: '211',
      motsVoie: ['sainte', 'luce'],
      codePostal: '44300',
    });
    expect(normaliserAdresse('211 ROUTE DE SAINTE LUCE 44300 NANTES')).toEqual({
      numero: '211',
      motsVoie: ['sainte', 'luce'],
      codePostal: '44300',
    });
  });

  it('retire les mots-outils, qui figurent dans presque toutes les adresses', () => {
    // Les laisser suffit à tout apparier avec tout.
    expect(normaliserAdresse('5 RUE LE NOTRE 44000 NANTES').motsVoie).toEqual(['notre']);
  });

  it('retire le code postal et tout ce qui le suit, nom de commune compris', () => {
    expect(normaliserAdresse('9 Rue Kléber, 44000 Nantes')).toEqual({
      numero: '9',
      motsVoie: ['kleber'],
      codePostal: '44000',
    });
    expect(normaliserAdresse('1 Rue du Benelux, 44300 Nantes, France').motsVoie).toEqual([
      'benelux',
    ]);
  });

  it('retient le dernier code postal quand un numéro de CS en imite un', () => {
    // Chaîne Maps réelle : « CS 22201 » précède le vrai code postal.
    expect(normaliserAdresse('41 Bd Michelet CS 22201, 44322 Nantes CEDEX 3').codePostal).toBe(
      '44322',
    );
  });
});

describe('normaliserAdresse — ce qu’elle refuse de deviner', () => {
  it('rend tout vide sur une adresse absente', () => {
    expect(normaliserAdresse(null)).toEqual({
      numero: null,
      motsVoie: [],
      codePostal: null,
    });
  });

  it('ne rend aucun numéro quand aucun type de voie n’ancre la lecture', () => {
    // Chaîne Maps réelle. « Lot 12 » n’est pas un numéro de rue, et rien ne
    // permet de le savoir : l’absence se nomme plutôt qu’elle ne se devine.
    const lue = normaliserAdresse('ZA de la Distribution : Lot 12, 44200 Nantes, France');
    expect(lue.numero).toBeNull();
    expect(lue.motsVoie).toEqual([]);
    expect(lue.codePostal).toBe('44200');
  });

  it('ne rend aucun numéro quand le type de voie n’est précédé d’aucun nombre', () => {
    const lue = normaliserAdresse('RUE DU BENELUX 44300 NANTES');
    expect(lue.numero).toBeNull();
    expect(lue.motsVoie).toEqual([]);
  });
});
```

- [ ] **Étape 2 : lancer les tests et vérifier l'échec**

Lance : `pnpm --filter @prospeo/core test`
Attendu : `src/address-match.test.ts` échoue à la résolution du module —
`Failed to resolve import "./address-match.js"`. Transcris la ligne.

- [ ] **Étape 3 : écrire le module**

Crée `packages/core/src/address-match.ts` :

```ts
/**
 * Comparaison d'adresses postales — la seconde voie de l'appariement.
 *
 * Le voisin de `name-match.ts`, et pour une raison précise : le nom vaut ~0
 * sur la population des artisans. Le SIRET dit `SARL ALLARD`, Google Maps
 * affiche `AB Plomberie` ; le nom légal et le nom commercial n'ont le plus
 * souvent rien à voir. L'adresse, elle, existe des deux côtés et ne ment pas —
 * et « même numéro, même rue, même code postal » est une preuve d'une autre
 * nature que « 300 mètres », surtout indépendante du nom.
 */

import { CATEGORIES_BATIMENT } from './trades.js';

export interface AdressePostale {
  /** Numéro de voie, suffixe retiré : « 71 » pour « 71b ». */
  numero: string | null;
  /** Mots de la voie, normalisés, type de voie et mots-outils retirés. */
  motsVoie: string[];
  /** Code postal à cinq chiffres. */
  codePostal: string | null;
}

/**
 * Types de voie, abréviations comprises.
 *
 * Ils jouent deux rôles à la fois, et c'est voulu : ils **ancrent** la lecture
 * — le numéro de voie est celui qui les précède, ce qui écarte les numéros de
 * bureau, d'étage et d'appartement — puis ils **s'effacent**, parce qu'un type
 * de voie ne porte aucune identité. `AVENUE` et `Av.` désignent la même chose,
 * et il ne faut pas que l'écriture décide.
 *
 * Conséquence assumée : `3 rue Victor Hugo` et `3 avenue Victor Hugo` dans le
 * même code postal se confondent. Le cas est rare, et le test de catégorie
 * puis la règle du doute (A3, A4) doivent encore tenir derrière.
 */
const TYPES_DE_VOIE = new Set([
  'rue', 'avenue', 'av', 'ave', 'boulevard', 'bd', 'bld', 'blvd',
  'place', 'pl', 'route', 'rte', 'chemin', 'chem',
  'impasse', 'imp', 'allee', 'allees', 'quai', 'cours',
  'square', 'passage', 'villa', 'venelle', 'esplanade', 'promenade',
  'parvis', 'faubourg', 'fbg', 'mail', 'sentier', 'voie', 'rond',
]);

/**
 * Mots-outils et articles, retirés de la voie.
 *
 * `DES`, `DE`, `DU`, `LA`, `ET` figurent dans presque toutes les adresses :
 * **les laisser dans la comparaison suffit à tout apparier avec tout.** C'est
 * exactement ce qui a produit la mesure fausse de l'investigation, où
 * `9 avenue Général Marchand` a été apparié à `9 rue Kléber`.
 */
const MOTS_OUTILS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'en', 'sur', 'sous',
]);

/**
 * Suffixes de numéro : `30 BIS` et `30 B` désignent le même immeuble que `30`.
 *
 * Les lettres isolées sont traitées à part, dans `numeroAvant` : les énumérer
 * ici reviendrait à écrire l'alphabet.
 */
const SUFFIXES_DE_NUMERO = new Set(['bis', 'ter', 'quater', 'quinquies']);

/**
 * Réduction d'un texte à des jetons comparables.
 *
 * `normalizeCompanyName` n'est **pas** réutilisée ici, bien qu'elle fasse
 * presque cela : elle retire les formes juridiques — `sa`, `sel`, `ei`, `ets` —
 * ce qui est une règle de raison sociale et n'a rien à faire dans une adresse,
 * où ces suites de lettres sont des mots de rue comme les autres.
 */
function reduire(valeur: string): string[] {
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((jeton) => jeton !== '');
}

/**
 * Le nombre qui précède l'ancre, en sautant un éventuel suffixe.
 *
 * On ne remonte que de deux jetons : au-delà, ce n'est plus le numéro de la
 * voie mais le numéro de quelque chose d'autre — précisément ce que cette
 * fonction existe pour ne pas ramasser.
 */
function numeroAvant(jetons: readonly string[], ancre: number): string | null {
  for (let index = ancre - 1; index >= 0 && ancre - index <= 2; index -= 1) {
    const jeton = jetons[index] ?? '';
    if (SUFFIXES_DE_NUMERO.has(jeton) || /^[a-z]$/.test(jeton)) continue;
    return /^(\d+)[a-z]?$/.exec(jeton)?.[1] ?? null;
  }
  return null;
}

/**
 * Lit une adresse écrite d'un côté ou de l'autre, et n'en garde que ce qui
 * identifie un point.
 *
 * Les deux côtés passent par ici, et c'est la condition pour que la
 * comparaison soit honnête : `211 ROUTE DE SAINTE LUCE 44300 NANTES` et
 * `211 Rte de Sainte-Luce, 44300 Nantes` doivent rendre la même chose.
 */
export function normaliserAdresse(brut: string | null): AdressePostale {
  const vide: AdressePostale = { numero: null, motsVoie: [], codePostal: null };
  if (brut === null) return vide;

  const jetons = reduire(brut);
  if (jetons.length === 0) return vide;

  // Le DERNIER groupe de cinq chiffres, et non le premier : une adresse Maps
  // porte volontiers un « CS 22201 » avant son vrai code postal, et c'est le
  // dernier qui est suivi du nom de commune.
  let iCodePostal = -1;
  for (let index = jetons.length - 1; index >= 0; index -= 1) {
    if (/^\d{5}$/.test(jetons[index] ?? '')) {
      iCodePostal = index;
      break;
    }
  }
  const codePostal = iCodePostal === -1 ? null : (jetons[iCodePostal] ?? null);
  const fin = iCodePostal === -1 ? jetons.length : iCodePostal;

  // L'ancre est le premier type de voie RÉELLEMENT PRÉCÉDÉ D'UN NUMÉRO. La
  // condition n'est pas décorative : « RESIDENCE LES ALLEES 12 RUE X » porte
  // deux types de voie, et seul le second ouvre la vraie adresse.
  let ancre = -1;
  let numero: string | null = null;
  for (let index = 0; index < fin; index += 1) {
    if (!TYPES_DE_VOIE.has(jetons[index] ?? '')) continue;
    const trouve = numeroAvant(jetons, index);
    if (trouve === null) continue;
    ancre = index;
    numero = trouve;
    break;
  }
  if (ancre === -1) return { numero: null, motsVoie: [], codePostal };

  const motsVoie = jetons.slice(ancre + 1, fin).filter((jeton) => !MOTS_OUTILS.has(jeton));
  return { numero, motsVoie, codePostal };
}
```

L'import de `CATEGORIES_BATIMENT` sert la tâche 3 ; s'il fait échouer le
`typecheck` en attendant (variable inutilisée), ajoute-le à la tâche 3 plutôt
qu'ici et retire-le maintenant.

- [ ] **Étape 4 : réexporter le module**

Dans `packages/core/src/index.ts`, ajoute la ligne juste après
`export * from './name-match.js';` :

```ts
export * from './address-match.js';
```

- [ ] **Étape 5 : lancer les tests et vérifier le vert**

Lance : `pnpm --filter @prospeo/core test`
Attendu : `src/address-match.test.ts` vert avec **14 tests**, et le total du
paquet passe à **227 tests / 20 fichiers**. Transcris les deux dernières
lignes.

Si un cas échoue, ne l'ajuste pas en modifiant l'attendu : c'est la
normalisation qui doit céder, pas la donnée réelle.

- [ ] **Étape 6 : prouver que la protection anti-préfixe sait échouer**

Remplace temporairement le corps de `numeroAvant` par
`return /^(\d+)[a-z]?$/.exec(jetons[0] ?? '')?.[1] ?? null;` — c'est-à-dire
« le premier nombre », l'erreur historique. Relance
`pnpm --filter @prospeo/core test`, **observe le rouge** sur les six tests de
préfixe, transcris-en un, puis restaure et observe le vert.

- [ ] **Étape 7 : typecheck**

Lance : `pnpm -r typecheck`
Attendu : vert sur les 8 paquets.

- [ ] **Étape 8 : commit**

```bash
git add packages/core/src/address-match.ts packages/core/src/address-match.test.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): lire une adresse postale sans se faire prendre au préfixe

Le numéro de voie est celui qui précède le type de voie, jamais « le premier
nombre » : BUREAU 3 2 PLACE JEAN V vaut 2. Le type de voie ancre la lecture
puis s'efface, les mots-outils et tout ce qui suit le code postal sont retirés.
Les cas de test sont des adresses réelles de la base.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tâche 3 : décider que deux adresses désignent le même point

**Fichiers :**
- Modifier : `packages/core/src/address-match.ts`
- Test : `packages/core/src/address-match.test.ts`

**Interfaces :**
- Consomme : `CATEGORIES_BATIMENT` (tâche 1), `normaliserAdresse` et
  `AdressePostale` (tâche 2).
- Produit :
  ```ts
  export function memeAdresse(siret: AdressePostale, maps: AdressePostale): boolean;
  export function estCategorieBatiment(categorie: string | null): boolean;
  ```
  **L'ordre des arguments de `memeAdresse` est significatif et non
  commutatif** : la relation testée est l'*inclusion* des mots de voie du côté
  Maps dans ceux du côté SIRET.

**Pourquoi l'inclusion et pas « un mot en commun » (spec A2) :** « un mot en
commun » a réellement apparié `9 avenue Général Marchand` à `9 rue Kléber`.
Et pourquoi l'inclusion plutôt que l'égalité : l'adresse SIRET porte souvent
des mots que Maps n'a pas — `ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX` face
à `1 Rue du Benelux` — alors que l'inverse ne se produit pas.

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajoute à `packages/core/src/address-match.test.ts` (et complète l'import de
tête avec `estCategorieBatiment` et `memeAdresse`) :

```ts
/** Raccourci de lecture : les deux côtés passent par la même normalisation. */
function meme(siret: string | null, maps: string | null): boolean {
  return memeAdresse(normaliserAdresse(siret), normaliserAdresse(maps));
}

describe('memeAdresse', () => {
  it('refuse « 9 avenue Général Marchand » face à « 9 rue Kléber »', () => {
    // Le faux positif que la première mesure de ce chantier a réellement
    // produit : même numéro, même code postal, deux rues sans rapport.
    expect(meme('9 AVENUE GENERAL MARCHAND 44000 NANTES', '9 Rue Kléber, 44000 Nantes')).toBe(
      false,
    );
  });

  it('accepte une adresse SIRET qui porte des mots en plus', () => {
    expect(
      meme("ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX 44300 NANTES", '1 Rue du Benelux, 44300 Nantes'),
    ).toBe(true);
  });

  it('refuse l’inclusion dans l’autre sens', () => {
    // La relation n'est pas symétrique, et c'est le cœur de la règle : des
    // mots en plus côté Maps sont des mots que le SIRET ne confirme pas.
    expect(
      meme('1 RUE DU BENELUX 44300 NANTES', "Zone Nant'Est Entreprises, 1 Rue du Benelux, 44300 Nantes"),
    ).toBe(false);
  });

  it('accepte l’adresse identique malgré l’abréviation du type de voie', () => {
    expect(meme('211 ROUTE DE SAINTE LUCE 44300 NANTES', '211 Rte de Sainte-Luce, 44300 Nantes')).toBe(
      true,
    );
  });

  it('refuse un code postal différent', () => {
    expect(meme('1 RUE DU BENELUX 44300 NANTES', '1 Rue du Benelux, 44000 Nantes')).toBe(false);
  });

  it('refuse un numéro différent', () => {
    expect(meme('1 RUE DU BENELUX 44300 NANTES', '3 Rue du Benelux, 44300 Nantes')).toBe(false);
  });

  it('refuse quand un numéro manque d’un côté', () => {
    expect(meme('RUE DU BENELUX 44300 NANTES', '1 Rue du Benelux, 44300 Nantes')).toBe(false);
    expect(meme('1 RUE DU BENELUX 44300 NANTES', 'Rue du Benelux, 44300 Nantes')).toBe(false);
  });

  it('refuse quand l’adresse Maps est absente', () => {
    expect(meme('1 RUE DU BENELUX 44300 NANTES', null)).toBe(false);
  });

  it('refuse quand la voie Maps ne porte aucun mot', () => {
    // Sans ce garde-fou, l'inclusion d'un ensemble vide serait toujours vraie
    // et n'importe quel numéro suffirait à apparier.
    expect(meme('1 RUE DU BENELUX 44300 NANTES', '1 Rue, 44300 Nantes')).toBe(false);
  });
});

describe('estCategorieBatiment', () => {
  it('accepte « Serrurier » quand on cherchait un plombier', () => {
    // Le cas BELENOS : enregistré « BELENOS SERRURERIE, BELENOS PLOMBERIE »,
    // classé « Serrurier » par Maps. L'artisan multi-métiers est la norme.
    expect(estCategorieBatiment('Serrurier')).toBe(true);
  });

  it('refuse « Boulangerie »', () => {
    // Le cas Sésame, à l'adresse exacte d'un installateur thermique : un autre
    // commerce dans le même immeuble.
    expect(estCategorieBatiment('Boulangerie')).toBe(false);
  });

  it('accepte les cinq métiers que le spec exige', () => {
    for (const libelle of ['Électricien', 'Couvreur', 'Maçon', 'Menuisier', 'Chauffagiste']) {
      expect(estCategorieBatiment(libelle)).toBe(true);
    }
  });

  it('accepte un libellé composé dont un mot seulement est un métier', () => {
    expect(estCategorieBatiment('Entreprise de rénovation')).toBe(true);
  });

  it('refuse les catégories réelles qui ne sont pas des métiers du bâtiment', () => {
    // Toutes relevées dans `prospect_enrichment.candidates`.
    for (const libelle of [
      'Santé',
      'Centre de formation',
      "Établissement d'enseignement professionnel",
      'Centre d’apprentissage',
    ]) {
      expect(estCategorieBatiment(libelle)).toBe(false);
    }
  });

  it('refuse « Dépannage », mauvais discriminant', () => {
    expect(estCategorieBatiment('Dépannage')).toBe(false);
  });

  it('refuse une catégorie absente', () => {
    expect(estCategorieBatiment(null)).toBe(false);
  });
});
```

- [ ] **Étape 2 : lancer les tests et vérifier l'échec**

Lance : `pnpm --filter @prospeo/core test`
Attendu : `src/address-match.test.ts` échoue sur des imports non exportés —
`memeAdresse` et `estCategorieBatiment`. Transcris la ligne.

- [ ] **Étape 3 : écrire les deux fonctions**

Ajoute à la fin de `packages/core/src/address-match.ts` (et assure-toi que
`import { CATEGORIES_BATIMENT } from './trades.js';` figure en tête) :

```ts
/**
 * Les deux adresses désignent-elles le même point ?
 *
 * **L'ordre des arguments compte.** La relation testée est l'*inclusion* des
 * mots de voie du côté Maps dans ceux du côté SIRET, et non l'égalité : le
 * SIRET porte souvent des mots que Maps n'a pas — une zone d'activité, un
 * bâtiment — alors que l'inverse ne se produit pas. Un mot en plus du côté
 * Maps est donc un mot que le SIRET ne confirme pas, et il fait échouer la
 * comparaison.
 *
 * « Un mot en commun » aurait été bien plus permissif, et c'est exactement ce
 * qui a apparié `9 avenue Général Marchand` à `9 rue Kléber` pendant
 * l'investigation.
 *
 * Une voie Maps sans aucun mot fait échouer aussi : l'inclusion d'un ensemble
 * vide est toujours vraie, et le numéro seul suffirait alors à apparier.
 */
export function memeAdresse(siret: AdressePostale, maps: AdressePostale): boolean {
  if (siret.numero === null || siret.numero !== maps.numero) return false;
  if (siret.codePostal === null || siret.codePostal !== maps.codePostal) return false;
  if (maps.motsVoie.length === 0) return false;
  const connus = new Set(siret.motsVoie);
  return maps.motsVoie.every((mot) => connus.has(mot));
}

/**
 * Le libellé de catégorie Google désigne-t-il **un** métier du bâtiment ?
 *
 * Distinct de `matchesCategory`, qui demande « est-ce le métier cherché ? » et
 * garde ce sens partout ailleurs. Cette lecture élargie ne vaut que dans la
 * voie adresse, où elle est adossée à une preuve forte — le même numéro, la
 * même rue, le même code postal. C'est ce qui sépare la boulangerie du même
 * immeuble, qui est un faux positif, du serrurier-plombier classé sous
 * l'étiquette voisine, qui est un faux négatif.
 *
 * La comparaison est **mot à mot** et non par inclusion de chaîne : « Magasin
 * de peinture » ne doit pas se ranger parmi les artisans du seul fait que ses
 * lettres contiennent un métier.
 */
export function estCategorieBatiment(categorie: string | null): boolean {
  if (categorie === null) return false;
  const mots = new Set(reduire(categorie));
  if (mots.size === 0) return false;
  return CATEGORIES_BATIMENT.some((metier) => mots.has(metier));
}
```

- [ ] **Étape 4 : lancer les tests et vérifier le vert**

Lance : `pnpm --filter @prospeo/core test`
Attendu : `src/address-match.test.ts` vert avec **30 tests**, total du paquet
**243 tests / 20 fichiers**. Transcris les deux dernières lignes.

- [ ] **Étape 5 : prouver que la règle d'inclusion sait échouer**

Remplace temporairement le `every` de `memeAdresse` par `some`, c'est-à-dire
« un mot en commun ». Relance `pnpm --filter @prospeo/core test`, **observe le
rouge** sur « refuse l'inclusion dans l'autre sens », transcris-le, restaure et
observe le vert.

Puis fais de même sur `estCategorieBatiment` : remplace `mots.has(metier)` par
une inclusion de chaîne sur le libellé entier, observe si un test rougit ;
s'il n'en rougit aucun, dis-le explicitement plutôt que de prétendre le
contraire — la garantie est alors seulement documentaire.

- [ ] **Étape 6 : typecheck**

Lance : `pnpm -r typecheck`
Attendu : vert sur les 8 paquets.

- [ ] **Étape 7 : commit**

```bash
git add packages/core/src/address-match.ts packages/core/src/address-match.test.ts
git commit -m "$(cat <<'EOF'
feat(core): comparer deux adresses par inclusion, et la catégorie par métier

memeAdresse exige l'inclusion des mots de voie côté Maps dans ceux du SIRET :
« un mot en commun » appariait 9 avenue Général Marchand à 9 rue Kléber.
estCategorieBatiment demande « un métier du bâtiment » et non « le métier
cherché » : c'est ce qui sépare la boulangerie du même immeuble du serrurier
qui est aussi plombier.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tâche 4 : la voie adresse dans l'appariement

**Fichiers :**
- Modifier : `packages/core/src/matching.ts`
- Test : `packages/core/src/matching.test.ts`

**Interfaces :**
- Consomme : `normaliserAdresse`, `memeAdresse`, `estCategorieBatiment`
  (tâches 2 et 3).
- Produit :
  ```ts
  interface MatchSubject { …; address: string | null; … }   // champ AJOUTÉ, requis
  interface MatchLine { code: 'nom' | 'distance' | 'categorie' | 'adresse'; … }
  interface MatchScore { …; sameAddress: boolean; addressMatch: boolean; }
  type MatchOutcome =
    | { kind: 'ok'; candidate: MapsCandidate; score: MatchScore;
        scored: ScoredCandidate[]; via: 'score' | 'adresse' }
    | { kind: 'ambiguous'; scored: ScoredCandidate[] }
    | { kind: 'not_found'; scored: ScoredCandidate[] };
  ```
  La tâche 5 consomme `MatchSubject.address` et `outcome.via`.

**Les quatre invariants à ne pas casser (spec A1) :** la voie adresse ne
transforme qu'un `not_found` en `ok` ; elle ne retire aucune fusion ; elle ne
dégrade aucun verdict ; elle n'envoie **rien** de neuf en revue.

**`address` est requis, pas optionnel.** Un champ facultatif se serait oublié
silencieusement chez un appelant, et la voie adresse aurait été inerte sans
que rien ne le dise. Les fixtures de test qui n'ont pas d'adresse écrivent
`address: null` — une absence qui se nomme.

- [ ] **Étape 1 : écrire les tests qui échouent**

Dans `packages/core/src/matching.test.ts` :

1. ajoute `address: '5 RUE LE NOTRE 44000 NANTES',` au `subject` de tête
   (c'est l'adresse réelle de `SARL ALLARD`, et elle ne coïncide avec aucune
   adresse de candidat des tests existants) ;
2. ajoute `address: null,` au `martinSubject` défini dans le corps des tests ;
3. ajoute à la fin du fichier :

```ts
describe('la voie adresse', () => {
  // Sujets et candidats relevés en base le 5 septembre 2026. Les adresses des
  // candidats forgés reprennent à la lettre la forme des adresses Maps
  // réelles : « 9 Rue Kléber, 44000 Nantes ».

  const theret: MatchSubject = {
    denomination: 'SARL THERET',
    denominationUsuelle: null,
    address: '9 AVENUE GENERAL MARCHAND 44000 NANTES',
    latitude: 47.2213,
    longitude: -1.5601,
  };

  const chhun: MatchSubject = {
    denomination: 'LEAT CHHUN',
    denominationUsuelle: 'LC INSTALLATEUR THERMIQUE',
    address: '211 ROUTE DE SAINTE LUCE 44300 NANTES',
    latitude: 47.2434,
    longitude: -1.5124,
  };

  it('ne fusionne pas deux rues différentes au même numéro', () => {
    // Le faux positif réel de l'investigation.
    const outcome = selectMatch(
      theret,
      [
        candidate({
          name: "C'est le Plombier",
          address: '9 Rue Kléber, 44000 Nantes',
          category: 'Plombier',
          latitude: 47.2136,
          longitude: -1.5471,
        }),
      ],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('not_found');
  });

  it('rejette la boulangerie à l’adresse exacte, et le dit', () => {
    const boulangerie = candidate({
      name: 'Sésame Boulangerie-Pâtisserie',
      address: '211 Rte de Sainte-Luce, 44300 Nantes',
      category: 'Boulangerie',
      latitude: 47.2434,
      longitude: -1.5124,
    });
    const score = scoreCandidate(chhun, boulangerie, plombier, MATCHING_CONFIG);
    expect(score.sameAddress).toBe(true);
    expect(score.addressMatch).toBe(false);
    expect(selectMatch(chhun, [boulangerie], plombier, MATCHING_CONFIG).kind).toBe('not_found');
  });

  it('retient un métier du bâtiment à l’adresse exacte, catégorie voisine comprise', () => {
    // Le cas BELENOS : SIRET « BELENOS SERRURERIE, BELENOS PLOMBERIE »,
    // fiche « Serrurier » à la même adresse, cherché comme plombier.
    const belenos: MatchSubject = {
      denomination: 'BELENOS',
      denominationUsuelle: 'BELENOS SERRURERIE, BELENOS PLOMBERIE',
      address: "ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX 44300 NANTES",
      latitude: 47.2539,
      longitude: -1.5003,
    };
    const fiche = candidate({
      name: 'Serrurier Nantes Bélénos',
      address: '1 Rue du Benelux, 44300 Nantes',
      category: 'Serrurier',
      latitude: 47.2539344,
      longitude: -1.5002896,
    });
    const score = scoreCandidate(belenos, fiche, plombier, MATCHING_CONFIG);
    expect(score.addressMatch).toBe(true);
    expect(score.lines.map((l) => l.code)).toContain('adresse');
  });

  it('transforme un introuvable en fusion, et le justifie', () => {
    const fiche = candidate({
      name: 'LC Installateur Thermique',
      address: '211 Rte de Sainte-Luce, 44300 Nantes',
      category: 'Chauffagiste',
      latitude: 47.2434,
      longitude: -1.5124,
    });
    const outcome = selectMatch(chhun, [fiche], plombier, MATCHING_CONFIG);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.via).toBe('adresse');
    expect(outcome.candidate.name).toBe('LC Installateur Thermique');
    const ligne = outcome.score.lines.find((l) => l.code === 'adresse');
    expect(ligne?.label).toContain('211 Rte de Sainte-Luce');
    // La voie adresse décide HORS du score : elle n'y ajoute aucun point.
    expect(ligne?.points).toBe(0);
    expect(outcome.score.confidence).toBeLessThan(MATCHING_CONFIG.highThreshold);
  });

  it('ne tranche pas entre deux candidats du bâtiment à la même adresse', () => {
    // A4 : le doute se constate tout seul et se retire, plutôt que d'aller
    // demander un arbitrage humain.
    const outcome = selectMatch(
      chhun,
      [
        candidate({
          name: 'LC Installateur Thermique',
          address: '211 Rte de Sainte-Luce, 44300 Nantes',
          category: 'Chauffagiste',
          latitude: 47.2434,
          longitude: -1.5124,
        }),
        candidate({
          name: 'Élec 44',
          address: '211 Rte de Sainte-Luce, 44300 Nantes',
          category: 'Électricien',
          latitude: 47.2434,
          longitude: -1.5124,
        }),
      ],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('not_found');
  });

  it('ne dégrade pas une fusion obtenue par le score', () => {
    const outcome = selectMatch(subject, [candidate()], plombier, MATCHING_CONFIG);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.via).toBe('score');
  });

  it('laisse un verdict à trancher tel quel, même à l’adresse exacte', () => {
    // BELENOS, réellement : sa confiance de 0,736 dépasse le seuil bas, son
    // unique candidat est donc retenu et le verdict est `ambiguous`. A1
    // interdit à la voie adresse d'y toucher — elle n'ajoute que des fusions
    // là où il n'y en avait aucune.
    const belenos: MatchSubject = {
      denomination: 'BELENOS',
      denominationUsuelle: 'BELENOS SERRURERIE, BELENOS PLOMBERIE',
      address: "ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX 44300 NANTES",
      latitude: 47.2539,
      longitude: -1.5003,
    };
    const outcome = selectMatch(
      belenos,
      [
        candidate({
          name: 'Serrurier Nantes Bélénos',
          address: '1 Rue du Benelux, 44300 Nantes',
          category: 'Serrurier',
          latitude: 47.2539344,
          longitude: -1.5002896,
        }),
      ],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('ambiguous');
  });

  it('ne pose aucune ligne d’adresse quand les adresses diffèrent', () => {
    const score = scoreCandidate(subject, candidate(), plombier, MATCHING_CONFIG);
    expect(score.sameAddress).toBe(false);
    expect(score.lines.map((l) => l.code)).toEqual(['nom', 'distance', 'categorie']);
  });
});
```

**Note sur le test « transforme un introuvable en fusion » :** vérifie en le
lançant que la confiance du candidat reste bien sous `lowThreshold` (0,55),
faute de quoi le verdict serait `ambiguous` et non `not_found`, et le test ne
prouverait pas ce qu'il annonce. Si `LC Installateur Thermique` face à
`LEAT CHHUN (LC INSTALLATEUR THERMIQUE)` note trop haut, remplace le nom du
candidat par un nom qui ne partage rien avec le sujet — par exemple
`Sanitherm Nantes` — et garde le reste.

- [ ] **Étape 2 : lancer les tests et vérifier l'échec**

Lance : `pnpm --filter @prospeo/core test`
Attendu : `src/matching.test.ts` échoue en compilation — `address` n'existe pas
sur `MatchSubject`, `sameAddress` n'existe pas sur `MatchScore`, `via` n'existe
pas sur le verdict. Transcris les lignes.

- [ ] **Étape 3 : modifier `matching.ts`**

Dans `packages/core/src/matching.ts` :

**(a)** ajoute l'import, sous les imports existants :

```ts
import { estCategorieBatiment, memeAdresse, normaliserAdresse } from './address-match.js';
```

**(b)** ajoute le champ à `MatchSubject`, entre `denominationUsuelle` et
`latitude` :

```ts
  /**
   * L'adresse déclarée à Sirene, code postal compris.
   *
   * Requise et non facultative : un champ optionnel se serait oublié chez un
   * appelant, et la voie adresse aurait été inerte sans que rien ne le dise.
   * `null` est une absence qui se nomme, et qui referme simplement la voie.
   */
  address: string | null;
```

**(c)** élargis le code de `MatchLine` :

```ts
export interface MatchLine {
  code: 'nom' | 'distance' | 'categorie' | 'adresse';
```

**(d)** ajoute les deux champs à `MatchScore`, après `categoryMatch` :

```ts
  /** Le numéro, la voie et le code postal coïncident des deux côtés. */
  sameAddress: boolean;
  /**
   * …et la catégorie Google est un métier du bâtiment : la voie adresse peut
   * trancher sur ce candidat. Implique toujours `sameAddress`.
   */
  addressMatch: boolean;
```

**(e)** ajoute `via` au verdict `ok` de `MatchOutcome` :

```ts
export type MatchOutcome =
  | {
      kind: 'ok';
      candidate: MapsCandidate;
      score: MatchScore;
      scored: ScoredCandidate[];
      /**
       * Ce qui a emporté la décision.
       *
       * Deux voies mènent à une fusion et elles ne se valent pas à la
       * relecture : `'score'` dit que le nom, la distance et la catégorie ont
       * franchi le seuil ; `'adresse'` dit que la confiance est restée basse
       * et que c'est l'adresse postale exacte, plus un métier du bâtiment,
       * qui a tranché. Un opérateur qui relit six mois plus tard doit pouvoir
       * les distinguer sans relire le code.
       */
      via: 'score' | 'adresse';
    }
  | { kind: 'ambiguous'; scored: ScoredCandidate[] }
  | { kind: 'not_found'; scored: ScoredCandidate[] };
```

**(f)** dans `scoreCandidate`, après le calcul de `categoryMatch`, ajoute :

```ts
  const adresseSujet = normaliserAdresse(subject.address);
  const adresseFiche = normaliserAdresse(candidate.address);
  const sameAddress = memeAdresse(adresseSujet, adresseFiche);
  const addressMatch = sameAddress && estCategorieBatiment(candidate.category);
```

**(g)** juste après la construction du tableau `lines`, ajoute :

```ts
  // La ligne n'apparaît que quand l'adresse coïncide : sur les 90 % de
  // candidats où elle ne dit rien, elle n'encombrerait que la trace. Elle
  // porte **zéro point**, et ce n'est pas un oubli — la voie adresse décide
  // à côté du score, jamais dedans. Lui donner un poids la ferait franchir
  // des seuils, donc produire des `ambiguous`, ce que A1 lui interdit
  // formellement : elle n'ajoute que des fusions, elle n'envoie rien en revue.
  if (sameAddress) {
    const fiche = candidate.address ?? '';
    lines.push({
      code: 'adresse',
      label: addressMatch
        ? `adresse identique « ${fiche} » — métier du bâtiment ✓`
        : `adresse identique « ${fiche} » — catégorie « ${candidate.category ?? 'absente'} » hors bâtiment ✗`,
      points: 0,
    });
  }
```

Le tableau `lines` doit donc être déclaré `const lines: MatchLine[] = [ … ];`
comme aujourd'hui — `push` fonctionne sur un `const`.

**(h)** ajoute les deux champs au retour de `scoreCandidate`, après
`categoryMatch,` :

```ts
    sameAddress,
    addressMatch,
```

**(i)** dans `selectMatch`, remplace la ligne
`if (retained.length === 0) return { kind: 'not_found', scored };` par :

```ts
  // La voie adresse — et **seulement ici**, dans la branche où le score n'a
  // rien retenu. Elle ne peut donc que transformer un `not_found` en `ok` :
  // elle ne retire aucune fusion, ne dégrade aucun verdict, et n'envoie rien
  // de neuf en revue (A1). Le nom vaut ~0 sur cette population, l'adresse
  // exacte est une preuve d'une autre nature — et indépendante du nom, qui
  // est précisément le signal défaillant.
  //
  // Elle regarde TOUS les candidats, y compris ceux que le rayon a écartés :
  // quand le numéro, la rue et le code postal coïncident, un désaccord de
  // coordonnées dit qu'un des deux géocodages est faux, pas que ce sont deux
  // entreprises. Le rayon, lui, ne bouge pas — le score reste ce qu'il est.
  if (retained.length === 0) {
    const aLAdresse = scored.filter((s) => s.score.addressMatch);
    // Deux artisans du bâtiment partageant un local produiraient deux
    // candidats également crédibles : choisir le premier serait choisir au
    // hasard. Le doute se constate tout seul et se retire (A4) — le
    // propriétaire ne veut pas arbitrer, et une file de revue transformerait
    // un gain en corvée.
    const seul = aLAdresse.length === 1 ? aLAdresse[0] : undefined;
    if (seul !== undefined) {
      return { kind: 'ok', candidate: seul.candidate, score: seul.score, scored, via: 'adresse' };
    }
    return { kind: 'not_found', scored };
  }
```

**(j)** dans la fusion par le score, ajoute `via` :

```ts
    return { kind: 'ok', candidate: only.candidate, score: only.score, scored, via: 'score' };
```

- [ ] **Étape 4 : lancer les tests et vérifier le vert**

Lance : `pnpm --filter @prospeo/core test`
Attendu : `src/matching.test.ts` vert, avec **8 tests de plus** qu'avant.
Total du paquet **251 tests / 20 fichiers**. Transcris les deux dernières
lignes.

Si un test *existant* de `matching.test.ts` rougit, ne le retouche pas sans
comprendre : la voie adresse ne doit rien changer à ce qui passait déjà.

- [ ] **Étape 5 : prouver que A4 sait échouer**

Remplace temporairement `aLAdresse.length === 1 ? aLAdresse[0] : undefined`
par `aLAdresse[0]` — c'est-à-dire « prendre le premier », l'arbitrage au
hasard. Relance `pnpm --filter @prospeo/core test`, **observe le rouge** sur
« ne tranche pas entre deux candidats du bâtiment à la même adresse »,
transcris-le, restaure, observe le vert.

Fais de même pour A1 : déplace temporairement le bloc de la voie adresse pour
qu'il s'applique aussi quand `confident.length === 0`, observe le rouge sur
« laisse un verdict à trancher tel quel », transcris, restaure.

- [ ] **Étape 6 : typecheck**

Lance : `pnpm -r typecheck`
Attendu : **rouge** sur `@prospeo/collector` — `enrich.ts` et `calibrate.ts`
construisent un `MatchSubject` sans `address`. C'est le résultat voulu : le
champ requis a fait son travail. Transcris les erreurs, elles sont la liste
des points à câbler en tâche 5.

- [ ] **Étape 7 : commit**

```bash
git add packages/core/src/matching.ts packages/core/src/matching.test.ts
git commit -m "$(cat <<'EOF'
feat(core): la voie adresse, qui n'ajoute que des fusions

Quand le score ne retient rien, un unique candidat à l'adresse postale exacte
et exerçant un métier du bâtiment emporte la fusion. Elle ne touche ni aux
verdicts `ok` ni aux `ambiguous`, n'ajoute aucun point au score, et se retire
dès que deux candidats se disputent l'adresse. Le verdict porte désormais la
voie qui l'a produit, et la justification une ligne « adresse ».

Le collector ne compile plus tant que `address` n'est pas câblé : c'est
l'effet recherché d'un champ requis.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tâche 5 : câbler le collector et rendre la mesure lisible

**Fichiers :**
- Modifier : `apps/collector/src/stages/enrich.ts:167-172`
- Modifier : `apps/collector/src/stages/calibrate.ts`
- Modifier : `apps/collector/src/cli.ts` (le `case 'calibrate'`, à partir de la
  ligne 809)
- Test : `apps/collector/src/stages/calibrate.test.ts`

**Interfaces :**
- Consomme : `MatchSubject.address` et `MatchOutcome.via` (tâche 4).
- Produit :
  ```ts
  interface StoredEnrichment { …; address: string | null; … }
  interface ReplayedOutcome { …; via: 'score' | 'adresse' | null; }
  interface ReplaySummary { …; fusionsParAdresse: number; }
  ```

**Ce que A5 exige :** `calibrate` doit **distinguer** les fusions gagnées par
la voie adresse de celles du score, et les donner à relire une par une avant
tout `--apply`. C'est la procédure qui a déjà servi au passage de 300 m à
1 000 m.

- [ ] **Étape 1 : écrire le test qui échoue**

Ouvre `apps/collector/src/stages/calibrate.test.ts`, repère la fabrique de
`StoredEnrichment` qui y sert de fixture, et **ajoute `address` à cette
fabrique** avec pour valeur par défaut `null` (les cas existants n'ont pas
d'adresse et n'en ont pas besoin). Puis ajoute à la fin du fichier :

```ts
describe('replayEnrichment — la voie adresse', () => {
  it('rejoue un introuvable en fusion quand une fiche du bâtiment est à l’adresse', () => {
    const row = ligneStockee({
      denomination: 'LEAT CHHUN',
      denominationUsuelle: 'LC INSTALLATEUR THERMIQUE',
      address: '211 ROUTE DE SAINTE LUCE 44300 NANTES',
      status: 'not_found',
      matchedName: null,
      candidates: [
        candidatStocke({
          name: 'Sanitherm Nantes',
          address: '211 Rte de Sainte-Luce, 44300 Nantes',
          category: 'Chauffagiste',
          latitude: 47.2434,
          longitude: -1.5124,
        }),
      ],
    });

    const replay = replayEnrichment(row, MATCHING_CONFIG);

    expect(replay.replayed?.status).toBe('ok');
    expect(replay.replayed?.via).toBe('adresse');
    expect(replay.replayed?.matchedName).toBe('Sanitherm Nantes');
    expect(replay.changed).toBe(true);
  });

  it('compte à part les fusions gagnées par la voie adresse', () => {
    const parAdresse = replayEnrichment(
      ligneStockee({
        denomination: 'LEAT CHHUN',
        denominationUsuelle: 'LC INSTALLATEUR THERMIQUE',
        address: '211 ROUTE DE SAINTE LUCE 44300 NANTES',
        status: 'not_found',
        matchedName: null,
        candidates: [
          candidatStocke({
            name: 'Sanitherm Nantes',
            address: '211 Rte de Sainte-Luce, 44300 Nantes',
            category: 'Chauffagiste',
            latitude: 47.2434,
            longitude: -1.5124,
          }),
        ],
      }),
      MATCHING_CONFIG,
    );

    const summary = summarizeReplays([parAdresse]);

    expect(summary.byStatus.ok).toBe(1);
    expect(summary.fusionsParAdresse).toBe(1);
  });

  it('propage la fusion par l’adresse à la ligne réécrite', () => {
    const row = ligneStockee({
      denomination: 'LEAT CHHUN',
      denominationUsuelle: 'LC INSTALLATEUR THERMIQUE',
      address: '211 ROUTE DE SAINTE LUCE 44300 NANTES',
      status: 'not_found',
      matchedName: null,
      candidates: [
        candidatStocke({
          name: 'Sanitherm Nantes',
          address: '211 Rte de Sainte-Luce, 44300 Nantes',
          category: 'Chauffagiste',
          phone: '02 40 00 00 00',
          latitude: 47.2434,
          longitude: -1.5124,
        }),
      ],
    });

    const ecrite = rewriteFromReplay(row, replayEnrichment(row, MATCHING_CONFIG));

    expect(ecrite?.status).toBe('ok');
    expect(ecrite?.matched_name).toBe('Sanitherm Nantes');
    // Le téléphone de la fiche retenue doit suivre : c'est tout l'objet de la
    // fusion, et c'est le numéro qui sera composé.
    expect(ecrite?.phone_e164).not.toBeNull();
  });
});
```

**Adapte les noms `ligneStockee` et `candidatStocke` aux fabriques réellement
présentes dans le fichier.** Si le fichier n'en a pas, écris-les en tête du
`describe` en recopiant la forme des fixtures existantes — n'invente aucun
champ, `StoredEnrichment` et `ReviewCandidate` disent lesquels sont requis.
Complète aussi l'import de tête avec `summarizeReplays` et `rewriteFromReplay`
s'ils n'y sont pas.

- [ ] **Étape 2 : lancer les tests et vérifier l'échec**

Lance : `pnpm --filter @prospeo/collector test`
Attendu : échec de compilation — `via` et `fusionsParAdresse` n'existent pas,
et `MatchSubject` réclame `address`. Transcris les lignes.

- [ ] **Étape 3 : câbler `enrich.ts`**

Dans `apps/collector/src/stages/enrich.ts`, dans `buildEnrichmentRow`, le
sujet devient :

```ts
  const subject: MatchSubject = {
    denomination: prospect.denomination,
    denominationUsuelle: prospect.denominationUsuelle,
    // `EnrichProspect.address` porte l'adresse Sirene complète, code postal
    // compris : c'est la matière de la voie adresse, et elle était jusqu'ici
    // lue pour composer les requêtes Google, puis jetée.
    address: prospect.address,
    latitude: prospect.latitude,
    longitude: prospect.longitude,
  };
```

Rien d'autre ne change dans ce fichier. En particulier, `match_confidence`
continue d'être écrit avec la confiance du score. **C'est délibéré :** sur une
fusion par l'adresse, cette confiance est réellement basse, et l'écrire à autre
chose serait annoncer un fait qu'aucun calcul ne rend vrai. Conséquence
assumée : la fiche du dashboard affichera un badge « alerte » sur ces
appariements — ce qui invite exactement à la relecture que A5 demande.

- [ ] **Étape 4 : câbler `calibrate.ts`**

Dans `apps/collector/src/stages/calibrate.ts` :

**(a)** ajoute le champ à `StoredEnrichment`, après `denominationUsuelle` :

```ts
  /** L'adresse Sirene, code postal compris : la matière de la voie adresse. */
  address: string | null;
```

**(b)** ajoute le champ à `ReplayedOutcome` :

```ts
  /**
   * Ce qui a emporté la fusion, `null` quand il n'y en a pas.
   *
   * A5 exige que la mesure distingue les fusions gagnées par la voie adresse
   * de celles du score : sans cette distinction, on ne saurait pas quoi
   * relire avant `--apply`.
   */
  via: 'score' | 'adresse' | null;
```

**(c)** dans `replayEnrichment`, complète le sujet et le résultat :

```ts
  const subject: MatchSubject = {
    denomination: row.denomination,
    denominationUsuelle: row.denominationUsuelle,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
  };
  const outcome = selectMatch(subject, row.candidates.map(toMapsCandidate), row.trade, config);
  const replayed: ReplayedOutcome = {
    status: outcome.kind,
    matchedName: outcome.kind === 'ok' ? outcome.candidate.name : null,
    via: outcome.kind === 'ok' ? outcome.via : null,
    scored: outcome.scored,
  };
```

**(d)** ajoute le compteur à `ReplaySummary`, après `byStatus` :

```ts
  /** Fusions que le score seul aurait refusées, et que l'adresse a emportées. */
  fusionsParAdresse: number;
```

**(e)** dans `summarizeReplays`, initialise-le à `0` dans l'objet `summary`, et
ajoute dans la boucle, juste après `summary.byStatus[replay.replayed.status] += 1;` :

```ts
    if (replay.replayed.via === 'adresse') summary.fusionsParAdresse += 1;
```

**(f)** `rewriteFromReplay` doit passer l'adresse à `buildEnrichmentRow`, sans
quoi la propagation produirait un verdict différent de celui qu'on vient de
mesurer :

```ts
      city: '',
      address: row.address ?? '',
```

en remplacement des deux lignes `city: '', address: '',` et de leur
commentaire, qu'il faut réécrire ainsi :

```ts
      // `city` ne sert qu'à composer les requêtes Google, et il n'en part
      // aucune ici. `address`, en revanche, décide désormais : la propager
      // est la condition pour que la réécriture produise EXACTEMENT le
      // verdict qui vient d'être mesuré.
```

- [ ] **Étape 5 : câbler `cli.ts`**

Dans `apps/collector/src/cli.ts`, `case 'calibrate'` :

**(a)** ajoute `address` à la jointure du `select` :

```ts
            'prospect_id, status, matched_name, candidates, decided_by, enriched_at, prospect!inner(denomination, denomination_usuelle, address, latitude, longitude, trade_slug)',
```

**(b)** ajoute le champ au `subjects.push`, après `denominationUsuelle` :

```ts
          address: p.address as string | null,
```

**(c)** dans la boucle d'affichage, marque le verdict obtenu par l'adresse.
Remplace le `process.stdout.write` du verdict par :

```ts
        process.stdout.write(
          `${replay.denomination}  [${verdict}]${replay.changed ? '  ⚠ verdict changé' : ''}` +
            `${replay.replayed.via === 'adresse' ? '  ← voie adresse' : ''}\n`,
        );
```

**(d)** dans le compte rendu final, ajoute la ligne de décompte juste après
celle des verdicts, à l'intérieur du même `process.stdout.write` :

```ts
          `  verdicts : ${summary.byStatus.ok} fusionnés, ${summary.byStatus.ambiguous} à trancher, ` +
          `${summary.byStatus.not_found} introuvables\n` +
          `  dont ${summary.fusionsParAdresse} fusions gagnées par la voie adresse\n` +
```

**(e)** ajoute, juste **avant** le bloc `if (argv.includes('--apply'))` du
compte rendu, le récapitulatif à relire :

```ts
      // A5 : rien ne s'applique sans que ces fusions-là aient été relues une
      // par une. Les lister à part est ce qui rend la relecture possible —
      // noyées dans 139 blocs, elles ne seraient pas relues.
      const gagnees = replays
        .map((replay, index) => ({ replay, subject: subjects[index] }))
        .filter(({ replay }) => replay.replayed?.via === 'adresse');
      if (gagnees.length > 0) {
        process.stdout.write('\n  Fusions gagnées par la voie adresse, à relire une par une :\n');
        for (const { replay, subject } of gagnees) {
          process.stdout.write(
            `    ${replay.denomination}  —  ${subject?.address ?? 'adresse inconnue'}\n` +
              `      → ${replay.replayed?.matchedName ?? 'aucune'}\n`,
          );
        }
      }
```

**(f)** dans l'aide (`USAGE`), à la section « Calibrer les seuils
d'appariement », ajoute après le paragraphe existant sur `--apply` :

```
  La voie adresse est comptée à part, et les fusions qu'elle gagne sont
  listées nommement : elles se relisent une par une AVANT --apply, comme
  l'ont été les quatre fusions du passage de 300 m à 1 000 m.
```

- [ ] **Étape 6 : lancer les tests et vérifier le vert**

Lance : `pnpm --filter @prospeo/collector test`
Attendu : `src/stages/calibrate.test.ts` vert avec **3 tests de plus**, total
du paquet **421 tests / 31 fichiers**. Transcris les deux dernières lignes.

Si un test d'`enrich.test.ts` rougit, regarde d'abord si sa fixture de prospect
porte une adresse qui coïncide par hasard avec celle d'un candidat : le verdict
aurait alors légitimement changé, et c'est la fixture qu'il faut rendre
explicite, pas la règle qu'il faut affaiblir.

- [ ] **Étape 7 : prouver que le câblage sait échouer**

Remets temporairement `address: ''` dans `rewriteFromReplay`, relance
`pnpm --filter @prospeo/collector test`, **observe le rouge** sur « propage la
fusion par l'adresse à la ligne réécrite », transcris-le, restaure, observe le
vert. C'est la preuve que la propagation dépend réellement de l'adresse.

- [ ] **Étape 8 : typecheck**

Lance : `pnpm -r typecheck`
Attendu : vert sur les 8 paquets.

- [ ] **Étape 9 : commit**

```bash
git add apps/collector/src/stages/enrich.ts apps/collector/src/stages/calibrate.ts apps/collector/src/stages/calibrate.test.ts apps/collector/src/cli.ts
git commit -m "$(cat <<'EOF'
feat(collector): l'adresse rejoint l'appariement, et calibrate la compte à part

enrich passe l'adresse Sirene au sujet, calibrate la relit et la propage, et le
compte rendu isole les fusions gagnées par la voie adresse pour qu'elles soient
relues une par une avant --apply.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tâche 6 : mesurer sur les 139 prospects, relire, puis appliquer

**Fichiers :**
- Modifier : `docs/design/HANDOFF.md` (section « L'appariement, mesuré le
  5 septembre 2026 »)
- Éventuellement : `packages/core/src/matching.test.ts` (une régression tirée
  d'une fusion réelle)

**Interfaces :** aucune. Cette tâche ne produit pas de code d'application.

**A5 est une règle, pas une formalité : rien ne s'applique sans mesure
préalable, et la mesure ne suffit pas — chaque fusion gagnée se relit à l'œil.**
Les bornes connues encadrent le résultat attendu : **17** prospects avaient un
candidat à l'adresse exacte sans aucun test de catégorie, **5** avec le test
strict du métier cherché. Le résultat de A3 est entre les deux, et **les deux
bornes sont sous-estimées** — elles ont été produites avec l'extraction naïve
du numéro que la tâche 2 corrige. Un résultat au-dessus de 17 n'est donc pas
une anomalie ; un résultat à 0 ou au-dessus de 40 en est une.

- [ ] **Étape 1 : la suite complète, avant de toucher à quoi que ce soit**

```bash
pnpm --filter @prospeo/core test
pnpm --filter @prospeo/collector test
pnpm --filter @prospeo/dashboard test
pnpm -r typecheck
```

Attendu : tout vert. Le dashboard doit être resté à **548 tests / 47
fichiers** — ce chantier ne le touche pas. Transcris les quatre résultats.

- [ ] **Étape 2 : mesurer, sans rien écrire**

Récupère l'UUID du propriétaire (il est requis par toutes les commandes ; il se
lit dans la table `app_user` ou dans l'historique de commandes du dépôt), puis :

```bash
pnpm --filter @prospeo/collector start calibrate --owner <uuid> > /tmp/calibrate-adresse.txt
```

Utilise le répertoire de brouillon de la session plutôt que `/tmp` si tu en as
un. **`calibrate` sans `--apply` n'écrit rien** : il lit la base, recalcule et
affiche.

Relève dans la sortie :
- le nombre de lignes rejouées et de verdicts changés ;
- la répartition `ok` / `ambiguous` / `not_found`, à comparer à **39 / 10 / 90** ;
- **`dont N fusions gagnées par la voie adresse`** ;
- le récapitulatif nominatif en fin de sortie.

- [ ] **Étape 3 : relire chaque fusion, une par une**

Pour **chacune** des fusions listées au récapitulatif, remonte à son bloc de
détail dans la sortie et vérifie trois choses :

1. l'adresse SIRET et l'adresse de la fiche désignent bien la même rue au même
   numéro — pas seulement le même numéro ;
2. la catégorie Google est bien un métier du bâtiment, et pas un commerce
   voisin qu'un mot de la liste aurait attrapé par accident ;
3. le nom de la fiche est plausible pour cette entreprise — même s'il n'a rien
   à voir avec la raison sociale, ce qui est le cas normal et tout l'objet du
   chantier.

**Une seule fusion douteuse suffit à arrêter `--apply`.** Le prix d'une fusion
fausse n'est pas celui d'un appariement manqué : c'est un site publié au nom de
la mauvaise entreprise, et un appel perdu. Si un cas douteux apparaît, rapporte
lequel et pourquoi, et propose le resserrement — le plus probable étant un mot
de trop dans `CATEGORIES_BATIMENT`.

- [ ] **Étape 4 : présenter le résultat au propriétaire, et attendre**

Écris-lui, en une dizaine de lignes : le nombre de fusions gagnées, la
répartition avant/après, la liste nominative avec les deux adresses de chaque
paire, et ta conclusion de relecture. **Ne lance pas `--apply` sans son
accord** : la commande réécrit des lignes de la base de production, et il n'y a
pas d'environnement de recette.

- [ ] **Étape 5 : appliquer, sur accord seulement**

```bash
pnpm --filter @prospeo/collector start calibrate --owner <uuid> --apply
```

Vérifie dans la sortie : `appliqué : N verdicts réécrits`, et le décompte des
lignes protégées parce que tranchées par un humain. Un `en échec d'écriture`
non nul se rapporte tel quel, il ne se tait pas.

- [ ] **Étape 6 : figer une fusion réelle en test de régression**

Choisis **une** des fusions gagnées et écris-en le test dans
`packages/core/src/matching.test.ts`, avec les vraies chaînes — dénomination,
adresse SIRET, nom de fiche, adresse de fiche, catégorie — dans le `describe`
« la voie adresse ». Un cas réel vaut mieux que le cas forgé de la tâche 4, et
il protège la règle contre un resserrement futur qui le reperdrait.

S'il n'y a eu **aucune** fusion, n'invente rien : écris-le dans le HANDOFF, et
dis-le au propriétaire. C'est un résultat, et il vaut mieux que du bruit.

Relance `pnpm --filter @prospeo/core test` et transcris le vert.

- [ ] **Étape 7 : consigner la mesure dans le HANDOFF**

Dans `docs/design/HANDOFF.md`, sous la section « L'appariement, mesuré le
5 septembre 2026 », ajoute une sous-section à la suite de « Ce qui reste à
faire, et n'est pas fait » :

```markdown
### Résolu — la voie adresse, livrée et mesurée le 5 septembre 2026

`packages/core/src/address-match.ts` ajoute une seconde voie de décision : à
l'adresse postale exacte (même numéro, même voie, même code postal) et pour
une catégorie Google qui est **un** métier du bâtiment, un candidat unique
emporte la fusion. Elle ne transforme qu'un `not_found` en `ok` — elle ne
dégrade aucun verdict et n'alimente pas la file de revue.

**Mesuré par `calibrate` sur les 139 prospects, sans une requête Google :
<N> fusions gagnées**, relues une par une avant `--apply`. La répartition
passe de 39 / 10 / 90 à <ok> / <ambiguous> / <not_found>.

Ce que cette voie **ne** résout **pas**, et qu'il ne faut pas croire réglé :

- **`BELENOS` reste `ambiguous`.** Son unique candidat note 0,736, au-dessus
  du seuil bas : le verdict n'est pas `not_found`, et la voie adresse n'y
  touche pas par construction. Il se tranche par `prospeo review`, comme les
  neuf autres. Le spec citait ce cas comme justification de la lecture
  élargie de la catégorie ; la lecture élargie le retient bien, c'est le
  statut de départ qui n'était pas celui qu'on croyait.
- **Les prospects sans candidat à leur adresse ne bougent pas** : pour eux,
  l'adresse Sirene est le domicile du gérant ou le cabinet comptable.
- **Deux risques restent ouverts et non couverts** : un second artisan du
  bâtiment à la même adresse dont un seul figure parmi les candidats (A4 ne
  le voit pas, il n'y a qu'un candidat) ; et une adresse de comptable
  partagée par plusieurs entreprises clientes.
- **La confiance écrite sur une fusion par l'adresse est celle du score, et
  elle est basse.** C'est voulu : la voie adresse décide à côté du score,
  pas dedans. La fiche du dashboard affiche donc un badge « alerte » sur ces
  appariements — ce qui est une invitation à la relecture, pas un défaut.
```

Remplace `<N>`, `<ok>`, `<ambiguous>` et `<not_found>` par les nombres
réellement lus. **N'écris aucun de ces nombres avant de les avoir lus dans la
sortie de `calibrate`.**

- [ ] **Étape 8 : commit**

```bash
git add docs/design/HANDOFF.md packages/core/src/matching.test.ts
git commit -m "$(cat <<'EOF'
docs(handoff): la voie adresse, mesurée sur les 139 prospects

Le nombre de fusions gagnées, ce que la voie ne résout pas, et pourquoi
BELENOS reste à trancher en revue malgré la lecture élargie de la catégorie.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Relecture du plan contre le spec

**Couverture des décisions.**

| Décision | Où elle est implémentée | Où elle est prouvée |
|---|---|---|
| A1 — la voie n'ajoute que des fusions | tâche 4, étape 3(i) : la voie ne vit que dans la branche `retained.length === 0` | tâche 4, étape 1 : « ne dégrade pas une fusion obtenue par le score », « laisse un verdict à trancher tel quel » ; étape 5, mutation |
| A2 — l'adresse se compare après normalisation | tâches 2 et 3 | tâche 2, 14 tests sur chaînes réelles ; tâche 3, 9 tests dont Général Marchand / Kléber |
| A2, piège 1 — préfixes | tâche 2, `numeroAvant` | 6 tests sur `prospect.address` réels ; mutation à l'étape 6 |
| A2, piège 2 — suffixes `71b`, `30 bis` | tâche 2, `SUFFIXES_DE_NUMERO` + regex | 2 tests |
| A2, piège 3 — abréviations de type de voie | tâche 2, `TYPES_DE_VOIE` | test « Rte » / « ROUTE » |
| A2, piège 4 — mots-outils et commune | tâche 2, `MOTS_OUTILS` + coupe au code postal | 3 tests |
| A3 — « un métier du bâtiment » | tâche 1 (la donnée), tâche 3 (`estCategorieBatiment`) | 4 tests en tâche 1, 7 en tâche 3, dont Boulangerie et Serrurier |
| A3 — portée bornée, `matchesCategory` inchangée | tâche 4 : `matchesCategory` n'est pas touchée ; la lecture élargie n'est appelée que depuis `addressMatch` | les tests existants de `matching.test.ts` restent verts |
| A4 — deux candidats, aucune fusion | tâche 4, étape 3(i) | tâche 4 : « ne tranche pas entre deux candidats » ; mutation à l'étape 5 |
| A5 — rien sans mesure préalable | tâche 5 (le décompte et le récapitulatif), tâche 6 (la mesure, la relecture, l'accord) | tâche 5 : « compte à part les fusions gagnées » |
| A6 — la justification porte la voie | tâche 4, étapes 3(c) et 3(g) | tâche 4 : `lines.map(l => l.code)` contient `'adresse'`, et le libellé porte l'adresse de la fiche |
| §4 — ce qui ne change pas | aucune tâche ne touche `MATCHING_CONFIG`, `matchesCategory`, `nameVariants`, `bestNameMatch`, ni le statut `ambiguous` | — |
| §6 — les quatre cas de test imposés | tâches 3 et 4 | les quatre y sont, nommément |
| §7 — hors périmètre | aucune migration, aucun écran, aucun rescraping ; le rayon, les poids et les seuils ne sont pas touchés | — |

**Deux points que le spec ne tranchait pas, et que ce plan tranche
explicitement**, avec leur raison écrite dans le code :

1. **La voie adresse regarde tous les candidats, y compris ceux que le rayon a
   écartés** (tâche 4, étape 3(i)). Quand le numéro, la rue et le code postal
   coïncident, un désaccord de coordonnées dit qu'un géocodage est faux, pas
   que ce sont deux entreprises. Le rayon lui-même ne bouge pas, le score reste
   intact : §2 du spec est respecté.
2. **La ligne `adresse` porte zéro point et la confiance n'est pas gonflée**
   (tâche 4, étape 3(g)). Lui donner un poids la ferait franchir des seuils,
   donc produire des `ambiguous` — ce que A1 lui interdit. Conséquence assumée
   et documentée : le dashboard affichera une confiance basse sur ces fusions.

**Un fait découvert avant l'écriture du plan, et qui ne se corrige pas de sa
propre initiative :** `BELENOS` est `ambiguous`, non `not_found`. A1 l'exclut
donc du périmètre. Le comportement est testé, documenté dans le HANDOFF, et
rapporté au propriétaire — à lui de décider s'il veut un chantier suivant qui
étende la voie aux `ambiguous`.
