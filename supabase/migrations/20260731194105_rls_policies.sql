-- =============================================================================
-- OrigemX — RLS, policies e grants
--
-- INVARIANTE: RLS habilitada em TODAS as tabelas, nenhuma tabela sem policy.
-- Autorização é decidida aqui, no banco. A UI é conveniência; esta camada é a
-- que vale quando alguém chama a Data API direto com a publishable key.
--
-- Padrões seguidos e por quê:
--  * `(select auth.uid())` em vez de `auth.uid()` solto — o planner avalia uma
--    vez e reusa, em vez de chamar a função por linha.
--  * `TO authenticated` SEMPRE junto de um predicado de posse. Só o role, sem
--    predicado, é autenticação sem autorização (IDOR).
--  * UPDATE com USING *e* WITH CHECK. Sem WITH CHECK, o usuário passa a linha
--    para outro dono no próprio UPDATE.
--  * Nenhum GRANT de DELETE, para ninguém: exclusão é lógica (deleted_at).
--    A invariante vira privilégio do Postgres, não convenção de código.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
--
-- Ficam em `private` porque SECURITY DEFINER em `public` é endpoint público:
-- o Postgres concede EXECUTE a PUBLIC por padrão, e anon/authenticated herdam.
-- Ambos checam auth.uid() no corpo, então não vazam nada de quem os chama.
-- -----------------------------------------------------------------------------

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'admin'
       and p.deleted_at is null
  );
$$;

comment on function private.is_admin() is
  'True se o usuário da sessão é admin. Lê profiles.role, nunca user_metadata.';

-- Quem pode mexer no cão: dono, quem cadastrou, o dono do canil, ou admin.
--
-- SECURITY DEFINER para conseguir avaliar a posse mesmo quando a própria RLS
-- esconderia a linha — caso do cão logicamente excluído, que o dono ainda
-- precisa enxergar para restaurar.
create or replace function private.can_manage_dog(p_dog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.dogs d
      left join public.kennels k on k.id = d.kennel_id
     where d.id = p_dog_id
       and (
            d.owner_id = (select auth.uid())
         or d.created_by = (select auth.uid())
         or k.owner_id = (select auth.uid())
       )
  ) or private.is_admin();
$$;

comment on function private.can_manage_dog(uuid) is
  'Posse do cão: dono, autor do cadastro, dono do canil, ou admin.';

grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.can_manage_dog(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Privilégios de tabela
--
-- Zera o que os default privileges do Supabase concedem e reconcede o mínimo.
-- DELETE não aparece em nenhuma linha abaixo — é intencional.
-- -----------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;
revoke all on public.kennels from anon, authenticated;
revoke all on public.dogs from anon, authenticated;
revoke all on public.dog_identifiers from anon, authenticated;

grant select on public.profiles to anon, authenticated;
-- Privilégio por COLUNA. É isto que impede o usuário de se promover a admin:
-- `role` não está na lista, então `update profiles set role='admin'` é negado
-- pelo Postgres antes mesmo de a policy ser avaliada.
grant update (full_name, phone, city, state, bio, avatar_url)
  on public.profiles to authenticated;

grant select on public.kennels to anon, authenticated;
grant insert, update on public.kennels to authenticated;

grant select on public.dogs to anon, authenticated;
grant insert, update on public.dogs to authenticated;

-- Sem grant para anon: microchip é dado de rastreio do animal.
grant select, insert, update on public.dog_identifiers to authenticated;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- Perfil de criador é público por design — é a página que o QR Code leva.
create policy profiles_select_public
  on public.profiles for select
  to anon, authenticated
  using (deleted_at is null or (select auth.uid()) = id or private.is_admin());

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Sem policy de INSERT: profile nasce só pelo trigger handle_new_user, no
-- signup. Sem policy de DELETE: exclusão é lógica.

-- -----------------------------------------------------------------------------
-- kennels
-- -----------------------------------------------------------------------------

alter table public.kennels enable row level security;

-- Anônimo vê só canil PUBLICADO e não excluído. O dono vê os dele sempre,
-- inclusive rascunho e excluído logicamente — sem isso ele ficaria sem SELECT
-- na linha, e no Postgres UPDATE precisa de SELECT antes: soft delete viraria
-- irreversível, silenciosamente, e rascunho seria impossível de editar.
create policy kennels_select
  on public.kennels for select
  to anon, authenticated
  using (
    (deleted_at is null and published_at is not null)
    or (select auth.uid()) = owner_id
    or private.is_admin()
  );

create policy kennels_insert_own
  on public.kennels for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (created_by is null or created_by = (select auth.uid()))
  );

-- WITH CHECK repete a posse: sem ele, um UPDATE poderia reatribuir owner_id
-- para outra pessoa e o canil mudaria de mãos.
create policy kennels_update_own
  on public.kennels for update
  to authenticated
  using ((select auth.uid()) = owner_id or private.is_admin())
  with check ((select auth.uid()) = owner_id or private.is_admin());

-- -----------------------------------------------------------------------------
-- dogs
-- -----------------------------------------------------------------------------

alter table public.dogs enable row level security;

-- Leitura anônima em dois casos, mais quem gerencia, que vê sempre:
--
--   1. cão PUBLICADO e não excluído;
--   2. ANCESTRAL FANTASMA — sem dono E sem canil. Ele existe só para ser nó de
--      árvore: não tem dado privado a proteger, e escondê-lo produziria buraco
--      no pedigree de um cão que está publicado.
--
-- O caso 2 exige `kennel_id is null` além de `owner_id is null`, e essa
-- diferença é o que separa a regra de um vazamento. Cão COM canil e sem dono é
-- comum e legítimo — é o animal que o criador cadastrou e ainda não vendeu, ou
-- vendeu sem saber para quem. Esse não é fantasma: é rascunho de alguém, e
-- publicá-lo por causa de `owner_id is null` exporia dado que o dono do canil
-- não mandou publicar.
--
-- Cão com dono e não publicado continua invisível. O buraco correspondente no
-- pedigree é tratado na UI, que renderiza a posição como "não publicado" e sem
-- link — aqui só garantimos que nada dele vaza.
create policy dogs_select
  on public.dogs for select
  to anon, authenticated
  using (
    (
      deleted_at is null
      and (
        published_at is not null
        or (owner_id is null and kennel_id is null)
      )
    )
    or private.can_manage_dog(id)
  );

create policy dogs_insert
  on public.dogs for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      -- Sem canil: cão avulso, ou ancestral cadastrado só para o pedigree.
      kennel_id is null
      -- Com canil: só no próprio canil.
      or exists (
        select 1 from public.kennels k
         where k.id = kennel_id
           and k.owner_id = (select auth.uid())
           and k.deleted_at is null
      )
      or private.is_admin()
    )
  );

-- O WITH CHECK repete a checagem do canil de destino, e não só
-- can_manage_dog(id). Motivo: can_manage_dog consulta o estado ANTERIOR da
-- linha, então sozinho ele deixaria alguém mover o próprio cão para dentro do
-- canil de outra pessoa.
create policy dogs_update
  on public.dogs for update
  to authenticated
  using (private.can_manage_dog(id))
  with check (
    private.can_manage_dog(id)
    and (
      kennel_id is null
      or exists (
        select 1 from public.kennels k
         where k.id = kennel_id
           and k.owner_id = (select auth.uid())
           and k.deleted_at is null
      )
      or private.is_admin()
    )
  );

-- -----------------------------------------------------------------------------
-- dog_identifiers
--
-- Único conjunto NÃO público do schema. Número de microchip identifica e
-- localiza o animal; expor isso a anônimo é risco para o dono, não recurso.
-- -----------------------------------------------------------------------------

alter table public.dog_identifiers enable row level security;

-- Sem filtro por deleted_at: quem gerencia o cão precisa enxergar o
-- identificador que excluiu logicamente para poder restaurá-lo, e a listagem
-- da aplicação já filtra deleted_at explicitamente.
create policy dog_identifiers_select
  on public.dog_identifiers for select
  to authenticated
  using (private.can_manage_dog(dog_id));

create policy dog_identifiers_insert
  on public.dog_identifiers for insert
  to authenticated
  with check (
    private.can_manage_dog(dog_id)
    and (created_by is null or created_by = (select auth.uid()))
  );

create policy dog_identifiers_update
  on public.dog_identifiers for update
  to authenticated
  using (private.can_manage_dog(dog_id))
  with check (private.can_manage_dog(dog_id));
