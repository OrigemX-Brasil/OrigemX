-- =============================================================================
-- OrigemX — a escotilha do founder_number VAZAVA da função
--
-- Correção de `20260810185938_painel_admin.sql`, encontrada pelo caso 44 da
-- bateria. A migration anterior AFIRMOU, em comentário, uma propriedade que o
-- Postgres não entrega — e o comentário estava errado, não o teste.
--
-- =============================================================================
-- O QUE FOI AFIRMADO, E POR QUE ESTAVA ERRADO
-- =============================================================================
--
-- `admin_set_founder_number` abre a escotilha do trigger de imutabilidade com
--
--     perform set_config('origemx.founder_override', p_kennel_id::text, true);
--
-- e o comentário dizia: "como esta função tem cláusula SET (`search_path = ''`),
-- o Postgres abre um nível de GUC próprio para a chamada e reverte tudo que foi
-- definido nela no retorno".
--
-- MEDIDO: não reverte. Depois da chamada bem-sucedida,
-- `current_setting('origemx.founder_override', true)` ainda devolvia o id do
-- canil. O save/restore que a cláusula SET faz cobre o parâmetro DELA
-- (`search_path`); um valor gravado com `is_local => true` continua valendo até
-- o fim da TRANSAÇÃO, não da função.
--
-- =============================================================================
-- O QUE ISSO SIGNIFICAVA NA PRÁTICA
-- =============================================================================
--
-- Menos do que parece, e mais do que se pode aceitar:
--
--   * PELA APLICAÇÃO, nada. Cada chamada RPC do PostgREST é uma transação
--     própria, que termina no retorno — a GUC morria junto, e nenhuma requisição
--     enxergava a escotilha aberta por outra.
--   * NUM SCRIPT ou em qualquer transação com vários statements, a escotilha
--     ficava aberta para aquele canil pelo resto da transação. Quem já era admin
--     não ganhava poder nenhum que não tivesse (a função é dele), mas a janela
--     existia sem ninguém ter pedido por ela, e "existe sem motivo" é o começo de
--     todo furo.
--
-- O CAMINHO DE ERRO já estava limpo por outro mecanismo: exceção dentro da
-- função aborta a subtransação que contém a chamada inteira, e rollback de
-- subtransação reverte GUC. Era só o caminho de SUCESSO que vazava.
--
-- =============================================================================
-- A CORREÇÃO
-- =============================================================================
--
-- Fechar explicitamente, na linha seguinte ao UPDATE. A escotilha passa a viver
-- por exatamente UM statement — que é o que o desenho sempre quis dizer.
--
-- PL/pgSQL não tem `finally`, então o fechamento explícito cobre o sucesso e o
-- rollback cobre o erro. As duas metades juntas fecham a janela inteira.
--
-- A camada 1 (GRANT de UPDATE por coluna) nunca dependeu disto e segue intacta:
-- mesmo com a escotilha escancarada, `authenticated` não tem privilégio na
-- coluna `founder_number` e é recusado antes de qualquer trigger rodar. É o
-- caso 47 da bateria, e ele passava antes e depois desta correção.
-- =============================================================================

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

  if p_number is not distinct from v_old then
    return v_old;
  end if;

  -- Abre a escotilha para ESTA linha…
  perform set_config('origemx.founder_override', p_kennel_id::text, true);

  begin
    update public.kennels
       set founder_number = p_number
     where id = p_kennel_id;
  exception
    -- O ÍNDICE ÚNICO é o mecanismo, não um `select` prévio de "já existe?" —
    -- esse é o ler-e-depois-escrever que duas correções simultâneas venceriam.
    -- Aqui só se troca a mensagem. A escotilha não precisa ser fechada neste
    -- ramo: o `raise` aborta a subtransação que contém a chamada, e rollback de
    -- subtransação reverte GUC.
    when unique_violation then
      raise exception 'o número % já pertence a outro canil', p_number
        using errcode = 'unique_violation';
  end;

  -- …e FECHA na linha seguinte. Sem isto a escotilha sobreviveria até o fim da
  -- transação — `is_local => true` é escopo de TRANSAÇÃO, não de função, e foi
  -- justamente isso que o caso 44 da bateria flagrou.
  perform set_config('origemx.founder_override', '', true);

  perform private.audit(
    'kennel.founder_number.set',
    'kennel',
    p_kennel_id,
    p_reason,
    jsonb_build_object('de', v_old, 'para', p_number)
  );

  -- A SEQUENCE NÃO PODE FICAR ATRÁS de um número atribuído à mão: senão a
  -- atribuição AUTOMÁTICA colidiria com ele lá na frente, e a colisão estouraria
  -- dentro de `try_assign_founder_number`, abortando o INSERT do cão que a
  -- disparou.
  --
  -- `>=` e não `>`: numa sequence com `is_called = false`, o próximo `nextval`
  -- devolve o próprio `last_value`, não `last_value + 1`.
  --
  -- ÚLTIMA OPERAÇÃO DA FUNÇÃO, pelo mesmo motivo que `nextval` é a última em
  -- `try_assign_founder_number`: `setval` NÃO é transacional. Antes da
  -- auditoria, um motivo em branco abortaria tudo e ainda deixaria a sequence
  -- adiantada.
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
  'Corrige o número do canil, admin-only e auditado. p_number NULL libera o número. A escotilha do trigger de imutabilidade vive por UM statement — aberta e fechada dentro desta função. A unicidade continua garantida pelo índice.';

revoke execute on function public.admin_set_founder_number(uuid, integer, text) from public, anon;
grant execute on function public.admin_set_founder_number(uuid, integer, text) to authenticated;
