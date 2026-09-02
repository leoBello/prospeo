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
  'nav.signOut': 'Sign out',

  'theme.toDark': 'Switch to dark theme',
  'theme.toLight': 'Switch to light theme',
  'locale.switch': 'Français',

  'auth.title': 'Prospeo',
  'auth.subtitle': 'Sign in to the prospecting dashboard',
  'auth.email': 'Email address',
  'auth.password': 'Password',
  'auth.submit': 'Sign in',
  'auth.pending': 'Signing in…',
  'auth.error.credentials': 'Incorrect email address or password.',
  'auth.error.generic': 'Sign-in failed: {message}',
  'auth.noSignup': 'Single account, created in Supabase. There is no sign-up on this screen.',

  'app.loading': 'Loading…',
  'app.error.title': 'Could not read the data',
  'app.error.retry': 'Try again',

  'today.title': 'Today',
  'today.subtitle': 'What the database knows, and what it does not know yet.',

  'today.kpi.inBase': 'In database',
  'today.kpi.contacted': 'Contacted',
  'today.kpi.interested': 'Interested',
  'today.kpi.qualified': 'Scored',

  'today.section.followUps': 'Follow-ups due',
  'today.section.newHighScore': 'New high-scoring prospects',

  'today.empty.followUps':
    'No follow-up: the pipeline table holds no rows yet. Nothing writes to it so far.',
  'today.empty.newHighScore': 'No scored prospect yet.',

  'today.reason.followUp.today': 'follow-up due today',
  'today.reason.followUp.late': 'follow-up {days} days overdue',
  'today.reason.followUp.late_one': 'follow-up one day overdue',
  'today.reason.followUp.future': 'follow-up due in {days} days',
  'today.reason.followUp.future_one': 'follow-up due tomorrow',
  'today.reason.followUp.undated': 'follow-up with no date set',

  'today.reason.separator': ' · ',

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
  'histo.detail.title': 'Step-by-step deployment log',
  'histo.detail.reason':
    'Every deployment step will be dated here: repository created, project opened, build, go-live.',
  'histo.detail.blocked':
    'No events table exists: `prospect_site` holds a current state, not a history. Nothing can be dated step by step before the §4.1 migration.',
};
