-- =============================================================================
-- OrigemX — e-mail do usuário, para a tela de detalhe do painel admin
--
-- `profiles` não tem coluna de e-mail — mora em `auth.users`, que o PostgREST
-- não expõe. A listagem de usuários (sessão anterior) ficou sem e-mail de
-- propósito por causa disso; a tela de DETALHE precisa dele, então esta
-- migration fecha a lacuna com o mesmo molde exato dos quatro `admin_*` que já
-- existem: SECURITY DEFINER, `private.is_admin()` no corpo, revoke/grant por
-- role, sem chave secreta em lugar nenhum.
-- =============================================================================

create or replace function public.admin_get_profile_email(p_profile_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not private.is_admin() then
    raise exception 'apenas um admin pode ler o e-mail de um usuário'
      using errcode = 'insufficient_privilege';
  end if;

  select u.email into v_email from auth.users u where u.id = p_profile_id;
  return v_email;
end;
$$;

comment on function public.admin_get_profile_email(uuid) is
  'E-mail do usuário, só para admin. SECURITY DEFINER porque auth.users não é lido pela sessão comum; raise em vez de NULL silencioso para não confundir "sem e-mail" com "sem permissão".';

-- `revoke from public` não é redundante: função em `public` nasce com EXECUTE
-- para PUBLIC, e `anon` herda daí — mordida real já registrada neste projeto
-- (`revoke_dog_descendants_from_anon`).
revoke execute on function public.admin_get_profile_email(uuid) from public, anon;
grant execute on function public.admin_get_profile_email(uuid) to authenticated;
