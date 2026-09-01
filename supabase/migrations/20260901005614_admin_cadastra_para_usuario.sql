-- =============================================================================
-- OrigemX — admin cadastra cão, ninhada e filhote EM NOME DE OUTRO USUÁRIO
--
-- O painel administrativo era read-only para conteúdo: hide/unhide, suspensão e
-- número do selo. Esta migration abre a primeira porta de CRIAÇÃO — data entry
-- feito por um admin para um criador que não consegue fazer sozinho.
--
-- POR QUE FUNÇÃO E NÃO POLICY. A RLS já autorizava: `dogs_insert` e
-- `kennel_litters_insert` carregam `or private.is_admin()` desde
-- `painel_admin.sql`, e `owner_id` nunca foi restringido em INSERT. Um admin
-- autenticado já conseguia inserir em canil de terceiro pela API. O que NÃO
-- existia era como AUDITAR isso: `private.audit()` não tem EXECUTE para
-- ninguém e `audit_log` não tem GRANT de INSERT nem policy de INSERT. Não há
-- caminho da aplicação até uma linha de auditoria — ela só nasce de dentro de
-- uma SECURITY DEFINER com dono `postgres`, que é exatamente o conjunto
-- `admin_*`.
--
-- E porque as duas coisas precisam ser UMA transação: o PostgREST não dá
-- transação entre chamadas. "Insere via RLS, depois chama a RPC de auditoria"
-- deixa aberta a janela em que o registro existe e a auditoria não — a falha
-- exata que a auditoria existe para impedir. Aqui o INSERT e o `private.audit()`
-- commitam ou revertem juntos, e como `private.audit()` levanta erro em motivo
-- curto, "sem motivo não há registro" vira garantia do banco em vez de
-- disciplina de quem escreve a tela.
--
-- ARMADILHA PARA QUEM MEXER DEPOIS: `create or replace function` NÃO adiciona
-- parâmetro. Acrescentar `p_novo text default null` na assinatura cria uma
-- SEGUNDA função com o mesmo nome, e o PostgREST passa a responder
-- `300 Multiple Choices` em TODA chamada. Coluna nova em `dogs` exige
-- `drop function public.admin_create_dog_for_kennel(<lista completa de tipos>)`
-- antes do create — a mesma lista que está no revoke/grant lá embaixo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. O vocabulário do audit_log
--
-- A lista é FECHADA de propósito (ver o comentário da constraint original): ação
-- nova nasce na mesma migration que a função que a grava.
--
-- O nome NÃO pode ser `admin_created_dog_for_user`: `audit_log_action_matches_entity`
-- exige `split_part(action, '.', 1) = entity_type`, e a convenção da casa é
-- `entidade.verbo`. Por isso `dog.create_for_user` / `litter.create_for_user`.
--
-- FILHOTE REUSA `dog.create_for_user`. Mesma tabela, mesma função, mesma decisão
-- de permissão — os pares existentes só se dividem quando a AÇÃO é oposta
-- (hide/unhide). Separar aqui fragmentaria a pergunta "o que este admin criou
-- para terceiros" num OR que alguém vai errar depois. A distinção mora em
-- `details->>'litter_id'`: não-nulo é filhote.
-- -----------------------------------------------------------------------------

alter table public.audit_log drop constraint audit_log_action_valid;
alter table public.audit_log add constraint audit_log_action_valid check (action in (
  'profile.suspend', 'profile.unsuspend',
  'kennel.hide',     'kennel.unhide',
  'dog.hide',        'dog.unhide',
  'kennel.founder_number.set',
  'dog.create_for_user',
  'litter.create_for_user'
));

alter table public.audit_log drop constraint audit_log_entity_valid;
alter table public.audit_log add constraint audit_log_entity_valid
  check (entity_type in ('profile', 'kennel', 'dog', 'litter'));

-- `audit_log_action_matches_entity` fica INALTERADA: ela compara só o segmento 1,
-- e `kennel.founder_number.set` já provava que profundidade maior que 2 é legal.

-- -----------------------------------------------------------------------------
-- 2. Cão (e filhote) no canil de outra pessoa
--
-- O QUE ESTA FUNÇÃO GARANTE, e a policy sozinha não garantia:
--   - `owner_id` vem do CANIL DE DESTINO, nunca de parâmetro. A aplicação não
--     nomeia o dono, então não tem como errar o dono.
--   - `created_by` é o ADMIN. A autoria fica no registro, não só no log.
--   - uma linha de `audit_log` por chamada, na mesma transação.
--
-- CONSEQUÊNCIA ACEITA de `created_by = admin`: o `using` de `dogs_update` tem o
-- ramo `created_by = (select auth.uid())`, então quem criou mantém escrita
-- naquele cão por um ramo NÃO-admin — que sobrevive a ele perder o papel. É o
-- preço de registrar a autoria real, que era o requisito.
--
-- CUIDADO — SECURITY DEFINER APAGA TUDO: aqui dentro não há RLS (nenhuma tabela
-- do projeto usa `force row level security`) nem GRANT por coluna. A ASSINATURA
-- é a única whitelist que sobrou. Por isso os parâmetros são escalares e o
-- INSERT é literal: nunca montar SQL dinâmico, nunca aceitar um payload e
-- espalhá-lo, e JAMAIS aceitar `p_public_id` — `dogs_freeze_public_id` é BEFORE
-- **UPDATE**, então um public_id explícito no INSERT passaria e prenderia para
-- sempre o endereço de que o QR impresso depende.
-- -----------------------------------------------------------------------------

create or replace function public.admin_create_dog_for_kennel(
  -- Obrigatórios: destino, identidade mínima e o motivo. Vêm primeiro porque a
  -- cauda é a zona de crescimento — coluna nova entra sempre no fim, e um
  -- `p_reason` depois de uma fila de defaults faria a assinatura mentir sobre o
  -- que é exigido.
  p_kennel_id     uuid,
  p_name          text,
  p_sex           text,
  p_reason        text,
  -- O resto do formulário, na ordem de DOG_FIELDS.
  p_born_on       date    default null,
  p_breed         text    default null,
  p_color         text    default null,
  p_coat          text    default null,
  p_titles        text[]  default null,
  p_slug          text    default null,
  -- Parentesco: busca em cães já cadastrados, nunca digitado.
  p_sire_id       uuid    default null,
  p_dam_id        uuid    default null,
  -- Caminho do filhote. Os três últimos SÓ existem com p_litter_id.
  p_litter_id     uuid    default null,
  p_litter_status text    default null,
  p_price_brl     numeric default null,
  p_accepts_offer boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id       uuid;
  v_founder_before integer;
  v_founder_after  integer;
  v_litter_kennel  uuid;
  v_sire_id        uuid        := p_sire_id;
  v_dam_id         uuid        := p_dam_id;
  v_born_on        date        := p_born_on;
  v_published_at   timestamptz := null;
  v_litter_status  text        := null;
  v_puppies        integer;
  v_name           text        := nullif(btrim(p_name), '');
  v_slug           text        := nullif(btrim(p_slug), '');
  v_dog_id         uuid;
begin
  -- Cobre admin SUSPENSO de graça: `private.is_admin()` já exige
  -- `suspended_at is null`. Não precisa de segunda checagem.
  if not private.is_admin() then
    raise exception 'apenas um admin pode cadastrar um cão em nome de outra pessoa'
      using errcode = 'insufficient_privilege';
  end if;

  -- Os CHECKs do banco barrariam, mas com mensagem que não explica nada a quem
  -- chamou. Mesmo argumento do motivo dentro de `private.audit()`.
  if v_name is null then
    raise exception 'o nome do cão é obrigatório'
      using errcode = 'check_violation';
  end if;

  if p_sex is null or p_sex not in ('male', 'female') then
    raise exception 'sexo inválido: %', coalesce(p_sex, 'nulo')
      using errcode = 'check_violation';
  end if;

  -- O DESTINO decide o dono.
  --
  -- `for update` NÃO é decorativo e a ORDEM aqui nunca pode inverter: o AFTER
  -- INSERT de `dogs_assign_founder` chama `try_assign_founder_number()`, que
  -- trava ESTA MESMA linha de `kennels`. Pegando o lock primeiro, o re-lock lá
  -- dentro é no-op; na ordem inversa, é deadlock. De quebra fecha o TOCTOU do
  -- canil sendo excluído entre a checagem e o INSERT.
  select k.owner_id, k.founder_number
    into v_owner_id, v_founder_before
    from public.kennels k
   where k.id = p_kennel_id
     and k.deleted_at is null
   for update;

  if not found then
    raise exception 'canil % não existe ou está excluído', p_kennel_id
      using errcode = 'no_data_found';
  end if;

  -- `dogs_litter_status_requires_litter` é BICONDICIONAL, e price/accepts_offer
  -- exigem litter_id. Mandar qualquer um dos três sem ninhada é erro de chamada,
  -- não valor para zerar em silêncio.
  if p_litter_id is null
     and (p_litter_status is not null
          or p_price_brl is not null
          or coalesce(p_accepts_offer, false)) then
    raise exception 'status, preço e aceita-proposta só existem em filhote de ninhada'
      using errcode = 'check_violation';
  end if;

  if p_litter_id is not null then
    -- `for update` na NINHADA: é isto que torna o teto de 4 atômico. O caminho
    -- do dono (`addPuppy`) conta e insere em duas viagens e aceita a corrida;
    -- aqui fechá-la não custa nada.
    select l.kennel_id, l.sire_id, l.dam_id, l.born_on,
           case when l.published_at is not null then now() end
      into v_litter_kennel, v_sire_id, v_dam_id, v_born_on, v_published_at
      from public.kennel_litters l
     where l.id = p_litter_id
       and l.deleted_at is null
     for update;

    if not found then
      raise exception 'ninhada % não existe ou está excluída', p_litter_id
        using errcode = 'no_data_found';
    end if;

    -- Sem isto o admin plantaria um filhote na ninhada de OUTRO canil: a policy
    -- que barraria isso (`private.owns_litter`) não roda aqui dentro.
    if v_litter_kennel is distinct from p_kennel_id then
      raise exception 'a ninhada % não pertence ao canil %', p_litter_id, p_kennel_id
        using errcode = 'check_violation';
    end if;

    -- Mesma recusa de `addPuppy`: sem par, o filhote nasceria órfão de pedigree,
    -- que é justamente o que a ninhada completa veio resolver.
    if v_sire_id is null and v_dam_id is null then
      raise exception 'a ninhada % ainda não tem progenitor definido', p_litter_id
        using errcode = 'check_violation';
    end if;

    select count(*) into v_puppies
      from public.dogs d
     where d.litter_id = p_litter_id
       and d.deleted_at is null;

    -- O teto é de aplicação (`MAX_PUPPIES_PER_LITTER`), não do banco — não há
    -- CHECK equivalente. Repeti-lo aqui deixa o caminho do admin MAIS estrito
    -- que o do dono, o que é o lado certo para errar. A correção definitiva é um
    -- índice único parcial em `dogs (litter_id, <posição>)`, no molde de
    -- `media_litter_position_uk`; fica fora do escopo desta migration.
    if v_puppies >= 4 then
      raise exception 'uma ninhada aceita no máximo 4 filhotes'
        using errcode = 'check_violation';
    end if;

    v_litter_status := coalesce(nullif(btrim(p_litter_status), ''), 'available');
  end if;

  insert into public.dogs (
    name, sex, born_on, breed, color, coat, titles, slug,
    kennel_id, owner_id, created_by,
    sire_id, dam_id,
    litter_id, litter_status, price_brl, accepts_offer,
    published_at
  ) values (
    v_name,
    p_sex,
    v_born_on,                            -- da NINHADA no caminho do filhote
    nullif(btrim(p_breed), ''),
    nullif(btrim(p_color), ''),
    nullif(btrim(p_coat),  ''),
    -- O PostgREST manda `[]` como '{}', não como NULL, e `titles` não tem CHECK
    -- que barre array vazio — sem isto o cão nasceria com uma lista vazia
    -- gravada, que a tela teria de aprender a ignorar.
    nullif(p_titles, '{}'::text[]),
    v_slug,
    p_kennel_id,
    v_owner_id,                           -- do CANIL, nunca de parâmetro
    (select auth.uid()),                  -- o ADMIN, nunca o dono
    v_sire_id,                            -- da NINHADA no caminho do filhote
    v_dam_id,
    p_litter_id,
    v_litter_status,
    p_price_brl,
    coalesce(p_accepts_offer, false),
    -- SÓ HERDA, nunca decide. Não existe `p_published_at`: publicar continua
    -- sendo do dono. Quando a ninhada já está publicada, quem decidiu publicar
    -- foi ele — e um filhote rascunho dentro dela ficaria invisível numa página
    -- que ele já divulgou, sem nenhum aviso. Mesmo raciocínio de `addPuppy`.
    v_published_at
  )
  returning id into v_dog_id;

  -- O selo Fundador é efeito COLATERAL do AFTER INSERT acima: cadastrar o
  -- primeiro cão de um canil elegível queima um número do pool, e
  -- `kennels_freeze_founder_number` torna isso IRREVERSÍVEL — excluir o cão
  -- depois não devolve o número. Reler não desfaz nada; serve para a trilha
  -- dizer que foi ESTA ação de admin que queimou. Suprimir o trigger não é
  -- opção: `session_replication_role` desligaria junto `dogs_check_ancestry` e
  -- `dogs_check_litter_parents`.
  select k.founder_number into v_founder_after
    from public.kennels k
   where k.id = p_kennel_id;

  perform private.audit(
    'dog.create_for_user',
    'dog',
    v_dog_id,
    p_reason,
    jsonb_build_object(
      'kennel_id',    p_kennel_id,
      'owner_id',     v_owner_id,
      'litter_id',    p_litter_id,
      'nome',         v_name,
      'sexo',         p_sex,
      'published_at', v_published_at,
      'founder_number_atribuido',
        case when v_founder_before is null then v_founder_after end
    )
  );

  return v_dog_id;

exception
  -- O índice de slug do cão não é parcial por `deleted_at`: o slug de um cão
  -- excluído continua reservado, pela mesma razão que o do canil fica queimado.
  -- O 23505 cru não conta isso a ninguém, e esta mensagem vai direto para a tela.
  when unique_violation then
    if v_slug is not null then
      raise exception 'já existe um cão com a URL "%" neste canil', v_slug
        using errcode = 'unique_violation';
    end if;
    raise;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Ninhada no canil de outra pessoa
--
-- Mesmo molde, versão curta — e NUNCA publica: nasce rascunho e o dono decide.
-- Diferente do filhote, não há decisão anterior dele para herdar.
-- -----------------------------------------------------------------------------

create or replace function public.admin_create_litter_for_kennel(
  p_kennel_id   uuid,
  p_reason      text,
  p_sire_id     uuid default null,
  p_dam_id      uuid default null,
  p_mated_on    date default null,
  p_born_on     date default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id  uuid;
  v_litter_id uuid;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode cadastrar uma ninhada em nome de outra pessoa'
      using errcode = 'insufficient_privilege';
  end if;

  select k.owner_id into v_owner_id
    from public.kennels k
   where k.id = p_kennel_id
     and k.deleted_at is null
   for update;

  if not found then
    raise exception 'canil % não existe ou está excluído', p_kennel_id
      using errcode = 'no_data_found';
  end if;

  -- `kennel_litters` não tem `owner_id` — a posse é sempre derivada de
  -- `kennel_id`. O canil resolvido acima entra na auditoria mesmo assim: sem ele
  -- a linha do log não diria PARA QUEM o admin criou.
  insert into public.kennel_litters (
    kennel_id, sire_id, dam_id, mated_on, born_on, description,
    created_by, published_at
  ) values (
    p_kennel_id,
    p_sire_id,
    p_dam_id,
    p_mated_on,
    p_born_on,
    nullif(btrim(p_description), ''),
    (select auth.uid()),
    null
  )
  returning id into v_litter_id;

  perform private.audit(
    'litter.create_for_user',
    'litter',
    v_litter_id,
    p_reason,
    jsonb_build_object(
      'kennel_id', p_kennel_id,
      'owner_id',  v_owner_id,
      'sire_id',   p_sire_id,
      'dam_id',    p_dam_id
    )
  );

  return v_litter_id;
end;
$$;

comment on function public.admin_create_dog_for_kennel(uuid, text, text, text, date, text, text, text, text[], text, uuid, uuid, uuid, text, numeric, boolean) is
  'Cadastra um cão — ou um filhote, com p_litter_id — NO CANIL DE OUTRA PESSOA. owner_id vem do canil e created_by é o admin, então o dono vê e edita normalmente e a autoria real fica no registro. published_at é apenas HERDADO de ninhada já publicada, nunca decidido aqui. Uma linha em audit_log por chamada, na mesma transação.';

comment on function public.admin_create_litter_for_kennel(uuid, text, uuid, uuid, date, date, text) is
  'Cadastra uma ninhada no canil de outra pessoa. Nasce SEMPRE rascunho: publicar continua sendo decisão do dono.';

-- `revoke from public` NÃO é redundante: função em `public` nasce com EXECUTE
-- para PUBLIC, e `anon` herda daí. O projeto já foi mordido por isso — a
-- migration `revoke_dog_descendants_from_anon` existe exatamente por causa
-- disso.
revoke execute on function public.admin_create_dog_for_kennel(uuid, text, text, text, date, text, text, text, text[], text, uuid, uuid, uuid, text, numeric, boolean) from public, anon;
grant  execute on function public.admin_create_dog_for_kennel(uuid, text, text, text, date, text, text, text, text[], text, uuid, uuid, uuid, text, numeric, boolean) to authenticated;

revoke execute on function public.admin_create_litter_for_kennel(uuid, text, uuid, uuid, date, date, text) from public, anon;
grant  execute on function public.admin_create_litter_for_kennel(uuid, text, uuid, uuid, date, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. `owner_id` era o único campo de posse sem cláusula em dogs_insert
--
-- O buraco: `created_by = auth.uid()` e o ramo `kennel_id is null` bastavam para
-- qualquer autenticado inserir um cão com `owner_id` apontando para um ESTRANHO.
-- A linha caía no painel da pessoa (`dogs_owner_id_idx`) e ela ganhava escrita
-- sobre ela por `dogs_update`, sem nunca ter pedido nada.
--
-- NULL continua legal: é o ancestral fantasma (`createGhostAncestor`), definido
-- justamente por `owner_id is null and kennel_id is null`.
--
-- E NÃO tem `or private.is_admin()` aqui, de propósito. A função acima não passa
-- por RLS, então esta policy pode ficar máxima. Abrir para admin reabriria o
-- buraco para o `.from('dogs').insert()` direto que o admin ainda consegue fazer
-- do navegador — com `owner_id` arbitrário e SEM auditoria. É esta ausência que
-- força toda criação de admin pela porta auditada.
--
-- Os quatro caminhos de criação passam: createDog, createFirstDog e addPuppy
-- gravam `user.id`; createGhostAncestor grava null.
--
-- Recriada por inteiro a partir da versão de `ninhada_completa_estrutura`, com
-- uma cláusula a mais. Nada mais mudou.
-- -----------------------------------------------------------------------------

drop policy dogs_insert on public.dogs;
create policy dogs_insert
  on public.dogs for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and not (select private.is_suspended())
    and (
      kennel_id is null
      or private.owns_kennel(kennel_id)
      or private.is_admin()
    )
    and (
      litter_id is null
      or private.owns_litter(litter_id)
      or private.is_admin()
    )
    and (
      owner_id is null
      or owner_id = (select auth.uid())
    )
  );
