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

  'today.kpi.inBase': 'En base',
  'today.kpi.contacted': 'Contactés',
  'today.kpi.interested': 'Intéressés',
  'today.kpi.qualified': 'Qualifiés',

  'today.section.followUps': 'Relances dues',
  'today.section.newHighScore': 'Nouveaux prospects à fort score',

  'today.empty.followUps':
    'Aucune relance : la table de suivi ne contient encore aucune ligne. Aucun écrivain ne l’alimente à ce jour.',
  'today.empty.newHighScore': 'Aucun prospect scoré pour le moment.',

  'today.reason.followUp.today': 'relance prévue aujourd’hui',
  'today.reason.followUp.late': 'relance en retard de {days} j',
  'today.reason.followUp.late_one': 'relance en retard d’un jour',
  'today.reason.followUp.future': 'relance prévue dans {days} j',
  'today.reason.followUp.future_one': 'relance prévue demain',
  'today.reason.followUp.undated': 'relance sans date prévue',

  'today.reason.separator': ' · ',

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
  'histo.detail.title': 'Journal détaillé des étapes',
  // Deux textes et non un seul : le visible dit CE QUI VIENT, l'infobulle dit
  // CE QUI BLOQUE. Les deux portaient la même phrase, si bien que survoler le
  // marqueur « Bientôt » révélait une phrase déjà lisible deux centimètres
  // plus haut — un geste pour rien, et une infobulle qui n'apprend rien.
  'histo.detail.reason':
    'Chaque étape de déploiement sera datée ici : dépôt créé, projet ouvert, build, mise en ligne.',
  'histo.detail.blocked':
    'Aucune table d’événements n’existe : `prospect_site` ne porte qu’un état courant, pas un historique. Rien ne peut donc être daté étape par étape avant la migration §4.1.',
} as const;
