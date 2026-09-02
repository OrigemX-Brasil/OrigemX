-- =============================================================================
-- OrigemX — o admin também precisa LER o Storage do dono
--
-- CORREÇÃO DE `20260901222120_admin_cadastra_tudo_para_usuario.sql`, que subiu
-- hoje e quebrou o envio de imagem pelo painel administrativo.
--
-- O QUE ELA ERROU. Alargou para admin as policies de INSERT/UPDATE/DELETE de
-- `storage.objects` e deixou as de SELECT intactas, com esta justificativa:
--
--     "Os SELECT continuam intactos nos dois buckets: ler não é agir"
--
-- A frase é verdadeira sobre INTENÇÃO e falsa sobre MECÂNICA. O upload é só o
-- primeiro passo; o segundo é o servidor conferir o que subiu, e conferir é ler:
--
--   1. `statStorageObject` (src/modules/media/queries.ts) chama
--      `storage.list()` para reler mime e tamanho do arquivo — nunca acreditando
--      no que o cliente afirma. `list` é SELECT em `storage.objects`. A policy
--      negava, a função devolvia null, e a tela respondia "Arquivo não
--      encontrado no armazenamento" logo depois de um upload BEM-SUCEDIDO.
--
--   2. `reconcileMediaBucket` (src/modules/media/sync.ts) usa `list()` em
--      `objectExists`, e `move()` precisa enxergar a origem. Ele roda em CINCO
--      pontos de `modules/admin/actions.ts` — inclusive `admin_set_dog_published`
--      e `admin_set_kennel_published` —, então publicar por admin qualquer
--      registro COM imagem também falhava.
--
-- =============================================================================
-- LER E ESCREVER USAM PREDICADOS DIFERENTES, E A ASSIMETRIA É O PONTO
-- =============================================================================
--
-- A primeira tentativa desta correção reusou `private.can_write_storage_prefix`
-- nas policies de SELECT. Passou nos testes de gravação e de download, e
-- ESTOUROU no `list`: "The connection to the database timed out".
--
-- O motivo é de planner, não de permissão. Aquela função recebe a LINHA como
-- argumento (`p_object_name`), então ela é avaliada uma vez POR LINHA — e sendo
-- SECURITY DEFINER, o planner não consegue inliná-la. `storage.search()`, que é
-- o que `list` chama por baixo, varre o bucket: com ~900 objetos no privado e
-- ~1400 no público, são centenas de chamadas, cada uma com um `exists` em
-- `profiles`. Daí o timeout.
--
-- É exatamente por isso que as policies deste projeto escrevem
-- `(select auth.uid())` e `(select private.is_suspended())` em vez das chamadas
-- diretas: o `(select ...)` vira InitPlan e roda UMA vez por consulta. Uma
-- função que depende da linha não tem como receber esse tratamento.
--
--   LEITURA  — inline e içável: prefixo próprio, ou `(select private.is_admin())`.
--   ESCRITA  — `can_write_storage_prefix`, que exige prefixo de perfil VIVO.
--
-- POR QUE A LEITURA PODE DISPENSAR O `exists` EM `profiles`. Aquele teste existe
-- para impedir ESCRITA sob prefixo inventado, que produziria arquivo órfão —
-- `scripts/reconcile-media.mts` lista PELO PREFIXO DO DONO, então um arquivo
-- fora de um prefixo válido fica invisível e consome plano até aparecer na
-- fatura. Na leitura ele não protege nada: um prefixo que não é de ninguém não
-- tem objeto nenhum para devolver. Custaria um timeout para comprar nada.
--
-- POR QUE ALARGAR LEITURA NÃO É CONCESSÃO NOVA. O admin já lê toda linha de
-- `media` (`media_select` carrega `or private.is_admin()` desde
-- `foto_da_medicao.sql`) e, desde ontem, já ESCREVE sob o prefixo de qualquer
-- perfil vivo. Poder ler o arquivo é estritamente menos que poder sobrescrevê-lo
-- — e é pré-requisito de moderação: julgar uma imagem denunciada exige vê-la.
--
-- IDEMPOTENTE de propósito (`if exists` em tudo): a primeira versão desta
-- migration chegou a ser aplicada no projeto de DEV, criando
-- `private.can_access_storage_prefix`. Este arquivo precisa convergir tanto a
-- partir daquele estado quanto do estado de PRODUÇÃO, que nunca a viu.
-- =============================================================================

drop policy if exists "kennel_media_insert_own"         on storage.objects;
drop policy if exists "kennel_media_update_own"         on storage.objects;
drop policy if exists "kennel_media_delete_own"         on storage.objects;
drop policy if exists "kennel_media_select_own"         on storage.objects;
drop policy if exists "kennel_media_public_insert_own"  on storage.objects;
drop policy if exists "kennel_media_public_update_own"  on storage.objects;
drop policy if exists "kennel_media_public_delete_own"  on storage.objects;
drop policy if exists "kennel_media_public_select_own"  on storage.objects;

-- O nome volta a dizer a verdade: ela governa ESCRITA, e só.
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
  'True se a sessão pode ESCREVER neste caminho: é o próprio prefixo, ou é admin escrevendo sob o prefixo de um perfil VIVO. Só escrita — na leitura este teste custaria um scan por linha (timeout no list) e não protegeria nada. Ver o cabeçalho de admin_le_storage_do_dono.';

revoke execute on function private.can_write_storage_prefix(text) from public, anon;
grant  execute on function private.can_write_storage_prefix(text) to authenticated;

-- Sobra da primeira tentativa desta correção, que só existiu em dev.
drop function if exists private.can_access_storage_prefix(text);


-- -----------------------------------------------------------------------------
-- Bucket privado
--
-- SELECT sem `not is_suspended()`, e a ausência é deliberada: suspensão barra
-- quem AGE, não quem olha — mesma leitura que as policies originais já faziam.
-- Um admin suspenso já cai antes, dentro de `private.is_admin()`.
-- -----------------------------------------------------------------------------

create policy "kennel_media_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kennel-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

create policy "kennel_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kennel-media'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );

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

create policy "kennel_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kennel-media'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );


-- -----------------------------------------------------------------------------
-- Bucket público — idênticas, trocando só o bucket
--
-- Publicar MOVE o objeto de um bucket para o outro, então o admin precisa das
-- duas pontas: ler e apagar na origem, escrever no destino. Cobrir só o privado
-- deixaria `reconcileMediaBucket` falhando no meio do caminho.
-- -----------------------------------------------------------------------------

create policy "kennel_media_public_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kennel-media-public'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

create policy "kennel_media_public_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kennel-media-public'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );

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

create policy "kennel_media_public_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kennel-media-public'
    and private.can_write_storage_prefix(name)
    and not (select private.is_suspended())
  );
