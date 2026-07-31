-- =============================================================================
-- OrigemX — schema núcleo
--
-- Identidade canônica do cão, canil, perfil e identificadores.
-- Módulos futuros (saúde, eventos, ninhada, financeiro) NÃO entram aqui, nem
-- "preparados": tabela vazia é dívida, não preparo.
--
-- As invariantes do CLAUDE.md são garantidas AQUI, no banco, não na aplicação.
-- Um cliente que fale direto com o Postgres continua sem conseguir violá-las.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------

-- Busca por nome de cão e de canil é ILIKE '%termo%'. Sem trigram, isso é
-- sempre seq scan; com trigram, é índice.
create extension if not exists pg_trgm with schema extensions;

-- Schema para helpers que NÃO podem virar endpoint da Data API.
-- Só o necessário é concedido em 0002 (rls_policies).
create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Funções utilitárias
-- -----------------------------------------------------------------------------

-- updated_at nunca é responsabilidade do client: ele mentiria, esqueceria ou
-- divergiria entre caminhos de escrita.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger BEFORE UPDATE: mantém updated_at fora do alcance do client.';

-- Identificador público e opaco do cão — é o alvo do QR Code impresso.
--
-- Alfabeto de 31 caracteres sem os ambíguos (0/O, 1/l/I): o número vai ser lido
-- por gente, em papel, e digitado errado se houver ambiguidade.
-- 31^12 ~ 7,9e17 combinações, colisão desprezível e coberta pelo índice único.
--
-- NÃO é segredo: o perfil para onde aponta é público por design. Ninguém deve
-- tratar este valor como capability ou token de acesso.
create or replace function public.gen_public_id()
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  result text := '';
  i int;
begin
  for i in 1..12 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

comment on function public.gen_public_id() is
  'Gera o public_id opaco do cão (12 chars, alfabeto sem caracteres ambíguos).';

-- -----------------------------------------------------------------------------
-- profiles — espelha auth.users
-- -----------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'user',
  full_name   text,
  phone       text,
  city        text,
  state       text,
  bio         text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint profiles_role_valid check (role in ('user', 'admin'))
);

comment on table public.profiles is
  'Dados do criador. Espelha auth.users 1:1 pelo id.';
comment on column public.profiles.role is
  'Autorização. NUNCA populado a partir de user_metadata: aquele campo é editável pelo próprio usuário e viraria escalonamento de privilégio.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria o profile no signup. SECURITY DEFINER porque roda no contexto do
-- Supabase Auth, antes de existir sessão do usuário.
--
-- `role` é deliberadamente omitido: fica no default 'user'. Se viesse de
-- raw_user_meta_data, qualquer um viraria admin no cadastro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- kennels — canil
-- -----------------------------------------------------------------------------

create table public.kennels (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete restrict,
  name         text not null,
  slug         text not null,
  description  text,
  city         text,
  state        text,
  logo_url     text,
  website_url  text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint kennels_name_not_blank check (length(btrim(name)) > 0),
  constraint kennels_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint kennels_slug_length check (length(slug) between 3 and 60)
);

comment on table public.kennels is 'Canil. Um criador pode ter mais de um.';
comment on column public.kennels.owner_id is
  'ON DELETE RESTRICT: perfil com canil não some. Some o canil primeiro, e mesmo assim logicamente (deleted_at).';

-- UNIQUE GLOBAL, e de propósito NÃO parcial por deleted_at.
--
-- Se o índice fosse `where deleted_at is null`, excluir logicamente um canil
-- liberaria o slug para outra pessoa — e todo QR Code impresso apontando para
-- aquela URL passaria a resolver para o canil errado. Slug queimado é slug
-- queimado.
create unique index kennels_slug_key on public.kennels (slug);

create index kennels_owner_id_idx on public.kennels (owner_id) where deleted_at is null;
create index kennels_created_by_idx on public.kennels (created_by);
create index kennels_name_trgm_idx on public.kennels using gin (name extensions.gin_trgm_ops);
-- Paginação por keyset (created_at, id). Ver src/lib/pagination.ts.
create index kennels_created_at_idx
  on public.kennels (created_at desc, id desc) where deleted_at is null;

create trigger kennels_set_updated_at
  before update on public.kennels
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- dogs — identidade canônica do cão
-- -----------------------------------------------------------------------------

create table public.dogs (
  id          uuid primary key default gen_random_uuid(),
  public_id   text not null default public.gen_public_id(),
  slug        text not null,

  name        text not null,
  sex         text not null,
  born_on     date,
  breed       text not null,
  color       text,
  coat        text,

  kennel_id   uuid references public.kennels (id) on delete set null,
  owner_id    uuid references public.profiles (id) on delete set null,

  sire_id     uuid references public.dogs (id) on delete restrict,
  dam_id      uuid references public.dogs (id) on delete restrict,

  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint dogs_sex_valid check (sex in ('male', 'female')),
  constraint dogs_name_not_blank check (length(btrim(name)) > 0),
  constraint dogs_breed_not_blank check (length(btrim(breed)) > 0),
  constraint dogs_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint dogs_slug_length check (length(slug) between 2 and 80),
  constraint dogs_public_id_format check (public_id ~ '^[2-9a-hjkmnp-z]{12}$'),

  -- Pedidos explicitamente. Pegam só o caso de 1 nível; ciclo de 2+ níveis
  -- (avô que é neto) é impossível em CHECK, porque exigiria consultar outras
  -- linhas. Isso fica no trigger dogs_check_ancestry() abaixo.
  constraint dogs_not_own_sire check (id <> sire_id),
  constraint dogs_not_own_dam check (id <> dam_id),
  constraint dogs_sire_dam_distinct
    check (sire_id is null or dam_id is null or sire_id <> dam_id)
);

comment on table public.dogs is
  'Identidade canônica do cão. Ancestral é SEMPRE uma linha aqui, referenciada por sire_id/dam_id — nunca dados copiados dentro do descendente.';
comment on column public.dogs.public_id is
  'Identificador estável e imutável. É o que o QR Code impresso carrega. Protegido contra UPDATE pelo trigger dogs_freeze_public_id.';
comment on column public.dogs.slug is
  'URL legível, EDITÁVEL. Corrigir um nome digitado errado mexe aqui, nunca no public_id.';
comment on column public.dogs.kennel_id is
  'NULLABLE: ancestral cadastrado só para compor pedigree não tem canil.';
comment on column public.dogs.owner_id is
  'NULLABLE: ancestral pode não ter dono cadastrado na plataforma.';
comment on column public.dogs.sire_id is
  'Pai. ON DELETE RESTRICT protege o pedigree do descendente.';

create unique index dogs_public_id_key on public.dogs (public_id);
create unique index dogs_slug_key on public.dogs (slug);

create index dogs_owner_id_idx on public.dogs (owner_id) where deleted_at is null;
create index dogs_created_by_idx on public.dogs (created_by);
create index dogs_breed_idx on public.dogs (breed) where deleted_at is null;
create index dogs_name_trgm_idx on public.dogs using gin (name extensions.gin_trgm_ops);

-- Índice da FK kennel_id E da listagem paginada do canil, em um só: kennel_id
-- é a coluna líder, então serve aos dois usos.
create index dogs_kennel_created_idx
  on public.dogs (kennel_id, created_at desc, id desc) where deleted_at is null;

-- Estes DOIS não são parciais, ao contrário dos de cima.
-- O trigger de ciclo e a travessia de pedigree precisam enxergar ancestrais
-- logicamente excluídos: um ancestral com deleted_at continua sendo ancestral,
-- e ignorá-lo abriria caminho para criar um ciclo por baixo do pano.
create index dogs_sire_id_idx on public.dogs (sire_id);
create index dogs_dam_id_idx on public.dogs (dam_id);

create trigger dogs_set_updated_at
  before update on public.dogs
  for each row execute function public.set_updated_at();

-- --- public_id é imutável ----------------------------------------------------

create or replace function public.dogs_freeze_public_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'public_id é imutável (cão %): QR Code já impresso passaria a apontar para o lugar errado',
    old.id
    using errcode = 'restrict_violation';
end;
$$;

-- O WHEN já filtra, então a função só roda quando alguém realmente tentou.
create trigger dogs_freeze_public_id
  before update on public.dogs
  for each row
  when (new.public_id is distinct from old.public_id)
  execute function public.dogs_freeze_public_id();

-- --- integridade da genealogia -----------------------------------------------

-- SECURITY DEFINER de propósito: precisa enxergar TODOS os ancestrais, inclusive
-- os que a RLS do usuário esconderia. Um ancestral invisível é um ancestral não
-- verificado, e o ciclo passaria.
create or replace function public.dogs_check_ancestry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sex   text;
  v_cycle boolean;
begin
  -- Sexo do progenitor. Pai é macho, mãe é fêmea; não dá para expressar isso
  -- em CHECK porque depende de outra linha.
  if new.sire_id is not null then
    select d.sex into v_sex from public.dogs d where d.id = new.sire_id;
    if v_sex is distinct from 'male' then
      raise exception 'sire_id (%) precisa referenciar um cão macho', new.sire_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.dam_id is not null then
    select d.sex into v_sex from public.dogs d where d.id = new.dam_id;
    if v_sex is distinct from 'female' then
      raise exception 'dam_id (%) precisa referenciar uma cadela', new.dam_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.sire_id is null and new.dam_id is null then
    return new;
  end if;

  -- Sobe a árvore a partir dos pais. Se o próprio cão reaparecer lá em cima,
  -- é ciclo.
  --
  -- UNION e não UNION ALL, e isso é o detalhe que importa: linebreeding é
  -- LEGÍTIMO — o mesmo ancestral aparece em vários caminhos de propósito.
  -- A deduplicação faz a recursão terminar sem confundir ancestral repetido
  -- com ciclo.
  --
  -- O termo recursivo evita `unnest` de propósito: o Postgres impõe restrições
  -- ao que pode aparecer ali, e set-returning function nessa posição é terreno
  -- incerto. `cross join (values (1),(2))` produz o mesmo "pai e mãe" usando só
  -- join comum, que é seguro.
  with recursive ancestors (id) as (
      select p.id
        from unnest(array[new.sire_id, new.dam_id]) as p (id)
       where p.id is not null
    union
      select case when side.n = 1 then d.sire_id else d.dam_id end
        from ancestors a
        join public.dogs d on d.id = a.id
        cross join (values (1), (2)) as side (n)
       where case when side.n = 1 then d.sire_id else d.dam_id end is not null
  )
  select exists (select 1 from ancestors where id = new.id) into v_cycle;

  if v_cycle then
    raise exception 'ciclo genealógico: o cão % apareceria como ancestral de si mesmo', new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger dogs_check_ancestry
  before insert or update of sire_id, dam_id on public.dogs
  for each row execute function public.dogs_check_ancestry();

-- Trocar o sexo de um cão que já é pai/mãe de alguém quebraria a regra acima
-- pelo outro lado, sem passar pelo trigger anterior.
create or replace function public.dogs_guard_sex_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.dogs d
     where d.sire_id = new.id or d.dam_id = new.id
  ) then
    raise exception
      'não é possível mudar o sexo do cão %: ele já consta como progenitor em outro pedigree',
      new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger dogs_guard_sex_change
  before update on public.dogs
  for each row
  when (new.sex is distinct from old.sex)
  execute function public.dogs_guard_sex_change();

-- -----------------------------------------------------------------------------
-- dog_identifiers — registro, microchip, tatuagem
--
-- Entra agora, sem tela, porque deduplicação segura depende de identificador
-- externo. Descobrir depois que dois registros são o mesmo cão custa muito mais
-- caro do que uma tabela.
-- -----------------------------------------------------------------------------

create table public.dog_identifiers (
  id          uuid primary key default gen_random_uuid(),
  dog_id      uuid not null references public.dogs (id) on delete cascade,
  kind        text not null,
  issuer      text,
  value       text not null,
  is_primary  boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint dog_identifiers_kind_valid
    check (kind in ('registration', 'microchip', 'tattoo')),
  constraint dog_identifiers_value_not_blank check (length(btrim(value)) > 0),
  -- Número de registro sem entidade emissora não identifica nada: o mesmo
  -- número existe em CBKC, FCI e AKC apontando para cães diferentes.
  constraint dog_identifiers_issuer_required
    check (kind <> 'registration' or (issuer is not null and length(btrim(issuer)) > 0))
);

comment on table public.dog_identifiers is
  'Identificadores externos do cão. Base da deduplicação — sem tela nesta fase.';
comment on column public.dog_identifiers.dog_id is
  'ON DELETE CASCADE é rede de segurança: cão nunca sofre DELETE físico (invariante), então na prática não dispara.';

create index dog_identifiers_dog_id_idx
  on public.dog_identifiers (dog_id) where deleted_at is null;
create index dog_identifiers_created_by_idx on public.dog_identifiers (created_by);
create index dog_identifiers_value_idx
  on public.dog_identifiers (btrim(value)) where deleted_at is null;

-- Deduplicação. Normaliza caixa e espaço antes de comparar: "BR 123/45" e
-- "br 123/45  " são o mesmo registro digitado por duas pessoas.
create unique index dog_identifiers_registration_uk
  on public.dog_identifiers (issuer, upper(btrim(value)))
  where deleted_at is null and kind = 'registration';

-- Microchip é único no mundo, independente de emissor.
create unique index dog_identifiers_microchip_uk
  on public.dog_identifiers (btrim(value))
  where deleted_at is null and kind = 'microchip';

-- No máximo um identificador principal por tipo, por cão.
create unique index dog_identifiers_one_primary_uk
  on public.dog_identifiers (dog_id, kind)
  where deleted_at is null and is_primary;

create trigger dog_identifiers_set_updated_at
  before update on public.dog_identifiers
  for each row execute function public.set_updated_at();
