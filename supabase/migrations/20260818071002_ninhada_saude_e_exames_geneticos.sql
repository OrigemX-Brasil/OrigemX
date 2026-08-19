-- =============================================================================
-- OrigemX — saúde do filhote e exames genéticos do reprodutor (Fase 3)
--
-- ---------------------------------------------------------------------------
-- POR QUE AS DUAS TABELAS PENDURAM NO CÃO, E NÃO NA NINHADA
-- ---------------------------------------------------------------------------
-- É o mesmo argumento que fez o filhote nascer em `dogs`: o histórico segue o
-- ANIMAL. A vacina que o filhote tomou continua sendo dele depois de vendido,
-- quando a ninhada já não interessa a ninguém. Pendurar na ninhada obrigaria a
-- migrar o registro no dia da venda — cópia de dado entre tabelas, de novo.
--
-- Consequência boa e de graça: o exame genético do reprodutor é cadastrado UMA
-- vez, no perfil dele, e aparece em TODA ninhada em que ele for pai. É
-- literalmente o pedido — "importados do perfil dos pais, não digitados de novo
-- na ninhada" — e sai sem nenhuma máquina de importação: a página da ninhada
-- lê dog_genetic_tests por sire_id/dam_id.
--
-- ---------------------------------------------------------------------------
-- POR QUE DUAS TABELAS E NÃO UMA COM `kind`
-- ---------------------------------------------------------------------------
-- São fatos de natureza diferente. Exame genético é permanente, sem data de
-- aplicação, e tem RESULTADO — é o que um comprador lê para avaliar o
-- cruzamento. Vermífugo/vacina é log datado de tratamento, sem resultado, e
-- interessa a quem vai cuidar do filhote. Unificar produziria uma coluna
-- `result` nula em quase toda linha, mais um CHECK explicando quando ela vale.
-- Duas tabelas pequenas custam menos que uma ambígua.
--
-- ---------------------------------------------------------------------------
-- POR QUE `name`/`result`/`product` SÃO TEXTO LIVRE
-- ---------------------------------------------------------------------------
-- O catálogo de exames varia por raça (L2HGA e HC em Staffordshire, displasia
-- em quase todas, e o resto muda), e o formato do resultado varia por exame:
-- displasia é grau ('A/A', 'B'), teste de DNA é estado ('Livre', 'Portador').
-- Um CHECK fechado aqui erra na primeira raça nova e TRAVA o criador, que não
-- tem como contornar. A UI oferece <datalist> com os valores comuns; o banco
-- aceita o que o laudo disser. Também mantém o projeto sem nenhum CREATE TYPE,
-- como está desde o começo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- dog_health_records — vermífugo e vacina, REPETÍVEL
-- -----------------------------------------------------------------------------

create table public.dog_health_records (
  id          uuid primary key default gen_random_uuid(),
  dog_id      uuid not null references public.dogs (id) on delete cascade,

  kind        text not null,
  applied_on  date not null,
  product     text,
  notes       text,

  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint dog_health_records_kind_valid
    check (kind in ('deworming', 'vaccine')),

  -- Tipo da vacina é obrigatório; marca do vermífugo não. Espelha o raciocínio
  -- de `dog_identifiers_issuer_required`: "vacinado em 12/08" sem dizer contra
  -- o quê não informa nada a quem vai comprar o filhote, enquanto "vermifugado
  -- em 10/08" já é a informação inteira — a marca é detalhe que o criador pode
  -- honestamente não lembrar.
  constraint dog_health_records_vaccine_needs_product
    check (kind <> 'vaccine' or (product is not null and char_length(btrim(product)) > 0)),

  -- Mesmo par de metades dos CHECKs de texto do projeto (media.caption,
  -- kennel_litters.description): btrim barra vazio/só-espaço, a medida CRUA
  -- barra o texto no limite cercado de espaços.
  constraint dog_health_records_product_len
    check (product is null or (char_length(btrim(product)) > 0 and char_length(product) <= 80)),
  constraint dog_health_records_notes_len
    check (notes is null or (char_length(btrim(notes)) > 0 and char_length(notes) <= 280))
);

comment on table public.dog_health_records is
  'Histórico de vermífugo e vacina do cão. REPETÍVEL: é log, não campo único — o filhote toma várias doses.';
comment on column public.dog_health_records.product is
  'Marca/produto do vermífugo, ou tipo da vacina (V8, V10, antirrábica). Texto livre: o catálogo muda e um enum travaria o criador.';

create index dog_health_records_dog_id_idx
  on public.dog_health_records (dog_id, applied_on desc)
  where deleted_at is null;

create trigger dog_health_records_set_updated_at
  before update on public.dog_health_records
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- dog_genetic_tests — exames do reprodutor
-- -----------------------------------------------------------------------------

create table public.dog_genetic_tests (
  id          uuid primary key default gen_random_uuid(),
  dog_id      uuid not null references public.dogs (id) on delete cascade,

  name        text not null,
  result      text not null,
  tested_on   date,
  lab         text,

  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint dog_genetic_tests_name_len
    check (char_length(btrim(name)) > 0 and char_length(name) <= 80),
  constraint dog_genetic_tests_result_len
    check (char_length(btrim(result)) > 0 and char_length(result) <= 40),
  constraint dog_genetic_tests_lab_len
    check (lab is null or (char_length(btrim(lab)) > 0 and char_length(lab) <= 80))
);

-- SEM índice único por (dog_id, name): reavaliação é legítima. Displasia é
-- laudada de novo quando o cão amadurece, e as duas leituras são fatos com
-- datas diferentes. Duplicata por engano é problema de UI, não de integridade —
-- e um único que bloqueasse o relaudo custaria mais do que resolve.
comment on table public.dog_genetic_tests is
  'Exames genéticos/laudos do cão (displasia, L2HGA, HC...). Lidos pela página da ninhada a partir de sire_id/dam_id — nunca digitados na ninhada.';
comment on column public.dog_genetic_tests.result is
  'Resultado como está no laudo: grau (A/A, B) ou estado (Livre, Portador, Afetado). Texto livre porque o formato depende do exame.';

create index dog_genetic_tests_dog_id_idx
  on public.dog_genetic_tests (dog_id, tested_on desc nulls last)
  where deleted_at is null;

create trigger dog_genetic_tests_set_updated_at
  before update on public.dog_genetic_tests
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — as duas, mesma forma
--
-- A VISIBILIDADE PÚBLICA É DELEGADA, NÃO REDERIVADA. `exists (select 1 from
-- public.dogs d where d.id = dog_id)` roda com a RLS de quem consulta, então a
-- subconsulta só devolve linha quando `dogs_select` deixaria aquele cão ser
-- visto. É a mesma técnica que `media_select` usa desde ninhadas_do_canil, e é
-- o que evita ter uma segunda cópia da regra de publicação (dog_is_public com
-- seus cinco argumentos) para divergir na próxima mudança.
--
-- Consequência pretendida: saúde do filhote e exame do reprodutor ficam
-- públicos exatamente quando o CÃO fica público. A página da ninhada precisa
-- disso — quem escaneia o QR ou abre /n/[public_id] é anônimo.
--
-- Contraste deliberado com `dog_identifiers`, que NÃO tem grant para `anon`:
-- microchip é dado de rastreio e continua privado. Registro CBKC do filhote
-- segue a mesma regra e não vaza por esta migration.
--
-- A primeira metade do USING (`deleted_at is null or can_manage_dog`) é a
-- vacina contra o bug que o projeto já pagou duas vezes (fix_media_select_
-- soft_delete, fix_dog_videos_select_soft_delete): um `deleted_at is null` sem
-- exceção torna a própria exclusão lógica impossível, porque o UPDATE...
-- RETURNING do PostgREST reexecuta a policy de SELECT sobre a linha resultante.
-- -----------------------------------------------------------------------------

alter table public.dog_health_records enable row level security;
revoke all on public.dog_health_records from anon, authenticated;
grant select on public.dog_health_records to anon, authenticated;
grant insert, update on public.dog_health_records to authenticated;

alter table public.dog_genetic_tests enable row level security;
revoke all on public.dog_genetic_tests from anon, authenticated;
grant select on public.dog_genetic_tests to anon, authenticated;
grant insert, update on public.dog_genetic_tests to authenticated;
-- Sem DELETE em nenhuma das duas: exclusão é sempre lógica.

create policy dog_health_records_select
  on public.dog_health_records for select
  to anon, authenticated
  using (
    (deleted_at is null or private.can_manage_dog(dog_id))
    and exists (select 1 from public.dogs d where d.id = dog_id)
  );

create policy dog_health_records_insert
  on public.dog_health_records for insert
  to authenticated
  with check (
    private.can_manage_dog(dog_id)
    and (created_by is null or created_by = (select auth.uid()))
    and not (select private.is_suspended())
  );

create policy dog_health_records_update
  on public.dog_health_records for update
  to authenticated
  using (private.can_manage_dog(dog_id) and not (select private.is_suspended()))
  with check (private.can_manage_dog(dog_id) and not (select private.is_suspended()));

create policy dog_genetic_tests_select
  on public.dog_genetic_tests for select
  to anon, authenticated
  using (
    (deleted_at is null or private.can_manage_dog(dog_id))
    and exists (select 1 from public.dogs d where d.id = dog_id)
  );

create policy dog_genetic_tests_insert
  on public.dog_genetic_tests for insert
  to authenticated
  with check (
    private.can_manage_dog(dog_id)
    and (created_by is null or created_by = (select auth.uid()))
    and not (select private.is_suspended())
  );

create policy dog_genetic_tests_update
  on public.dog_genetic_tests for update
  to authenticated
  using (private.can_manage_dog(dog_id) and not (select private.is_suspended()))
  with check (private.can_manage_dog(dog_id) and not (select private.is_suspended()));
