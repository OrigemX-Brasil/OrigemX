-- =============================================================================
-- OrigemX — foto na medição de peso/cernelha
--
-- ---------------------------------------------------------------------------
-- QUINTO BRAÇO DE media, mesmo desenho de testimonial_id (depoimentos_do_canil):
-- 1:1 OPCIONAL, não galeria com posição. Uma medição tem no máximo UMA foto —
-- o registro daquele momento —, não um álbum.
-- ---------------------------------------------------------------------------
-- QUEM É DONO — mesmo raciocínio de owns_testimonial, um salto mais curto:
-- media.measurement_id → dog_measurements.dog_id → private.can_manage_dog().
-- dog_measurements já delega TODA a visibilidade a dogs_select (não tem
-- published_at próprio); a foto segue o mesmo caminho, sem reinventar regra.
-- ---------------------------------------------------------------------------
-- POR QUE ISTO DESTRAVA A STORY TIMELINE: `media` nunca teve uma data
-- confiável de "quando a foto foi tirada" — só `created_at` de upload (ver o
-- cabeçalho de `dogs/timeline.ts`). Uma foto presa a UMA medição herda a data
-- que já é confiável: `measured_on`, digitada pelo criador sabendo a data.
-- =============================================================================

alter table public.media
  add column measurement_id uuid references public.dog_measurements (id) on delete restrict;

alter table public.media drop constraint media_role_valid;
alter table public.media add constraint media_role_valid
  check (role in ('kennel_logo', 'dog_gallery', 'litter_gallery', 'testimonial_avatar', 'measurement_photo'));

alter table public.media drop constraint media_single_owner;
alter table public.media add constraint media_single_owner check (
  (kennel_id is not null)::int
  + (dog_id is not null)::int
  + (litter_id is not null)::int
  + (testimonial_id is not null)::int
  + (measurement_id is not null)::int
  = 1
);

alter table public.media drop constraint media_role_matches_owner;
alter table public.media add constraint media_role_matches_owner check (
  (role = 'kennel_logo' and kennel_id is not null)
  or (role = 'dog_gallery' and dog_id is not null)
  or (role = 'litter_gallery' and litter_id is not null)
  or (role = 'testimonial_avatar' and testimonial_id is not null)
  or (role = 'measurement_photo' and measurement_id is not null)
);

create index media_measurement_id_idx on public.media (measurement_id) where deleted_at is null;

-- 1:1 opcional, mesmo mecanismo de media_one_avatar_per_testimonial: índice
-- único parcial, não contagem em trigger.
create unique index media_one_photo_per_measurement
  on public.media (measurement_id)
  where role = 'measurement_photo' and deleted_at is null;

-- -----------------------------------------------------------------------------
-- private.owns_measurement() — posse em DOIS saltos (media.measurement_id →
-- dog_measurements.dog_id → can_manage_dog). Mesmo molde de owns_testimonial,
-- um salto mais curto porque dog_measurements não tem canil de por meio —
-- é sempre do CÃO, nunca do canil diretamente.
-- -----------------------------------------------------------------------------

create or replace function private.owns_measurement(p_measurement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_measurement_id is not null and exists (
    select 1
      from public.dog_measurements m
     where m.id = p_measurement_id
       and private.can_manage_dog(m.dog_id)
  );
$$;

comment on function private.owns_measurement(uuid) is
  'Posse da medição, via posse do cão dono dela. Usada por media_insert para foto de medição.';

grant execute on function private.owns_measurement(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS — media (as duas policies que crescem um quinto braço)
--
-- media_select: mesmo padrão de delegação dos outros quatro braços — media
-- existe → dog_measurements existe (já roda sob dog_measurements_select, que
-- por sua vez delega a dogs_select) → nada duplicado aqui. Foto de medição de
-- cão publicado é pública; de cão em rascunho, só o dono vê.
--
-- media_insert: braço novo com o mesmo formato dos outros quatro.
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
      or (measurement_id is not null and exists (select 1 from public.dog_measurements m where m.id = measurement_id))
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
      or (role = 'measurement_photo' and private.owns_measurement(measurement_id))
      or private.is_admin()
    )
  );
