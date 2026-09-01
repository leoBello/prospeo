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
  it('valide le fichier de contenu contre le schéma de packages/core', () => {
    expect(CONTENU.faits.nomAffiche).toBe('Dos-Services');
    expect(CONTENU.redaction.prestations).toContain('depannage');
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

  it('refuse une prestation absente de la liste close du métier', () => {
    expect(() =>
      chargerContenu({
        ...exemple,
        redaction: { ...exemple.redaction, prestations: ['depannage', 'devis-gratuit', 'sanitaire'] },
      }),
    ).toThrow();
  });
});

describe('le gabarit', () => {
  it("n'embarque aucun JavaScript", async () => {
    // D2 : Astro a été retenu pour son « zéro JavaScript par défaut, donc un
    // site instantané sur mobile — là où se trouvent les clients de
    // l'artisan ». Ce choix se perd au premier composant interactif ajouté
    // sans y penser ; ce test le rend visible le jour où ça arrive.
    const html = await rendu();
    expect(html).not.toMatch(/<script/i);
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
    expect(html).toContain(CONTENU.faits.siret);
    expect(html).toContain(CONTENU.faits.raisonSociale);
  });

  it('donne le téléphone à la fois en lien et à l’œil', async () => {
    const html = await rendu();
    expect(html).toContain(`tel:${CONTENU.faits.telephone.e164}`);
    expect(html).toContain(CONTENU.faits.telephone.affichage);
  });

  it('rend les prestations par leurs libellés de trades.ts, dans l’ordre choisi', async () => {
    // Le fichier de contenu ne porte que des codes. Les libellés et les
    // descriptions viennent du code, jamais du modèle : c'est ce qui rend
    // impossible qu'un site annonce une prestation inventée.
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
        faits: { ...exemple.faits, noteGoogle: null, lienMaps: null, anneeCreation: null },
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
    expect(depouille).not.toMatch(/note/i);
    expect(depouille).not.toContain('2009');
    expect(depouille).not.toMatch(/depuis/i);
    // Et la page tient toujours debout.
    expect(depouille).toContain(CONTENU.faits.telephone.affichage);
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
      // Retirer les expressions `{...}` : c'est par elles que le contenu
      // externalisé arrive, et c'est donc exactement ce qui est permis.
      //
      // En boucle, parce que les expressions s'imbriquent : un
      // `{items.map((i) => (<li>{i.label}</li>))}` porte des accolades à deux
      // niveaux. Une passe unique ne retirerait que les plus internes et
      // laisserait le corps du `.map` — du TypeScript — se faire prendre pour
      // du texte visible. Chaque tour retire le niveau le plus profond ; on
      // s'arrête quand plus rien ne bouge.
      let sansExpressions = sansStyle;
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
