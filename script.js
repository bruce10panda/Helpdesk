// Het rooster zelf (HOURS, SCHEDULE, NAME_COLOR, LOCATION, SCHOOL_YEAR) staat in rooster.js.

const DAY_LABELS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const SCHOOL_DAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag'];

// Pauzes = gaten tussen twee opeenvolgende lesuren.
const BREAKS = HOURS.slice(1)
  .map((hour, i) => ({ after: i, start: HOURS[i].end, end: hour.start }))
  .filter((b) => b.start !== b.end);

// ---------- Helpers ----------

function isSchoolDay(dayKey) {
  return SCHOOL_DAYS.includes(dayKey);
}

// Wie er op een dag in een bepaald lesuur zit (lege lijst als niemand).
function namesFor(dayKey, period) {
  return (SCHEDULE[dayKey] && SCHEDULE[dayKey][period]) || [];
}

// Lokale datum als 'YYYY-MM-DD' (geen toISOString: die rekent in UTC en kan rond
// middernacht een dag verspringen).
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Onbeschikbaarheden { naam, datum, periode } die de teamleider heeft ingevoerd via de beheeromgeving.
let absences = [];

async function loadAbsences() {
  try {
    const res = await fetch('afwezig.json', { cache: 'no-store' });
    if (!res.ok) return;
    const list = await res.json();
    absences = Array.isArray(list) ? list : [];
  } catch (err) {
    // Geen internet of het bestand ontbreekt: dan gaan we ervan uit dat er geen meldingen zijn.
  }
}

// Haalt iemand die voor die datum/lesuur als onbeschikbaar staat uit een namenlijst.
function absenceFilter(names, date, period) {
  if (!absences.length) return names;
  const key = dateKey(date);
  return names.filter((n) => !absences.some((a) => a.naam === n && a.datum === key && a.periode === period));
}

function atTime(baseDate, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(date) {
  return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function nameBadge(name) {
  const color = NAME_COLOR[name] || 'dark';
  return `<span class="badge badge-${color}">${name}</span>`;
}

function minutesUntil(now, date) {
  return Math.max(1, Math.round((date - now) / 60000));
}

// Alle lesuren van vandaag tot `daysAhead` dagen vooruit.
function buildOccurrences(fromDate, daysAhead) {
  const occurrences = [];
  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(fromDate);
    day.setDate(day.getDate() + i);
    day.setHours(0, 0, 0, 0);

    const dayKey = DAY_LABELS[day.getDay()];
    if (!isSchoolDay(dayKey)) continue; // weekend

    HOURS.forEach((hour) => {
      occurrences.push({
        date: new Date(day),
        dayKey,
        period: hour.period,
        start: atTime(day, hour.start),
        end: atTime(day, hour.end),
        names: absenceFilter(namesFor(dayKey, hour.period), day, hour.period),
      });
    });
  }
  return occurrences;
}

// Voegt aansluitende open lesuren samen tot één blok (bijv. 08:15–09:55).
function buildOpenBlocks(occurrences) {
  const blocks = [];
  occurrences.filter((o) => o.names.length).forEach((o) => {
    const last = blocks[blocks.length - 1];
    if (last && last.end.getTime() === o.start.getTime()) {
      last.end = o.end;
      last.periods.push(o.period);
    } else {
      blocks.push({ date: o.date, dayKey: o.dayKey, start: o.start, end: o.end, periods: [o.period] });
    }
  });
  return blocks;
}

function describeDay(now, date, dayKey) {
  if (isSameDate(now, date)) return 'Vandaag';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDate(tomorrow, date)) return 'Morgen';
  return capitalize(dayKey);
}

function describePeriods(periods) {
  return periods.length === 1
    ? `${periods[0]}e uur`
    : `${periods[0]}e t/m ${periods[periods.length - 1]}e uur`;
}

// ---------- Render: live status ----------

function renderNowCard(now, occurrences, blocks) {
  const card = document.getElementById('nowCard');
  const body = document.getElementById('nowCardBody');
  const current = occurrences.find((o) => now >= o.start && now < o.end);
  const next = blocks.find((b) => b.start > now);
  const nextText = next
    ? `${describeDay(now, next.date, next.dayKey).toLowerCase()} om ${formatTime(next.start)} uur`
    : null;

  const todayKey = DAY_LABELS[now.getDay()];
  const inBreak = isSchoolDay(todayKey) && BREAKS.find((b) => now >= atTime(now, b.start) && now < atTime(now, b.end));

  let state;
  let html;
  let tabLabel;

  if (current && current.names.length) {
    const block = blocks.find((b) => now >= b.start && now < b.end);
    state = 'open';
    tabLabel = `● Open tot ${formatTime(block.end)}`;
    html = `
      <p class="status"><span class="status-dot"></span>Open</p>
      <p class="status-text">Er zit nu iemand klaar, nog tot <strong>${formatTime(block.end)} uur</strong>.</p>
      <div class="badges">${current.names.map(nameBadge).join('')}</div>
    `;
  } else if (inBreak) {
    state = 'maybe';
    tabLabel = 'Pauze';
    html = `
      <p class="status"><span class="status-dot"></span>Pauze</p>
      <p class="status-text">Er is niemand ingeroosterd, maar in de pauze zit er vaak toch iemand. Loop even langs!</p>
      ${nextText ? `<p class="status-meta">Zeker open: ${nextText}</p>` : ''}
    `;
  } else if (current) {
    // Lesuur zonder rooster: misschien zit er iemand in een tussenuur.
    state = 'unscheduled';
    tabLabel = 'Niet ingeroosterd';
    html = `
      <p class="status"><span class="status-dot"></span>Niet ingeroosterd</p>
      <p class="status-text">Er staat nu niemand op het rooster. Soms zit er iemand in een tussenuur, dus kijken kan altijd.</p>
      ${nextText ? `<p class="status-meta">Zeker open: <strong>${nextText}</strong></p>` : ''}
    `;
  } else {
    state = 'closed';
    tabLabel = 'Gesloten';
    html = `
      <p class="status"><span class="status-dot"></span>Gesloten</p>
      <p class="status-text">Er zit nu niemand bij de helpdesk.</p>
      ${nextText ? `<p class="status-meta">Weer open: <strong>${nextText}</strong></p>` : ''}
    `;
  }

  card.dataset.state = state;
  body.innerHTML = html;

  renderTabStatus(state, tabLabel);
}

// ---------- Tabblad: titel + favicon volgen de status ----------

const BASE_TITLE = 'ICT Helpdesk — Dendron College';
const STATE_COLOR = { open: '#009987', maybe: '#5bc5f2', unscheduled: '#af1280', closed: '#e74310' };

function faviconFor(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
    + `<path d="M60 58H4L32 4z" fill="#ffcc00"/>`
    + `<circle cx="48" cy="46" r="13" fill="${color}" stroke="#fff" stroke-width="4"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function renderTabStatus(state, label) {
  const title = `${label} · ${BASE_TITLE}`;
  if (document.title !== title) document.title = title;

  const favicon = document.getElementById('favicon');
  const href = faviconFor(STATE_COLOR[state]);
  if (favicon && favicon.getAttribute('href') !== href) favicon.setAttribute('href', href);
}

function renderNextCard(now, blocks) {
  const body = document.getElementById('nextCardBody');
  const upcoming = blocks.filter((b) => b.start > now).slice(0, 3);

  if (!upcoming.length) {
    body.innerHTML = '<p class="status-text">Er is voorlopig geen helpdesk-uur gepland.</p>';
    return;
  }

  body.innerHTML = `
    <ul class="next-list">
      ${upcoming.map((b) => {
        const soon = isSameDate(now, b.date) && b.start - now < 60 * 60000
          ? `<span class="soon">over ${minutesUntil(now, b.start)} min</span>`
          : '';
        return `
          <li>
            <span class="next-day">${describeDay(now, b.date, b.dayKey)}${soon}</span>
            <span class="next-time">${formatTime(b.start)} – ${formatTime(b.end)}</span>
            <span class="next-period">${describePeriods(b.periods)}</span>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function renderClock(now) {
  const dayName = capitalize(DAY_LABELS[now.getDay()]);
  document.getElementById('clockLine').textContent = `Het is nu ${dayName} ${formatTime(now)} uur`;
}

function renderPrintMeta(now) {
  const dateLabel = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('printMeta').textContent = `Afgedrukt op ${dateLabel}`;
}

// ---------- Render: dagweergave (mobiel) ----------

let selectedDay = null;

function defaultDay(now) {
  const todayKey = DAY_LABELS[now.getDay()];
  return isSchoolDay(todayKey) ? todayKey : 'maandag';
}

function renderDayTabs(now) {
  const tabs = document.getElementById('dayTabs');
  const todayKey = DAY_LABELS[now.getDay()];

  tabs.innerHTML = SCHOOL_DAYS.map((dayKey) => `
    <button type="button" role="tab" class="day-tab${dayKey === todayKey ? ' is-today' : ''}"
      aria-selected="${dayKey === selectedDay}" data-day="${dayKey}">
      <span class="day-tab-short">${capitalize(dayKey.slice(0, 2))}</span>
      <span class="day-tab-long">${capitalize(dayKey)}</span>
    </button>
  `).join('');
}

function renderDayList(now) {
  const list = document.getElementById('dayList');
  const todayKey = DAY_LABELS[now.getDay()];
  const isToday = selectedDay === todayKey;
  const selectedDate = dateForDayInWeek(now, selectedDay);
  const rows = [];

  HOURS.forEach((hour, idx) => {
    const names = absenceFilter(namesFor(selectedDay, hour.period), selectedDate, hour.period);
    const isNow = isToday && now >= atTime(now, hour.start) && now < atTime(now, hour.end);
    const isPast = isToday && now >= atTime(now, hour.end);
    const classes = ['slot', names.length ? 'slot--open' : 'slot--closed', isNow && 'is-now', isPast && 'is-past']
      .filter(Boolean).join(' ');

    rows.push(`
      <li class="${classes}">
        <span class="slot-time"><strong>${hour.start}</strong> – ${hour.end}</span>
        <span class="slot-period">${hour.period}e uur${isNow ? ' <span class="now-tag">nu</span>' : ''}</span>
        <span class="slot-status">
          ${names.length ? `<span class="badges">${names.map(nameBadge).join('')}</span>` : '<span class="slot-closed">Niet ingeroosterd</span>'}
        </span>
      </li>
    `);

    const pause = BREAKS.find((b) => b.after === idx);
    if (pause) {
      const pauseNow = isToday && now >= atTime(now, pause.start) && now < atTime(now, pause.end);
      rows.push(`
        <li class="slot slot--break${pauseNow ? ' is-now' : ''}">
          <span class="slot-time">${pause.start} – ${pause.end}</span>
          <span class="slot-period">Pauze${pauseNow ? ' <span class="now-tag">nu</span>' : ''}</span>
        </li>
      `);
    }
  });

  list.innerHTML = rows.join('');
  list.setAttribute('aria-label', `Rooster ${selectedDay}`);
}

document.getElementById('dayTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-day]');
  if (!tab) return;
  selectedDay = tab.dataset.day;
  const now = new Date();
  renderDayTabs(now);
  renderDayList(now);
});

// ---------- Render: weekoverzicht ----------

function renderWeekTable(now) {
  const todayKey = DAY_LABELS[now.getDay()];

  document.getElementById('scheduleHead').innerHTML = `
    <th scope="col">Uur</th>
    ${SCHOOL_DAYS.map((d) => `<th scope="col" class="${d === todayKey ? 'is-today' : ''}">${capitalize(d)}${d === todayKey ? ' <span class="today-tag">vandaag</span>' : ''}</th>`).join('')}
  `;

  const rows = [];
  HOURS.forEach((hour, idx) => {
    const cells = SCHOOL_DAYS.map((dayKey) => {
      const isToday = dayKey === todayKey;
      const names = absenceFilter(namesFor(dayKey, hour.period), dateForDayInWeek(now, dayKey), hour.period);
      const isNow = isToday && now >= atTime(now, hour.start) && now < atTime(now, hour.end);
      const classes = [names.length ? 'is-open' : '', isToday ? 'is-today' : '', isNow ? 'is-now' : '']
        .filter(Boolean).join(' ');
      const content = names.length
        ? `<div class="badges">${names.map(nameBadge).join('')}</div>`
        : '<span class="cell-empty" aria-label="gesloten">–</span>';
      return `<td class="${classes}">${content}</td>`;
    }).join('');

    rows.push(`
      <tr>
        <th scope="row"><span class="row-period">${hour.period}e uur</span><span class="row-time">${hour.start} – ${hour.end}</span></th>
        ${cells}
      </tr>
    `);

    const pause = BREAKS.find((b) => b.after === idx);
    if (pause) {
      rows.push(`
        <tr class="break-row">
          <th scope="row">Pauze</th>
          <td colspan="${SCHOOL_DAYS.length}">${pause.start} – ${pause.end}</td>
        </tr>
      `);
    }
  });

  document.getElementById('scheduleBody').innerHTML = rows.join('');
}

// ---------- Melden: niemand aanwezig ----------

function slotKey(dayKey, period) {
  return `${dayKey}|${period}`;
}

// Maandag 00:00 van de week waarin `date` valt.
function mondayOfWeek(date) {
  const d = new Date(date);
  const offset = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

// De datum van `dayKey` (bijv. 'woensdag') in dezelfde week als `referenceDate`.
function dateForDayInWeek(referenceDate, dayKey) {
  const d = mondayOfWeek(referenceDate);
  d.setDate(d.getDate() + SCHOOL_DAYS.indexOf(dayKey));
  return d;
}

// Alle lesuren van deze week (t/m nu) waar wél iemand op het rooster staat.
// Toekomstige lesuren kun je niet melden, want dan weet je nog niet of er iemand zit.
function buildWeekSlots(now) {
  const monday = mondayOfWeek(now);
  const slots = [];
  SCHOOL_DAYS.forEach((dayKey, dayIndex) => {
    const dayDate = new Date(monday);
    dayDate.setDate(dayDate.getDate() + dayIndex);
    HOURS.forEach((hour) => {
      const names = absenceFilter(namesFor(dayKey, hour.period), dayDate, hour.period);
      if (!names.length) return;
      const start = atTime(dayDate, hour.start);
      if (start > now) return;
      slots.push({ dayKey, period: hour.period, start: hour.start, end: hour.end, names });
    });
  });
  return slots;
}

// Het lesuur waar we nu middenin zitten, als daar iemand voor is ingeroosterd.
function currentSlotKey(now) {
  const todayKey = DAY_LABELS[now.getDay()];
  if (!isSchoolDay(todayKey)) return null;
  const hour = HOURS.find((h) => now >= atTime(now, h.start) && now < atTime(now, h.end));
  if (!hour || !namesFor(todayKey, hour.period).length) return null;
  return slotKey(todayKey, hour.period);
}

function renderReportSlots(now) {
  const select = document.getElementById('reportSlot');
  if (!select) return;
  const slots = buildWeekSlots(now);
  const activeKey = currentSlotKey(now);

  if (!slots.length) {
    select.innerHTML = '<option value="" disabled selected>Nog geen lesuren geweest deze week</option>';
    return;
  }

  select.innerHTML = slots.map((s) => {
    const key = slotKey(s.dayKey, s.period);
    return `<option value="${key}">${capitalize(s.dayKey)} · ${s.period}e uur (${s.start}–${s.end}) — ${s.names.join(', ')}</option>`;
  }).join('');

  if (activeKey && slots.some((s) => slotKey(s.dayKey, s.period) === activeKey)) {
    select.value = activeKey;
  }
}

function resetReportForm() {
  const form = document.getElementById('reportForm');
  const status = document.getElementById('reportStatus');
  if (!form) return;
  form.reset();
  renderReportSlots(new Date());
  status.textContent = '';
  status.removeAttribute('data-tone');
}

function initReportForm() {
  const openBtn = document.getElementById('reportOpenBtn');
  const cancelBtn = document.getElementById('reportCancelBtn');
  const dialog = document.getElementById('reportDialog');
  const form = document.getElementById('reportForm');
  const status = document.getElementById('reportStatus');
  if (!openBtn || !dialog || !form) return;

  openBtn.addEventListener('click', () => {
    resetReportForm();
    dialog.showModal();
  });

  cancelBtn.addEventListener('click', () => dialog.close());

  // Stuurt de melding (via een verborgen iframe, zodat je op de pagina blijft) naar de helpdesk-ticketing.
  form.addEventListener('submit', () => {
    const slotSelect = document.getElementById('reportSlot');
    const [dayKey, periodStr] = slotSelect.value.split('|');
    const slot = buildWeekSlots(new Date()).find((s) => s.dayKey === dayKey && String(s.period) === periodStr);

    const naam = document.getElementById('reportName').value.trim() || 'Onbekend';
    const namen = slot && slot.names.length ? slot.names.join(', ') : 'Er';
    const werkwoord = slot && slot.names.length === 1 ? 'was' : 'waren';
    const periode = slot ? `${slot.period}e` : periodStr;

    document.getElementById('reportContactName').value = naam;
    document.getElementById('reportSubject').value = `${namen} ${werkwoord} er niet het ${periode} uur`;

    status.textContent = 'Bezig met versturen…';
    status.removeAttribute('data-tone');
    setTimeout(() => {
      status.textContent = 'Bedankt! Je melding is verstuurd.';
      status.dataset.tone = 'ok';
      setTimeout(() => {
        dialog.close();
        resetReportForm();
      }, 1800);
    }, 800);
  });
}

// ---------- Init ----------

function update() {
  const now = new Date();
  const occurrences = buildOccurrences(now, 9);
  const blocks = buildOpenBlocks(occurrences);
  if (!selectedDay) selectedDay = defaultDay(now);

  renderNowCard(now, occurrences, blocks);
  renderNextCard(now, blocks);
  renderClock(now);
  renderDayTabs(now);
  renderDayList(now);
  renderWeekTable(now);
  renderPrintMeta(now);
}

document.getElementById('printBtn').addEventListener('click', () => window.print());

// Vaste teksten uit rooster.js invullen.
document.querySelectorAll('[data-location]').forEach((el) => { el.textContent = LOCATION.place; });
document.querySelectorAll('[data-location-warning]').forEach((el) => { el.textContent = LOCATION.warning; });
document.querySelectorAll('[data-school-year]').forEach((el) => { el.textContent = SCHOOL_YEAR; });

// Web-app: offline beschikbaar en installeerbaar (alleen via http(s), niet via file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

initReportForm();

loadAbsences().then(update);
update();
setInterval(update, 30000);
setInterval(loadAbsences, 5 * 60000);
