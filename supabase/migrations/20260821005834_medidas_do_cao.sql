-- =============================================================================
-- OrigemX — peso e cernelha viram histórico datado (dog_measurements)
--
-- ---------------------------------------------------------------------------
-- POR QUE VIRA TABELA, E NÃO CONTINUA COLUNA ÚNICA
-- ---------------------------------------------------------------------------
-- `dogs.weight_kg`/`dogs.withers_height_cm` (20260815025139) só guardavam o
-- valor ATUAL. O criador quer registrar a EVOLUÇÃO — um filhote pesado toda
-- semana — e isso exige data por medição, não um valor que se sobrescreve.
-- Mesmo argumento de `dog_health_records`: é log, não campo único.
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA TABELA SÓ, COM `kind`, E NÃO DUAS (peso / cernelha)
-- ---------------------------------------------------------------------------
-- Ao contrário de `dog_health_records`/`dog_genetic_tests` (fatos de natureza
-- diferente), peso e cernelha são a MESMA forma de fato — um número com data —
-- só a unidade muda, e a unidade é implícita no `kind`, igual
-- `dog_health_records.kind` já decide o que `product` significa.
--
-- ---------------------------------------------------------------------------
-- BACKFILL — não existe data original
-- ---------------------------------------------------------------------------
-- O valor único nunca teve "data da medição". `updated_at` do cão é a melhor
-- aproximação disponível (não é a data exata, e a `notes` de cada linha
-- migrada diz isso explicitamente) — sem isso, o dado já cadastrado pelo
-- criador desapareceria da nova tela.
-- =============================================================================

create table public.dog_measurements (
  id           uuid primary key default gen_random_uuid(),
  dog_id       uuid not null references public.dogs (id) on delete cascade,

  kind         text not null,
  value        numeric(5,2) not null,
  measured_on  date not null,
  notes        text,

  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint dog_measurements_kind_valid
    check (kind in ('weight', 'withers_height')),
  constraint dog_measurements_value_positive
    check (value > 0),
  constraint dog_measurements_notes_len
    check (notes is null or (char_length(btrim(notes)) > 0 and char_length(notes) <= 280))
);

comment on table public.dog_measurements is
  'Histórico de peso e cernelha do cão. REPETÍVEL: é log com data, não campo único — substitui dogs.weight_kg/withers_height_cm.';
comment on column public.dog_measurements.kind is
  'weight (kg) ou withers_height (cm). A unidade é implícita no tipo, mesmo desenho de dog_health_records.kind/product.';
comment on column public.dog_measurements.value is
  'Kg para weight, cm para withers_height — ver comment de kind.';

create index dog_measurements_dog_id_idx
  on public.dog_measurements (dog_id, measured_on desc)
  where deleted_at is null;

create trigger dog_measurements_set_updated_at
  before update on public.dog_measurements
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — mesma forma de dog_health_records/dog_genetic_tests. Visibilidade
-- pública DELEGADA a dogs_select via `exists`, nunca rederivada.
-- -----------------------------------------------------------------------------

alter table public.dog_measurements enable row level security;
revoke all on public.dog_measurements from anon, authenticated;
grant select on public.dog_measurements to anon, authenticated;
grant insert, update on public.dog_measurements to authenticated;
-- Sem DELETE: exclusão é sempre lógica.

create policy dog_measurements_select
  on public.dog_measurements for select
  to anon, authenticated
  using (
    (deleted_at is null or private.can_manage_dog(dog_id))
    and exists (select 1 from public.dogs d where d.id = dog_id)
  );

create policy dog_measurements_insert
  on public.dog_measurements for insert
  to authenticated
  with check (
    private.can_manage_dog(dog_id)
    and (created_by is null or created_by = (select auth.uid()))
    and not (select private.is_suspended())
  );

create policy dog_measurements_update
  on public.dog_measurements for update
  to authenticated
  using (private.can_manage_dog(dog_id) and not (select private.is_suspended()))
  with check (private.can_manage_dog(dog_id) and not (select private.is_suspended()));

-- -----------------------------------------------------------------------------
-- Backfill — preserva o valor já cadastrado, com nota explícita sobre a data
-- aproximada. `owner_id` como `created_by`: é quem tinha o dado cadastrado; o
-- fantasma sem dono cai em `created_by` nulo, mesmo comportamento de um
-- `created_by` apagado em qualquer outra tabela.
-- -----------------------------------------------------------------------------

insert into public.dog_measurements (dog_id, kind, value, measured_on, notes, created_by)
select id, 'weight', weight_kg, updated_at::date,
       'Migrado do cadastro anterior — data aproximada (última edição do cão).',
       owner_id
from public.dogs
where weight_kg is not null;

insert into public.dog_measurements (dog_id, kind, value, measured_on, notes, created_by)
select id, 'withers_height', withers_height_cm, updated_at::date,
       'Migrado do cadastro anterior — data aproximada (última edição do cão).',
       owner_id
from public.dogs
where withers_height_cm is not null;

-- -----------------------------------------------------------------------------
-- Colunas antigas saem depois do backfill. O grant por coluna
-- (`grant update (titles, weight_kg, withers_height_cm)...`) não precisa ser
-- reemitido: dropar a coluna já derruba o grant dela, e `titles` continua
-- intacto.
-- -----------------------------------------------------------------------------

alter table public.dogs
  drop constraint dogs_weight_kg_positive,
  drop constraint dogs_withers_height_cm_positive,
  drop column weight_kg,
  drop column withers_height_cm;
