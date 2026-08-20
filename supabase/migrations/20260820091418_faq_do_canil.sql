-- =============================================================================
-- OrigemX — FAQ editável pelo criador
--
-- ---------------------------------------------------------------------------
-- MAIS SIMPLES QUE DEPOIMENTOS, DE PROPÓSITO
-- ---------------------------------------------------------------------------
-- Sem vínculo com cão, sem foto, sem `published_at` PRÓPRIO — o pedido não
-- tem rascunho por pergunta, só "adicionar/editar/remover/reordenar". Toda
-- pergunta cadastrada fica visível assim que o CANIL está publicado; se o
-- criador quer uma pergunta "ainda não pronta", ele simplesmente não a
-- cadastra ainda, mesmo critério que `kennels.description` já segue.
--
-- `position` existe para reordenação livre (não é slot fixo como
-- `litter_gallery`): a aplicação renumera a lista inteira a cada movimento,
-- mesmo mecanismo que `setDogGalleryCover` já usa para a capa da galeria do
-- cão, generalizado de "mover 1 pro topo" para "trocar a posição de 2".
-- =============================================================================

create table public.kennel_faqs (
  id            uuid primary key default gen_random_uuid(),
  kennel_id     uuid not null references public.kennels (id) on delete restrict,

  question      text not null,
  answer        text not null,
  position      integer not null default 0,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  -- Mesmo par de metades dos CHECKs de texto do projeto (media.caption,
  -- kennel_litters.description): btrim barra vazio/só-espaço, a medida CRUA
  -- barra o texto no limite cercado de espaços.
  constraint kennel_faqs_question_len
    check (char_length(btrim(question)) > 0 and char_length(question) <= 150),
  constraint kennel_faqs_answer_len
    check (char_length(btrim(answer)) > 0 and char_length(answer) <= 600)
);

comment on table public.kennel_faqs is
  'Perguntas frequentes do canil, editadas pelo próprio criador. Cada canil tem o próprio conjunto — não existe FAQ global nem compartilhado.';
comment on column public.kennel_faqs.position is
  'Ordem de exibição. Renumerada por completo a cada reordenação (nunca "furo") — a aplicação recalcula 0..N-1 e grava tudo de novo, mesmo mecanismo de setDogGalleryCover.';

-- Sem `owner_id`: FAQ não tem posse própria, sempre derivada de `kennel_id`
-- via `private.owns_kennel()` — mesmo raciocínio de `kennel_litters` e
-- `testimonials`.
create index kennel_faqs_kennel_id_idx
  on public.kennel_faqs (kennel_id, position)
  where deleted_at is null;

create trigger kennel_faqs_set_updated_at
  before update on public.kennel_faqs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — mirror de `kennel_litters`, sem a metade de `published_at` PRÓPRIO
-- (FAQ não tem): só a própria linha viva + o canil publicado.
--
-- Nasce IMUNE ao bug que este projeto já pagou duas vezes
-- (fix_media_select_soft_delete, fix_dog_videos_select_soft_delete): a
-- cláusula do dono (owns_kennel) nem MENCIONA deleted_at da própria linha —
-- o dono sempre vê a própria pergunta, excluída ou não.
-- -----------------------------------------------------------------------------

alter table public.kennel_faqs enable row level security;
revoke all on public.kennel_faqs from anon, authenticated;
grant select on public.kennel_faqs to anon, authenticated;
grant insert, update on public.kennel_faqs to authenticated;
-- Sem DELETE: exclusão é sempre lógica, como em toda tabela do projeto.

create policy kennel_faqs_select
  on public.kennel_faqs for select
  to anon, authenticated
  using (
    private.owns_kennel(kennel_id)
    or private.is_admin()
    or (
      deleted_at is null
      and exists (
        select 1 from public.kennels k
         where k.id = kennel_id
           and k.deleted_at is null
           and k.published_at is not null
      )
    )
  );

create policy kennel_faqs_insert
  on public.kennel_faqs for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (private.owns_kennel(kennel_id) or private.is_admin())
    and not (select private.is_suspended())
  );

create policy kennel_faqs_update
  on public.kennel_faqs for update
  to authenticated
  using (
    (private.owns_kennel(kennel_id) or private.is_admin())
    and not (select private.is_suspended())
  )
  with check (
    (private.owns_kennel(kennel_id) or private.is_admin())
    and not (select private.is_suspended())
  );
