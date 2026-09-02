-- =============================================================================
-- OrigemX — cadastro assistido: a fundação
--
-- O PEDIDO. O admin precisa sentar com um criador novo e preencher TUDO pelo
-- painel: canil, cão, ninhada, e o que pende de cada um. Hoje ele cria a casca
-- (`admin_create_*`) e não consegue completá-la — os carregadores do painel do
-- dono são `owner_id`-scoped, então nem a cidade do canil ele edita.
--
-- O QUE ESTA MIGRATION NÃO FAZ: abrir acesso novo. Ela é a fundação para o
-- ESTREITAMENTO que vem na próxima. O estado de hoje já é permissivo demais:
--
--   * `dog_identifiers`, `dog_health_records`, `dog_genetic_tests` e
--     `dog_measurements` autorizam por `private.can_manage_dog(dog_id)`, que
--     termina em `or private.is_admin()`;
--   * `dogs`, `kennels`, `kennel_litters`, `dog_videos`, `kennel_faqs`,
--     `testimonials` e `media` carregam `or private.is_admin()` explícito.
--
-- Somando: um admin JÁ escreve em vacina, exame genético, microchip, vídeo,
-- depoimento e ninhada de qualquer criador, sem deixar rastro nenhum. Só não há
-- tela. Este trabalho torna isso possível pela UI e prestável de contas — e,
-- na migration seguinte, mais estreito do que é hoje.
--
-- O MECANISMO. Uma SESSÃO: o admin declara "vou cadastrar em nome de X", com
-- motivo, e a partir daí toda escrita dele naquele criador é auditada
-- automaticamente, herdando aquele motivo. Sem sessão aberta, nada muda.
--
-- POR QUE SESSÃO E NÃO MOTIVO POR AÇÃO. São doze superfícies de escrita. Exigir
-- um motivo a cada campo salvo tornaria "guiar um criador" impraticável — que é
-- exatamente o caso de uso. O motivo é escrito uma vez; a granularidade da
-- trilha não se perde, porque cada escrita ainda gera a própria linha.
--
-- POR QUE TRIGGER E NÃO RPC. Doze RPCs seriam doze lugares para esquecer de
-- auditar. No trigger a trilha é do BANCO: não existe caminho de aplicação que
-- escreva sob sessão e não apareça no Histórico.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A sessão
--
-- `ended_at` nulo = aberta. O índice único parcial garante UMA aberta por admin:
-- com duas, "em nome de quem ele está escrevendo agora?" não teria resposta, e
-- o trigger de trilha precisa dessa resposta ser única.
--
-- Sem `deleted_at`: sessão é registro de auditoria, não conteúdo. Não se exclui,
-- nem logicamente — mesma razão pela qual `audit_log` não tem.
-- -----------------------------------------------------------------------------

create table public.admin_assist_sessions (
  id                 uuid primary key default gen_random_uuid(),
  admin_id           uuid not null references public.profiles (id) on delete restrict,
  target_profile_id  uuid not null references public.profiles (id) on delete restrict,
  reason             text not null,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,

  constraint admin_assist_reason_len check (length(btrim(reason)) between 3 and 500),
  -- Assistir a si mesmo não é assistência: seria só uma forma de escapar do
  -- rastro nas próprias telas.
  constraint admin_assist_nao_e_a_si_mesmo check (admin_id <> target_profile_id)
);

comment on table public.admin_assist_sessions is
  'Sessão de cadastro assistido: um admin declarando que vai preencher registros EM NOME de um criador. Enquanto aberta, as policies aceitam a escrita e o trigger de trilha audita cada uma herdando o motivo daqui.';

create unique index admin_assist_uma_aberta_por_admin
  on public.admin_assist_sessions (admin_id)
  where ended_at is null;

create index admin_assist_target_idx
  on public.admin_assist_sessions (target_profile_id, started_at desc);

alter table public.admin_assist_sessions enable row level security;

-- LEITURA para o próprio admin e para qualquer admin (é registro de auditoria,
-- e auditoria que só o autor enxerga não audita nada). ESCRITA por ninguém: as
-- duas funções abaixo são SECURITY DEFINER e são a única porta — mesmo desenho
-- de `audit_log`, e pela mesma razão.
create policy admin_assist_sessions_select
  on public.admin_assist_sessions for select
  to authenticated
  using (private.is_admin());


-- -----------------------------------------------------------------------------
-- 2. Quem estou assistindo agora
--
-- ZERO ARGUMENTOS, e isto é decisão de PERFORMANCE, não de estilo.
--
-- As policies vão usá-la como `<coluna de dono> = (select private.assisting_profile())`.
-- O `(select ...)` faz o planner tratá-la como InitPlan: avaliada UMA vez por
-- consulta. Uma função que recebesse a linha como argumento seria avaliada por
-- LINHA — e sendo SECURITY DEFINER, o planner não consegue inliná-la.
--
-- Não é hipótese: foi exatamente assim que `can_write_storage_prefix` derrubou o
-- `list` do Storage em timeout (ver `admin_le_storage_do_dono`). A lição está no
-- desenho desta assinatura.
-- -----------------------------------------------------------------------------

create or replace function private.assisting_profile()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.target_profile_id
    from public.admin_assist_sessions s
   where s.admin_id = (select auth.uid())
     and s.ended_at is null
     -- Admin suspenso ou excluído não assiste ninguém. `is_admin()` já cobre os
     -- dois, e chamá-la aqui mantém a regra num lugar só.
     and private.is_admin()
   limit 1;
$$;

comment on function private.assisting_profile() is
  'O criador que o admin desta sessão está assistindo agora, ou NULL. Sem argumentos de propósito: as policies a chamam como (select ...) para virar InitPlan e rodar uma vez por consulta.';

revoke execute on function private.assisting_profile() from public, anon;
grant  execute on function private.assisting_profile() to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Vocabulário do audit_log
--
-- `assist.start`/`assist.end` descrevem a SESSÃO; `<raiz>.assist_write` descreve
-- cada escrita feita dentro dela. A raiz é sempre canil, cão ou ninhada — a
-- tabela concreta vai em `details.tabela`.
--
-- Manter a raiz em vez de criar oito entidades novas é o que preserva a pergunta
-- útil: "o que este admin fez no cão X" continua sendo um `where entity_id = ?`,
-- em vez de um OR sobre sete tipos que alguém vai esquecer de atualizar.
-- -----------------------------------------------------------------------------

alter table public.audit_log drop constraint audit_log_action_valid;
alter table public.audit_log add constraint audit_log_action_valid check (action in (
  'profile.suspend', 'profile.unsuspend',
  'kennel.hide',     'kennel.unhide',
  'dog.hide',        'dog.unhide',
  'kennel.founder_number.set',
  'dog.create_for_user',
  'litter.create_for_user',
  'kennel.create_for_user',
  'media.create_for_user',
  'dog.publish',     'dog.unpublish',
  'kennel.publish',  'kennel.unpublish',
  'assist.start',    'assist.end',
  'kennel.assist_write', 'dog.assist_write', 'litter.assist_write'
));

alter table public.audit_log drop constraint audit_log_entity_valid;
alter table public.audit_log add constraint audit_log_entity_valid
  check (entity_type in ('profile', 'kennel', 'dog', 'litter', 'media', 'assist'));


-- -----------------------------------------------------------------------------
-- 4. Abrir e encerrar
-- -----------------------------------------------------------------------------

create or replace function public.admin_start_assist_session(
  p_target_profile_id uuid,
  p_reason            text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode iniciar um cadastro assistido'
      using errcode = 'insufficient_privilege';
  end if;

  if p_target_profile_id = (select auth.uid()) then
    raise exception 'não faz sentido assistir a si mesmo'
      using errcode = 'check_violation';
  end if;

  perform 1 from public.profiles p
   where p.id = p_target_profile_id and p.deleted_at is null;
  if not found then
    raise exception 'usuário % não existe ou está excluído', p_target_profile_id
      using errcode = 'no_data_found';
  end if;

  -- Reabrir para o MESMO alvo é no-op: o admin voltou à tela, não começou coisa
  -- nova. Trocar de alvo com sessão aberta é erro de fluxo, e a mensagem diz o
  -- que fazer — o índice único levantaria 23505 sem explicar nada.
  select s.id into v_id
    from public.admin_assist_sessions s
   where s.admin_id = (select auth.uid()) and s.ended_at is null;

  if found then
    if (select s.target_profile_id from public.admin_assist_sessions s where s.id = v_id)
       = p_target_profile_id then
      return v_id;
    end if;
    raise exception 'encerre o cadastro assistido em andamento antes de iniciar outro'
      using errcode = 'unique_violation';
  end if;

  insert into public.admin_assist_sessions (admin_id, target_profile_id, reason)
  values ((select auth.uid()), p_target_profile_id, btrim(p_reason))
  returning id into v_id;

  perform private.audit(
    'assist.start', 'assist', v_id, p_reason,
    jsonb_build_object('target_profile_id', p_target_profile_id)
  );

  return v_id;
end;
$$;

comment on function public.admin_start_assist_session(uuid, text) is
  'Abre a sessão de cadastro assistido. Enquanto aberta, o admin escreve nos registros do alvo e cada escrita vira linha de audit_log herdando este motivo.';

create or replace function public.admin_end_assist_session()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_alvo   uuid;
  v_motivo text;
  v_n      integer;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode encerrar um cadastro assistido'
      using errcode = 'insufficient_privilege';
  end if;

  select s.id, s.target_profile_id, s.reason
    into v_id, v_alvo, v_motivo
    from public.admin_assist_sessions s
   where s.admin_id = (select auth.uid()) and s.ended_at is null
     for update;

  -- Encerrar o que já está encerrado é no-op, não erro: o botão pode ter sido
  -- clicado duas vezes, ou a aba reaberta.
  if not found then
    return;
  end if;

  update public.admin_assist_sessions set ended_at = now() where id = v_id;

  select count(*) into v_n
    from public.audit_log a
   where a.actor_id = (select auth.uid())
     and a.action like '%.assist_write'
     and a.created_at >= (select s.started_at from public.admin_assist_sessions s where s.id = v_id);

  perform private.audit(
    'assist.end', 'assist', v_id, v_motivo,
    jsonb_build_object('target_profile_id', v_alvo, 'alteracoes', v_n)
  );
end;
$$;

comment on function public.admin_end_assist_session() is
  'Encerra a sessão aberta do admin atual e registra quantas escritas ela produziu. Idempotente: sem sessão aberta, não faz nada.';

revoke execute on function public.admin_start_assist_session(uuid, text) from public, anon;
grant  execute on function public.admin_start_assist_session(uuid, text) to authenticated;
revoke execute on function public.admin_end_assist_session() from public, anon;
grant  execute on function public.admin_end_assist_session() to authenticated;


-- -----------------------------------------------------------------------------
-- 5. A trilha, por trigger
--
-- Dispara SÓ quando há sessão aberta e o registro pertence ao alvo dela. Fora
-- disso é no-op — o que também evita log em dobro nas RPCs `admin_*`, que já
-- escrevem a própria linha e rodam sem sessão.
--
-- `TG_ARGV[0]` é a RAIZ (kennel/dog/litter) e `TG_ARGV[1]` a coluna que aponta
-- para ela, ou 'self' quando a tabela É a raiz. Passar isso como argumento evita
-- um CASE sobre onze nomes de tabela dentro da função, que seria mais um lugar
-- para esquecer de atualizar ao acrescentar a décima segunda.
-- -----------------------------------------------------------------------------

create or replace function private.trg_audit_assist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo    uuid := private.assisting_profile();
  v_linha   jsonb;
  v_raiz    text := TG_ARGV[0];
  v_coluna  text := TG_ARGV[1];
  v_raiz_id uuid;
  v_dono    uuid;
begin
  -- Sem sessão aberta não há o que auditar aqui: ou é o próprio dono
  -- escrevendo, ou é uma RPC `admin_*` que já se auditou.
  if v_alvo is null then
    return null;
  end if;

  v_linha := to_jsonb(coalesce(new, old));

  if v_coluna = 'self' then
    v_raiz_id := (v_linha->>'id')::uuid;
  elsif v_coluna = 'media' then
    -- `media` pende de canil, cão OU ninhada, uma de cada vez
    -- (`media_single_owner`). A raiz sai de qual FK está preenchida.
    if (v_linha->>'kennel_id') is not null then
      v_raiz := 'kennel'; v_raiz_id := (v_linha->>'kennel_id')::uuid;
    elsif (v_linha->>'dog_id') is not null then
      v_raiz := 'dog';    v_raiz_id := (v_linha->>'dog_id')::uuid;
    elsif (v_linha->>'litter_id') is not null then
      v_raiz := 'litter'; v_raiz_id := (v_linha->>'litter_id')::uuid;
    else
      -- Avatar de depoimento e foto de medição: a raiz fica fora do alcance
      -- desta trilha, e a escrita não é bloqueada por isso.
      return null;
    end if;
  else
    v_raiz_id := (v_linha->>v_coluna)::uuid;
  end if;

  if v_raiz_id is null then
    return null;
  end if;

  -- O DONO sai sempre da raiz, nunca da linha escrita: é o que impede uma linha
  -- com `owner_id` errado de se auditar como se fosse de outra pessoa.
  if v_raiz = 'kennel' then
    select k.owner_id into v_dono from public.kennels k where k.id = v_raiz_id;
  elsif v_raiz = 'dog' then
    select coalesce(d.owner_id, k.owner_id) into v_dono
      from public.dogs d
      left join public.kennels k on k.id = d.kennel_id
     where d.id = v_raiz_id;
  else
    select k.owner_id into v_dono
      from public.kennel_litters l
      join public.kennels k on k.id = l.kennel_id
     where l.id = v_raiz_id;
  end if;

  -- Escrita que não é do alvo da sessão não é assistência. Não bloqueia aqui —
  -- quem bloqueia é a policy; aqui só não se registra como se fosse.
  if v_dono is distinct from v_alvo then
    return null;
  end if;

  perform private.audit(
    v_raiz || '.assist_write',
    v_raiz,
    v_raiz_id,
    (select s.reason from public.admin_assist_sessions s
      where s.admin_id = (select auth.uid()) and s.ended_at is null),
    jsonb_build_object(
      'tabela',    TG_TABLE_NAME,
      'operacao',  TG_OP,
      'registro',  coalesce(v_linha->>'id', ''),
      'owner_id',  v_dono
    )
  );

  return null;
end;
$$;

comment on function private.trg_audit_assist() is
  'AFTER trigger: registra em audit_log toda escrita feita sob sessão de cadastro assistido, herdando o motivo da sessão. No-op sem sessão aberta, o que também evita log em dobro nas RPCs admin_*.';

revoke execute on function private.trg_audit_assist() from public, anon, authenticated;

create trigger kennels_audit_assist
  after insert or update or delete on public.kennels
  for each row execute function private.trg_audit_assist('kennel', 'self');

create trigger dogs_audit_assist
  after insert or update or delete on public.dogs
  for each row execute function private.trg_audit_assist('dog', 'self');

create trigger kennel_litters_audit_assist
  after insert or update or delete on public.kennel_litters
  for each row execute function private.trg_audit_assist('litter', 'self');

create trigger dog_identifiers_audit_assist
  after insert or update or delete on public.dog_identifiers
  for each row execute function private.trg_audit_assist('dog', 'dog_id');

create trigger dog_health_records_audit_assist
  after insert or update or delete on public.dog_health_records
  for each row execute function private.trg_audit_assist('dog', 'dog_id');

create trigger dog_genetic_tests_audit_assist
  after insert or update or delete on public.dog_genetic_tests
  for each row execute function private.trg_audit_assist('dog', 'dog_id');

create trigger dog_measurements_audit_assist
  after insert or update or delete on public.dog_measurements
  for each row execute function private.trg_audit_assist('dog', 'dog_id');

create trigger dog_videos_audit_assist
  after insert or update or delete on public.dog_videos
  for each row execute function private.trg_audit_assist('dog', 'dog_id');

create trigger kennel_faqs_audit_assist
  after insert or update or delete on public.kennel_faqs
  for each row execute function private.trg_audit_assist('kennel', 'kennel_id');

create trigger testimonials_audit_assist
  after insert or update or delete on public.testimonials
  for each row execute function private.trg_audit_assist('kennel', 'kennel_id');

create trigger media_audit_assist
  after insert or update or delete on public.media
  for each row execute function private.trg_audit_assist('media', 'media');
