-- =============================================================================
-- OrigemX — descendentes de um cão
--
-- Serve ao seletor de pai e mãe: sem saber quem desce de um cão, a tela
-- ofereceria um descendente como progenitor, o trigger recusaria e o criador
-- levaria um erro depois de já ter escolhido. Com esta função, o candidato
-- inválido aparece bloqueado e com o motivo, antes de salvar.
--
-- NÃO substitui o trigger `dogs_check_ancestry`. Aquele é a garantia; esta é a
-- cortesia. Se as duas divergirem, quem manda é o trigger.
-- =============================================================================

create or replace function public.dog_descendant_ids(p_dog_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Desce a árvore: filhos, netos, bisnetos.
  --
  -- UNION e não UNION ALL pelo mesmo motivo do trigger de ciclo: em
  -- linebreeding o mesmo cão é alcançável por vários caminhos, e sem a
  -- deduplicação a recursão explodiria em vez de terminar.
  with recursive descendants (id) as (
      select d.id
        from public.dogs d
       where d.sire_id = p_dog_id
          or d.dam_id = p_dog_id
    union
      select d.id
        from public.dogs d
        join descendants x
          on d.sire_id = x.id
          or d.dam_id = x.id
  )
  select id from descendants;
$$;

comment on function public.dog_descendant_ids(uuid) is
  'Ids de todos os descendentes do cão, em qualquer profundidade. Alimenta o seletor de progenitor.';

-- SECURITY DEFINER de propósito, e por isso precisa de justificativa: a árvore
-- tem de ser percorrida INTEIRA, inclusive por cães que a RLS do usuário
-- esconderia. Um descendente invisível seria oferecido como progenitor e o
-- ciclo só apareceria no erro do banco.
--
-- Não vaza dado: devolve apenas ids, nunca colunas. E qualquer SELECT que o
-- chamador faça com esses ids continua passando pela RLS normalmente.
grant execute on function public.dog_descendant_ids(uuid) to authenticated;
