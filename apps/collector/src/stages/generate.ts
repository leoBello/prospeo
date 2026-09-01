import {
  composerContenuPublie,
  PALETTES,
  PALETTES_DECRITES,
  TYPOS,
  TYPOS_DECRITES,
  REDACTION_LIMITS,
  siteRedactionSchema,
  SITE_CONTENT_VERSION,
  verifierCoherence,
  type ContenuPublie,
  type SiteFacts,
  type SiteRedaction,
  type Trade,
} from '@prospeo/core';

/**
 * Version des consignes.
 *
 * Même doctrine que `MATCHING_CONFIG.version` et `SCORING_RULESET.version` :
 * un changement de prompt doit être traçable, parce qu'un contenu relu dans
 * six mois doit dire sous quelles règles il a été écrit. Toute modification du
 * texte ci-dessous impose de l'incrémenter.
 */
export const PROMPT_VERSION = 'v4';

/** Modèle retenu par le plan (tâche 2). */
export const MODEL = 'claude-opus-4-8';

/**
 * Les consignes — la partie STABLE du prompt, identique d'un prospect à
 * l'autre pour un même métier.
 *
 * C'est cette stabilité qui rend la mise en cache du préfixe possible : les
 * consignes forment l'essentiel des jetons d'entrée, et les faits du prospect,
 * qui tiennent en dix lignes, passent après le point de césure. Un seul nom
 * d'entreprise glissé ici invaliderait le cache à chaque appel —
 * silencieusement, puisque la réponse resterait correcte et que seule la
 * facture bougerait.
 *
 * La liste des prestations en fait partie : elle varie par métier, pas par
 * prospect. On obtient donc une entrée de cache par métier, ce qui convient
 * exactement à la façon dont les lots sont traités.
 *
 * **Le passage qui compte est celui qui énonce ce que le modèle IGNORE.** Le
 * §10 du spec du socle le dit : « un modèle à qui l'on ne dit pas ce qu'il
 * ignore comble les trous : c'est son métier. » Lui donner la liste des faits
 * disponibles ne suffit pas — il faut lui nommer les rubriques qu'une vitrine
 * d'artisan comporte d'ordinaire et sur lesquelles la base ne sait rien.
 */
export function consignes(trade: Trade): string {
  const prestations = trade.prestations
    .map((p) => `  - ${p.code} : ${p.label} — ${p.description}`)
    .join('\n');
  // Les trois listes closes du thème (D6), chacune décrite. Un jeton nu ferait
  // choisir le modèle au hasard ; la description transforme le tirage en choix.
  const palettes = PALETTES.map((c) => `  - ${c} : ${PALETTES_DECRITES[c]}`).join('\n');
  const typos = TYPOS.map((c) => `  - ${c} : ${TYPOS_DECRITES[c]}`).join('\n');
  const heros = trade.heros.map((h) => `  - ${h.code} : ${h.sujet}`).join('\n');

  return `Tu rédiges le contenu d'un site vitrine pour un artisan ${trade.label.toLowerCase()} en France.

RÈGLE ABSOLUE — N'INVENTE RIEN.
Tu ne disposes que des faits qui te seront donnés dans le message suivant.
Tout ce qui n'y figure pas, tu l'ignores, et tu ne dois ni le supposer, ni le
suggérer, ni le contourner par une formule vague.

Ce site sera publié sous le nom d'une entreprise réelle qui ne l'a pas
commandé. Un détail inventé engage la réputation de cette entreprise, et il
sera démenti par son premier client.

CE QUE TU NE SAIS PAS, ET QUE TU NE DOIS DONC JAMAIS ÉCRIRE :
  - les horaires d'ouverture, et la disponibilité (pas de « 24h/24 », pas de
    « 7j/7 », pas de « astreinte ») ;
  - les délais d'intervention (pas de « en 30 minutes », pas de
    « intervention rapide », pas de « en urgence ») ;
  - les certifications, labels et qualifications (pas de « RGE », pas de
    « certifié », pas de « agréé », pas de « assuré décennale ») ;
  - les tarifs, les devis et la gratuité (pas de « devis gratuit », pas de
    « prix attractifs ») ;
  - le nombre d'avis, de clients ou de chantiers réalisés ;
  - l'effectif, la taille de l'équipe, le nombre de salariés ;
  - LA CLIENTÈLE : particuliers, professionnels, syndics, collectivités. La
    base ne sait pas pour qui cette entreprise travaille. Écris ce qu'elle
    fait, jamais pour qui elle le fait ;
  - la zone d'intervention au-delà de la ville qui te sera donnée (pas de
    « et alentours », pas de rayon en kilomètres, pas de département) ;
  - les garanties, la satisfaction client, et tout superlatif invérifiable
    (« leader », « n°1 », « meilleur », « expert reconnu »).

N'ÉCRIS AUCUN CHIFFRE qui ne figure pas dans les faits donnés. Une année, une
note ou un numéro de téléphone que tu inventerais seront détectés et la
génération sera rejetée.

CE QUE LA PAGE AFFICHE DEJA, ET QUE TU NE DOIS DONC PAS REPETER
La page est composee dans cet ordre, et tout ce qui suit y figure SANS que tu
aies a l'ecrire :

  1. une ligne « <Metier> a <Ville> depuis <annee> », composee automatiquement ;
  2. le nom de l'entreprise, en gros titre ;
  3. TON ACCROCHE ;
  4. la note Google, si elle est connue ;
  5. le bouton d'appel avec le numero ;
  6. TA PRESENTATION ;
  7. les prestations que tu as retenues, chacune avec son titre et sa
     description, en cartes.

Repeter l'un de ces elements dans ton texte donne une page qui se redit deux
fois en trois centimetres.

CE QUE TU PRODUIS — trois champs, et rien d'autre :

1. accroche
   Une phrase de ${REDACTION_LIMITS.accroche.min} a ${REDACTION_LIMITS.accroche.max} caracteres, affichee entre le nom de
   l'entreprise et la note.

   NE REPETE NI LE METIER NI LA VILLE : ils sont ecrits juste au-dessus. Une
   accroche qui commence par « Plombier a Nantes » redit mot pour mot la ligne
   precedente — et elle serait de surcroit IDENTIQUE sur tous les sites du
   meme metier dans la meme ville, puisque rien d'autre n'y varierait.

   Dis plutot, concretement, ce que l'artisan prend en charge, en t'appuyant
   sur les prestations que tu as retenues. Pas de point final.

2. presentation
   Un paragraphe de ${REDACTION_LIMITS.presentation.min} a ${REDACTION_LIMITS.presentation.max} caracteres, au vouvoiement.

   N'ENUMERE PAS LES PRESTATIONS : elles sont affichees juste en dessous, avec
   leur description. Les lister ici fait lire deux fois la meme chose.

   Ce paragraphe sert a SITUER l'entreprise. Les seuls appuis dont tu disposes
   sont : l'annee de creation quand elle t'est donnee — c'est le fait le plus
   fort de tous, surtout s'il est ancien —, la ville, et le fait qu'on joigne
   l'artisan directement au telephone, ce qui est vrai puisque son numero est
   sur la page. Emploie l'annee TELLE QUELLE (« depuis 2009 »), jamais
   convertie en duree : le texte restera en ligne plusieurs annees.

   Si ces appuis ne suffisent pas a remplir le paragraphe sans te repeter,
   fais-le plus court plutot que de le gonfler.

3. prestations
   Entre ${REDACTION_LIMITS.prestations.min} et ${REDACTION_LIMITS.prestations.max} codes CHOISIS dans la liste ci-dessous,
   sans doublon, classés du plus courant au moins courant pour ce métier. Tu
   ne rédiges pas leur libellé : tu ne renvoies que les codes.

${prestations}

4. theme
   TROIS jetons a CHOISIR dans les trois listes closes ci-dessous. Tu ne
   decris pas une apparence et tu n'inventes aucune couleur : tu selectionnes,
   exactement comme pour les prestations.

   Ces listes existent parce que le site est deja dessine. Les couleurs sont
   verifiees au contraste, les polices sont dans le depot, les images sont
   deja la. Un jeton hors liste fait echouer la generation.

   palette — le jeu de couleurs de la page :
${palettes}

   typo — l'appariement de polices :
${typos}

   heros — la photographie qui ouvre la page, en pleine largeur :
${heros}

   COMMENT CHOISIR. Accorde les trois a ce que tu viens d'ecrire et au
   caractere de cette entreprise-ci : son nom, et les prestations que tu as
   retenues. Une entreprise dont tu as mis le depannage en tete n'appelle pas
   la meme ouverture qu'une entreprise dont tu as mis la renovation de salle
   de bain.

   NE PRENDS PAS SYSTEMATIQUEMENT LE PREMIER DE CHAQUE LISTE. Ces sites sont
   envoyes a des artisans du meme metier dans la meme ville, parfois la meme
   semaine. Deux pages identiques recues par deux voisins detruisent
   l'argumentaire — qui est « voici VOTRE site », pas « voici un site ».
   L'ordre des listes n'exprime aucune preference.

TON
Sobre et factuel. Un artisan qui lit ce texte doit s'y reconnaître, et un
client doit comprendre en dix secondes ce qu'on fait et comment appeler.
Évite le vocabulaire d'agence : « solutions », « accompagnement »,
« sur-mesure », « à l'écoute de vos besoins ».`;
}

/**
 * Les faits d'un prospect — la partie VOLATILE du prompt, après le point de
 * césure du cache.
 *
 * **Un fait absent ne produit aucune ligne.** Écrire « note Google : non
 * renseignée » serait une invitation : le modèle voit la rubrique, la juge
 * attendue, et la comble. Ce que la base ignore ne doit pas apparaître du
 * tout — pas même en creux.
 *
 * Le SIRET et la raison sociale n'y figurent pas : ils ne servent qu'aux
 * mentions légales, où le code les recopie. Les donner ici inviterait le
 * modèle à les employer dans sa prose, alors que « SOULEYMANE DOSSO » est un
 * état civil et que l'artisan se présente comme « Dos-Services ».
 */
export function factsMessage(faits: SiteFacts): string {
  const lignes = [
    `Nom commercial : ${faits.nomAffiche}`,
    `Métier : ${faits.metier.label}`,
    `Ville : ${faits.adresse.ville}`,
  ];
  if (faits.anneeCreation !== null) {
    lignes.push(`Année de création de l'entreprise : ${faits.anneeCreation}`);
  }
  if (faits.noteGoogle !== null) {
    lignes.push(`Note Google : ${faits.noteGoogle.toLocaleString('fr-FR')} sur 5`);
  }
  return `Voici les seuls faits connus sur cette entreprise.\n\n${lignes.join('\n')}`;
}

/**
 * Ce que coûte un appel, en jetons.
 *
 * Quatre compteurs et non trois, parce que les quatre sont facturés à des
 * tarifs différents — mesurés sur la grille Opus 4.8 : 5 $/MTok en entrée,
 * 6,25 $ pour une écriture de cache (1,25x), 0,50 $ pour une lecture (0,1x),
 * 25 $ en sortie.
 *
 * La première version fusionnait l'écriture du cache avec l'entrée ordinaire.
 * L'écart est faible sur un appel, mais il porte précisément sur le PREMIER
 * appel d'un lot — celui qu'on regarde pour décider si la mise en cache vaut
 * le coup. Sous-estimer le surcoût d'entrée fausse exactement la décision
 * qu'on cherche à prendre.
 */
export interface Usage {
  /** Entrée facturée au tarif de base. */
  input: number;
  /** Constitution du cache, facturée 1,25x l'entrée. */
  cacheWrite: number;
  /** Lecture depuis le cache, facturée 0,1x l'entrée. */
  cacheRead: number;
  output: number;
}

export interface GenerateDeps {
  /**
   * Un appel au modèle. Injecté pour que tout l'étage s'éprouve hors ligne,
   * et pour que le branchement au SDK reste un détail remplaçable.
   */
  rediger(
    systeme: string,
    utilisateur: string,
  ): Promise<{ redaction: unknown; usage: Usage }>;
}

export interface GenerateInput {
  prospectId: string;
  faits: SiteFacts;
  trade: Trade;
}

export interface GenerateReport {
  generated: number;
  /** Réponses refusées : hors contrat, ou avançant un fait que la base ignore. */
  rejected: number;
  /** Pannes d'appel : réseau, 429, 5xx. */
  failed: number;
  usage: Usage;
}

export interface GenerateResult {
  contenus: { prospectId: string; contenu: ContenuPublie }[];
  report: GenerateReport;
}

/**
 * Génère le contenu d'un lot de prospects.
 *
 * Deux filtres successifs, et aucun ne rattrape : ils rejettent.
 *
 * 1. `siteRedactionSchema` — la réponse a-t-elle la forme convenue ? Trois
 *    champs, des codes de prestation connus, des longueurs tenues.
 * 2. `verifierCoherence` — la prose avance-t-elle un chiffre que les faits ne
 *    portent pas ? C'est ici que « depuis 2005 » sur une entreprise créée en
 *    2009 est arrêté, avant que rien ne soit écrit nulle part.
 *
 * Le §4 du plan veut « un échec franc, pas un contenu approximatif qu'on
 * rattrape à la main ». Régénérer coûte un appel ; relire vingt-deux textes en
 * cherchant l'inexactitude coûte l'après-midi, et on en laisse passer une.
 */
export async function runGenerate(
  inputs: readonly GenerateInput[],
  deps: GenerateDeps,
): Promise<GenerateResult> {
  const contenus: GenerateResult['contenus'] = [];
  const report: GenerateReport = {
    generated: 0,
    rejected: 0,
    failed: 0,
    usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
  };

  for (const { prospectId, faits, trade } of inputs) {
    try {
      const { redaction, usage } = await deps.rediger(consignes(trade), factsMessage(faits));
      report.usage.input += usage.input;
      report.usage.cacheWrite += usage.cacheWrite;
      report.usage.cacheRead += usage.cacheRead;
      report.usage.output += usage.output;

      const parsed = siteRedactionSchema(trade).safeParse(redaction);
      if (!parsed.success) {
        console.error(
          `generate : ${prospectId} rejeté — réponse hors contrat : ` +
            parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; '),
        );
        report.rejected += 1;
        continue;
      }

      const contenu = composerContenuPublie(faits, parsed.data as SiteRedaction, trade, {
        schema: SITE_CONTENT_VERSION,
        promptVersion: PROMPT_VERSION,
        model: MODEL,
      });

      const ecarts = verifierCoherence({
        faits: contenu.faits,
        redaction: parsed.data as SiteRedaction,
      });
      if (ecarts.length > 0) {
        console.error(
          `generate : ${prospectId} rejeté — la rédaction avance des faits que la base ` +
            `ne porte pas : ${ecarts.map((e) => e.message).join(' ; ')}`,
        );
        report.rejected += 1;
        continue;
      }

      contenus.push({ prospectId, contenu });
      report.generated += 1;
    } catch (erreur) {
      console.error(
        `generate : échec sur ${prospectId} — ${
          erreur instanceof Error ? erreur.message : String(erreur)
        }`,
      );
      report.failed += 1;
    }
  }

  return { contenus, report };
}
