# OrigemX — Invariantes do projeto

Plataforma web para criadores de cães (canis), com perfis públicos, pedigree de 5
gerações e QR Code.

Este documento é **normativo**. Vale para toda sessão de trabalho neste repositório.
Quando algo aqui conflitar com uma sugestão, este documento vence. Mudança de invariante
é decisão do dono do produto, não do implementador.

---

## STACK

Next.js App Router + TypeScript + Tailwind. Supabase (Postgres, Auth, Storage, RLS).
Deploy Vercel.

**Sem outras libs de UI, state manager ou ORM sem eu aprovar.**

---

## AMBIENTE

- Não há Supabase local (sem Docker). Dev roda contra o projeto Supabase
  de desenvolvimento (link ativo). NUNCA rodar db reset ou db push
  apontando para o projeto do cliente sem eu confirmar explicitamente.
- Confirmar o diretório de trabalho antes de qualquer comando de terminal.
- `supabase config push` **SOBRESCREVE a configuração de auth inteira**, não é
  incremental. E não há como inspecionar antes: `config pull` NÃO EXISTE na CLI
  2.111, e o push confirma sozinho em terminal não-interativo (detecta agente),
  então nem responder "n" segura — já foi verificado, aplica assim mesmo.
  Portanto:
  - **`config push` é comando MEU, não do agente.** O agente prepara o
    `config.toml`, me avisa, e eu rodo num terminal interativo onde o diff
    aparece e o Y/n funciona de verdade.
  - Antes de me pedir para rodar, o agente confirma que **toda env var
    referenciada está preenchida**. Var vazia não falha: a CLI empurra o texto
    literal `env(NOME)` como se fosse o valor, e a configuração quebra em
    silêncio. Foi assim que o Google OAuth do projeto de dev caiu.
  - E confirma comigo qual projeto está linkado, na hora.
- **A auth do projeto de dev é configurada pelo PAINEL do Supabase.** O
  `config.toml` NÃO é fonte de verdade para `[auth.external.google]`. O login
  com Google já está configurado e testado no painel: funciona, e o usuário
  nasce com `role = 'user'`. Não tratar isso como pendência.
  - Consequência prática: um `config push` sobrescreveria o que está no painel
    com o conteúdo do arquivo. Enquanto `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
    estiver vazia no `.env.local`, o push derruba o Google de novo.
  - O bloco no `config.toml` existe para o handover ao projeto do CLIENTE, onde
    não há painel configurado por mim. Lá ele é o mecanismo; aqui é risco.
- NUNCA rodar `config push`, `db push`, `db reset` ou qualquer DDL contra o
  projeto do CLIENTE sem minha confirmação explícita na hora.
- Configuração feita pelo painel do Supabase não está no `config.toml` local.
  Sempre assumir que o remoto tem estado que o repositório não conhece.

## INVARIANTES DE DADOS

- Todo cão tem UUID permanente. Parentesco é `sire_id`/`dam_id` referenciando `dogs`.
- Nunca copiar dados do ancestral dentro do registro do descendente.
- Ancestral repetido é legítimo (linebreeding). Pedigree renderiza por **CAMINHO**, não
  por nó.
- Ciclo genealógico é proibido e bloqueado no banco.
- `dogs.owner_id` e `kennel_id` são NULLABLE (ancestral sem dono cadastrado).
- Um criador tem **no máximo UM canil vivo**. Excluir logicamente libera a vaga; o
  endereço (`slug`) fica queimado para sempre. A assimetria é deliberada: slug identifica
  uma URL já divulgada, posse identifica uma relação viva.
- Exclusão é sempre lógica (`deleted_at`). Nunca DELETE físico.
- Toda tabela tem `created_at`, `updated_at` e autoria quando aplicável.

---

## INVARIANTES DE SEGURANÇA

- RLS habilitada em **TODAS** as tabelas. Nenhuma tabela pública sem policy.
- Nunca usar `service_role` key no client. Nunca expor segredo em `NEXT_PUBLIC_`.
- Autorização é decidida no banco (RLS), não só na UI.
- **Toda escrita de admin em registro de terceiro passa por função SECURITY DEFINER
  auditada.** Nunca por policy alargada: `private.audit()` não tem EXECUTE para ninguém e
  `audit_log` não tem GRANT de INSERT, então uma policy permissiva produziria escrita sem
  trilha. A exceção é o Storage — o upload vai do navegador direto para a API, sem passar
  por Postgres, e ali a policy é a única defesa possível (`private.can_write_storage_prefix`).
  Consequência aceita e registrada: o upload em si não fica auditado; só o registro em `media`.

### Admin publica (desde 01/09/2026)

O admin pode publicar e tirar do ar canil e cão em nome do criador. **Não foi uma porta
nova** — `dogs_update` e `kennels_update_own` sempre tiveram `or private.is_admin()`, e
`publishDog`/`publishKennel` nunca filtraram posse, então um admin já publicava qualquer
registro pelo `/painel` do dono, sem rastro nenhum. O que mudou:

- existe caminho próprio e AUDITADO (`admin_set_*_published`), com motivo obrigatório;
- o caminho do DONO passou a recusar quem não é dono, fechando a publicação silenciosa;
- criar e publicar são SEMPRE duas ações, com duas linhas de trilha. Nenhuma RPC de
  criação aceita `published_at`.

Isto não move a fronteira de EDIÇÃO: alterar os campos do registro continua sendo do dono,
em `/painel`. E não dispara e-mail ao criador — os quatro e-mails do aditivo são definidos
como ação DO USUÁRIO, e um admin publicando não é ação dele.

### Cadastro assistido (desde 02/09/2026)

O admin pode preencher **tudo** de um criador — canil, cão, ninhada, filhotes, identificadores,
saúde, exames, medidas, vídeo, FAQ, depoimentos — usando as MESMAS telas do painel do criador,
servidas sob `/admin/assistir/[profileId]/...`.

As rotas de `/admin/assistir` são **invólucros**, não cópias: renderizam o componente de página
do painel. Duplicar aqueles formulários criaria uma segunda implementação para divergir na
primeira mudança de campo. Quem mantém a URL no prefixo administrativo é o `src/proxy.ts`: com o
cookie de sessão presente, todo `/painel/*` é desviado para `/admin/assistir/<alvo>/*` — foi o
que evitou tornar ~40 `href`/`redirect`/`revalidatePath` cientes do caminho-base. O cookie é
dica de UI; quem autoriza é `private.assisting_profile()`.

**Não foi ampliação de poder; foi estreitamento.** Antes, `or private.is_admin()` estava solto
em treze policies de escrita e dentro de `private.can_manage_dog`: um admin já escrevia em
qualquer uma dessas tabelas, de qualquer criador, a qualquer momento, **sem rastro**. Faltava
só a tela. Agora ele precisa de uma **sessão aberta**, só alcança **o criador daquela sessão**,
e cada escrita vira linha de `audit_log`.

- **Não é impersonation.** A sessão de autenticação continua sendo a do ADMIN — sem troca de
  login. Uma faixa fica visível em todo layout enquanto a sessão estiver aberta.
- **O motivo é declarado UMA vez**, ao abrir, e toda escrita da sessão o herda. Exigir motivo a
  cada campo salvo tornaria impraticável justamente o caso de uso (sentar com o criador e
  preencher o cadastro inteiro).
- **`created_by` nunca muda de mãos**: registra quem de fato digitou. Só `owner_id` segue o
  criador assistido.
- **Uma sessão aberta por admin**, garantida por índice único parcial — com duas, "em nome de
  quem ele está escrevendo agora?" não teria resposta.

Exceção conhecida e anotada: `media_update` mantém `or private.is_admin()`, porque
`reconcileMediaBucket` grava `bucket_id` durante a publicação por admin, que roda fora de
qualquer sessão. Restringir por coluna não é expressável em policy.

---

## INVARIANTES DE PERFORMANCE

- Nenhuma listagem sem paginação e limite. Nunca SELECT sem LIMIT em lista.
- Índice em toda FK e em toda coluna usada em busca/filtro.
- Imagem vai para Storage; banco guarda URL e metadata. **NUNCA base64.**

---

## INVARIANTES DE PRODUTO

- Mobile-first. Tema escuro.
- Cores e tipografia vêm de CSS variables (tokens), nunca hardcoded — a identidade visual
  do cliente ainda não chegou.
- URL pública do perfil usa identificador **ESTÁVEL**. QR impresso não pode quebrar.

---

## DESIGN DE REFERÊNCIA
A página pública do filhote (/d/[public_id]) em DESKTOP deve seguir
assets/fotos/filhote-mockup.jpg como norte visual. Tema dark, tokens
do projeto. Mobile tem layout próprio (não segue o mockup — decisão
acordada com o cliente).

## FORA DE ESCOPO

Não implementar, nem "preparar tabela":

IA, marketplace, financeiro, pagamentos, agenda/lembretes, rede social, notificação por
push/WhatsApp/SMS, multi-espécies, fusão automática de duplicados, cache
distribuído, filas.

### E-mail ao usuário — DENTRO do escopo desde 27/08/2026 (aditivo contratual)

E-mail transacional saiu desta lista. **Push, WhatsApp e SMS continuam fora** — a exceção é
estreita e vale só para e-mail.

O que entrou: **quatro** e-mails, todos disparados por uma AÇÃO DO USUÁRIO no nosso código —
boas-vindas (após confirmar a conta), primeiro cão cadastrado, selo Criador Fundador
atribuído, canil publicado. Não confundir com os e-mails de AUTH (confirmação, recuperação de
senha), que continuam saindo do painel do Supabase e não passam pelo nosso código.

Três condições fazem parte do aditivo, e não são detalhe de implementação:

- **Opt-out obrigatório** (LGPD). Todo e-mail leva link de descadastro que funciona **sem
  login** — `profiles.email_opt_out` + `profiles.unsubscribe_token`, e a rota
  `/e/descadastro`. E-mail de auth NUNCA é bloqueado por ele: sem confirmação ou recuperação
  de senha a pessoa não entra na conta.
- **Teto de 2 por usuário por semana**, central em `src/lib/notify/usuario/guarda.ts`. Toda a
  regra é pura e testada em `decisao.ts`.
- **Envio jamais quebra o fluxo.** Toda chamada é `after()` + try/catch que loga e segue.
  Cadastrar um cão não pode falhar porque o e-mail caiu.

**O que continua fora, e é o que faltou do pedido original:** o lembrete de perfil incompleto
7 dias após o cadastro. Ele exige execução agendada, e `agenda/lembretes` e `filas` seguem
nesta lista — o projeto não tem `pg_cron` nem scheduler, e introduzir um é outra decisão.

### Ninhadas — DENTRO do escopo desde 18/08/2026 (aditivo contratual)

Ninhada saiu desta lista. A versão básica (texto + até 4 fotos) entrou em 14/08/2026; a
completa — progenitores, filhotes individuais, saúde, exames genéticos, preço e página
pública — foi orçada à parte e aprovada pelo cliente.

**Preço é a exceção, e ela é estreita.** `dogs.price_brl` é campo INFORMATIVO, opcional,
editável pelo dono do canil e exibido na página pública. O único fluxo de conversão é o
CTA que abre o WhatsApp do criador: a transação acontece INTEIRAMENTE fora da plataforma.

Continuam fora de escopo e exigem NOVO aditivo — não decorrem deste:

- checkout, carrinho, reserva processada pelo app, pagamento, cobrança, emissão fiscal;
- transferência de titularidade do filhote para conta do comprador;
- formulário de lead, notificação ou mensagem enviada pelo servidor.

Ter preço não autoriza carrinho.

**`dogs.accepts_offer`** (20/08/2026) é a mesma exceção, mesma fronteira: sinalizador
booleano, puramente informativo ("Aceita proposta", exibido como badge na página
pública), independente de ter preço cadastrado. NÃO é canal de oferta — nenhum campo de
"faça sua proposta", nenhuma tabela ou notificação associada. A negociação continua
inteiramente pelo WhatsApp do criador, já existente.

### Saúde — recorte estreito, não dossiê

Dentro: log repetível de vermífugo e vacina do cão (`dog_health_records`) e laudo de
exame genético do reprodutor (`dog_genetic_tests`).

Fora, como sempre esteve: prontuário veterinário, histórico clínico, medicação, agenda
de reforço e qualquer lembrete.

### Depoimentos — conteúdo do criador, não avaliação verificada

Depoimento (`testimonials`) é CONTEÚDO FORNECIDO PELO CRIADOR: ele insere, edita e
remove os próprios. A OrigemX **não verifica** identidade de quem é citado nem
veracidade do relato — a responsabilidade pelo que é publicado é do criador, não da
plataforma. Isso está documentado no `comment on table` da migration e repetido como
aviso no formulário de cadastro do painel.

Como o depoimento carrega nome (e, opcionalmente, foto) de um terceiro, o formulário de
ADICIONAR exige confirmação explícita ("confirmo que tenho autorização desta pessoa
para publicar...") antes de aceitar o envio. Essa confirmação **não é persistida** —
não existe coluna para isso; é validação de submissão, não dado guardado. Não se
persiste, em nenhuma hipótese, mais do que nome + texto + nota (1–5, opcional) + avatar
opcional.

Cada criador tem o próprio conjunto de depoimentos — não existe depoimento global nem
compartilhado entre canis.

---

## Como estas invariantes estão implementadas

Referência rápida — o banco é quem garante, não a aplicação.

| Invariante                 | Onde vive                                                                       |
| -------------------------- | ------------------------------------------------------------------------------- |
| UUID permanente do cão     | `dogs.id uuid PK`                                                               |
| Parentesco por referência  | `dogs.sire_id` / `dogs.dam_id` → `dogs.id`                                      |
| Ciclo genealógico proibido | trigger `dogs_check_ancestry()` (CTE recursiva)                                 |
| Linebreeding é legítimo    | mesma CTE usa `UNION`, então ancestral repetido não vira ciclo                  |
| Exclusão lógica            | `deleted_at` em todas as tabelas + policies filtram                             |
| Um canil por criador       | índice único parcial `kennels_owner_uk` — `(owner_id) where deleted_at is null` |
| QR não quebra              | `dogs.public_id` imutável, protegido por trigger                                |
| RLS em tudo                | migration `20260731194105_rls_policies.sql`                                     |
| Listagem com limite        | todo acesso a dados em `src/modules/*/queries.ts`, com `limit` obrigatório      |
| Tokens de cor              | `src/styles/tokens.css` — nenhuma cor literal em componente                     |
| Filhote é um cão           | `dogs.litter_id` → `kennel_litters.id`. NÃO existe tabela `puppies`             |
| Par da ninhada = par do filhote | triggers `dogs_check_litter_parents` (recusa divergência) e `kennel_litters_sync_puppy_parents` (cascateia a troca) |
| Preço só dentro de ninhada | CHECK `dogs_price_requires_litter` — a fronteira do aditivo, no schema          |
| Status só dentro de ninhada | CHECK `dogs_litter_status_requires_litter`, bicondicional                      |
| Ninhada de terceiro é intocável | `dogs_insert`/`dogs_update` chamam `private.owns_litter(litter_id)`        |
| URL da ninhada não quebra  | `kennel_litters.public_id` imutável, trigger `kennel_litters_freeze_public_id`  |
| Exame do pai não é redigitado | `dog_genetic_tests.dog_id` — a ninhada LÊ por `sire_id`/`dam_id`, nunca copia |
| Saúde/exame público segue o cão | policies delegam a `dogs_select` via `exists`, sem rederivar `dog_is_public` |
| Depoimento não é avaliação verificada | `comment on table testimonials` + aviso no formulário de cadastro |
| Depoimento de cão de terceiro é impossível | trigger `testimonials_check_dog_kennel` — `dog_id` precisa pertencer ao mesmo `kennel_id` |
| LGPD do depoimento não vira dado persistido | checkbox validado em `addTestimonial`, nunca lido em `TestimonialInput`/nunca gravado |
| FAQ é por canil, sem FAQ global | RLS `kennel_faqs_select` (`owns_kennel`), sem `owner_id` próprio |
| Aceita proposta é só rótulo, sem canal de oferta | CHECK `dogs_accepts_offer_requires_litter` + ausência de qualquer action/tabela de oferta |
| Admin cadastra para o dono, sempre auditado | funções `admin_create_*_for_kennel` / `admin_create_kennel_for_user` (SECURITY DEFINER) — `private.audit()` não tem EXECUTE para ninguém, então a linha de trilha só nasce lá dentro |
| Canil de terceiro só pela porta auditada | `kennels_insert_own` exige `auth.uid() = owner_id` e **não** tem ramo de admin, de propósito |
| Admin ESCREVE no Storage do dono, não em qualquer lugar | `private.can_write_storage_prefix` — o prefixo tem de ser um perfil VIVO, senão o arquivo vira órfão que a reconciliação nunca acha |
| Admin LÊ o Storage do dono | inline nas policies de SELECT: prefixo próprio ou `(select private.is_admin())`. Predicado separado por PERFORMANCE — função que recebe a linha roda por linha e o `list` estoura em timeout. Ver `admin_le_storage_do_dono` |
| Publicar por admin deixa rastro | `admin_set_dog_published` / `admin_set_kennel_published`; o caminho do dono passou a recusar quem não é dono (`ehDonoDoCao`, em `media/publish.ts`) |
| Admin só escreve em registro de terceiro sob SESSÃO | `admin_assist_sessions` + `private.assisting_profile()`. As policies comparam `owner_id in ((select auth.uid()), (select private.assisting_profile()))` — os dois lados viram InitPlan, avaliados uma vez por consulta |
| Toda escrita assistida deixa trilha | trigger `private.trg_audit_assist()` em 11 tabelas. A trilha é do BANCO: não existe caminho de aplicação que escreva sob sessão e não apareça no Histórico |
| Mídia pertence ao dono do REGISTRO, não a quem subiu | `ownerOfMediaEntity` em `media/queries.ts`, usada por `registerMedia`. Antes era `user.id`, e isso gravou quatro fotos de um criador no nome do admin |

### Schema

Todo schema nasce como **migration versionada** em `supabase/migrations/`, para aplicar no
projeto do cliente com `db push` sem retrabalho. Nunca alterar o banco por fora da
migration. Criar arquivo novo sempre com `npx supabase migration new <nome>`.

@AGENTS.md

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
rtk uv run <cmd>        # Compact uv project command output
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->