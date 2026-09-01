# Provenance des images

Dix-sept photographies, **choisies à la main puis commitées** — aucun appel à
une API, ni au build ni à l'exécution (D3). Elles voyagent par la copie de
dépôt que `publish` fait déjà, comme le reste du gabarit.

Trois raisons, dans l'ordre d'importance :

1. **Pas de clé.** Une clé Unsplash devrait atteindre 22 projets Vercel, et
   `.env.example` interdit déjà tout secret côté public.
2. **Pas de requête au build.** 22 dépôts × 17 images à chaque déploiement,
   avec les limites de débit et les pannes que cela implique.
3. **Des builds instantanés** et des pages rapides.

## Règle sur les sujets

Chantiers, outils, matériaux, matière, intérieurs. **Aucun visage
reconnaissable**, et a fortiori aucun présenté comme l'équipe : les
autorisations de modèle ne sont pas garanties, et une photo d'inconnu légendée
« notre artisan » sur le site d'une entreprise réelle est un problème pour deux
personnes à la fois.

Les dix-sept fichiers ont été **regardés un par un** avant d'être retenus. Ce
n'est pas de la prudence excessive : le texte alternatif fourni par la banque
d'images s'est révélé faux sur trois des huit héros — une prétendue « main en
gros plan » est en réalité une conduite le long d'un mur de béton. Les
descriptions de `trades.ts`, qui partent dans le prompt, décrivent donc ce que
les images montrent réellement.

## Licence

Unsplash License — usage commercial autorisé, sans attribution obligatoire.
Les sources sont conservées ci-dessous par honnêteté et pour pouvoir remplacer
une image sans repartir d'une recherche.

Téléchargées le 2 septembre 2026.

Les deux premières étapes ont été REMPLACÉES après avoir vu la page rendue :
les images retenues d'après leur texte alternatif (« a bunch of tools hanging
on a wall ») montraient en réalité des garages en désordre, sous un titre qui
parle de sérieux et de suivi. Elles desservaient exactement ce que la page
vend. C'est le genre d'écart qu'aucun test ne voit.

| Fichier | Source |
|---|---|
| `heros/plomberie-01.jpg` | https://unsplash.com/photos/Ez0S4C8bzUk |
| `heros/plomberie-02.jpg` | https://unsplash.com/photos/mLx6oMw32PI |
| `heros/plomberie-03.jpg` | https://unsplash.com/photos/aQQeXL1xyc8 |
| `heros/plomberie-04.jpg` | https://unsplash.com/photos/zHWdhQ0Jubg |
| `heros/plomberie-05.jpg` | https://unsplash.com/photos/BrezDFrGvfU |
| `heros/plomberie-06.jpg` | https://unsplash.com/photos/c5aW5Xy-O7c |
| `heros/plomberie-07.jpg` | https://unsplash.com/photos/JGfXR2a8RNg |
| `heros/plomberie-08.jpg` | https://unsplash.com/photos/PkKIPzjIpyo |
| `etapes/etape-01.jpg` | https://unsplash.com/photos/t5YUoHW6zRo |
| `etapes/etape-02.jpg` | https://unsplash.com/photos/8uHhcPQfyVY |
| `etapes/etape-03.jpg` | https://unsplash.com/photos/8RXUZg5h_QA |
| `galerie/galerie-01.jpg` | https://unsplash.com/photos/yb9b2wbhxG4 |
| `galerie/galerie-02.jpg` | https://unsplash.com/photos/6TY_WrJTwSI |
| `galerie/galerie-03.jpg` | https://unsplash.com/photos/IcNpBCQS3fk |
| `galerie/galerie-04.jpg` | https://unsplash.com/photos/SIsnZPHUzbM |
| `galerie/galerie-05.jpg` | https://unsplash.com/photos/Ks7telPjAGk |
| `galerie/galerie-06.jpg` | https://unsplash.com/photos/WKO_Ke5oDhw |
