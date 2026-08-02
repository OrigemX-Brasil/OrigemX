-- =============================================================================
-- OrigemX — mídia: o banco guarda URL e metadata, o Storage guarda o arquivo
--
-- Invariante do projeto: imagem vai para Storage; banco guarda URL e metadata.
-- NUNCA base64. Esta tabela é o "metadata".
--
-- Tabela ÚNICA para logo de canil e galeria de cão, em vez de uma por dono.
-- O motivo é operacional: armazenamento é o primeiro limite de plano a
-- estourar, e com uma tabela só "quantos bytes este usuário tem" é um
-- `sum(size_bytes) where owner_id = ?`. Com duas seria um UNION que alguém
-- esqueceria de atualizar ao criar a terceira.
--
-- `bucket_id` é coluna, e não constante no código, de propósito: quando a
-- mídia publicada migrar para um bucket público (ou para uma rota de proxy),
-- a mudança é de dado, não de schema.
-- =============================================================================

create table public.media (
  id            uuid primary key default gen_random_uuid(),

  -- Onde o arquivo está. `storage_path` é a chave dentro do bucket.
  bucket_id     text not null default 'kennel-media',
  storage_path  text not null,
  thumb_path    text,

  -- Exatamente um dono. Sem polimorfismo por texto: FK de verdade dos dois
  -- lados, e um CHECK garantindo que só um está preenchido.
  kennel_id     uuid references public.kennels (id) on delete restrict,
  dog_id        uuid references public.dogs (id) on delete restrict,
  role          text not null,

  -- Metadata exigida pela invariante.
  mime          text not null,
  size_bytes    integer not null,
  width         integer,
  height        integer,
  thumb_bytes   integer,
  alt           text,
  position      integer not null default 0,

  -- Autoria. owner_id também é o primeiro segmento do caminho no Storage, o
  -- que amarra a linha à policy de storage.objects.
  owner_id      uuid not null references public.profiles (id) on delete restrict,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint media_role_valid check (role in ('kennel_logo', 'dog_gallery')),

  -- Exatamente um dono, nunca zero nem dois.
  constraint media_single_owner check (
    (kennel_id is not null)::int + (dog_id is not null)::int = 1
  ),
  constraint media_role_matches_owner check (
    (role = 'kennel_logo' and kennel_id is not null)
    or (role = 'dog_gallery' and dog_id is not null)
  ),

  -- Só imagem, e só os formatos que o bucket aceita. Duplicar a lista aqui não
  -- é redundância: o bucket recusa o UPLOAD, esta constraint recusa o
  -- REGISTRO, e é o registro que a aplicação lê.
  constraint media_mime_valid check (mime in ('image/webp', 'image/jpeg', 'image/png', 'image/avif')),

  -- Teto por arquivo. O client comprime bem abaixo disso; o CHECK existe para
  -- o caso de alguém gravar metadata à mão contornando a aplicação.
  constraint media_size_positive check (size_bytes > 0 and size_bytes <= 2097152),
  constraint media_thumb_size check (thumb_bytes is null or (thumb_bytes > 0 and thumb_bytes <= 262144)),
  constraint media_dimensions check (
    (width is null and height is null)
    or (width > 0 and height > 0 and width <= 4096 and height <= 4096)
  )
);

comment on table public.media is
  'Metadata das imagens. O arquivo vive no Storage; aqui ficam caminho, dimensões, tamanho, mime e autoria.';
comment on column public.media.bucket_id is
  'Bucket do arquivo. Coluna e não constante: mídia publicada pode migrar para outro bucket sem mudar schema.';
comment on column public.media.thumb_path is
  'Variante reduzida. Listagem lê SEMPRE daqui — carregar o arquivo cheio numa lista de 50 cães é o que derruba a página no celular.';
comment on column public.media.owner_id is
  'Dono do arquivo E primeiro segmento do caminho no Storage. É o que amarra a linha à policy de storage.objects.';

-- Caminho é único no bucket: dois registros apontando para o mesmo arquivo
-- fariam a exclusão de um apagar a imagem do outro.
create unique index media_storage_path_key on public.media (bucket_id, storage_path);

-- Um logo por canil. Parcial por deleted_at: trocar o logo é excluir
-- logicamente o antigo e inserir o novo, e os dois coexistem por um instante.
create unique index media_one_logo_per_kennel
  on public.media (kennel_id)
  where role = 'kennel_logo' and deleted_at is null;

create index media_kennel_id_idx on public.media (kennel_id) where deleted_at is null;
create index media_dog_id_idx on public.media (dog_id) where deleted_at is null;
create index media_owner_id_idx on public.media (owner_id) where deleted_at is null;
create index media_created_by_idx on public.media (created_by);
-- Galeria sai ordenada sem sort em memória.
create index media_dog_gallery_idx
  on public.media (dog_id, position, created_at)
  where role = 'dog_gallery' and deleted_at is null;

create trigger media_set_updated_at
  before update on public.media
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Quota por usuário
--
-- Armazenamento é o primeiro limite de plano a estourar, então o total ocupado
-- é dado de primeira classe, não algo a descobrir quando o upload falhar.
-- -----------------------------------------------------------------------------

create or replace function public.media_used_bytes(p_owner_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(m.size_bytes + coalesce(m.thumb_bytes, 0)), 0)::bigint
    from public.media m
   where m.owner_id = p_owner_id
     and m.deleted_at is null;
$$;

comment on function public.media_used_bytes(uuid) is
  'Bytes ocupados pelo usuário, thumbnail incluído. SECURITY INVOKER: a RLS já restringe as linhas.';

revoke execute on function public.media_used_bytes(uuid) from public, anon;
grant execute on function public.media_used_bytes(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
--
-- A visibilidade da mídia SEGUE a do dono. Repetir a regra de publicação aqui
-- faria as duas divergirem no primeiro ajuste; em vez disso a policy pergunta
-- ao canil ou ao cão, que já sabem responder.
-- -----------------------------------------------------------------------------

alter table public.media enable row level security;

revoke all on public.media from anon, authenticated;
grant select on public.media to anon, authenticated;
grant insert, update on public.media to authenticated;

create policy media_select
  on public.media for select
  to anon, authenticated
  using (
    deleted_at is null
    and (
      -- Mídia de canil visível: o próprio SELECT em kennels já aplica a policy
      -- de lá, então "existe para mim" é a resposta certa.
      (kennel_id is not null and exists (select 1 from public.kennels k where k.id = kennel_id))
      or (dog_id is not null and exists (select 1 from public.dogs d where d.id = dog_id))
    )
  );

create policy media_insert
  on public.media for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and created_by = (select auth.uid())
    and (
      (role = 'kennel_logo' and private.owns_kennel(kennel_id))
      or (role = 'dog_gallery' and private.can_manage_dog(dog_id))
      or private.is_admin()
    )
  );

create policy media_update
  on public.media for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    or private.is_admin()
  )
  with check (
    owner_id = (select auth.uid())
    or private.is_admin()
  );

-- Sem DELETE para ninguém: exclusão é lógica, como em todas as tabelas. O
-- arquivo no Storage é removido à parte — lá, apagar é o comportamento certo.
