// ---------- Data: rooster ICT Helpdesk 2026-2027 ----------

const HOURS = [
  { period: 1, start: '08:15', end: '09:05' },
  { period: 2, start: '09:05', end: '09:55' },
  { period: 3, start: '09:55', end: '10:45' },
  { period: 4, start: '11:05', end: '11:55' },
  { period: 5, start: '11:55', end: '12:45' },
  { period: 6, start: '13:15', end: '14:05' },
  { period: 7, start: '14:05', end: '14:55' },
  { period: 8, start: '14:55', end: '15:45' },
];

// Per dag: namen per uur, in dezelfde volgorde als HOURS.
const SCHEDULE = {
  maandag: [['Bruce'], ['Bert', 'Robin'], [], [], ['Jarne'], ['Teun'], ['Ruben'], []],
  dinsdag: [['Bruce'], ['Bruce', 'Bert'], ['Sjoerd'], ['Sjoerd'], [], [], [], []],
  woensdag: [[], [], [], [], ['Ruben'], ['Ruben'], ['Jarne'], []],
  donderdag: [['Bruce'], [], ['Robin'], [], [], ['Bert'], ['Ruben'], []],
  vrijdag: [[], ['Bruce', 'Teun'], ['Robin', 'Jarne'], ['Bruce', 'Teun'], ['Robin', 'Jarne'], [], [], []],
};

const DAY_LABELS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

const NAME_COLOR = {
  Bruce: 'blue',
  Bert: 'orange',
  Robin: 'magenta',
  Sjoerd: 'teal',
  Jarne: 'lime',
  Teun: 'lightblue',
  Ruben: 'dark',
};

// ---------- Helpers ----------

function timeStringToDate(baseDate, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function nameBadge(name) {
  const color = NAME_COLOR[name] || 'dark';
  return `<span class="badge badge-${color}">${name}</span>`;
}

function buildOccurrences(fromDate, daysAhead) {
  const occurrences = [];
  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(fromDate);
    day.setDate(day.getDate() + i);
    day.setHours(0, 0, 0, 0);

    const dayKey = DAY_LABELS[day.getDay()];
    const daySchedule = SCHEDULE[dayKey];
    if (!daySchedule) continue; // weekend

    HOURS.forEach((hour, idx) => {
      occurrences.push({
        date: new Date(day),
        dayKey,
        period: hour.period,
        start: timeStringToDate(day, hour.start),
        end: timeStringToDate(day, hour.end),
        names: daySchedule[idx],
      });
    });
  }
  return occurrences;
}

function formatTime(date) {
  return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function describeMoment(now, occurrence) {
  if (isSameDate(now, occurrence.date)) {
    return `Vandaag om ${formatTime(occurrence.start)}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDate(tomorrow, occurrence.date)) {
    return `Morgen om ${formatTime(occurrence.start)}`;
  }
  const dayName = capitalize(occurrence.dayKey);
  const dateLabel = occurrence.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  return `${dayName} ${dateLabel} om ${formatTime(occurrence.start)}`;
}

// ---------- Render: status cards ----------

function renderNowCard(now, occurrences) {
  const body = document.getElementById('nowCardBody');
  const current = occurrences.find((o) => now >= o.start && now < o.end && o.names.length > 0);

  if (current) {
    body.innerHTML = `
      <p class="status-pill"><span class="status-dot status-dot--open"></span>Ja, er zit nu iemand!</p>
      <p class="card-meta">Tot ${formatTime(current.end)} uur</p>
    `;
  } else {
    body.innerHTML = `
      <p class="status-pill"><span class="status-dot status-dot--closed"></span>Nu even niemand</p>
      <p class="card-sub">Kijk hieronder wanneer je de volgende keer terecht kunt.</p>
    `;
  }
}

function renderNextCard(now, occurrences) {
  const body = document.getElementById('nextCardBody');
  const upcoming = occurrences
    .filter((o) => o.start > now && o.names.length > 0)
    .sort((a, b) => a.start - b.start)
    .slice(0, 3);

  if (upcoming.length) {
    body.innerHTML = `
      <ul class="next-list">
        ${upcoming.map((o) => `
          <li>
            <span class="next-when">${describeMoment(now, o)}</span>
            <span class="next-time">tot ${formatTime(o.end)} uur</span>
          </li>
        `).join('')}
      </ul>
    `;
  } else {
    body.innerHTML = `<p class="card-sub">Er is voorlopig geen helpdesk-uur gepland.</p>`;
  }
}

function renderClock(now) {
  const line = document.getElementById('clockLine');
  const dayName = capitalize(DAY_LABELS[now.getDay()]);
  line.textContent = `Het is nu ${dayName} ${formatTime(now)} uur`;
}

function renderPrintMeta(now) {
  const meta = document.getElementById('printMeta');
  const dayName = capitalize(DAY_LABELS[now.getDay()]);
  const dateLabel = now.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  meta.textContent = `Afgedrukt op ${dayName} ${dateLabel} om ${formatTime(now)} uur`;
}

function updateStatus() {
  const now = new Date();
  const occurrences = buildOccurrences(now, 9);
  renderNowCard(now, occurrences);
  renderNextCard(now, occurrences);
  renderClock(now);
  renderScheduleTable(now);
  renderPrintMeta(now);
}

// ---------- Render: full schedule table ----------

function renderScheduleTable(now) {
  const tbody = document.getElementById('scheduleTableBody');
  const dayKeys = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag'];
  const todayKey = DAY_LABELS[now.getDay()];

  const rows = HOURS.map((hour, idx) => {
    const cells = dayKeys.map((dayKey) => {
      const names = SCHEDULE[dayKey][idx];
      const start = timeStringToDate(now, hour.start);
      const end = timeStringToDate(now, hour.end);
      const isNow = dayKey === todayKey && now >= start && now < end;
      const content = names.length
        ? `<div class="cell-names">${names.map(nameBadge).join('')}</div>`
        : `<span class="cell-empty">—</span>`;
      return `<td class="${isNow ? 'is-now' : ''}">${content}</td>`;
    }).join('');

    return `
      <tr>
        <th scope="row">${hour.period}e uur<br><small>${hour.start}–${hour.end}</small></th>
        ${cells}
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rows;
}

// ---------- Modal ----------

const modal = document.getElementById('scheduleModal');
const backdrop = document.getElementById('modalBackdrop');
const openBtn = document.getElementById('openScheduleBtn');
const closeBtn = document.getElementById('closeModalBtn');
const printBtn = document.getElementById('printScheduleBtn');

function openModal() {
  modal.hidden = false;
  backdrop.classList.add('is-visible');
  document.body.style.overflow = 'hidden';
  closeBtn.focus();
}

function closeModal() {
  modal.hidden = true;
  backdrop.classList.remove('is-visible');
  document.body.style.overflow = '';
  openBtn.focus();
}

openBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
backdrop.addEventListener('click', closeModal);
printBtn.addEventListener('click', () => window.print());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

// ---------- Init ----------

updateStatus();
setInterval(updateStatus, 30000);
