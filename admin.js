// Beheeromgeving voor de teamleider.
// Schrijft rechtstreeks naar GitHub via de Contents API — de beveiliging komt dus van
// GitHub's eigen inlogsysteem (wie schrijftoegang tot de repo heeft), niet van deze pagina.
// Het token wordt alleen in sessionStorage van dit tabblad bewaard en gaat nooit ergens anders naartoe.

const GITHUB_OWNER = 'bruce10panda';
const GITHUB_REPO = 'Helpdesk-uren';
const GITHUB_BRANCH = 'main';
const ROOSTER_PATH = 'rooster.js';
const AFWEZIG_PATH = 'afwezig.json';
const TOKEN_KEY = 'helpdesk_admin_token';

const DAY_ORDER = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag'];
const COLOR_LABELS = {
  teal: 'teal', red: 'rood', lightblue: 'lichtblauw', magenta: 'magenta',
  orange: 'oranje', yellow: 'geel', blue: 'blauw', lime: 'lime', dark: 'donker',
};

// ---------- Token ----------

function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

// ---------- GitHub API ----------

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

async function ghRequest(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let message = `GitHub gaf een foutmelding (${res.status}).`;
    if (res.status === 401) message = 'Dit token is ongeldig of verlopen.';
    if (res.status === 403) message = 'Dit token heeft geen schrijftoegang tot deze repository.';
    if (res.status === 404) message = 'Bestand niet gevonden in de repository.';
    const body = await res.json().catch(() => null);
    throw new Error(body && body.message ? `${message} (${body.message})` : message);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getFile(path) {
  try {
    const data = await ghRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`);
    return { text: base64ToUtf8(data.content), sha: data.sha };
  } catch (err) {
    if (err.message.includes('niet gevonden')) return { text: null, sha: null };
    throw err;
  }
}

async function putFile(path, text, sha, message) {
  return ghRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: utf8ToBase64(text),
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

// ---------- rooster.js parsen & genereren ----------

function parseRoosterSource(source) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${source}\nreturn { SCHOOL_YEAR, LOCATION, HOURS, SCHEDULE, NAME_COLOR };`);
  return fn();
}

function jsString(str) {
  return `'${String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function generateRoosterSource({ schoolYear, location, hours, schedule, nameColor }) {
  const hoursLines = hours.map((h) => `  { period: ${h.period}, start: '${h.start}', end: '${h.end}' },`).join('\n');

  const scheduleLines = DAY_ORDER.map((day) => {
    const periods = schedule[day] || {};
    const periodKeys = Object.keys(periods).map(Number).filter((p) => periods[p] && periods[p].length).sort((a, b) => a - b);
    if (!periodKeys.length) return `  ${day}: {},`;
    const inner = periodKeys.map((p) => `    ${p}: [${periods[p].map(jsString).join(', ')}],`).join('\n');
    return `  ${day}: {\n${inner}\n  },`;
  }).join('\n');

  const nameColorLines = Object.keys(nameColor).map((name) => {
    const key = /^[A-Za-z_$][\w$]*$/.test(name) ? name : jsString(name);
    return `  ${key}: '${nameColor[name]}',`;
  }).join('\n');

  return `// =====================================================================
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

const SCHOOL_YEAR = ${jsString(schoolYear)};

const LOCATION = {
  place: ${jsString(location.place)},
  warning: ${jsString(location.warning)},
};

const HOURS = [
${hoursLines}
];

// Per dag: lesuur → wie er zit.
const SCHEDULE = {
${scheduleLines}
};

// Kleuren uit de huisstijl, zo dicht mogelijk bij ieders eigen kleur.
const NAME_COLOR = {
${nameColorLines}
};
`;
}

// ---------- Status helpers ----------

function setStatus(el, text, tone) {
  el.textContent = text;
  if (tone) el.dataset.tone = tone; else el.removeAttribute('data-tone');
}

// ---------- State ----------

const state = {
  schoolYear: '', location: { place: '', warning: '' }, hours: [], schedule: {}, nameColor: {},
  roosterSha: null,
  afwezig: [], afwezigSha: null,
};

// Lokale datum als 'YYYY-MM-DD' (geen toISOString: die rekent in UTC en kan rond
// middernacht een dag verspringen).
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return dateKey(new Date());
}

// ---------- Rooster-grid renderen ----------

function renderHelperList() {
  const wrap = document.getElementById('helperList');
  const names = Object.keys(state.nameColor);
  if (!names.length) {
    wrap.innerHTML = '<p class="report-status">Nog geen helpdeskers.</p>';
    return;
  }
  wrap.innerHTML = names.map((name) => `
    <div class="admin-helper-row">
      <span class="badge badge-${state.nameColor[name]}">${name}</span>
      <select data-helper-color="${name}">
        ${Object.keys(COLOR_LABELS).map((c) => `<option value="${c}" ${c === state.nameColor[name] ? 'selected' : ''}>${COLOR_LABELS[c]}</option>`).join('')}
      </select>
      <button type="button" class="admin-remove-btn" data-remove-helper="${name}" aria-label="Verwijder ${name}">Verwijderen</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-helper-color]').forEach((select) => {
    select.addEventListener('change', () => {
      state.nameColor[select.dataset.helperColor] = select.value;
      renderHelperList();
      renderScheduleGrid();
    });
  });

  wrap.querySelectorAll('[data-remove-helper]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.removeHelper;
      if (!confirm(`${name} verwijderen? Diegene wordt ook overal uit het rooster gehaald.`)) return;
      delete state.nameColor[name];
      DAY_ORDER.forEach((day) => {
        const periods = state.schedule[day] || {};
        Object.keys(periods).forEach((p) => {
          periods[p] = periods[p].filter((n) => n !== name);
        });
      });
      renderHelperList();
      renderScheduleGrid();
      renderAbsenceNameOptions();
    });
  });
}

function renderScheduleGrid() {
  const head = document.getElementById('adminScheduleHead');
  const body = document.getElementById('adminScheduleBody');
  const helperNames = Object.keys(state.nameColor);

  head.innerHTML = `<th scope="col">Uur</th>${DAY_ORDER.map((d) => `<th scope="col">${d[0].toUpperCase()}${d.slice(1)}</th>`).join('')}`;

  body.innerHTML = state.hours.map((hour) => {
    const cells = DAY_ORDER.map((day) => {
      if (!state.schedule[day]) state.schedule[day] = {};
      const names = state.schedule[day][hour.period] || [];
      const available = helperNames.filter((n) => !names.includes(n));
      const badges = names.map((n) => `<button type="button" class="admin-slot-badge badge badge-${state.nameColor[n] || 'dark'}" data-slot-remove="${day}|${hour.period}|${n}">${n} ×</button>`).join('');
      const addSelect = available.length
        ? `<select class="admin-slot-add" data-slot-add="${day}|${hour.period}">
            <option value="">+ toevoegen</option>
            ${available.map((n) => `<option value="${n}">${n}</option>`).join('')}
          </select>`
        : '';
      return `<td><div class="admin-slot-cell">${badges}${addSelect}</div></td>`;
    }).join('');
    return `<tr><th scope="row"><span class="row-period">${hour.period}e uur</span><span class="row-time">${hour.start} – ${hour.end}</span></th>${cells}</tr>`;
  }).join('');

  body.querySelectorAll('[data-slot-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [day, period, name] = btn.dataset.slotRemove.split('|');
      state.schedule[day][period] = (state.schedule[day][period] || []).filter((n) => n !== name);
      renderScheduleGrid();
    });
  });

  body.querySelectorAll('[data-slot-add]').forEach((select) => {
    select.addEventListener('change', () => {
      if (!select.value) return;
      const [day, period] = select.dataset.slotAdd.split('|');
      if (!state.schedule[day][period]) state.schedule[day][period] = [];
      state.schedule[day][period].push(select.value);
      renderScheduleGrid();
    });
  });
}

function renderAbsenceNameOptions() {
  const select = document.getElementById('absenceName');
  const names = Object.keys(state.nameColor);
  select.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join('');
}

function renderAbsencePeriodOptions() {
  const select = document.getElementById('absencePeriod');
  select.innerHTML = state.hours.map((h) => `<option value="${h.period}">${h.period}e uur (${h.start}–${h.end})</option>`).join('');
}

function formatAbsenceDate(datum) {
  const [y, m, d] = datum.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderAbsenceList() {
  const wrap = document.getElementById('absenceList');
  const today = todayStr();
  const upcoming = state.afwezig
    .filter((a) => a.datum >= today)
    .sort((a, b) => (a.datum === b.datum ? a.periode - b.periode : a.datum.localeCompare(b.datum)));

  if (!upcoming.length) {
    wrap.innerHTML = '<p class="report-status">Nog geen meldingen van onbeschikbaarheid.</p>';
    return;
  }

  wrap.innerHTML = `<p class="admin-absence-label">Onbeschikbaar:</p>` + upcoming.map((a) => `
    <span class="admin-slot-badge badge badge-${state.nameColor[a.naam] || 'dark'}" data-undo-absence="${a.naam}|${a.datum}|${a.periode}">
      ${a.naam} — ${formatAbsenceDate(a.datum)}, ${a.periode}e uur ×
    </span>
  `).join('');

  wrap.querySelectorAll('[data-undo-absence]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [naam, datum, periode] = btn.dataset.undoAbsence.split('|');
      const status = document.getElementById('absenceStatus');
      setStatus(status, 'Bezig…');
      try {
        state.afwezig = state.afwezig.filter((a) => !(a.naam === naam && a.datum === datum && String(a.periode) === periode));
        await saveAfwezig(`Onbeschikbaarheid ${naam} (${datum}, ${periode}e uur) verwijderd`);
        setStatus(status, 'Verwijderd.', 'ok');
        renderAbsenceList();
      } catch (err) {
        setStatus(status, err.message, 'error');
      }
    });
  });
}

async function saveAfwezig(message) {
  const cleaned = state.afwezig.filter((a) => a.datum >= todayStr()); // verstreken datums opruimen
  const text = JSON.stringify(cleaned, null, 2);
  const result = await putFile(AFWEZIG_PATH, text, state.afwezigSha, message);
  state.afwezig = cleaned;
  state.afwezigSha = result.content.sha;
}

// ---------- Login-flow ----------

async function connect(token) {
  const status = document.getElementById('loginStatus');
  setStatus(status, 'Verbinden…');
  setToken(token);

  try {
    const roosterFile = await getFile(ROOSTER_PATH);
    if (!roosterFile.text) throw new Error('rooster.js niet gevonden in de repository.');
    const parsed = parseRoosterSource(roosterFile.text);
    state.schoolYear = parsed.SCHOOL_YEAR;
    state.location = parsed.LOCATION;
    state.hours = parsed.HOURS;
    state.schedule = parsed.SCHEDULE;
    state.nameColor = parsed.NAME_COLOR;
    state.roosterSha = roosterFile.sha;

    const afwezigFile = await getFile(AFWEZIG_PATH);
    state.afwezig = afwezigFile.text ? JSON.parse(afwezigFile.text) : [];
    state.afwezigSha = afwezigFile.sha;

    renderHelperList();
    renderScheduleGrid();
    renderAbsenceNameOptions();
    renderAbsencePeriodOptions();
    renderAbsenceList();
    document.getElementById('absenceDate').value = todayStr();
    document.getElementById('absenceDate').min = todayStr();

    document.getElementById('loginSection').hidden = true;
    document.getElementById('adminSection').hidden = false;
    setStatus(status, '');
  } catch (err) {
    clearToken();
    setStatus(status, err.message, 'error');
  }
}

document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const token = document.getElementById('tokenInput').value.trim();
  if (token) connect(token);
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  document.getElementById('adminSection').hidden = true;
  document.getElementById('loginSection').hidden = false;
  document.getElementById('tokenInput').value = '';
});

// ---------- Niet beschikbaar ----------

document.getElementById('absenceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('absenceStatus');

  const naam = document.getElementById('absenceName').value;
  const datum = document.getElementById('absenceDate').value;
  const periode = Number(document.getElementById('absencePeriod').value);

  if (!datum) {
    setStatus(status, 'Kies eerst een datum.', 'error');
    return;
  }
  if (state.afwezig.some((a) => a.naam === naam && a.datum === datum && a.periode === periode)) {
    setStatus(status, `${naam} staat al als onbeschikbaar op ${datum} (${periode}e uur).`, 'error');
    return;
  }

  setStatus(status, 'Bezig met opslaan…');
  try {
    state.afwezig.push({ naam, datum, periode });
    await saveAfwezig(`${naam} onbeschikbaar op ${datum} (${periode}e uur)`);
    setStatus(status, 'Opgeslagen.', 'ok');
    renderAbsenceList();
  } catch (err) {
    setStatus(status, err.message, 'error');
  }
});

// ---------- Helpdesker toevoegen ----------

document.getElementById('helperForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('helperName');
  const colorSelect = document.getElementById('helperColor');
  const name = nameInput.value.trim();
  if (!name) return;
  if (state.nameColor[name]) {
    alert(`${name} staat al in de lijst.`);
    return;
  }
  state.nameColor[name] = colorSelect.value;
  nameInput.value = '';
  renderHelperList();
  renderScheduleGrid();
  renderAbsenceNameOptions();
});

// ---------- Rooster opslaan ----------

document.getElementById('saveRoosterBtn').addEventListener('click', async () => {
  const status = document.getElementById('saveStatus');
  setStatus(status, 'Bezig met opslaan…');
  try {
    const source = generateRoosterSource(state);
    const result = await putFile(ROOSTER_PATH, source, state.roosterSha, 'Rooster bijgewerkt via beheeromgeving');
    state.roosterSha = result.content.sha;
    setStatus(status, 'Opgeslagen! De site wordt binnen een paar minuten bijgewerkt.', 'ok');
  } catch (err) {
    setStatus(status, err.message, 'error');
  }
});

// ---------- Init ----------

if (getToken()) connect(getToken());
