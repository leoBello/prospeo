import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import Site from './components/Site.astro';
import { chargerContenu } from './content/load.js';
import exemple from './content/site.json' with { type: 'json' };

const CONTENU = chargerContenu(exemple);

async function rendu(contenu = CONTENU): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(Site, { props: { contenu } });
}

describe('chargerContenu', () => {
  it('valide le fichier de contenu contre le contrat du gabarit', () => {
    expect(CONTENU.faits.nomAffiche).toBe('Dos-Services');
    expect(CONTENU.redaction.prestations.map((p) => p.code)).toContain('depannage');
  });

  it('fait échouer le build plutôt que de publier une page amputée', () => {
    // C'est l'exacte contrepartie de la promesse du §3 du plan : « aucune
    // génération ne peut casser un build ». Elle ne tient que si un contenu
    // invalide s'arrête ICI, bruyamment, au lieu de rendre une page où le
    // téléphone manque — page qui serait déployée, envoyée à l'artisan, et
    // découverte par lui.
    expect(() =>
      chargerContenu({ ...exemple, faits: { ...exemple.faits, telephone: undefined } }),
    ).toThrow();
    expect(() => chargerContenu({ ...exemple, redaction: undefined })).toThrow();
  });

  it('exige un éditeur identifiable', () => {
    // §11 conformité : un site publié au nom d'un tiers doit nommer son
    // éditeur réel et offrir un moyen d'en demander le retrait. Sans lui, le
    // build échoue — la page ne peut pas exister.
    expect(() => chargerContenu({ ...exemple, editeur: undefined })).toThrow();
  });

  it('refuse un contenu qui déborde du contrat', () => {
    // `.strict()` : un champ inconnu signale un fichier écrit par autre chose
    // que la chaîne, ou par une version qui ne s'entend plus avec celle-ci.
    expect(() => chargerContenu({ ...exemple, anneesExperience: 20 })).toThrow();
    // Deux prestations : la section aurait l'air d'un site inachevé.
    expect(() =>
      chargerContenu({
        ...exemple,
        redaction: {
          ...exemple.redaction,
          prestations: exemple.redaction.prestations.slice(0, 2),
        },
      }),
    ).toThrow();
  });
});

describe('le gabarit', () => {
  it('reste introuvable dans les moteurs de recherche', async () => {
    // LE garde-fou que D2 n'a PAS levé, et qui ne se lèvera pas.
    //
    // Le chantier n°4 tenait « zéro JavaScript par défaut » ; D2 l'a remplacé,
    // parce que les animations et la carte en réclament. La balise ci-dessous,
    // elle, reste : ces pages portent le nom d'entreprises réelles qui ne les
    // ont pas commandées. Indexées, elles entreraient en concurrence dans
    // Google avec le vrai site de l'artisan — ou deviendraient LE résultat
    // pour son nom.
    //
    // Elle vit dans le layout, que `rendu()` ne traverse pas : on lit donc la
    // source, qui est ce que le build copiera dans les vingt-deux dépôts.
    const layout = readFileSync(
      fileURLToPath(new URL('./layouts/Layout.astro', import.meta.url)),
      'utf8',
    );
    expect(layout).toMatch(/name="robots"[^>]*content="noindex, nofollow"/);
  });

  it('ne charge la carte que si l’on descend jusqu’à elle', async () => {
    // D2 a ouvert la porte au JavaScript ; il ne l'a pas ouverte à un site
    // lourd. Leaflet pèse 148 Ko à lui seul — plus que tout le reste du
    // chemin critique réuni. Il est donc importé DYNAMIQUEMENT, depuis un
    // `IntersectionObserver`, ce qui en fait un paquet séparé que Vite ne
    // charge qu'à l'approche de la section.
    //
    // Un import statique replacerait ces 148 Ko sur le premier affichage
    // sans que rien ne le signale : le site marcherait, il serait seulement
    // deux fois plus lent — sur mobile, là où sont les clients de l'artisan.
    const zone = readFileSync(
      fileURLToPath(new URL('./components/Zone.astro', import.meta.url)),
      'utf8',
    );
    expect(zone).toMatch(/await import\('leaflet/);
    expect(zone).toContain('IntersectionObserver');
    // Un import statique de Leaflet annulerait tout : il n'y en a aucun.
    expect(zone).not.toMatch(/^import .*leaflet/m);
  });

  it('affiche toujours le bandeau de démonstration', async () => {
    // Le site porte le nom d'une entreprise réelle et est publié sans son
    // accord. Le bandeau n'est donc pas une option de contenu : il est
    // structurel, et aucun fichier de contenu ne peut l'éteindre — sans quoi
    // une génération malheureuse, ou une modification faite à la main dans le
    // dépôt du prospect, produirait une page qui se fait passer pour le site
    // officiel de l'artisan.
    const html = await rendu();
    expect(html).toContain('démonstration');
    expect(html).toContain(CONTENU.faits.nomAffiche);
  });

  it('nomme le véritable éditeur dans les mentions légales', async () => {
    // §11 conformité. L'éditeur du site, c'est nous — pas l'artisan, qui n'a
    // rien demandé. Lui attribuer l'édition d'une page qu'il n'a pas
    // commandée serait faux, et le rendrait responsable de son contenu.
    const html = await rendu();
    expect(html).toContain(CONTENU.editeur.nom);
    // L'adresse de retrait est le mécanisme d'opposition : sans elle, la
    // mention légale ne serait qu'une déclaration sans effet.
    expect(html).toContain(CONTENU.editeur.contact);
    expect(html).toContain(CONTENU.faits.siret);
    expect(html).toContain(CONTENU.faits.raisonSociale);
  });

  it('donne le téléphone à la fois en lien et à l’œil', async () => {
    const html = await rendu();
    expect(html).toContain(`tel:${CONTENU.faits.telephone.e164}`);
    expect(html).toContain(CONTENU.faits.telephone.affichage);
  });

  it('rend les prestations dans l’ordre choisi par le modèle', async () => {
    // Les libellés arrivent DÉJÀ RÉSOLUS depuis `trades.ts`, via
    // `composerContenuPublie` : le modèle n'a choisi que des codes, et il
    // n'a jamais rédigé un seul de ces textes. La garantie « aucune
    // prestation inventée » est acquise à la génération ; ici on vérifie
    // seulement qu'elle arrive intacte à l'écran.
    const html = await rendu();
    expect(html).toContain('Dépannage');
    expect(html).toContain('Chauffe-eau et ballon');
    // L'ordre est le seul degré de liberté laissé au modèle, et il compte :
    // la première carte est celle qu'on lit.
    expect(html.indexOf('Dépannage')).toBeLessThan(html.indexOf('Chauffe-eau et ballon'));
    // Une prestation non retenue ne doit pas apparaître.
    expect(html).not.toContain('Garde-corps');
  });

  it('supprime la section plutôt que d’écrire une phrase creuse', async () => {
    // Règle de la tâche 1 : « un champ facultatif absent produit une section
    // absente, jamais une phrase creuse ». « Note Google : non renseignée »
    // sur la vitrine d'un artisan est pire que rien — c'est un aveu affiché
    // au client final.
    const complet = await rendu();
    expect(complet).toContain('4,6');
    expect(complet).toContain('2009');

    // Le contenu dépouillé doit rester COHÉRENT : retirer `anneeCreation` des
    // faits tout en laissant « depuis 2009 » dans la prose fabriquerait un
    // fichier que `verifierCoherence` refuse — et qui ne peut donc pas exister
    // en sortie de génération, puisque le modèle n'aura jamais reçu l'année.
    const depouille = await rendu(
      chargerContenu({
        ...exemple,
        faits: {
          ...exemple.faits,
          noteGoogle: null,
          lienMaps: null,
          anneeCreation: null,
          coordonnees: null,
        },
        redaction: {
          ...exemple.redaction,
          presentation:
            'Dos-Services intervient à Nantes chez les particuliers comme chez les ' +
            'professionnels, pour un dépannage comme pour une installation complète. ' +
            'Vous joignez directement l’artisan au téléphone.',
        },
      }),
    );
    expect(depouille).not.toContain('4,6');
    expect(depouille).not.toContain('2009');
    // « depuis » tout court ne peut plus servir de sonde : la mention qui
    // explique l'absence de formulaire dit « une demande envoyée depuis ici ».
    // Ce qu'on interdit, c'est l'AFFIRMATION DATÉE — « depuis 2009 » sur une
    // entreprise dont la base ignore l'année.
    expect(depouille).not.toMatch(/depuis\s+\d{4}/i);

    // La section avis disparaît ENTIÈREMENT, titre compris. Onze des 37
    // prospects éligibles sont dans ce cas au 2 septembre 2026 : ce n'est pas
    // un cas limite, c'est trois pages sur dix.
    expect(depouille).not.toContain('titre-avis');
    // La carte aussi : un fond centré sur 0,0 montrerait le golfe de Guinée
    // sous le titre « où nous trouver ».
    expect(depouille).not.toContain('id="carte"');
    // Le lien vers la fiche Google tombe avec elle.
    expect(depouille).not.toMatch(/google\.com\/maps/);

    // Et la page tient toujours debout — sans trou, et sans phrase creuse.
    expect(depouille).toContain(CONTENU.faits.telephone.affichage);
    expect(depouille).toContain(CONTENU.faits.adresse.rue);
    // Les sections illustratives ne dépendent d'aucun fait : elles restent.
    expect(depouille).toContain('titre-facon');
    expect(depouille).toContain('titre-faq');
    expect(depouille).toContain('titre-prestations');
  });

  it('n’allume pas cinq étoiles pour un 4,6', async () => {
    // Défaut trouvé à l'œil, pas par un test — et il aurait tenu sur les
    // vingt-deux sites. `Math.round(4.6)` vaut 5 : la page affichait cinq
    // étoiles pleines à côté du chiffre « 4,6 ».
    //
    // Personne ne lit les deux. On lit les étoiles, et on comprend « note
    // parfaite ». C'est une surévaluation de l'artisan, à son insu, sur une
    // page publiée à son nom — exactement ce que tout le reste de ce chantier
    // s'applique à éviter.
    const html = await rendu();
    const pleines = [...html.matchAll(/class="icone pleine"/g)].length;
    const vides = [...html.matchAll(/class="icone vide"/g)].length;
    expect(pleines).toBe(4);
    expect(vides).toBe(1);
  });

  it('met la note à la française', async () => {
    // 4.6 s'écrit « 4,6 » en France. Un point décimal sur la vitrine d'un
    // artisan nantais signale un site fabriqué ailleurs, ce qui est
    // exactement l'impression à éviter.
    const html = await rendu();
    expect(html).toContain('4,6');
    expect(html).not.toContain('4.6');
  });
});

describe('externalisation du contenu', () => {
  /** Tous les `.astro` du gabarit, lus à plat. */
  function fichiersAstro(): { nom: string; source: string }[] {
    const racine = fileURLToPath(new URL('.', import.meta.url));
    const trouves: { nom: string; source: string }[] = [];
    const parcourir = (dossier: string): void => {
      for (const entree of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, entree.name);
        if (entree.isDirectory()) parcourir(chemin);
        else if (entree.name.endsWith('.astro')) {
          trouves.push({ nom: entree.name, source: readFileSync(chemin, 'utf8') });
        }
      }
    };
    parcourir(racine);
    return trouves;
  }

  it('ne laisse aucune chaîne visible codée en dur dans un .astro', () => {
    // C'est la discipline que `apps/dashboard/src/i18n/fr.ts` a éprouvée sur
    // deux locales, et dont le spec du socle dit explicitement qu'elle
    // servait « à valider le format qu'on emploiera pour les sites générés ».
    // Ce chantier encaisse l'investissement.
    //
    // L'enjeu ici dépasse la traduction : une chaîne écrite dans le gabarit
    // est une chaîne que la génération ne peut pas adapter et que la revue
    // humaine ne verra jamais passer, puisqu'elle ne relit que le fichier de
    // contenu. Elle s'imprimerait à l'identique sur les vingt-deux sites.
    const fautifs: string[] = [];

    for (const { nom, source } of fichiersAstro()) {
      // Le frontmatter est du TypeScript, pas du gabarit : il contient
      // légitimement des identifiants et des imports.
      const gabarit = source.replace(/^---[\s\S]*?^---/m, '');
      const sansCommentaires = gabarit.replace(/<!--[\s\S]*?-->/g, '');
      // Les blocs `<style>` sont du CSS : leurs sélecteurs (`.bandeau`,
      // `address`, `@media`) sont des mots, mais personne ne les lit à
      // l'écran. Les scanner ferait échouer chaque composant qui se met en
      // forme, c'est-à-dire tous.
      const sansStyle = sansCommentaires.replace(/<style[\s\S]*?<\/style>/g, '');
      // Les blocs `<script>` sont du code, au même titre que le frontmatter :
      // leur corps n'atteint jamais l'écran. D2 en a introduit dans le gabarit
      // — l'initialisation des animations, le chargement de la carte — et sans
      // cette ligne, leurs commentaires en français seraient pris pour du
      // texte visible. Ce qui compte, et qui reste couvert, est ce qu'un
      // visiteur LIT.
      const sansScript = sansStyle.replace(/<script[\s\S]*?<\/script>/g, '');
      // Retirer les expressions `{...}` : c'est par elles que le contenu
      // externalisé arrive, et c'est donc exactement ce qui est permis.
      //
      // En boucle, parce que les expressions s'imbriquent : un
      // `{items.map((i) => (<li>{i.label}</li>))}` porte des accolades à deux
      // niveaux. Une passe unique ne retirerait que les plus internes et
      // laisserait le corps du `.map` — du TypeScript — se faire prendre pour
      // du texte visible. Chaque tour retire le niveau le plus profond ; on
      // s'arrête quand plus rien ne bouge.
      let sansExpressions = sansScript;
      for (;;) {
        const reduit = sansExpressions.replace(/\{[^{}]*\}/g, '');
        if (reduit === sansExpressions) break;
        sansExpressions = reduit;
      }

      // Nœuds de texte : ce qui se trouve entre une balise fermante et la
      // suivante ouvrante.
      for (const found of sansExpressions.matchAll(/>([^<]*)</g)) {
        const texte = (found[1] ?? '').trim();
        if (/\p{L}{2,}/u.test(texte)) fautifs.push(`${nom} : « ${texte} »`);
      }

      // Attributs lus par l'utilisateur ou par un lecteur d'écran. Une
      // `aria-label` codée en dur est invisible à la relecture et pourtant
      // bien prononcée.
      const visibles = /(aria-label|alt|title|placeholder)\s*=\s*"([^"]*)"/g;
      for (const found of sansExpressions.matchAll(visibles)) {
        const valeur = (found[2] ?? '').trim();
        if (/\p{L}{2,}/u.test(valeur)) fautifs.push(`${nom} : ${found[1]}="${valeur}"`);
      }
    }

    expect(fautifs).toEqual([]);
  });
});
