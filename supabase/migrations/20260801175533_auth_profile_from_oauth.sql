-- =============================================================================
-- OrigemX — profile a partir de qualquer provedor de autenticação
--
-- Duas mudanças:
--   1. handle_new_user() passa a entender o metadata do OAuth, não só o do
--      cadastro por e-mail;
--   2. a role deixa de depender de disciplina e passa a ser imposta por trigger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Mapeamento de metadata
--
-- O cadastro por e-mail manda `full_name`, porque é a aplicação que monta o
-- payload. O Google manda `name` e `picture`. A versão anterior desta função só
-- lia `full_name`, então TODO usuário que entrasse por OAuth nascia com perfil
-- vazio — e o perfil público do criador é o produto.
--
-- Ordem de preferência:
--   full_name  := full_name → name → parte local do e-mail
--   avatar_url := avatar_url → picture
--
-- `role` não aparece em lugar nenhum aqui, e isso é deliberado:
-- raw_user_meta_data é editável pelo próprio usuário e app_metadata vem do
-- provedor. Nenhum dos dois pode decidir autorização.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name   text;
  v_avatar text;
begin
  v_name := nullif(
    btrim(
      coalesce(
        nullif(btrim(coalesce(v_meta ->> 'full_name', '')), ''),
        nullif(btrim(coalesce(v_meta ->> 'name', '')), ''),
        split_part(coalesce(new.email, ''), '@', 1)
      )
    ),
    ''
  );

  v_avatar := nullif(
    btrim(
      coalesce(
        nullif(btrim(coalesce(v_meta ->> 'avatar_url', '')), ''),
        nullif(btrim(coalesce(v_meta ->> 'picture', '')), ''),
        ''
      )
    ),
    ''
  );

  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, v_name, v_avatar)
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Cria o profile no signup, por e-mail ou por OAuth. Nunca lê role de metadata.';

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Role blindada no INSERT
--
-- Até aqui, "todo usuário nasce como 'user'" era garantido por DEFAULT mais a
-- disciplina de handle_new_user() não ler metadata. Isso protege o caminho que
-- existe hoje, mas não o próximo INSERT que alguém escrever — um seed, um
-- backfill, uma função de convite.
--
-- Este trigger torna a regra inescapável: qualquer INSERT em profiles nasce
-- 'user', venha de onde vier, inclusive de service_role.
--
-- Promover alguém a admin passa a ser um UPDATE explícito, feito por quem tem
-- privilégio para tanto — e `role` está fora do GRANT de coluna concedido a
-- authenticated, então o próprio usuário continua sem conseguir.
-- -----------------------------------------------------------------------------

create or replace function public.profiles_force_default_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.role := 'user';
  return new;
end;
$$;

comment on function public.profiles_force_default_role() is
  'BEFORE INSERT em profiles: role nasce sempre user. Promoção é UPDATE explícito.';

revoke execute on function public.profiles_force_default_role()
  from public, anon, authenticated;

create trigger profiles_force_default_role
  before insert on public.profiles
  for each row execute function public.profiles_force_default_role();
