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
  'today.kpi.responseRate': 'Taux de réponse',
  'today.kpi.unavailable': 'sans objet',
  'today.kpi.unavailable.noPipeline': 'aucun prospect n’a encore été contacté',
  'today.kpi.unavailable.notModelled':
    'le schéma ne distingue pas un échange reçu d’un échange émis',

  'today.section.followUps': 'Relances dues',
  'today.section.newHighScore': 'Nouveaux prospects à fort score',
  'today.section.awaiting': 'En attente de qualification',
  'today.section.awaiting.hint':
    'Ni enrichissement, ni présence web, ni score. Ces prospects existent, ils ne sont pas encore jugés.',

  'today.empty.followUps':
    'Aucune relance : la table de suivi ne contient encore aucune ligne. Aucun écrivain ne l’alimente à ce jour.',
  'today.empty.newHighScore': 'Aucun prospect scoré pour le moment.',
  'today.empty.awaiting': 'Tous les prospects de la base ont été qualifiés.',

  'today.reason.followUp.today': 'relance prévue aujourd’hui',
  'today.reason.followUp.late': 'relance en retard de {days} j',
  'today.reason.followUp.late_one': 'relance en retard d’un jour',
  'today.reason.followUp.future': 'relance prévue dans {days} j',
  'today.reason.followUp.future_one': 'relance prévue demain',
  'today.reason.followUp.undated': 'relance sans date prévue',

  'today.reason.missing.enrichment': 'pas encore enrichi',
  'today.reason.missing.presence': 'présence web pas encore sondée',
  'today.reason.missing.score': 'pas encore scoré',
  'today.reason.separator': ' · ',

  'score.absent': 'pas encore scoré',
  'score.absent.hint':
    'Ce prospect n’a pas de score, ce qui n’est pas la même chose qu’un score de zéro.',
  'score.outOf': '{total} / 100',
  'score.stale': 'barème {stored}, courant {current}',
  'score.stale.hint':
    'Le score affiché a été calculé avec une version antérieure du barème. Il ne reflète pas les règles en vigueur.',
  'score.total': 'Total',
  'score.group.presence': 'Présence web',
  'score.group.vitalite': 'Vitalité',
  'score.group.joignabilite': 'Joignabilité',
  'score.group.disqualifiant': 'Disqualifiants',
  'score.bar.label': 'Score {total} sur 100 : {detail}',

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
  'enrichment.absent': 'Pas encore enrichi',

  'panel.close': 'Fermer le panneau',
  'panel.empty': 'Sélectionnez un prospect pour afficher sa fiche.',
  'panel.section.identity': 'Identité',
  'panel.section.contact': 'Coordonnées',
  'panel.section.web': 'Présence web',
  'panel.section.score': 'Détail du score',
  'panel.position': '{index} sur {total}',

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

  'unit.prospects': '{count} prospects',
  'unit.prospects_one': '{count} prospect',
  'unit.employees': 'au moins {count} salariés',
  'unit.employees_one': 'au moins {count} salarié',
} as const;
