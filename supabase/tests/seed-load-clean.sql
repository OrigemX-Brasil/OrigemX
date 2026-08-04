-- =============================================================================
-- OrigemX — remove a carga sintética de auditoria.
--
--     npm run seed:load-clean
--
-- DELETE FÍSICO, e é exceção CONSCIENTE à invariante de exclusão lógica do
-- projeto. `deleted_at` existe para registro de produto, que outros pedigrees
-- referenciam e não pode sumir. Isto aqui é fixture de teste: 45 mil linhas com
-- `deleted_at` preenchido não seriam limpeza, seriam lixo permanente enviesando
-- toda medição futura e o planner junto.
--
-- A ORDEM IMPORTA. `dogs_sire_id_fkey` e `dogs_dam_id_fkey` são RESTRICT, então
-- apagar um cão que é pai de outro é recusado. Primeiro solta o vínculo, depois
-- apaga as linhas, e só então o canil — cujo `dogs_kennel_id_fkey` também é
-- RESTRICT.
-- =============================================================================

do $$
declare
  v_kennel uuid := '00000000-0000-4000-9000-000000000001';
  v_dogs   int;
begin
  -- 1. Solta pai e mãe. Sem isto o DELETE bate no RESTRICT.
  update public.dogs set sire_id = null, dam_id = null where kennel_id = v_kennel;

  -- 2. As linhas.
  delete from public.dogs where kennel_id = v_kennel;
  get diagnostics v_dogs = row_count;

  -- 3. O canil.
  delete from public.kennels where id = v_kennel;

  raise notice 'removidos: % caes e o canil de carga', v_dogs;
end $$;

-- Devolve a estatística ao tamanho real, senão o planner segue achando que a
-- tabela é grande e escolhe plano errado para o volume que sobrou.
analyze public.dogs;
analyze public.kennels;

select count(*) as caes_restantes from public.dogs;
