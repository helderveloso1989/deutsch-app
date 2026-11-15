// Valida conteudo/exercicios.json antes de publicar. Uso: node tools/validar.mjs
// Sai com código 1 se houver erros (o bot NÃO deve publicar nesse caso).
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "www/data.js"), "utf8") + "\nthis.UNITS=UNITS;this.LEVELS=LEVELS;", ctx);
const { UNITS, LEVELS } = ctx;
const core = new Map(UNITS.map((u) => [u.id, u]));

const file = path.join(root, "conteudo/exercicios.json");
let data;
try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (e) { console.error("JSON inválido:", e.message); process.exit(1); }

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const str = (v) => typeof v === "string" && v.trim().length > 0;
const strArr = (v) => Array.isArray(v) && v.length > 0 && v.every(str);

if (!Array.isArray(data.units)) err("raiz", "falta o array units");
if (!/^\d{4}-\d{2}-\d{2}$/.test(data.updated || "")) err("raiz", "updated deve ser AAAA-MM-DD");

const ids = new Set();
const seen = new Set(UNITS.flatMap((u) => u.items.map((it) => (it.s || it.q || it.a) + "")));
for (const u of data.units || []) {
  const w = u.id || "(sem id)";
  if (!/^x-[a-c][12]-\d-\d{3}$/.test(u.id || "")) err(w, "id deve ser x-<tema>-NNN, ex.: x-b1-1-004");
  if (ids.has(u.id)) err(w, "id repetido");
  ids.add(u.id);
  const c = core.get(u.topic);
  if (!c) err(w, `topic "${u.topic}" não é uma unidade base`);
  else {
    if (c.level !== u.level) err(w, `level ${u.level} não bate com o tema (${c.level})`);
    if (!u.id.startsWith("x-" + u.topic + "-")) err(w, "id deve começar por x-" + u.topic + "-");
  }
  if (!LEVELS.includes(u.level)) err(w, "level inválido");
  if (!["read", "write"].includes(u.skill)) err(w, "skill deve ser read ou write");
  if (!str(u.title)) err(w, "falta title");
  if (!Array.isArray(u.items) || u.items.length < 6 || u.items.length > 14) err(w, "items deve ter 6 a 14 exercícios");
  (u.items || []).forEach((it, i) => {
    const wi = `${w}[${i}]`;
    switch (it.t) {
      case "mc":
        if (!str(it.q)) err(wi, "mc sem q");
        if (!strArr(it.o) || it.o.length < 2 || it.o.length > 4) err(wi, "mc precisa de 2 a 4 opções");
        else if (new Set(it.o).size !== it.o.length) err(wi, "opções repetidas");
        if (!Number.isInteger(it.a) || it.a < 0 || it.a >= (it.o || []).length) err(wi, "mc com índice a inválido");
        if (u.skill === "read" && !str(it.text)) err(wi, "exercício de leitura sem text");
        break;
      case "type":
        if (!str(it.s) || (it.s.match(/___/g) || []).length !== 1) err(wi, "type precisa de s com exatamente uma lacuna ___");
        if (!strArr(it.a)) err(wi, "type precisa de a (lista de respostas)");
        break;
      case "tr": case "fix":
        if (!str(it.s)) err(wi, it.t + " sem s");
        if (!strArr(it.a)) err(wi, it.t + " precisa de a (lista de respostas)");
        if (it.t === "fix" && strArr(it.a) && it.a.includes(it.s)) err(wi, "fix: a frase errada é igual a uma resposta");
        break;
      case "order":
        if (!str(it.a) || it.a.split(" ").length < 4) err(wi, "order precisa de a com pelo menos 4 palavras");
        break;
      default: err(wi, "tipo desconhecido: " + it.t);
    }
    const sig = (it.s || it.q || it.a) + "";
    if (seen.has(sig) && it.t !== "mc") err(wi, "exercício repetido: " + sig.slice(0, 50));
    if (!(it.t === "mc" && it.text)) seen.add(sig);
  });
}

if (errors.length) {
  console.error(`✗ ${errors.length} erro(s):\n` + errors.map((e) => " - " + e).join("\n"));
  process.exit(1);
}
const per = {};
for (const u of data.units) per[u.topic] = (per[u.topic] || 0) + 1;
console.log(`✓ ${data.units.length} unidades válidas. Por tema:`, JSON.stringify(per));
