-- =============================================================================
-- OrigemX — remove a carga sintética.
--
--     npm run seed:load-clean
--
-- DELETE FÍSICO, e é exceção CONSCIENTE à invariante de exclusão lógica do
-- projeto. `deleted_at` existe para registro de produto, que outros pedigrees
-- referenciam e não pode sumir. Isto aqui é fixture: 50 mil linhas com
-- `deleted_at` preenchido não seriam limpeza, seriam lixo permanente enviesando
-- toda medição futura e o planner junto.
--
-- A ORDEM IMPORTA, e cada passo existe por uma FK:
--
--   1. `dogs_sire_id_fkey` / `dogs_dam_id_fkey` são RESTRICT — apagar um cão que
--      é pai de outro é recusado. Solta o vínculo primeiro.
--   2. `dogs_kennel_id_fkey` é RESTRICT — cão sai antes do canil.
--   3. `dogs.owner_id` é SET NULL. Apagar o usuário antes dos cães os deixaria
--      sem dono E sem canil, que é a definição de ancestral fantasma — e
--      fantasma é PUBLICAMENTE LEGÍVEL. Sobrariam 50 mil cães de teste visíveis
--      para qualquer visitante.
--   4. `profiles.id` cascateia de `auth.users`, então o perfil sai junto.
-- =============================================================================

do $$
declare
  v_dominio text := '@origemx-carga.com';
  v_dogs    int;
  v_kennels int;
  v_users   int;
begin
  -- 1. Solta pai e mãe.
  update public.dogs set sire_id = null, dam_id = null where name like 'Carga L%';

  -- 2. Os cães. Inclui os que já perderam o nome padrão por edição durante o
  --    teste de carga: o fluxo de atualização mexe em `name`.
  delete from public.dogs
   where name like 'Carga L%'
      or owner_id in (select id from auth.users where email like 'carga-%' || v_dominio)
      or created_by in (select id from auth.users where email like 'carga-%' || v_dominio);
  get diagnostics v_dogs = row_count;

  -- 3. Mídia órfã dos usuários de carga, se o teste tiver criado alguma.
  delete from public.media
   where owner_id in (select id from auth.users where email like 'carga-%' || v_dominio);

  -- 4. Os canis.
  delete from public.kennels
   where slug like 'carga-canil-%'
      or owner_id in (select id from auth.users where email like 'carga-%' || v_dominio);
  get diagnostics v_kennels = row_count;

  -- 5. As contas. `profiles` e `auth.identities` cascateiam.
  delete from auth.users where email like 'carga-%' || v_dominio;
  get diagnostics v_users = row_count;

  raise notice 'removidos: % caes, % canis, % usuarios', v_dogs, v_kennels, v_users;
end $$;

-- Devolve a estatística ao tamanho real, senão o planner segue achando que a
-- tabela é grande e escolhe plano errado para o volume que sobrou.
analyze public.dogs;
analyze public.kennels;
analyze public.profiles;

select
  (select count(*) from auth.users) as usuarios,
  (select count(*) from public.kennels where deleted_at is null) as canis,
  (select count(*) from public.dogs where deleted_at is null) as caes;
