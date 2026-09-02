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

  // Les deux seuls chiffres non nuls et pleinement vrais de l'écran au jour
  // de la livraison (voir `domain/today.ts`, `computeKpis`) : retirés avec
  // `KpiBand` par la première version de la tâche 8, restaurés dans la bande
  // de progression par sa refonte — `contacted`/`interested` ne reviennent
  // pas, faute d'écran qui les affiche encore.
  'today.kpi.inBase': 'En base',
  'today.kpi.qualified': 'Qualifiés',

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
  // Le dénominateur de l'anneau (maquette, ~« / 15 ») quand l'objectif est
  // connu, et son repli textuel — jamais un nombre — quand il ne l'est pas
  // encore (refonte, tâche 8, second passage).
  'jeu.objectif.denominateur': '/ {objectif}',
  'jeu.objectif.denominateur.inconnu': 'pas encore',

  'jeu.palier.titre': 'Palier {numero}',
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
  'jeu.serie.jours': '{count} jours d’affilée',
  'jeu.serie.jours_one': '{count} jour d’affilée',
  'jeu.serie.auMoins': 'Au moins {count} jours d’affilée',
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
