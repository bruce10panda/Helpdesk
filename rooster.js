// =====================================================================
//  ROOSTER ICT HELPDESK — dit is het enige bestand dat je hoeft aan te passen
// =====================================================================
//
//  Iemand inroosteren?
//    Zet de naam bij de juiste dag en het juiste lesuur in SCHEDULE.
//    Voorbeeld:  maandag: { 1: ['Bruce'], 2: ['Bert', 'Robin'] }
//    Een uur waar niemand zit laat je gewoon weg.
//
//  Nieuwe helpdesker?
//    Geef diegene een kleur in NAME_COLOR. Kies uit:
//    teal, red, lightblue, magenta, orange, yellow, blue, lime, dark
//    (zonder kleur wordt het automatisch 'dark').
//
//  Lestijden veranderd?
//    Pas HOURS aan. De pauzes worden automatisch berekend uit de gaten
//    tussen twee lesuren (bijv. 10:45 – 11:05).
//
//  Let op: namen tussen 'aanhalingstekens', en vergeet de komma's niet.
//
//  Dit bestand kan ook automatisch bijgewerkt worden door de beheeromgeving (beheer.html).
// =====================================================================

const SCHOOL_YEAR = '2026-2027';

const LOCATION = {
  place: 'de mediatheek',
  warning: 'Let op: niet in E24!',
};

const HOURS = [
  { period: 1, start: '08:15', end: '09:05' },
  { period: 2, start: '09:05', end: '09:55' },
  { period: 3, start: '09:55', end: '10:45' },
  { period: 4, start: '11:05', end: '11:55' },
  { period: 5, start: '11:55', end: '12:45' },
  { period: 6, start: '13:15', end: '14:05' },
  { period: 7, start: '14:05', end: '14:55' },
  { period: 8, start: '15:05', end: '15:55' },
];

// Per dag: lesuur → wie er zit.
const SCHEDULE = {
  maandag: {
    1: ['Bruce'],
    2: ['Bert', 'Robin'],
    5: ['Jarne'],
    6: ['Teun'],
    7: ['Ruben'],
  },
  dinsdag: {
    1: ['Bruce'],
    2: ['Bruce', 'Bert'],
    3: ['Sjoerd'],
    4: ['Sjoerd'],
    5: ['Robin'],
  },
  woensdag: {
    5: ['Ruben'],
    6: ['Ruben'],
    7: ['Jarne'],
  },
  donderdag: {
    1: ['Bruce'],
    3: ['Robin'],
    6: ['Bert'],
    7: ['Ruben'],
  },
  vrijdag: {
    2: ['Bruce', 'Teun'],
    3: ['Robin', 'Jarne'],
    4: ['Bruce', 'Teun'],
    5: ['Robin', 'Jarne'],
  },
};

// Kleuren uit de huisstijl, zo dicht mogelijk bij ieders eigen kleur.
const NAME_COLOR = {
  Bruce: 'teal',
  Ruben: 'red',
  Bert: 'lightblue',
  Robin: 'magenta',
  Teun: 'orange',
  Jarne: 'yellow',
  Sjoerd: 'blue',
};
