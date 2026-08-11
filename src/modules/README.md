# Módulos por domínio

Um diretório por domínio. Cada um agrupa tudo que pertence àquele conceito, em
vez de espalhar por camadas técnicas (`components/`, `hooks/`, `services/` na
raiz). Quem for mexer em canil abre `kennels/` e encontra tudo.

```
modules/
  profiles/    perfil do criador
  kennels/     canil
  dogs/        cão — identidade canônica
  media/       upload, redimensionamento e publicação de imagem
  pedigree/    montagem e render da árvore de 5 gerações
  qr/          QR Code do cão e do canil
  alerts/      alertas in-app baseados em regras (Anexo I.8)
  capture/     página de captura e sua medição (Anexo I.11)
  public/      consultas e metadata das páginas abertas
  auth/        sessão, login e proteção de rota
  admin/       painel administrativo — leitura cross-usuário, ver nota abaixo
```

Dentro de cada módulo:

| Arquivo       | Papel                                                             |
| ------------- | ----------------------------------------------------------------- |
| `queries.ts`  | **Todo** acesso a dados do domínio. Nada de `.from()` fora daqui. |
| `types.ts`    | Tipos de domínio derivados de `@/lib/types/database`.             |
| `components/` | UI do domínio.                                                    |

## Testes

Três camadas, cada uma respondendo uma pergunta diferente:

| Comando            | O que prova                                                     |
| ------------------ | --------------------------------------------------------------- |
| `npm test`         | lógica pura — completude, pedigree, QR, alertas, captura        |
| `npm run test:rls` | a RLS barra pela API REST, com sessões reais                    |
| `npm run test:e2e` | os fluxos críticos funcionam no navegador, na build de produção |

### Rodando `test:rls` contra PRODUÇÃO

O script aponta para o projeto das variáveis de ambiente, então basta trocar o
arquivo de env — não há nada linkado a mudar:

```bash
RLS_PULAR_SELO_FUNDADOR=1 node --env-file=.env.production.local scripts/test-rls.mts
```

**A flag não é opcional em produção.** Sem ela, o cenário 11b faz 5 atribuições
concorrentes de `founder_number` e **consome 5 dos 100 selos de Fundador**.
`nextval` não volta atrás: devolvê-los exige `setval` com a trigger
`kennels_freeze_founder_number` desabilitada, o que é operação delicada demais
para um banco com criadores reais dentro. E `db:founder-reset` **recusa** se
existir qualquer canil com selo que não seja fixture — que é o caso assim que o
primeiro criador de verdade se cadastra.

O que se deixa de provar é atomicidade de sequence do Postgres, idêntica em
qualquer instância e já verificada em dev. O que **continua** rodando é o 11a: as
checagens de autorização do selo, com um canil sem número — porque provar que
ninguém grava `founder_number` pela API é exatamente o que precisa valer no banco
real.

Verificação pulada entra no relatório como linha `PULADO`, com o motivo, e o
cabeçalho anuncia a lacuna. Relatório de homologação que omite em silêncio o que
não testou é pior que um que reprova.

Mais o teste de carga, que é um procedimento e não roda no dia a dia:

```bash
npm run seed:load          # 5k usuários, 5k canis, 50k cães
npm run loadtest:prepare   # confere o volume e exporta as fixtures
npm run loadtest:action    # descobre os ids das Server Actions e PROVA que gravam
K6_BIN=<caminho> npm run loadtest
npm run loadtest:report    # reports/loadtest-<data>.md
npm run seed:load-clean    # devolve o banco ao tamanho de dev
```

O `k6` é binário, baixado à parte — não é dependência npm.

A suíte E2E vive em [`e2e/`](../../e2e) e **cria os próprios dados**: cada teste
tem usuário, canil e cão próprios, criados e destruídos nele mesmo. Roda contra
banco vazio ou cheio com o mesmo resultado, e a ordem dos testes não importa.

```bash
npm run test:e2e:install   # uma vez: baixa o Chromium
npm run test:e2e
```

Ela sobe a **build de produção**, não o `next dev`: metade do que verifica só
existe ali — ISR, cache das páginas públicas e o comportamento de prefetch dos
`<Link>`.

**A limpeza tem ordem obrigatória.** `dogs.owner_id` é `ON DELETE SET NULL`;
apagar o usuário antes dos cães os deixaria sem dono E sem canil, que é a
definição de ancestral fantasma — e fantasma é publicamente legível. A suíte
encheria o banco de cães de teste visíveis para qualquer visitante. Ver
`e2e/support/admin.ts`.

## Regras

**Listagem sempre paginada.** Toda função de lista em `queries.ts` recebe
`PageParams` e passa por `resolveLimit()` de [`@/lib/pagination`](../lib/pagination.ts).
Não existe `select()` de lista sem `.limit()` — é invariante do projeto, e
concentrar o acesso aqui é o que torna a regra verificável por leitura.

**`kennels/` não tem função de lista, e isso é invariante e não esquecimento.**
Um criador tem no máximo um canil vivo, garantido pelo índice `kennels_owner_uk`,
e `getMyKennel(ownerId)` devolve **o** canil. Um `listMyKennels` que volte a
aparecer é sinal de que alguém reintroduziu o 1:N na cabeça antes de
reintroduzir no banco.

**`admin/` é o primeiro módulo que lista fora do escopo "meu" ou "público".**
Toda consulta cross-usuário do app mora em `admin/queries.ts` — nenhuma usa a
chave secreta: a RLS já libera uma sessão admin para ler qualquer linha de
`profiles`, `kennels` e `dogs` (ramo `or private.is_admin()` nas três policies
de SELECT), então o `createClient()` de sempre basta, autorização continua
decidida no banco. `requireAdmin()` — sessão + role + não-suspensão, relidos a
cada chamada — continua em `auth/queries.ts`, ao lado de `requireUser`, porque
é proteção de rota, não dado de domínio; `admin/` importa de lá, não duplica.

Nesta rodada o módulo é só LEITURA — as seis seções do painel. Suspender,
ocultar e corrigir número do canil são Server Actions futuras, que entram
neste mesmo módulo chamando `requireAdmin()` como primeira linha, do jeito que
`dogs/`, `kennels/` e `media/` já chamam `requireUser` hoje.

**Autorização não mora aqui.** Quem decide o que o usuário vê é a RLS, em
`supabase/migrations/`. Filtro em `queries.ts` é para a _consulta_ estar certa,
nunca para _proteger_ dado.

**Mas VISIBILIDADE não é POSSE, e a tela de edição precisa da segunda.** As
policies de leitura devolvem também o que é público de terceiro — cão publicado,
canil publicado —, porque o perfil aberto é o produto. Uma tela de painel que
use `getDogById` ou `getKennelById` monta formulário de edição para registro
alheio: nada é gravado (o UPDATE é recusado), mas oferecer o controle já é erro.
Use `getManageableDogById` / `getManageableKennelById`. Foi um bug real,
encontrado pelo teste E2E de isolamento.

**`pedigree/` não tem tabela.** Ele monta a árvore percorrendo `dogs.sire_id` /
`dogs.dam_id` recursivamente. Renderiza por **caminho**, não por nó: em
linebreeding o mesmo ancestral aparece legitimamente em várias posições, e
deduplicar por id apagaria a informação que o criador quer justamente ver.

**`alerts/` também não tem tabela, e por decisão.** Um alerta é uma afirmação
sobre o dado de agora; guardado, vira segunda fonte de verdade que fica velha no
instante em que o criador sobe o logo, e manter os dois em dia exigiria
recálculo em background — fila é FORA DE ESCOPO. Derivando, a autorização vem de
graça: só nasce alerta de linha que a RLS já deixou o usuário ler.

O catálogo de regras vive em [`alerts/rules.ts`](alerts/rules.ts) e é **o único
arquivo que o cliente precisa abrir** para trocar texto, mudar prioridade
(reordenando o array), desligar um aviso ou ajustar um limite.
[`alerts/engine.ts`](alerts/engine.ts) não conhece nenhuma regra — se ajustar
uma exigir tocar no motor, a separação falhou.

Alerta **não bloqueia** nada: não existe severidade "erro", e nenhum fluxo de
gravação consulta o catálogo. E **não existe campo de canal** — in-app apenas,
porque e-mail, push, WhatsApp e SMS são FORA DE ESCOPO por contrato.

**Notificação interna fica em [`src/lib/notify/`](../lib/notify), fora de
`modules/`** — não é domínio, é infraestrutura, e três domínios diferentes a
chamam.

Não confundir com e-mail transacional: aquele sai do Supabase pelo SMTP do
Resend e vai para o **usuário**; este sai do nosso código pela **API** do Resend
e vai para a **equipe**.

Três regras que o módulo garante por construção, não por disciplina de quem
chama:

- **Nunca propaga.** A assinatura devolve `void` e o corpo é um try/catch.
  Cadastrar um canil não pode falhar porque a caixa da equipe está fora do ar.
- **Minimização pelo tipo.** `EventoInterno` declara os campos que podem sair;
  telefone e documento não têm onde encaixar. Um teste ainda afirma que um
  objeto contaminado não vaza nada na saída.
- **Sem chave, loga.** Sem `RESEND_API_KEY`, escreve no console. Dev, teste e CI
  não tocam em rede.

Os disparos vão dentro de **`after()` do `next/server`**, não `await` solto: a
resposta sai antes, e o Next mantém a execução viva depois dela — um
`void notificar(...)` seria congelado junto com a função serverless. E `after`
roda mesmo quando `redirect()` é chamado, que é o que `createKennel` exige.

O **corta-circuito horário** existe por um motivo concreto: numa feira, 150
cadastros gerariam ~270 e-mails, a cota diária estouraria à tarde e o evento
importante da manhã seguinte falharia em silêncio. Acima do teto, os individuais
param e sai um único "volume alto".

**`capture/` não guarda dado pessoal, e é o que define o módulo.** Sem IP, user
agent, cookie ou id de usuário — a conversão é agregada por origem, não ligada a
pessoas. Ver `supabase/README.md`.

A página de captura (`src/app/page.tsx`) **precisa continuar estática**: é o que
alguém vê depois de escanear um QR numa feira, com 4G disputado. Nada de
`searchParams`, `headers()` ou `cookies()` nela — qualquer um dos três a torna
dinâmica e joga fora o cache de borda. A medição acontece por `<img>`, e a
campanha é recuperada no `/cadastro`, que é dinâmico de propósito.
