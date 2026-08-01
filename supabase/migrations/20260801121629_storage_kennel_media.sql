-- =============================================================================
-- OrigemX — Storage: bucket de mídia do canil
--
-- Invariante: imagem vai para Storage; o banco guarda URL e metadata, nunca
-- base64. Este arquivo cria o bucket e as policies que o protegem.
--
-- Convenção de caminho, e ela é a regra de autorização:
--
--     kennel-media/<owner_uid>/<qualquer-coisa>
--                  ^^^^^^^^^^^
--                  primeiro segmento = dono do arquivo
--
-- A policy compara esse primeiro segmento com auth.uid(). Quem tentar gravar
-- fora do próprio prefixo é barrado pelo banco, não pela aplicação.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kennel-media',
  'kennel-media',
  -- PRIVADO. Bucket público entregaria também a foto de canil e de cão que
  -- ainda estão em rascunho (published_at null), esvaziando o controle de
  -- publicação que a RLS de dogs/kennels aplica. A entrega pública de imagem
  -- de perfil publicado fica com URL assinada gerada no servidor.
  false,
  5242880, -- 5 MB: foto de cão, não arquivo bruto de câmera
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

-- storage.objects já vem com RLS habilitada pelo Supabase. Faltam as policies.

-- Leitura: só o dono. A entrega pública de perfil usa URL assinada, emitida
-- pelo servidor depois de checar que o registro está publicado.
create policy "kennel_media_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kennel-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "kennel_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kennel-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- UPDATE precisa de USING e WITH CHECK: sem o WITH CHECK, daria para mover um
-- arquivo para o prefixo de outra pessoa renomeando o objeto.
create policy "kennel_media_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kennel-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'kennel-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- DELETE é permitido aqui, ao contrário das tabelas.
-- A invariante de exclusão lógica protege o REGISTRO; o arquivo no Storage é
-- conteúdo substituível — trocar a foto de um cão exige poder remover a antiga,
-- e manter lixo binário para sempre só custaria armazenamento.
create policy "kennel_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kennel-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Sem policy para `anon` em nenhum comando: anônimo não lê nem escreve neste
-- bucket. O acesso público a mídia de perfil publicado passa por URL assinada.
