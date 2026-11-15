// ================== Estado ==================
const KEY = "deutsch-app-v1";
const $app = document.getElementById("app");

function defState() {
  return { level: null, placement: null, done: {}, xp: 0, streak: 0, lastDay: null,
    mistakes: {}, extra: {}, stats: { read: [0, 0], write: [0, 0] }, tab: "learn",
    writings: [], aiItems: {}, topic: {} };
}
function load() {
  try { return Object.assign(defState(), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch (e) { return defState(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
let S = load();

// ================== Utilitários ==================
const LI = (l) => LEVELS.indexOf(l);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function today(d = new Date()) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
const pct = (p) => (p[1] ? Math.round((p[0] / p[1]) * 100) : 0);

// Registo de exercícios
const ITEMS = {};
function registerUnit(u, topic) {
  u.items.forEach((it, i) => {
    it._key = u.id + ":" + i; it._unit = u.id; it._topic = topic;
    it._skill = u.skill === "read" || it.text ? "read" : "write";
    ITEMS[it._key] = it;
  });
}
UNITS.forEach((u) => registerUnit(u, u.id));

// ================== Exercícios extra (criados pelo bot na cloud) ==================
// O bot publica conteudo/exercicios.json no GitHub; a app guarda uma cópia para usar offline.
const EXTRA_CACHE = "deutsch-extra-v1";
let EXTRA = [];
function setExtra(data) {
  if (!data || !Array.isArray(data.units)) return false;
  const coreIds = new Set(UNITS.map((u) => u.id));
  EXTRA = data.units.filter((u) => u && u.id && LEVELS.includes(u.level) && coreIds.has(u.topic) && Array.isArray(u.items) && u.items.length);
  EXTRA.forEach((u) => registerUnit(u, u.topic));
  return true;
}
try { setExtra(JSON.parse(localStorage.getItem(EXTRA_CACHE))); } catch (e) {}
async function syncExtra() {
  if (!EXTRA_URL) return;
  try {
    const res = await fetch(EXTRA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const before = EXTRA.length;
    if (!setExtra(data)) return;
    try { localStorage.setItem(EXTRA_CACHE, JSON.stringify(data)); } catch (e) {}
    S.extraUpdated = data.updated || null; save();
    if (!sess && S.level && EXTRA.length !== before && (S.tab === "learn" || S.tab === "profile")) render();
  } catch (e) { /* sem internet: fica a cópia guardada */ }
}
const allUnits = () => UNITS.concat(EXTRA);

// ================== Domínio por tema ==================
// Guarda as últimas 20 respostas de cada tema (unidade base). Domínio = % de certas.
const WINDOW = 20, MASTERY = 0.8, MIN_ANSWERS = 8;
function recordTopic(topic, ok) {
  if (!topic) return;
  const w = (S.topic[topic] = S.topic[topic] || []);
  w.push(ok ? 1 : 0); if (w.length > WINDOW) w.shift();
}
function topicMastery(topic) {
  const w = S.topic[topic] || [];
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
}
function levelMastery(L) {
  const vals = unitsOf(L).map((u) => topicMastery(u.id)).filter((v) => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function topicWeak(topic) {
  const w = S.topic[topic] || [];
  return w.length < MIN_ANSWERS || topicMastery(topic) < MASTERY;
}
// Exercícios criados pela IA a partir dos erros na escrita livre
function registerAiItem(it) { it._skill = "write"; it._unit = "ai"; ITEMS[it._key] = it; }
Object.values(S.aiItems).forEach(registerAiItem);
LEVELS.forEach((L) => PLACEMENT[L].forEach((it, i) => {
  it._key = "pt-" + L + ":" + i; it._skill = it.text ? "read" : "write";
}));

// ================== Correção de texto ==================
function norm(s) {
  return s.replace(/[‘’`´]/g, "'").replace(/[„“”"]/g, "").replace(/\s+/g, " ").trim()
    .replace(/\s+([,.;:!?])/g, "$1").replace(/[.!?]+$/, "").trim();
}
function fold(s) {
  return s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss");
}
function answersOf(it) {
  const base = Array.isArray(it.a) ? it.a : [it.a];
  return [...base, ...(it.alt || []), ...(S.extra[it._key] || [])];
}
function checkText(input, answers, caseInsensitive) {
  const n = norm(input);
  const A = answers.map(norm);
  const eq = (x, y) => caseInsensitive ? x.toLowerCase() === y.toLowerCase() : x === y;
  if (A.some((a) => eq(n, a))) return { ok: true };
  const f = A.find((a) => eq(fold(n), fold(a)));
  if (f !== undefined) return { ok: true, note: "Aceite, mas escreve com ä / ö / ü / ß: " + f };
  if (A.some((a) => n.toLowerCase() === a.toLowerCase() || fold(n).toLowerCase() === fold(a).toLowerCase()))
    return { ok: false, note: "Quase! Atenção às maiúsculas e minúsculas — em alemão todos os substantivos começam com maiúscula." };
  return { ok: false };
}

// ================== Navegação ==================
function render() {
  if (!S.level) return renderWelcome();
  if (S.tab === "review") return renderReview();
  if (S.tab === "profile") return renderProfile();
  if (S.tab === "write") return renderWrite();
  return renderHome();
}
function setTab(t) { S.tab = t; save(); render(); window.scrollTo(0, 0); }
function tabbar() {
  const b = (id, ic, label) => `<button class="${S.tab === id ? "on" : ""}" onclick="setTab('${id}')">${ic}<small>${label}</small></button>`;
  const n = Object.keys(S.mistakes).length;
  return `<nav class="tabbar">${b("learn", "🏠", "Aprender")}${b("review", "🔁", "Revisão" + (n ? " (" + n + ")" : ""))}${b("write", "✍️", "Escrever")}${b("profile", "📊", "Progresso")}</nav>`;
}
function topbar() {
  return `<div class="topbar"><span class="lvl">${S.level}</span>
    <span class="pill">🔥 ${S.streak}</span><span class="pill">⭐ ${S.xp} XP</span></div>`;
}

// ================== Boas-vindas ==================
function renderWelcome() {
  $app.innerHTML = `<div class="screen center">
    <div class="big-emoji">🇩🇪</div>
    <h1>Deutsch lernen</h1>
    <p class="muted">Foco em <b>ler</b> e <b>escrever</b> alemão.<br>Começa com um teste rápido (≈ 5–10 min) para encontrar o teu nível.</p>
    <div class="spacer"></div>
    <button class="btn" onclick="startPlacement()">Fazer teste de nível</button>
    <button class="linkbtn" onclick="pickLevel()">Já sei o meu nível</button>
  </div>`;
}
function pickLevel() {
  $app.innerHTML = `<div class="screen center"><h2>Escolhe o nível onde queres começar</h2>
    <div class="options" style="width:100%">${LEVELS.map((L) => `<button class="opt" onclick="setLevel('${L}')"><b>${L}</b> — ${LEVEL_INFO[L]}</button>`).join("")}</div>
    <button class="linkbtn" onclick="render()">Voltar</button></div>`;
}
function setLevel(L) { S.level = L; S.tab = "learn"; save(); render(); }

// ================== Teste de nível ==================
function startPlacement() {
  let li = 0, passed = null;
  const scores = { read: [0, 0], write: [0, 0] };
  const runBlock = () => {
    const L = LEVELS[li];
    startSession({ title: "Teste de nível · bloco " + L, items: PLACEMENT[L], mode: "test",
      onDone: (r) => {
        r.results.forEach((x) => { scores[x.skill][1]++; if (x.ok) scores[x.skill][0]++; });
        const ok = r.results.filter((x) => x.ok).length;
        if (ok >= 4) { passed = L; li++; if (li < LEVELS.length) return runBlock(); }
        finishPlacement(passed, scores);
      } });
  };
  runBlock();
}
function finishPlacement(passed, scores) {
  const start = !passed ? "A2" : LEVELS[Math.min(LI(passed) + 1, LEVELS.length - 1)];
  S.level = start; S.tab = "learn";
  S.placement = { passed, read: pct(scores.read), write: pct(scores.write), date: today() };
  save();
  const weak = S.placement.read < S.placement.write ? "leitura" : "escrita";
  $app.innerHTML = `<div class="screen center">
    <div class="big-emoji">🎯</div>
    <h2>Resultado do teste</h2>
    <p>Nível consolidado: <b>${passed || "abaixo de A2"}</b></p>
    <div class="card" style="width:100%"><span class="muted">Vais começar em</span><b>${start}</b><span class="muted">${LEVEL_INFO[start]}</span></div>
    <div class="skills">
      <div>📖 Leitura — ${S.placement.read}%<div class="bar blue"><i style="width:${S.placement.read}%"></i></div></div>
      <div>✍️ Escrita — ${S.placement.write}%<div class="bar"><i style="width:${S.placement.write}%"></i></div></div>
    </div>
    <p class="muted">${S.placement.read === S.placement.write ? "Leitura e escrita equilibradas." : "Ponto a reforçar: <b>" + weak + "</b>."} Os níveis abaixo ficam abertos para revisão.</p>
    <div class="spacer"></div>
    <button class="btn" onclick="render()">Começar a aprender</button></div>`;
}

// ================== Desbloqueio ==================
function unitsOf(L) { return UNITS.filter((u) => u.level === L); }
function levelDone(L) { return unitsOf(L).every((u) => S.done[u.id]); }
// Para abrir o nível seguinte: todas as unidades feitas E cada tema do nível com ≥ 80% de domínio
function levelReady(L) { return levelDone(L) && unitsOf(L).every((u) => !topicWeak(u.id)); }
function levelOpen(L) {
  const i = LI(L), cur = LI(S.level);
  if (i <= cur) return true;
  return levelReady(LEVELS[i - 1]) && levelOpen(LEVELS[i - 1]);
}
function extraOf(L) { return EXTRA.filter((u) => u.level === L); }
function unitOpen(u) {
  if (!levelOpen(u.level)) return false;
  if (LI(u.level) < LI(S.level)) return true;
  const list = unitsOf(u.level), i = list.indexOf(u);
  return i === 0 || !!S.done[list[i - 1].id];
}

// ================== Início (caminho) ==================
function renderHome() {
  let html = `<div class="screen">${topbar()}`;
  let firstCurrent = null;
  LEVELS.forEach((L) => {
    const open = levelOpen(L);
    const m = Math.round(levelMastery(L) * 100);
    html += `<div class="level-head ${open ? "" : "locked"}" id="lv-${L}">${open ? "" : "🔒 "}Nível ${L}<small>${LEVEL_INFO[L]}</small>
      ${open ? `<div class="mastery"><div class="bar"><i style="width:${m}%"></i></div><small>Domínio médio ${m}% · objetivo ${MASTERY * 100}% em cada tema</small></div>` : ""}</div><div class="path">`;
    unitsOf(L).forEach((u) => {
      const uo = unitOpen(u), d = S.done[u.id];
      if (uo && !d && !firstCurrent && LI(L) >= LI(S.level)) firstCurrent = u.id;
      const tm = topicMastery(u.id);
      html += `<button class="node ${u.skill} ${uo ? "" : "locked"} ${d ? "done" : ""}" id="u-${u.id}" ${uo ? `onclick="startUnit('${u.id}')"` : ""}>
        <div class="circle">${u.icon}</div><span>${esc(u.title)}${d && tm !== null ? `<br><small class="muted">domínio ${Math.round(tm * 100)}%</small>` : ""}</span></button>`;
    });
    html += `</div>`;
    if (open) html += extraBlock(L);
  });
  html += `<div class="spacer"></div></div>${tabbar()}`;
  $app.innerHTML = html;
  const el = document.getElementById(firstCurrent ? "u-" + firstCurrent : "lv-" + S.level);
  if (el) el.scrollIntoView({ block: "center" });
}

// Bloco de prática extra de um nível: unidades do bot, primeiro as dos temas fracos
function extraBlock(L) {
  const weakTopics = unitsOf(L).filter((u) => S.done[u.id] && topicWeak(u.id));
  const ex = extraOf(L);
  const pending = ex.filter((u) => !S.done[u.id])
    .sort((a, b) => (topicWeak(b.topic) ? 1 : 0) - (topicWeak(a.topic) ? 1 : 0));
  const doneN = ex.length - pending.length;
  let h = "";
  const nextL = LEVELS[LI(L) + 1];
  if (levelDone(L) && !levelReady(L) && nextL)
    h += `<div class="card notice">🔒 Para abrir o <b>Nível ${nextL}</b> precisas de <b>${MASTERY * 100}% de domínio em cada tema</b> do ${L} (nas últimas ${WINDOW} respostas). Ainda falta: <b>${weakTopics.map((u) => esc(u.title)).join(", ")}</b>.</div>`;
  if (weakTopics.length)
    h += `<button class="btn blue" style="margin:8px 0" onclick="startWeak('${L}')">🎯 Treinar pontos fracos (${weakTopics.map((u) => esc(u.title)).join(", ")})</button>`;
  if (!ex.length) return h;
  h += `<div class="extra-head">🏋️ Prática extra ${L} <small class="muted">${doneN}/${ex.length} feitas</small></div><div class="path">`;
  pending.slice(0, 6).forEach((u) => {
    const rec = S.done[u.topic] && topicWeak(u.topic);
    h += `<button class="node ${u.skill}" onclick="startUnit('${u.id}')"><div class="circle">${u.icon || "🏋️"}</div>
      <span>${esc(u.title)}${rec ? `<br><small class="rec">⭐ recomendado</small>` : ""}</span></button>`;
  });
  h += `</div>`;
  if (!pending.length) h += `<p class="muted" style="text-align:center">Fizeste toda a prática extra deste nível. O bot vai criar mais.</p>`;
  return h;
}

// Treino misto com exercícios dos temas fracos (unidades base + extra)
function startWeak(L) {
  const topics = new Set(unitsOf(L).filter((u) => S.done[u.id] && topicWeak(u.id)).map((u) => u.id));
  const pool = Object.values(ITEMS).filter((it) => topics.has(it._topic) && !it.text);
  const items = shuffle(pool).slice(0, 12);
  if (!items.length) return;
  startSession({ title: "Pontos fracos", items, mode: "lesson", onDone: (r) => finishLesson(r) });
}

function startUnit(id) {
  const u = allUnits().find((x) => x.id === id);
  const items = u.keepOrder ? u.items : shuffle(u.items);
  startSession({ title: u.title, items, mode: "lesson", onDone: (r) => {
    const p = Math.round((r.correct / r.total) * 100);
    const passed = p >= 60;
    if (passed) S.done[u.id] = { best: Math.max(p, (S.done[u.id] || {}).best || 0) };
    finishLesson(r, passed ? null : "Precisas de pelo menos 60% para concluir esta unidade. Tenta outra vez!");
  } });
}

// ================== Revisão ==================
function renderReview() {
  const keys = Object.keys(S.mistakes).filter((k) => ITEMS[k]);
  $app.innerHTML = `<div class="screen">${topbar()}
    <h2>🔁 Revisão de erros</h2>
    <p class="muted">Os exercícios que erraste ficam aqui até os acertares.</p>
    <div class="card"><b>${keys.length}</b>exercícios por rever</div>
    <div class="spacer"></div>
    ${keys.length ? `<button class="btn" onclick="startReview()">Rever ${Math.min(keys.length, 12)} exercícios</button>` : `<p class="muted" style="text-align:center">Nada para rever. Bom trabalho! 🎉</p>`}
  </div>${tabbar()}`;
}
function startReview() {
  const keys = shuffle(Object.keys(S.mistakes).filter((k) => ITEMS[k])).slice(0, 12);
  startSession({ title: "Revisão", items: keys.map((k) => ITEMS[k]), mode: "review", onDone: (r) => finishLesson(r) });
}

// ================== Progresso ==================
function renderProfile() {
  const r = pct(S.stats.read), w = pct(S.stats.write);
  const doneN = Object.keys(S.done).length;
  $app.innerHTML = `<div class="screen">${topbar()}
    <h2>📊 Progresso</h2>
    <div class="cards">
      <div class="card"><b>🔥 ${S.streak}</b>dias seguidos</div>
      <div class="card"><b>⭐ ${S.xp}</b>XP total</div>
      <div class="card"><b>${doneN}/${UNITS.length}</b>unidades</div>
      <div class="card"><b>${S.level}</b>nível atual</div>
    </div>
    <h3 style="margin-top:12px">Precisão por competência</h3>
    <div class="skills">
      <div>📖 Leitura — ${r}% <small class="muted">(${S.stats.read[1]} respostas)</small><div class="bar blue"><i style="width:${r}%"></i></div></div>
      <div>✍️ Escrita — ${w}% <small class="muted">(${S.stats.write[1]} respostas)</small><div class="bar"><i style="width:${w}%"></i></div></div>
    </div>
    <p class="muted">🏋️ Exercícios extra do bot: <b>${EXTRA.length}</b> unidades${S.extraUpdated ? " · atualizados em " + esc(S.extraUpdated) : ""}${EXTRA_URL ? "" : " (fonte online ainda não configurada)"}</p>
    ${S.placement ? `<p class="muted">Teste de nível (${S.placement.date}): consolidado ${S.placement.passed || "< A2"} · leitura ${S.placement.read}% · escrita ${S.placement.write}%</p>` : ""}
    <div class="spacer"></div>
    <button class="btn ghost" onclick="startPlacement()">Refazer teste de nível</button>
    <button class="linkbtn" style="color:var(--red)" onclick="resetAll()">Apagar todo o progresso</button>
  </div>${tabbar()}`;
}
function resetAll() {
  if (!confirm("Apagar todo o progresso? Isto não pode ser desfeito.")) return;
  S = defState(); save(); render();
}
function bumpStreak() {
  const t = today(), y = today(new Date(Date.now() - 864e5));
  if (S.lastDay !== t) { S.streak = S.lastDay === y ? S.streak + 1 : 1; S.lastDay = t; }
}

// ================== Escrita livre (corretor gratuito) ==================
let writeTask = null;
function renderWrite() {
  const tasks = WRITING_TASKS[S.level] || WRITING_TASKS.B1;
  const hist = S.writings.slice(-5).reverse();
  $app.innerHTML = `<div class="screen">${topbar()}
    <h2>✍️ Escrita livre · ${S.level}</h2>
    <p class="muted">Escolhe um tema. O texto é corrigido de graça (LanguageTool, precisa de internet) e os teus erros viram exercícios na Revisão.</p>
    <div class="options">
      ${tasks.map((t, i) => `<button class="opt" onclick="openWriting(${i})">${esc(t)}</button>`).join("")}
      <button class="opt" onclick="openWriting(-1)">🆓 <b>Tema livre</b> — escreve sobre o que quiseres</button>
    </div>
    ${hist.length ? `<h3 style="margin-top:18px">Últimos textos</h3>` + hist.map((w) => `<div class="list-row"><span>${esc(w.date)} · ${esc(w.task.slice(0, 38))}…</span><b>${w.nota}% · ${w.erros ?? "?"} erros</b></div>`).join("") : ""}
    <div class="spacer"></div>
  </div>${tabbar()}`;
}

function openWriting(i) {
  writeTask = i < 0 ? "Tema livre: escreve sobre um tema à tua escolha." : (WRITING_TASKS[S.level] || WRITING_TASKS.B1)[i];
  const draft = (() => { try { return localStorage.getItem("deutsch-draft") || ""; } catch (e) { return ""; } })();
  $app.innerHTML = `<div class="screen">
    <div class="lesson-top"><button class="x" onclick="render()">✕</button><b>Escrita livre</b></div>
    <div class="passage" style="white-space:normal">${esc(writeTask)}</div>
    <textarea id="inp" rows="10" autocapitalize="sentences" spellcheck="false" placeholder="Schreib hier deinen Text…" oninput="onDraft()">${esc(draft)}</textarea>
    <div class="umlauts">${["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü", "„", "“"].map((c) => `<button onmousedown="event.preventDefault()" onclick="insertChar('${c}')">${c}</button>`).join("")}</div>
    <p class="muted" id="wc">0 palavras</p>
    <div class="spacer"></div>
    <div class="footer" id="footer"><button class="btn" id="checkBtn" onclick="sendWriting()">Corrigir</button></div>
  </div>`;
  onDraft();
}
// onInput é chamado pelas caixas de texto e pelos botões de umlaut (lições e escrita livre)
function onInput() { onDraft(); }
function onDraft() {
  const el = document.getElementById("inp"), v = el.value;
  if (sess) { // dentro de uma lição: comportamento normal
    document.getElementById("checkBtn").disabled = !v.trim() || sess.st.checked; return;
  }
  try { localStorage.setItem("deutsch-draft", v); } catch (e) {}
  const n = v.trim() ? v.trim().split(/\s+/).length : 0;
  const wc = document.getElementById("wc"); if (wc) wc.textContent = n + " palavras";
  document.getElementById("checkBtn").disabled = n < 5;
}

async function sendWriting() {
  const text = document.getElementById("inp").value.trim();
  const btn = document.getElementById("checkBtn");
  btn.disabled = true; btn.textContent = "A corrigir…";
  try {
    const r = await window.Corretor.corrigirTexto(text);
    try { localStorage.removeItem("deutsch-draft"); } catch (e) {}
    showCorrection(text, r);
  } catch (e) {
    btn.disabled = false; btn.textContent = "Corrigir";
    alert(e.message || String(e));
  }
}

function showCorrection(text, r) {
  // Guardar exercícios gerados como itens de revisão
  const stamp = Date.now();
  let added = 0;
  (r.exercicios || []).forEach((ex, i) => {
    if ((ex.frase.match(/___/g) || []).length !== 1 || !ex.resposta.trim()) return;
    const it = { t: "type", s: ex.frase, a: [ex.resposta.trim()], h: ex.pista, ex: "Exercício criado a partir de um erro teu na escrita livre.", _key: "ai-" + stamp + ":" + i };
    S.aiItems[it._key] = { t: it.t, s: it.s, a: it.a, h: it.h, ex: it.ex, _key: it._key };
    registerAiItem(it); S.mistakes[it._key] = 1; added++;
  });
  S.writings.push({ date: today(), task: writeTask, nota: r.nota, erros: r.erros.length });
  S.writings = S.writings.slice(-30);
  S.xp += 15; bumpStreak();
  save();

  // Marcar os erros no texto original (por posição, do fim para o início)
  let marked = "", pos = 0;
  [...r.erros].sort((a, b) => a.offset - b.offset).forEach((e) => {
    if (e.offset < pos) return;
    marked += esc(text.slice(pos, e.offset)) + `<mark class="err">${esc(e.original)}</mark>`;
    pos = e.offset + e.length;
  });
  marked += esc(text.slice(pos));
  $app.innerHTML = `<div class="screen">
    <div class="lesson-top"><button class="x" onclick="render()">✕</button><b>Correção</b></div>
    <div class="result-row">
      <div class="card"><b>🎯 ${r.nota}%</b>nota</div>
      <div class="card"><b>${r.erros.length}</b>erros</div>
      <div class="card"><b>${r.palavras}</b>palavras</div>
    </div>
    <h3 style="margin-top:14px">O teu texto</h3>
    <div class="passage">${marked}</div>
    ${r.erros.length ? `<h3>Erros</h3>` + r.erros.map((e) => `<div class="card errcard">
        <div><s>${esc(e.original)}</s> → <b>${esc(e.correcao || "?")}</b>${e.alternativas.length ? ` <small class="muted">(ou ${e.alternativas.map(esc).join(", ")})</small>` : ""} <small class="tag">${esc(e.tipo)}</small></div>
        ${e.dicaPt ? `<div style="margin-top:4px">${esc(e.dicaPt)}</div>` : ""}
        <div class="muted" style="margin-top:2px">🇩🇪 ${esc(e.mensagem)}</div></div>`).join("") : `<p>Não foram encontrados erros! 🎉</p>`}
    <h3 style="margin-top:14px">Texto corrigido</h3>
    <div class="passage">${esc(r.texto_corrigido)}</div>
    <div class="card" style="margin-bottom:12px"><b>💡 Revê tu também</b>
      <span class="muted">O corretor automático não apanha tudo — sobretudo a <b>ordem das palavras</b> (verbo na 2.ª posição; no fim nas orações com weil, dass, wenn…) e a escolha de vocabulário.</span></div>
    ${added ? `<div class="card" style="margin-bottom:12px"><b>🔁 +${added}</b>exercícios novos na Revisão, criados a partir dos teus erros.</div>` : ""}
    <button class="btn" onclick="render()">Continuar</button>
  </div>`;
  window.scrollTo(0, 0);
}

// ================== Sessão de exercícios ==================
let sess = null;
function startSession({ title, items, mode, onDone }) {
  sess = { title, items: [...items], i: 0, mode, onDone, results: [], retried: new Set(), st: null };
  renderEx();
}
function cur() { return sess.items[sess.i]; }

function promptOf(it) {
  if (it.t === "mc") return it.text ? "Lê o texto e responde" : "Escolhe a resposta certa";
  if (it.t === "type") return it.q || "Completa a frase";
  if (it.t === "tr") return it.q || "Traduz para alemão";
  if (it.t === "fix") return it.q || "Corrige a frase (há um erro)";
  if (it.t === "order") return it.q || "Ordena as palavras";
}

function renderEx() {
  const it = cur();
  const total = sess.items.length;
  sess.st = { checked: false };
  let body = `<div class="prompt">${esc(promptOf(it))}</div>`;
  if (it.text) body += `<div class="passage">${esc(it.text)}</div>`;

  if (it.t === "mc") {
    sess.st.order = shuffle(it.o.map((_, i) => i));
    sess.st.sel = null;
    body += `<div class="sentence"><b>${esc(it.q)}</b></div><div class="options">` +
      sess.st.order.map((oi, k) => `<button class="opt" id="opt${k}" onclick="selOpt(${k})">${esc(it.o[oi])}</button>`).join("") + `</div>`;
  } else if (it.t === "order") {
    let words = it.a.split(" ").concat(it.d || []);
    let sh; do { sh = shuffle(words); } while (sh.join(" ") === it.a && words.length > 1);
    sess.st.bank = sh; sess.st.chosen = [];
    body += `<div class="tiles answer-line" id="line"></div><div class="tiles" id="bank"></div>`;
  } else {
    if (it.t === "type") {
      body += `<div class="sentence">${esc(it.s).replace("___", '<span class="gap">&nbsp;</span>')}</div>`;
    } else {
      body += `<div class="sentence">„${esc(it.s)}“</div>`;
    }
    if (it.h) body += `<div class="hint">💡 ${esc(it.h)}</div>`;
    if (it.t === "type") {
      body += `<input class="inp" id="inp" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Escreve aqui…" oninput="onInput()">`;
    } else {
      body += `<textarea id="inp" rows="3" autocapitalize="sentences" autocorrect="off" spellcheck="false" placeholder="Escreve em alemão…" oninput="onInput()">${it.t === "fix" ? esc(it.s) : ""}</textarea>`;
    }
    body += `<div class="umlauts">${["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"].map((c) => `<button onmousedown="event.preventDefault()" onclick="insertChar('${c}')">${c}</button>`).join("")}</div>`;
  }

  const prog = sess.mode === "test" ? `<span class="muted" style="font-weight:700">${esc(sess.title.split("· ")[1] || "")}</span>` : "";
  $app.innerHTML = `<div class="screen">
    <div class="lesson-top"><button class="x" onclick="quitSession()">✕</button>
      <div class="bar"><i style="width:${(sess.i / total) * 100}%"></i></div>${prog}</div>
    ${body}
    <div class="spacer"></div>
    <div class="footer" id="footer"><button class="btn" id="checkBtn" disabled onclick="check()">Verificar</button></div>
  </div>`;

  if (it.t === "order") renderTiles();
  const inp = document.getElementById("inp");
  if (inp) {
    onInput();
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); primaryAction(); } });
    if (it.t !== "fix") inp.focus();
  }
}

function primaryAction() {
  if (!sess) return;
  if (sess.st.checked) next(); else if (!document.getElementById("checkBtn").disabled) check();
}
function insertChar(ch) {
  const el = document.getElementById("inp");
  const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
  el.value = el.value.slice(0, s) + ch + el.value.slice(e);
  el.focus(); el.setSelectionRange(s + ch.length, s + ch.length); onInput();
}
function selOpt(k) {
  if (sess.st.checked) return;
  sess.st.sel = k;
  document.querySelectorAll(".opt").forEach((b, j) => b.classList.toggle("sel", j === k));
  document.getElementById("checkBtn").disabled = false;
}
function renderTiles() {
  const st = sess.st;
  document.getElementById("line").innerHTML = st.chosen.map((bi, p) => `<button class="tile" onclick="untile(${p})">${esc(st.bank[bi])}</button>`).join("");
  document.getElementById("bank").innerHTML = st.bank.map((w, bi) => `<button class="tile ${st.chosen.includes(bi) ? "used" : ""}" onclick="tile(${bi})">${esc(w)}</button>`).join("");
  document.getElementById("checkBtn").disabled = st.chosen.length === 0;
}
function tile(bi) { if (sess.st.checked || sess.st.chosen.includes(bi)) return; sess.st.chosen.push(bi); renderTiles(); }
function untile(p) { if (sess.st.checked) return; sess.st.chosen.splice(p, 1); renderTiles(); }

function correctDisplay(it) {
  if (it.t === "mc") return it.o[it.a];
  if (it.t === "type") return it.s.replace("___", it.a[0]);
  if (it.t === "order") return it.a;
  return it.a[0];
}

function check() {
  const it = cur(), st = sess.st;
  if (st.checked) return;
  let res;
  if (it.t === "mc") {
    res = { ok: st.order[st.sel] === it.a };
  } else if (it.t === "order") {
    st.input = st.chosen.map((bi) => st.bank[bi]).join(" ");
    res = checkText(st.input, answersOf(it), true);
  } else {
    st.input = document.getElementById("inp").value;
    res = checkText(st.input, answersOf(it), false);
  }
  st.checked = true;
  const first = !sess.retried.has(it._key) || sess.mode === "test";
  if (first) {
    sess.results.push({ key: it._key, skill: it._skill, ok: res.ok });
    S.stats[it._skill][1]++; if (res.ok) S.stats[it._skill][0]++;
    if (sess.mode !== "test") recordTopic(it._topic, res.ok);
  }
  if (sess.mode !== "test") {
    if (res.ok) delete S.mistakes[it._key];
    else {
      S.mistakes[it._key] = 1;
      if (!sess.retried.has(it._key)) { sess.retried.add(it._key); sess.items.push(it); }
    }
  }
  save();
  if (sess.mode === "test") return next();
  showFeedback(res, first);
}

function showFeedback(res, first) {
  const it = cur();
  document.querySelectorAll(".opt").forEach((b, j) => b.disabled = true);
  const inp = document.getElementById("inp"); if (inp) inp.readOnly = true;
  let txt = "";
  if (res.note) txt += `<div>${esc(res.note)}</div>`;
  if (!res.ok) txt += `<div>Resposta certa: <span class="ans">${esc(correctDisplay(it))}</span></div>`;
  if (it.ex) txt += `<div style="margin-top:6px">💡 ${esc(it.ex)}</div>`;
  const override = !res.ok && it.t !== "mc" && first
    ? `<button class="linkbtn" onclick="acceptMine()">A minha resposta também está certa</button>` : "";
  document.getElementById("footer").className = "footer " + (res.ok ? "ok" : "bad");
  document.getElementById("footer").innerHTML = `
    <div class="fb-title">${res.ok ? "Muito bem! ✓" : "Não está certo ✗"}</div>
    <div class="fb-text">${txt}</div>
    <button class="btn ${res.ok ? "" : "red"}" onclick="next()" id="nextBtn">Continuar</button>${override}`;
  document.getElementById("nextBtn").focus();
}

// Para traduções com várias respostas possíveis: aceitar a minha e lembrar-me dela.
function acceptMine() {
  const it = cur();
  const mine = norm(sess.st.input);
  (S.extra[it._key] = S.extra[it._key] || []).push(mine);
  const r = sess.results[sess.results.length - 1];
  if (r && r.key === it._key && !r.ok) {
    r.ok = true; S.stats[it._skill][0]++;
    const w = S.topic[it._topic]; if (w && w.length) w[w.length - 1] = 1;
  }
  delete S.mistakes[it._key];
  // retirar a repetição que tinha sido posta no fim
  const idx = sess.items.lastIndexOf(it);
  if (idx > sess.i) sess.items.splice(idx, 1);
  save();
  showFeedback({ ok: true, note: "Resposta aceite e guardada para a próxima vez." }, false);
}

function next() {
  sess.i++;
  if (sess.i >= sess.items.length) {
    const s = sess; sess = null;
    const correct = s.results.filter((x) => x.ok).length;
    return s.onDone({ results: s.results, correct, total: s.results.length });
  }
  renderEx();
  window.scrollTo(0, 0);
}

function quitSession() {
  if (!confirm(sess.mode === "test" ? "Sair do teste? O progresso do teste perde-se." : "Sair da lição? O progresso desta lição perde-se.")) return;
  sess = null; render();
}

function finishLesson(r, warn) {
  const gained = r.correct * 2 + (warn ? 0 : 5);
  S.xp += gained;
  bumpStreak();
  save();
  const p = r.total ? Math.round((r.correct / r.total) * 100) : 0;
  $app.innerHTML = `<div class="screen center">
    <div class="big-emoji">${warn ? "💪" : p === 100 ? "🏆" : "🎉"}</div>
    <h2>${warn ? "Quase lá!" : "Lição concluída!"}</h2>
    <div class="result-row">
      <div class="card"><b>⭐ +${gained}</b>XP</div>
      <div class="card"><b>🎯 ${p}%</b>precisão</div>
      <div class="card"><b>🔥 ${S.streak}</b>dias</div>
    </div>
    ${warn ? `<p class="muted">${warn}</p>` : ""}
    <div class="spacer"></div>
    <button class="btn" onclick="render()">Continuar</button></div>`;
}

render();
syncExtra();
