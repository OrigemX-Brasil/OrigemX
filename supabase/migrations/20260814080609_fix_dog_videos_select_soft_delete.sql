-- =============================================================================
-- OrigemX — dog_videos_select impedia a própria exclusão lógica
--
-- SINTOMA: "Remover vídeo" devolvia "Não foi possível remover o vídeo." E, como
-- efeito colateral menos óbvio, TROCAR o vídeo também ficava impossível: a
-- linha antiga continuava viva e o índice `dog_videos_one_per_dog` recusava a
-- nova com 23505.
--
--     erro 42501: new row violates row-level security policy for table "dog_videos"
--
-- CAUSA: toda mutação do PostgREST vira `UPDATE ... RETURNING`, e o Postgres
-- exige que a linha RESULTANTE ainda satisfaça a policy de SELECT.
-- `dog_videos_select` começava com `deleted_at is null`, sem exceção para
-- ninguém — então gravar `deleted_at` produzia uma linha que a própria policy
-- tornava invisível, e o UPDATE era recusado por inteiro.
--
-- ISTO JÁ ACONTECEU NESTE PROJETO, em `media`, e está corrigido desde
-- `20260807222425_fix_media_select_soft_delete`. A policy nova nasceu copiando
-- o formato da `media_select` ORIGINAL (a da migration que criou a tabela) em
-- vez da corrigida — herdando um bug que já tinha sido pago uma vez.
--
-- CORREÇÃO: idêntica à de `media`. O dono (e o admin) continuam enxergando a
-- própria linha depois de excluída, como `kennels_select` e `dogs_select` já
-- fazem. Anônimo continua sem ver linha excluída — a mudança só alcança quem já
-- podia escrever naquela linha.
--
-- Nada passa a listar vídeo removido: as duas consultas da aplicação filtram
-- `deleted_at` explicitamente (`video/queries.ts::getDogVideo` e
-- `public/queries.ts::getPublicDogVideo`), e a pública ainda exige
-- `status = 'ready'` por cima.
-- =============================================================================

drop policy dog_videos_select on public.dog_videos;

create policy dog_videos_select
  on public.dog_videos for select
  to anon, authenticated
  using (
    -- Era só `deleted_at is null`. O `or` é o conserto: quem é dono da linha
    -- precisa enxergá-la depois de excluí-la, senão o próprio UPDATE que a
    -- exclui é recusado pelo RETURNING.
    (
      deleted_at is null
      or owner_id = (select auth.uid())
      or private.is_admin()
    )
    -- A visibilidade continua herdada de `dogs`, que é a fonte única da regra
    -- pública (`dog_is_public`). Inalterado.
    and exists (select 1 from public.dogs d where d.id = dog_id)
  );
