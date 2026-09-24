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
        names: namesFor(dayKey, hour.period),
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
  const rows = [];

  HOURS.forEach((hour, idx) => {
    const names = namesFor(selectedDay, hour.period);
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
      const names = namesFor(dayKey, hour.period);
      const isToday = dayKey === todayKey;
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

update();
setInterval(update, 30000);
