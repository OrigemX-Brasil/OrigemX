-- =============================================================================
-- OrigemX — ninhadas do canil (versão básica)
--
-- Acordado com o cliente: registro simples ligado ao CANIL — texto + até 4
-- fotos. NÃO é entidade genealógica ainda (sem vínculo com dogs, sem pai/mãe,
-- sem filhote como nó de pedigree) — isso é Fase 3, orçada à parte quando
-- chegar. NENHUM campo de preço, disponibilidade ou contato: é conteúdo
-- informativo, não vitrine de venda (Cláusula 4 do contrato exclui
-- marketplace/intermediação).
-- =============================================================================

create table public.kennel_litters (
  id            uuid primary key default gen_random_uuid(),
  kennel_id     uuid not null references public.kennels (id) on delete restrict,
  description   text,

  published_at  timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  -- Mesmo par de metades do CHECK de media.caption: btrim barra vazio/só-espaço;
  -- a medida CRUA barra o texto de 500 cercado de espaços que o btrim esconderia
  -- na leitura, inchando a linha sem limite real.
  constraint kennel_litters_description_len check (
    description is null
    or (char_length(btrim(description)) > 0 and char_length(description) <= 500)
  )
);

comment on table public.kennel_litters is
  'Ninhada do canil — descrição + fotos (via media.litter_id). Sem vínculo com dogs: não é nó de pedigree nesta fase.';
comment on column public.kennel_litters.published_at is
  'Mesmo conceito de kennels/dogs: null = rascunho. Visibilidade pública exige ISTO E o canil publicado — ver kennel_litters_select.';

-- Sem `owner_id`: ninhada não tem posse própria, sempre derivada de kennel_id
-- via private.owns_kennel() — mesmo raciocínio que já vale para o vínculo
-- dogs.kennel_id. Consequência aceita: canil excluído logicamente tira o
-- acesso do dono às próprias ninhadas junto (diferente de dogs, que tem
-- owner_id próprio e sobrevive à exclusão do canil).
create index kennel_litters_kennel_id_idx
  on public.kennel_litters (kennel_id, created_at desc)
  where deleted_at is null;

create trigger kennel_litters_set_updated_at
  before update on public.kennel_litters
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- media — litter_id como terceiro braço do mesmo desenho de kennel_id/dog_id
-- -----------------------------------------------------------------------------

alter table public.media
  add column litter_id uuid references public.kennel_litters (id) on delete restrict;

alter table public.media drop constraint media_role_valid;
alter table public.media add constraint media_role_valid
  check (role in ('kennel_logo', 'dog_gallery', 'litter_gallery'));

alter table public.media drop constraint media_single_owner;
alter table public.media add constraint media_single_owner check (
  (kennel_id is not null)::int + (dog_id is not null)::int + (litter_id is not null)::int = 1
);

alter table public.media drop constraint media_role_matches_owner;
alter table public.media add constraint media_role_matches_owner check (
  (role = 'kennel_logo' and kennel_id is not null)
  or (role = 'dog_gallery' and dog_id is not null)
  or (role = 'litter_gallery' and litter_id is not null)
);

create index media_litter_id_idx on public.media (litter_id) where deleted_at is null;

-- O LIMITE DE 4 FOTOS, NO BANCO — não é count(*) em trigger (nenhuma migration
-- deste projeto usa essa técnica). É o mesmo mecanismo que kennels_owner_uk /
-- media_one_logo_per_kennel / dog_videos_one_per_dog / dog_identifiers_one_
-- primary_uk já usam para N=1 — índice único parcial — aplicado a N=4 por um
-- argumento de pombos-e-casas: `position` (coluna que media já tem, hoje só
-- para ordenar a galeria do cão) fica restrita a 4 valores possíveis quando
-- role='litter_gallery', e o índice único parcial proíbe duas linhas VIVAS da
-- MESMA ninhada ocuparem a mesma posição. Com 4 posições e zero repetição
-- entre vivas, a 5ª foto não tem onde encaixar: o INSERT falha sozinho, sem
-- nenhuma consulta de contagem rodando no banco.
--
-- Preço da escolha: ao contrário da galeria do cão (30 fotos, sem posição
-- fixa, conta-e-recusa na aplicação), aqui o app precisa calcular o menor
-- slot livre (1..4) ANTES do INSERT — não pode gravar com o default da
-- coluna. Isso vive em src/modules/litters/actions.ts.
alter table public.media add constraint media_litter_position_valid check (
  role <> 'litter_gallery' or (position between 1 and 4)
);

create unique index media_litter_position_uk
  on public.media (litter_id, position)
  where role = 'litter_gallery' and deleted_at is null;

-- -----------------------------------------------------------------------------
-- private.owns_litter() — posse em DOIS saltos (media.litter_id →
-- kennel_litters.kennel_id → kennels.owner_id). kennel_litters usa
-- owns_kennel(kennel_id) direto nas próprias policies (um salto só, e seguro:
-- owns_kennel nunca consulta a tabela que protege). Este helper existe só
-- para o pulo de dentro de media_insert — mesmo molde de owns_kennel/
-- can_manage_dog.
-- -----------------------------------------------------------------------------

create or replace function private.owns_litter(p_litter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_litter_id is not null and exists (
    select 1
      from public.kennel_litters l
      join public.kennels k on k.id = l.kennel_id
     where l.id = p_litter_id
       and k.owner_id = (select auth.uid())
       and k.deleted_at is null
  );
$$;

comment on function private.owns_litter(uuid) is
  'Posse da ninhada, via dono do canil que a contém. Usada por media_insert para foto de ninhada.';

grant execute on function private.owns_litter(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS — kennel_litters
--
-- Nasce IMUNE ao bug que este projeto já pagou duas vezes (media_select em
-- fix_media_select_soft_delete, dog_videos_select em
-- fix_dog_videos_select_soft_delete): um `deleted_at is null` sem exceção
-- torna a própria exclusão lógica impossível, porque o UPDATE...RETURNING do
-- PostgREST reexecuta a policy de SELECT contra a linha resultante. Aqui a
-- cláusula do dono (owns_kennel) nem MENCIONA deleted_at da ninhada — o dono
-- sempre vê a própria linha, publicada ou não, excluída ou não.
--
-- `not private.is_suspended()`: kennels/dogs/media (mais antigas) não têm essa
-- checagem — ela só existe desde painel_admin (10/08), e a única tabela que já
-- nasceu com ela é a mais nova do projeto, dog_videos (14/08). kennel_litters
-- segue o precedente mais recente, não o mais repetido.
-- -----------------------------------------------------------------------------

alter table public.kennel_litters enable row level security;
revoke all on public.kennel_litters from anon, authenticated;
grant select on public.kennel_litters to anon, authenticated;
grant insert, update on public.kennel_litters to authenticated;
-- Sem DELETE: exclusão é sempre lógica, como em toda tabela do projeto.

create policy kennel_litters_select
  on public.kennel_litters for select
  to anon, authenticated
  using (
    private.owns_kennel(kennel_id)
    or private.is_admin()
    or (
      deleted_at is null
      and published_at is not null
      and exists (
        select 1 from public.kennels k
         where k.id = kennel_id
           and k.deleted_at is null
           and k.published_at is not null
      )
    )
  );

create policy kennel_litters_insert
  on public.kennel_litters for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (private.owns_kennel(kennel_id) or private.is_admin())
    and not (select private.is_suspended())
  );

create policy kennel_litters_update
  on public.kennel_litters for update
  to authenticated
  using (
    (private.owns_kennel(kennel_id) or private.is_admin())
    and not (select private.is_suspended())
  )
  with check (
    (private.owns_kennel(kennel_id) or private.is_admin())
    and not (select private.is_suspended())
  );

-- -----------------------------------------------------------------------------
-- RLS — media (as duas policies que crescem um braço)
--
-- media_select parte já da versão CORRIGIDA (fix_media_select_soft_delete),
-- não do arquivo original. Foto de ninhada visível publicamente encadeia três
-- tabelas sem duplicar "publicado" em nenhuma: media existe → kennel_litters
-- existe (já checa published_at/deleted_at da própria ninhada) → dentro
-- daquela policy, o exists em kennels já checa o canil.
--
-- media_update NÃO muda: já é owner_id-based, e o dono da foto de ninhada é o
-- dono do canil — mesmo caminho que logo e galeria já seguem.
-- -----------------------------------------------------------------------------

drop policy media_select on public.media;
create policy media_select
  on public.media for select
  to anon, authenticated
  using (
    (deleted_at is null or owner_id = (select auth.uid()) or private.is_admin())
    and (
      (kennel_id is not null and exists (select 1 from public.kennels k where k.id = kennel_id))
      or (dog_id is not null and exists (select 1 from public.dogs d where d.id = dog_id))
      or (litter_id is not null and exists (select 1 from public.kennel_litters l where l.id = litter_id))
    )
  );

drop policy media_insert on public.media;
create policy media_insert
  on public.media for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and created_by = (select auth.uid())
    and (
      (role = 'kennel_logo' and private.owns_kennel(kennel_id))
      or (role = 'dog_gallery' and private.can_manage_dog(dog_id))
      or (role = 'litter_gallery' and private.owns_litter(litter_id))
      or private.is_admin()
    )
  );
