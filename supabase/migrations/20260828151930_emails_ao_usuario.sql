-- =============================================================================
-- OrigemX — e-mails transacionais AO USUÁRIO: opt-out e teto de frequência
--
-- ---------------------------------------------------------------------------
-- ADITIVO CONTRATUAL de 27/08/2026. Até aqui, "notificação por e-mail" estava
-- na lista de FORA DE ESCOPO do CLAUDE.md, e o produto só mandava dois tipos
-- de e-mail: os de AUTH (confirmação, recuperação de senha), que saem do
-- painel do Supabase, e os avisos INTERNOS para a equipe (src/lib/notify).
--
-- O que entrou: quatro e-mails disparados por AÇÃO DO USUÁRIO no nosso código
-- (boas-vindas, primeiro cão, selo Fundador, canil publicado). O que continua
-- fora: push, WhatsApp, SMS, e qualquer envio AGENDADO — este schema não tem,
-- e não deve ganhar, nada que sirva de fila ou de cron.
-- ---------------------------------------------------------------------------
-- POR QUE UMA TABELA DE LOG, se o projeto evita estado novo: a regra "no
-- máximo 2 e-mails por semana, por usuário" NÃO se deriva de nenhuma coluna
-- existente. O corta-circuito que já existe (`src/lib/notify/limite.ts`) conta
-- `profiles.created_at` porque mede VOLUME GLOBAL numa janela; aqui a pergunta
-- é "quantos ESTE usuário recebeu", e nada no schema responde isso.
--
-- É log, não fila: linha escrita DEPOIS do envio, nunca lida para decidir o
-- que enviar em seguida. Ninguém consome esta tabela para disparar nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — preferência de contato
-- -----------------------------------------------------------------------------

alter table public.profiles
  -- TIMESTAMP, não boolean: mesmo raciocínio de `deleted_at` e `suspended_at`
  -- neste schema. Registra QUANDO a pessoa saiu, que é o que uma eventual
  -- disputa de LGPD pergunta, sem custar tabela de auditoria.
  add column email_opt_out timestamptz,

  -- O que torna o descadastro possível SEM LOGIN, como a LGPD exige. É segredo
  -- por linha, e NÃO o `id` do usuário: com o id, qualquer um que descobrisse
  -- um uuid (eles aparecem em URL de Storage, por exemplo) descadastraria
  -- outra pessoa. `gen_random_uuid()` é imprevisível; o id, não necessariamente.
  add column unsubscribe_token uuid not null default gen_random_uuid();

comment on column public.profiles.email_opt_out is
  'Não-NULL = usuário pediu para não receber e-mail não-transacional de auth. Gravado pela rota /e/descadastro, sem exigir login (LGPD). Nunca bloqueia e-mail de AUTH, que é do Supabase e não passa por aqui.';

comment on column public.profiles.unsubscribe_token is
  'Segredo por linha para o descadastro sem login. NÃO usar o id do usuário no lugar: id vaza em caminho de Storage, este token não vaza em lugar nenhum.';

-- Único: o token é procurado por igualdade na rota de descadastro, e duplicata
-- (ainda que improvável) tornaria a busca ambígua.
create unique index profiles_unsubscribe_token_key
  on public.profiles (unsubscribe_token);

-- -----------------------------------------------------------------------------
-- user_emails — o log que a guarda de frequência lê
-- -----------------------------------------------------------------------------

create table public.user_emails (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,

  -- Qual e-mail. Texto com CHECK, não enum: o projeto inteiro usa CHECK para
  -- domínio fechado (ver `profiles_role_valid`, `dogs_sex_valid`), e enum
  -- exigiria migration para cada tipo novo.
  kind        text not null,

  sent_at     timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint user_emails_kind_valid check (
    kind in ('boas-vindas', 'primeiro-cao', 'selo-fundador', 'canil-publicado')
  )
);

comment on table public.user_emails is
  'Log de e-mails enviados AO USUÁRIO (não os de auth, que saem do Supabase). Escrito depois do envio; lido só pela guarda de frequência (máx. 2 por semana) e para não repetir um e-mail de evento único. NÃO é fila: nada consome esta tabela para disparar envio.';

create trigger user_emails_set_updated_at
  before update on public.user_emails
  for each row execute function public.set_updated_at();

-- Exatamente a consulta da guarda: "os e-mails deste usuário, os mais recentes
-- primeiro". Cobre tanto a contagem da janela de 7 dias quanto a checagem de
-- `kind` já enviado.
create index user_emails_profile_recent_idx
  on public.user_emails (profile_id, sent_at desc);

-- -----------------------------------------------------------------------------
-- RLS — ninguém lê isto pelo PostgREST
--
-- A tabela é operada SÓ pela chave de serviço, do servidor, pelo mesmo motivo
-- já documentado em `clienteDeContagem()` (src/lib/notify/index.ts): a guarda
-- precisa contar linhas que a RLS esconderia, e o dado não interessa a
-- ninguém no client. RLS habilitada com ZERO policies = negado para todos,
-- que é a postura certa aqui (a invariante do projeto é "RLS em todas as
-- tabelas, nenhuma pública sem policy" — esta não é pública).
-- -----------------------------------------------------------------------------

alter table public.user_emails enable row level security;
revoke all on public.user_emails from anon, authenticated;
