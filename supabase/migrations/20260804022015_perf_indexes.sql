-- =============================================================================
-- OrigemX — correção de índices, saída da auditoria de performance
--
-- MEDIDO com 45.000 cães no projeto de desenvolvimento, não estimado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. O índice dos cães publicados estava ORDENADO PELA COLUNA ERRADA
--
-- `dogs_kennel_published_idx` foi criado para o perfil público do canil, mas
-- ordenava por `published_at DESC` enquanto a consulta ordena por
-- `created_at DESC`. Ordenação diferente = índice inútil para aquele ORDER BY.
-- O planner caía no `dogs_kennel_created_idx` e descartava os não publicados no
-- heap, um por um.
--
-- O custo disso, medido com 45.000 cães num canil e 800 publicados:
--
--   Index Scan using dogs_kennel_created_idx
--     Filter: (published_at IS NOT NULL)
--     Rows Removed by Filter: 3492
--     Buffers: shared hit=3571
--     Execution Time: 1227 ms          <-- para devolver 48 linhas
--
-- Um segundo e dois para montar a lista de cães de um canil, numa página que
-- abre por QR Code impresso em 4G de feira.
--
-- E o índice antigo ainda custava escrita: era atualizado a cada INSERT e
-- UPDATE de cão sem servir uma única leitura.
--
-- O novo tem a MESMA ordenação da consulta e continua parcial só nos
-- publicados, então é pequeno e responde direto.
-- -----------------------------------------------------------------------------

drop index if exists public.dogs_kennel_published_idx;

create index dogs_kennel_published_idx
  on public.dogs (kennel_id, created_at desc, id desc)
  where deleted_at is null and published_at is not null;

comment on index public.dogs_kennel_published_idx is
  'Perfil público do canil. A ordenação acompanha o ORDER BY da consulta — com published_at DESC aqui, o índice não era usado.';

-- -----------------------------------------------------------------------------
-- 2. `dogs_created_by_idx` não era parcial
--
-- Todos os índices de posse irmãos (`dogs_owner_id_idx`, `kennels_owner_id_idx`)
-- são `WHERE deleted_at IS NULL`. Este indexava também cão excluído logicamente,
-- que nenhuma consulta do app procura — toda leitura filtra `deleted_at is null`.
--
-- Ele participa do BitmapOr de `listMyDogs`, então enxugar ajuda as duas pontas:
-- índice menor para varrer e menos entrada para manter.
-- -----------------------------------------------------------------------------

drop index if exists public.dogs_created_by_idx;

create index dogs_created_by_idx
  on public.dogs (created_by)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- NOTA PARA O HANDOVER AO CLIENTE
--
-- `create index` sem CONCURRENTLY trava escrita na tabela enquanto constrói.
-- Aqui é aceitável: em desenvolvimento levou menos de um segundo com 45 mil
-- linhas, e o banco do cliente nasce vazio.
--
-- Se um dia for preciso reconstruir isto com a tabela grande e em produção, tem
-- de ser `CONCURRENTLY` — e aí FORA de migration, porque CONCURRENTLY não roda
-- dentro de transação e o `db push` envolve tudo em uma.
-- -----------------------------------------------------------------------------
