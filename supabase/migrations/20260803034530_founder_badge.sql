-- =============================================================================
-- OrigemX — selo "Criador Fundador"
--
-- 100 canis fundadores, numerados de 1 a 100, atribuídos na ordem em que os
-- canis se tornam elegíveis. Imutável e intransferível.
--
-- =============================================================================
-- ATOMICIDADE E LIMITE SÃO O MESMO MECANISMO
-- =============================================================================
--
-- A abordagem ingênua tem uma corrida clássica:
--
--     if (select count(*) from kennels where founder_number is not null) < 100
--     then update kennels set founder_number = <count+1> ...
--
-- Duas transações leem 99 juntas, ambas passam, e saem 100 e 101 — ou o mesmo
-- número duas vezes. O defeito é LER e depois ESCREVER.
--
-- A sequence abaixo elimina a janela porque não há leitura prévia:
--
--   * `nextval` é atômico e nunca devolve o mesmo valor duas vezes, mesmo com N
--     transações simultâneas. Dois canis elegíveis no mesmo instante recebem 42
--     e 43, nunca 42 e 42.
--   * `maxvalue 100 no cycle` faz a 101ª chamada levantar 2200H
--     (sequence_generator_limit_exceeded) — verificado neste Postgres, não
--     suposto. Não existe contador lido em separado para perder a corrida.
--
-- O objeto que distribui os números é o mesmo que se recusa a distribuir o 101º.
--
-- CUSTO, DECLARADO: `nextval` NÃO é transacional. Um rollback não devolve o
-- número, então uma transação que pega o 42 e aborta queima o 42, e o pool
-- renderia 99 selos. Por isso `nextval` é a ÚLTIMA operação da função: depois
-- dele sobra só um UPDATE por chave primária, que não tem como violar
-- constraint. Sobra o risco de a transação EXTERNA abortar depois do trigger —
-- nesta aplicação cada mutação é um statement único, então a janela é mínima.
--
-- Alternativa descartada: advisory lock + count. É livre de lacunas, mas
-- serializa e não usa SEQUENCE, que é exigência do produto.
-- =============================================================================

alter table public.kennels
  add column founder_number integer;

comment on column public.kennels.founder_number is
  'Selo Criador Fundador, 1 a 100. Atribuído por try_assign_founder_number, imutável depois de gravado. NULL = sem selo.';

-- Unicidade global, e NÃO parcial por deleted_at: excluir o canil logicamente
-- não devolve o número ao pool. Era a regra aprovada, e o índice é o que a
-- garante mesmo se alguém escrever fora da aplicação.
create unique index kennels_founder_number_key on public.kennels (founder_number);

-- Intervalo válido no próprio banco. A sequence já não passa de 100, mas isto
-- protege contra escrita direta.
alter table public.kennels
  add constraint kennels_founder_number_range
  check (founder_number is null or (founder_number between 1 and 100));

-- NUNCA identity nem serial: os dois atribuiriam valor a TODA linha, dando selo
-- a todo canil. Esta sequence é chamada explicitamente, e só quando a regra de
-- corte permite.
create sequence public.kennel_founder_seq
  as integer
  start with 1
  increment by 1
  minvalue 1
  maxvalue 100
  no cycle;

comment on sequence public.kennel_founder_seq is
  'Numeração do selo Criador Fundador. maxvalue 100 é o que impõe o limite sob concorrência.';

-- Ninguém chama isto de fora. A atribuição é sempre pela função.
revoke all on sequence public.kennel_founder_seq from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Elegibilidade
--
-- Nome, cidade, estado, logo e ao menos um cão. Cadastro incompleto não consome
-- número — é o que impede o pool de 100 evaporar em canis vazios.
-- -----------------------------------------------------------------------------

create or replace function public.kennel_is_founder_eligible(p_kennel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.kennels k
     where k.id = p_kennel_id
       and k.deleted_at is null
       and length(btrim(coalesce(k.name, ''))) > 0
       and length(btrim(coalesce(k.city, ''))) > 0
       and length(btrim(coalesce(k.state, ''))) > 0
       and exists (
         select 1 from public.media m
          where m.kennel_id = k.id
            and m.role = 'kennel_logo'
            and m.deleted_at is null
       )
       and exists (
         select 1 from public.dogs d
          where d.kennel_id = k.id
            and d.deleted_at is null
       )
  );
$$;

comment on function public.kennel_is_founder_eligible(uuid) is
  'Critério do selo: nome, cidade, estado, logo e ao menos um cão. SECURITY DEFINER para enxergar mídia e cães que a RLS do chamador esconderia.';

revoke execute on function public.kennel_is_founder_eligible(uuid) from public, anon;
grant execute on function public.kennel_is_founder_eligible(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Atribuição
-- -----------------------------------------------------------------------------

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
  -- TRAVA A LINHA antes de qualquer decisão. Sem isto, upload de logo e
  -- cadastro de cão acontecendo no mesmo instante para o MESMO canil entrariam
  -- os dois e pegariam dois números — um deles perdido para sempre.
  select k.founder_number into v_existing
    from public.kennels k
   where k.id = p_kennel_id
     and k.deleted_at is null
   for update;

  if not found then
    return null;
  end if;

  -- Imutável: quem já tem, mantém. Também evita queimar número em re-disparo.
  if v_existing is not null then
    return v_existing;
  end if;

  if not public.kennel_is_founder_eligible(p_kennel_id) then
    return null;
  end if;

  -- ÚLTIMA operação antes do UPDATE, de propósito: ver o cabeçalho.
  begin
    v_number := nextval('public.kennel_founder_seq');
  exception
    -- 2200H: sequence esgotada. Pool de 100 acabou.
    --
    -- Devolver NULL em vez de propagar é o comportamento pedido: o 101º canil
    -- se cadastra normalmente, apenas sem selo. Propagar abortaria o INSERT do
    -- cão ou do logo que disparou este trigger.
    when sqlstate '2200H' then
      return null;
  end;

  update public.kennels
     set founder_number = v_number
   where id = p_kennel_id;

  return v_number;
end;
$$;

comment on function public.try_assign_founder_number(uuid) is
  'Atribui o selo se o canil for elegível e houver número no pool. Devolve NULL quando não há selo a dar — esgotamento não é erro.';

revoke execute on function public.try_assign_founder_number(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Imutabilidade
--
-- Bloqueia valor -> qualquer coisa. NULL -> valor continua permitido, porque é
-- exatamente o caminho da atribuição.
--
-- Isto sozinho NÃO impede o usuário de escolher o próprio número: NULL -> 1
-- passaria. Quem fecha essa porta é o GRANT por coluna, mais abaixo.
-- -----------------------------------------------------------------------------

create or replace function public.kennels_freeze_founder_number()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'O selo Criador Fundador é imutável e intransferível (canil %, número %)',
    old.id, old.founder_number
    using errcode = 'restrict_violation';
end;
$$;

revoke execute on function public.kennels_freeze_founder_number() from public, anon, authenticated;

create trigger kennels_freeze_founder_number
  before update on public.kennels
  for each row
  when (old.founder_number is not null and new.founder_number is distinct from old.founder_number)
  execute function public.kennels_freeze_founder_number();

-- -----------------------------------------------------------------------------
-- Disparo
--
-- A elegibilidade depende de três tabelas, então as três disparam. A função
-- retorna cedo quando o canil já tem número ou não é elegível, então o custo em
-- cada INSERT de cão é uma leitura indexada.
-- -----------------------------------------------------------------------------

create or replace function public.trg_assign_founder_from_kennel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.try_assign_founder_number(new.id);
  return null;
end;
$$;

create or replace function public.trg_assign_founder_from_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kennel_id is not null and new.role = 'kennel_logo' then
    perform public.try_assign_founder_number(new.kennel_id);
  end if;
  return null;
end;
$$;

create or replace function public.trg_assign_founder_from_dog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kennel_id is not null then
    perform public.try_assign_founder_number(new.kennel_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.trg_assign_founder_from_kennel() from public, anon, authenticated;
revoke execute on function public.trg_assign_founder_from_media() from public, anon, authenticated;
revoke execute on function public.trg_assign_founder_from_dog() from public, anon, authenticated;

create trigger kennels_assign_founder
  after insert or update of name, city, state on public.kennels
  for each row execute function public.trg_assign_founder_from_kennel();

create trigger media_assign_founder
  after insert on public.media
  for each row execute function public.trg_assign_founder_from_media();

create trigger dogs_assign_founder
  after insert or update of kennel_id on public.dogs
  for each row execute function public.trg_assign_founder_from_dog();

-- -----------------------------------------------------------------------------
-- GRANT por coluna
--
-- Hoje `kennels` tem GRANT de UPDATE no nível da TABELA, então um usuário
-- autenticado consegue `update kennels set founder_number = 1` no próprio
-- canil. O trigger de imutabilidade não cobre isso, porque NULL -> valor é
-- justamente o caminho legítimo da atribuição.
--
-- A defesa é o privilégio de coluna: `founder_number` fica fora da lista, e o
-- Postgres recusa antes mesmo de a policy ser avaliada. Mesma técnica usada em
-- `profiles.role` na migration de RLS.
-- -----------------------------------------------------------------------------

revoke update on public.kennels from authenticated;

grant update (
  name,
  slug,
  description,
  city,
  state,
  logo_url,
  website_url,
  published_at,
  deleted_at
) on public.kennels to authenticated;

-- -----------------------------------------------------------------------------
-- Backfill
--
-- Sem isto, um canil que JÁ é elegível ficaria sem selo até alguém tocá-lo de
-- novo — pareceria bug. A ordem real de elegibilidade não é recuperável
-- retroativamente; `created_at` do canil é a melhor aproximação.
--
-- No projeto do cliente, que nasce vazio, isto é no-op.
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select k.id
      from public.kennels k
     where k.deleted_at is null
       and k.founder_number is null
     order by k.created_at, k.id
  loop
    perform public.try_assign_founder_number(r.id);
  end loop;
end $$;
