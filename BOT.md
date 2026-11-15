# Instruções do bot de exercícios

Este bot corre agendado na cloud. Cada execução acrescenta exercícios novos de alemão a
`conteudo/exercicios.json`. A app Android descarrega esse ficheiro do GitHub sempre que abre.

O aluno é português e fala alemão bem, mas tem dificuldades em **ler e escrever**: maiúsculas
dos substantivos, terminações dos adjetivos, casos, ordem das palavras (verbo na 2.ª posição e
no fim das subordinadas), ortografia e Umlaute. A app só deixa passar ao nível seguinte com 80%
de domínio, por isso tem de haver **muita prática variada em cada tema**.

## O que fazer em cada execução

1. Lê `www/data.js` (unidades base `UNITS`, com `id`, `level`, `title` e exemplos de formato)
   e `conteudo/exercicios.json` (unidades extra que já existem).
2. Conta quantas unidades extra existem por tema (`topic`). Escolhe os **8 temas com menos
   unidades** (em empate, os de nível mais baixo primeiro) e cria **uma unidade nova** para cada um.
3. Cada unidade nova:
   - `id`: `x-<topic>-NNN`, com NNN o número seguinte para esse tema (ex.: `x-b1-3-004`).
   - `level` e `skill` iguais aos da unidade base do tema; `icon` igual ou parecido.
   - `title`: em português, por exemplo "Orações subordinadas: mais prática 4".
   - 10 exercícios novos, que não repitam frases já existentes, e do mesmo nível.
   - Temas de escrita (`skill: "write"`): mistura `type` (pelo menos 5), `fix`, `tr`, `order` e `mc`.
   - Temas de leitura (`skill: "read"`): 2 ou 3 textos novos e realistas do nível
     (anúncios, e-mails, notícias, opiniões), cada um com 3 a 4 perguntas `mc` sobre o texto
     (o campo `text` repete-se em cada pergunta do mesmo texto). Usa `"keepOrder": true`.
   - Põe uma `ex` (explicação curta em português de Portugal) na maioria dos exercícios.
   - Em `mc`, a opção certa pode estar em qualquer posição (a app baralha).
   - Em `type`, `tr` e `fix`, lista em `a` **todas** as respostas corretas razoáveis
     (ordens alternativas, sinónimos). A app compara letra a letra, incluindo maiúsculas.
4. Revê cada frase alemã com cuidado: tem de estar 100% correta (gramática, ortografia,
   maiúsculas, pontuação). Na dúvida, troca a frase por uma mais simples.
5. Atualiza `"updated"` para a data de hoje (AAAA-MM-DD). Não apagues unidades existentes.
6. Corre `node tools/validar.mjs`. Se der erros, corrige e volta a correr até passar.
7. Faz commit **só** de `conteudo/exercicios.json`, com a mensagem
   `Exercícios novos AAAA-MM-DD`, e faz push para o ramo `main`.

## Regras

- Não alteres a app (`www/`, `android/`) nem estas instruções.
- Não faças nada além do descrito acima.
- Se o push falhar, termina e explica o erro no resumo.
