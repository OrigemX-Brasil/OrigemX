-- =============================================================================
-- OrigemX — depoimentos gerenciados pelo criador
--
-- ---------------------------------------------------------------------------
-- NATUREZA — CONTEÚDO DO CRIADOR, NÃO AVALIAÇÃO VERIFICADA
-- ---------------------------------------------------------------------------
-- Depoimento é texto que o CRIADOR insere, edita e remove sobre a própria
-- criação. A OrigemX não verifica identidade do autor citado nem veracidade
-- do relato — a responsabilidade pelo conteúdo é do criador que publica.
-- Ver CLAUDE.md, seção "Depoimentos".
--
-- ---------------------------------------------------------------------------
-- QUEM É DONO — mesmo raciocínio de kennel_litters
-- ---------------------------------------------------------------------------
-- `kennel_id`, sem `owner_id` próprio: posse é sempre derivada de
-- private.owns_kennel(), como já vale para kennel_litters. Canil excluído
-- logicamente tira o acesso do dono aos próprios depoimentos junto.
--
-- `dog_id` é opcional, e amarrado ao MESMO canil por trigger (não RLS,
-- não CHECK — exige lookup): um depoimento sobre "o filhote que comprei"
-- só faz sentido apontando para um cão que o próprio criador vende, nunca
-- para o cão de outro canil.
--
-- `published_at`, não `boolean`: o pedido original especificava `published
-- boolean`, mapeado aqui para o mesmo padrão de kennels/dogs/kennel_litters
-- — reaproveita o cascade de publishKennel/unpublishKennel e a REGRA DUPLA
-- já testada em ninhada, em vez de reinventar em paralelo.
--
-- ---------------------------------------------------------------------------
-- AVATAR — clona kennel_logo (1:1 opcional), não litter_gallery
-- ---------------------------------------------------------------------------
-- Um depoimento tem no máximo UMA foto (a do autor citado), não uma galeria
-- com posição. O braço novo em `media` segue o desenho de `kennel_logo`:
-- índice único parcial por dono, sem coluna de posição envolvida.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- testimonials
-- -----------------------------------------------------------------------------

create table public.testimonials (
  id            uuid primary key default gen_random_uuid(),
  kennel_id     uuid not null references public.kennels (id) on delete restrict,
  dog_id        uuid references public.dogs (id) on delete restrict,

  author_name   text not null,
  text          text not null,
  rating        smallint,

  published_at  timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  -- Mesmo par de metades dos CHECKs de texto do projeto (media.caption,
  -- kennel_litters.description): btrim barra vazio/só-espaço, a medida CRUA
  -- barra o texto no limite cercado de espaços.
  constraint testimonials_author_name_len
    check (char_length(btrim(author_name)) > 0 and char_length(author_name) <= 80),
  constraint testimonials_text_len
    check (char_length(btrim(text)) > 0 and char_length(text) <= 600),
  constraint testimonials_rating_valid
    check (rating is null or rating between 1 and 5)
);

comment on table public.testimonials is
  'Depoimento sobre o canil ou um cão/filhote específico. CONTEÚDO FORNECIDO PELO CRIADOR: ele insere, edita e remove; a OrigemX não verifica identidade do autor citado nem veracidade do relato. A responsabilidade pelo conteúdo é do criador que publica.';
comment on column public.testimonials.dog_id is
  'Vínculo opcional a um cão/filhote específico. Amarrado ao MESMO kennel_id por trigger (testimonials_check_dog_kennel) — depoimento não pode apontar para cão de outro canil.';
comment on column public.testimonials.published_at is
  'Mesmo conceito de kennels/dogs/kennel_litters: null = rascunho. Visibilidade pública exige ISTO E o canil publicado — ver testimonials_select.';
comment on column public.testimonials.rating is
  'Nota opcional, 1 a 5. Ausência de nota (NULL) não é nota zero — a UI omite as estrelas quando não há valor.';

create index testimonials_kennel_id_idx
  on public.testimonials (kennel_id, created_at desc)
  where deleted_at is null;

create index testimonials_dog_id_idx
  on public.testimonials (dog_id)
  where deleted_at is null and dog_id is not null;

create trigger testimonials_set_updated_at
  before update on public.testimonials
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- dog_id precisa pertencer ao MESMO canil do depoimento.
--
-- Não pode ser CHECK: exige consultar outra tabela. SECURITY DEFINER pelo
-- mesmo molde de dogs_check_litter_parents — mesmo que, aqui, o cão elegível
-- seja sempre do PRÓPRIO canil de quem está gravando (diferente do
-- reprodutor de ninhada, que pode ser de terceiro), a consistência com o
-- resto do projeto vale mais que a simplificação marginal de trocar por
-- SECURITY INVOKER.
-- -----------------------------------------------------------------------------

create or replace function public.testimonials_check_dog_kennel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dog_kennel uuid;
begin
  if new.dog_id is null then
    return new;
  end if;

  select d.kennel_id into v_dog_kennel
    from public.dogs d
   where d.id = new.dog_id;

  if v_dog_kennel is distinct from new.kennel_id then
    raise exception
      'dog_id (%) precisa pertencer ao mesmo canil do depoimento (%)',
      new.dog_id, new.kennel_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.testimonials_check_dog_kennel() from public, anon, authenticated;

create trigger testimonials_check_dog_kennel
  before insert or update of dog_id, kennel_id on public.testimonials
  for each row execute function public.testimonials_check_dog_kennel();

-- -----------------------------------------------------------------------------
-- media — testimonial_id como quarto braço do mesmo desenho de
-- kennel_id/dog_id/litter_id. Avatar é 1:1 OPCIONAL (como kennel_logo), não
-- galeria com posição (como litter_gallery) — sem coluna de posição
-- envolvida, só o índice único parcial de sempre.
-- -----------------------------------------------------------------------------

alter table public.media
  add column testimonial_id uuid references public.testimonials (id) on delete restrict;

alter table public.media drop constraint media_role_valid;
alter table public.media add constraint media_role_valid
  check (role in ('kennel_logo', 'dog_gallery', 'litter_gallery', 'testimonial_avatar'));

alter table public.media drop constraint media_single_owner;
alter table public.media add constraint media_single_owner check (
  (kennel_id is not null)::int
  + (dog_id is not null)::int
  + (litter_id is not null)::int
  + (testimonial_id is not null)::int
  = 1
);

alter table public.media drop constraint media_role_matches_owner;
alter table public.media add constraint media_role_matches_owner check (
  (role = 'kennel_logo' and kennel_id is not null)
  or (role = 'dog_gallery' and dog_id is not null)
  or (role = 'litter_gallery' and litter_id is not null)
  or (role = 'testimonial_avatar' and testimonial_id is not null)
);

create index media_testimonial_id_idx on public.media (testimonial_id) where deleted_at is null;

-- 1:1 opcional, mesmo mecanismo de media_one_logo_per_kennel: índice único
-- parcial, não contagem em trigger.
create unique index media_one_avatar_per_testimonial
  on public.media (testimonial_id)
  where role = 'testimonial_avatar' and deleted_at is null;

-- -----------------------------------------------------------------------------
-- private.owns_testimonial() — posse em DOIS saltos (media.testimonial_id →
-- testimonials.kennel_id → kennels.owner_id). testimonials usa
-- owns_kennel(kennel_id) direto nas próprias policies (um salto só). Este
-- helper existe só para o pulo de dentro de media_insert — mesmo molde de
-- owns_litter.
-- -----------------------------------------------------------------------------

create or replace function private.owns_testimonial(p_testimonial_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_testimonial_id is not null and exists (
    select 1
      from public.testimonials t
      join public.kennels k on k.id = t.kennel_id
     where t.id = p_testimonial_id
       and k.owner_id = (select auth.uid())
       and k.deleted_at is null
  );
$$;

comment on function private.owns_testimonial(uuid) is
  'Posse do depoimento, via dono do canil que o contém. Usada por media_insert para avatar de depoimento.';

grant execute on function private.owns_testimonial(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS — testimonials
--
-- select combina os dois padrões já estabelecidos no projeto: dois saltos
-- explícitos pro canil (mesma forma de kennel_litters_select) + EXISTS
-- delegado pro dog_id opcional (mesma forma de dog_health_records_select —
-- roda sob a RLS de quem consulta, só devolve linha se dogs_select já
-- deixaria aquele cão ser visto; não rederiva a regra de publicação do cão).
--
-- Nasce IMUNE ao bug que este projeto já pagou duas vezes
-- (fix_media_select_soft_delete, fix_dog_videos_select_soft_delete): a
-- cláusula do dono (owns_kennel) nem MENCIONA deleted_at/published_at da
-- própria linha — o dono sempre vê o próprio depoimento, publicado ou não,
-- excluído ou não.
-- -----------------------------------------------------------------------------

alter table public.testimonials enable row level security;
revoke all on public.testimonials from anon, authenticated;
grant select on public.testimonials to anon, authenticated;
grant insert, update on public.testimonials to authenticated;
-- Sem DELETE: exclusão é sempre lógica, como em toda tabela do projeto.

create policy testimonials_select
  on public.testimonials for select
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
      and (
        dog_id is null
        or exists (select 1 from public.dogs d where d.id = dog_id)
      )
    )
  );

create policy testimonials_insert
  on public.testimonials for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (private.owns_kennel(kennel_id) or private.is_admin())
    and not (select private.is_suspended())
  );

create policy testimonials_update
  on public.testimonials for update
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
-- RLS — media (as duas policies que crescem um quarto braço)
--
-- media_select: mesmo padrão de delegação dos outros três braços — media
-- existe → testimonials existe (já checa published_at/deleted_at do próprio
-- depoimento e do canil) → nada duplicado aqui.
--
-- media_insert: braço novo SEM `not is_suspended()`, e é deliberado, não
-- descuido. A checagem já falta nos outros três braços desta policy hoje —
-- foi perdida quando ninhadas_do_canil.sql recriou media_insert do zero
-- (a versão anterior, em painel_admin.sql, TINHA a checagem; media_update
-- também tem). Adicionar só no braço de testimonial_avatar tornaria ele
-- mais rígido que kennel_logo/dog_gallery/litter_gallery de forma
-- arbitrária, sem consertar a lacuna real. Lacuna pré-existente, registrada
-- aqui, não corrigida nesta migration.
--
-- media_update NÃO muda: já é owner_id-based, e o dono do avatar de
-- depoimento é o dono do canil — mesmo caminho que logo/galeria já seguem.
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
      or (testimonial_id is not null and exists (select 1 from public.testimonials t where t.id = testimonial_id))
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
      or (role = 'testimonial_avatar' and private.owns_testimonial(testimonial_id))
      or private.is_admin()
    )
  );
