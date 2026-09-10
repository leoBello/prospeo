/**
 * Catalogue français — locale de référence.
 *
 * `fr` définit le jeu de clés que toute autre locale doit couvrir : le type
 * `TranslationKey` en dérive, et un test compare les deux jeux. Une clé
 * ajoutée ici sans son pendant anglais fait donc échouer la suite, plutôt que
 * de laisser une phrase française apparaître au milieu d'un écran anglais.
 *
 * Les clés en `_one` portent la forme singulière ; la clé nue porte le
 * pluriel. Voir `translate` pour la règle de choix, qui diffère selon la
 * langue.
 */
export const fr = {
  'app.name': 'Prospeo',
  'nav.today': "Aujourd'hui",
  'nav.deploiements': 'Déploiements',
  'nav.gabarit': 'Gabarit',
  'nav.signOut': 'Se déconnecter',

  'theme.toDark': 'Passer au thème sombre',
  'theme.toLight': 'Passer au thème clair',
  'locale.switch': 'English',

  // Lot 3, tâche 2 — le bouton de compte qui replie thème, langue et
  // déconnexion. Un libellé traduit, jamais des initiales inventées : rien
  // ici ne connaît l'identité de la personne connectée.
  'account.button': 'Préférences du compte',

  // Le champ dit explicitement ce qu'il filtre — les listes de travail déjà
  // affichées sur cet écran — et jamais les 139 prospects de la base, hors
  // périmètre du chantier (décision du pilote, lot 3 tâche 2).
  'header.search.label': 'Filtrer les listes du jour (relances dues, nouveaux prospects à fort score)',
  // `{modifier}` vaut « ⌘ » ou « Ctrl+ » selon la plateforme détectée
  // (`ui/plateforme.ts`) : afficher ⌘K sur Windows serait une promesse que
  // rien ne tient.
  'header.search.shortcut': '{modifier}K',

  'auth.title': 'Prospeo',
  'auth.subtitle': 'Connexion au tableau de bord de prospection',
  'auth.email': 'Adresse e-mail',
  'auth.password': 'Mot de passe',
  'auth.submit': 'Se connecter',
  'auth.pending': 'Connexion…',
  'auth.google': 'Continuer avec Google',
  'auth.googleAide': 'Nécessaire pour envoyer les mails depuis votre compte.',
  'auth.error.credentials': 'Adresse e-mail ou mot de passe incorrect.',
  'auth.error.generic': 'Connexion impossible : {message}',
  'auth.noSignup':
    "Compte unique, créé côté Supabase. Il n'y a pas d'inscription depuis cet écran.",

  'app.loading': 'Chargement…',
  'app.error.title': 'Lecture impossible',
  'app.error.retry': 'Réessayer',

  'today.title': "Aujourd'hui",
  'today.subtitle': 'Ce que la base sait, et ce qu’elle ne sait pas encore.',

  'today.section.followUps': 'Relances dues',
  'today.section.newHighScore': 'Nouveaux prospects à fort score',

  'today.empty.followUps':
    'Aucune relance : la table de suivi ne contient encore aucune ligne. Aucun écrivain ne l’alimente à ce jour.',
  'today.empty.newHighScore': 'Aucun prospect scoré pour le moment.',
  // Distincte des deux ci-dessus : une recherche sans résultat ne dit rien
  // sur l'état réel des relances ou des nouveaux prospects, seulement sur ce
  // qui a été tapé. Les confondre ferait croire, une fois la recherche
  // effacée, que la liste avait toujours été vide.
  'today.empty.search': 'Aucune ligne ne correspond à votre recherche.',

  'today.reason.followUp.today': 'relance prévue aujourd’hui',
  'today.reason.followUp.late': 'relance en retard de {days} j',
  'today.reason.followUp.late_one': 'relance en retard d’un jour',
  'today.reason.followUp.future': 'relance prévue dans {days} j',
  'today.reason.followUp.future_one': 'relance prévue demain',
  'today.reason.followUp.undated': 'relance sans date prévue',

  'today.reason.separator': ' · ',

  // La veille par onglets (maquettes Veille.dc.html, VeilleEtats.dc.html).
  'veille.titre': 'Toute la veille',
  'veille.onglets.aria': 'Statut de suivi',
  'veille.onglet.toutes': 'Toutes',
  'veille.onglet.compte.aria': '{label} : {count} prospects',
  'veille.onglet.compte.aria_one': '{label} : {count} prospect',

  // La ligne de compte de `TableVeille.tsx` : ce que l'onglet montre, et ce
  // qu'il ne montre pas.
  'veille.compte.a_contacter':
    '{classables} classables, sur {total} sans aucune ligne de suivi en base',
  'veille.compte.statut': '{count} prospects, sur {classables} classables',
  'veille.compte.statut_one': '{count} prospect, sur {classables} classables',
  'veille.compte.vide': 'aucun prospect à ce statut',
  'veille.compte.toutes': '{classables} classables, sur {total} prospects en base',
  'veille.sansScore':
    "{count} jamais scorés, non classables",
  'veille.sansScore_one': '{count} jamais scoré, non classable',
  'veille.sansScore.hint':
    "Un score manquant n'est pas un score nul : ces prospects n'ont pas de rang, et n'apparaissent donc dans aucun onglet. L'étage « score » n'est pas passé sur eux.",

  'veille.colonne.score': 'Score',
  'veille.colonne.prospect': 'Prospect',
  'veille.colonne.presence': 'Présence web',
  'veille.colonne.telephone': 'Téléphone',
  'veille.colonne.site': 'Site',
  'veille.colonne.suivi': 'Suivi',
  'veille.colonne.prochaineAction': 'Prochaine action',
  'veille.colonne.closDepuis': 'Clos depuis',
  'veille.colonne.depuis': 'Depuis',
  'veille.colonne.statut': 'Statut',

  'veille.tri.score_desc': 'Tri : score décroissant',
  'veille.tri.score_asc': 'Tri : score croissant',

  // La colonne « Téléphone » et la colonne contextuelle de `RangeeVeille.tsx`.
  'veille.telephone.mobile': 'mobile',
  'veille.telephone.fixe': 'fixe',
  'veille.telephone.absent': 'aucune coordonnée',
  'veille.telephone.absent.detail': 'étage « enrich » non passé',

  'veille.echeance.aujourdhui': 'aujourd’hui',
  'veille.echeance.retard': 'en retard de {days} j',
  'veille.echeance.retard_one': 'en retard d’un jour',
  'veille.echeance.future': 'dans {days} j',
  'veille.echeance.future_one': 'demain',
  'veille.echeance.absente': 'non datée',
  'veille.depuis': '{days} j',
  'veille.depuis_one': '{days} j',
  'veille.depuis.absente': 'non datée',

  // Les vides nommés de `TableVeille.tsx` (maquette `VeilleEtats.dc.html`,
  // blocs A à D) : une absence par onglet, jamais un texte générique.
  'veille.vide.a_contacter.titre': 'Aucun prospect à contacter',
  'veille.vide.a_contacter.texte':
    'Tous les prospects scorés portent une décision. La collecte en apportera d’autres.',
  'veille.vide.contacte.titre': 'Aucun prospect contacté pour l’instant',
  'veille.vide.contacte.texte':
    'Un prospect arrive ici dès qu’un premier message part. L’onglet reste visible à zéro : c’est une étape du parcours, pas une absence de données.',
  'veille.vide.relance.titre': 'Aucune relance en cours',
  'veille.vide.relance.texte':
    'Un prospect relancé sans réponse arrive ici. L’onglet reste visible à zéro : c’est une étape du parcours, pas une absence de données.',
  'veille.vide.interesse.titre': 'Aucun prospect intéressé pour l’instant',
  'veille.vide.interesse.texte':
    'Un prospect arrive ici quand il répond favorablement. L’onglet reste visible à zéro : c’est une étape du parcours, pas une absence de données.',
  'veille.vide.gagne.titre': 'Aucune vente conclue pour l’instant',
  'veille.vide.gagne.texte':
    'Le premier prospect passé à « Gagné » débloquera aussi le jalon verrouillé du brief. La table est neuve, pas en panne.',
  'veille.vide.perdu.titre': 'Aucun prospect perdu',
  'veille.vide.perdu.texte':
    'Un prospect classé « Perdu » quitte les files de travail mais garde son onglet : on doit pouvoir relire pourquoi une piste s’est fermée.',
  'veille.vide.ne_pas_contacter.titre': 'Aucun refus enregistré',
  'veille.vide.ne_pas_contacter.texte':
    'Un prospect qui demande à ne plus être contacté arrive ici, définitivement. Une liste vide est une bonne nouvelle, pas une panne de lecture.',
  'veille.vide.toutes.titre': 'Aucun prospect classable',
  'veille.vide.toutes.texte':
    'Aucun prospect n’a encore de score : l’étage « score » n’est pas passé. La collecte et le scoring rempliront cette table.',
  'veille.vide.sortie': 'Voir les {count} à contacter',
  'veille.vide.recherche.titre': 'Aucune ligne ne correspond à votre recherche',
  'veille.vide.recherche.texte':
    '{count} prospects sont bien dans cet onglet — aucun ne porte « {query} ».',
  'veille.vide.recherche.texte_one':
    '{count} prospect est bien dans cet onglet — il ne porte pas « {query} ».',
  'veille.vide.recherche.effacer': 'Effacer la recherche',

  // Les deux seuls métiers de `packages/core/src/trades.ts` : `RangeeVeille.tsx`
  // compose `trade.${prospect.tradeSlug}` sur ces slugs plutôt que de lire
  // `getTrade(...)?.label`, pour que le badge de métier passe par `t()` comme
  // tout le reste de la rangée.
  'trade.plombier': 'Plombier',
  'trade.serrurier': 'Serrurier',

  // La barre de pagination, au kit (`ui/kit/Pagination.tsx`) : partagée avec
  // l'écran Déploiements, elle ne connaît ni prospect, ni onglet, ni score.
  'pagination.etendue': '{premier}–{dernier} sur {total}',
  'pagination.taille': '{count} par page',
  'pagination.unePage': 'une seule page — les boutons de page ne s’affichent pas',
  'pagination.precedentes': 'Précédentes',
  'pagination.suivantes': 'Suivantes',
  'pagination.page.aria': 'Page {page} sur {pages}',
  'pagination.aria': 'Pagination de la liste',

  // Lot 3, tâche 8 — la bande de progression qui remplace `KpiBand` sous le
  // titre « Aujourd'hui », et le compteur de série de la barre du haut. Voir
  // `ui/BandeProgression.tsx` pour la doctrine des quatre absences distinctes
  // que ces clés portent à l'écran.
  'jeu.objectif.titre': 'Objectif du jour',
  'jeu.objectif.valeur': '{count} relances tenues',
  'jeu.objectif.valeur_one': '{count} relance tenue',
  'jeu.objectif.hint':
    'Médiane des relances tenues par jour, sur les quatorze derniers jours civils complets — pas un chiffre imposé.',
  'jeu.objectif.insuffisant.titre': 'Historique encore insuffisant',
  'jeu.objectif.insuffisant.detail':
    'Pas encore un jour civil complet observé : aucune médiane fiable ne peut s’en déduire. Cet objectif apparaîtra dès qu’il y en aura un.',
  // Correctif de revue (tâche 8) — deuxième motif d'objectif inconnu,
  // distinct du précédent : ici l'historique NE MANQUE PAS, la médiane a
  // bien pu être calculée, elle vaut zéro. Le texte ne prétend donc jamais
  // qu'il manque des données ; il dit sur quoi l'objectif se fonde (des
  // jours avec relance tenue) et pourquoi il n'y en a pas assez pour en
  // proposer un — voir `MotifObjectifInconnu`, domain/jeu.ts.
  'jeu.objectif.medianeNulle.titre': "Pas encore d'objectif à proposer",
  'jeu.objectif.medianeNulle.detail':
    'L’objectif se fonde sur les jours où au moins une relance a été tenue : il n’y en a pas encore assez pour en proposer un.',
  // Le dénominateur de l'anneau (maquette, ~« / 15 ») quand l'objectif est
  // connu, et son repli textuel — jamais un nombre — quand il ne l'est pas
  // encore (refonte, tâche 8, second passage). Sert les deux motifs
  // d'objectif inconnu : aucun des deux ne fournit de dénominateur chiffré.
  'jeu.objectif.denominateur': '/ {objectif}',
  'jeu.objectif.denominateur.inconnu': 'pas encore',

  'jeu.palier.titre': 'Palier {numero}',
  // Noms de la maquette (Main.dc.html ~l.127) — voir `NOMS_PALIER`,
  // `ui/BandeProgression.tsx` : arbitrage du propriétaire, tâche 8, troisième
  // passage. `avecNom` porte le palier COURANT (le mot « Palier » + le nom) ;
  // les noms nus (`nom.1`, `nom.2`) servent seuls pour le palier SUIVANT,
  // comme la maquette écrit « Closer » sans le répéter.
  'jeu.palier.nom.1': 'Prospecteur',
  'jeu.palier.nom.2': 'Closer',
  'jeu.palier.avecNom': 'Palier {nom}',
  'jeu.palier.fleche': '→',
  'jeu.palier.points': '{points} / {seuil} points',
  'jeu.palier.incomplet': 'Total minimal : les relances tenues ne sont pas encore comptées dans ce score.',
  'jeu.palier.poids.relanceTenue': '+{points} pts · relance tenue',
  'jeu.palier.poids.siteMisEnLigne': '+{points} pts · site mis en ligne',
  'jeu.palier.poids.rendezVousObtenu': '+{points} pts · rendez-vous obtenu',

  'jeu.badge.premiere_relance_tenue': 'Première relance tenue',
  'jeu.badge.premier_site_en_ligne': 'Premier site en ligne',
  'jeu.badge.premier_rendez_vous': 'Premier rendez-vous',
  'jeu.badge.serie_sept_jours': 'Série de sept jours',
  'jeu.badge.etat.obtenu': 'Obtenu',
  'jeu.badge.etat.verrouille': 'Verrouillé',
  'jeu.badge.etat.non_mesurable': 'Non mesurable',
  'jeu.badge.nonMesurable.hint':
    'Aucun geste ne peut débloquer ce badge aujourd’hui : la mesure qu’il demande n’a pas encore de source fiable côté serveur.',
  // La pastille (refonte, tâche 8) ne porte plus aucun mot visible : c'est
  // son `aria-label`, composé ici, qui nomme le jalon ET son état — la règle
  // du dépôt pour toute pastille à infobulle (voir `BadgeJalon`,
  // `ui/BandeProgression.tsx`).
  'jeu.badge.aria': '{etat} — {nom}',

  'jeu.serie.titre': 'Série en cours',
  // Raccourci à la maquette (Main.dc.html ~l.94 : « 6 jours ») — correctif de
  // revue, tâche 8, troisième passage : le sens complet vit dans `hint`
  // ci-dessous, le répéter dans le badge était une redite. « Au moins »
  // reste sur `auMoins` : ce n'est pas une fioriture, c'est la seule
  // formulation que le code puisse garantir quand `borneAtteinte` est vrai.
  'jeu.serie.jours': '{count} jours',
  'jeu.serie.jours_one': '{count} jour',
  'jeu.serie.auMoins': 'Au moins {count} jours',
  'jeu.serie.hint': 'Jours civils consécutifs avec au moins une relance tenue.',

  'jeu.chargement': 'Chargement du tableau de jeu…',
  'jeu.erreur': 'Le tableau de jeu n’a pas pu se charger : {message}',

  'score.absent': 'pas encore scoré',
  'score.absent.hint':
    'Ce prospect n’a pas de score, ce qui n’est pas la même chose qu’un score de zéro.',
  'warning.badge': '{count} signalements',
  'warning.badge_one': '1 signalement',
  'warning.title': 'Signalements',
  'warning.hint':
    'Ces écarts se corrigent en rejouant les étages du collector. Cet écran les constate, il ne les répare pas.',
  'warning.presenceContradicted':
    'Catégorie « aucune présence web » démentie par le site déclaré {url} — le score est probablement inversé, pas seulement dépassé.',
  'warning.scorePredatesEnrichment':
    'Score calculé avant l’enrichissement Google : il ignore le téléphone, la note et le site découverts depuis.',
  'warning.staleRuleset':
    'Score calculé avec le barème {stored}, quand le barème en vigueur est le {current}.',
  'score.group.presence': 'Présence',
  'score.group.vitalite': 'Vitalité',
  'score.group.joignabilite': 'Joignabilité',
  'score.group.disqualifiant': 'Disqualifiants',
  'score.bar.label': 'Score {total} sur 100 : {detail}',
  'score.gauge.aria': 'Score de {total} sur 100',
  'score.outOfShort': 'sur 100',
  'score.receipt.open': 'Voir le reçu ligne par ligne',
  'score.receipt.close': 'Masquer le reçu',

  'presence.none': 'Aucune présence web',
  'presence.social_only': 'Page sociale, aucun site',
  'presence.directory_only': 'Fiche annuaire uniquement',
  'presence.dead_site': 'Site en panne ou obsolète',
  'presence.has_site': 'Site correct et vivant',
  'presence.absent': 'Présence web pas encore sondée',

  'enrichment.ok': 'Fiche Google appariée',
  'enrichment.not_found': 'Aucune fiche Google trouvée',
  'enrichment.ambiguous': 'Appariement à trancher',
  'enrichment.blocked': 'Enrichissement bloqué par Google',
  // Aligné sur le patron déjà établi par `site.absent` et `messages.absent` :
  // nommer l'étage du pipeline qui n'est pas encore passé, pas juste dire
  // « pas encore ». C'est ce texte que `FicheTab` affiche pour distinguer
  // « l'étage enrich n'a pas tourné » de « la source n'a rien publié ».
  'enrichment.absent': 'Aucune coordonnée : l’étage « enrich » n’est pas passé sur ce prospect.',
  'enrichment.reviews.hint':
    'Google ne publie plus le nombre d’avis depuis août 2026. Relancer l’enrichissement ne remplira pas ce champ.',
  'enrichment.confidence.hint':
    'Confiance de l’appariement avec la fiche Google. Sous le seuil haut, le rattachement est un pari — et c’est au téléphone qu’un faux appariement se paie.',

  'panel.close': 'Fermer le panneau',
  // « Choisir » et non « Sélectionner » : c'est le mot du geste, pas celui de
  // l'interface — on ne « sélectionne » pas un client au téléphone.
  'panel.empty': 'Choisir un prospect pour afficher sa fiche.',
  'panel.section.identity': 'Identité',
  'panel.section.contact': 'Coordonnées',
  'panel.section.web': 'Présence web',
  'panel.section.score': 'Détail du score',
  'panel.position': '{index} sur {total}',
  // Lot 3, tâche 2 (correctif de revue) : le prospect ouvert avant une
  // recherche qui l'exclut reste affiché, mais son rang dans la liste
  // filtrée n'existe plus — ceci le dit, plutôt qu'un « 0 sur 0 » ou un rang
  // faux calculé quand même.
  'panel.position.horsFiltre': 'Hors du filtre de recherche en cours',

  // Chantier n°6 : les quatre onglets du panneau, un par moment du travail.
  'panel.tab.fiche': 'Fiche',
  'panel.tab.site': 'Site',
  'panel.tab.messages': 'Messages',
  'panel.tab.historique': 'Historique',

  'field.siret': 'SIRET',
  'field.address': 'Adresse',
  'field.created': 'Création',
  'field.staff': 'Effectif',
  'field.phone': 'Téléphone',
  'field.rating': 'Note Google',
  'field.reviewCount': 'Avis',
  'field.declaredUrl': 'Site déclaré',
  'field.matchedName': 'Nom apparié',
  'field.matchConfidence': 'Confiance d’appariement',

  'value.unknown': 'non renseigné',
  'value.notCollected': 'pas encore collecté',
  'value.notPublished': 'non publié par la source',
  'value.mobile': 'mobile',
  'value.landline': 'fixe',

  'list.keyboardHint':
    'Flèches haut et bas pour parcourir les prospects, Échap pour fermer le panneau.',
  'list.overflow': '{count} de plus, non affichés ici',
  'list.overflow_one': '1 de plus, non affiché ici',

  'panel.section.site': 'Site généré',
  'panel.section.messages': 'Messages de vente',
  'panel.section.pipeline': 'Suivi',

  // Le badge d'en-tête, distinct de `site.online` : celui-ci porte une date
  // et vit dans l'onglet Site, celui-là tient dans un badge de trois mots.
  'site.badge.online': 'Site en ligne',

  'site.absent': 'Aucune rédaction : l’étage « generate » n’est pas passé sur ce prospect.',
  'site.notPublished': 'Rédaction écrite, rien n’est encore publié.',
  'site.notDeployed': 'Dépôt créé, déploiement pas encore abouti.',
  'site.online': 'En ligne depuis le {date}',
  'site.unpublished': 'Retiré le {date}',
  'site.rejected': 'Rédaction refusée le {date}',
  'site.rejected.hint':
    '« publish » s’y refuse, « generate » en écrira une autre au prochain passage.',
  'site.reject': 'Rejeter cette rédaction',
  'site.unreject': 'Annuler le refus',
  'site.redaction.hint':
    'Seul ce que le modèle a décidé figure ici. Les faits — téléphone, note, année — viennent de la base et n’ont pas pu être inventés.',
  'site.field.accroche': 'Accroche',
  'site.field.presentation': 'Présentation',
  'site.field.prestations': 'Prestations retenues',
  'site.field.deployment': 'Adresse en ligne',
  'site.field.repo': 'Dépôt',
  'site.trace': 'Rédigé par {model}, consignes {version}',

  'messages.absent': 'Aucun message : l’étage « pitch » n’est pas passé sur ce prospect.',
  'messages.manual':
    'Rien ne part automatiquement : ces textes se relisent, puis se copient à la main.',
  'messages.channel.email': 'E-mail',
  'messages.channel.sms': 'SMS',
  'messages.channel.appel': 'Script d’appel',
  'messages.subject': 'Objet',
  'messages.copy': 'Copier',
  'messages.copied': 'Copié',
  'messages.copyFailed': 'Copie impossible : sélectionnez le texte à la main.',
  'messages.sms.measure': '{chars} caractères · {segments} SMS',
  'messages.sms.ucs2':
    'Caractères hors alphabet GSM ({chars}) : le message bascule en UCS-2 et compte davantage de SMS.',
  'messages.trace': '{model} · consignes {version} · {date}',

  'pipeline.label': 'Statut',
  'pipeline.absent': 'Jamais contacté',
  'pipeline.updated': 'Mis à jour le {date}',
  'pipeline.status.a_contacter': 'À contacter',
  'pipeline.status.contacte': 'Contacté',
  'pipeline.status.relance': 'Relancé',
  'pipeline.status.interesse': 'Intéressé',
  'pipeline.status.gagne': 'Gagné',
  'pipeline.status.perdu': 'Perdu',
  'pipeline.status.ne_pas_contacter': 'Ne pas contacter',
  'pipeline.refusalWarning':
    'Le statut est enregistré, mais le site reste en ligne jusqu’au prochain « prospeo unpublish » : ce tableau de bord ne détient aucun jeton Vercel, et n’en détiendra pas.',
  'pipeline.historyFailed':
    'Le statut est enregistré, mais ce changement ne sera pas compté : {message}',

  'interaction.title': 'Consigner un échange',
  'interaction.kind': 'Canal',
  'interaction.kind.appel': 'Appel',
  'interaction.kind.whatsapp': 'WhatsApp',
  'interaction.kind.email': 'E-mail',
  'interaction.kind.sms': 'SMS',
  'interaction.kind.note': 'Note',
  'interaction.body': 'Note (facultative)',
  'interaction.submit': 'Consigner',
  'interaction.saved': 'Échange consigné.',

  'action.pending': 'Enregistrement…',
  'action.failed': 'Écriture refusée : {message}',
  'action.call': 'Appeler {phone}',
  'action.noPhone': 'Aucun numéro collecté',
  'action.openSite': 'Voir le site',
  'action.redeploy': 'Redéployer',
  'action.redeploy.reason':
    'Le déclenchement d’un déploiement depuis l’interface arrive avec le lot 2. Aujourd’hui, `publish` et `deploy` ne s’appellent que depuis le collector en ligne de commande.',

  'unit.prospects': '{count} prospects',
  'unit.prospects_one': '{count} prospect',
  'unit.employees': 'au moins {count} salariés',
  'unit.employees_one': 'au moins {count} salarié',

  'bientot.label': 'Bientôt',
  'bientot.aria': 'Fonctionnalité à venir',

  'histo.discovered': 'Découvert en base',
  'histo.generated': 'Rédaction générée',
  'histo.published': 'Site publié',
  'histo.unpublished': 'Site retiré',
  'histo.rejected': 'Rédaction refusée',

  // Chantier n°5, tâche 11 — le journal détaillé, désormais réel : la table
  // `deployment_event` existe depuis ce lot. Les jalons ci-dessus restent :
  // ils portent des faits que les événements ne rejouent pas pour les sites
  // déployés avant cette migration (les vingt-deux sites déjà en ligne).
  'histo.events.title': 'Journal détaillé',
  // L'absence d'événements se dit comme un fait daté, pas comme un vide : le
  // dernier jalon connu sert de repère, plutôt qu'un silence qui se lirait
  // comme un oubli.
  'histo.events.empty.titre': 'Aucun événement enregistré',
  'histo.events.empty.detail': 'Le dernier fait connu pour ce site remonte au {date}.',

  'histo.issue.demarre': 'Démarré',
  'histo.issue.reussi': 'Réussi',
  'histo.issue.echoue': 'Échoué',
  'histo.issue.ignore': 'Ignoré',

  // Chantier n°5, D9 — l'écran de suivi des déploiements. Vingt-deux sites
  // publiés au nom de vraies entreprises : le seul moyen de voir ce que le
  // pipeline leur a fait, jusqu'ici, était un terminal.
  'deploiements.title': 'Déploiements',
  'deploiements.subtitle':
    'Un site par prospect, généré depuis le gabarit puis construit par Vercel. Chaque ligne dit où en est le sien, et pourquoi il s’y est arrêté.',

  'deploiements.kpi.enLigne': 'en ligne',
  'deploiements.kpi.enCours': 'en cours',
  'deploiements.kpi.enEchec': 'en échec',
  'deploiements.kpi.peremption': 'péremption sous {days} j',
  'deploiements.kpi.peremption.tipTitre': 'Retrait à 90 jours',
  'deploiements.kpi.peremption.hint':
    '{count} sites atteindront leurs 90 jours de publication sous {days} j et seront retirés automatiquement.',
  'deploiements.kpi.peremption.hint_one':
    'Un site atteindra ses 90 jours de publication sous {days} j et sera retiré automatiquement.',

  'deploiements.filtre.tous': 'Tous',
  'deploiements.filtre.enCours': 'En cours',
  'deploiements.filtre.echec': 'En échec',
  'deploiements.filtre.jamais': 'Jamais déployé',

  'deploiements.colonnes.prospect': 'Prospect',
  'deploiements.colonnes.gabarit': 'Gabarit',
  'deploiements.colonnes.piste': 'Rédaction · Dépôt · Projet · Build · Ligne',
  'deploiements.colonnes.etat': 'État',
  'deploiements.colonnes.duree': 'Durée',
  'deploiements.colonnes.adresse': 'Adresse',

  // Cinq des six étapes réelles du pipeline (voir `ORDRE_ETAPES`,
  // domain/deployment.ts) ; `retrait` n'a pas de segment sur la piste — voir
  // le docstring d'`EtapesPiste` — mais garde son libellé, utile ailleurs
  // (date de retrait, état « Dépublié »).
  'deploiements.etape.redaction': 'Rédaction',
  'deploiements.etape.depot': 'Dépôt',
  'deploiements.etape.projet': 'Projet Vercel',
  'deploiements.etape.build': 'Build',
  'deploiements.etape.en_ligne': 'Mise en ligne',
  'deploiements.etape.retrait': 'Retrait',
  'deploiements.etape.inconnue': 'étape inconnue',

  'deploiements.etat.jamais': 'Jamais déployé',
  'deploiements.etat.enCours': '{etape} en cours',
  'deploiements.etat.echec': '{etape} en échec',
  'deploiements.etat.enLigne': 'En ligne',
  'deploiements.etat.retire': 'Dépublié',

  'deploiements.piste.aria': 'Piste de déploiement : {etat}',

  // Le compteur de péremption prime sur le badge « En ligne » dès qu'il
  // approche (§D5, chantier n°4) : un site publié au nom d'un tiers est
  // retiré automatiquement à 90 jours, et ce n'est pas une statistique.
  'deploiements.peremption.badge': 'Péremption dans {days} j',
  'deploiements.peremption.badge_one': 'Péremption demain',
  'deploiements.peremption.today': 'Péremption aujourd’hui',
  'deploiements.peremption.tipDetail':
    'Publié le {date}. Un site publié au nom d’un tiers est retiré automatiquement 90 jours après sa publication.',

  'deploiements.row.score': 'score {score}',
  'deploiements.row.duree': '{min} m {sec}',
  'deploiements.row.adresseAbsente': 'aucune adresse pour le moment',
  'deploiements.row.horsLigne': 'hors ligne',
  'deploiements.row.echecSansDetail': 'Le déploiement a échoué, sans détail enregistré.',
  'deploiements.row.gabaritAbsent': 'aucun gabarit actif',

  'deploiements.empty.titre': 'Aucun déploiement',
  'deploiements.empty.detail':
    'Aucun prospect n’a encore de site généré. Cet écran se remplira au fil des rédactions.',
  'deploiements.empty.filtre.titre': 'Aucun déploiement dans ce filtre',
  'deploiements.empty.filtre.detail': 'Choisissez « Tous » pour revoir l’ensemble des déploiements.',

  // Chantier n°7 — l'écran de campagne. Les libellés viennent des artboards
  // approuvés (Campagne.html, CampagneEtats.html), lus et recopiés, jamais
  // inventés. Les clés de bouton (`campagne.action.*`) et de conditions
  // (`campagne.worker.*`) n'ont été écrites qu'AVEC leur exécutant, et non
  // d'avance : un libellé sans code derrière est une affordance qui annonce
  // un fait que rien ne rend vrai — et `i18n.test.ts` l'aurait de toute
  // façon signalé orphelin.
  'nav.campagne': 'Campagne',

  'campagne.title': 'Campagne de prospection',
  'campagne.subtitle':
    "Les 20 prospects les mieux notés que personne n'a encore touchés, plus ceux que vous avez déjà lancés. Un site, un mail, un envoi — dans cet ordre.",

  'campagne.col.prospect': 'Prospect',
  'campagne.col.piste': 'Site · Mail · Envoi',
  'campagne.col.etat': 'État',

  // Les neuf variantes de `EtatLigne` (domain/campagne.ts) : une clé chacune,
  // pour que `cleEtat` (CampagneScreen.tsx) reste un switch exhaustif que le
  // compilateur referme lui-même si une variante manque.
  'campagne.etat.jamais': 'Jamais déployé',
  'campagne.etat.enFile': "En file d'attente · {rang}e",
  'campagne.etat.siteEnCours': 'Site en cours',
  'campagne.etat.siteEchec': 'Déploiement en échec',
  'campagne.etat.mailARelire': 'Mail à relire',
  'campagne.etat.adresseManquante': 'Adresse manquante',
  'campagne.etat.envoiIncertain': 'Envoi incertain',
  'campagne.etat.envoiEchec': 'Envoi en échec',
  'campagne.etat.envoye': 'Envoyé',

  'campagne.piste.site': 'Site',
  'campagne.piste.mail': 'Mail',
  'campagne.piste.envoi': 'Envoi',
  'campagne.piste.segment': '{segment} : {etat}',
  'campagne.piste.etat.vide': 'pas commencé',
  'campagne.piste.etat.enCours': 'en cours',
  'campagne.piste.etat.ok': 'terminé',
  'campagne.piste.etat.echec': 'en échec',
  'campagne.piste.etat.bloque': 'en attente d’une information',

  'campagne.sansScore':
    "{count} prospects n'ont jamais été scorés : ils ne peuvent pas être classés, et n'apparaissent pas dans ce lot.",
  'campagne.sansScore_one':
    "{count} prospect n'a jamais été scoré : il ne peut pas être classé, et n'apparaît pas dans ce lot.",

  'campagne.action.deployer': 'Déployer',
  'campagne.action.rejouer': 'Rejouer',
  'campagne.action.relire': 'Relire',
  'campagne.action.retirer': 'Retirer',
  'campagne.action.impossible':
    'Le collector est à l’arrêt : une demande déposée maintenant ne partirait pas.',
  'relecture.destinataire': 'Destinataire',
  'relecture.origine.saisie': 'Saisie',
  'relecture.origine.collecte': 'Collectée',
  'relecture.origine.aucune': 'Aucune adresse',
  'relecture.origineAide.saisie': 'Adresse saisie à la main dans cet écran.',
  'relecture.origineAide.collecte': 'Adresse relevée automatiquement à l’enrichissement.',
  'relecture.origineAide.aucune':
    'Aucune adresse n’a été trouvée ni saisie. La saisir permet d’envoyer.',
  'relecture.corriger': 'Corriger',
  'relecture.saisir': 'Saisir l’adresse',
  'relecture.enregistrer': 'Enregistrer',
  'relecture.annuler': 'Annuler',
  'relecture.objet': 'Objet',
  'relecture.corps': 'Corps du message',
  'relecture.tracabilite': 'Rédigé par {modele} · consignes {consignes} · {date}',
  'relecture.pasDeMail': 'Aucun mail n’a encore été rédigé pour ce prospect.',
  'relecture.partiraDe':
    'Le mail partira de {expediteur}. Les réponses arriveront dans cette boîte.',
  'relecture.consequence':
    'À l’envoi, le prospect passe en « contacté » et l’échange rejoint son historique.',
  'relecture.envoyer': 'Envoyer',
  'relecture.envoiEnCours': 'Envoi…',
  'relecture.dejaEnvoye': 'Déjà envoyé',
  'relecture.echecPrise': 'Un envoi est déjà en cours ou parti pour ce prospect.',
  'relecture.echecGmail': 'Gmail a refusé l’envoi : {message}',
  'relecture.echecSuite':
    'Le mail est parti, mais la suite a échoué : {message}. Le prospect peut être en retard d’un statut.',
  'relecture.adresseEchec': 'L’adresse n’a pas pu être enregistrée : {message}',

  'campagne.envoi.titre': 'Envoi prêt',
  'campagne.envoi.pret': 'Le mail partira de {expediteur}.',
  'campagne.envoi.sansJeton': 'Aucun compte d’envoi',
  'campagne.envoi.sansJetonRaison':
    'Session ouverte par mot de passe. Le déploiement et la rédaction fonctionnent ; l’envoi, non.',
  'campagne.envoi.sansJetonRemede':
    'Envoyer demande un jeton Google, qui ne s’obtient qu’à la connexion. Déployer et rédiger restent disponibles d’ici là.',
  'campagne.envoi.sansJetonAction': 'Se reconnecter avec Google',
  'campagne.envoi.expire': 'Jeton expiré',
  'campagne.envoi.expireRaison':
    'L’envoi est en pause. Rien n’est perdu : les brouillons vivent en base.',
  'campagne.envoi.expireRemede':
    'Le jeton d’envoi vit une heure et ne se renouvelle pas seul. Se reconnecter reprend là où l’envoi s’est arrêté.',
  'campagne.envoi.expireAction': 'Se reconnecter et reprendre',
  'campagne.worker.ecoute': "Collector à l'écoute",
  'campagne.worker.arret': "Collector à l'arrêt",
  'campagne.worker.arret.raison':
    'Aucun signe de vie depuis {minutes} min. Les demandes déposées maintenant attendront son retour.',
  'campagne.worker.arret.remede':
    'Le relancer avec pnpm --filter @prospeo/collector start worker. Rien n’est perdu : la file vit en base.',
  'campagne.worker.inconnu': 'État du collector inconnu',
  'campagne.worker.inconnu.raison':
    'Aucun battement n’a jamais été enregistré. Tant qu’on ne sait rien de lui, on le tient pour arrêté.',
  'campagne.vide.lotFini': 'Le lot est fini',
  'campagne.vide.lotFini.detail': 'Les prospects les mieux notés ont tous été touchés.',
  'campagne.vide.aucunProspect': 'Aucun prospect',
  'campagne.vide.aucunProspect.detail':
    "La base ne contient aucun prospect. Rien n'a été filtré : il n'y a rien.",

  // Chantier n°10, D10 — l'écran du gabarit. Il ENREGISTRE le dépôt désigné,
  // il ne vérifie rien lui-même : le contrôle exigerait un jeton GitHub, qui
  // n'a rien à faire dans un bundle navigateur. Le bouton « Vérifier » reste
  // donc sous `Bientot`, et l'écran n'affiche que le dernier verdict connu.
  'gabarit.title': 'Gabarit des sites',
  'gabarit.subtitle':
    'Chaque site publié est engendré depuis un dépôt GitHub marqué « template ». En désigner un ici le substitue au gabarit livré avec l’application, sans toucher au code.',

  'gabarit.actif.titre': 'Gabarit actif',
  'gabarit.actif.badge': 'Actif',
  'gabarit.actif.absent': 'Aucun gabarit désigné — le gabarit livré avec l’application s’applique.',
  'gabarit.actif.branche': 'Branche {branch}',
  'gabarit.actif.controle.jamais': 'Jamais contrôlé',
  'gabarit.actif.controle.ok': 'Contrôle réussi le {date}',
  'gabarit.actif.controle.echec': 'Contrôle en échec le {date}',
  'gabarit.actif.controle.echecSansDetail': 'Contrôle en échec, sans détail enregistré.',
  'gabarit.actif.revenir': 'Revenir au gabarit par défaut',
  // Affichée seulement quand TOUS les métiers déclarent leur propre
  // `templateRepo` : `templateRepoFor` résout d'abord celui du métier, si
  // bien que le gabarit désigné ici ne gouverne alors aucun métier existant.
  // L'écran est juste et servira au troisième métier — le taire serait la
  // seule faute.
  'gabarit.actif.aucunMetier':
    'Aucun métier actuel n’est gouverné par ce gabarit : chaque métier déclare le sien, qui l’emporte. Il s’appliquera au premier métier sans exception.',

  // L'infobulle que le brief demande d'afficher, pas seulement d'implémenter :
  // sans elle, personne ne comprend pourquoi un métier ayant son propre
  // `templateRepo` (trades.ts) n'a pas reçu le dépôt qu'on vient de désigner.
  'gabarit.ordre.titre': 'Ordre de résolution',
  'gabarit.ordre.detail':
    'Le gabarit propre au métier l’emporte sur le gabarit actif désigné ici, qui l’emporte lui-même sur celui de la variable d’environnement — le gabarit livré avec l’application.',

  'gabarit.designer.titre': 'Désigner un autre dépôt',
  'gabarit.designer.aide':
    'Le dépôt doit appartenir à l’organisation et être marqué « Template repository » sur GitHub.',
  'gabarit.designer.champRepo': 'Dépôt (org/nom)',
  'gabarit.designer.champBranche': 'Branche',
  'gabarit.designer.soumettre': 'Désigner ce dépôt',

  'gabarit.verifier.label': 'Vérifier',
  // Le motif dit ce qui EST, pas ce qui viendra : aucun code du collector
  // n'exécute ce contrôle, et les seuls écrivains de `checked_at` /
  // `check_ok` les mettent à nul. Promettre « au prochain passage »
  // envoyait l'opérateur relancer le collector pour revoir « jamais
  // contrôlé » — une remédiation qui n'existe pas, pire qu'un « indisponible »
  // générique. Voir docs/design/HANDOFF.md, qui documente déjà le manque.
  'gabarit.verifier.raison':
    'Le contrôle automatique n’est pas encore écrit — ni ici, ni dans le collector. Il devra vérifier l’accessibilité du dépôt, son marquage « template » et la présence de src/content/site.json. En attendant, « jamais contrôlé » restera affiché.',

  'gabarit.metiers.titre': 'Exceptions par métier',
  'gabarit.metiers.aide':
    'Un métier peut garder son propre modèle. Sans exception, il reçoit le gabarit actif.',
  'gabarit.metiers.herite': 'hérite de l’actif',
  'gabarit.metiers.exception': 'exception',

  'gabarit.portee':
    'Changer de gabarit n’affecte que les déploiements à venir. Les sites déjà en ligne conservent le modèle avec lequel ils ont été construits.',
} as const;
