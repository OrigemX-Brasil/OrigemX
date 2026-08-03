-- =============================================================================
-- OrigemX — pedigree de até 5 gerações em UMA query
--
-- Numeração de Ahnentafel (Sosa-Stradonitz): sujeito = 1, pai de N = 2N,
-- mãe de N = 2N+1. Gerações 1..5 ocupam as posições 2..63.
--
-- A POSIÇÃO É O CAMINHO. O binário da posição, lido depois do 1 inicial, é a
-- sequência de viradas pai/mãe. Por isso "renderizar por caminho, não por nó"
-- não é uma regra a lembrar na aplicação: cai fora de graça, porque a chave da
-- linha é a posição e não o dog_id. Linebreeding devolve o mesmo dog_id em
-- várias posições, e esse é o resultado CORRETO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fonte única de "este cão é público"
--
-- Esta regra vivia escrita dentro da policy `dogs_select`. Extrair para função
-- é o que impede as duas definições — a da policy e a do pedigree — divergirem
-- num ajuste futuro. Duplicar regra de visibilidade é como um vazamento nasce
-- seis meses depois.
--
-- IMMUTABLE e recebendo só escalares que o chamador já tem em mãos: não lê
-- nada, não consulta nada, não divulga nada. É expressão, não consulta.
-- -----------------------------------------------------------------------------

create or replace function public.dog_is_public(
  p_deleted_at   timestamptz,
  p_published_at timestamptz,
  p_owner_id     uuid,
  p_kennel_id    uuid
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_deleted_at is null
     and (
       p_published_at is not null
       -- Ancestral fantasma: sem dono E sem canil. A conjunção importa — cão
       -- com canil e sem dono é rascunho de alguém, não nó de árvore.
       or (p_owner_id is null and p_kennel_id is null)
     );
$$;

comment on function public.dog_is_public(timestamptz, timestamptz, uuid, uuid) is
  'Regra única de visibilidade pública de cão. Usada pela policy dogs_select e pela função de pedigree.';

grant execute on function public.dog_is_public(timestamptz, timestamptz, uuid, uuid)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reescrita de dogs_select
--
-- APENAS o primeiro ramo muda, e vira chamada ao helper. Os quatro ramos de
-- posse ficam idênticos. É reescrita de expressão, não mudança de regra — e há
-- comparativo caso a caso, em reports/, provando que o comportamento observável
-- não mudou.
-- -----------------------------------------------------------------------------

drop policy dogs_select on public.dogs;

create policy dogs_select
  on public.dogs for select
  to anon, authenticated
  using (
    public.dog_is_public(deleted_at, published_at, owner_id, kennel_id)
    or owner_id = (select auth.uid())
    or created_by = (select auth.uid())
    or private.owns_kennel(kennel_id)
    or private.is_admin()
  );

-- -----------------------------------------------------------------------------
-- A travessia
-- -----------------------------------------------------------------------------

-- `pos` e `branch`, não `position` e `offset`: as duas são palavras reservadas
-- no Postgres (POSITION(x IN y) e OFFSET), e o parser recusa como nome de
-- coluna sem aspas. Renomear é mais limpo que espalhar aspas pelo corpo.
create or replace function public.dog_pedigree(p_dog_id uuid, p_generations int default 5)
returns table (
  pos         bigint,
  generation  int,
  dog_id      uuid,
  name        text,
  is_public   boolean,
  public_id   text,
  sex         text,
  breed       text,
  born_on     date,
  kennel_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ped (pos, generation, dog_id) as (
      select 1::bigint, 0, d.id
        from public.dogs d
       where d.id = p_dog_id
         and d.deleted_at is null
    union all
      -- UNION ALL, e aqui é o OPOSTO do trigger de ciclo: lá o UNION dedupe é
      -- o que faz a recursão terminar; aqui queremos a mesma linha repetida em
      -- posições diferentes, e a terminação vem do limite de profundidade.
      select p.pos * 2 + side.branch,
             p.generation + 1,
             case when side.branch = 0 then d.sire_id else d.dam_id end
        from ped p
        join public.dogs d on d.id = p.dog_id
        -- cross join sobre VALUES em vez de unnest: mesma construção segura já
        -- usada em dogs_check_ancestry. O Postgres restringe o que pode
        -- aparecer no termo recursivo.
        cross join (values (0), (1)) as side(branch)
       -- Profundidade travada no corpo, não confiando no parâmetro: no máximo
       -- 5 gerações, no máximo 63 linhas.
       where p.generation < least(greatest(coalesce(p_generations, 5), 1), 5)
         and (case when side.branch = 0 then d.sire_id else d.dam_id end) is not null
  )
  select
    p.pos,
    p.generation,
    d.id,
    -- NOME SAI SEMPRE, inclusive de rascunho de terceiro. É decisão de produto
    -- registrada em supabase/README.md como pendente de validação do cliente:
    -- pedigree com lacunas não é pedigree, e nome de ancestral é dado
    -- convencionalmente público no domínio. Antes desta migration o nome não
    -- aparecia em lugar nenhum do site.
    d.name,
    public.dog_is_public(d.deleted_at, d.published_at, d.owner_id, d.kennel_id),
    -- O RESTO só sai se o cão for público. Sem public_id não há link nem URL
    -- construível: a divulgação é campo a campo, decidida aqui e não na tela.
    case when public.dog_is_public(d.deleted_at, d.published_at, d.owner_id, d.kennel_id)
         then d.public_id end,
    case when public.dog_is_public(d.deleted_at, d.published_at, d.owner_id, d.kennel_id)
         then d.sex end,
    case when public.dog_is_public(d.deleted_at, d.published_at, d.owner_id, d.kennel_id)
         then d.breed end,
    case when public.dog_is_public(d.deleted_at, d.published_at, d.owner_id, d.kennel_id)
         then d.born_on end,
    case when public.dog_is_public(d.deleted_at, d.published_at, d.owner_id, d.kennel_id)
         then k.name end
  from ped p
  join public.dogs d on d.id = p.dog_id
  left join public.kennels k on k.id = d.kennel_id
  order by p.pos;
$$;

comment on function public.dog_pedigree(uuid, int) is
  'Árvore de até 5 gerações em uma query, numerada por Ahnentafel. SECURITY DEFINER para atravessar galhos que a RLS do chamador esconderia; a divulgação é decidida campo a campo aqui dentro.';

-- SECURITY DEFINER de propósito: a árvore precisa ser percorrida INTEIRA. Se
-- rodasse com a RLS do anônimo, um bisavô que é rascunho de terceiro truncaria
-- o galho e perderíamos tudo acima dele — o pedigree pararia no meio sem
-- explicação.
--
-- O preço é que `db advisors` vai apontar esta função como executável por anon.
-- É aceito e documentado: ela devolve apenas nome e posição para cão restrito,
-- e nada mais.
grant execute on function public.dog_pedigree(uuid, int) to anon, authenticated;
