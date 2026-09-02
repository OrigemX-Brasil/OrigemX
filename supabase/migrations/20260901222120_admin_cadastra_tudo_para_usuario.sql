-- =============================================================================
-- OrigemX — admin cadastra CANIL, MÍDIA e PUBLICA em nome de outro usuário
--
-- Continuação de `20260901005614_admin_cadastra_para_usuario.sql`, que abriu cão
-- e ninhada. Faltava o primeiro degrau: quem ainda não tem canil não tinha
-- nenhum ponto de entrada, porque cão e ninhada exigem canil de destino. Era o
-- que o painel mostrava como "Canis 0" sem oferecer nada.
--
-- MESMO MOLDE, e pelo mesmo motivo: `private.audit()` não tem EXECUTE para
-- ninguém e `audit_log` não tem GRANT nem policy de INSERT. Não existe caminho
-- da aplicação até uma linha de auditoria — ela só nasce dentro de uma SECURITY
-- DEFINER com dono `postgres`. E as duas coisas precisam ser UMA transação: o
-- PostgREST não dá transação entre chamadas, então "escreve via RLS, depois
-- audita" deixa aberta a janela em que o registro existe e a auditoria não.
--
-- O QUE MUDA DE PATAMAR AQUI, e precisa ficar registrado:
--
--   1. `kennels_insert_own` NÃO é alargada. Ela exige `auth.uid() = owner_id` e
--      nunca teve `or private.is_admin()` — ao contrário de `dogs_insert`, que
--      tinha o furo corrigido na migration anterior. A RPC da seção 2 é a única
--      porta, por construção, e a policy segue máxima.
--
--   2. AS POLICIES DE STORAGE SÃO ALARGADAS, e não há alternativa. O upload vai
--      do navegador DIRETO para o Storage (`src/modules/media/upload-one.ts`),
--      por HTTP, sem passar por Postgres. Não existe como funilar o binário por
--      uma SECURITY DEFINER. A mitigação possível é exigir que o primeiro
--      segmento do caminho seja um perfil VIVO — ver a seção 6.
--      CONSEQUÊNCIA ACEITA: o upload em si não fica auditado; só o REGISTRO em
--      `media` fica.
--
--   3. PUBLICAR VIRA AÇÃO AUDITADA. Não é porta nova: `dogs_update` e
--      `kennels_update_own` já carregam `or private.is_admin()`, e
--      `publishDog`/`publishKennel` nunca filtraram posse — um admin já
--      publicava qualquer registro, sem rastro nenhum. Esta migration troca uma
--      porta silenciosa por uma auditada.
--
-- ARMADILHA PARA QUEM MEXER DEPOIS (a mesma da migration anterior):
-- `create or replace function` NÃO adiciona parâmetro. Acrescentar um cria uma
-- SEGUNDA função com o mesmo nome, e o PostgREST passa a responder
-- `300 Multiple Choices` em TODA chamada. Coluna nova exige `drop function ...`
-- com a lista completa de tipos — a mesma que está no revoke/grant no fim.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. O vocabulário do audit_log
--
-- Lista FECHADA de propósito: ação nova nasce na mesma migration que a função
-- que a grava. Convenção da casa é `entidade.verbo`, porque
-- `audit_log_action_matches_entity` exige `split_part(action,'.',1) = entity_type`.
--
-- `dog.publish`/`dog.unpublish` são PARES SEPARADOS, não um `dog.set_published`
-- com booleano no `details`: é a mesma escolha já feita em `hide`/`unhide`, e
-- ela existe para que "o que este admin colocou no ar" seja um `where action =`
-- e não um `where action = ... and details->>...`, que alguém erraria depois.
--
-- `media.create_for_user` NÃO tem par de exclusão. Remover mídia continua sendo
-- `deleteMedia` sob RLS, fora do escopo desta migration.
-- -----------------------------------------------------------------------------

alter table public.audit_log drop constraint audit_log_action_valid;
alter table public.audit_log add constraint audit_log_action_valid check (action in (
  'profile.suspend', 'profile.unsuspend',
  'kennel.hide',     'kennel.unhide',
  'dog.hide',        'dog.unhide',
  'kennel.founder_number.set',
  'dog.create_for_user',
  'litter.create_for_user',
  'kennel.create_for_user',
  'media.create_for_user',
  'dog.publish',     'dog.unpublish',
  'kennel.publish',  'kennel.unpublish'
));

alter table public.audit_log drop constraint audit_log_entity_valid;
alter table public.audit_log add constraint audit_log_entity_valid
  check (entity_type in ('profile', 'kennel', 'dog', 'litter', 'media'));

-- `audit_log_action_matches_entity` fica INALTERADA: compara só o segmento 1, e
-- `kennel.founder_number.set` já provava que profundidade maior que 2 é legal.


-- -----------------------------------------------------------------------------
-- 2. Canil em nome de outra pessoa
--
-- O primeiro degrau. Sem isto, nenhum dos cadastros da migration anterior tem
-- onde acontecer para um usuário recém-chegado.
--
-- NASCE RASCUNHO, SEMPRE. Não existe `p_published_at`: publicar é a seção 5,
-- com auditoria própria. Manter separado é o que impede "criou" e "colocou no
-- ar" de virarem a mesma linha de log — duas decisões, dois rastros.
--
-- NÃO NORMALIZA. Quem normaliza (whatsapp só dígitos, @ fora do handle, UF em
-- maiúscula) é `normalizeKennelInput` em `src/modules/kennels/validation.ts`, e
-- duplicar aquilo aqui criaria duas definições que divergiriam na primeira
-- mudança de regra. Aqui só `btrim`/`nullif` e as checagens que os CHECKs do
-- banco já fariam — repetidas apenas para dar mensagem que explique o problema
-- a quem chamou a RPC direto.
-- -----------------------------------------------------------------------------

create or replace function public.admin_create_kennel_for_user(
  -- Obrigatórios primeiro: destino, identidade mínima e o motivo. A cauda é a
  -- zona de crescimento — campo novo entra sempre no fim.
  p_owner_id            uuid,
  p_name                text,
  p_slug                text,
  p_reason              text,
  -- O resto do formulário, na ordem de KENNEL_FIELDS.
  p_description         text default null,
  p_city                text default null,
  p_state               text default null,
  p_website_url         text default null,
  p_instagram_handle    text default null,
  p_whatsapp            text default null,
  p_registration_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name       text := nullif(btrim(p_name), '');
  v_slug       text := lower(nullif(btrim(p_slug), ''));
  v_kennel_id  uuid;
  v_constraint text;
begin
  -- Cobre admin SUSPENSO de graça: `private.is_admin()` já exige
  -- `suspended_at is null`.
  if not private.is_admin() then
    raise exception 'apenas um admin pode cadastrar um canil em nome de outra pessoa'
      using errcode = 'insufficient_privilege';
  end if;

  if v_name is null then
    raise exception 'o nome do canil é obrigatório'
      using errcode = 'check_violation';
  end if;

  -- Espelha `kennels_slug_format` e `kennels_slug_length`.
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'endereço inválido: use apenas letras minúsculas, números e hífens'
      using errcode = 'check_violation';
  end if;

  if length(v_slug) not between 3 and 60 then
    raise exception 'o endereço precisa ter entre 3 e 60 caracteres'
      using errcode = 'check_violation';
  end if;

  -- O DESTINO precisa existir e estar vivo.
  --
  -- `for update` não é decorativo: ele SERIALIZA duas criações simultâneas para
  -- o mesmo dono. Sem ele, `kennels_owner_uk` ainda pegaria a corrida, mas com
  -- 23505 cru; com ele, a segunda chamada espera e cai no caminho de mensagem
  -- boa. De quebra fecha o TOCTOU do perfil sendo excluído entre a checagem e o
  -- INSERT.
  perform 1
     from public.profiles p
    where p.id = p_owner_id
      and p.deleted_at is null
    for update;

  if not found then
    raise exception 'usuário % não existe ou está excluído', p_owner_id
      using errcode = 'no_data_found';
  end if;

  -- SEM checagem prévia de "já tem canil": o handler de `unique_violation` lá
  -- embaixo já traduz `kennels_owner_uk`, e uma segunda checagem aqui seria um
  -- caminho paralelo que diverge do índice na primeira mudança de regra.
  insert into public.kennels (
    name, slug, description, city, state,
    website_url, instagram_handle, whatsapp, registration_number,
    owner_id, created_by, published_at
  ) values (
    v_name,
    v_slug,
    nullif(btrim(p_description), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_state), ''),
    nullif(btrim(p_website_url), ''),
    nullif(btrim(p_instagram_handle), ''),
    nullif(btrim(p_whatsapp), ''),
    nullif(btrim(p_registration_number), ''),
    p_owner_id,           -- o DONO é o alvo, nunca o admin
    (select auth.uid()),  -- a AUTORIA é o admin
    null                  -- rascunho; publicar é a seção 5
  )
  returning id into v_kennel_id;

  perform private.audit(
    'kennel.create_for_user',
    'kennel',
    v_kennel_id,
    p_reason,
    jsonb_build_object(
      'owner_id', p_owner_id,
      'nome',     v_name,
      -- O slug vai para o log porque é IRREVERSÍVEL: `kennels_slug_key` é
      -- global e NÃO parcial por `deleted_at`, então este endereço fica
      -- queimado para sempre, mesmo se o canil for excluído depois. Um admin
      -- escolheu o endereço público definitivo de outra pessoa; isso precisa
      -- ter dono no rastro.
      'slug',     v_slug
    )
  );

  return v_kennel_id;

exception
  -- Os dois índices chegam como 23505 e só o nome os distingue — mesma
  -- situação que `translateKennelError` resolve do lado da aplicação.
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;

    if v_constraint = 'kennels_owner_uk' then
      raise exception 'este usuário já tem um canil; cada criador tem no máximo um canil vivo'
        using errcode = 'unique_violation';
    end if;

    if v_constraint = 'kennels_slug_key' then
      raise exception 'o endereço "%" já está em uso — e fica reservado para sempre, mesmo que o canil dele tenha sido excluído', v_slug
        using errcode = 'unique_violation';
    end if;

    raise;
end;
$$;

comment on function public.admin_create_kennel_for_user(uuid, text, text, text, text, text, text, text, text, text, text) is
  'Cria um canil PERTENCENTE a p_owner_id, com created_by = admin e uma linha de audit_log na mesma transação. Nasce rascunho: publicar é admin_set_kennel_published. O slug fica queimado para sempre.';


-- -----------------------------------------------------------------------------
-- 3. Metadata de mídia em nome do dono
--
-- O BINÁRIO NÃO PASSA POR AQUI. Ele já subiu para o Storage pelo navegador,
-- autorizado pelas policies da seção 6. Esta função registra a LINHA — e é o
-- único lugar em que a autoria dessa mídia fica gravada.
--
-- NÃO ACREDITA NO CLIENT em nada que o banco possa conferir sozinho:
--   - `owner_id` sai da ENTIDADE (canil ou cão), nunca de parâmetro;
--   - `mime` e `size_bytes` são LIDOS de `storage.objects`, não recebidos. É a
--     mesma decisão de `registerMedia`, que chama `statStorageObject` em vez de
--     confiar no formulário — aqui dá para fazer em SQL, sem viagem extra;
--   - o caminho TEM de começar pelo id do dono. A policy de storage já barra o
--     upload fora do prefixo, mas sem esta linha um admin poderia registrar
--     metadata apontando para o arquivo de outra pessoa.
--
-- O QUE FICA NA APLICAÇÃO, de propósito: quota (`MAX_USER_BYTES`) e teto de
-- galeria (`MAX_GALLERY_ITEMS`). São limites de PLANO, não invariantes de
-- segurança, e duplicar as constantes aqui criaria dois números que divergiriam.
-- `registerMediaForUser` os aplica antes de chamar esta função.
--
-- SÓ DOIS PAPÉIS. `testimonial_avatar` e `measurement_photo` existem na tabela
-- mas ficam fora: nenhuma tela de admin os oferece, e papel que não tem tela não
-- ganha porta.
-- -----------------------------------------------------------------------------

create or replace function public.admin_register_media_for_user(
  p_role         text,
  p_entity_id    uuid,
  p_storage_path text,
  p_reason       text,
  p_thumb_path   text    default null,
  p_width        integer default null,
  p_height       integer default null,
  p_alt          text    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id       uuid;
  v_kennel_id      uuid;
  v_founder_before integer;
  v_founder_after  integer;
  v_mime           text;
  v_size           integer;
  v_thumb_bytes    integer;
  v_prefix         text;
  v_media_id       uuid;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode registrar mídia em nome de outra pessoa'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role is null or p_role not in ('kennel_logo', 'dog_gallery') then
    raise exception 'papel de mídia inválido para cadastro por admin: %', coalesce(p_role, 'nulo')
      using errcode = 'check_violation';
  end if;

  if nullif(btrim(p_storage_path), '') is null then
    raise exception 'o caminho do arquivo é obrigatório'
      using errcode = 'check_violation';
  end if;

  -- O DONO sai da ENTIDADE.
  --
  -- `for update` no CANIL, e a ordem importa pelo mesmo motivo da RPC de cão: o
  -- AFTER INSERT `media_assign_founder` chama `try_assign_founder_number()`,
  -- que trava esta mesma linha de `kennels`. Pegando o lock primeiro, o re-lock
  -- lá dentro é no-op; na ordem inversa, é deadlock.
  if p_role = 'kennel_logo' then
    select k.owner_id, k.id, k.founder_number
      into v_owner_id, v_kennel_id, v_founder_before
      from public.kennels k
     where k.id = p_entity_id
       and k.deleted_at is null
     for update;

    if not found then
      raise exception 'canil % não existe ou está excluído', p_entity_id
        using errcode = 'no_data_found';
    end if;
  else
    select d.owner_id, d.kennel_id
      into v_owner_id, v_kennel_id
      from public.dogs d
     where d.id = p_entity_id
       and d.deleted_at is null;

    if not found then
      raise exception 'cão % não existe ou está excluído', p_entity_id
        using errcode = 'no_data_found';
    end if;
  end if;

  -- `dogs.owner_id` é NULLABLE — é o ancestral fantasma, que existe só como nó
  -- de árvore. Ele não tem dono a quem cobrar armazenamento nem prefixo de
  -- caminho para validar, então não recebe galeria por esta porta.
  if v_owner_id is null then
    raise exception 'o registro % não tem dono; não há a quem atribuir a mídia', p_entity_id
      using errcode = 'check_violation';
  end if;

  v_prefix := (storage.foldername(p_storage_path))[1];
  if v_prefix is distinct from v_owner_id::text then
    raise exception 'o caminho precisa começar pelo id do dono (%), e começa por "%"',
      v_owner_id, coalesce(v_prefix, 'nada')
      using errcode = 'check_violation';
  end if;

  if p_thumb_path is not null
     and (storage.foldername(p_thumb_path))[1] is distinct from v_owner_id::text then
    raise exception 'o caminho da miniatura precisa começar pelo id do dono (%)', v_owner_id
      using errcode = 'check_violation';
  end if;

  -- A VERDADE sobre o arquivo vem do Storage, não do formulário.
  select (o.metadata->>'size')::integer, o.metadata->>'mimetype'
    into v_size, v_mime
    from storage.objects o
   where o.bucket_id = 'kennel-media'
     and o.name = p_storage_path;

  if not found then
    raise exception 'arquivo não encontrado no armazenamento: %', p_storage_path
      using errcode = 'no_data_found';
  end if;

  if p_thumb_path is not null then
    select (o.metadata->>'size')::integer
      into v_thumb_bytes
      from storage.objects o
     where o.bucket_id = 'kennel-media'
       and o.name = p_thumb_path;
  end if;

  -- Logo é 1:1. O antigo sai antes de o novo entrar, senão
  -- `media_one_logo_per_kennel` recusa a inserção — mesma sequência de
  -- `registerMedia`, com a diferença de que aqui as duas operações estão na
  -- MESMA transação, então não existe janela sem logo nenhum.
  if p_role = 'kennel_logo' then
    update public.media
       set deleted_at = now()
     where kennel_id = p_entity_id
       and role = 'kennel_logo'
       and deleted_at is null;
  end if;

  insert into public.media (
    bucket_id, storage_path, thumb_path,
    kennel_id, dog_id, role,
    mime, size_bytes, thumb_bytes, width, height, alt,
    owner_id, created_by
  ) values (
    'kennel-media',
    p_storage_path,
    p_thumb_path,
    case when p_role = 'kennel_logo' then p_entity_id end,
    case when p_role = 'dog_gallery' then p_entity_id end,
    p_role,
    v_mime,
    v_size,
    v_thumb_bytes,
    p_width,
    p_height,
    nullif(btrim(p_alt), ''),
    v_owner_id,           -- o DONO da entidade, nunca o admin
    (select auth.uid())   -- a AUTORIA é o admin
  )
  returning id into v_media_id;

  -- O selo Fundador é efeito COLATERAL do AFTER INSERT acima: `media_assign_founder`
  -- dispara quando `role = 'kennel_logo'`, e o logo costuma ser a ÚLTIMA peça
  -- que falta (`kennel_is_founder_eligible` pede nome, cidade, estado, logo e
  -- ao menos um cão). Ou seja: é aqui, mais do que em qualquer outra porta de
  -- admin, que um número da sequence pode queimar — e
  -- `kennels_freeze_founder_number` torna isso IRREVERSÍVEL. Reler não desfaz
  -- nada; serve para a trilha dizer que foi ESTA ação de admin que queimou.
  if p_role = 'kennel_logo' then
    select k.founder_number into v_founder_after
      from public.kennels k
     where k.id = v_kennel_id;
  end if;

  perform private.audit(
    'media.create_for_user',
    'media',
    v_media_id,
    p_reason,
    jsonb_build_object(
      'owner_id',     v_owner_id,
      'role',         p_role,
      'entity_id',    p_entity_id,
      'kennel_id',    v_kennel_id,
      'storage_path', p_storage_path,
      'size_bytes',   v_size,
      'founder_number_atribuido',
        case when v_founder_before is null then v_founder_after end
    )
  );

  return v_media_id;
end;
$$;

comment on function public.admin_register_media_for_user(text, uuid, text, text, text, integer, integer, text) is
  'Registra metadata de imagem PERTENCENTE ao dono da entidade, com created_by = admin e auditoria na mesma transação. mime/size vêm de storage.objects, nunca do chamador. Quota e teto de galeria ficam na aplicação.';


-- -----------------------------------------------------------------------------
-- 4. Publicar/despublicar CÃO, com rastro
--
-- Molde de `admin_set_dog_hidden`: no-op quando o estado já é o pedido (para
-- não poluir a trilha com linha que não mudou nada), `for update` para
-- serializar, e o par de ações separado.
--
-- SÓ MEXE NA COLUNA. A movimentação dos arquivos entre o bucket privado e o
-- público NÃO cabe aqui: `reconcileMediaBucket` fala HTTP com o Storage, não
-- SQL. Quem orquestra é a Server Action, que copia PRIMEIRO e só então chama
-- esta função — a mesma ordem de `publishDog`, e pela mesma razão: publicar a
-- linha antes de o arquivo estar acessível deixaria a página pública com imagem
-- quebrada.
-- -----------------------------------------------------------------------------

create or replace function public.admin_set_dog_published(
  p_dog_id    uuid,
  p_published boolean,
  p_reason    text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old      timestamptz;
  v_new      timestamptz;
  v_owner_id uuid;
  v_kennel   uuid;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode publicar ou despublicar um cão em nome de outra pessoa'
      using errcode = 'insufficient_privilege';
  end if;

  select d.published_at, d.owner_id, d.kennel_id
    into v_old, v_owner_id, v_kennel
    from public.dogs d
   where d.id = p_dog_id
     and d.deleted_at is null
   for update;

  if not found then
    raise exception 'cão % não existe ou está excluído', p_dog_id
      using errcode = 'no_data_found';
  end if;

  if (v_old is not null) = p_published then
    return v_old;
  end if;

  v_new := case when p_published then now() end;

  update public.dogs set published_at = v_new where id = p_dog_id;

  perform private.audit(
    case when p_published then 'dog.publish' else 'dog.unpublish' end,
    'dog',
    p_dog_id,
    p_reason,
    jsonb_build_object(
      'owner_id',  v_owner_id,
      'kennel_id', v_kennel,
      'de',        v_old,
      'para',      v_new
    )
  );

  return v_new;
end;
$$;

comment on function public.admin_set_dog_published(uuid, boolean, text) is
  'Publica ou despublica um cão por decisão administrativa, com auditoria. NÃO move arquivo: a Server Action reconcilia o bucket antes de chamar.';


-- -----------------------------------------------------------------------------
-- 5. Publicar/despublicar CANIL, com rastro
--
-- Idêntica à anterior. Despublicar canil tem consequência maior — a regra dupla
-- esconde tudo que pende dele —, mas isso é comportamento das policies de
-- leitura, não desta função.
-- -----------------------------------------------------------------------------

create or replace function public.admin_set_kennel_published(
  p_kennel_id uuid,
  p_published boolean,
  p_reason    text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old      timestamptz;
  v_new      timestamptz;
  v_owner_id uuid;
  v_slug     text;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode publicar ou despublicar um canil em nome de outra pessoa'
      using errcode = 'insufficient_privilege';
  end if;

  select k.published_at, k.owner_id, k.slug
    into v_old, v_owner_id, v_slug
    from public.kennels k
   where k.id = p_kennel_id
     and k.deleted_at is null
   for update;

  if not found then
    raise exception 'canil % não existe ou está excluído', p_kennel_id
      using errcode = 'no_data_found';
  end if;

  if (v_old is not null) = p_published then
    return v_old;
  end if;

  v_new := case when p_published then now() end;

  update public.kennels set published_at = v_new where id = p_kennel_id;

  perform private.audit(
    case when p_published then 'kennel.publish' else 'kennel.unpublish' end,
    'kennel',
    p_kennel_id,
    p_reason,
    jsonb_build_object(
      'owner_id', v_owner_id,
      'slug',     v_slug,
      'de',       v_old,
      'para',     v_new
    )
  );

  return v_new;
end;
$$;

comment on function public.admin_set_kennel_published(uuid, boolean, text) is
  'Publica ou despublica um canil por decisão administrativa, com auditoria. NÃO move arquivo: a Server Action reconcilia o bucket antes de chamar.';


-- -----------------------------------------------------------------------------
-- 6. Storage: o admin escreve sob o prefixo do DONO
--
-- Este é o ponto de maior custo desta migration, e ele é irredutível. O upload
-- não passa por Postgres — vai do navegador direto para a API do Storage —,
-- então não existe SECURITY DEFINER que possa mediá-lo. A autorização tem de
-- caber numa policy, e a policy tem de aceitar o admin.
--
-- O QUE A FUNÇÃO ABAIXO IMPEDE, e um simples `or private.is_admin()` não
-- impediria: espalhar arquivo sob prefixo inventado. Sem o `exists` em
-- `profiles`, um admin poderia gravar em `qualquer-coisa/...` e criar lixo que
-- nenhuma reconciliação encontraria — `reconcile-media.mts` lista PELO PREFIXO
-- DO DONO, então arquivo fora de um prefixo válido é invisível para sempre e
-- consome plano até alguém notar na fatura.
--
-- Comparação por TEXTO (`p.id::text = <segmento>`), nunca `<segmento>::uuid`:
-- um caminho com prefixo não-uuid faria o cast levantar `invalid_text_representation`
-- DENTRO da policy, e erro em policy é negação com mensagem feia em vez de
-- negação limpa.
--
-- Os SELECT continuam intactos nos dois buckets: ler não é agir, e a
-- reconciliação precisa listar o prefixo do dono.
-- -----------------------------------------------------------------------------

create or replace function private.can_write_storage_prefix(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (storage.foldername(p_object_name))[1] = (select auth.uid())::text
    or (
      -- `private.is_admin()` já exige `suspended_at is null` e
      -- `deleted_at is null` no próprio admin.
      private.is_admin()
      and exists (
        select 1
          from public.profiles p
         where p.id::text = (storage.foldername(p_object_name))[1]
           and p.deleted_at is null
      )
    );
$$;

comment on function private.can_write_storage_prefix(text) is
  'True se a sessão pode ESCREVER neste caminho: é o próprio prefixo, ou é admin escrevendo sob o prefixo de um perfil vivo. Única fonte da regra nas 6 policies de escrita dos dois buckets.';

revoke execute on function private.can_write_storage_prefix(text) from public, anon;
grant execute on function private.can_write_storage_prefix(text) to authenticated;

drop policy "kennel_media_insert_own" on storage.objects;
create policy "kennel_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kennel-media'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );

drop policy "kennel_media_update_own" on storage.objects;
create policy "kennel_media_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kennel-media'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  )
  with check (
    bucket_id = 'kennel-media'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );

drop policy "kennel_media_delete_own" on storage.objects;
create policy "kennel_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kennel-media'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );

drop policy "kennel_media_public_insert_own" on storage.objects;
create policy "kennel_media_public_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kennel-media-public'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );

drop policy "kennel_media_public_update_own" on storage.objects;
create policy "kennel_media_public_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kennel-media-public'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  )
  with check (
    bucket_id = 'kennel-media-public'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );

drop policy "kennel_media_public_delete_own" on storage.objects;
create policy "kennel_media_public_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kennel-media-public'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );


-- -----------------------------------------------------------------------------
-- 7. Quem pode chamar
--
-- `revoke ... from public` é o que impede `anon` de alcançar as funções pelo
-- PostgREST. A lista de tipos precisa bater EXATAMENTE com a assinatura — é a
-- mesma lista do `drop function` que uma coluna nova vai exigir.
-- -----------------------------------------------------------------------------

revoke execute on function public.admin_create_kennel_for_user(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant  execute on function public.admin_create_kennel_for_user(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

revoke execute on function public.admin_register_media_for_user(text, uuid, text, text, text, integer, integer, text) from public, anon;
grant  execute on function public.admin_register_media_for_user(text, uuid, text, text, text, integer, integer, text) to authenticated;

revoke execute on function public.admin_set_dog_published(uuid, boolean, text) from public, anon;
grant  execute on function public.admin_set_dog_published(uuid, boolean, text) to authenticated;

revoke execute on function public.admin_set_kennel_published(uuid, boolean, text) from public, anon;
grant  execute on function public.admin_set_kennel_published(uuid, boolean, text) to authenticated;
