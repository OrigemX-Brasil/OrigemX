# Teste de carga

Procedimento, não rotina. Roda quando se quer um número para entregar, e o
resultado sai em `reports/loadtest-<data>.md`.

```bash
npm run seed:load          # 5k usuários · 5k canis · 50k cães · 12,5k publicados
npm run loadtest:prepare   # confere o volume e exporta as fixtures do k6
npm run loadtest:action    # descobre os ids das Server Actions e PROVA que gravam

npm run build && npx next start -p 3400      # a build de PRODUÇÃO, noutro terminal
K6_BIN=/caminho/para/k6.exe npm run loadtest # a rodada: 10→25→50, 15 min

npm run loadtest:report    # monta o markdown com os números medidos
npm run seed:load-clean    # devolve o banco ao tamanho de dev
```

## Três coisas que custaram tempo e ficam registradas

**1. Escrever direto em `auth.users` quase passou batido.** Criar 5.000 contas
pela API de admin seriam 5.000 chamadas HTTP; em SQL é uma instrução. Só que
`confirmation_token`, `recovery_token`, `email_change` e
`email_change_token_new` aceitam NULL no banco e o GoTrue as lê em `string` do
Go — com NULL, o login devolve 500 e o teste inteiro mediria falha de
autenticação chamando de resultado. `loadtest:prepare` **testa um login de
verdade antes de qualquer medição** e falha alto se não passar.

**2. A Server Action não é um POST comum.** O fluxo de cadastro e atualização
não tem rota HTTP nossa — passa por Server Action do Next, que exige o header
`Next-Action` e um corpo no protocolo Flight do React:

```
_1_$ACTION_REF_2   (vazio)
_1_$ACTION_2:0     {"id":"<id>","bound":"$@1"}
_1_$ACTION_2:1     [{}]                          ← o prevState
_1_$ACTION_KEY     k<hex>
_1_<campo>         valor
0                  [{},"$K1"]                    ← a lista de argumentos
```

O formato foi **capturado de um submit real** com o Playwright, não deduzido.
Faltando a linha `0`, o Next responde erro sem executar nada. E o corpo precisa
ser **`multipart/form-data`**: em `x-www-form-urlencoded` a resposta é 404 e a
ação não roda — medido lado a lado. Como o k6 só escolhe multipart quando há
arquivo, o corpo é montado à mão em `k6/main.js`.

**3. Um teste de gravação que não grava é pior que teste nenhum.**
`loadtest:action` não confia em status 200: depois de cada tentativa ele
**consulta o banco** e só aceita o id que criou a linha. Se nenhum candidato
gravar, ele para com erro em vez de deixar o k6 medir um endpoint vazio.

## O que o teste mede, e o que não mede

Mede os seis fluxos acordados contra a **build de produção** — ISR, cache de
página pública e render estático só existem nela.

O cache é medido em **HIT e MISS separados**. Um teste que só pegasse HIT
reportaria a latência do cache como se fosse a do produto; o fluxo de pedigree
mira cães nunca visitados justamente para forçar o MISS e medir o custo real da
árvore de 5 gerações.

Não mede produção: o banco é o de desenvolvimento, tier Nano, e o gerador de
carga divide CPU com a aplicação. As duas limitações abrem o relatório.
