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
  'today.kpi.responseRate': 'Response rate',
  'today.kpi.unavailable': 'not applicable',
  'today.kpi.unavailable.noPipeline': 'no prospect has been contacted yet',
  'today.kpi.unavailable.notModelled':
    'the schema does not tell an incoming exchange from an outgoing one',

  'today.section.followUps': 'Follow-ups due',
  'today.section.newHighScore': 'New high-scoring prospects',
  'today.section.awaiting': 'Awaiting qualification',
  'today.section.awaiting.hint':
    'No enrichment, no web presence, no score. These prospects exist; they have not been judged yet.',

  'today.empty.followUps':
    'No follow-up: the pipeline table holds no rows yet. Nothing writes to it so far.',
  'today.empty.newHighScore': 'No scored prospect yet.',
  'today.empty.awaiting': 'Every prospect in the database has been qualified.',

  'today.reason.followUp.today': 'follow-up due today',
  'today.reason.followUp.late': 'follow-up {days} days overdue',
  'today.reason.followUp.late_one': 'follow-up one day overdue',
  'today.reason.followUp.future': 'follow-up due in {days} days',
  'today.reason.followUp.future_one': 'follow-up due tomorrow',
  'today.reason.followUp.undated': 'follow-up with no date set',

  'today.reason.missing.enrichment': 'not enriched yet',
  'today.reason.missing.presence': 'web presence not probed yet',
  'today.reason.missing.score': 'not scored yet',
  'today.reason.separator': ' · ',

  'score.absent': 'not scored yet',
  'score.absent.hint': 'This prospect has no score, which is not the same as a score of zero.',
  'score.outOf': '{total} / 100',
  'score.stale': 'ruleset {stored}, current {current}',
  'score.stale.hint':
    'This score was computed with an earlier version of the ruleset. It does not reflect the current rules.',
  'score.total': 'Total',
  'score.group.presence': 'Web presence',
  'score.group.vitalite': 'Vitality',
  'score.group.joignabilite': 'Reachability',
  'score.group.disqualifiant': 'Disqualifiers',
  'score.bar.label': 'Score {total} out of 100: {detail}',

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
  'enrichment.absent': 'Not enriched yet',

  'panel.close': 'Close panel',
  'panel.empty': 'Select a prospect to see its record.',
  'panel.section.identity': 'Identity',
  'panel.section.contact': 'Contact details',
  'panel.section.web': 'Web presence',
  'panel.section.score': 'Score breakdown',
  'panel.position': '{index} of {total}',

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

  'unit.prospects': '{count} prospects',
  'unit.prospects_one': '{count} prospect',
  'unit.employees': 'at least {count} employees',
  'unit.employees_one': 'at least {count} employee',
};
