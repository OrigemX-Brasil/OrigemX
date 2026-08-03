-- =============================================================================
-- OrigemX — bucket público para mídia de registro JÁ publicado
--
-- Por que existir um segundo bucket, e não URL assinada para tudo: URL assinada
-- expira. Uma página com cache serviria HTML apontando para link morto, e o QR
-- impresso vive meses. Entrega pública precisa de URL estável.
--
-- MOVE, nunca cópia. Armazenamento é o primeiro limite de plano a estourar, e
-- manter o mesmo arquivo nos dois buckets dobraria o consumo de todo conteúdo
-- publicado.
--
-- O move é feito com a SESSÃO DO USUÁRIO, não com a chave secreta: mover entre
-- buckets é DELETE na origem + INSERT no destino, e as policies abaixo dão os
-- dois ao dono no próprio prefixo. A RLS continua no circuito.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kennel-media-public',
  'kennel-media-public',
  -- PÚBLICO. É o ponto: o CDN entrega o objeto direto, sem assinatura e sem
  -- expiração. Só entra aqui mídia de canil ou cão com published_at preenchido.
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

-- Mesma convenção de caminho do bucket privado: o primeiro segmento é o uid do
-- dono, e é ele que as policies comparam com auth.uid(). Manter as duas
-- convenções idênticas é o que permite o move preservar o caminho.

create policy "kennel_media_public_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kennel-media-public'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- UPDATE com USING e WITH CHECK: sem o WITH CHECK, daria para renomear um
-- objeto para dentro do prefixo de outra pessoa.
create policy "kennel_media_public_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kennel-media-public'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'kennel-media-public'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- DELETE é o que permite mover PARA FORA daqui ao despublicar.
create policy "kennel_media_public_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kennel-media-public'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- SELECT para authenticated: necessário para o dono LISTAR o próprio prefixo, o
-- que a reconciliação usa para descobrir onde o objeto realmente está.
--
-- Não afrouxa nada: o bucket é público, então o conteúdo já é legível por
-- qualquer um que tenha a URL. A policy governa a API, não o CDN.
create policy "kennel_media_public_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kennel-media-public'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- -----------------------------------------------------------------------------
-- `media.bucket_id` já é coluna desde a migration da tabela, justamente para
-- este momento. Nada a alterar no schema — só passa a assumir dois valores.
-- -----------------------------------------------------------------------------

comment on column public.media.bucket_id is
  'Bucket onde o arquivo está: kennel-media (privado, rascunho) ou kennel-media-public (publicado, servido pelo CDN sem expiração). Mantido em sincronia por reconcileMediaBucket.';
