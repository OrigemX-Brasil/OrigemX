-- =============================================================================
-- OrigemX — media_select impedia a própria exclusão lógica
--
-- SINTOMA: "Remover logo" não fazia nada, e trocar o logo também falhava. O
-- erro só aparecia no log do servidor:
--
--     new row violates row-level security policy for table "media"
--
-- CAUSA: toda mutação do PostgREST vira `UPDATE ... RETURNING`, e o Postgres
-- exige que a linha RESULTANTE ainda satisfaça a policy de SELECT. A policy
-- antiga começava com `deleted_at is null`, sem exceção para ninguém — então
-- gravar `deleted_at` produzia uma linha que a própria policy tornava
-- invisível, e o UPDATE era recusado. A exclusão lógica de mídia era
-- literalmente impossível de executar.
--
-- Isso atingia os dois caminhos: `deleteMedia` e o soft-delete do logo antigo
-- dentro de `registerMedia` — daí trocar o logo falhar depois no índice único
-- `media_one_logo_per_kennel`, com o antigo ainda vivo.
--
-- CORREÇÃO: o dono (e o admin) continuam enxergando a própria linha depois de
-- excluída, exatamente como `kennels_select` e `dogs_select` já faziam ("o dono
-- vê os dele sempre, inclusive excluído logicamente") e como
-- `dog_identifiers_select`, que nem filtra `deleted_at`. `media` era a única
-- fora do padrão.
--
-- Anônimo continua sem ver linha excluída — a mudança é só para quem já podia
-- escrever naquela linha. Toda consulta da aplicação filtra `deleted_at`
-- explicitamente (media/queries.ts, publish.ts, sync.ts, public/queries.ts e a
-- função media_used_bytes), então nada passa a listar mídia removida.
-- =============================================================================

drop policy media_select on public.media;

create policy media_select
  on public.media for select
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
    and (
      (kennel_id is not null and exists (select 1 from public.kennels k where k.id = kennel_id))
      or (dog_id is not null and exists (select 1 from public.dogs d where d.id = dog_id))
    )
  );
