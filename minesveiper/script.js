// ===== Felles: daglig spill, kalender og lagring =====
const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
const WEEKDAYS = ["ma", "ti", "on", "to", "fr", "lø", "sø"];
const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const $ = id => document.getElementById(id);

function hashStr(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Velger et element fra listen for en gitt dag, uten gjentakelser før listen er brukt opp
function pickDaily(list, dayIndex, salt) {
  const r = mulberry(hashStr(salt));
  const p = list.map((_, i) => i);
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return list[p[((dayIndex % p.length) + p.length) % p.length]];
}
function pipsHtml(on, max) {
  let s = '<span class="pips">';
  for (let i = 0; i < max; i++) s += `<i class="${i < on ? "on" : ""}"></i>`;
  return s + "</span>";
}

function createDaily(cfg) {
  const FIRST = new Date(2026, 0, 1);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = keyOf(today);
  const P = cfg.prefix + ":";
  let curKey = todayKey, viewY = today.getFullYear(), viewM = today.getMonth();

  const get = k => { try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {} };
  const dateOf = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

  function title() {
    const d = dateOf(curKey), t = `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
    $("dayTitle").textContent = curKey === todayKey ? `I dag · ${t}` : `${d.toLocaleDateString("nb-NO", { weekday: "long" })} ${t}`;
  }

  function renderCal() {
    $("monthTitle").textContent = `${MONTHS[viewM]} ${viewY}`;
    $("prevM").disabled = viewY === FIRST.getFullYear() && viewM === FIRST.getMonth();
    $("nextM").disabled = viewY === today.getFullYear() && viewM === today.getMonth();
    const g = $("calGrid"); g.innerHTML = "";
    WEEKDAYS.forEach(w => { const e = document.createElement("div"); e.className = "wd"; e.textContent = w; g.appendChild(e); });
    const offset = (new Date(viewY, viewM, 1).getDay() + 6) % 7;
    for (let k = 0; k < offset; k++) g.appendChild(document.createElement("div"));
    const days = new Date(viewY, viewM + 1, 0).getDate();
    let won = 0;
    for (let d = 1; d <= days; d++) {
      const dt = new Date(viewY, viewM, d), k = keyOf(dt), s = get(k);
      const b = document.createElement("button");
      b.className = "day"; b.textContent = d;
      if (s) {
        if (s.status === "won") { b.classList.add("won"); won++; }
        else if (s.status === "lost") b.classList.add("lost");
        else b.classList.add("prog");
      }
      if (k === todayKey) b.classList.add("today");
      if (k === curKey) b.classList.add("cur");
      if (dt > today || dt < FIRST) b.disabled = true;
      else b.onclick = () => select(k);
      b.setAttribute("aria-label", `${d}. ${MONTHS[viewM]}` + (s && s.status === "won" ? ", løst" : ""));
      g.appendChild(b);
    }
    const playable = (viewY === today.getFullYear() && viewM === today.getMonth()) ? today.getDate() : days;
    $("monthStat").innerHTML = `<b>${won}</b> av ${playable} dager løst i ${MONTHS[viewM]}`;
  }

  function renderStats() {
    let total = 0;
    for (let d = new Date(FIRST); d <= today; d.setDate(d.getDate() + 1)) { const s = get(keyOf(d)); if (s && s.status === "won") total++; }
    let streak = 0; const d = new Date(today);
    const ts = get(todayKey);
    if (!(ts && ts.status === "won")) d.setDate(d.getDate() - 1);
    while (d >= FIRST) { const s = get(keyOf(d)); if (s && s.status === "won") { streak++; d.setDate(d.getDate() - 1); } else break; }
    $("streak").textContent = streak; $("total").textContent = total;
  }

  function refresh() { renderCal(); renderStats(); }
  function select(k) {
    curKey = k;
    const d = dateOf(k); viewY = d.getFullYear(); viewM = d.getMonth();
    title(); hideOverlay();
    cfg.onLoad(k, get(k));
    refresh();
  }

  $("prevM").onclick = () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderCal(); };
  $("nextM").onclick = () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderCal(); };

  return {
    get key() { return curKey; },
    todayKey,
    isToday: () => curKey === todayKey,
    rng: (salt = "") => mulberry(hashStr(cfg.prefix + ":" + curKey + ":" + salt)),
    dayIndex: () => Math.round((dateOf(curKey) - FIRST) / 86400000),
    weekday: () => (dateOf(curKey).getDay() + 6) % 7,
    dateLabel: () => { const d = dateOf(curKey); return `${d.getDate()}. ${MONTHS[d.getMonth()]}`; },
    save: s => { set(curKey, s); refresh(); },
    select,
    goToday: () => select(todayKey),
    start: () => select(todayKey)
  };
}

function endOverlay(daily, o) {
  const ov = $("overlay"), p = ov.querySelector(".panel");
  let btns = "";
  if (o.retry) btns += `<button class="btn primary" data-a="retry">Prøv igjen</button>`;
  else if (!daily.isToday()) btns += `<button class="btn primary" data-a="today">Til dagens spill</button>`;
  btns += `<button class="btn" data-a="peek">Se brettet</button>`;
  p.innerHTML = `<h3>${o.title}</h3><p>${o.text}</p>${o.extra || ""}<div class="row">${btns}</div>`;
  ov.hidden = false;
  p.querySelectorAll("button[data-a]").forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (a === "peek") ov.hidden = true;
    if (a === "retry") o.retry();
    if (a === "today") daily.goToday();
  });
}
function hideOverlay() { const ov = $("overlay"); if (ov) ov.hidden = true; }

let toastTimer = null;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1600);
}

// ===== Spillet =====

const N = 9;
const MINES = [11, 12, 12, 13, 14, 15, 16]; // per ukedag (ma–sø)

let layout = null, state, flagMode = false, pressTimer = null, longPressed = false, ticker = null;
const boardEl = $("board");
const mineCount = () => MINES[daily.weekday()];

const daily = createDaily({
  prefix: "mine2",
  onLoad(k, s) {
    stopTicker();
    state = s || fresh();
    layout = state.first != null ? makeLayout(state.first) : null;
    flagMode = false; $("flagBtn").setAttribute("aria-pressed", "false");
    render([]);
    if (state.started && state.status === "progress") startTicker();
    if (state.status !== "progress") showEnd();
  }
});

function neighbors(i) {
  const r = Math.floor(i / N), c = i % N, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc);
  }
  return out;
}
// Minene legges ut etter første trykk, aldri på eller rundt den ruta
function makeLayout(first) {
  const r = daily.rng("mines:" + first), count = mineCount();
  const safe = new Set([first, ...neighbors(first)]);
  const mine = Array(N * N).fill(false);
  let placed = 0;
  while (placed < count) {
    const i = Math.floor(r() * N * N);
    if (!mine[i] && !safe.has(i)) { mine[i] = true; placed++; }
  }
  const num = mine.map((m, i) => m ? -1 : neighbors(i).filter(j => mine[j]).length);
  return { mine, num };
}
function fresh() {
  return { open: Array(N * N).fill(0), flags: Array(N * N).fill(0), status: "progress", time: 0, boom: -1, started: false, first: null };
}
function flood(i) {
  const stack = [i], opened = [];
  while (stack.length) {
    const j = stack.pop();
    if (state.open[j] || state.flags[j] || layout.mine[j]) continue;
    state.open[j] = 1; opened.push(j);
    if (layout.num[j] === 0) neighbors(j).forEach(k => { if (!state.open[k]) stack.push(k); });
  }
  return opened;
}

// --- Handlinger ---
function act(fn) {
  if (state.status !== "progress") return;
  if (!state.started) { state.started = true; startTicker(); }
  const opened = fn() || [];
  if (layout && state.status === "progress" && state.open.reduce((a, b) => a + b, 0) === N * N - mineCount()) {
    state.status = "won";
    layout.mine.forEach((m, i) => { if (m) state.flags[i] = 1; });
  }
  daily.save(state);
  render(opened);
  if (state.status !== "progress") { stopTicker(); setTimeout(showEnd, 500); }
}
function reveal(i) {
  if (state.open[i] || state.flags[i]) return [];
  if (!layout) { state.first = i; layout = makeLayout(i); }
  if (layout.mine[i]) { state.status = "lost"; state.boom = i; return []; }
  return flood(i);
}
function chord(i) {
  if (!layout) return [];
  const n = layout.num[i]; if (!state.open[i] || n <= 0) return [];
  const around = neighbors(i);
  if (around.filter(j => state.flags[j]).length !== n) return [];
  let opened = [];
  for (const j of around) { if (state.status !== "progress") break; opened = opened.concat(reveal(j)); }
  return opened;
}
function toggleFlag(i) { if (!state.open[i]) state.flags[i] = state.flags[i] ? 0 : 1; return []; }

function showEnd() {
  if (state.status === "won") endOverlay(daily, { title: "Ryddet!", text: `Alle minene funnet på ${fmt(state.time)}.${daily.isToday() ? " Nytt minefelt i morgen." : ""}` });
  else endOverlay(daily, { title: "Bom!", text: "Du traff en mine.", retry });
}
function retry() { hideOverlay(); stopTicker(); state = fresh(); layout = null; render([]); daily.save(state); }

// --- Tid ---
const fmt = t => `${Math.floor(t / 60)}:${pad(t % 60)}`;
function startTicker() {
  stopTicker();
  ticker = setInterval(() => { if (state.status === "progress" && state.started) { state.time++; $("time").textContent = fmt(state.time); } }, 1000);
}
function stopTicker() { clearInterval(ticker); ticker = null; }
function saveTime() { if (state && state.started && state.status === "progress") daily.save(state); }
window.addEventListener("pagehide", saveTime);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { saveTime(); stopTicker(); }
  else if (state && state.started && state.status === "progress") startTicker();
});

// --- Tegning ---
function render(popped) {
  boardEl.innerHTML = "";
  const over = state.status !== "progress";
  for (let i = 0; i < N * N; i++) {
    const b = document.createElement("button");
    b.dataset.i = i;
    const open = state.open[i], flag = state.flags[i];
    const mine = layout ? layout.mine[i] : false, n = layout ? layout.num[i] : 0;
    if (over && mine && !flag) {
      b.className = "mc o" + (i === state.boom ? " boom" : "");
      b.innerHTML = '<span class="mine"></span>';
      b.setAttribute("aria-label", "Mine");
    } else if (over && flag && !mine) {
      b.className = "mc wrong"; b.textContent = "×"; b.setAttribute("aria-label", "Feil flagg");
    } else if (open) {
      b.className = "mc o" + (n > 0 ? ` n n${n}` : "") + (popped.includes(i) ? " pop" : "");
      b.textContent = n > 0 ? n : "";
      b.setAttribute("aria-label", n > 0 ? `${n} miner rundt` : "Tom");
    } else {
      b.className = "mc h";
      b.textContent = flag ? "⚑" : "";
      b.setAttribute("aria-label", flag ? "Flagget rute" : "Skjult rute");
    }
    boardEl.appendChild(b);
  }
  $("left").textContent = mineCount() - state.flags.reduce((a, b) => a + b, 0);
  $("time").textContent = fmt(state.time);
}

// --- Input ---
boardEl.addEventListener("click", e => {
  const b = e.target.closest(".mc"); if (!b) return;
  if (longPressed) { longPressed = false; return; }
  const i = +b.dataset.i;
  if (state.open[i]) act(() => chord(i));
  else if (flagMode) act(() => toggleFlag(i));
  else act(() => reveal(i));
});
boardEl.addEventListener("contextmenu", e => {
  const b = e.target.closest(".mc"); if (!b) return;
  e.preventDefault();
  act(() => toggleFlag(+b.dataset.i));
});
boardEl.addEventListener("pointerdown", e => {
  if (e.pointerType !== "touch") return;
  const b = e.target.closest(".mc"); if (!b) return;
  const i = +b.dataset.i;
  longPressed = false;
  pressTimer = setTimeout(() => {
    longPressed = true;
    act(() => toggleFlag(i));
    try { navigator.vibrate && navigator.vibrate(15); } catch (err) {}
  }, 380);
});
["pointerup", "pointercancel", "pointerleave"].forEach(ev => boardEl.addEventListener(ev, () => clearTimeout(pressTimer)));
$("flagBtn").onclick = () => { flagMode = !flagMode; $("flagBtn").setAttribute("aria-pressed", String(flagMode)); };

daily.start();
