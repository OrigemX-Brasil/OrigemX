-- =============================================================================
-- OrigemX — limpeza de resíduo do test:rls
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- A limpeza embutida em `scripts/test-rls.mts` apagava cães por
-- `slug like 'rls-<RUN>-%'`. Os cães do cenário 11b (selo Fundador) são
-- inseridos SEM slug, então sobreviviam; o `delete` de canis apanhava de
-- `dogs.kennel_id ON DELETE RESTRICT`, o `deleteUser` apanhava de
-- `kennels.owner_id RESTRICT`, e nada disso era conferido — nenhum daqueles
-- `.delete()` checava `error`. Cada execução interrompida deixava até 5 canis
-- vivos do mesmo dono para trás.
--
-- A causa está corrigida no script (limpeza por posse, com verificação). Este
-- arquivo existe para o resíduo JÁ acumulado, e para quando uma execução for
-- interrompida no meio.
--
-- DELETE FÍSICO, e é exceção consciente à invariante de exclusão lógica: estas
-- linhas são FIXTURE DE TESTE, não dado de criador. Mesma exceção que
-- `e2e/support/admin.ts` já documenta.
--
-- Uso:
--   npm run db:limpar-rls
--
-- NUNCA rodar contra o projeto do CLIENTE. Confirme o link antes:
--   npx supabase projects list
-- =============================================================================

do $$
declare
  v_canis    uuid[];
  v_donos    uuid[];
  v_caes     uuid[];
  n_caes     integer;
  n_canis    integer;
  n_users    integer;
begin
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(distinct owner_id), '{}')
    into v_canis, v_donos
    from public.kennels
   where slug like 'rls-%';

  -- Os cães vêm do CANIL e do DONO, não do slug. Foi confiar só no slug que
  -- deixou o resíduo para trás.
  select coalesce(array_agg(id), '{}')
    into v_caes
    from public.dogs
   where kennel_id = any (v_canis)
      or owner_id = any (v_donos)
      or created_by = any (v_donos);

  if array_length(v_canis, 1) is null then
    raise notice 'Nenhum resíduo rls-%% encontrado. Nada a fazer.';
    return;
  end if;

  -- Um cão de teste não pode ser pai de um cão real. Se for, o DELETE abaixo
  -- falha por FK e a transação inteira volta — que é o comportamento certo:
  -- melhor abortar do que mutilar a árvore de alguém.
  update public.dogs
     set sire_id = null, dam_id = null
   where id = any (v_caes);

  delete from public.media           where dog_id = any (v_caes) or kennel_id = any (v_canis) or owner_id = any (v_donos);
  -- `dog_videos.dog_id` é ON DELETE RESTRICT: sem esta linha, o delete de
  -- `dogs` abaixo apanha e a transação inteira volta.
  delete from public.dog_videos      where dog_id = any (v_caes) or owner_id = any (v_donos);
  delete from public.dog_identifiers where dog_id = any (v_caes);
  delete from public.dogs            where id = any (v_caes);
  get diagnostics n_caes = row_count;

  delete from public.kennels where id = any (v_canis);
  get diagnostics n_canis = row_count;

  -- `profiles` some por CASCADE de auth.users; os canis já saíram, então o
  -- RESTRICT de owner_id não bloqueia mais.
  delete from auth.users where id = any (v_donos) or email like 'rls-%';
  get diagnostics n_users = row_count;

  raise notice 'Removidos: % cães, % canis, % usuários.', n_caes, n_canis, n_users;
end;
$$;

-- Prova. Tem de voltar ZERO linhas — é o pré-requisito de kennels_owner_uk.
select owner_id, count(*) as canis_vivos
  from public.kennels
 where deleted_at is null
 group by owner_id
having count(*) > 1;
