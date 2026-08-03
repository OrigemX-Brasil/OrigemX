-- =============================================================================
-- OrigemX — medição básica de acessos e conversões da página de captura
--
-- Anexo I.11. O mínimo que atende, e nada além disso.
--
-- O QUE ESTA TABELA **NÃO** GUARDA, e é o ponto principal do desenho:
--
--   sem IP, sem user agent, sem cookie, sem id de sessão, sem id de usuário,
--   sem referer completo, sem nada que identifique uma pessoa.
--
-- Uma linha diz apenas "houve um acesso desta origem, neste caminho, nesta
-- hora". Não dá para reconstruir quem visitou, não dá para ligar um acesso ao
-- cadastro que veio depois, e não dá para seguir alguém entre visitas. A
-- conversão é medida em AGREGADO — acessos de uma origem contra cadastros
-- daquela mesma origem —, que é o que o contrato pede e é o que dispensa
-- consentimento de cookie.
--
-- Isso também é o que permite não ter banner de cookie numa página que precisa
-- carregar rápido em 4G congestionado no meio de uma feira.
-- =============================================================================

create table public.landing_events (
  -- bigint identity em vez de uuid: esta é, de longe, a tabela de maior volume
  -- do sistema e a única puramente sequencial. Índice menor e inserção sem
  -- fragmentação. (A proibição de identity/serial do projeto vale para
  -- `kennels.founder_number`, que precisa de sequence dedicada com teto — não
  -- para chave sintética de log.)
  id         bigint generated always as identity primary key,

  -- 'view'   — a página de captura foi aberta
  -- 'signup' — uma conta nasceu vinda daquela origem
  kind       text not null,

  -- De onde veio o acesso: 'qr', 'perfil', 'direto'… Texto curto e livre, para
  -- o cliente imprimir material novo com uma origem nova sem precisar de
  -- migration.
  source     text not null default 'direto',

  path       text not null default '/',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint landing_events_kind_valid check (kind in ('view', 'signup')),
  -- Teto de tamanho porque `source` e `path` nascem de dado externo — a query
  -- string que o visitante abriu. Sem limite, um link forjado escreveria texto
  -- arbitrário, do tamanho que quisesse, na nossa tabela.
  constraint landing_events_source_len check (char_length(source) between 1 and 40),
  constraint landing_events_path_len check (char_length(path) between 1 and 200)
);

comment on table public.landing_events is
  'Contagem anônima e agregada de acessos e conversões da página de captura (Anexo I.11). Não contém dado pessoal: sem IP, user agent, cookie ou id de usuário.';

comment on column public.landing_events.source is
  'Origem do acesso, vinda do parâmetro ?de= da URL impressa. Normalizada e limitada na aplicação antes de chegar aqui.';

-- `updated_at` existe porque é invariante do projeto que toda tabela o tenha.
-- Na prática nunca muda: não há grant de UPDATE para ninguém, então a linha é
-- imutável por construção — garantia mais forte do que a coluna daria sozinha.
create trigger landing_events_set_updated_at
  before update on public.landing_events
  for each row execute function public.set_updated_at();

-- O relatório sempre corta por período e agrupa por tipo e origem. Este índice é
-- exatamente essa consulta; sem ele o rollup vira varredura da tabela que mais
-- cresce no sistema.
create index landing_events_rollup_idx
  on public.landing_events (created_at desc, kind, source);

-- -----------------------------------------------------------------------------
-- RLS
--
-- ESCRITA NÃO PASSA PELA API. Nem `anon` nem `authenticated` recebem INSERT: a
-- gravação acontece só no servidor, com a chave secreta, dentro do route handler
-- do pixel e da action de cadastro. Com INSERT liberado para `anon`, qualquer
-- pessoa inflaria a métrica do cliente com um laço de curl.
--
-- LEITURA SÓ PARA ADMIN. Número de acesso é dado de negócio do cliente, não do
-- criador. Nenhum dono de canil precisa ver, e `anon` muito menos.
-- -----------------------------------------------------------------------------

alter table public.landing_events enable row level security;

-- O Supabase concede privilégios por padrão a `anon` e `authenticated` em
-- tabelas novas do schema `public`. Revogar explicitamente é obrigatório: a
-- policy sozinha não bastaria com o GRANT aberto.
revoke all on public.landing_events from anon, authenticated;
grant select on public.landing_events to authenticated;

create policy landing_events_select
  on public.landing_events for select
  to authenticated
  using (private.is_admin());

-- -----------------------------------------------------------------------------
-- A única porta de escrita
--
-- Função estreita em vez de INSERT liberado, e em vez da chave secreta na
-- aplicação. As três razões, em ordem de importância:
--
-- 1. A APLICAÇÃO NUNCA PRECISA DA CHAVE SECRETA. Uma chave que bypassa RLS por
--    completo dentro do runtime do site é risco permanente; aqui ela não entra.
-- 2. A FORMA DO QUE ENTRA É FIXA. Com INSERT liberado, `anon` escolheria
--    colunas, quantidade e conteúdo. Aqui escolhe três textos, e os três passam
--    por corte de tamanho antes de virar linha.
-- 3. `kind` inválido é RECUSADO EM SILÊNCIO. Métrica não é caminho crítico:
--    derrubar a página de captura porque a contagem falhou seria trocar o
--    problema pequeno pelo grande.
--
-- Isto não impede alguém de inflar o número chamando a função em laço — nada
-- impediria, já que o pixel é público por natureza. Impede é que essa pessoa
-- escreva o que quiser na tabela.
-- -----------------------------------------------------------------------------

create or replace function public.record_landing_event(
  p_kind   text,
  p_source text default 'direto',
  p_path   text default '/'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind is null or p_kind not in ('view', 'signup') then
    return;
  end if;

  insert into public.landing_events (kind, source, path)
  values (
    p_kind,
    left(coalesce(nullif(btrim(p_source), ''), 'direto'), 40),
    left(coalesce(nullif(btrim(p_path), ''), '/'), 200)
  );
end;
$$;

comment on function public.record_landing_event(text, text, text) is
  'Única porta de escrita de landing_events. SECURITY DEFINER para a aplicação não precisar da chave secreta; grava apenas contagem anônima.';

revoke execute on function public.record_landing_event(text, text, text) from public;
grant execute on function public.record_landing_event(text, text, text) to anon, authenticated;
