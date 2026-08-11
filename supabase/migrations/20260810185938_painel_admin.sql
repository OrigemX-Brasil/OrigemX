-- =============================================================================
-- OrigemX — capacidade de banco do painel administrativo
--
-- Quatro capacidades que o schema não tinha, e três delas são exigência
-- contratual que até aqui não tinha onde morar:
--
--   1. AUDITORIA          — quem fez o quê, quando, e por quê
--   2. SUSPENSÃO          — bloquear a PESSOA, distinto de excluir o registro
--   3. CORREÇÃO DO NÚMERO — caminho admin para founder_number, que é imutável
--   4. OCULTAR / REATIVAR — decisão do ADMIN, distinta de published_at
--
-- =============================================================================
-- O PRINCÍPIO QUE AMARRA AS QUATRO
-- =============================================================================
--
-- Toda mutação administrativa passa por uma função SECURITY DEFINER que confere
-- private.is_admin(), aplica a mudança e grava a linha de auditoria na MESMA
-- transação. Não existe caminho admin que escreva sem auditar, porque não existe
-- caminho admin nenhum além dessas funções:
--
--   * `audit_log` não tem GRANT de INSERT para ninguém. A única escrita vem de
--     dentro de função cujo dono é `postgres`.
--   * `profiles.suspended_at`, `kennels.hidden_at` e `dogs.hidden_at` ficam FORA
--     da lista de `grant update` por coluna. Admin também é `authenticated`:
--     nem ele grava direto pela API REST.
--
-- É a mesma técnica que o projeto já usa em `profiles.role` e em
-- `kennels.founder_number`, e o mesmo desenho de `record_landing_event`: porta
-- única, estreita, SECURITY DEFINER.
--
-- LIMITE DECLARADO: quem tem a CHAVE SECRETA (`service_role`) sempre pôde
-- escrever direto e continua podendo, sem auditoria. A auditoria cobre o caminho
-- da aplicação, que é onde as pessoas agem. Repare no efeito colateral
-- desejável: `private.is_admin()` devolve FALSE para `service_role` (não há
-- `auth.uid()`), então script com chave secreta NÃO CONSEGUE chamar estas
-- funções — toda linha de auditoria tem uma pessoa por trás, nunca um processo.
-- =============================================================================


-- =============================================================================
-- 1. AUDITORIA
-- =============================================================================

create table public.audit_log (
  -- bigint identity, mesmo argumento de `landing_events`: log é sequencial e de
  -- volume, uuid só engordaria o índice sem servir a nada aqui.
  id          bigint generated always as identity primary key,

  actor_id    uuid not null references public.profiles (id) on delete restrict,
  action      text not null,
  entity_type text not null,
  entity_id   uuid not null,
  reason      text not null,

  -- Antes/depois, quando faz sentido. Sem forma fixa de propósito: cada ação
  -- registra o que a descreve, e quem lê é o painel.
  details     jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Lista FECHADA. Ação nova exige migration nova, que é onde a função que a
  -- grava também nasce — as duas andam juntas, e um erro de digitação vira erro
  -- de constraint em vez de linha órfã que ninguém consegue filtrar depois.
  constraint audit_log_action_valid check (action in (
    'profile.suspend', 'profile.unsuspend',
    'kennel.hide',     'kennel.unhide',
    'dog.hide',        'dog.unhide',
    'kennel.founder_number.set'
  )),

  constraint audit_log_entity_valid check (entity_type in ('profile', 'kennel', 'dog')),

  -- 'kennel.founder_number.set' -> 'kennel'. Impede a ação ser gravada contra a
  -- entidade errada, que tornaria o histórico de um registro incompleto sem
  -- ninguém perceber.
  constraint audit_log_action_matches_entity
    check (split_part(action, '.', 1) = entity_type),

  constraint audit_log_reason_len check (length(btrim(reason)) between 3 and 500),

  -- Teto generoso, só para um `details` mal construído no futuro não conseguir
  -- despejar uma linha inteira de `profiles` dentro do log.
  constraint audit_log_details_size check (length(details::text) <= 8192)
);

comment on table public.audit_log is
  'Trilha de auditoria das ações administrativas. Append-only: sem GRANT de INSERT, UPDATE ou DELETE para ninguém — a única escrita é private.audit(), de dentro das funções admin_*.';
comment on column public.audit_log.actor_id is
  'A PESSOA que agiu, sempre auth.uid(). ON DELETE RESTRICT: admin que já agiu não pode ter a conta apagada fisicamente — trilha de auditoria com ator apagado não é trilha.';
comment on column public.audit_log.reason is
  'Obrigatório. Histórico sem porquê é log, não histórico. É também o único lugar onde o motivo de uma suspensão ou ocultação existe — ver o comentário de profiles.suspended_at.';

-- SEM `deleted_at`, contra a invariante de exclusão lógica do projeto, e de
-- propósito: log de auditoria apagável não é log de auditoria. Sem GRANT de
-- DELETE nem de UPDATE para ninguém, a linha é imutável por PRIVILÉGIO, que é
-- garantia mais forte do que a coluna daria.
--
-- `updated_at` fica, com o trigger, pelo mesmo motivo declarado em
-- `landing_events`: a invariante pede, e na prática nunca muda porque não há
-- como mudá-la.
create trigger audit_log_set_updated_at
  before update on public.audit_log
  for each row execute function public.set_updated_at();

-- As três perguntas reais do painel, cada uma com seu índice e todas com keyset.
create index audit_log_recent_idx
  on public.audit_log (created_at desc, id desc);
comment on index public.audit_log_recent_idx is 'Fluxo cronológico: "o que aconteceu ultimamente".';

create index audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);
comment on index public.audit_log_entity_idx is
  'Histórico de UM registro. É também a consulta que devolve o motivo vigente de uma suspensão/ocultação: a linha mais recente daquela entidade.';

create index audit_log_actor_idx
  on public.audit_log (actor_id, created_at desc);
comment on index public.audit_log_actor_idx is
  'O que um admin fez. Serve também de índice da FK actor_id, exigido pela invariante de performance.';

alter table public.audit_log enable row level security;

-- O Supabase concede privilégios por padrão em tabela nova do schema `public`.
-- Revogar explicitamente é obrigatório: a policy sozinha não basta com o GRANT
-- aberto.
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy audit_log_select
  on public.audit_log for select
  to authenticated
  using (private.is_admin());

-- --- a única porta de escrita ------------------------------------------------
--
-- SEM GRANT PARA NINGUÉM. Chamável apenas de dentro de outra função
-- SECURITY DEFINER com dono `postgres` — que é exatamente o conjunto das
-- funções `admin_*` abaixo. É isto que torna "toda ação administrativa é
-- auditada" uma propriedade do banco e não uma disciplina de quem escreve código.

create or replace function private.audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_reason      text,
  p_details     jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- Sem ator não há auditoria, e sem auditoria não há ação. Pega o caso do
  -- `service_role`, que não tem auth.uid() — ele bypassa RLS e escreveria
  -- direto de qualquer jeito, mas não vai conseguir se disfarçar de pessoa aqui.
  if v_actor is null then
    raise exception 'ação administrativa sem ator identificado'
      using errcode = 'insufficient_privilege';
  end if;

  -- Validado aqui, uma vez, em vez de repetido em cada função admin. O CHECK da
  -- tabela também barraria, mas com mensagem que não explica nada a quem chamou.
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'o motivo é obrigatório e precisa ter ao menos 3 caracteres'
      using errcode = 'check_violation';
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, reason, details)
  values (
    v_actor,
    p_action,
    p_entity_type,
    p_entity_id,
    left(btrim(p_reason), 500),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

comment on function private.audit(text, text, uuid, text, jsonb) is
  'Única porta de escrita de audit_log. Sem EXECUTE para ninguém: só as funções admin_* (SECURITY DEFINER, dono postgres) conseguem chamar.';

revoke execute on function private.audit(text, text, uuid, text, jsonb)
  from public, anon, authenticated;


-- =============================================================================
-- 2. SUSPENSÃO — barra a PESSOA, não o conteúdo
-- =============================================================================
--
-- DISTINTO DE `deleted_at`, e a diferença é o ponto: exclusão lógica some com o
-- registro; suspensão o mantém inteiro e visível para o admin, e apenas impede
-- o titular de agir daqui para a frente.
--
-- NÃO TIRA NADA DO AR. Suspender age sobre a pessoa; ocultar conteúdo é a seção
-- 4, com campo próprio e linha de auditoria própria. Duas alavancas, duas
-- decisões, dois registros no histórico — quem quiser as duas coisas faz as duas.
-- =============================================================================

alter table public.profiles
  add column suspended_at timestamptz;

comment on column public.profiles.suspended_at is
  'Não-NULL = usuário suspenso: toda escrita é negada pela RLS e o login é recusado pelo Auth (auth.users.banned_until). DISTINTO de deleted_at, que some com o registro. NÃO oculta o conteúdo público do usuário — isso é hidden_at. Gravado só por admin_set_profile_suspended; o MOTIVO vive em audit_log, nunca aqui.';

-- O motivo NÃO é coluna, e é decisão e não esquecimento: `profiles_select_public`
-- deixa QUALQUER ANÔNIMO ler a linha inteira de todo perfil não excluído. Uma
-- nota de moderação ali seria mundialmente legível. O porquê fica em
-- `audit_log.reason`, que é admin-only, e o painel o lê pelo índice
-- `audit_log_entity_idx`. Estado na tabela, motivo no histórico.

create index profiles_suspended_idx
  on public.profiles (suspended_at desc)
  where suspended_at is not null;
comment on index public.profiles_suspended_idx is
  'Fila de suspensos do painel. Parcial: a esmagadora maioria das linhas tem NULL aqui e não entra no índice.';

-- --- os dois helpers ---------------------------------------------------------

create or replace function private.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.suspended_at is not null
  );
$$;

comment on function private.is_suspended() is
  'True se o usuário da sessão está suspenso. Devolve false para anônimo (sem auth.uid()), que não tem GRANT de escrita em nada de qualquer forma.';

grant execute on function private.is_suspended() to anon, authenticated;

-- Admin suspenso PERDE o poder de admin. Sem esta linha, suspender um admin
-- seria reversível por ele mesmo — a suspensão não valeria justamente contra
-- quem tem mais poder de causar dano.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'admin'
       and p.deleted_at is null
       and p.suspended_at is null
  );
$$;

comment on function private.is_admin() is
  'True se o usuário da sessão é admin ATIVO. Lê profiles.role, nunca user_metadata. Admin suspenso ou excluído devolve false.';

-- --- o barramento nas policies de escrita ------------------------------------
--
-- `(select private.is_suspended())` e não a chamada solta: a subconsulta vira
-- InitPlan, avaliada uma vez por statement em vez de uma vez por linha. Mesmo
-- motivo do `(select auth.uid())` que as policies deste projeto já usam.
--
-- Entra no USING **e** no WITH CHECK. Só no WITH CHECK, o UPDATE encontraria a
-- linha e falharia com erro; nos dois, ele simplesmente não afeta linha nenhuma
-- — que é como este schema já trata "não é seu" em todo lugar.
--
-- NENHUMA POLICY DE SELECT MUDA. Ler não é agir, e o suspenso precisa continuar
-- enxergando os próprios dados.

drop policy profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id and not (select private.is_suspended()))
  with check ((select auth.uid()) = id and not (select private.is_suspended()));

drop policy kennels_insert_own on public.kennels;
create policy kennels_insert_own
  on public.kennels for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (created_by is null or created_by = (select auth.uid()))
    and not (select private.is_suspended())
  );

drop policy kennels_update_own on public.kennels;
create policy kennels_update_own
  on public.kennels for update
  to authenticated
  using (
    ((select auth.uid()) = owner_id or private.is_admin())
    and not (select private.is_suspended())
  )
  with check (
    ((select auth.uid()) = owner_id or private.is_admin())
    and not (select private.is_suspended())
  );

drop policy dogs_insert on public.dogs;
create policy dogs_insert
  on public.dogs for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and not (select private.is_suspended())
    and (
      kennel_id is null
      or private.owns_kennel(kennel_id)
      or private.is_admin()
    )
  );

drop policy dogs_update on public.dogs;
create policy dogs_update
  on public.dogs for update
  to authenticated
  using (
    not (select private.is_suspended())
    and (
      owner_id = (select auth.uid())
      or created_by = (select auth.uid())
      or private.owns_kennel(kennel_id)
      or private.is_admin()
    )
  )
  with check (
    not (select private.is_suspended())
    and (
      owner_id = (select auth.uid())
      or created_by = (select auth.uid())
      or private.owns_kennel(kennel_id)
      or private.is_admin()
    )
    and (
      kennel_id is null
      or private.owns_kennel(kennel_id)
      or private.is_admin()
    )
  );

drop policy dog_identifiers_insert on public.dog_identifiers;
create policy dog_identifiers_insert
  on public.dog_identifiers for insert
  to authenticated
  with check (
    private.can_manage_dog(dog_id)
    and (created_by is null or created_by = (select auth.uid()))
    and not (select private.is_suspended())
  );

drop policy dog_identifiers_update on public.dog_identifiers;
create policy dog_identifiers_update
  on public.dog_identifiers for update
  to authenticated
  using (private.can_manage_dog(dog_id) and not (select private.is_suspended()))
  with check (private.can_manage_dog(dog_id) and not (select private.is_suspended()));

drop policy media_insert on public.media;
create policy media_insert
  on public.media for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and created_by = (select auth.uid())
    and not (select private.is_suspended())
    and (
      (role = 'kennel_logo' and private.owns_kennel(kennel_id))
      or (role = 'dog_gallery' and private.can_manage_dog(dog_id))
      or private.is_admin()
    )
  );

drop policy media_update on public.media;
create policy media_update
  on public.media for update
  to authenticated
  using (
    (owner_id = (select auth.uid()) or private.is_admin())
    and not (select private.is_suspended())
  )
  with check (
    (owner_id = (select auth.uid()) or private.is_admin())
    and not (select private.is_suspended())
  );

-- --- storage: subir arquivo também é agir ------------------------------------
--
-- Os SELECT ficam intactos nos dois buckets: ler o próprio arquivo não é ação, e
-- a reconciliação de bucket precisa listar o prefixo do dono.

drop policy "kennel_media_insert_own" on storage.objects;
create policy "kennel_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kennel-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.is_suspended())
  );

drop policy "kennel_media_update_own" on storage.objects;
create policy "kennel_media_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kennel-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.is_suspended())
  )
  with check (
    bucket_id = 'kennel-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.is_suspended())
  );

drop policy "kennel_media_delete_own" on storage.objects;
create policy "kennel_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kennel-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.is_suspended())
  );

drop policy "kennel_media_public_insert_own" on storage.objects;
create policy "kennel_media_public_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kennel-media-public'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.is_suspended())
  );

drop policy "kennel_media_public_update_own" on storage.objects;
create policy "kennel_media_public_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kennel-media-public'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.is_suspended())
  )
  with check (
    bucket_id = 'kennel-media-public'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.is_suspended())
  );

drop policy "kennel_media_public_delete_own" on storage.objects;
create policy "kennel_media_public_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kennel-media-public'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.is_suspended())
  );

-- --- a porta admin -----------------------------------------------------------

create or replace function public.admin_set_profile_suspended(
  p_profile_id uuid,
  p_suspended  boolean,
  p_reason     text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old timestamptz;
  v_new timestamptz;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode suspender ou reativar um usuário'
      using errcode = 'insufficient_privilege';
  end if;

  -- Admin se trancando para fora. O estrago é assimétrico: reativar exige ser
  -- admin ativo, então a operação seria irreversível pela aplicação.
  if p_profile_id = (select auth.uid()) then
    raise exception 'um admin não pode suspender a própria conta'
      using errcode = 'check_violation';
  end if;

  select p.suspended_at into v_old
    from public.profiles p
   where p.id = p_profile_id
   for update;

  if not found then
    raise exception 'perfil % não existe', p_profile_id
      using errcode = 'no_data_found';
  end if;

  -- Idempotente, e SEM linha de auditoria: repetir uma ação que não mudou nada
  -- não é uma ação. O histórico existe para ser lido, e enchê-lo de eventos
  -- vazios é a forma mais barata de torná-lo inútil.
  if (v_old is not null) = p_suspended then
    return v_old;
  end if;

  v_new := case when p_suspended then now() end;

  update public.profiles
     set suspended_at = v_new
   where id = p_profile_id;

  -- A RLS barra a ESCRITA na hora, mas o GoTrue não lê public.profiles — sem
  -- esta linha, o suspenso continuaria logando normalmente e só descobriria o
  -- bloqueio ao tentar salvar algo.
  --
  -- `banned_until` é coluna de DADO do Auth, não configuração: não encosta em
  -- config.toml nem no painel do Supabase. Intervalo absurdo-mas-finito em vez
  -- de 'infinity' porque o driver Go do GoTrue não trata infinito de forma
  -- confiável.
  update auth.users
     set banned_until = case when p_suspended then now() + interval '100 years' end
   where id = p_profile_id;

  perform private.audit(
    case when p_suspended then 'profile.suspend' else 'profile.unsuspend' end,
    'profile',
    p_profile_id,
    p_reason,
    jsonb_build_object('de', v_old, 'para', v_new)
  );

  return v_new;
end;
$$;

comment on function public.admin_set_profile_suspended(uuid, boolean, text) is
  'Suspende ou reativa um usuário: grava profiles.suspended_at, bane no Auth (auth.users.banned_until) e audita, tudo na mesma transação. NÃO oculta o conteúdo público dele — para isso existe admin_set_kennel_hidden / admin_set_dog_hidden.';

revoke execute on function public.admin_set_profile_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_profile_suspended(uuid, boolean, text) to authenticated;


-- =============================================================================
-- 3. CORREÇÃO DO NÚMERO DO CANIL
-- =============================================================================
--
-- CORREÇÃO DE PREMISSA, primeiro: DUPLICIDADE DE `founder_number` É IMPOSSÍVEL
-- hoje. `kennels_founder_number_key` é único GLOBAL, nem parcial por
-- `deleted_at`. Os casos reais de correção são "número errado atribuído",
-- "número queimado por rollback" e "mover o número de um canil para outro".
-- Esta função resolve esses e PRESERVA a unicidade — não a afrouxa.
--
-- =============================================================================
-- COMO ABRE A TRAVA SEM ENFRAQUECER A PROTEÇÃO DE USUÁRIO COMUM
-- =============================================================================
--
-- A proteção de hoje tem DUAS camadas, e esta seção só toca na segunda:
--
--   camada 1  GRANT UPDATE por coluna   bloqueia NULL -> valor      INTACTA
--   camada 2  trigger de imutabilidade  bloqueia valor -> qualquer  ganha escotilha
--
-- É a CAMADA 1 que impede o usuário comum de escolher o próprio número, e ela
-- não é tocada: `founder_number` continua fora da lista de `grant update` para
-- `authenticated`. Para um usuário comum NADA MUDA — nem com a escotilha
-- escancarada, porque o Postgres recusa por falta de privilégio de coluna antes
-- de qualquer trigger rodar.
--
-- E a escotilha é estreita por construção: carrega o ID DA LINHA, não um
-- booleano. Abrir para o canil A não abre para o canil B.
-- =============================================================================

create or replace function public.kennels_freeze_founder_number()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A escotilha. Só `admin_set_founder_number` define esta GUC, e só com o id do
  -- canil que ela mesma travou com FOR UPDATE.
  --
  -- `current_setting(..., true)` devolve NULL quando não definida; NULL = texto
  -- avalia para NULL, que o IF trata como falso. Não definida = bloqueado.
  if current_setting('origemx.founder_override', true) = old.id::text then
    return new;
  end if;

  raise exception
    'O selo Criador Fundador é imutável e intransferível (canil %, número %)',
    old.id, old.founder_number
    using errcode = 'restrict_violation';
end;
$$;

revoke execute on function public.kennels_freeze_founder_number() from public, anon, authenticated;

create or replace function public.admin_set_founder_number(
  p_kennel_id uuid,
  p_number    integer,
  p_reason    text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old  integer;
  v_last bigint;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode corrigir o número do canil'
      using errcode = 'insufficient_privilege';
  end if;

  -- Mesmo piso do CHECK `kennels_founder_number_range`. Checado aqui para a
  -- mensagem dizer o que houve.
  if p_number is not null and p_number < 1 then
    raise exception 'o número do canil começa em 1 (recebido: %)', p_number
      using errcode = 'check_violation';
  end if;

  select k.founder_number into v_old
    from public.kennels k
   where k.id = p_kennel_id
   for update;

  if not found then
    raise exception 'canil % não existe', p_kennel_id
      using errcode = 'no_data_found';
  end if;

  -- Idempotente e sem auditoria, mesma regra da suspensão.
  if p_number is not distinct from v_old then
    return v_old;
  end if;

  -- `is_local => true` limita à transação; e como esta função tem cláusula SET
  -- (`search_path = ''`), o Postgres abre um nível de GUC próprio para a chamada
  -- e reverte tudo que foi definido nela no retorno. A escotilha não sobrevive à
  -- função nem em caso de erro.
  perform set_config('origemx.founder_override', p_kennel_id::text, true);

  begin
    update public.kennels
       set founder_number = p_number
     where id = p_kennel_id;
  exception
    -- O ÍNDICE ÚNICO É O MECANISMO, não um `select` prévio de "já existe?" —
    -- esse é o defeito de ler-e-depois-escrever que a migration do selo
    -- documenta e recusa: duas correções simultâneas passariam as duas.
    -- Capturar serve só para a mensagem dizer qual número está em uso.
    when unique_violation then
      raise exception 'o número % já pertence a outro canil', p_number
        using errcode = 'unique_violation';
  end;

  perform private.audit(
    'kennel.founder_number.set',
    'kennel',
    p_kennel_id,
    p_reason,
    jsonb_build_object('de', v_old, 'para', p_number)
  );

  -- A SEQUENCE NÃO PODE FICAR ATRÁS de um número atribuído à mão. Sem isto,
  -- corrigir um canil para 250 faria a atribuição AUTOMÁTICA colidir com ele
  -- centenas de cadastros depois — e a colisão estouraria dentro de
  -- `try_assign_founder_number`, abortando o INSERT do cão que a disparou.
  --
  -- `>=` e não `>`: numa sequence com `is_called = false`, o próximo `nextval`
  -- devolve o próprio `last_value`, não `last_value + 1`.
  --
  -- ÚLTIMA OPERAÇÃO DA FUNÇÃO, pelo mesmo motivo que `nextval` é a última em
  -- `try_assign_founder_number`: `setval` NÃO é transacional. Se viesse antes da
  -- auditoria, um motivo em branco abortaria tudo e ainda assim deixaria a
  -- sequence adiantada.
  if p_number is not null then
    select s.last_value into v_last from public.kennel_founder_seq s;
    if p_number >= v_last then
      perform setval('public.kennel_founder_seq', p_number);
    end if;
  end if;

  return p_number;
end;
$$;

comment on function public.admin_set_founder_number(uuid, integer, text) is
  'Corrige o número do canil, admin-only e auditado. p_number NULL libera o número. A unicidade continua garantida pelo índice; a imutabilidade continua valendo para todo mundo, inclusive para o admin fora desta função.';

revoke execute on function public.admin_set_founder_number(uuid, integer, text) from public, anon;
grant execute on function public.admin_set_founder_number(uuid, integer, text) to authenticated;

-- --- defesa em profundidade na atribuição automática -------------------------
--
-- Idêntica à original, com UMA mudança: o UPDATE final passa a capturar
-- `unique_violation`. O `setval` acima evita a colisão, mas se algo escapar,
-- selo é OPCIONAL e cadastro de cão não é — engolir e seguir sem selo é a mesma
-- filosofia que a função já aplica ao esgotamento da sequence.

create or replace function public.try_assign_founder_number(p_kennel_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing integer;
  v_number   integer;
begin
  select k.founder_number into v_existing
    from public.kennels k
   where k.id = p_kennel_id
     and k.deleted_at is null
   for update;

  if not found then
    return null;
  end if;

  if v_existing is not null then
    return v_existing;
  end if;

  if not public.kennel_is_founder_eligible(p_kennel_id) then
    return null;
  end if;

  begin
    v_number := nextval('public.kennel_founder_seq');
  exception
    when sqlstate '2200H' then
      return null;
  end;

  begin
    update public.kennels
       set founder_number = v_number
     where id = p_kennel_id;
  exception
    -- Um número que um admin atribuiu à mão pode ter passado à frente da
    -- sequence. Selo é opcional; o INSERT de cão que disparou este trigger não.
    when unique_violation then
      return null;
  end;

  return v_number;
end;
$$;

comment on function public.try_assign_founder_number(uuid) is
  'Atribui o número se o canil for elegível. Devolve NULL quando não há número a dar — esgotamento e colisão com número corrigido à mão não são erro, são ausência de selo.';

revoke execute on function public.try_assign_founder_number(uuid) from public, anon, authenticated;


-- =============================================================================
-- 4. OCULTAR / REATIVAR — `published_at` NÃO basta
-- =============================================================================
--
-- A pergunta era se `published_at` já cobre "ocultar/reativar" do ponto de vista
-- do admin. NÃO COBRE, por três motivos, e o primeiro sozinho já decide:
--
--   1. `published_at` É DO DONO. Está no `grant update` por coluna de
--      `authenticated` e `kennels_update_own` deixa o dono escrever. O admin
--      ocultaria zerando; o dono republicaria em seguida. A moderação seria
--      desfeita pelo moderado.
--
--   2. PERDE INFORMAÇÃO. `published_at` guarda QUANDO O DONO PUBLICOU. Zerar e
--      republicar reescreve essa data, e "publicado desde" passa a mentir.
--
--   3. CONFUNDE DUAS DECISÕES. "O dono não quis publicar" e "o admin tirou do
--      ar" são estados diferentes, com consequências diferentes, e o painel
--      precisa distinguir para saber o que oferecer a quem.
--
-- SEM CASCATA, pela mesma razão da seção 2: ocultar um canil NÃO oculta os cães
-- dele. Cada ocultação é uma decisão, um registro e uma linha de auditoria.
-- =============================================================================

alter table public.kennels add column hidden_at timestamptz;
alter table public.dogs    add column hidden_at timestamptz;

comment on column public.kennels.hidden_at is
  'Não-NULL = ocultado por decisão do ADMIN. Distinto de published_at, que é do dono, e de deleted_at, que é exclusão. O dono continua enxergando a linha — precisa saber que foi ocultado. Gravado só por admin_set_kennel_hidden; o motivo vive em audit_log.';
comment on column public.dogs.hidden_at is
  'Não-NULL = ocultado por decisão do ADMIN. Entra em dog_is_public(), então o cão também deixa de ser alcançável pelo pedigree de terceiros. Gravado só por admin_set_dog_hidden; o motivo vive em audit_log.';

create index kennels_hidden_idx
  on public.kennels (hidden_at desc) where hidden_at is not null;
create index dogs_hidden_idx
  on public.dogs (hidden_at desc) where hidden_at is not null;

-- OS ÍNDICES PARCIAIS DE PUBLICAÇÃO NÃO SÃO REFEITOS, e é decisão.
-- `kennels_published_idx` e `dogs_kennel_published_idx` têm predicado
-- `deleted_at is null and published_at is not null`, que agora é um
-- SUPERCONJUNTO do predicado da policy. O índice continua aplicável — o Postgres
-- usa índice de predicado mais largo e descarta o excedente no heap — e o
-- excedente aqui são exatamente as linhas ocultas, que são raras por natureza.
-- Reconstruir custaria churn para filtrar quase nada. Se o volume de moderação
-- crescer a ponto de importar, reconstrói-se então.

-- --- `hidden_at` fora do alcance do dono -------------------------------------
--
-- `kennels` e `profiles` já usam GRANT por coluna, então a coluna nova nasce
-- protegida. `dogs` NÃO: tem `grant update` no nível da TABELA, e sem esta
-- conversão o dono simplesmente zeraria o próprio `hidden_at`.
--
-- A lista abaixo reproduz o que já era atualizável, MENOS `hidden_at` e `id`.
-- `id` sai porque conceder UPDATE numa chave primária não se defende e nenhum
-- caminho da aplicação faz isso; o resto fica idêntico de propósito, para esta
-- migration não carregar aperto de escopo alheio.
--
-- `public_id` PERMANECE na lista: quem o protege é o trigger
-- `dogs_freeze_public_id`, e é o erro dele que a bateria e o test:rls esperam
-- ver. Tirá-lo daqui trocaria aquele erro por um de permissão.

revoke update on public.dogs from authenticated;

grant update (
  public_id,
  slug,
  name,
  sex,
  born_on,
  breed,
  color,
  coat,
  kennel_id,
  owner_id,
  sire_id,
  dam_id,
  published_at,
  created_by,
  created_at,
  updated_at,
  deleted_at
) on public.dogs to authenticated;

-- --- canil: `hidden_at` entra só no ramo PÚBLICO -----------------------------

drop policy kennels_select on public.kennels;

create policy kennels_select
  on public.kennels for select
  to anon, authenticated
  using (
    (deleted_at is null and published_at is not null and hidden_at is null)
    or (select auth.uid()) = owner_id
    or private.is_admin()
  );

-- --- cão: a regra mora em `dog_is_public()`, a fonte única -------------------
--
-- MUDA A ARIDADE (4 -> 5 argumentos), em vez de sobrecarregar: qualquer chamada
-- de 4 argumentos que sobrasse em algum canto vira erro alto na hora, não bug
-- silencioso que devolve visibilidade errada. Verificado que só a policy
-- `dogs_select` e `dog_pedigree` chamam — nenhum código de aplicação chama.
--
-- A ordem obriga a sequência: a policy depende da função, então cai primeiro.

drop policy dogs_select on public.dogs;
drop function public.dog_is_public(timestamptz, timestamptz, uuid, uuid);

create or replace function public.dog_is_public(
  p_deleted_at   timestamptz,
  p_hidden_at    timestamptz,
  p_published_at timestamptz,
  p_owner_id     uuid,
  p_kennel_id    uuid
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_deleted_at is null
     -- Ocultado pelo admin some do público inteiro, inclusive da regra de
     -- fantasma abaixo: ancestral sem dono e sem canil também pode precisar de
     -- moderação, e a exceção que o torna legível não pode furar isto.
     and p_hidden_at is null
     and (
       p_published_at is not null
       -- Ancestral fantasma: sem dono E sem canil. A conjunção importa — cão
       -- com canil e sem dono é rascunho de alguém, não nó de árvore.
       or (p_owner_id is null and p_kennel_id is null)
     );
$$;

comment on function public.dog_is_public(timestamptz, timestamptz, timestamptz, uuid, uuid) is
  'Regra única de visibilidade pública de cão. Usada pela policy dogs_select e pela função de pedigree. hidden_at (decisão do admin) tem precedência sobre a exceção do ancestral fantasma.';

grant execute on function public.dog_is_public(timestamptz, timestamptz, timestamptz, uuid, uuid)
  to anon, authenticated;

create policy dogs_select
  on public.dogs for select
  to anon, authenticated
  using (
    public.dog_is_public(deleted_at, hidden_at, published_at, owner_id, kennel_id)
    or owner_id = (select auth.uid())
    or created_by = (select auth.uid())
    or private.owns_kennel(kennel_id)
    or private.is_admin()
  );

-- `dog_pedigree` tem corpo em string, então não guarda dependência da função
-- antiga — mas passaria a chamar uma assinatura que não existe mais. Reescrita
-- aqui, na mesma transação. O corpo é o mesmo; mudam apenas as chamadas.
create or replace function public.dog_pedigree(p_dog_id uuid, p_generations int default 5)
returns table (
  pos         bigint,
  generation  int,
  dog_id      uuid,
  name        text,
  is_public   boolean,
  public_id   text,
  sex         text,
  breed       text,
  born_on     date,
  kennel_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ped (pos, generation, dog_id) as (
      select 1::bigint, 0, d.id
        from public.dogs d
       where d.id = p_dog_id
         and d.deleted_at is null
    union all
      select p.pos * 2 + side.branch,
             p.generation + 1,
             case when side.branch = 0 then d.sire_id else d.dam_id end
        from ped p
        join public.dogs d on d.id = p.dog_id
        cross join (values (0), (1)) as side(branch)
       where p.generation < least(greatest(coalesce(p_generations, 5), 1), 5)
         and (case when side.branch = 0 then d.sire_id else d.dam_id end) is not null
  )
  select
    p.pos,
    p.generation,
    d.id,
    -- NOME SAI SEMPRE, inclusive de rascunho de terceiro e de cão ocultado:
    -- pedigree com lacuna não é pedigree. Decisão de produto registrada em
    -- supabase/README.md, pendente de validação do cliente.
    d.name,
    public.dog_is_public(d.deleted_at, d.hidden_at, d.published_at, d.owner_id, d.kennel_id),
    -- O RESTO só sai se o cão for público. Sem public_id não há link nem URL
    -- construível: um cão ocultado vira nó sem link, e a árvore não quebra.
    case when public.dog_is_public(d.deleted_at, d.hidden_at, d.published_at, d.owner_id, d.kennel_id)
         then d.public_id end,
    case when public.dog_is_public(d.deleted_at, d.hidden_at, d.published_at, d.owner_id, d.kennel_id)
         then d.sex end,
    case when public.dog_is_public(d.deleted_at, d.hidden_at, d.published_at, d.owner_id, d.kennel_id)
         then d.breed end,
    case when public.dog_is_public(d.deleted_at, d.hidden_at, d.published_at, d.owner_id, d.kennel_id)
         then d.born_on end,
    case when public.dog_is_public(d.deleted_at, d.hidden_at, d.published_at, d.owner_id, d.kennel_id)
         then k.name end
  from ped p
  join public.dogs d on d.id = p.dog_id
  left join public.kennels k on k.id = d.kennel_id
  order by p.pos;
$$;

comment on function public.dog_pedigree(uuid, int) is
  'Árvore de até 5 gerações em uma query, numerada por Ahnentafel. SECURITY DEFINER para atravessar galhos que a RLS do chamador esconderia; a divulgação é decidida campo a campo aqui dentro.';

grant execute on function public.dog_pedigree(uuid, int) to anon, authenticated;

-- MÍDIA VEM DE GRAÇA: `media_select` pergunta "o canil/cão existe para mim?" em
-- vez de repetir a regra de publicação, então ocultar o registro esconde a mídia
-- sem uma linha a mais aqui. O desenho delegado pagando dividendo.
--
-- O QUE **NÃO** VEM DE GRAÇA, e fica registrado: o ARQUIVO de um registro
-- publicado vive no bucket `kennel-media-public`, servido pelo CDN por URL
-- estável. Ocultar tira a PÁGINA do ar; o arquivo continua alcançável por quem
-- tiver a URL. SQL não move bytes — isso é `reconcileMediaBucket`, na camada de
-- aplicação, no mesmo caminho que despublicar já usa.

-- --- as portas admin ---------------------------------------------------------

create or replace function public.admin_set_kennel_hidden(
  p_kennel_id uuid,
  p_hidden    boolean,
  p_reason    text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old timestamptz;
  v_new timestamptz;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode ocultar ou reativar um canil'
      using errcode = 'insufficient_privilege';
  end if;

  select k.hidden_at into v_old
    from public.kennels k
   where k.id = p_kennel_id
   for update;

  if not found then
    raise exception 'canil % não existe', p_kennel_id
      using errcode = 'no_data_found';
  end if;

  if (v_old is not null) = p_hidden then
    return v_old;
  end if;

  v_new := case when p_hidden then now() end;

  update public.kennels set hidden_at = v_new where id = p_kennel_id;

  perform private.audit(
    case when p_hidden then 'kennel.hide' else 'kennel.unhide' end,
    'kennel',
    p_kennel_id,
    p_reason,
    jsonb_build_object('de', v_old, 'para', v_new)
  );

  return v_new;
end;
$$;

comment on function public.admin_set_kennel_hidden(uuid, boolean, text) is
  'Oculta ou reativa um canil por decisão administrativa. NÃO cascateia para os cães: cada ocultação é uma decisão e uma linha de auditoria.';

create or replace function public.admin_set_dog_hidden(
  p_dog_id uuid,
  p_hidden boolean,
  p_reason text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old timestamptz;
  v_new timestamptz;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode ocultar ou reativar um cão'
      using errcode = 'insufficient_privilege';
  end if;

  select d.hidden_at into v_old
    from public.dogs d
   where d.id = p_dog_id
   for update;

  if not found then
    raise exception 'cão % não existe', p_dog_id
      using errcode = 'no_data_found';
  end if;

  if (v_old is not null) = p_hidden then
    return v_old;
  end if;

  v_new := case when p_hidden then now() end;

  update public.dogs set hidden_at = v_new where id = p_dog_id;

  perform private.audit(
    case when p_hidden then 'dog.hide' else 'dog.unhide' end,
    'dog',
    p_dog_id,
    p_reason,
    jsonb_build_object('de', v_old, 'para', v_new)
  );

  return v_new;
end;
$$;

comment on function public.admin_set_dog_hidden(uuid, boolean, text) is
  'Oculta ou reativa um cão por decisão administrativa. Entra em dog_is_public(), então o registro também deixa de ser alcançável pelo pedigree de terceiros — o nome continua saindo, sem link.';

-- `revoke from public` NÃO é redundante: função em `public` nasce com EXECUTE
-- para PUBLIC, e `anon` herda daí. O projeto já foi mordido por isso — a
-- migration `revoke_dog_descendants_from_anon` existe exatamente porque o grant
-- explícito a `authenticated` não bastava.
revoke execute on function public.admin_set_kennel_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_kennel_hidden(uuid, boolean, text) to authenticated;

revoke execute on function public.admin_set_dog_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_dog_hidden(uuid, boolean, text) to authenticated;
