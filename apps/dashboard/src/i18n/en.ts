import type { fr } from './fr.js';

/**
 * Catalogue anglais.
 *
 * Le type est calqué sur `fr` : oublier une clé ici est une erreur de
 * compilation, pas une découverte à l'écran. La spec (§9.5) demande les deux
 * locales dès la première ligne de code, précisément parce qu'externaliser
 * après coup impose de repasser sur chaque composant.
 *
 * Les messages de prospection produits par le LLM ne relèvent pas de ce
 * mécanisme : ce sont des données, rédigées en français parce que les
 * artisans ciblés le sont, et stockées telles quelles.
 */
export const en: Record<keyof typeof fr, string> = {
  'app.name': 'Prospeo',
  'nav.today': 'Today',
  'nav.deploiements': 'Deployments',
  'nav.gabarit': 'Template',
  'nav.signOut': 'Sign out',

  'theme.toDark': 'Switch to dark theme',
  'theme.toLight': 'Switch to light theme',
  'locale.switch': 'Français',

  'account.button': 'Account preferences',

  'header.search.label': 'Filter today’s lists (follow-ups due, new high-scoring prospects)',
  'header.search.shortcut': '{modifier}K',

  'auth.title': 'Prospeo',
  'auth.subtitle': 'Sign in to the prospecting dashboard',
  'auth.email': 'Email address',
  'auth.password': 'Password',
  'auth.submit': 'Sign in',
  'auth.pending': 'Signing in…',
  'auth.google': 'Continue with Google',
  'auth.googleAide': 'Required to send emails from your account.',
  'auth.error.credentials': 'Incorrect email address or password.',
  'auth.error.generic': 'Sign-in failed: {message}',
  'auth.noSignup': 'Single account, created in Supabase. There is no sign-up on this screen.',

  'app.loading': 'Loading…',
  'app.error.title': 'Could not read the data',
  'app.error.retry': 'Try again',

  'today.title': 'Today',
  'today.subtitle': 'What the database knows, and what it does not know yet.',

  'today.section.followUps': 'Follow-ups due',
  'today.section.newHighScore': 'New high-scoring prospects',

  'today.empty.followUps':
    'No follow-up: the pipeline table holds no rows yet. Nothing writes to it so far.',
  'today.empty.newHighScore': 'No scored prospect yet.',
  'today.empty.search': 'No row matches your search.',

  'today.reason.followUp.today': 'follow-up due today',
  'today.reason.followUp.late': 'follow-up {days} days overdue',
  'today.reason.followUp.late_one': 'follow-up one day overdue',
  'today.reason.followUp.future': 'follow-up due in {days} days',
  'today.reason.followUp.future_one': 'follow-up due tomorrow',
  'today.reason.followUp.undated': 'follow-up with no date set',

  'today.reason.separator': ' · ',

  // Prospect watch, by status tab (mockups Veille.dc.html, VeilleEtats.dc.html).
  'veille.titre': 'All prospects',
  'veille.onglets.aria': 'Follow-up status',
  'veille.onglet.toutes': 'All',
  'veille.onglet.compte.aria': '{label}: {count} prospects',
  'veille.onglet.compte.aria_one': '{label}: {count} prospect',

  // The count line of `TableVeille.tsx`: what the tab shows, and what it does not.
  'veille.compte.a_contacter': '{classables} rankable, out of {total} with no follow-up row',
  'veille.compte.statut': '{count} prospects, out of {classables} rankable',
  'veille.compte.statut_one': '{count} prospect, out of {classables} rankable',
  'veille.compte.vide': 'no prospect at this status',
  'veille.compte.toutes': '{classables} rankable, out of {total} prospects on record',
  'veille.sansScore': '{count} never scored, not rankable',
  'veille.sansScore_one': '{count} never scored, not rankable',
  'veille.sansScore.hint':
    'A missing score is not a zero score: these prospects have no rank, and therefore appear in no tab. The “score” stage has not run on them.',

  'veille.colonne.score': 'Score',
  'veille.colonne.prospect': 'Prospect',
  'veille.colonne.presence': 'Web presence',
  'veille.colonne.telephone': 'Phone',
  'veille.colonne.site': 'Site',
  'veille.colonne.suivi': 'Follow-up',
  'veille.colonne.prochaineAction': 'Next action',
  'veille.colonne.closDepuis': 'Closed for',
  'veille.colonne.depuis': 'For',
  'veille.colonne.statut': 'Status',

  'veille.tri.score_desc': 'Sort: score, highest first',
  'veille.tri.score_asc': 'Sort: score, lowest first',

  // The "Phone" column and the contextual column of `RangeeVeille.tsx`.
  'veille.telephone.mobile': 'mobile',
  'veille.telephone.fixe': 'landline',
  'veille.telephone.absent': 'no contact details',
  'veille.telephone.absent.detail': '“enrich” stage has not run',

  'veille.echeance.aujourdhui': 'today',
  'veille.echeance.retard': '{days} days overdue',
  'veille.echeance.retard_one': 'one day overdue',
  'veille.echeance.future': 'in {days} days',
  'veille.echeance.future_one': 'tomorrow',
  'veille.echeance.absente': 'undated',
  'veille.depuis': '{days} days',
  'veille.depuis_one': '{days} day',
  'veille.depuis.absente': 'undated',

  // The named empty states of `TableVeille.tsx` (mockup `VeilleEtats.dc.html`,
  // blocks A to D): one absence per tab, never a generic text.
  'veille.vide.a_contacter.titre': 'No prospect left to contact',
  'veille.vide.a_contacter.texte':
    'Every scored prospect carries a decision. Collection will bring more.',
  'veille.vide.contacte.titre': 'No prospect contacted yet',
  'veille.vide.contacte.texte':
    'A prospect lands here as soon as a first message goes out. The tab stays visible at zero: it is a step of the journey, not missing data.',
  'veille.vide.relance.titre': 'No follow-up in progress',
  'veille.vide.relance.texte':
    'A prospect followed up without an answer lands here. The tab stays visible at zero: it is a step of the journey, not missing data.',
  'veille.vide.interesse.titre': 'No interested prospect yet',
  'veille.vide.interesse.texte':
    'A prospect lands here when they answer favourably. The tab stays visible at zero: it is a step of the journey, not missing data.',
  'veille.vide.gagne.titre': 'No sale closed yet',
  'veille.vide.gagne.texte':
    'The first prospect marked “Won” will also unlock the locked milestone in the brief. The table is new, not broken.',
  'veille.vide.perdu.titre': 'No prospect lost',
  'veille.vide.perdu.texte':
    'A prospect marked “Lost” leaves the work queues but keeps its tab: you must be able to read back why a lead closed.',
  'veille.vide.ne_pas_contacter.titre': 'No opt-out recorded',
  'veille.vide.ne_pas_contacter.texte':
    'A prospect who asks not to be contacted again lands here, permanently. An empty list is good news, not a reading failure.',
  'veille.vide.toutes.titre': 'No rankable prospect',
  'veille.vide.toutes.texte':
    'No prospect has a score yet: the “score” stage has not run. Collection and scoring will fill this table.',
  'veille.vide.sortie': 'See the {count} to contact',
  'veille.vide.recherche.titre': 'No row matches your search',
  'veille.vide.recherche.texte':
    '{count} prospects are indeed in this tab — none matches “{query}”.',
  'veille.vide.recherche.texte_one':
    '{count} prospect is indeed in this tab — it does not match “{query}”.',
  'veille.vide.recherche.effacer': 'Clear the search',

  // Today's brief, collapsible (mockups Veille.dc.html, VeilleCompacte.dc.html).
  // No `veille.brief.objectif`: the collapsed summary reuses
  // `jeu.objectif.titre` and `jeu.objectif.denominateur.inconnu`
  // (`ui/BandeProgression.tsx`) rather than duplicating what those keys
  // already say — see `ui/BriefDuJour.tsx`.
  'veille.brief.titre': 'Today’s brief',
  'veille.brief.replier': 'Collapse the brief',
  'veille.brief.deplier': 'Expand',
  'veille.brief.relances': '{count} follow-ups due, {retard} overdue',
  'veille.brief.relances_one': '{count} follow-up due, {retard} overdue',
  'veille.brief.relances.aucune': 'no follow-up due',

  // The only two trades in `packages/core/src/trades.ts`.
  'trade.plombier': 'Plumber',
  'trade.serrurier': 'Locksmith',

  // The pagination bar, in the kit (`ui/kit/Pagination.tsx`): shared with the
  // Deployments screen, it knows neither prospect, nor tab, nor score.
  'pagination.etendue': '{premier}–{dernier} of {total}',
  'pagination.taille': '{count} per page',
  'pagination.unePage': 'a single page — page buttons are not shown',
  'pagination.precedentes': 'Previous',
  'pagination.suivantes': 'Next',
  'pagination.page.aria': 'Page {page} of {pages}',
  'pagination.aria': 'List pagination',

  'jeu.objectif.titre': "Today's goal",
  'jeu.objectif.valeur': '{count} follow-ups honored',
  'jeu.objectif.valeur_one': '{count} follow-up honored',
  'jeu.objectif.hint':
    'Median follow-ups honored per day, over the last fourteen full calendar days — not an imposed number.',
  'jeu.objectif.insuffisant.titre': 'Not enough history yet',
  'jeu.objectif.insuffisant.detail':
    'No full calendar day has been observed yet: no reliable median can be derived from it. This goal will appear once there is one.',
  'jeu.objectif.medianeNulle.titre': 'No goal to suggest yet',
  'jeu.objectif.medianeNulle.detail':
    'The goal is based on days with at least one follow-up honored: there are not enough of those yet to suggest one.',
  'jeu.objectif.denominateur': '/ {objectif}',
  'jeu.objectif.denominateur.inconnu': 'not yet',

  'jeu.palier.titre': 'Tier {numero}',
  'jeu.palier.nom.1': 'Prospector',
  'jeu.palier.nom.2': 'Closer',
  'jeu.palier.avecNom': 'Tier {nom}',
  'jeu.palier.fleche': '→',
  'jeu.palier.points': '{points} / {seuil} points',
  'jeu.palier.incomplet': 'Minimum total: follow-ups honored are not counted in this score yet.',
  'jeu.palier.poids.relanceTenue': '+{points} pts · follow-up honored',
  'jeu.palier.poids.siteMisEnLigne': '+{points} pts · site published',
  'jeu.palier.poids.rendezVousObtenu': '+{points} pts · meeting obtained',

  'jeu.badge.premiere_relance_tenue': 'First follow-up honored',
  'jeu.badge.premier_site_en_ligne': 'First site online',
  'jeu.badge.premier_rendez_vous': 'First meeting',
  'jeu.badge.serie_sept_jours': 'Seven-day streak',
  'jeu.badge.etat.obtenu': 'Earned',
  'jeu.badge.etat.verrouille': 'Locked',
  'jeu.badge.etat.non_mesurable': 'Not measurable',
  'jeu.badge.nonMesurable.hint':
    'No action can unlock this badge today: the measurement it needs has no reliable server-side source yet.',
  'jeu.badge.aria': '{etat} — {nom}',

  'jeu.serie.titre': 'Current streak',
  'jeu.serie.jours': '{count} days',
  'jeu.serie.jours_one': '{count} day',
  'jeu.serie.auMoins': 'At least {count} days',
  'jeu.serie.hint': 'Consecutive calendar days with at least one follow-up honored.',

  'jeu.chargement': 'Loading the game panel…',
  'jeu.erreur': 'The game panel could not load: {message}',

  'score.absent': 'not scored yet',
  'score.absent.hint': 'This prospect has no score, which is not the same as a score of zero.',
  'warning.badge': '{count} flags',
  'warning.badge_one': '1 flag',
  'warning.title': 'Flags',
  'warning.hint':
    'These gaps are fixed by replaying the collector stages. This screen reports them; it does not repair them.',
  'warning.presenceContradicted':
    'The “no web presence” category is contradicted by the declared site {url} — the score is likely inverted, not merely out of date.',
  'warning.scorePredatesEnrichment':
    'Score computed before the Google enrichment: it ignores the phone, rating and website found since.',
  'warning.staleRuleset':
    'Score computed with ruleset {stored}, while the ruleset in force is {current}.',
  'score.group.presence': 'Presence',
  'score.group.vitalite': 'Vitality',
  'score.group.joignabilite': 'Reachability',
  'score.group.disqualifiant': 'Disqualifiers',
  'score.bar.label': 'Score {total} out of 100: {detail}',
  'score.gauge.aria': 'Score of {total} out of 100',
  'score.outOfShort': 'out of 100',
  'score.receipt.open': 'Show the line-by-line receipt',
  'score.receipt.close': 'Hide the receipt',

  'presence.none': 'No web presence',
  'presence.social_only': 'Social page, no website',
  'presence.directory_only': 'Directory listing only',
  'presence.dead_site': 'Broken or outdated website',
  'presence.has_site': 'Sound, live website',
  'presence.absent': 'Web presence not probed yet',

  'enrichment.ok': 'Google listing matched',
  'enrichment.not_found': 'No Google listing found',
  'enrichment.ambiguous': 'Match to be decided',
  'enrichment.blocked': 'Enrichment blocked by Google',
  'enrichment.absent': 'No contact details: the "enrich" stage has not run on this prospect.',
  'enrichment.reviews.hint':
    'Google stopped publishing review counts in August 2026. Re-running enrichment will not fill this field.',
  'enrichment.confidence.hint':
    'Confidence in the match with the Google listing. Below the high threshold the match is a bet — and a wrong match is paid for on the phone.',

  'panel.close': 'Close panel',
  'panel.empty': 'Choose a prospect to see its record.',
  'panel.section.identity': 'Identity',
  'panel.section.contact': 'Contact details',
  'panel.section.web': 'Web presence',
  'panel.section.score': 'Score breakdown',
  'panel.position': '{index} of {total}',
  'panel.position.horsFiltre': 'Outside the current search filter',

  'panel.tab.fiche': 'Details',
  'panel.tab.site': 'Site',
  'panel.tab.messages': 'Messages',
  'panel.tab.historique': 'History',

  'field.siret': 'SIRET',
  'field.address': 'Address',
  'field.created': 'Founded',
  'field.staff': 'Headcount',
  'field.phone': 'Phone',
  'field.rating': 'Google rating',
  'field.reviewCount': 'Reviews',
  'field.declaredUrl': 'Declared website',
  'field.matchedName': 'Matched name',
  'field.matchConfidence': 'Match confidence',

  'value.unknown': 'not recorded',
  'value.notCollected': 'not collected yet',
  'value.notPublished': 'not published by the source',
  'value.mobile': 'mobile',
  'value.landline': 'landline',

  'list.keyboardHint': 'Up and down arrows move between prospects, Escape closes the panel.',
  'list.overflow': '{count} more, not shown here',
  'list.overflow_one': '1 more, not shown here',

  'panel.section.site': 'Generated site',
  'panel.section.messages': 'Sales messages',
  'panel.section.pipeline': 'Follow-up',

  'site.badge.online': 'Site online',

  'site.absent': 'No copy yet: the "generate" stage has not run on this prospect.',
  'site.notPublished': 'Copy written, nothing published yet.',
  'site.notDeployed': 'Repository created, deployment has not completed.',
  'site.online': 'Online since {date}',
  'site.unpublished': 'Taken down on {date}',
  'site.rejected': 'Copy rejected on {date}',
  'site.rejected.hint':
    '"publish" now refuses it, and "generate" will write another one on its next pass.',
  'site.reject': 'Reject this copy',
  'site.unreject': 'Undo rejection',
  'site.redaction.hint':
    'Only what the model decided appears here. The facts — phone, rating, year — come from the database and could not have been invented.',
  'site.field.accroche': 'Tagline',
  'site.field.presentation': 'Introduction',
  'site.field.prestations': 'Selected services',
  'site.field.deployment': 'Live address',
  'site.field.repo': 'Repository',
  'site.trace': 'Written by {model}, prompt {version}',

  'messages.absent': 'No messages: the "pitch" stage has not run on this prospect.',
  'messages.manual': 'Nothing is sent automatically: these are read, then copied by hand.',
  'messages.channel.email': 'Email',
  'messages.channel.sms': 'SMS',
  'messages.channel.appel': 'Call script',
  'messages.subject': 'Subject',
  'messages.copy': 'Copy',
  'messages.copied': 'Copied',
  'messages.copyFailed': 'Copy failed: please select the text by hand.',
  'messages.sms.measure': '{chars} characters · {segments} SMS',
  'messages.sms.ucs2':
    'Characters outside the GSM alphabet ({chars}): the message switches to UCS-2 and counts as more parts.',
  'messages.trace': '{model} · prompt {version} · {date}',

  'pipeline.label': 'Status',
  'pipeline.absent': 'Never contacted',
  'pipeline.updated': 'Updated on {date}',
  'pipeline.status.a_contacter': 'To contact',
  'pipeline.status.contacte': 'Contacted',
  'pipeline.status.relance': 'Followed up',
  'pipeline.status.interesse': 'Interested',
  'pipeline.status.gagne': 'Won',
  'pipeline.status.perdu': 'Lost',
  'pipeline.status.ne_pas_contacter': 'Do not contact',
  'pipeline.refusalWarning':
    'The status is saved, but the site stays online until the next "prospeo unpublish": this dashboard holds no Vercel token, and never will.',
  'pipeline.historyFailed':
    'The status is saved, but this change will not be counted: {message}',

  'interaction.title': 'Log an exchange',
  'interaction.kind': 'Channel',
  'interaction.kind.appel': 'Call',
  'interaction.kind.whatsapp': 'WhatsApp',
  'interaction.kind.email': 'Email',
  'interaction.kind.sms': 'SMS',
  'interaction.kind.note': 'Note',
  'interaction.body': 'Note (optional)',
  'interaction.submit': 'Log',
  'interaction.saved': 'Exchange logged.',

  'action.pending': 'Saving…',
  'action.failed': 'Write refused: {message}',
  'action.call': 'Call {phone}',
  'action.noPhone': 'No number collected',
  'action.openSite': 'Open the site',
  'action.redeploy': 'Redeploy',
  'action.redeploy.reason':
    'Triggering a deployment from the interface ships with batch 2. Today `publish` and `deploy` are only callable from the command-line collector.',

  'unit.prospects': '{count} prospects',
  'unit.prospects_one': '{count} prospect',
  'unit.employees': 'at least {count} employees',
  'unit.employees_one': 'at least {count} employee',

  'bientot.label': 'Soon',
  'bientot.aria': 'Upcoming feature',

  'histo.discovered': 'Added to the base',
  'histo.generated': 'Copy generated',
  'histo.published': 'Site published',
  'histo.unpublished': 'Site taken down',
  'histo.rejected': 'Copy rejected',

  'histo.events.title': 'Detailed log',
  'histo.events.empty.titre': 'No event recorded',
  'histo.events.empty.detail': 'The latest known fact for this site dates back to {date}.',

  'histo.issue.demarre': 'Started',
  'histo.issue.reussi': 'Succeeded',
  'histo.issue.echoue': 'Failed',
  'histo.issue.ignore': 'Skipped',

  'deploiements.title': 'Deployments',
  'deploiements.subtitle':
    'One site per prospect, generated from the template then built by Vercel. Each row says where it stands, and why it stopped there.',

  'deploiements.kpi.enLigne': 'online',
  'deploiements.kpi.enCours': 'in progress',
  'deploiements.kpi.enEchec': 'failed',
  'deploiements.kpi.peremption': 'expiring within {days} d',
  'deploiements.kpi.peremption.tipTitre': 'Takedown at 90 days',
  'deploiements.kpi.peremption.hint':
    '{count} sites will reach 90 days of publication within {days} d and will be taken down automatically.',
  'deploiements.kpi.peremption.hint_one':
    'One site will reach 90 days of publication within {days} d and will be taken down automatically.',

  'deploiements.filtre.tous': 'All',
  'deploiements.filtre.enCours': 'In progress',
  'deploiements.filtre.echec': 'Failed',
  'deploiements.filtre.jamais': 'Never deployed',

  'deploiements.colonnes.prospect': 'Prospect',
  'deploiements.colonnes.gabarit': 'Template',
  'deploiements.colonnes.piste': 'Draft · Repo · Project · Build · Live',
  'deploiements.colonnes.etat': 'Status',
  'deploiements.colonnes.duree': 'Duration',
  'deploiements.colonnes.adresse': 'Address',

  'deploiements.etape.redaction': 'Draft',
  'deploiements.etape.depot': 'Repository',
  'deploiements.etape.projet': 'Vercel project',
  'deploiements.etape.build': 'Build',
  'deploiements.etape.en_ligne': 'Go-live',
  'deploiements.etape.retrait': 'Takedown',
  'deploiements.etape.inconnue': 'unknown step',

  'deploiements.etat.jamais': 'Never deployed',
  'deploiements.etat.enCours': '{etape} in progress',
  'deploiements.etat.echec': '{etape} failed',
  'deploiements.etat.enLigne': 'Online',
  'deploiements.etat.retire': 'Unpublished',

  'deploiements.piste.aria': 'Deployment track: {etat}',

  'deploiements.peremption.badge': 'Expires in {days} d',
  'deploiements.peremption.badge_one': 'Expires tomorrow',
  'deploiements.peremption.today': 'Expires today',
  'deploiements.peremption.tipDetail':
    "Published on {date}. A site published under a third party's name is automatically taken down 90 days after publication.",

  'deploiements.row.score': 'score {score}',
  'deploiements.row.duree': '{min} m {sec}',
  'deploiements.row.adresseAbsente': 'no address yet',
  'deploiements.row.horsLigne': 'offline',
  'deploiements.row.echecSansDetail': 'The deployment failed, with no detail recorded.',
  'deploiements.row.gabaritAbsent': 'no active template',

  'deploiements.empty.titre': 'No deployments',
  'deploiements.empty.detail':
    'No prospect has a generated site yet. This screen will fill in as drafts are written.',
  'deploiements.empty.filtre.titre': 'No deployments in this filter',
  'deploiements.empty.filtre.detail': 'Choose "All" to see every deployment again.',

  'nav.campagne': 'Campaign',

  'campagne.title': 'Prospecting campaign',
  'campagne.subtitle':
    'The 20 highest-scoring prospects nobody has touched yet, plus the ones you have already started. A site, an email, a send — in that order.',

  'campagne.col.prospect': 'Prospect',
  'campagne.col.piste': 'Site · Email · Send',
  'campagne.col.etat': 'Status',

  'campagne.etat.jamais': 'Never deployed',
  'campagne.etat.enFile': 'Queued · #{rang}',
  'campagne.etat.siteEnCours': 'Site in progress',
  'campagne.etat.siteEchec': 'Deployment failed',
  'campagne.etat.mailARelire': 'Email to review',
  'campagne.etat.adresseManquante': 'Missing address',
  'campagne.etat.envoiIncertain': 'Send uncertain',
  'campagne.etat.envoiEchec': 'Send failed',
  'campagne.etat.envoye': 'Sent',

  'campagne.piste.site': 'Site',
  'campagne.piste.mail': 'Email',
  'campagne.piste.envoi': 'Send',
  'campagne.piste.segment': '{segment}: {etat}',
  'campagne.piste.etat.vide': 'not started',
  'campagne.piste.etat.enCours': 'in progress',
  'campagne.piste.etat.ok': 'done',
  'campagne.piste.etat.echec': 'failed',
  'campagne.piste.etat.bloque': 'waiting on information',

  'campagne.sansScore':
    '{count} prospects have never been scored: they cannot be ranked, and do not appear in this batch.',
  'campagne.sansScore_one':
    '{count} prospect has never been scored: it cannot be ranked, and does not appear in this batch.',

  'campagne.action.deployer': 'Deploy',
  'campagne.action.rejouer': 'Replay',
  'campagne.action.relire': 'Review',
  'campagne.action.retirer': 'Remove',
  'campagne.action.impossible':
    'The collector is stopped: a request filed now would not go anywhere.',
  'relecture.destinataire': 'Recipient',
  'relecture.origine.saisie': 'Entered',
  'relecture.origine.collecte': 'Collected',
  'relecture.origine.aucune': 'No address',
  'relecture.origineAide.saisie': 'Address typed by hand on this screen.',
  'relecture.origineAide.collecte': 'Address collected automatically during enrichment.',
  'relecture.origineAide.aucune':
    'No address was found or entered. Entering one makes sending possible.',
  'relecture.corriger': 'Correct',
  'relecture.saisir': 'Enter the address',
  'relecture.enregistrer': 'Save',
  'relecture.annuler': 'Cancel',
  'relecture.objet': 'Subject',
  'relecture.corps': 'Message body',
  'relecture.tracabilite': 'Written by {modele} · instructions {consignes} · {date}',
  'relecture.pasDeMail': 'No email has been written for this prospect yet.',
  'relecture.partiraDe': 'The email will be sent from {expediteur}. Replies will land in that inbox.',
  'relecture.consequence':
    'On sending, the prospect moves to “contacted” and the exchange joins its history.',
  'relecture.envoyer': 'Send',
  'relecture.envoiEnCours': 'Sending…',
  'relecture.dejaEnvoye': 'Already sent',
  'relecture.echecPrise': 'A send is already under way or completed for this prospect.',
  'relecture.echecGmail': 'Gmail refused the send: {message}',
  'relecture.echecSuite':
    'The email was sent, but the follow-up failed: {message}. The prospect may be one status behind.',
  'relecture.adresseEchec': 'The address could not be saved: {message}',

  'campagne.envoi.titre': 'Sending ready',
  'campagne.envoi.pret': 'The email will be sent from {expediteur}.',
  'campagne.envoi.sansJeton': 'No sending account',
  'campagne.envoi.sansJetonRaison':
    'Session opened with a password. Deployment and drafting work; sending does not.',
  'campagne.envoi.sansJetonRemede':
    'Sending requires a Google token, which is only granted at sign-in. Deploying and drafting stay available until then.',
  'campagne.envoi.sansJetonAction': 'Sign in again with Google',
  'campagne.envoi.expire': 'Token expired',
  'campagne.envoi.expireRaison':
    'Sending is paused. Nothing is lost: the drafts live in the database.',
  'campagne.envoi.expireRemede':
    'The sending token lasts one hour and does not renew itself. Signing in again resumes where sending stopped.',
  'campagne.envoi.expireAction': 'Sign in again and resume',
  'campagne.worker.ecoute': 'Collector listening',
  'campagne.worker.arret': 'Collector stopped',
  'campagne.worker.arret.raison':
    'No sign of life for {minutes} min. Requests filed now will wait for its return.',
  'campagne.worker.arret.remede':
    'Restart it with pnpm --filter @prospeo/collector start worker. Nothing is lost: the queue lives in the database.',
  'campagne.worker.inconnu': 'Collector state unknown',
  'campagne.worker.inconnu.raison':
    'No heartbeat has ever been recorded. As long as we know nothing about it, we treat it as stopped.',
  'campagne.vide.lotFini': 'The batch is done',
  'campagne.vide.lotFini.detail': 'The highest-scoring prospects have all been reached.',
  'campagne.vide.aucunProspect': 'No prospects',
  'campagne.vide.aucunProspect.detail':
    'The database holds no prospects. Nothing was filtered out: there is nothing.',

  'gabarit.title': 'Site template',
  'gabarit.subtitle':
    'Every published site is generated from a GitHub repository marked as a template. Designating one here replaces the template shipped with the application, without touching any code.',

  'gabarit.actif.titre': 'Active template',
  'gabarit.actif.badge': 'Active',
  'gabarit.actif.absent': 'No template designated — the template shipped with the application applies.',
  'gabarit.actif.branche': 'Branch {branch}',
  'gabarit.actif.controle.jamais': 'Never checked',
  'gabarit.actif.controle.ok': 'Check passed on {date}',
  'gabarit.actif.controle.echec': 'Check failed on {date}',
  'gabarit.actif.controle.echecSansDetail': 'Check failed, with no detail recorded.',
  'gabarit.actif.revenir': 'Revert to the default template',
  'gabarit.actif.aucunMetier':
    'No current trade is governed by this template: each trade declares its own, which wins. It will apply to the first trade without an exception.',

  'gabarit.ordre.titre': 'Resolution order',
  'gabarit.ordre.detail':
    'The trade’s own template wins over the active template designated here, which itself wins over the environment variable — the template shipped with the application.',

  'gabarit.designer.titre': 'Designate another repository',
  'gabarit.designer.aide':
    'The repository must belong to the organization and be marked "Template repository" on GitHub.',
  'gabarit.designer.champRepo': 'Repository (org/name)',
  'gabarit.designer.champBranche': 'Branch',
  'gabarit.designer.soumettre': 'Designate this repository',

  'gabarit.verifier.label': 'Check',
  'gabarit.verifier.raison':
    'The automatic check has not been written yet — neither here nor in the collector. It will have to verify that the repository is reachable, marked as a template, and contains src/content/site.json. Until then, "never checked" is what this card will keep showing.',

  'gabarit.metiers.titre': 'Exceptions by trade',
  'gabarit.metiers.aide':
    'A trade can keep its own model. Without an exception, it receives the active template.',
  'gabarit.metiers.herite': 'inherits the active one',
  'gabarit.metiers.exception': 'exception',

  'gabarit.portee':
    'Changing the template only affects future deployments. Sites already online keep the model they were built with.',
};
