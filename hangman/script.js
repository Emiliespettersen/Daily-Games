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

const MAX = 7;
const WORDS = [
  ["ELEFANT", "Dyr"], ["SJIRAFF", "Dyr"], ["PINGVIN", "Dyr"], ["EKORN", "Dyr"], ["PIGGSVIN", "Dyr"], ["SKILPADDE", "Dyr"],
  ["HVALROSS", "Dyr"], ["SOMMERFUGL", "Dyr"], ["KROKODILLE", "Dyr"], ["ISBJØRN", "Dyr"], ["REINSDYR", "Dyr"], ["MARIHØNE", "Dyr"],
  ["BLEKKSPRUT", "Dyr"], ["FLAGGERMUS", "Dyr"], ["SJØSTJERNE", "Dyr"], ["PAPEGØYE", "Dyr"], ["KENGURU", "Dyr"], ["GRÆVLING", "Dyr"],
  ["KJØTTKAKER", "Mat"], ["PANNEKAKE", "Mat"], ["BRUNOST", "Mat"], ["LEFSE", "Mat"], ["PØLSE", "Mat"], ["SPAGETTI", "Mat"],
  ["SJOKOLADE", "Mat"], ["RISGRØT", "Mat"], ["FISKESUPPE", "Mat"], ["KANELBOLLE", "Mat"], ["MATPAKKE", "Mat"], ["FÅRIKÅL", "Mat"],
  ["SKILLINGSBOLLE", "Mat"], ["RAKFISK", "Mat"], ["KNEKKEBRØD", "Mat"], ["BLÅBÆRSYLTETØY", "Mat"],
  ["NORDLYS", "Natur"], ["FOSSEFALL", "Natur"], ["REGNBUE", "Natur"], ["FJELLTOPP", "Natur"], ["SNØSTORM", "Natur"], ["TORDENVÆR", "Natur"],
  ["MIDNATTSSOL", "Natur"], ["ISBRE", "Natur"], ["VULKAN", "Natur"], ["SKOGBRANN", "Natur"], ["MYRA", "Natur"], ["SOLNEDGANG", "Natur"],
  ["TROMSØ", "Steder i Norge"], ["TRONDHEIM", "Steder i Norge"], ["STAVANGER", "Steder i Norge"], ["LILLEHAMMER", "Steder i Norge"],
  ["KRISTIANSAND", "Steder i Norge"], ["LOFOTEN", "Steder i Norge"], ["SVALBARD", "Steder i Norge"], ["BRYGGEN", "Steder i Norge"],
  ["FLØYEN", "Steder i Norge"], ["GEIRANGER", "Steder i Norge"], ["PREIKESTOLEN", "Steder i Norge"], ["ULRIKEN", "Steder i Norge"],
  ["PARAPLY", "Ting"], ["SYKKEL", "Ting"], ["DATAMASKIN", "Ting"], ["KJØLESKAP", "Ting"], ["TANNBØRSTE", "Ting"], ["LOMMELYKT", "Ting"],
  ["SOVEPOSE", "Ting"], ["RYGGSEKK", "Ting"], ["VEKKERKLOKKE", "Ting"], ["STRIKKEPINNE", "Ting"], ["OSTEHØVEL", "Ting"], ["BINDERS", "Ting"],
  ["SKIHOPP", "Sport og fritid"], ["LANGRENN", "Sport og fritid"], ["FOTBALL", "Sport og fritid"], ["SVØMMING", "Sport og fritid"],
  ["FISKETUR", "Sport og fritid"], ["HÅNDBALL", "Sport og fritid"], ["SKØYTER", "Sport og fritid"], ["KLATRING", "Sport og fritid"],
  ["FJELLTUR", "Sport og fritid"], ["DUGNAD", "Sport og fritid"], ["HYTTETUR", "Sport og fritid"], ["SKISKYTING", "Sport og fritid"],
  ["PROGRAMMERING", "Studier"], ["ALGORITME", "Studier"], ["DATABASE", "Studier"], ["KALKULATOR", "Studier"], ["EKSAMEN", "Studier"],
  ["LESESAL", "Studier"], ["FORELESNING", "Studier"], ["PENSUM", "Studier"], ["SEMESTER", "Studier"], ["KOLLOKVIE", "Studier"],
  ["SØNDAGSTUR", "Hverdag"], ["KAFFEKOPP", "Hverdag"], ["BUSSKORT", "Hverdag"], ["HANDLELISTE", "Hverdag"], ["OPPVASK", "Hverdag"],
  ["BURSDAG", "Hverdag"], ["JULEAFTEN", "Hverdag"], ["SYTTENDEMAI", "Hverdag"], ["PÅSKEEGG", "Hverdag"], ["ADVENTSKALENDER", "Hverdag"]
];
const ROWS = ["QWERTYUIOPÅ", "ASDFGHJKLØÆ", "ZXCVBNM"];

let state, word, cat;
const daily = createDaily({
  prefix: "heng",
  onLoad(k, s) {
    [word, cat] = pickDaily(WORDS, daily.dayIndex(), "hangman-v1");
    state = s || { guessed: [], status: "progress" };
    render(null);
    if (state.status !== "progress") showEnd();
  }
});

const wrongCount = () => state.guessed.filter(l => !word.includes(l)).length;

function guess(l) {
  if (state.status !== "progress" || state.guessed.includes(l)) return;
  state.guessed.push(l);
  if ([...word].every(ch => state.guessed.includes(ch))) state.status = "won";
  else if (wrongCount() >= MAX) state.status = "lost";
  daily.save(state);
  render(l);
  if (state.status !== "progress") setTimeout(showEnd, 700);
}

function showEnd() {
  if (state.status === "won") {
    const w = wrongCount();
    endOverlay(daily, { title: "Riktig!", text: `Ordet var ${word}, med ${w} feil.${daily.isToday() ? " Nytt ord i morgen." : ""}` });
  } else endOverlay(daily, { title: "Hengt!", text: `Ordet var ${word}.` });
}

function buildKeyboard() {
  const kb = $("kb"); kb.innerHTML = "";
  ROWS.forEach(row => {
    const r = document.createElement("div"); r.className = "kr";
    for (const ch of row) {
      const b = document.createElement("button");
      b.className = "key"; b.textContent = ch; b.dataset.k = ch;
      b.onclick = () => guess(ch);
      r.appendChild(b);
    }
    kb.appendChild(r);
  });
}

function render(justGuessed) {
  $("cat").textContent = cat;
  const lost = state.status === "lost";
  const slots = $("slots"); slots.innerHTML = "";
  for (const ch of word) {
    const s = document.createElement("span");
    s.className = "slot";
    if (state.guessed.includes(ch)) { s.textContent = ch; if (ch === justGuessed) s.classList.add("hit"); }
    else if (lost) { s.textContent = ch; s.classList.add("miss"); }
    slots.appendChild(s);
  }
  slots.setAttribute("aria-label", [...word].map(ch => state.guessed.includes(ch) ? ch : "tom").join(" "));
  const w = wrongCount();
  for (let i = 1; i <= MAX; i++) $("p" + i).classList.toggle("on", w >= i);
  $("wrong").innerHTML = `${pipsHtml(w, MAX)}`;
  document.querySelectorAll(".key").forEach(b => {
    const k = b.dataset.k, used = state.guessed.includes(k);
    b.className = "key" + (used ? (word.includes(k) ? " hit" : " miss") : "");
    b.disabled = used || state.status !== "progress";
  });
}

document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toUpperCase();
  if (/^[A-ZÆØÅ]$/.test(k)) guess(k);
});

buildKeyboard();
daily.start();
