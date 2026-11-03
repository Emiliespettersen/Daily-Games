(function () {
  const COLS = 9, START = 36, ADDS = 5;
  const MONTHS = ["januar","februar","mars","april","mai","juni","juli","august","september","oktober","november","desember"];
  const WD = ["ma","ti","on","to","fr","lø","sø"];
  const FIRST = new Date(2026, 0, 1);

  const pad = n => String(n).padStart(2, "0");
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayKey = keyOf(today);

  // --- lagring ---
  const store = {
    get(k) { try { const v = localStorage.getItem("nm:" + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("nm:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  // --- seedet tilfeldighet ---
  function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function generate(key) {
    const r = rng(hash("number-match:" + key));
    let cells;
    for (let tries = 0; tries < 50; tries++) {
      cells = Array.from({ length: START }, () => ({ v: 1 + Math.floor(r() * 9), c: false }));
      if (findPairs(cells).length >= 4) break;
    }
    return { cells, adds: ADDS, score: 0, status: "progress" };
  }

  // --- regler ---
  const fits = (a, b) => a === b || a + b === 10;
  function clearBetween(cells, i, j, step) { for (let k = i + step; k < j; k += step) if (!cells[k].c) return false; return true; }
  function connected(cells, i, j) {
    if (i > j) [i, j] = [j, i];
    if (clearBetween(cells, i, j, 1)) return true; // lesetretning (dekker rad og radskift)
    const ri = Math.floor(i / COLS), ci = i % COLS, rj = Math.floor(j / COLS), cj = j % COLS;
    if (ci === cj) return clearBetween(cells, i, j, COLS);
    const dr = rj - ri, dc = cj - ci;
    if (dr === Math.abs(dc)) return clearBetween(cells, i, j, dc > 0 ? COLS + 1 : COLS - 1);
    return false;
  }
  function findPairs(cells) {
    const out = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].c) continue;
      for (let j = i + 1; j < cells.length; j++) {
        if (cells[j].c || !fits(cells[i].v, cells[j].v)) continue;
        if (connected(cells, i, j)) out.push([i, j]);
      }
    }
    return out;
  }
  function removeEmptyRows(cells) {
    const out = []; let rows = 0;
    for (let r = 0; r * COLS < cells.length; r++) {
      const row = cells.slice(r * COLS, r * COLS + COLS);
      if (row.every(x => x.c)) rows++; else out.push(...row);
    }
    return { cells: out, rows };
  }

  // --- tilstand ---
  let curKey = todayKey, state, sel = null, hint = null;
  let viewY = today.getFullYear(), viewM = today.getMonth();

  const $ = id => document.getElementById(id);
  const boardEl = $("board");

  function load(key) {
    curKey = key; sel = null; hint = null;
    state = store.get(key) || generate(key);
    renderAll();
  }
  function save() { store.set(curKey, state); }

  function renderBoard(anim = []) {
    boardEl.innerHTML = "";
    state.cells.forEach((cell, i) => {
      const b = document.createElement("button");
      b.className = "cell" + (cell.c ? " gone" : "") + ((cell.v % 2 === 0) ? " alt" : "");
      if (i === sel) b.classList.add("sel");
      if (hint && hint.includes(i)) b.classList.add("hint");
      if (anim.includes(i)) b.classList.add("pop");
      b.textContent = cell.v;
      b.dataset.i = i;
      b.setAttribute("aria-label", cell.c ? `Fjernet ${cell.v}` : `Tall ${cell.v}`);
      if (cell.c) b.tabIndex = -1;
      boardEl.appendChild(b);
    });
    $("score").textContent = state.score;
    const pips = $("pips"); pips.innerHTML = "";
    for (let k = 0; k < ADDS; k++) { const i = document.createElement("i"); if (k < state.adds) i.className = "on"; pips.appendChild(i); }
    const done = state.status !== "progress";
    $("addBtn").disabled = state.adds <= 0 || done;
    $("hintBtn").disabled = done;
    renderOverlay();
  }

  function renderOverlay() {
    const ov = $("overlay"), p = $("panel");
    if (state.status === "won") {
      ov.hidden = false;
      p.innerHTML = `<h3>Løst!</h3><p>${state.score} poeng</p>` +
        (curKey !== todayKey ? `<button class="btn primary" id="goToday">Til dagens brett</button>` : `<p>Kom tilbake i morgen for et nytt brett.</p>`);
    } else if (state.status === "lost") {
      ov.hidden = false;
      p.innerHTML = `<h3>Ingen flere trekk</h3><p>Du endte på ${state.score} poeng.</p><button class="btn primary" id="retry">Prøv igjen</button>`;
    } else { ov.hidden = true; }
    const g = $("goToday"); if (g) g.onclick = () => { viewY = today.getFullYear(); viewM = today.getMonth(); load(todayKey); };
    const r = $("retry"); if (r) r.onclick = reset;
  }

  function renderTitle() {
    const [y, m, d] = curKey.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = dt.toLocaleDateString("nb-NO", { weekday: "long" });
    $("dayTitle").textContent = curKey === todayKey ? `I dag · ${d}. ${MONTHS[m - 1]}` : `${wd} ${d}. ${MONTHS[m - 1]}`;
  }

  function renderCal() {
    $("monthTitle").textContent = `${MONTHS[viewM]} ${viewY}`;
    $("prevM").disabled = viewY === FIRST.getFullYear() && viewM === FIRST.getMonth();
    $("nextM").disabled = viewY === today.getFullYear() && viewM === today.getMonth();
    const g = $("calGrid"); g.innerHTML = "";
    WD.forEach(w => { const e = document.createElement("div"); e.className = "wd"; e.textContent = w; g.appendChild(e); });
    const first = new Date(viewY, viewM, 1);
    const offset = (first.getDay() + 6) % 7;
    for (let k = 0; k < offset; k++) g.appendChild(document.createElement("div"));
    const days = new Date(viewY, viewM + 1, 0).getDate();
    let won = 0;
    for (let d = 1; d <= days; d++) {
      const dt = new Date(viewY, viewM, d), k = keyOf(dt);
      const b = document.createElement("button");
      b.className = "day"; b.textContent = d;
      const s = store.get(k);
      if (s) { if (s.status === "won") { b.classList.add("won"); won++; } else if (s.status === "lost") b.classList.add("lost"); else if (s.score > 0 || s.adds < ADDS) b.classList.add("prog"); }
      if (k === todayKey) b.classList.add("today");
      if (k === curKey) b.classList.add("cur");
      if (dt > today || dt < FIRST) b.disabled = true;
      else b.onclick = () => load(k);
      b.setAttribute("aria-label", `${d}. ${MONTHS[viewM]}` + (s && s.status === "won" ? ", løst" : ""));
      g.appendChild(b);
    }
    const playable = (viewY === today.getFullYear() && viewM === today.getMonth()) ? today.getDate() : days;
    $("monthStat").innerHTML = `<b>${won}</b> av ${playable} dager løst i ${MONTHS[viewM]}`;
  }

  function renderStats() {
    let total = 0;
    for (let d = new Date(FIRST); d <= today; d.setDate(d.getDate() + 1)) { const s = store.get(keyOf(d)); if (s && s.status === "won") total++; }
    let streak = 0; const d = new Date(today);
    const ts = store.get(todayKey);
    if (!(ts && ts.status === "won")) d.setDate(d.getDate() - 1);
    while (d >= FIRST) { const s = store.get(keyOf(d)); if (s && s.status === "won") { streak++; d.setDate(d.getDate() - 1); } else break; }
    $("streak").textContent = streak; $("total").textContent = total;
  }

  function renderAll(anim) { renderTitle(); renderBoard(anim); renderCal(); renderStats(); }

  function checkEnd() {
    if (state.cells.every(c => c.c)) { state.status = "won"; state.score += 150; return; }
    if (state.adds <= 0 && findPairs(state.cells).length === 0) state.status = "lost";
  }

  function tap(i) {
    if (state.status !== "progress") return;
    const cell = state.cells[i]; if (!cell || cell.c) return;
    hint = null;
    if (sel === null) { sel = i; renderBoard(); return; }
    if (sel === i) { sel = null; renderBoard(); return; }
    const a = state.cells[sel];
    if (fits(a.v, cell.v) && connected(state.cells, sel, i)) {
      a.c = true; cell.c = true; state.score += 10;
      const pair = [sel, i]; sel = null;
      renderBoard(pair);
      setTimeout(() => {
        const res = removeEmptyRows(state.cells);
        state.cells = res.cells; state.score += res.rows * 50;
        checkEnd(); save(); renderAll();
      }, 280);
    } else {
      const btn = boardEl.children[i]; btn.classList.add("bad");
      setTimeout(() => { sel = i; renderBoard(); }, 300);
    }
  }

  boardEl.addEventListener("click", e => { const b = e.target.closest(".cell"); if (b) tap(+b.dataset.i); });

  $("addBtn").onclick = () => {
    if (state.adds <= 0 || state.status !== "progress") return;
    const extra = state.cells.filter(c => !c.c).map(c => ({ v: c.v, c: false }));
    // fjern tomme ruter på slutten før tallene legges til
    while (state.cells.length && state.cells[state.cells.length - 1].c) state.cells.pop();
    state.cells.push(...extra); state.adds--; sel = null; hint = null;
    checkEnd(); save(); renderAll();
    boardEl.scrollTop = boardEl.scrollHeight;
  };
  $("hintBtn").onclick = () => {
    const p = findPairs(state.cells);
    if (p.length) { hint = p[0]; sel = null; renderBoard(); const el = boardEl.children[p[0][0]]; if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    else { const b = $("addBtn"); b.focus(); b.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], 400); }
  };
  function reset() { state = generate(curKey); sel = null; hint = null; save(); renderAll(); }
  $("resetBtn").onclick = reset;

  $("prevM").onclick = () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderCal(); };
  $("nextM").onclick = () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderCal(); };

  load(todayKey);
})();
