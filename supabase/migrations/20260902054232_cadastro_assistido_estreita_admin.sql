-- =============================================================================
-- OrigemX — cadastro assistido: o admin escreve pela SESSÃO, não por ser admin
--
-- Esta migration ESTREITA. Hoje `or private.is_admin()` está solto em treze
-- policies de escrita, e `private.can_manage_dog` termina em `or
-- private.is_admin()` — somando, um admin escreve em vacina, exame genético,
-- microchip, vídeo, depoimento, FAQ, ninhada e mídia de QUALQUER criador, a
-- qualquer momento, sem deixar rastro. Só não havia tela.
--
-- Depois desta migration ele escreve nas mesmas tabelas, mas:
--   * apenas com uma sessão de cadastro assistido ABERTA;
--   * apenas nos registros do criador daquela sessão;
--   * e cada escrita vira linha de `audit_log` pelo trigger da migration
--     anterior, herdando o motivo declarado ao abrir.
--
-- É menos poder do que ele tem hoje, e com trilha. O que ele GANHA é a tela: os
-- carregadores do painel do dono passam a abrir para ele, então o cadastro
-- completo — cidade do canil, filhotes da ninhada, identificadores, saúde,
-- exames, medidas, vídeo, FAQ, depoimentos — finalmente é possível.
--
-- =============================================================================
-- O MECANISMO É UM `in (...)`, E ISSO NÃO É ATALHO
-- =============================================================================
--
-- Toda posse neste schema se expressa do mesmo jeito: `owner_id = (select
-- auth.uid())`. Então "posso agir como o dono" vira:
--
--     owner_id in ((select auth.uid()), (select private.assisting_profile()))
--
-- Os dois lados são InitPlan — avaliados UMA vez por consulta, não por linha.
-- Uma função que recebesse a linha seria avaliada por linha e, sendo SECURITY
-- DEFINER, não seria inlinada: foi assim que `can_write_storage_prefix` derrubou
-- o `list` do Storage em timeout (ver `admin_le_storage_do_dono`).
--
-- `assisting_profile()` devolve NULL sem sessão. `x in (a, NULL)` é NULL quando
-- `x <> a`, e NULL em `where`/`exists` se comporta como falso — então o
-- comportamento sem sessão é exatamente o de hoje para o dono, e negação para o
-- admin. Sem ramo extra e sem `if`.
--
-- `created_by` NÃO ganha o ramo de assistência, de propósito: ele registra quem
-- de fato cadastrou, e assistir não reescreve autoria.
--
-- NO INSERT A REGRA É MAIS DURA, e a diferença importa:
--
--     owner_id = coalesce((select private.assisting_profile()), (select auth.uid()))
--
-- Com o `in (...)`, `owner_id = auth.uid()` continuaria válido DURANTE a sessão
-- — e essa é a forma exata do defeito que levou quatro fotos de um criador a
-- nascerem com o admin como dono. Sob sessão, o que se cria pertence ao ALVO, e
-- ponto; fora dela, a quem está logado. O UPDATE segue com `in (...)`, porque
-- ali o admin pode legitimamente tocar tanto o registro do alvo quanto o seu.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Os quatro predicados de posse
--
-- `owns_measurement` fica de fora da lista porque delega a `can_manage_dog` —
-- herda a mudança sem uma linha sequer.
-- -----------------------------------------------------------------------------

create or replace function private.owns_kennel(p_kennel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_kennel_id is not null and exists (
    select 1
      from public.kennels k
     where k.id = p_kennel_id
       and k.owner_id in ((select auth.uid()), (select private.assisting_profile()))
       and k.deleted_at is null
  );
$$;

comment on function private.owns_kennel(uuid) is
  'True se a sessão pode agir sobre o canil como dono: é o dono, ou é um admin com cadastro assistido aberto para o dono. NÃO responde mais true para admin sem sessão.';

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
       and k.owner_id in ((select auth.uid()), (select private.assisting_profile()))
       and k.deleted_at is null
  );
$$;

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
       and k.owner_id in ((select auth.uid()), (select private.assisting_profile()))
       and k.deleted_at is null
  );
$$;

-- Duas mudanças aqui, e a segunda só apareceu quando a bateria rodou.
--
-- 1. O `or private.is_admin()` SAI. Era ele que dava a um admin escrita
--    silenciosa em identificador, saúde, exame genético e medida de qualquer
--    cão do banco — as quatro tabelas autorizam só por esta função.
--
-- 2. `created_by` passa a valer SÓ PARA CÃO SEM DONO. Sem isso o
--    estreitamento seria decorativo justamente onde mais importa: todo cão que
--    um admin cadastra por `admin_create_dog_for_kennel` nasce com
--    `created_by` dele, então ele mantinha escrita naquele cão para sempre,
--    fora de qualquer sessão e sem trilha. O caso 118 da bateria pegou isso —
--    antes desta linha ele respondia "ACEITOU — ESCRITA SILENCIOSA EM
--    PRONTUÁRIO".
--
--    O ramo continua existindo porque o ANCESTRAL FANTASMA depende dele: ele é
--    definido por `owner_id` e `kennel_id` nulos, e quem o cadastrou é o único
--    que consegue gerenciá-lo. Com dono, quem manda é o dono — ou uma sessão de
--    cadastro assistido aberta para ele.
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
            d.owner_id in ((select auth.uid()), (select private.assisting_profile()))
         or (d.owner_id is null and d.created_by = (select auth.uid()))
         or k.owner_id in ((select auth.uid()), (select private.assisting_profile()))
       )
  );
$$;

comment on function private.can_manage_dog(uuid) is
  'Posse do cão: dono, autor do cadastro, dono do canil — ou admin com cadastro assistido aberto para qualquer um deles. NÃO usar nas policies da própria tabela dogs (ver private.owns_kennel).';


-- -----------------------------------------------------------------------------
-- 2. dogs
--
-- `owner_id` ganha o ramo de assistência porque é ele que decide de QUEM é o cão
-- criado. Sem isso, o admin assistindo criaria cão em nome próprio dentro do
-- canil alheio — que é a mesma classe de defeito que fez quatro fotos nascerem
-- com `owner_id` de admin.
-- -----------------------------------------------------------------------------

drop policy dogs_insert on public.dogs;
create policy dogs_insert
  on public.dogs for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and not (select private.is_suspended())
    and (kennel_id is null or private.owns_kennel(kennel_id))
    and (litter_id is null or private.owns_litter(litter_id))
    and (
      owner_id is null
      or owner_id = coalesce((select private.assisting_profile()), (select auth.uid()))
    )
  );

drop policy dogs_update on public.dogs;
create policy dogs_update
  on public.dogs for update
  to authenticated
  using (
    not (select private.is_suspended())
    and (
      owner_id in ((select auth.uid()), (select private.assisting_profile()))
      or created_by = (select auth.uid())
      or private.owns_kennel(kennel_id)
    )
  )
  with check (
    not (select private.is_suspended())
    and (
      owner_id in ((select auth.uid()), (select private.assisting_profile()))
      or created_by = (select auth.uid())
      or private.owns_kennel(kennel_id)
    )
    and (kennel_id is null or private.owns_kennel(kennel_id))
    and (litter_id is null or private.owns_litter(litter_id))
  );


-- -----------------------------------------------------------------------------
-- 3. kennels
-- -----------------------------------------------------------------------------

drop policy kennels_update_own on public.kennels;
create policy kennels_update_own
  on public.kennels for update
  to authenticated
  using (
    owner_id in ((select auth.uid()), (select private.assisting_profile()))
    and not (select private.is_suspended())
  )
  with check (
    owner_id in ((select auth.uid()), (select private.assisting_profile()))
    and not (select private.is_suspended())
  );


-- -----------------------------------------------------------------------------
-- 4. As que só delegam a `owns_kennel` — perdem o `or is_admin()` e pronto
-- -----------------------------------------------------------------------------

drop policy kennel_litters_insert on public.kennel_litters;
create policy kennel_litters_insert
  on public.kennel_litters for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and private.owns_kennel(kennel_id)
    and not (select private.is_suspended())
  );

drop policy kennel_litters_update on public.kennel_litters;
create policy kennel_litters_update
  on public.kennel_litters for update
  to authenticated
  using (private.owns_kennel(kennel_id) and not (select private.is_suspended()))
  with check (private.owns_kennel(kennel_id) and not (select private.is_suspended()));

drop policy kennel_faqs_insert on public.kennel_faqs;
create policy kennel_faqs_insert
  on public.kennel_faqs for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and private.owns_kennel(kennel_id)
    and not (select private.is_suspended())
  );

drop policy kennel_faqs_update on public.kennel_faqs;
create policy kennel_faqs_update
  on public.kennel_faqs for update
  to authenticated
  using (private.owns_kennel(kennel_id) and not (select private.is_suspended()))
  with check (private.owns_kennel(kennel_id) and not (select private.is_suspended()));

drop policy testimonials_insert on public.testimonials;
create policy testimonials_insert
  on public.testimonials for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and private.owns_kennel(kennel_id)
    and not (select private.is_suspended())
  );

drop policy testimonials_update on public.testimonials;
create policy testimonials_update
  on public.testimonials for update
  to authenticated
  using (private.owns_kennel(kennel_id) and not (select private.is_suspended()))
  with check (private.owns_kennel(kennel_id) and not (select private.is_suspended()));


-- -----------------------------------------------------------------------------
-- 5. dog_videos e media — as que carregam `owner_id` próprio
-- -----------------------------------------------------------------------------

drop policy dog_videos_insert on public.dog_videos;
create policy dog_videos_insert
  on public.dog_videos for insert
  to authenticated
  with check (
    owner_id = coalesce((select private.assisting_profile()), (select auth.uid()))
    and created_by = (select auth.uid())
    and private.can_manage_dog(dog_id)
    and not (select private.is_suspended())
  );

drop policy dog_videos_update on public.dog_videos;
create policy dog_videos_update
  on public.dog_videos for update
  to authenticated
  using (
    owner_id in ((select auth.uid()), (select private.assisting_profile()))
    and not (select private.is_suspended())
  )
  with check (
    owner_id in ((select auth.uid()), (select private.assisting_profile()))
    and not (select private.is_suspended())
  );

drop policy media_insert on public.media;
create policy media_insert
  on public.media for insert
  to authenticated
  with check (
    owner_id = coalesce((select private.assisting_profile()), (select auth.uid()))
    and created_by = (select auth.uid())
    and not (select private.is_suspended())
    and (
      (role = 'kennel_logo'        and private.owns_kennel(kennel_id))
      or (role = 'dog_gallery'     and private.can_manage_dog(dog_id))
      or (role = 'litter_gallery'  and private.owns_litter(litter_id))
      or (role = 'testimonial_avatar' and private.owns_testimonial(testimonial_id))
      or (role = 'measurement_photo'  and private.owns_measurement(measurement_id))
    )
  );

-- ATENÇÃO — `media_update` MANTÉM `or private.is_admin()`, e é a única exceção
-- desta migration. Não é esquecimento:
--
-- `reconcileMediaBucket` (src/modules/media/sync.ts) grava `media.bucket_id` ao
-- mover arquivo entre os buckets, e ele roda DENTRO de `setDogPublishedByAdmin`
-- e `setKennelPublishedByAdmin` — que são publicação por admin, auditada pela
-- própria RPC, e acontecem SEM sessão de cadastro assistido. Estreitar aqui
-- quebraria publicar-com-imagem, que foi consertado ontem.
--
-- O que sobra de risco: um admin pode alterar `alt`/`deleted_at` de mídia alheia
-- sem sessão e sem trilha. Não dá para restringir por COLUNA numa policy. Fechar
-- isso exige mover o `bucket_id` para uma SECURITY DEFINER própria — trabalho
-- real, escopo próprio, e anotado aqui para não se perder.
--
-- Sob sessão aberta, o trigger `media_audit_assist` audita normalmente.
drop policy media_update on public.media;
create policy media_update
  on public.media for update
  to authenticated
  using (
    (
      owner_id in ((select auth.uid()), (select private.assisting_profile()))
      or private.is_admin()
    )
    and not (select private.is_suspended())
  )
  with check (
    (
      owner_id in ((select auth.uid()), (select private.assisting_profile()))
      or private.is_admin()
    )
    and not (select private.is_suspended())
  );
