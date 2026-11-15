// Correção gratuita de textos com a API pública do LanguageTool (sem conta, sem chave).
// Limites do serviço gratuito: ~20 pedidos/minuto e ~20 000 caracteres por pedido.

const LT_URL = "https://api.languagetool.org/v2/check";

// Categorias do LanguageTool → nome e explicação em português
const LT_CATS = {
  TYPOS: ["ortografia", "Palavra mal escrita."],
  CASING: ["maiúsculas", "Em alemão, substantivos e nomes próprios começam com maiúscula; o resto em minúscula."],
  GRAMMAR: ["gramática", "Concordância, casos ou conjugação."],
  PUNCTUATION: ["pontuação", "Em alemão, as orações subordinadas separam-se sempre com vírgula."],
  CONFUSED_WORDS: ["palavras confundidas", "Palavra parecida com outra mas com significado diferente."],
  COMPOUNDING: ["palavras compostas", "Em alemão, palavras compostas escrevem-se juntas ou com hífen."],
  STYLE: ["estilo", "Correto, mas pode ficar mais natural."],
  REDUNDANCY: ["estilo", "Repetição desnecessária."],
  COLLOQUIALISMS: ["registo", "Expressão coloquial — evita em textos formais."],
  TYPOGRAPHY: ["tipografia", "Espaços, aspas ou travessões."],
  SEMANTICS: ["sentido", "A frase pode não fazer sentido lógico."],
};

// ---------- Regras próprias de ordem das palavras (o LanguageTool falha muitas vezes nisto) ----------
const PRON = "ich|du|er|sie|es|wir|ihr|man";
const AUX = "bin|bist|ist|sind|seid|war|warst|waren|wart|habe|hast|hat|haben|habt|hatte|hattest|hatten|hattet|" +
  "werde|wirst|wird|werden|werdet|wurde|wurden|kann|kannst|können|könnt|konnte|konnten|muss|musst|müssen|müsst|musste|mussten|" +
  "will|willst|wollen|wollt|wollte|wollten|soll|sollst|sollen|sollt|sollte|sollten|darf|darfst|dürfen|durfte|mag|möchte|möchtest|möchten|" +
  "wäre|wären|hätte|hätten|würde|würdest|würden|könnte|könnten|gehe|gehst|geht|gehen|komme|kommst|kommt|kommen|mache|machst|macht|machen";
// verbo conjugado: lista acima ou terminação regular que combina com o pronome
const VERB_END = { ich: /e$/, du: /st$/, er: /t$/, sie: /(t|en)$/, es: /t$/, wir: /en$/, ihr: /t$/, man: /t$/ };
// palavras frequentes com essas terminações que NÃO são verbos
const NOT_VERB = new Set(("gerne heute keine meine deine seine ihre unsere eure eine diese jede alle viele wenige lange immer gestern " +
  "nicht jetzt oft selbst meist erst sonst bereits fast zuerst zuletzt gut schlecht recht leicht spät bitte etwa ganz sehr auch noch schon " +
  "einen meinen deinen seinen keinen diesen allen vielen gegen neben unten oben zwischen morgen wieder wirklich leider dann dort hier " +
  "ziemlich manchmal endlich selten zusammen trotzdem deshalb danach vorher nachher eben gerade genau besonders").split(" "));
const isVerb = (pron, w) => !NOT_VERB.has(w.toLowerCase()) &&
  (new RegExp("^(" + AUX + ")$").test(w) || (/^[a-zäöüß]{3,}$/.test(w) && VERB_END[pron.toLowerCase()].test(w)));

const ADV = "Leider|Gestern|Heute|Morgen|Dann|Danach|Deshalb|Deswegen|Darum|Trotzdem|Jetzt|Später|Manchmal|Oft|Immer|Zuerst|" +
  "Außerdem|Natürlich|Vielleicht|Hier|Dort|Abends|Morgens|Früher|Damals|Plötzlich|Endlich|Schließlich|Sonst|Dabei|Nun|Bald|Normalerweise";
const SUB = "weil|dass|obwohl|wenn|ob|als|damit|bevor|nachdem|sodass|falls";

function regrasOrdem(text) {
  const out = [];
  // 1) Advérbio no início + sujeito + verbo  →  advérbio + verbo + sujeito (verbo na 2.ª posição)
  const r1 = new RegExp("(^|[.!?]\\s+)(" + ADV + ")(,?)\\s+(" + PRON + ")\\s+([a-zäöüß]+)\\b", "g");
  let m;
  while ((m = r1.exec(text))) {
    const [, pre, adv, , pron, verb] = m;
    if (!isVerb(pron, verb)) continue;
    const start = m.index + pre.length, original = m[0].slice(pre.length);
    out.push({ offset: start, length: original.length, original,
      correcao: `${adv} ${verb} ${pron}`, alternativas: [], tipo: "ordem das palavras",
      dicaPt: `Quando a frase começa com "${adv}", o verbo conjugado vem logo a seguir (2.ª posição) e o sujeito passa para depois do verbo.`,
      mensagem: "Verb an Position 2: " + `${adv} ${verb} ${pron} …`, local: true });
  }
  // 2) Oração subordinada (weil, dass…): o verbo conjugado vai para o fim da oração
  const r2 = new RegExp("\\b(" + SUB + ")\\s+(" + PRON + ")\\s+([a-zäöüß]+)\\s+([^,.;:!?]+?)(?=[,.;:!?]|$)", "gi");
  while ((m = r2.exec(text))) {
    const [full, sub, pron, verb, rest] = m;
    if (!isVerb(pron, verb) || !rest.trim()) continue;
    out.push({ offset: m.index, length: full.length, original: full,
      correcao: `${sub} ${pron} ${rest.trim()} ${verb}`, alternativas: [], tipo: "ordem das palavras",
      dicaPt: `Depois de "${sub.toLowerCase()}", o verbo conjugado vai para o fim da oração.`,
      mensagem: "Nebensatz: Verb am Ende.", local: true });
  }
  return out;
}

async function corrigirTexto(text) {
  let res;
  try {
    res = await fetch(LT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text, language: "de-DE", motherTongue: "pt-PT", level: "picky" }),
    });
  } catch (e) {
    throw new Error("Sem ligação à internet. A correção de textos precisa de internet.");
  }
  if (res.status === 429) throw new Error("Demasiados pedidos seguidos. Espera um minuto e tenta outra vez.");
  if (!res.ok) throw new Error("O corretor não está disponível agora (erro " + res.status + "). Tenta mais tarde.");
  const data = await res.json();

  const erros = data.matches.map((m) => {
    const cat = LT_CATS[m.rule.category.id] || ["outro", ""];
    return {
      offset: m.offset, length: m.length,
      original: text.substr(m.offset, m.length),
      correcao: (m.replacements[0] || {}).value || "",
      alternativas: m.replacements.slice(1, 3).map((r) => r.value),
      tipo: cat[0], dicaPt: cat[1],
      mensagem: m.message,
      frase: m.sentence || "",
    };
  });

  // Juntar as regras próprias, sem sobrepor erros já encontrados pelo LanguageTool
  regrasOrdem(text).forEach((e) => {
    const ov = (x) => e.offset < x.offset + x.length && x.offset < e.offset + e.length;
    const clash = erros.filter(ov);
    if (clash.some((x) => x.correcao)) return; // o LanguageTool já tem uma correção concreta aqui
    clash.forEach((x) => erros.splice(erros.indexOf(x), 1)); // trocar avisos sem sugestão pela nossa correção
    const before = text.slice(0, e.offset), after = text.slice(e.offset);
    const s0 = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? ")) + 1;
    const endRel = after.search(/[.!?](\s|$)/);
    e.frase = text.slice(s0, endRel < 0 ? text.length : e.offset + endRel + 1).trim();
    erros.push(e);
  });
  erros.sort((a, b) => a.offset - b.offset);

  // Texto corrigido: aplicar a 1.ª sugestão de cada erro, do fim para o início
  let corrigido = text;
  [...erros].sort((a, b) => b.offset - a.offset).forEach((e) => {
    if (e.correcao) corrigido = corrigido.slice(0, e.offset) + e.correcao + corrigido.slice(e.offset + e.length);
  });

  const palavras = text.trim().split(/\s+/).length;
  const graves = erros.filter((e) => !["estilo", "tipografia", "registo"].includes(e.tipo)).length;
  const nota = Math.max(0, Math.round(100 - (graves / palavras) * 400));

  // Exercícios: a frase do próprio aluno com a palavra corrigida em branco
  const exercicios = [];
  erros.forEach((e) => {
    if (exercicios.length >= 3 || !e.correcao || !e.frase || e.tipo === "tipografia") return;
    const corr = e.frase.replace(e.original, e.correcao);
    if (corr === e.frase || !corr.includes(e.correcao)) return;
    exercicios.push({ frase: corr.replace(e.correcao, "___").trim(), resposta: e.correcao,
      pista: e.local ? "ordem das palavras · reescreve: " + e.original : e.tipo + " · escreveste: " + e.original });
  });

  return { nota, erros, texto_corrigido: corrigido, exercicios, palavras };
}

window.Corretor = { corrigirTexto };
