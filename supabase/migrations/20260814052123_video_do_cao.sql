-- =============================================================================
-- OrigemX — vídeo do cão (Cloudflare Stream)
--
-- Tabela SEPARADA de `media`, e não uma coluna em `dogs`, por dois motivos:
--
--  1. `media` é Storage: bucket, caminho, compressão em canvas, quota em bytes,
--     miniatura, reconciliação privado↔público. NADA disso se aplica a vídeo —
--     o arquivo não é nosso, mora no Cloudflare, e o que guardamos é um
--     identificador. Enfiar isso em `media` obrigaria metade das colunas a ser
--     nula e metade das funções a desviar por `if (role === 'video')`.
--  2. O status MUDA SOZINHO depois do upload (pendingupload → … → ready),
--     conforme a transcodificação anda. Se isso fosse coluna de `dogs`, cada
--     leitura de status viraria UPDATE na tabela mais quente e mais protegida
--     do projeto — a que o pedigree percorre e que tem trigger de ciclo
--     genealógico.
--
-- UM VÍDEO POR CÃO nesta versão. O mecanismo é o mesmo de `kennels_owner_uk` e
-- de `media_one_logo_per_kennel`: índice único PARCIAL. Excluir logicamente
-- libera a vaga.
--
-- O BINÁRIO NUNCA PASSA PELO NOSSO SERVIDOR. O navegador sobe direto para uma
-- URL de uso único que o Cloudflare devolve (direct creator upload). Essa URL
-- não é gravada aqui: é credencial efêmera, não dado.
-- =============================================================================

create table public.dog_videos (
  id            uuid primary key default gen_random_uuid(),
  dog_id        uuid not null references public.dogs (id) on delete restrict,

  -- `provider` existe para o dia em que houver outro. Enquanto só houver um, o
  -- CHECK abaixo mantém a coluna honesta em vez de virar texto livre.
  provider      text not null default 'cloudflare_stream',
  -- O UID do Stream. É TUDO que guardamos do arquivo em si.
  provider_uid  text not null,
  status        text not null default 'pendingupload',

  -- Só existem depois que a transcodificação termina. Antes disso o vídeo não
  -- tem poster nem endereço de reprodução — é justamente o que `status`
  -- distingue.
  thumbnail_url    text,
  playback_origin  text,
  duration_seconds numeric(6,2),
  -- Motivo da falha, como o Cloudflare a descreve. Vai para a tela do dono.
  error_reason     text,

  owner_id      uuid not null references public.profiles (id) on delete restrict,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint dog_videos_provider_valid check (provider in ('cloudflare_stream')),

  -- Os seis estados que a API do Stream reporta. Um estado novo do lado deles
  -- é recusado aqui em vez de virar texto qualquer no banco — o mapeamento no
  -- código trata o desconhecido mantendo o status anterior, então nada trava.
  constraint dog_videos_status_valid check (
    status in ('pendingupload', 'downloading', 'queued', 'inprogress', 'ready', 'error')
  ),

  -- 'ready' sem poster e sem origem seria um player que não abre. A página
  -- pública renderiza a seção EXATAMENTE quando status='ready', então este
  -- CHECK é o que garante que ela nunca renderize um iframe quebrado.
  constraint dog_videos_ready_has_playback check (
    status <> 'ready' or (thumbnail_url is not null and playback_origin is not null)
  ),

  -- `playback_origin` vira o `src` de um <iframe> na página pública. O valor é
  -- derivado da resposta do Cloudflare pelo nosso código, mas isto aqui é a
  -- camada que não depende do código estar certo: só o subdomínio de cliente
  -- do Stream entra. Sem este CHECK, uma linha gravada por fora da aplicação
  -- poderia apontar o iframe para qualquer host.
  constraint dog_videos_origin_host check (
    playback_origin is null
    or playback_origin ~ '^https://customer-[a-z0-9]+\.cloudflarestream\.com$'
  ),

  -- Teto de duração com folga sobre os 90s pedidos ao Stream: a duração medida
  -- depois da transcodificação arredonda, e um vídeo de 90,04s não é erro.
  constraint dog_videos_duration_ok check (
    duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 95)
  )
);

comment on table public.dog_videos is
  'Vídeo do cão hospedado no Cloudflare Stream. O arquivo vive lá; aqui ficam o UID, o status da transcodificação e o endereço de reprodução.';
comment on column public.dog_videos.provider_uid is
  'UID do vídeo no Cloudflare Stream. Único por provedor — é a chave que liga esta linha ao arquivo remoto.';
comment on column public.dog_videos.status is
  'Estado da transcodificação, espelhando status.state da API do Stream. Só ready aparece na página pública.';
comment on column public.dog_videos.playback_origin is
  'Origem do subdomínio de cliente do Stream (https://customer-<code>.cloudflarestream.com). Coluna e não variável de ambiente: o código vem em toda resposta da API, então guardá-lo dispensa configuração que poderia ficar vazia.';

-- Um vídeo vivo por cão. Parcial por `deleted_at`: trocar o vídeo é excluir
-- logicamente o antigo e inserir o novo, e os dois coexistem por um instante.
create unique index dog_videos_one_per_dog
  on public.dog_videos (dog_id)
  where deleted_at is null;

-- Dois registros apontando para o mesmo vídeo remoto fariam a remoção de um
-- apagar o vídeo do outro no Cloudflare. Mesmo raciocínio de
-- `media_storage_path_key`.
create unique index dog_videos_provider_uid_key
  on public.dog_videos (provider, provider_uid);

create index dog_videos_dog_id_idx on public.dog_videos (dog_id) where deleted_at is null;
create index dog_videos_owner_id_idx on public.dog_videos (owner_id) where deleted_at is null;
create index dog_videos_created_by_idx on public.dog_videos (created_by);

create trigger dog_videos_set_updated_at
  before update on public.dog_videos
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
--
-- Recorte IDÊNTICO ao de `media`, cláusula de suspensão inclusive. Vídeo é
-- conteúdo do dono sobre o próprio cão, exatamente como foto — não é superfície
-- administrativa, então não ganha regra própria.
-- -----------------------------------------------------------------------------

alter table public.dog_videos enable row level security;

revoke all on public.dog_videos from anon, authenticated;
grant select on public.dog_videos to anon, authenticated;
grant insert, update on public.dog_videos to authenticated;
-- Sem DELETE para ninguém: exclusão é lógica, como em todas as tabelas. O
-- vídeo no Cloudflare é apagado à parte — lá, apagar é o comportamento certo,
-- senão acumula custo de armazenamento órfão.

-- A visibilidade do vídeo SEGUE a do cão, perguntando ao próprio `dogs` em vez
-- de repetir a regra. `dogs_select` já chama `public.dog_is_public(...)`, a
-- fonte única — então "o cão existe para mim" já responde certo para anônimo,
-- dono, autor do cadastro, dono do canil e admin. Repetir `published_at` aqui
-- criaria uma segunda definição para divergir no primeiro ajuste.
--
-- Isto expõe ao visitante a EXISTÊNCIA de um vídeo ainda em processamento num
-- cão já publicado. É o mesmo que `media_select` já faz, e é inofensivo: a
-- página pública filtra por status='ready', e a linha não carrega nada além do
-- UID remoto e do estado.
create policy dog_videos_select
  on public.dog_videos for select
  to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.dogs d where d.id = dog_id)
  );

create policy dog_videos_insert
  on public.dog_videos for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and created_by = (select auth.uid())
    and (private.can_manage_dog(dog_id) or private.is_admin())
    and not (select private.is_suspended())
  );

-- O UPDATE é o caminho do polling de status E o da exclusão lógica. `using` e
-- `with check` iguais: sem o segundo, o dono passaria a linha para outra pessoa
-- dentro do próprio UPDATE.
create policy dog_videos_update
  on public.dog_videos for update
  to authenticated
  using (
    (owner_id = (select auth.uid()) or private.is_admin())
    and not (select private.is_suspended())
  )
  with check (
    (owner_id = (select auth.uid()) or private.is_admin())
    and not (select private.is_suspended())
  );
