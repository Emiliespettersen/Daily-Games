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

const ROWS = 6, COLS = 7, YOU = 1, CPU = 2;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const DEPTH = [2, 2, 3, 3, 4, 5, 5];   // søketdybde per ukedag (ma–sø)
const LEVEL = [1, 1, 2, 2, 3, 4, 5];   // vises som nivå 1–5

// Alle mulige rekker på fire
const WINDOWS = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const er = r + dr * 3, ec = c + dc * 3;
    if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
    WINDOWS.push([0, 1, 2, 3].map(k => [r + dr * k, c + dc * k]));
  }
}

let state, grid, last = null, winCells = null, busy = false, timer = null;
const boardEl = $("board");

const daily = createDaily({
  prefix: "fpr",
  onLoad(k, s) { clearTimeout(timer); state = s || fresh(); rebuild(); }
});

function fresh() { return { moves: [], status: "progress", youStart: daily.rng("start")() < 0.5 }; }
const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
function drop(g, c, p) { for (let r = ROWS - 1; r >= 0; r--) if (!g[r][c]) { g[r][c] = p; return r; } return -1; }
function playerAt(n) { const first = state.youStart ? YOU : CPU; return n % 2 === 0 ? first : 3 - first; }

function lineAt(g, r, c, p) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && g[rr][cc] === p) { cells.push([rr, cc]); rr += dr * s; cc += dc * s; }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

// --- Datamaskinen ---
function heur(g, p) {
  let s = 0;
  for (let r = 0; r < ROWS; r++) if (g[r][3] === p) s += 3;
  for (const w of WINDOWS) {
    let mine = 0, empty = 0;
    for (const [r, c] of w) { const v = g[r][c]; if (v === p) mine++; else if (!v) empty++; }
    if (mine + empty < 4) continue;
    if (mine === 3) s += 5; else if (mine === 2) s += 2;
  }
  return s;
}
function negamax(g, depth, a, b, p) {
  if (depth === 0) return heur(g, p) - heur(g, 3 - p);
  let best = -Infinity, any = false;
  for (const c of ORDER) {
    const r = drop(g, c, p); if (r < 0) continue;
    any = true;
    const score = lineAt(g, r, c, p) ? 100000 + depth : -negamax(g, depth - 1, -b, -a, 3 - p);
    g[r][c] = 0;
    if (score > best) best = score;
    if (best > a) a = best;
    if (a >= b) break;
  }
  return any ? best : 0;
}
function cpuMove() {
  if (state.status !== "progress") return;
  const depth = DEPTH[daily.weekday()], r = daily.rng("m" + state.moves.length);
  let best = -Infinity, cands = [];
  for (const c of ORDER) {
    const row = drop(grid, c, CPU); if (row < 0) continue;
    const s = lineAt(grid, row, c, CPU) ? 1e6 : -negamax(grid, depth - 1, -Infinity, Infinity, YOU);
    grid[row][c] = 0;
    if (s > best) { best = s; cands = [c]; } else if (s === best) cands.push(c);
  }
  play(cands[Math.floor(r() * cands.length)], CPU);
}

// --- Spillflyt ---
function rebuild() {
  grid = emptyGrid(); last = null; winCells = null;
  state.moves.forEach((c, n) => { const r = drop(grid, c, playerAt(n)); last = [r, c]; });
  renderSide();
  afterMove(false);
}
function play(c, p) {
  const r = drop(grid, c, p); if (r < 0) return false;
  state.moves.push(c); last = [r, c];
  daily.save(state);
  afterMove(true);
  return true;
}
function afterMove(anim) {
  if (last) {
    const p = grid[last[0]][last[1]], w = lineAt(grid, last[0], last[1], p);
    if (w) winCells = w;
    if (state.status === "progress") {
      if (w) { state.status = p === YOU ? "won" : "lost"; state.result = p === YOU ? "won" : "lost"; daily.save(state); }
      else if (state.moves.length === ROWS * COLS) { state.status = "lost"; state.result = "draw"; daily.save(state); }
    }
  }
  render(anim);
  if (state.status !== "progress") { busy = false; setTurn(); timer = setTimeout(showEnd, anim ? 700 : 0); return; }
  if (playerAt(state.moves.length) === CPU) { busy = true; setTurn(); timer = setTimeout(cpuMove, 500); }
  else { busy = false; setTurn(); }
}

function showEnd() {
  const n = state.moves.filter((_, i) => playerAt(i) === YOU).length;
  if (state.result === "won") endOverlay(daily, { title: "Du vant!", text: `Fire på rad etter ${n} trekk.${daily.isToday() ? " Ny motstander i morgen." : ""}` });
  else if (state.result === "draw") endOverlay(daily, { title: "Uavgjort", text: "Brettet ble fullt uten vinner.", retry });
  else endOverlay(daily, { title: "Maskinen vant", text: "Den fikk fire på rad først.", retry });
}
function retry() { clearTimeout(timer); hideOverlay(); state = fresh(); rebuild(); }

// --- Tegning ---
function render(anim) {
  boardEl.innerHTML = "";
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const h = document.createElement("button");
    h.className = "hole"; h.dataset.c = c;
    const v = grid[r][c];
    h.setAttribute("aria-label", `Kolonne ${c + 1}, rad ${r + 1}: ${v === YOU ? "din brikke" : v === CPU ? "maskinens brikke" : "tom"}`);
    if (v) {
      const d = document.createElement("span");
      d.className = "disc " + (v === YOU ? "you" : "cpu");
      if (anim && last && last[0] === r && last[1] === c) { d.classList.add("drop"); d.style.setProperty("--from", `${-(r + 1) * 115}%`); }
      if (winCells && winCells.some(([a, b]) => a === r && b === c)) d.classList.add("win");
      h.appendChild(d);
    }
    boardEl.appendChild(h);
  }
}
function setTurn() {
  const t = $("turn");
  if (state.status !== "progress") t.innerHTML = "";
  else if (busy) t.innerHTML = `<i style="background:var(--ink)"></i>Maskinen tenker …`;
  else t.innerHTML = `<i style="background:var(--sun)"></i>Din tur, velg en kolonne`;
}
function renderSide() {
  $("level").innerHTML = pipsHtml(LEVEL[daily.weekday()], 5);
  $("starter").textContent = state.youStart ? "Du starter" : "Maskinen starter";
}

boardEl.addEventListener("click", e => {
  const h = e.target.closest(".hole"); if (!h) return;
  if (busy || state.status !== "progress" || playerAt(state.moves.length) !== YOU) return;
  play(+h.dataset.c, YOU);
});
boardEl.addEventListener("mouseover", e => {
  const h = e.target.closest(".hole"); if (!h) return;
  boardEl.querySelectorAll(".hole").forEach(x => x.classList.toggle("hov", x.dataset.c === h.dataset.c && state.status === "progress"));
});
boardEl.addEventListener("mouseleave", () => boardEl.querySelectorAll(".hov").forEach(x => x.classList.remove("hov")));

daily.start();
