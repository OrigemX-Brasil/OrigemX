-- =============================================================================
-- OrigemX — funil de ativação do criador
--
-- ---------------------------------------------------------------------------
-- A PERGUNTA: de cada 100 contas criadas, quantas chegam a cadastrar o
-- primeiro cão? Até aqui não havia como responder. `countProfiles()` e
-- `countDogs()` são totais independentes — "usuários com zero cães" não se
-- deriva de nenhum dos dois.
-- ---------------------------------------------------------------------------
-- NÃO SAI DE `landing_events`, E NÃO PODERIA SAIR. Aquela tabela não liga a
-- usuário nenhum POR CONSTRUÇÃO: sem id, sem IP, sem cookie, sem user agent —
-- decisão registrada no `comment on table` dela e no cabeçalho de
-- `modules/capture/events.ts`. Ela responde "quantos acessos daquela origem
-- viraram cadastro", em agregado e sem dado pessoal, e continua intocada.
--
-- Este funil é outra pergunta, sobre contas que JÁ EXISTEM, e sai das tabelas
-- que já as descrevem: `profiles`, `kennels`, `dogs`.
-- ---------------------------------------------------------------------------
-- POR QUE UMA FUNÇÃO, e não contagens pelo PostgREST: três dos cinco números
-- são `count(distinct owner_id)`, que o PostgREST não expressa. A alternativa
-- seria baixar o `owner_id` de TODO cão da base e deduplicar na aplicação —
-- listagem sem teto, contra a invariante de performance do projeto, num
-- universo que os próprios testes de carga daqui dimensionam em dezenas de
-- milhares de linhas.
-- ---------------------------------------------------------------------------
-- O FUNIL NÃO É ANINHADO, e é por isso que cada etapa é contada contra o TOTAL
-- em vez de contra a anterior. `dogs.kennel_id` é NULLABLE e o formulário de
-- cão permite cadastrar sem canil, então "tem cão" NÃO é subconjunto de "tem
-- canil": existe criador com cão e sem canil. Só `cão publicado ⊂ cão` e
-- `qualquer etapa ⊂ criadores` são garantidos. Quem apresentar isto como funil
-- clássico vai contar como conversão quem pulou a etapa.
-- =============================================================================

create or replace function public.admin_user_funnel()
returns table (
  total              bigint,
  with_kennel        bigint,
  with_dog           bigint,
  with_published_dog bigint,
  with_kennel_no_dog bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- A guarda mora AQUI, não só na rota. A rota já barra não-admin, mas a
  -- função é chamável por qualquer sessão autenticada via PostgREST — e um
  -- criador comum não pode ler quantos usuários a plataforma tem.
  if not private.is_admin() then
    raise exception 'apenas um admin pode ler o funil de ativação'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with criadores as (
    -- role = 'user': conta de ADMIN nunca vai cadastrar cão, e numa base
    -- pequena cada uma delas puxaria a taxa para baixo sem significar nada.
    select p.id
      from public.profiles p
     where p.role = 'user'
       and p.deleted_at is null
  ),
  com_canil as (
    -- `distinct` mesmo com `kennels_owner_uk` garantindo um canil vivo por
    -- dono: o índice é parcial por `deleted_at`, e depender dele aqui deixaria
    -- esta contagem refém de uma invariante que vive noutro arquivo.
    select distinct k.owner_id as id
      from public.kennels k
     where k.deleted_at is null
       and k.owner_id is not null
  ),
  com_cao as (
    -- `owner_id is not null` exclui o ANCESTRAL FANTASMA, e é o recorte certo:
    -- fantasma é nó de árvore de outra pessoa, não cão cadastrado por alguém.
    select distinct d.owner_id as id
      from public.dogs d
     where d.deleted_at is null
       and d.owner_id is not null
  ),
  com_cao_publicado as (
    select distinct d.owner_id as id
      from public.dogs d
     where d.deleted_at is null
       and d.owner_id is not null
       and d.published_at is not null
  )
  -- TODA contagem é interseção com `criadores`, nunca `count` solto na tabela:
  -- cão de perfil excluído, ou de admin, não pode inflar etapa nenhuma.
  select
    (select count(*) from criadores),
    (select count(*) from criadores c where exists (select 1 from com_canil x where x.id = c.id)),
    (select count(*) from criadores c where exists (select 1 from com_cao x where x.id = c.id)),
    (select count(*) from criadores c
      where exists (select 1 from com_cao_publicado x where x.id = c.id)),
    -- A evasão acionável: cadastrou o canil e parou ali. Bem definida mesmo
    -- com o funil não sendo aninhado.
    (select count(*) from criadores c
      where exists (select 1 from com_canil x where x.id = c.id)
        and not exists (select 1 from com_cao y where y.id = c.id));
end;
$$;

comment on function public.admin_user_funnel() is
  'Funil de ativação do criador (criadores → canil → primeiro cão → cão publicado), só para admin. Derivado de profiles/kennels/dogs; NÃO usa landing_events, que é anônima por construção. Etapas contadas contra o total, não em cadeia: cão sem canil é estado válido, então o funil não é aninhado.';

-- `revoke from public` não é redundante: função em `public` nasce com EXECUTE
-- para PUBLIC, e `anon` herda daí — mordida real já registrada neste projeto
-- (`revoke_dog_descendants_from_anon`).
revoke execute on function public.admin_user_funnel() from public, anon;
grant execute on function public.admin_user_funnel() to authenticated;
