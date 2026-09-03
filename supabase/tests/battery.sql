-- =============================================================================
-- OrigemX — bateria de verificação das invariantes
--
-- Roda contra o projeto de DESENVOLVIMENTO, nunca o do cliente.
-- Executar inteiro numa única sessão (usa objetos temporários):
--
--     npx supabase db query --linked --file supabase/tests/battery.sql
--
-- Cria fixtures com prefixo 'battery-', roda os casos, imprime PASS/FAIL e
-- remove tudo no final. Não deixa resíduo.
--
-- Convenção: cada caso registra o que esperava e o que aconteceu de verdade.
-- Caso que DEVE falhar é executado dentro de um bloco com EXCEPTION — se ele
-- não levantar erro, a invariante não está protegida e o caso marca FAIL.
-- =============================================================================

create temp table battery_result (
  n         int primary key,
  caso      text not null,
  esperado  text not null,
  obtido    text not null,
  status    text not null
);

create function pg_temp.rec(p_n int, p_caso text, p_esperado text, p_obtido text, p_ok boolean)
returns void language sql as $$
  insert into battery_result values (
    p_n, p_caso, p_esperado, p_obtido, case when p_ok then 'PASS' else 'FAIL' end
  );
$$;

-- -----------------------------------------------------------------------------
-- Fixtures
--
-- u1 e u2 são criadores distintos. O trigger on_auth_user_created deve criar o
-- profile de cada um automaticamente — se não criar, todo o resto quebra e isso
-- já é o primeiro sinal.
--
-- u3, u4 e u5 existem porque um criador tem no máximo UM canil vivo
-- (`kennels_owner_uk`): os canis de cenário do grupo 5 e do grupo 7 não cabem
-- mais em u1, e cada um precisa de dono próprio.
-- -----------------------------------------------------------------------------

do $$
declare
  u1 constant uuid := 'b1000000-0000-4000-8000-000000000001';
  u2 constant uuid := 'b1000000-0000-4000-8000-000000000002';
  u3 constant uuid := 'b1000000-0000-4000-8000-000000000003';
  u4 constant uuid := 'b1000000-0000-4000-8000-000000000004';
  u5 constant uuid := 'b1000000-0000-4000-8000-000000000005';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u1@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Um"}'::jsonb),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u2@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Dois"}'::jsonb),
    (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u3@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Tres"}'::jsonb),
    (u4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u4@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Quatro"}'::jsonb),
    (u5, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u5@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Cinco"}'::jsonb);
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.profiles
   where id in ('b1000000-0000-4000-8000-000000000001',
                'b1000000-0000-4000-8000-000000000002');
  perform pg_temp.rec(0, 'trigger handle_new_user cria profile no signup',
                      '2 profiles', v_n || ' profiles', v_n = 2);
end $$;

-- Canis e cães base.
insert into public.kennels (id, owner_id, name, slug, created_by, published_at)
values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'Canil Battery Um', 'battery-canil-um', 'b1000000-0000-4000-8000-000000000001', now()),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002',
   'Canil Battery Dois', 'battery-canil-dois', 'b1000000-0000-4000-8000-000000000002', now());

-- A (macho) e B (fêmea) são progenitores de C. Tudo publicado, no canil de u1.
insert into public.dogs (id, name, sex, breed, kennel_id, owner_id, created_by, published_at)
values
  ('d1000000-0000-4000-8000-00000000000a', 'Battery A', 'male', 'Teste',
   'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001', now()),
  ('d1000000-0000-4000-8000-00000000000b', 'Battery B', 'female', 'Teste',
   'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001', now());

insert into public.dogs (id, name, sex, breed, kennel_id, owner_id, created_by, published_at,
                         sire_id, dam_id)
values
  ('d1000000-0000-4000-8000-00000000000c', 'Battery C', 'male', 'Teste',
   'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001', now(),
   'd1000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-00000000000b');

-- =============================================================================
-- Grupo 1 — integridade da genealogia (casos 1 a 7)
-- =============================================================================

-- 1. cão como pai de si mesmo
--
-- O CHECK dogs_not_own_sire existe, mas NÃO é ele que barra: trigger BEFORE
-- roda antes da validação de CHECK, e a CTE de ciclo já encontra o próprio cão
-- entre os ancestrais. O CHECK fica como defesa em profundidade, para o caso de
-- o trigger ser removido um dia. O que este caso prova é o bloqueio, não qual
-- mecanismo bloqueou.
do $$
begin
  update public.dogs set sire_id = id
   where id = 'd1000000-0000-4000-8000-00000000000c';
  perform pg_temp.rec(1, 'cão como pai de si mesmo',
                      'bloqueio (trigger de ciclo dispara antes do CHECK)',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(1, 'cão como pai de si mesmo',
                      'bloqueio (trigger de ciclo dispara antes do CHECK)',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 2. sire_id = dam_id
--
-- Idem: quem barra é a validação de sexo, não o CHECK dogs_sire_dam_distinct.
-- Para sire_id = dam_id passar pela validação de sexo, o mesmo cão teria de ser
-- macho E fêmea, o que é impossível — então esse CHECK é inalcançável enquanto
-- o trigger existir. Mantido como defesa em profundidade.
do $$
begin
  update public.dogs
     set sire_id = 'd1000000-0000-4000-8000-00000000000a',
         dam_id  = 'd1000000-0000-4000-8000-00000000000a'
   where id = 'd1000000-0000-4000-8000-00000000000c';
  perform pg_temp.rec(2, 'sire_id = dam_id',
                      'bloqueio (validação de sexo dispara antes do CHECK)',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(2, 'sire_id = dam_id',
                      'bloqueio (validação de sexo dispara antes do CHECK)',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 3. ciclo indireto: C é neto de A; tornar A filho de C fecha o ciclo
do $$
begin
  update public.dogs set sire_id = 'd1000000-0000-4000-8000-00000000000c'
   where id = 'd1000000-0000-4000-8000-00000000000a';
  perform pg_temp.rec(3, 'ciclo indireto (avô vira neto)', 'erro trigger dogs_check_ancestry',
                      'aceitou — CICLO ENTROU NO BANCO', false);
exception when others then
  perform pg_temp.rec(3, 'ciclo indireto (avô vira neto)', 'erro trigger dogs_check_ancestry',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 4. fêmea em sire_id
do $$
begin
  update public.dogs set sire_id = 'd1000000-0000-4000-8000-00000000000b'
   where id = 'd1000000-0000-4000-8000-00000000000c';
  perform pg_temp.rec(4, 'fêmea em sire_id', 'erro trigger dogs_check_ancestry',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(4, 'fêmea em sire_id', 'erro trigger dogs_check_ancestry',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 5. public_id é imutável
do $$
begin
  update public.dogs set public_id = 'abcdefghjkmn'
   where id = 'd1000000-0000-4000-8000-00000000000c';
  perform pg_temp.rec(5, 'update em public_id', 'erro trigger dogs_freeze_public_id',
                      'aceitou — QR IMPRESSO PODE QUEBRAR', false);
exception when others then
  perform pg_temp.rec(5, 'update em public_id', 'erro trigger dogs_freeze_public_id',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 6. microchip duplicado
do $$
begin
  insert into public.dog_identifiers (dog_id, kind, value)
  values ('d1000000-0000-4000-8000-00000000000a', 'microchip', '900000000000001'),
         ('d1000000-0000-4000-8000-00000000000b', 'microchip', '900000000000001');
  perform pg_temp.rec(6, 'mesmo microchip em dois cães', 'erro índice microchip_uk',
                      'aceitou — DEDUPLICAÇÃO FURADA', false);
exception when others then
  perform pg_temp.rec(6, 'mesmo microchip em dois cães', 'erro índice microchip_uk',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 7. LINEBREEDING — o único deste grupo que DEVE passar.
--    A é pai de C e também pai de D; C e D geram E. A aparece por dois caminhos.
do $$
declare v_ok boolean;
begin
  insert into public.dogs (id, name, sex, breed, kennel_id, created_by,
                           sire_id, dam_id, published_at)
  values ('d1000000-0000-4000-8000-00000000000d', 'Battery D', 'female', 'Teste',
          'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
          'd1000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-00000000000b', now());

  insert into public.dogs (id, name, sex, breed, kennel_id, created_by,
                           sire_id, dam_id, published_at)
  values ('d1000000-0000-4000-8000-00000000000e', 'Battery E', 'male', 'Teste',
          'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
          'd1000000-0000-4000-8000-00000000000c', 'd1000000-0000-4000-8000-00000000000d', now());

  select exists (select 1 from public.dogs where id = 'd1000000-0000-4000-8000-00000000000e')
    into v_ok;
  perform pg_temp.rec(7, 'linebreeding (ancestral repetido por 2 caminhos)',
                      'DEVE PASSAR', case when v_ok then 'inseriu' else 'não inseriu' end, v_ok);
exception when others then
  perform pg_temp.rec(7, 'linebreeding (ancestral repetido por 2 caminhos)',
                      'DEVE PASSAR', 'BLOQUEOU INDEVIDAMENTE: ' || sqlstate || ' ' || sqlerrm,
                      false);
end $$;

-- =============================================================================
-- Grupo 2 — autorização (casos 8 a 14, 18, 19)
--
-- Cada bloco assume o papel do usuário, mede, e devolve o papel antes de
-- registrar — a tabela temporária pertence ao dono da sessão, e authenticated
-- não escreve nela.
--
-- ARMADILHA, já paga uma vez: `request.jwt.claims` tem escopo de TRANSAÇÃO.
-- Ela sobrevive ao fim do bloco E ao `reset role`, então trocar de papel NÃO
-- troca de identidade. Um bloco que só faz `set local role anon` continua
-- rodando como o último usuário autenticado, e can_manage_dog() o autoriza.
-- Por isso todo bloco define as DUAS coisas — papel e claims — e registra qual
-- identidade estava valendo, para um contexto errado aparecer no relatório em
-- vez de virar falso positivo.
-- =============================================================================

-- 8. u1 tentando alterar canil de u2
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  with upd as (
    update public.kennels set name = 'invadido'
     where id = 'c1000000-0000-4000-8000-000000000002' returning 1
  ) select count(*) into v_n from upd;
  reset role;
  perform pg_temp.rec(8, 'u1 altera canil de u2', '0 linhas', v_n || ' linhas', v_n = 0);
exception when others then
  reset role;
  perform pg_temp.rec(8, 'u1 altera canil de u2', '0 linhas',
                      'erro (também aceitável): ' || sqlstate || ' ' || sqlerrm, true);
end $$;

-- 9. auto-promoção a admin
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  update public.profiles set role = 'admin'
   where id = 'b1000000-0000-4000-8000-000000000001';
  reset role;
  perform pg_temp.rec(9, 'usuário se promove a admin', 'erro de permissão de coluna',
                      'ACEITOU — ESCALONAMENTO DE PRIVILÉGIO', false);
exception when others then
  reset role;
  perform pg_temp.rec(9, 'usuário se promove a admin', 'erro de permissão de coluna',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 10. u2 lendo identificadores de cão de u1
do $$
declare v_n int;
begin
  insert into public.dog_identifiers (dog_id, kind, issuer, value)
  values ('d1000000-0000-4000-8000-00000000000a', 'registration', 'CBKC', 'BATTERY-001');

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  select count(*) into v_n from public.dog_identifiers
   where dog_id = 'd1000000-0000-4000-8000-00000000000a';
  reset role;
  perform pg_temp.rec(10, 'u2 lê dog_identifiers de cão de u1', '0 linhas',
                      v_n || ' linhas', v_n = 0);
exception when others then
  reset role;
  perform pg_temp.rec(10, 'u2 lê dog_identifiers de cão de u1', '0 linhas',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 11. u2 movendo cão de u1 para o próprio canil
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  with upd as (
    update public.dogs set kennel_id = 'c1000000-0000-4000-8000-000000000002'
     where id = 'd1000000-0000-4000-8000-00000000000a' returning 1
  ) select count(*) into v_n from upd;
  reset role;
  perform pg_temp.rec(11, 'u2 move cão de u1 para o próprio canil', '0 linhas',
                      v_n || ' linhas', v_n = 0);
exception when others then
  reset role;
  perform pg_temp.rec(11, 'u2 move cão de u1 para o próprio canil', '0 linhas',
                      'erro (também aceitável): ' || sqlstate || ' ' || sqlerrm, true);
end $$;

-- 12. DELETE físico é negado a todos
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  delete from public.dogs where id = 'd1000000-0000-4000-8000-00000000000a';
  reset role;
  perform pg_temp.rec(12, 'DELETE físico em dogs', 'erro de permissão',
                      'ACEITOU — EXCLUSÃO FÍSICA POSSÍVEL', false);
exception when others then
  reset role;
  perform pg_temp.rec(12, 'DELETE físico em dogs', 'erro de permissão',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 13. anônimo lendo rascunho (não publicado, com dono e canil)
do $$
declare v_n int; v_uid text;
begin
  insert into public.dogs (id, name, sex, breed, kennel_id, owner_id, created_by, published_at)
  values ('d1000000-0000-4000-8000-00000000000f', 'Battery Rascunho', 'male', 'Teste',
          'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
          'b1000000-0000-4000-8000-000000000001', null);

  -- Limpar request.jwt.claims é obrigatório, não cosmético: a variável tem
  -- escopo de TRANSAÇÃO e sobrevive tanto ao fim do bloco quanto ao
  -- `reset role`. Sem isto, o "anônimo" continua carregando a identidade do
  -- último usuário autenticado e can_manage_dog() o deixa entrar — o teste
  -- passa a medir outra coisa.
  set local role anon;
  set local "request.jwt.claims" to '';
  v_uid := coalesce(auth.uid()::text, 'anônimo');
  select count(*) into v_n from public.dogs
   where id = 'd1000000-0000-4000-8000-00000000000f';
  reset role;
  perform pg_temp.rec(13, 'anônimo lê cão não publicado', '0 linhas',
                      v_n || ' linhas (identidade: ' || v_uid || ')',
                      v_n = 0 and v_uid = 'anônimo');
exception when others then
  reset role;
  perform pg_temp.rec(13, 'anônimo lê cão não publicado', '0 linhas',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 14. dono lendo o próprio rascunho — precisa enxergar, senão não edita
do $$
declare v_n int; v_uid text;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  v_uid := coalesce(auth.uid()::text, 'anônimo');
  select count(*) into v_n from public.dogs
   where id = 'd1000000-0000-4000-8000-00000000000f';
  reset role;
  perform pg_temp.rec(14, 'dono lê o próprio rascunho', '1 linha',
                      v_n || ' linhas (identidade: ' || v_uid || ')',
                      v_n = 1 and v_uid = 'b1000000-0000-4000-8000-000000000001');
exception when others then
  reset role;
  perform pg_temp.rec(14, 'dono lê o próprio rascunho', '1 linha',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- =============================================================================
-- Grupo 3 — slug e publicação (casos 15 a 17)
-- =============================================================================

-- 15. mesmo slug em canis DIFERENTES — deve passar
do $$
declare v_n int;
begin
  update public.dogs set slug = 'rex' where id = 'd1000000-0000-4000-8000-00000000000a';
  insert into public.dogs (id, name, sex, breed, kennel_id, created_by, slug, published_at)
  values ('d1000000-0000-4000-8000-000000000010', 'Rex do Dois', 'male', 'Teste',
          'c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002',
          'rex', now());
  select count(*) into v_n from public.dogs where slug = 'rex';
  perform pg_temp.rec(15, 'slug "rex" em canis diferentes', 'DEVE PASSAR (2 linhas)',
                      v_n || ' linhas', v_n = 2);
exception when others then
  perform pg_temp.rec(15, 'slug "rex" em canis diferentes', 'DEVE PASSAR (2 linhas)',
                      'BLOQUEOU INDEVIDAMENTE: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 16. mesmo slug no MESMO canil — deve falhar
do $$
begin
  update public.dogs set slug = 'rex' where id = 'd1000000-0000-4000-8000-00000000000b';
  perform pg_temp.rec(16, 'slug "rex" repetido no mesmo canil',
                      'erro índice dogs_kennel_slug_key',
                      'ACEITOU — COLISÃO DE URL', false);
exception when others then
  perform pg_temp.rec(16, 'slug "rex" repetido no mesmo canil',
                      'erro índice dogs_kennel_slug_key', sqlstate || ' ' || sqlerrm, true);
end $$;

-- 17. slug sem canil — deve falhar
do $$
begin
  insert into public.dogs (name, sex, breed, created_by, slug)
  values ('Battery Sem Canil', 'male', 'Teste',
          'b1000000-0000-4000-8000-000000000001', 'sem-canil');
  perform pg_temp.rec(17, 'slug preenchido sem kennel_id',
                      'erro CHECK dogs_slug_requires_kennel',
                      'ACEITOU — SLUG ÓRFÃO', false);
exception when others then
  perform pg_temp.rec(17, 'slug preenchido sem kennel_id',
                      'erro CHECK dogs_slug_requires_kennel', sqlstate || ' ' || sqlerrm, true);
end $$;

-- =============================================================================
-- Grupo 4 — ancestral fantasma e FK (casos 18 a 20)
-- =============================================================================

-- 18. anônimo lendo fantasma não publicado — DEVE ver (é nó de árvore)
do $$
declare v_n int; v_uid text;
begin
  insert into public.dogs (id, name, sex, created_by)
  values ('d1000000-0000-4000-8000-000000000011', 'Battery Fantasma', 'male',
          'b1000000-0000-4000-8000-000000000001');

  set local role anon;
  set local "request.jwt.claims" to '';
  v_uid := coalesce(auth.uid()::text, 'anônimo');
  select count(*) into v_n from public.dogs
   where id = 'd1000000-0000-4000-8000-000000000011';
  reset role;
  perform pg_temp.rec(18, 'anônimo lê fantasma (sem dono e sem canil, não publicado)',
                      '1 linha — é nó de árvore',
                      v_n || ' linhas (identidade: ' || v_uid || ')',
                      v_n = 1 and v_uid = 'anônimo');
exception when others then
  reset role;
  perform pg_temp.rec(18, 'anônimo lê fantasma (sem dono e sem canil, não publicado)',
                      '1 linha — é nó de árvore', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 19. anônimo lendo cão COM canil e sem dono, não publicado — é rascunho, não fantasma
do $$
declare v_n int; v_uid text;
begin
  insert into public.dogs (id, name, sex, breed, kennel_id, created_by)
  values ('d1000000-0000-4000-8000-000000000012', 'Battery Sem Dono', 'male', 'Teste',
          'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');

  set local role anon;
  set local "request.jwt.claims" to '';
  v_uid := coalesce(auth.uid()::text, 'anônimo');
  select count(*) into v_n from public.dogs
   where id = 'd1000000-0000-4000-8000-000000000012';
  reset role;
  perform pg_temp.rec(19, 'anônimo lê cão com canil, sem dono, não publicado',
                      '0 linhas — é rascunho',
                      v_n || ' linhas (identidade: ' || v_uid || ')',
                      v_n = 0 and v_uid = 'anônimo');
exception when others then
  reset role;
  perform pg_temp.rec(19, 'anônimo lê cão com canil, sem dono, não publicado',
                      '0 linhas — é rascunho', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 20. DELETE físico de canil que tem cães
do $$
begin
  delete from public.kennels where id = 'c1000000-0000-4000-8000-000000000001';
  perform pg_temp.rec(20, 'DELETE físico de canil com cães', 'erro FK RESTRICT',
                      'ACEITOU — REGISTRO ORFANADO', false);
exception when others then
  perform pg_temp.rec(20, 'DELETE físico de canil com cães', 'erro FK RESTRICT',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- =============================================================================
-- Grupo 5 — selo Criador Fundador (casos 21 a 26)
--
-- A sequence `kennel_founder_seq` NÃO é transacional: nextval não volta atrás
-- num rollback. Estes casos manipulam a sequence de propósito, então o valor
-- é salvo aqui e RESTAURADO no fim — sem isso, cada execução da bateria
-- queimaria números reais do pool de 100.
-- =============================================================================

create temp table founder_seq_backup as
  select last_value, is_called from public.kennel_founder_seq;

-- Canil incompleto: nome e cidade, sem estado, sem logo, sem cão.
--
-- Dono é u3, não u1: `kennels_owner_uk` já não deixa u1 ter um segundo canil
-- vivo além de `battery-canil-um`.
insert into public.kennels (id, owner_id, name, slug, city, created_by)
values ('c1000000-0000-4000-8000-00000000000f', 'b1000000-0000-4000-8000-000000000003',
        'Battery Incompleto', 'battery-incompleto', 'Campinas',
        'b1000000-0000-4000-8000-000000000003');

-- 21. Cadastro incompleto não recebe número E NÃO CONSOME da sequence.
do $$
declare
  v_before bigint;
  v_after  bigint;
  v_number integer;
begin
  select last_value into v_before from public.kennel_founder_seq;

  perform public.try_assign_founder_number('c1000000-0000-4000-8000-00000000000f');

  select founder_number into v_number from public.kennels
   where id = 'c1000000-0000-4000-8000-00000000000f';
  select last_value into v_after from public.kennel_founder_seq;

  perform pg_temp.rec(21, 'canil incompleto não recebe selo nem consome número',
                      'sem número e sequence parada',
                      coalesce(v_number::text, 'sem número') || ', sequence ' ||
                      case when v_before = v_after then 'parada' else 'AVANÇOU' end,
                      v_number is null and v_before = v_after);
end $$;

-- Completa o canil: estado, logo e um cão. Cada passo dispara um trigger.
do $$
begin
  update public.kennels set state = 'SP'
   where id = 'c1000000-0000-4000-8000-00000000000f';

  insert into public.media (bucket_id, storage_path, kennel_id, role, mime, size_bytes, owner_id, created_by)
  values ('kennel-media', 'battery/logo-' || gen_random_uuid() || '.webp',
          'c1000000-0000-4000-8000-00000000000f', 'kennel_logo', 'image/webp', 1000,
          'b1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003');

  insert into public.dogs (id, name, sex, kennel_id, owner_id, created_by)
  values ('d1000000-0000-4000-8000-000000000021', 'Battery Selo', 'male',
          'c1000000-0000-4000-8000-00000000000f',
          'b1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003');
end $$;

-- 22. Ao completar, o trigger atribui.
do $$
declare v_number integer;
begin
  select founder_number into v_number from public.kennels
   where id = 'c1000000-0000-4000-8000-00000000000f';
  -- ERA `between 1 and 100`, e ficou para trás quando a migration
  -- `founder_number_sem_teto` (2026-08-06) tirou o teto: hoje a emissão começa
  -- em 100 e não tem limite superior, então o caso reprovava por medir uma regra
  -- que não existe mais. O que ainda vale é "canil completo RECEBE número".
  perform pg_temp.rec(22, 'canil completo recebe número pelo trigger',
                      'número atribuído (>= 1, sem teto desde founder_number_sem_teto)',
                      coalesce(v_number::text, 'NENHUM'),
                      v_number >= 1);
end $$;

-- 23. Imutável: update do número é bloqueado.
do $$
begin
  update public.kennels set founder_number = 99
   where id = 'c1000000-0000-4000-8000-00000000000f';
  perform pg_temp.rec(23, 'update de founder_number já atribuído',
                      'erro do trigger de imutabilidade',
                      'ACEITOU — SELO MUTÁVEL', false);
exception when others then
  perform pg_temp.rec(23, 'update de founder_number já atribuído',
                      'erro do trigger de imutabilidade',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 24. Re-disparo não dá segundo número nem queima da sequence.
do $$
declare
  v_before bigint; v_after bigint; v_first integer; v_second integer;
begin
  select founder_number into v_first from public.kennels
   where id = 'c1000000-0000-4000-8000-00000000000f';
  select last_value into v_before from public.kennel_founder_seq;

  perform public.try_assign_founder_number('c1000000-0000-4000-8000-00000000000f');

  select founder_number into v_second from public.kennels
   where id = 'c1000000-0000-4000-8000-00000000000f';
  select last_value into v_after from public.kennel_founder_seq;

  perform pg_temp.rec(24, 're-disparo em canil que já tem selo',
                      'mesmo número e sequence parada',
                      v_first || ' -> ' || v_second || ', sequence ' ||
                      case when v_before = v_after then 'parada' else 'AVANÇOU' end,
                      v_first = v_second and v_before = v_after);
end $$;

-- 25. Soft delete NÃO devolve o número ao pool.
do $$
declare v_number integer;
begin
  update public.kennels set deleted_at = now()
   where id = 'c1000000-0000-4000-8000-00000000000f';

  select founder_number into v_number from public.kennels
   where id = 'c1000000-0000-4000-8000-00000000000f';

  perform pg_temp.rec(25, 'exclusão lógica do canil com selo',
                      'número permanece na linha',
                      coalesce(v_number::text, 'PERDEU O NÚMERO'),
                      v_number is not null);
end $$;

-- 26. LIMITE: com a sequence esgotada, o próximo elegível não recebe número e o
--     cadastro NÃO quebra — a função captura o 2200H em vez de propagar.
--
--     ESTE CASO FICOU PARA TRÁS junto com o 22. Ele levava a sequence a 100 e
--     esperava o estouro, o que só fazia sentido enquanto ela tinha
--     `maxvalue 100`. Desde `founder_number_sem_teto` (2026-08-06) o teto é o do
--     integer, então `setval(…, 100)` só emitia o 101 e o caso reprovava por
--     medir uma regra revogada.
--
--     O TETO É LIDO DO PRÓPRIO OBJETO agora, em vez de repetido aqui: assim o
--     caso continua medindo "esgotamento não quebra cadastro" sem precisar ser
--     reescrito toda vez que o limite mudar.
do $$
declare
  v_number integer;
  v_max    bigint;
  v_erro   text := 'sem erro';
begin
  select s.max_value into v_max
    from pg_sequences s
   where s.schemaname = 'public' and s.sequencename = 'kennel_founder_seq';

  -- `is_called = true` faz o PRÓXIMO nextval estourar.
  perform setval('public.kennel_founder_seq', v_max, true);

  -- Dono é u4: `kennels_owner_uk` impede que este canil de cenário pertença a
  -- u1, que já tem `battery-canil-um` vivo.
  insert into public.kennels (id, owner_id, name, slug, city, state, created_by)
  values ('c1000000-0000-4000-8000-000000000010', 'b1000000-0000-4000-8000-000000000004',
          'Battery Centro E Um', 'battery-101', 'Campinas', 'SP',
          'b1000000-0000-4000-8000-000000000004');

  insert into public.media (bucket_id, storage_path, kennel_id, role, mime, size_bytes, owner_id, created_by)
  values ('kennel-media', 'battery/logo101-' || gen_random_uuid() || '.webp',
          'c1000000-0000-4000-8000-000000000010', 'kennel_logo', 'image/webp', 1000,
          'b1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000004');

  -- Este INSERT dispara o trigger com a sequence esgotada. Precisa PASSAR.
  insert into public.dogs (id, name, sex, kennel_id, owner_id, created_by)
  values ('d1000000-0000-4000-8000-000000000022', 'Battery Cão 101', 'male',
          'c1000000-0000-4000-8000-000000000010',
          'b1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000004');

  select founder_number into v_number from public.kennels
   where id = 'c1000000-0000-4000-8000-000000000010';

  perform pg_temp.rec(26, 'sequence esgotada: o próximo elegível não quebra',
                      'sem número, e o cadastro não quebra',
                      'número ' || coalesce(v_number::text, 'nenhum') || ', cadastro ' || v_erro,
                      v_number is null);
exception when others then
  perform pg_temp.rec(26, 'sequence esgotada: o próximo elegível não quebra',
                      'sem número, e o cadastro não quebra',
                      'CADASTRO QUEBROU: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- Restaura a sequence ao valor de antes da bateria.
do $$
declare b record;
begin
  select * into b from founder_seq_backup;
  perform setval('public.kennel_founder_seq', b.last_value, b.is_called);
end $$;

-- =============================================================================
-- Grupo 6 — um canil por criador (casos 27 a 29)
--
-- Esta bateria roda como SUPERUSUÁRIO, então a RLS é ignorada. O índice único
-- NÃO é — e é exatamente por isso que estes casos medem o mecanismo real. Se a
-- garantia fosse uma policy, os três passariam aqui e falhariam em produção.
--
-- A assimetria com o slug é o que está sob teste: a VAGA volta quando a relação
-- acaba (índice parcial por `deleted_at`), o ENDEREÇO nunca volta
-- (`kennels_slug_key` é global).
-- =============================================================================

-- Fixture do grupo, FORA de qualquer bloco com EXCEPTION.
--
-- Um `do $$ ... exception ... $$` é uma SUBTRANSAÇÃO: se o segundo INSERT
-- falhasse dentro do mesmo bloco do primeiro, o Postgres desfaria os DOIS, e o
-- caso 27 mediria uma tabela vazia em vez da duplicata recusada. Cada bloco
-- abaixo tem exatamente UMA operação sob teste.
insert into public.kennels (id, owner_id, name, slug, created_by)
values ('c1000000-0000-4000-8000-000000000011', 'b1000000-0000-4000-8000-000000000005',
        'Battery Unico Um', 'battery-unico-1', 'b1000000-0000-4000-8000-000000000005');

-- 27. Segundo canil vivo para o mesmo dono.
do $$
declare v_erro text := 'NENHUM ERRO — DUPLICATA ACEITA';
begin
  -- Slug NOVO: com slug repetido, a violação poderia ser a do endereço, e o
  -- caso passaria pelo motivo errado.
  insert into public.kennels (id, owner_id, name, slug, created_by)
  values ('c1000000-0000-4000-8000-000000000012', 'b1000000-0000-4000-8000-000000000005',
          'Battery Unico Dois', 'battery-unico-2', 'b1000000-0000-4000-8000-000000000005');
exception when others then
  v_erro := sqlstate || ' ' || sqlerrm;
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.kennels
   where owner_id = 'b1000000-0000-4000-8000-000000000005' and deleted_at is null;
  perform pg_temp.rec(27, 'segundo canil vivo para o mesmo dono é recusado',
                      '1 canil vivo', v_n || ' canis vivos', v_n = 1);
end $$;

-- 28. A exclusão lógica DEVOLVE a vaga.
update public.kennels set deleted_at = now()
 where id = 'c1000000-0000-4000-8000-000000000011';

do $$
declare v_erro text := 'sem erro';
begin
  insert into public.kennels (id, owner_id, name, slug, created_by)
  values ('c1000000-0000-4000-8000-000000000013', 'b1000000-0000-4000-8000-000000000005',
          'Battery Unico Tres', 'battery-unico-3', 'b1000000-0000-4000-8000-000000000005');
exception when others then
  v_erro := sqlstate || ' ' || sqlerrm;
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.kennels
   where id = 'c1000000-0000-4000-8000-000000000013' and deleted_at is null;
  perform pg_temp.rec(28, 'exclusão lógica libera a vaga para um canil novo',
                      '1 canil novo vivo', v_n || ' criado', v_n = 1);
end $$;

-- 29. Reverter a exclusão tendo outro canil vivo.
--
-- É o caso que distingue o índice de uma policy: `deleted_at` é coluna com
-- GRANT de UPDATE, então "desexcluir" é um caminho que nenhum WITH CHECK de
-- INSERT enxergaria.
do $$
declare v_erro text := 'NENHUM ERRO — DOIS CANIS VIVOS';
begin
  update public.kennels set deleted_at = null
   where id = 'c1000000-0000-4000-8000-000000000011';
exception when others then
  v_erro := sqlstate;
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.kennels
   where owner_id = 'b1000000-0000-4000-8000-000000000005' and deleted_at is null;
  perform pg_temp.rec(29, 'reverter a exclusão com outro canil vivo é recusado',
                      '1 canil vivo', v_n || ' canis vivos', v_n = 1);
end $$;

-- =============================================================================
-- Grupo 7 — painel administrativo (casos 30 a 53)
--
-- O que está sob teste não é "o admin consegue", e sim as três garantias que
-- fazem a capacidade valer alguma coisa:
--
--   * NINGUÉM escreve em `audit_log` a não ser pelas funções `admin_*`;
--   * a suspensão barra a PESSOA sem tocar no conteúdo dela;
--   * a escotilha do `founder_number` abre a camada 2 e NÃO a camada 1 — e não
--     sobrevive à chamada que a abriu.
--
-- ORDEM IMPORTA em dois pontos, e os dois estão comentados no lugar: o caso da
-- escotilha vazando roda ANTES do caso que define a GUC à mão, e a sequence é
-- restaurada no fim porque `setval` não volta atrás com o rollback.
-- =============================================================================

-- Fixtures próprias do grupo, para não depender do estado deixado por outro.
do $$
declare
  u6 constant uuid := 'b1000000-0000-4000-8000-000000000006';  -- admin
  u7 constant uuid := 'b1000000-0000-4000-8000-000000000007';  -- alvo da suspensão
  u8 constant uuid := 'b1000000-0000-4000-8000-000000000008';  -- alvo da ocultação
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values
    (u6, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u6@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Admin"}'::jsonb),
    (u7, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u7@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Suspenso"}'::jsonb),
    (u8, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u8@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Oculto"}'::jsonb);

  -- Como superusuário, e é o único jeito: `role` está fora do GRANT por coluna.
  update public.profiles set role = 'admin' where id = u6;
end $$;

insert into public.kennels (id, owner_id, name, slug, created_by, published_at)
values
  ('c1000000-0000-4000-8000-000000000021', 'b1000000-0000-4000-8000-000000000007',
   'Canil Battery Suspenso', 'battery-canil-suspenso',
   'b1000000-0000-4000-8000-000000000007', now()),
  ('c1000000-0000-4000-8000-000000000022', 'b1000000-0000-4000-8000-000000000008',
   'Canil Battery Oculto', 'battery-canil-oculto',
   'b1000000-0000-4000-8000-000000000008', now());

-- Logo do canil que vai ser ocultado. SEM cidade/estado no canil acima de
-- propósito: assim ele não fica elegível ao selo e este INSERT não consome um
-- número da sequence por tabela.
insert into public.media (bucket_id, storage_path, kennel_id, role, mime, size_bytes, owner_id)
values ('kennel-media-public', 'battery/u8/logo-oculto.webp',
        'c1000000-0000-4000-8000-000000000022', 'kennel_logo', 'image/webp', 1024,
        'b1000000-0000-4000-8000-000000000008');

-- Canil com número, para os casos de correção. NULL -> valor passa pelo trigger
-- de imutabilidade (é o caminho legítimo da atribuição), então dá para semear.
-- Números na casa dos 900 mil para não colidir com nada real.
insert into public.kennels (id, owner_id, name, slug, created_by)
values ('c1000000-0000-4000-8000-000000000023', 'b1000000-0000-4000-8000-000000000006',
        'Canil Battery Numero', 'battery-canil-numero',
        'b1000000-0000-4000-8000-000000000006');

update public.kennels set founder_number = 900001
 where id = 'c1000000-0000-4000-8000-000000000023';

-- -----------------------------------------------------------------------------
-- Autorização e imutabilidade do log
-- -----------------------------------------------------------------------------

-- 30. Usuário comum chamando uma função admin.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform public.admin_set_profile_suspended(
    'b1000000-0000-4000-8000-000000000007', true, 'tentativa de usuário comum');
  reset role;
  perform pg_temp.rec(30, 'usuário comum chama admin_set_profile_suspended',
                      '42501 insufficient_privilege',
                      'ACEITOU — QUALQUER UM SUSPENDE QUALQUER UM', false);
exception when others then
  reset role;
  perform pg_temp.rec(30, 'usuário comum chama admin_set_profile_suspended',
                      '42501 insufficient_privilege', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- 31. INSERT direto em audit_log. Sem GRANT para ninguém: a única porta é
--     private.audit(), de dentro das funções admin.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  insert into public.audit_log (actor_id, action, entity_type, entity_id, reason)
  values ('b1000000-0000-4000-8000-000000000006', 'profile.suspend', 'profile',
          'b1000000-0000-4000-8000-000000000007', 'linha forjada');
  reset role;
  perform pg_temp.rec(31, 'admin insere em audit_log pela API',
                      'erro de permissão', 'ACEITOU — LOG FORJÁVEL', false);
exception when others then
  reset role;
  perform pg_temp.rec(31, 'admin insere em audit_log pela API',
                      'erro de permissão', sqlstate || ' ' || sqlerrm, sqlstate = '42501');
end $$;

-- 32. UPDATE em audit_log. Append-only por PRIVILÉGIO, não por convenção — é o
--     que substitui o `deleted_at` que a tabela deliberadamente não tem.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  update public.audit_log set reason = 'reescrito';
  reset role;
  perform pg_temp.rec(32, 'admin reescreve linha de audit_log',
                      'erro de permissão', 'ACEITOU — HISTÓRICO EDITÁVEL', false);
exception when others then
  reset role;
  perform pg_temp.rec(32, 'admin reescreve linha de audit_log',
                      'erro de permissão', sqlstate || ' ' || sqlerrm, sqlstate = '42501');
end $$;

-- -----------------------------------------------------------------------------
-- Suspensão
-- -----------------------------------------------------------------------------

-- 33. A suspensão grava nos DOIS lugares: RLS (profiles) e Auth (auth.users).
--     O segundo é o que impede o suspenso de simplesmente continuar logando.
do $$
declare v_susp timestamptz; v_ban timestamptz;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_profile_suspended(
    'b1000000-0000-4000-8000-000000000007', true, 'conduta abusiva — caso de bateria');
  reset role;

  select p.suspended_at into v_susp from public.profiles p
   where p.id = 'b1000000-0000-4000-8000-000000000007';
  select u.banned_until into v_ban from auth.users u
   where u.id = 'b1000000-0000-4000-8000-000000000007';

  perform pg_temp.rec(33, 'suspensão grava profiles.suspended_at E auth.users.banned_until',
                      'os dois preenchidos',
                      'suspended_at ' || coalesce(v_susp::text, 'NULO') ||
                      ' / banned_until ' || coalesce(v_ban::text, 'NULO'),
                      v_susp is not null and v_ban is not null and v_ban > now());
exception when others then
  reset role;
  perform pg_temp.rec(33, 'suspensão grava profiles.suspended_at E auth.users.banned_until',
                      'os dois preenchidos', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 34. Uma ação, uma linha de auditoria, com o motivo.
do $$
declare v_n int; v_reason text;
begin
  select count(*), max(reason) into v_n, v_reason from public.audit_log
   where entity_type = 'profile'
     and entity_id = 'b1000000-0000-4000-8000-000000000007'
     and action = 'profile.suspend';
  perform pg_temp.rec(34, 'a suspensão gerou exatamente 1 linha de auditoria com motivo',
                      '1 linha, motivo preservado',
                      v_n || ' linha(s), motivo: ' || coalesce(v_reason, 'NENHUM'),
                      v_n = 1 and v_reason = 'conduta abusiva — caso de bateria');
end $$;

-- 35. Idempotência. Repetir uma ação que não muda nada NÃO é uma ação — se
--     gerasse linha, o histórico encheria de eventos vazios e viraria ilegível.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_profile_suspended(
    'b1000000-0000-4000-8000-000000000007', true, 'segunda chamada, mesmo estado');
  reset role;

  select count(*) into v_n from public.audit_log
   where entity_type = 'profile'
     and entity_id = 'b1000000-0000-4000-8000-000000000007'
     and action = 'profile.suspend';
  perform pg_temp.rec(35, 'suspender de novo quem já está suspenso não audita',
                      'continua 1 linha', v_n || ' linha(s)', v_n = 1);
exception when others then
  reset role;
  perform pg_temp.rec(35, 'suspender de novo quem já está suspenso não audita',
                      'continua 1 linha', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 36. Suspenso não cria. INSERT recusado pela RLS levanta erro, não devolve 0.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000007","role":"authenticated"}';
  insert into public.dogs (name, sex, kennel_id, owner_id, created_by)
  values ('Battery Suspenso Tentou', 'male', 'c1000000-0000-4000-8000-000000000021',
          'b1000000-0000-4000-8000-000000000007', 'b1000000-0000-4000-8000-000000000007');
  reset role;
  perform pg_temp.rec(36, 'suspenso cadastra cão no próprio canil',
                      'recusado pela RLS', 'ACEITOU — SUSPENSÃO NÃO BARRA NADA', false);
exception when others then
  reset role;
  perform pg_temp.rec(36, 'suspenso cadastra cão no próprio canil',
                      'recusado pela RLS', sqlstate || ' ' || sqlerrm, true);
end $$;

-- 37. Suspenso não edita. Aqui o USING nega, então são 0 linhas — mesmo formato
--     com que este schema trata "não é seu" em todo lugar.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000007","role":"authenticated"}';
  with upd as (
    update public.kennels set name = 'renomeado pelo suspenso'
     where id = 'c1000000-0000-4000-8000-000000000021' returning 1
  ) select count(*) into v_n from upd;
  reset role;
  perform pg_temp.rec(37, 'suspenso altera o próprio canil', '0 linhas',
                      v_n || ' linhas', v_n = 0);
exception when others then
  reset role;
  perform pg_temp.rec(37, 'suspenso altera o próprio canil', '0 linhas',
                      'erro (também aceitável): ' || sqlstate, true);
end $$;

-- 38. Mas CONTINUA LENDO. Suspensão barra a ação, não o acesso aos próprios
--     dados — nenhuma policy de SELECT foi tocada, e este caso é o que prova.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000007","role":"authenticated"}';
  select count(*) into v_n from public.kennels
   where id = 'c1000000-0000-4000-8000-000000000021';
  reset role;
  perform pg_temp.rec(38, 'suspenso LÊ o próprio canil', '1 linha — ler não é agir',
                      v_n || ' linhas', v_n = 1);
exception when others then
  reset role;
  perform pg_temp.rec(38, 'suspenso LÊ o próprio canil', '1 linha',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 39. Admin suspenso perde o poder de admin. Sem isto, suspender um admin seria
--     reversível por ele mesmo, e a suspensão não valeria justamente contra quem
--     tem mais poder de causar dano.
do $$
declare v_admin boolean;
begin
  update public.profiles set suspended_at = now()
   where id = 'b1000000-0000-4000-8000-000000000006';

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select private.is_admin() into v_admin;
  reset role;

  update public.profiles set suspended_at = null
   where id = 'b1000000-0000-4000-8000-000000000006';

  perform pg_temp.rec(39, 'admin suspenso continua sendo admin?', 'false',
                      coalesce(v_admin::text, 'nulo'), v_admin is false);
exception when others then
  reset role;
  update public.profiles set suspended_at = null
   where id = 'b1000000-0000-4000-8000-000000000006';
  perform pg_temp.rec(39, 'admin suspenso continua sendo admin?', 'false',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 40. Admin se trancando para fora. Reativar exige ser admin ATIVO, então a
--     operação seria irreversível pela aplicação.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_profile_suspended(
    'b1000000-0000-4000-8000-000000000006', true, 'auto-suspensão');
  reset role;
  perform pg_temp.rec(40, 'admin suspende a própria conta', 'recusado',
                      'ACEITOU — ADMIN SE TRANCA PARA FORA', false);
exception when others then
  reset role;
  perform pg_temp.rec(40, 'admin suspende a própria conta', 'recusado',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 41. Reativar limpa os dois lados.
do $$
declare v_susp timestamptz; v_ban timestamptz;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_profile_suspended(
    'b1000000-0000-4000-8000-000000000007', false, 'revisão concluída — caso de bateria');
  reset role;

  select p.suspended_at into v_susp from public.profiles p
   where p.id = 'b1000000-0000-4000-8000-000000000007';
  select u.banned_until into v_ban from auth.users u
   where u.id = 'b1000000-0000-4000-8000-000000000007';

  perform pg_temp.rec(41, 'reativar limpa suspended_at E banned_until',
                      'os dois nulos',
                      'suspended_at ' || coalesce(v_susp::text, 'nulo') ||
                      ' / banned_until ' || coalesce(v_ban::text, 'nulo'),
                      v_susp is null and v_ban is null);
exception when others then
  reset role;
  perform pg_temp.rec(41, 'reativar limpa suspended_at E banned_until', 'os dois nulos',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- -----------------------------------------------------------------------------
-- Correção do número do canil
-- -----------------------------------------------------------------------------

-- 42. O trigger de imutabilidade continua inteiro para quem escreve DIRETO,
--     inclusive para o admin. A escotilha não é "admin pode"; é "esta função
--     pode, nesta linha".
do $$
begin
  update public.kennels set founder_number = 900099
   where id = 'c1000000-0000-4000-8000-000000000023';
  perform pg_temp.rec(42, 'UPDATE direto em founder_number (como superusuário)',
                      'erro — trigger de imutabilidade',
                      'ACEITOU — TRIGGER FUROU', false);
exception when others then
  perform pg_temp.rec(42, 'UPDATE direto em founder_number (como superusuário)',
                      'erro — trigger de imutabilidade', sqlstate || ' ' || sqlerrm, true);
end $$;

-- 43. E a função corrige.
do $$
declare v_num integer;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_set_founder_number(
           'c1000000-0000-4000-8000-000000000023', 900002,
           'número atribuído errado na importação') into v_num;
  reset role;
  perform pg_temp.rec(43, 'admin_set_founder_number corrige o número',
                      '900002 gravado', coalesce(v_num::text, 'nulo'), v_num = 900002);
exception when others then
  reset role;
  perform pg_temp.rec(43, 'admin_set_founder_number corrige o número', '900002 gravado',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 44. A ESCOTILHA NÃO VAZA — o caso que justifica o desenho inteiro.
--
-- `set_config(..., is_local => true)` já limitaria à transação; como a função
-- tem cláusula SET (`search_path = ''`), o Postgres abre um nível de GUC próprio
-- e reverte na saída. Este caso mede isso em vez de supor.
--
-- RODA ANTES DO CASO 47, que define a GUC à mão de propósito.
do $$
declare v_guc text;
begin
  v_guc := current_setting('origemx.founder_override', true);
  perform pg_temp.rec(44, 'a escotilha sobrevive à chamada de admin_set_founder_number?',
                      'não — GUC vazia depois da função',
                      coalesce(nullif(v_guc, ''), '(vazia)'),
                      coalesce(v_guc, '') = '');
end $$;

-- 45. Número já em uso. O ÍNDICE ÚNICO é o mecanismo — nada de `select` prévio
--     de "já existe?", que duas correções simultâneas passariam juntas.
do $$
declare v_estado integer;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  begin
    perform public.admin_set_founder_number(
      'c1000000-0000-4000-8000-000000000021', 900002, 'tentando duplicar');
  exception when others then
    null;  -- o estado é medido abaixo, não o erro
  end;
  reset role;

  select k.founder_number into v_estado from public.kennels k
   where k.id = 'c1000000-0000-4000-8000-000000000021';
  perform pg_temp.rec(45, 'atribuir número já em uso a outro canil',
                      'recusado e nada gravado',
                      'founder_number do segundo canil: ' || coalesce(v_estado::text, 'nulo'),
                      v_estado is null);
exception when others then
  reset role;
  perform pg_temp.rec(45, 'atribuir número já em uso a outro canil',
                      'recusado e nada gravado', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 46. A sequence não pode ficar ATRÁS de um número posto à mão: senão a
--     atribuição automática colidiria com ele lá na frente, e a colisão
--     estouraria dentro de try_assign_founder_number, abortando o INSERT do cão
--     que a disparou.
do $$
declare v_last bigint;
begin
  select s.last_value into v_last from public.kennel_founder_seq s;
  perform pg_temp.rec(46, 'número corrigido à mão empurra a sequence',
                      'last_value >= 900002',
                      'last_value = ' || v_last, v_last >= 900002);
end $$;

-- 47. A CAMADA 1 CONTINUA DE PÉ. Mesmo com a escotilha escancarada à mão, o
--     usuário comum é recusado por FALTA DE PRIVILÉGIO DE COLUNA, antes de
--     qualquer trigger rodar. É esta camada — e não o trigger — que impede
--     alguém de escolher o próprio número.
--
--     ÚLTIMO caso a mexer na GUC, e ele a limpa no fim.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform set_config('origemx.founder_override',
                     'c1000000-0000-4000-8000-000000000001', true);
  update public.kennels set founder_number = 1
   where id = 'c1000000-0000-4000-8000-000000000001';
  reset role;
  perform set_config('origemx.founder_override', '', true);
  perform pg_temp.rec(47, 'usuário comum abre a escotilha à mão e grava founder_number',
                      '42501 — barrado pelo GRANT de coluna',
                      'ACEITOU — QUALQUER UM ESCOLHE O PRÓPRIO NÚMERO', false);
exception when others then
  reset role;
  perform set_config('origemx.founder_override', '', true);
  perform pg_temp.rec(47, 'usuário comum abre a escotilha à mão e grava founder_number',
                      '42501 — barrado pelo GRANT de coluna', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- A sequence é restaurada aqui: `setval` não volta atrás com rollback, e o
-- caso 46 a empurrou para 900 mil. Mesmo procedimento do grupo 5.
do $$
declare b record;
begin
  select * into b from founder_seq_backup;
  perform setval('public.kennel_founder_seq', b.last_value, b.is_called);
end $$;

-- -----------------------------------------------------------------------------
-- Ocultar / reativar
-- -----------------------------------------------------------------------------

-- 48/49. Canil oculto some para o anônimo e CONTINUA para o dono — ele precisa
--        saber que foi ocultado, senão a moderação é invisível para quem sofreu.
do $$
declare v_anon int; v_dono int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_kennel_hidden(
    'c1000000-0000-4000-8000-000000000022', true, 'denúncia em apuração — caso de bateria');
  reset role;

  set local role anon;
  set local "request.jwt.claims" to '';
  select count(*) into v_anon from public.kennels
   where id = 'c1000000-0000-4000-8000-000000000022';
  reset role;

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000008","role":"authenticated"}';
  select count(*) into v_dono from public.kennels
   where id = 'c1000000-0000-4000-8000-000000000022';
  reset role;

  perform pg_temp.rec(48, 'anônimo lê canil ocultado pelo admin', '0 linhas',
                      v_anon || ' linhas', v_anon = 0);
  perform pg_temp.rec(49, 'o DONO lê o próprio canil ocultado', '1 linha',
                      v_dono || ' linhas', v_dono = 1);
exception when others then
  reset role;
  perform pg_temp.rec(48, 'anônimo lê canil ocultado pelo admin', '0 linhas',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 50. Mídia do canil oculto some junto, SEM uma linha de policy a mais:
--     `media_select` pergunta "o canil existe para mim?" em vez de repetir a
--     regra de publicação. É o desenho delegado pagando dividendo.
do $$
declare v_n int;
begin
  set local role anon;
  set local "request.jwt.claims" to '';
  select count(*) into v_n from public.media
   where storage_path = 'battery/u8/logo-oculto.webp';
  reset role;
  perform pg_temp.rec(50, 'anônimo lê a mídia de um canil ocultado', '0 linhas',
                      v_n || ' linhas', v_n = 0);
exception when others then
  reset role;
  perform pg_temp.rec(50, 'anônimo lê a mídia de um canil ocultado', '0 linhas',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 51. Cão oculto some para o anônimo.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_dog_hidden(
    'd1000000-0000-4000-8000-00000000000a', true, 'foto imprópria — caso de bateria');
  reset role;

  set local role anon;
  set local "request.jwt.claims" to '';
  select count(*) into v_n from public.dogs
   where id = 'd1000000-0000-4000-8000-00000000000a';
  reset role;

  perform pg_temp.rec(51, 'anônimo lê cão ocultado pelo admin', '0 linhas',
                      v_n || ' linhas', v_n = 0);
exception when others then
  reset role;
  perform pg_temp.rec(51, 'anônimo lê cão ocultado pelo admin', '0 linhas',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 52. E no pedigree de terceiro ele vira NÓ SEM LINK: o nome continua saindo
--     (pedigree com lacuna não é pedigree), mas sem public_id não há URL
--     construível. A árvore não quebra e o registro não é alcançável.
do $$
declare v_nome text; v_pub text; v_is_public boolean;
begin
  select p.name, p.public_id, p.is_public into v_nome, v_pub, v_is_public
    from public.dog_pedigree('d1000000-0000-4000-8000-00000000000c', 5) p
   where p.pos = 2;  -- pai do sujeito

  perform pg_temp.rec(52, 'cão ocultado no pedigree de terceiro',
                      'nome sai, public_id e is_public não',
                      'nome ' || coalesce(v_nome, 'NULO') ||
                      ' / public_id ' || coalesce(v_pub, 'nulo') ||
                      ' / is_public ' || coalesce(v_is_public::text, 'nulo'),
                      v_nome = 'Battery A' and v_pub is null and v_is_public is false);
end $$;

-- 53. LIMITAÇÃO DELIBERADA, sob teste para não virar surpresa no painel:
--     ocultar o canil NÃO oculta os cães dele. Cada ocultação é uma decisão e
--     uma linha de auditoria; um botão "ocultar tudo" é N chamadas, não cascata.
do $$
declare v_n int;
begin
  set local role anon;
  set local "request.jwt.claims" to '';
  select count(*) into v_n from public.dogs
   where id = 'd1000000-0000-4000-8000-00000000000b';  -- Battery B, canil de u1, não ocultado
  reset role;
  perform pg_temp.rec(53, 'ocultar canil oculta os cães dele? (não cascateia, de propósito)',
                      'cão segue visível — 1 linha', v_n || ' linhas', v_n = 1);
exception when others then
  reset role;
  perform pg_temp.rec(53, 'ocultar canil oculta os cães dele?', '1 linha',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 54. `admin_get_profile_email` — a quinta função admin_*, nascida na tela de
--     detalhe do usuário. Mesma dupla camada de todo `admin_*`: aqui é a
--     rejeição pela camada SQL; `scripts/test-rls.mts` prova pela API a
--     rejeição E o sucesso (a primeira chamada admin_* de sucesso provada
--     naquele arquivo).
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform public.admin_get_profile_email('b1000000-0000-4000-8000-000000000007');
  reset role;
  perform pg_temp.rec(54, 'usuário comum chama admin_get_profile_email',
                      '42501 insufficient_privilege',
                      'ACEITOU — QUALQUER UM LÊ O E-MAIL DE QUALQUER UM', false);
exception when others then
  reset role;
  perform pg_temp.rec(54, 'usuário comum chama admin_get_profile_email',
                      '42501 insufficient_privilege', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- 55/56. Reativar canil e cão — os casos 48-53 só exercitam OCULTAR; nenhum
--        prova o outro lado do ciclo (o painel também tem botão "Reativar").
--        Reaproveita os mesmos dois registros ocultados acima.
do $$
declare v_anon int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_kennel_hidden(
    'c1000000-0000-4000-8000-000000000022', false, 'apuração encerrada — caso de bateria');
  reset role;

  set local role anon;
  set local "request.jwt.claims" to '';
  select count(*) into v_anon from public.kennels
   where id = 'c1000000-0000-4000-8000-000000000022';
  reset role;

  perform pg_temp.rec(55, 'anônimo volta a ler o canil, depois de reativado', '1 linha',
                      v_anon || ' linhas', v_anon = 1);
exception when others then
  reset role;
  perform pg_temp.rec(55, 'anônimo volta a ler o canil, depois de reativado', '1 linha',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

do $$
declare v_anon int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_dog_hidden(
    'd1000000-0000-4000-8000-00000000000a', false, 'apuração encerrada — caso de bateria');
  reset role;

  set local role anon;
  set local "request.jwt.claims" to '';
  select count(*) into v_anon from public.dogs
   where id = 'd1000000-0000-4000-8000-00000000000a';
  reset role;

  perform pg_temp.rec(56, 'anônimo volta a ler o cão, depois de reativado', '1 linha',
                      v_anon || ' linhas', v_anon = 1);
exception when others then
  reset role;
  perform pg_temp.rec(56, 'anônimo volta a ler o cão, depois de reativado', '1 linha',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 57-60. Legenda por foto — o CHECK `media_caption_len` (migration
--        `legenda_de_foto`) é quem garante o contrato, não a aplicação.
--        `MAX_CAPTION_LENGTH` em constraints.ts espelha o mesmo 140.
do $$
begin
  insert into public.media (bucket_id, storage_path, dog_id, role, mime, size_bytes,
                            owner_id, created_by, caption)
  values ('kennel-media', 'battery/legenda-ok-' || gen_random_uuid() || '.webp',
          'd1000000-0000-4000-8000-00000000000a', 'dog_gallery', 'image/webp', 1000,
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
          repeat('x', 140));
  perform pg_temp.rec(57, 'legenda com exatamente 140 caracteres', 'aceita', 'aceita', true);
exception when others then
  perform pg_temp.rec(57, 'legenda com exatamente 140 caracteres', 'aceita',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- Um caractere além do teto é recusado pelo CHECK, não só pela aplicação —
-- a defesa não pode depender só do `maxLength` do campo HTML.
do $$
begin
  insert into public.media (bucket_id, storage_path, dog_id, role, mime, size_bytes,
                            owner_id, created_by, caption)
  values ('kennel-media', 'battery/legenda-estoura-' || gen_random_uuid() || '.webp',
          'd1000000-0000-4000-8000-00000000000a', 'dog_gallery', 'image/webp', 1000,
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
          repeat('x', 141));
  perform pg_temp.rec(58, 'legenda com 141 caracteres', '23514 check_violation',
                      'ACEITOU — passou do teto', false);
exception when others then
  perform pg_temp.rec(58, 'legenda com 141 caracteres', '23514 check_violation',
                      sqlstate || ' ' || sqlerrm, sqlstate = '23514');
end $$;

-- Legenda só de espaço é recusada — "sem legenda" só existe como NULL,
-- nunca como string vazia/em branco. É o que impede uma faixa vazia na
-- página pública.
do $$
begin
  insert into public.media (bucket_id, storage_path, dog_id, role, mime, size_bytes,
                            owner_id, created_by, caption)
  values ('kennel-media', 'battery/legenda-vazia-' || gen_random_uuid() || '.webp',
          'd1000000-0000-4000-8000-00000000000a', 'dog_gallery', 'image/webp', 1000,
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
          '   ');
  perform pg_temp.rec(59, 'legenda só de espaço', '23514 check_violation',
                      'ACEITOU — string em branco virou legenda', false);
exception when others then
  perform pg_temp.rec(59, 'legenda só de espaço', '23514 check_violation',
                      sqlstate || ' ' || sqlerrm, sqlstate = '23514');
end $$;

-- NULL segue livre — "sem legenda" continua barato de representar.
do $$
begin
  insert into public.media (bucket_id, storage_path, dog_id, role, mime, size_bytes,
                            owner_id, created_by, caption)
  values ('kennel-media', 'battery/legenda-null-' || gen_random_uuid() || '.webp',
          'd1000000-0000-4000-8000-00000000000a', 'dog_gallery', 'image/webp', 1000,
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
          null);
  perform pg_temp.rec(60, 'legenda NULL', 'aceita', 'aceita', true);
exception when others then
  perform pg_temp.rec(60, 'legenda NULL', 'aceita', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- -----------------------------------------------------------------------------
-- Grupo 9 — vídeo do cão (dog_videos)
--
-- Os CHECKs desta tabela não são higiene: `playback_origin` vira o `src` de um
-- <iframe> na página pública, e `status = 'ready'` é exatamente a condição que
-- faz a seção de vídeo aparecer lá. Cada caso abaixo fecha um jeito de a página
-- pública renderizar um player que não abre — ou que aponta para fora.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into public.dog_videos (dog_id, provider_uid, status, owner_id, created_by)
  values ('d1000000-0000-4000-8000-00000000000a', 'battery-status-invalido', 'transcodificando',
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(61, 'status de vídeo fora da lista da API', '23514 check_violation',
                      'aceitou', false);
exception when others then
  perform pg_temp.rec(61, 'status de vídeo fora da lista da API', '23514 check_violation',
                      sqlstate || ' ' || sqlerrm, sqlstate = '23514');
end $$;

-- 'ready' sem poster e sem origem: a página pública renderizaria a seção e o
-- player não teria para onde apontar.
do $$
begin
  insert into public.dog_videos (dog_id, provider_uid, status, owner_id, created_by)
  values ('d1000000-0000-4000-8000-00000000000a', 'battery-ready-vazio', 'ready',
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(62, 'vídeo ready sem poster nem origem', '23514 check_violation',
                      'aceitou', false);
exception when others then
  perform pg_temp.rec(62, 'vídeo ready sem poster nem origem', '23514 check_violation',
                      sqlstate || ' ' || sqlerrm, sqlstate = '23514');
end $$;

-- Origem forjada. É o caso que impede um iframe da página pública de apontar
-- para um host de terceiro.
do $$
begin
  insert into public.dog_videos (dog_id, provider_uid, status, thumbnail_url,
                                 playback_origin, owner_id, created_by)
  values ('d1000000-0000-4000-8000-00000000000a', 'battery-origem-forjada', 'ready',
          'https://exemplo.test/t.jpg', 'https://customer-abc.cloudflarestream.com.exemplo.test',
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(63, 'playback_origin em host de terceiro', '23514 check_violation',
                      'aceitou', false);
exception when others then
  perform pg_temp.rec(63, 'playback_origin em host de terceiro', '23514 check_violation',
                      sqlstate || ' ' || sqlerrm, sqlstate = '23514');
end $$;

do $$
begin
  insert into public.dog_videos (dog_id, provider_uid, status, thumbnail_url,
                                 playback_origin, duration_seconds, owner_id, created_by)
  values ('d1000000-0000-4000-8000-00000000000a', 'battery-longo', 'ready',
          'https://customer-battery1.cloudflarestream.com/x/thumbnails/thumbnail.jpg',
          'https://customer-battery1.cloudflarestream.com', 240,
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(64, 'vídeo acima do teto de duração', '23514 check_violation',
                      'aceitou', false);
exception when others then
  perform pg_temp.rec(64, 'vídeo acima do teto de duração', '23514 check_violation',
                      sqlstate || ' ' || sqlerrm, sqlstate = '23514');
end $$;

-- Caminho feliz. Também é a fixture do caso 66 — precisa existir uma linha VIVA
-- para o índice único parcial ter contra o que reclamar.
do $$
begin
  insert into public.dog_videos (dog_id, provider_uid, status, thumbnail_url,
                                 playback_origin, duration_seconds, owner_id, created_by)
  values ('d1000000-0000-4000-8000-00000000000a', 'battery-ok', 'ready',
          'https://customer-battery1.cloudflarestream.com/x/thumbnails/thumbnail.jpg',
          'https://customer-battery1.cloudflarestream.com', 42.5,
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(65, 'vídeo pronto e bem formado', 'aceita', 'aceita', true);
exception when others then
  perform pg_temp.rec(65, 'vídeo pronto e bem formado', 'aceita',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- Um vídeo por cão. Índice único PARCIAL: o excluído logicamente libera a vaga,
-- que é o que torna "trocar o vídeo" possível sem apagar histórico.
do $$
begin
  insert into public.dog_videos (dog_id, provider_uid, status, owner_id, created_by)
  values ('d1000000-0000-4000-8000-00000000000a', 'battery-segundo', 'pendingupload',
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(66, 'segundo vídeo vivo no mesmo cão', '23505 unique_violation',
                      'aceitou', false);
exception when others then
  perform pg_temp.rec(66, 'segundo vídeo vivo no mesmo cão', '23505 unique_violation',
                      sqlstate || ' ' || sqlerrm, sqlstate = '23505');
end $$;

-- Excluir logicamente LIBERA a vaga — a assimetria que faz a troca funcionar.
do $$
begin
  update public.dog_videos set deleted_at = now() where provider_uid = 'battery-ok';

  insert into public.dog_videos (dog_id, provider_uid, status, owner_id, created_by)
  values ('d1000000-0000-4000-8000-00000000000a', 'battery-substituto', 'pendingupload',
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(67, 'novo vídeo depois de excluir o anterior', 'aceita', 'aceita', true);
exception when others then
  perform pg_temp.rec(67, 'novo vídeo depois de excluir o anterior', 'aceita',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- =============================================================================
-- Grupo 8 — ninhada completa: filhote é `dogs` (casos 68 a 78)
--
-- Fixture: ninhada L1 no canil de u1, com A (macho) e B (fêmea) de progenitores
-- — os mesmos que já geraram Battery C, então linebreeding continua legítimo.
-- =============================================================================

insert into public.kennel_litters (id, kennel_id, sire_id, dam_id, mated_on, created_by)
values ('e1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-00000000000b',
        current_date - 60, 'b1000000-0000-4000-8000-000000000001');

-- 68. public_id da ninhada nasce preenchido e no formato do alfabeto sem ambíguos
do $$
declare v_pid text;
begin
  select public_id into v_pid from public.kennel_litters
   where id = 'e1000000-0000-4000-8000-000000000001';
  perform pg_temp.rec(68, 'ninhada nasce com public_id válido', 'casa ^[2-9a-hjkmnp-z]{12}$',
                      coalesce(v_pid, '(nulo)'), v_pid ~ '^[2-9a-hjkmnp-z]{12}$');
end $$;

-- 69. public_id da ninhada é imutável — o link divulgado não pode mudar de dono
do $$
begin
  update public.kennel_litters set public_id = 'abcdefghjkmn'
   where id = 'e1000000-0000-4000-8000-000000000001';
  perform pg_temp.rec(69, 'trocar public_id da ninhada', 'bloqueio',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(69, 'trocar public_id da ninhada', 'bloqueio',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 70. progenitor da ninhada com sexo trocado
do $$
begin
  update public.kennel_litters set sire_id = 'd1000000-0000-4000-8000-00000000000b'
   where id = 'e1000000-0000-4000-8000-000000000001';
  perform pg_temp.rec(70, 'fêmea na posição de pai da ninhada', 'bloqueio',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(70, 'fêmea na posição de pai da ninhada', 'bloqueio',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 71. nascimento antes da cobrição (kennel_litters_born_after_mated)
do $$
begin
  update public.kennel_litters set born_on = current_date - 90
   where id = 'e1000000-0000-4000-8000-000000000001';
  perform pg_temp.rec(71, 'nascimento anterior à cobrição', 'bloqueio',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(71, 'nascimento anterior à cobrição', 'bloqueio',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- Filhote de fixture, com o par COPIADO da ninhada — o caminho feliz.
do $$
begin
  insert into public.dogs (id, name, sex, kennel_id, owner_id, created_by,
                           litter_id, litter_status, sire_id, dam_id)
  values ('d1000000-0000-4000-8000-0000000000f1', 'Battery Filhote 1', 'male',
          'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
          'b1000000-0000-4000-8000-000000000001',
          'e1000000-0000-4000-8000-000000000001', 'available',
          'd1000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-00000000000b');
  perform pg_temp.rec(72, 'filhote com o par da ninhada', 'aceita', 'aceita', true);
exception when others then
  perform pg_temp.rec(72, 'filhote com o par da ninhada', 'aceita',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 73. filhote com par DIFERENTE do da ninhada (dogs_check_litter_parents)
do $$
begin
  insert into public.dogs (name, sex, kennel_id, owner_id, created_by,
                           litter_id, litter_status, sire_id, dam_id)
  values ('Battery Filhote Divergente', 'female',
          'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
          'b1000000-0000-4000-8000-000000000001',
          'e1000000-0000-4000-8000-000000000001', 'available',
          'd1000000-0000-4000-8000-00000000000c', 'd1000000-0000-4000-8000-00000000000b');
  perform pg_temp.rec(73, 'filhote com pai diferente do da ninhada', 'bloqueio',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(73, 'filhote com pai diferente do da ninhada', 'bloqueio',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 74. status sem ninhada (dogs_litter_status_requires_litter, bicondicional)
do $$
begin
  update public.dogs set litter_status = 'sold'
   where id = 'd1000000-0000-4000-8000-00000000000c';
  perform pg_temp.rec(74, 'status de ninhada em cão sem ninhada', 'bloqueio',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(74, 'status de ninhada em cão sem ninhada', 'bloqueio',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 75. o outro lado do bicondicional: ninhada sem status
do $$
begin
  update public.dogs set litter_status = null
   where id = 'd1000000-0000-4000-8000-0000000000f1';
  perform pg_temp.rec(75, 'filhote de ninhada sem status', 'bloqueio',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(75, 'filhote de ninhada sem status', 'bloqueio',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 76. preço em cão fora de ninhada — a fronteira do aditivo, no schema
do $$
begin
  update public.dogs set price_brl = 4500
   where id = 'd1000000-0000-4000-8000-00000000000c';
  perform pg_temp.rec(76, 'preço em cão sem ninhada', 'bloqueio',
                      'aceitou — FRONTEIRA DO ADITIVO DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(76, 'preço em cão sem ninhada', 'bloqueio',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 77. trocar o par da ninhada REESCREVE o dos filhotes (cascata, não bloqueio)
--
-- Prova o trigger AFTER `kennel_litters_sync_puppy_parents`. Bloquear seria a
-- escolha errada: o criador que descobre o reprodutor depois teria de excluir e
-- recadastrar os filhotes, queimando public_id que pode já estar impresso.
do $$
declare v_sire uuid;
begin
  -- 'Battery E' é macho e não descende de A/B, então não fecha ciclo.
  insert into public.dogs (id, name, sex, created_by)
  values ('d1000000-0000-4000-8000-0000000000e1', 'Battery E', 'male',
          'b1000000-0000-4000-8000-000000000001')
  on conflict (id) do nothing;

  update public.kennel_litters set sire_id = 'd1000000-0000-4000-8000-0000000000e1'
   where id = 'e1000000-0000-4000-8000-000000000001';

  select sire_id into v_sire from public.dogs
   where id = 'd1000000-0000-4000-8000-0000000000f1';

  perform pg_temp.rec(77, 'trocar pai da ninhada cascateia para os filhotes',
                      'filhote passa a apontar para Battery E',
                      coalesce(v_sire::text, '(nulo)'),
                      v_sire = 'd1000000-0000-4000-8000-0000000000e1');
exception when others then
  perform pg_temp.rec(77, 'trocar pai da ninhada cascateia para os filhotes',
                      'filhote passa a apontar para Battery E',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 78. vacina sem tipo (dog_health_records_vaccine_needs_product)
--
-- "Vacinado em 12/08" sem dizer contra o quê não informa nada a quem compra o
-- filhote. Vermífugo sem marca é aceito — o criador pode não lembrar.
do $$
begin
  insert into public.dog_health_records (dog_id, kind, applied_on, created_by)
  values ('d1000000-0000-4000-8000-0000000000f1', 'vaccine', current_date,
          'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(78, 'vacina sem tipo', 'bloqueio',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(78, 'vacina sem tipo', 'bloqueio',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- 79. vermífugo sem marca é aceito — o contraste que prova que o CHECK 78 é
-- específico da vacina, e não um "produto obrigatório" genérico.
do $$
begin
  insert into public.dog_health_records (dog_id, kind, applied_on, created_by)
  values ('d1000000-0000-4000-8000-0000000000f1', 'deworming', current_date,
          'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(79, 'vermífugo sem marca', 'aceita', 'aceita', true);
exception when others then
  perform pg_temp.rec(79, 'vermífugo sem marca', 'aceita',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 80. exame genético sem resultado
do $$
begin
  insert into public.dog_genetic_tests (dog_id, name, result, created_by)
  values ('d1000000-0000-4000-8000-00000000000a', 'L2HGA', '',
          'b1000000-0000-4000-8000-000000000001');
  perform pg_temp.rec(80, 'exame genético com resultado vazio', 'bloqueio',
                      'aceitou — INVARIANTE DESPROTEGIDA', false);
exception when others then
  perform pg_temp.rec(80, 'exame genético com resultado vazio', 'bloqueio',
                      sqlstate || ' ' || sqlerrm, true);
end $$;

-- =============================================================================
-- Grupo 10 — admin cadastra cão e ninhada em nome de outro usuário (casos 81 a 95)
--
-- O que está sob teste não é "o admin consegue inserir" — a RLS já permitia
-- isso antes desta migration (`dogs_insert`/`kennel_litters_insert` já tinham
-- `or private.is_admin()`). É o que só a FUNÇÃO garante:
--
--   * quem NÃO é admin continua recusado, tanto pela RPC quanto pelo INSERT
--     direto — inclusive o buraco de owner_id que esta mesma migration fecha;
--   * owner_id do registro criado é sempre o DONO DO CANIL DE DESTINO, nunca
--     um parâmetro;
--   * cada chamada gera EXATAMENTE 1 linha de audit_log, com o motivo;
--   * o filhote herda o par e a publicação da NINHADA, nunca decide sozinho, e
--     não escapa para o canil de outra pessoa;
--   * o teto de 4 filhotes, que não existe como CHECK no banco, é respeitado
--     pela função por `for update`;
--   * o DONO — não o admin — continua sendo quem lê e edita o registro depois.
--     Este último é o requisito central do pedido: sem ele, "cadastrar em nome
--     de alguém" seria só um registro órfão que ninguém no painel do criador
--     consegue tocar.
--
-- FORA DE ESCOPO DE PROPÓSITO: o canil de destino (K9) não tem cidade/estado/
-- logo, então não é elegível ao selo Fundador — a mesma escolha que os canis
-- de fixture do restante do arquivo já fazem, para não consumir um número real
-- da sequence por um cadastro de teste. A captura do selo pela função (risco
-- documentado na migration) fica coberta em outro nível: o mecanismo do
-- trigger já é exaustivamente testado nos Grupos 5 e 7 deste arquivo, e o
-- FORMATO da captura em `audit_log.details` é testado em
-- `src/modules/admin/format.test.ts`. Testar as duas coisas outra vez aqui,
-- contra um número real da sequence, só duplicaria cobertura.
-- =============================================================================

-- battery_ids guarda o id que uma criação devolveu, para casos SEGUINTES
-- reencontrarem o mesmo registro sem depender de nome/descrição — mesma ideia
-- de battery_result, só que para os próprios dados de fixture.
create temp table battery_ids (
  label text primary key,
  id    uuid not null
);

do $$
declare
  u9 constant uuid := 'b1000000-0000-4000-8000-000000000009';  -- dono de destino
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values
    (u9, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u9@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Nove"}'::jsonb);
end $$;

-- K9: canil de DESTINO. Sem cidade/estado/logo — ver nota de escopo acima.
insert into public.kennels (id, owner_id, name, slug, created_by)
values ('c1000000-0000-4000-8000-000000000024', 'b1000000-0000-4000-8000-000000000009',
        'Canil Battery Nove', 'battery-canil-nove', 'b1000000-0000-4000-8000-000000000009');

-- L2: ninhada de K9, NÃO publicada — para o filhote 88 provar que nada herda.
-- L3: ninhada de K9, JÁ publicada — para o filhote 89 provar que herda.
-- Progenitores reaproveitam A/B (já usados no resto do arquivo): sire/dam não
-- são escopados ao canil de quem cadastra, e este arquivo já prova isso em
-- outro caso — não é o que está sob teste aqui.
insert into public.kennel_litters (id, kennel_id, sire_id, dam_id, created_by, published_at)
values
  ('e1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000024',
   'd1000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-00000000000b',
   'b1000000-0000-4000-8000-000000000009', null),
  ('e1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000024',
   'd1000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-00000000000b',
   'b1000000-0000-4000-8000-000000000009', now());

-- -----------------------------------------------------------------------------
-- Quem NÃO é admin continua recusado — pelas duas portas
-- -----------------------------------------------------------------------------

-- 81. Usuário comum chama admin_create_dog_for_kennel.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_name      => 'Tentativa Não-Admin',
    p_sex       => 'male',
    p_reason    => 'tentativa de usuário comum'
  );
  reset role;
  perform pg_temp.rec(81, 'usuário comum chama admin_create_dog_for_kennel',
                      '42501 insufficient_privilege',
                      'ACEITOU — QUALQUER UM CADASTRA CÃO PARA QUALQUER UM', false);
exception when others then
  reset role;
  perform pg_temp.rec(81, 'usuário comum chama admin_create_dog_for_kennel',
                      '42501 insufficient_privilege', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- 82. Usuário comum chama admin_create_litter_for_kennel.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform public.admin_create_litter_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_reason    => 'tentativa de usuário comum'
  );
  reset role;
  perform pg_temp.rec(82, 'usuário comum chama admin_create_litter_for_kennel',
                      '42501 insufficient_privilege',
                      'ACEITOU — QUALQUER UM CADASTRA NINHADA PARA QUALQUER UM', false);
exception when others then
  reset role;
  perform pg_temp.rec(82, 'usuário comum chama admin_create_litter_for_kennel',
                      '42501 insufficient_privilege', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- 83. O buraco que esta mesma migration fecha: usuário comum insere cão com
--     owner_id de OUTRA pessoa, direto pela API, sem passar por função nenhuma.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  insert into public.dogs (name, sex, owner_id, created_by)
  values ('Battery Plantado', 'male', 'b1000000-0000-4000-8000-000000000002',
          'b1000000-0000-4000-8000-000000000001');
  reset role;
  perform pg_temp.rec(83, 'usuário comum cadastra cão com owner_id de outra pessoa',
                      '42501 — recusado pela RLS',
                      'ACEITOU — CÃO PLANTADO NO PAINEL DE ESTRANHO', false);
exception when others then
  reset role;
  perform pg_temp.rec(83, 'usuário comum cadastra cão com owner_id de outra pessoa',
                      '42501 — recusado pela RLS', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- -----------------------------------------------------------------------------
-- Admin cadastra cão e ninhada comuns (sem ninhada / sem filhote) para u9
-- -----------------------------------------------------------------------------

-- 84. Cão comum: owner_id vem do CANIL, created_by é o ADMIN.
do $$
declare
  v_dog_id  uuid;
  v_owner   uuid;
  v_kennel  uuid;
  v_creator uuid;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_name      => 'Battery Cadastrado Pelo Admin',
    p_sex       => 'male',
    p_reason    => 'cliente pediu por telefone — caso de bateria'
  ) into v_dog_id;
  reset role;

  insert into battery_ids values ('dog_para_u9', v_dog_id);

  select owner_id, kennel_id, created_by into v_owner, v_kennel, v_creator
    from public.dogs where id = v_dog_id;

  perform pg_temp.rec(84, 'admin cadastra cão comum no canil de outro usuário',
                      'owner=u9, kennel=K9, created_by=admin',
                      'owner=' || coalesce(v_owner::text, 'nulo') ||
                      ' kennel=' || coalesce(v_kennel::text, 'nulo') ||
                      ' created_by=' || coalesce(v_creator::text, 'nulo'),
                      v_owner = 'b1000000-0000-4000-8000-000000000009'
                      and v_kennel = 'c1000000-0000-4000-8000-000000000024'
                      and v_creator = 'b1000000-0000-4000-8000-000000000006');
exception when others then
  reset role;
  perform pg_temp.rec(84, 'admin cadastra cão comum no canil de outro usuário',
                      'owner=u9, kennel=K9, created_by=admin',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 85. Uma chamada, uma linha de auditoria, com o motivo preservado — mesma
--     garantia já provada para suspensão (caso 34), agora para criação.
do $$
declare v_n int; v_reason text; v_dog_id uuid;
begin
  select id into v_dog_id from battery_ids where label = 'dog_para_u9';
  select count(*), max(reason) into v_n, v_reason from public.audit_log
   where entity_type = 'dog' and entity_id = v_dog_id and action = 'dog.create_for_user';
  perform pg_temp.rec(85, 'cadastro de cão para outro usuário gera exatamente 1 linha de auditoria',
                      '1 linha, motivo preservado',
                      v_n || ' linha(s), motivo: ' || coalesce(v_reason, 'NENHUM'),
                      v_n = 1 and v_reason = 'cliente pediu por telefone — caso de bateria');
end $$;

-- 86. Ninhada: nasce SEMPRE rascunho — publicar continua sendo do dono.
do $$
declare v_litter_id uuid; v_created_by uuid; v_published timestamptz;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_create_litter_for_kennel(
    p_kennel_id   => 'c1000000-0000-4000-8000-000000000024',
    p_reason      => 'criador pediu ajuda para cadastrar — caso de bateria',
    p_description => 'Battery ninhada cadastrada pelo admin'
  ) into v_litter_id;
  reset role;

  insert into battery_ids values ('ninhada_para_u9', v_litter_id);

  select created_by, published_at into v_created_by, v_published
    from public.kennel_litters where id = v_litter_id;

  perform pg_temp.rec(86, 'admin cadastra ninhada no canil de outro usuário — nasce rascunho',
                      'created_by=admin, published_at nulo',
                      'created_by=' || coalesce(v_created_by::text, 'nulo') ||
                      ' published_at=' || coalesce(v_published::text, 'nulo'),
                      v_created_by = 'b1000000-0000-4000-8000-000000000006'
                      and v_published is null);
exception when others then
  reset role;
  perform pg_temp.rec(86, 'admin cadastra ninhada no canil de outro usuário — nasce rascunho',
                      'created_by=admin, published_at nulo',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 87. Mesma garantia de auditoria, agora para ninhada.
do $$
declare v_n int; v_litter_id uuid;
begin
  select id into v_litter_id from battery_ids where label = 'ninhada_para_u9';
  select count(*) into v_n from public.audit_log
   where entity_type = 'litter' and entity_id = v_litter_id
     and action = 'litter.create_for_user';
  perform pg_temp.rec(87, 'cadastro de ninhada para outro usuário gera exatamente 1 linha de auditoria',
                      '1 linha', v_n || ' linha(s)', v_n = 1);
end $$;

-- -----------------------------------------------------------------------------
-- Filhote: herda da ninhada, não escapa para outro canil, respeita o teto
-- -----------------------------------------------------------------------------

-- 88. Filhote em ninhada NÃO publicada: par copiado, status default, e NADA
--     publicado — não existe decisão do dono para herdar ainda.
do $$
declare
  v_puppy_id uuid;
  v_litter   uuid;
  v_status   text;
  v_sire     uuid;
  v_dam      uuid;
  v_pub      timestamptz;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_name      => 'Battery Filhote Admin 1',
    p_sex       => 'male',
    p_reason    => 'primeiro filhote cadastrado pelo admin — caso de bateria',
    p_litter_id => 'e1000000-0000-4000-8000-000000000002'
  ) into v_puppy_id;
  reset role;

  insert into battery_ids values ('filhote_l2_1', v_puppy_id);

  select litter_id, litter_status, sire_id, dam_id, published_at
    into v_litter, v_status, v_sire, v_dam, v_pub
    from public.dogs where id = v_puppy_id;

  perform pg_temp.rec(88, 'filhote cadastrado pelo admin em ninhada não publicada',
                      'par copiado da ninhada, status=available, published_at nulo',
                      'litter=' || coalesce(v_litter::text, 'nulo') ||
                      ' status=' || coalesce(v_status, 'nulo') ||
                      ' par_correto=' ||
                        (v_sire = 'd1000000-0000-4000-8000-00000000000a'
                         and v_dam = 'd1000000-0000-4000-8000-00000000000b')::text ||
                      ' published_at=' || coalesce(v_pub::text, 'nulo'),
                      v_litter = 'e1000000-0000-4000-8000-000000000002'
                      and v_status = 'available'
                      and v_sire = 'd1000000-0000-4000-8000-00000000000a'
                      and v_dam = 'd1000000-0000-4000-8000-00000000000b'
                      and v_pub is null);
exception when others then
  reset role;
  perform pg_temp.rec(88, 'filhote cadastrado pelo admin em ninhada não publicada',
                      'par copiado, status=available, published_at nulo',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 89. Filhote em ninhada JÁ publicada: herda a publicação — foi decisão do
--     dono ao publicar a ninhada, o admin só reflete o que já era público.
do $$
declare v_puppy_id uuid; v_pub timestamptz;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_name      => 'Battery Filhote Admin Publicado',
    p_sex       => 'female',
    p_reason    => 'ninhada já estava no ar — caso de bateria',
    p_litter_id => 'e1000000-0000-4000-8000-000000000003'
  ) into v_puppy_id;
  reset role;

  select published_at into v_pub from public.dogs where id = v_puppy_id;

  perform pg_temp.rec(89, 'filhote cadastrado pelo admin em ninhada JÁ publicada',
                      'published_at herdado — não nulo',
                      coalesce(v_pub::text, 'nulo'), v_pub is not null);
exception when others then
  reset role;
  perform pg_temp.rec(89, 'filhote cadastrado pelo admin em ninhada JÁ publicada',
                      'published_at herdado — não nulo',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 90. Filhote em ninhada que NÃO pertence ao canil de destino. A policy
--     `owns_litter` que barraria isso não roda dentro de uma SECURITY
--     DEFINER — é a própria função que precisa recusar.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000001',  -- canil de u1
    p_name      => 'Battery Filhote Canil Errado',
    p_sex       => 'male',
    p_reason    => 'tentativa deliberada — caso de bateria',
    p_litter_id => 'e1000000-0000-4000-8000-000000000002'  -- L2 é de K9, não de u1
  );
  reset role;
  perform pg_temp.rec(90, 'filhote em ninhada de canil diferente do destino',
                      '23514 check_violation',
                      'ACEITOU — FILHOTE PLANTADO EM CANIL ERRADO', false);
exception when others then
  reset role;
  perform pg_temp.rec(90, 'filhote em ninhada de canil diferente do destino',
                      '23514 check_violation', sqlstate || ' ' || sqlerrm,
                      sqlstate = '23514');
end $$;

-- Completa a fixture: mais dois filhotes em L2, para chegar a 3 antes do teto.
-- Não numerado — mesmo papel do "caminho feliz" que prepara os casos 66/72.
do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_name      => 'Battery Filhote Admin 2',
    p_sex       => 'female',
    p_reason    => 'completando fixture do teto — caso de bateria',
    p_litter_id => 'e1000000-0000-4000-8000-000000000002'
  ) into v_id;
  select public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_name      => 'Battery Filhote Admin 3',
    p_sex       => 'male',
    p_reason    => 'completando fixture do teto — caso de bateria',
    p_litter_id => 'e1000000-0000-4000-8000-000000000002'
  ) into v_id;
  reset role;
end $$;

-- 91. Quarto filhote na mesma ninhada — ainda dentro do teto de 4.
do $$
declare v_id uuid; v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_name      => 'Battery Filhote Admin 4',
    p_sex       => 'female',
    p_reason    => 'quarto filhote — caso de bateria',
    p_litter_id => 'e1000000-0000-4000-8000-000000000002'
  ) into v_id;
  reset role;

  select count(*) into v_n from public.dogs
   where litter_id = 'e1000000-0000-4000-8000-000000000002' and deleted_at is null;
  perform pg_temp.rec(91, 'quarto filhote na mesma ninhada', '4 filhotes vivos',
                      v_n || ' filhote(s)', v_n = 4);
exception when others then
  reset role;
  perform pg_temp.rec(91, 'quarto filhote na mesma ninhada', '4 filhotes vivos',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 92. Quinto filhote — estoura o teto. Não há CHECK equivalente no banco para
--     este caminho; quem garante é o `for update` + contagem dentro da função.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_name      => 'Battery Filhote Admin 5',
    p_sex       => 'male',
    p_reason    => 'quinto filhote — caso de bateria',
    p_litter_id => 'e1000000-0000-4000-8000-000000000002'
  );
  reset role;
  perform pg_temp.rec(92, 'quinto filhote na mesma ninhada — estoura o teto',
                      '23514 check_violation',
                      'ACEITOU — TETO DE 4 FILHOTES DESPROTEGIDO', false);
exception when others then
  reset role;
  perform pg_temp.rec(92, 'quinto filhote na mesma ninhada — estoura o teto',
                      '23514 check_violation', sqlstate || ' ' || sqlerrm,
                      sqlstate = '23514');
end $$;

-- 93. Canil de destino inexistente.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000099',
    p_name      => 'Battery Canil Fantasma',
    p_sex       => 'male',
    p_reason    => 'canil não existe — caso de bateria'
  );
  reset role;
  perform pg_temp.rec(93, 'admin cadastra cão em canil inexistente', 'P0002 no_data_found',
                      'ACEITOU — INSERIU EM CANIL QUE NÃO EXISTE', false);
exception when others then
  reset role;
  perform pg_temp.rec(93, 'admin cadastra cão em canil inexistente', 'P0002 no_data_found',
                      sqlstate || ' ' || sqlerrm, sqlstate = 'P0002');
end $$;

-- -----------------------------------------------------------------------------
-- O requisito central: o DONO, não o admin, continua sendo quem controla o
-- registro depois. Sem isto, "cadastrar em nome de alguém" seria só um
-- registro órfão que ninguém no painel do criador consegue tocar.
-- -----------------------------------------------------------------------------

-- 94. Dono lê e edita o cão que o admin cadastrou em nome dele.
do $$
declare v_dog_id uuid; v_read int; v_upd int;
begin
  select id into v_dog_id from battery_ids where label = 'dog_para_u9';

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000009","role":"authenticated"}';

  select count(*) into v_read from public.dogs where id = v_dog_id;

  with upd as (
    update public.dogs set breed = 'Atualizado pelo dono' where id = v_dog_id returning 1
  ) select count(*) into v_upd from upd;
  reset role;

  perform pg_temp.rec(94, 'dono vê e edita o cão que o admin cadastrou em nome dele',
                      '1 leitura, 1 atualização',
                      v_read || ' leitura(s), ' || v_upd || ' atualização(ões)',
                      v_read = 1 and v_upd = 1);
exception when others then
  reset role;
  perform pg_temp.rec(94, 'dono vê e edita o cão que o admin cadastrou em nome dele',
                      '1 leitura, 1 atualização', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 95. Dono edita a ninhada que o admin cadastrou em nome dele.
do $$
declare v_litter_id uuid; v_upd int;
begin
  select id into v_litter_id from battery_ids where label = 'ninhada_para_u9';

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000009","role":"authenticated"}';

  with upd as (
    update public.kennel_litters set description = 'Atualizado pelo dono'
     where id = v_litter_id returning 1
  ) select count(*) into v_upd from upd;
  reset role;

  perform pg_temp.rec(95, 'dono edita a ninhada que o admin cadastrou em nome dele',
                      '1 atualização', v_upd || ' atualização(ões)', v_upd = 1);
exception when others then
  reset role;
  perform pg_temp.rec(95, 'dono edita a ninhada que o admin cadastrou em nome dele',
                      '1 atualização', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- -----------------------------------------------------------------------------
-- Admin SUSPENSO
--
-- O caso 39 já prova que `private.is_admin()` devolve false para admin
-- suspenso. Estes dois provam a consequência que importa AQUI, e que nada mais
-- no arquivo cobre: dentro de uma SECURITY DEFINER não sobra RLS nenhuma — a
-- cláusula `not private.is_suspended()` que as policies carregam simplesmente
-- não roda. O guard `is_admin()` no topo da função é a ÚNICA barreira, e é ela
-- que está sob teste.
--
-- Suspende, tenta, e reativa SEMPRE — o bloco interno pega o erro para que o
-- externo consiga desfazer a suspensão mesmo quando a chamada levanta. Mesmo
-- vai-e-volta do caso 39.
-- -----------------------------------------------------------------------------

-- 96. Admin suspenso chamando admin_create_dog_for_kennel.
do $$
declare v_erro text;
begin
  update public.profiles set suspended_at = now()
   where id = 'b1000000-0000-4000-8000-000000000006';

  begin
    set local role authenticated;
    set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
    perform public.admin_create_dog_for_kennel(
      p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
      p_name      => 'Battery Admin Suspenso',
      p_sex       => 'male',
      p_reason    => 'admin suspenso tentando cadastrar — caso de bateria'
    );
    reset role;
    v_erro := null;
  exception when others then
    reset role;
    v_erro := sqlstate;
  end;

  update public.profiles set suspended_at = null
   where id = 'b1000000-0000-4000-8000-000000000006';

  perform pg_temp.rec(96, 'admin SUSPENSO chama admin_create_dog_for_kennel',
                      '42501 insufficient_privilege',
                      coalesce(v_erro, 'ACEITOU — SUSPENSÃO NÃO BARRA O ADMIN'),
                      v_erro = '42501');
end $$;

-- 97. O mesmo para a ninhada — as duas funções têm o guard, e provar só uma
--     deixaria a outra livre para perdê-lo numa migration futura.
do $$
declare v_erro text;
begin
  update public.profiles set suspended_at = now()
   where id = 'b1000000-0000-4000-8000-000000000006';

  begin
    set local role authenticated;
    set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
    perform public.admin_create_litter_for_kennel(
      p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
      p_reason    => 'admin suspenso tentando cadastrar — caso de bateria'
    );
    reset role;
    v_erro := null;
  exception when others then
    reset role;
    v_erro := sqlstate;
  end;

  update public.profiles set suspended_at = null
   where id = 'b1000000-0000-4000-8000-000000000006';

  perform pg_temp.rec(97, 'admin SUSPENSO chama admin_create_litter_for_kennel',
                      '42501 insufficient_privilege',
                      coalesce(v_erro, 'ACEITOU — SUSPENSÃO NÃO BARRA O ADMIN'),
                      v_erro = '42501');
end $$;

-- 98. E o contraste que impede o falso positivo: reativado, o MESMO admin volta
--     a cadastrar. Sem isto, uma função que recusasse todo mundo passaria em 96
--     e 97 e ninguém notaria até a tela quebrar.
do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_create_dog_for_kennel(
    p_kennel_id => 'c1000000-0000-4000-8000-000000000024',
    p_name      => 'Battery Admin Reativado',
    p_sex       => 'female',
    p_reason    => 'admin reativado volta a cadastrar — caso de bateria'
  ) into v_id;
  reset role;

  perform pg_temp.rec(98, 'admin REATIVADO volta a cadastrar', 'id devolvido',
                      coalesce(v_id::text, 'nulo'), v_id is not null);
exception when others then
  reset role;
  perform pg_temp.rec(98, 'admin REATIVADO volta a cadastrar', 'id devolvido',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- =============================================================================
-- Grupo 11 — admin cadastra CANIL e MÍDIA, e PUBLICA, em nome de outro usuário
--            (casos 99 a 116)
--
-- Continuação do Grupo 10, para a migration `admin_cadastra_tudo_para_usuario`.
-- O que só a FUNÇÃO garante, e nenhuma policy garantiria:
--
--   * quem NÃO é admin continua recusado nas QUATRO portas novas;
--   * `owner_id` do canil é o USUÁRIO ALVO e `created_by` é o admin;
--   * o canil nasce RASCUNHO — publicar é ação separada, com linha própria;
--   * `kennels_owner_uk` e `kennels_slug_key` chegam os dois como 23505, e a
--     função os distingue pelo NOME do índice para dar mensagem certa;
--   * o caminho da mídia TEM de começar pelo id do dono — é o que impede
--     metadata apontando para arquivo alheio (caso 114);
--   * publicar duas vezes NÃO gera duas linhas de auditoria (o ramo no-op);
--   * o DONO continua editando o que o admin criou.
--
-- FORA DAQUI, e por limitação do Storage e não por escolha: o caminho FELIZ do
-- registro de mídia. `storage.protect_delete()` recusa DELETE direto em
-- `storage.objects`, então um objeto de fixture ficaria para sempre — ver a
-- nota antes do caso 114. Quem prova aquilo é o Cenário 22 de
-- `scripts/test-rls.mts`, com upload de verdade.
--
-- FORA DE ESCOPO DE PROPÓSITO: o canil criado aqui NÃO recebe cidade/estado,
-- então não fica elegível ao selo Fundador. Sem isso, este grupo queimaria um
-- número REAL da sequence a cada execução — e `kennels_freeze_founder_number`
-- tornaria isso irreversível. Mesma escolha que o Grupo 10 já fazia com K9.
-- =============================================================================

do $$
declare
  u10 constant uuid := 'b1000000-0000-4000-8000-000000000010';  -- sem canil ainda
  u11 constant uuid := 'b1000000-0000-4000-8000-000000000011';  -- para o slug queimado
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values
    (u10, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u10@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Dez"}'::jsonb),
    (u11, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'battery-u11@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Battery Onze"}'::jsonb);
end $$;

-- -----------------------------------------------------------------------------
-- Quem NÃO é admin continua recusado — nas quatro portas novas
-- -----------------------------------------------------------------------------

-- 99. Usuário comum chama admin_create_kennel_for_user.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform public.admin_create_kennel_for_user(
    p_owner_id => 'b1000000-0000-4000-8000-000000000010',
    p_name     => 'Canil Tentativa',
    p_slug     => 'battery-tentativa-comum',
    p_reason   => 'tentativa de usuário comum'
  );
  reset role;
  perform pg_temp.rec(99, 'usuário comum chama admin_create_kennel_for_user',
                      '42501 insufficient_privilege',
                      'ACEITOU — QUALQUER UM CRIA CANIL PARA QUALQUER UM', false);
exception when others then
  reset role;
  perform pg_temp.rec(99, 'usuário comum chama admin_create_kennel_for_user',
                      '42501 insufficient_privilege', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- 100. Usuário comum chama admin_register_media_for_user.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform public.admin_register_media_for_user(
    p_role         => 'kennel_logo',
    p_entity_id    => 'c1000000-0000-4000-8000-000000000024',
    p_storage_path => 'qualquer/coisa.webp',
    p_reason       => 'tentativa de usuário comum'
  );
  reset role;
  perform pg_temp.rec(100, 'usuário comum chama admin_register_media_for_user',
                      '42501 insufficient_privilege',
                      'ACEITOU — QUALQUER UM REGISTRA MÍDIA PARA QUALQUER UM', false);
exception when others then
  reset role;
  perform pg_temp.rec(100, 'usuário comum chama admin_register_media_for_user',
                      '42501 insufficient_privilege', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- 101. Usuário comum chama admin_set_dog_published.
do $$
declare v_dog_id uuid;
begin
  select id into v_dog_id from battery_ids where label = 'dog_para_u9';
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform public.admin_set_dog_published(v_dog_id, true, 'tentativa de usuário comum');
  reset role;
  perform pg_temp.rec(101, 'usuário comum chama admin_set_dog_published',
                      '42501 insufficient_privilege',
                      'ACEITOU — QUALQUER UM PUBLICA CÃO DE QUALQUER UM', false);
exception when others then
  reset role;
  perform pg_temp.rec(101, 'usuário comum chama admin_set_dog_published',
                      '42501 insufficient_privilege', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- 102. Usuário comum chama admin_set_kennel_published.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform public.admin_set_kennel_published(
    'c1000000-0000-4000-8000-000000000024', true, 'tentativa de usuário comum');
  reset role;
  perform pg_temp.rec(102, 'usuário comum chama admin_set_kennel_published',
                      '42501 insufficient_privilege',
                      'ACEITOU — QUALQUER UM PUBLICA CANIL DE QUALQUER UM', false);
exception when others then
  reset role;
  perform pg_temp.rec(102, 'usuário comum chama admin_set_kennel_published',
                      '42501 insufficient_privilege', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- -----------------------------------------------------------------------------
-- O canil nasce do dono certo, com autoria do admin, em rascunho
-- -----------------------------------------------------------------------------

-- 103. SEM cidade/estado, de propósito — ver a nota de escopo e o caso 116.
do $$
declare
  v_id      uuid;
  v_owner   uuid;
  v_creator uuid;
  v_pub     timestamptz;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_create_kennel_for_user(
    p_owner_id => 'b1000000-0000-4000-8000-000000000010',
    p_name     => 'Canil Battery Dez',
    p_slug     => 'battery-canil-dez',
    p_reason   => 'criador sem canil pediu ajuda — caso de bateria'
  ) into v_id;
  reset role;

  insert into battery_ids values ('canil_para_u10', v_id);

  select k.owner_id, k.created_by, k.published_at
    into v_owner, v_creator, v_pub
    from public.kennels k where k.id = v_id;

  perform pg_temp.rec(103, 'admin cria canil: dono é o alvo, autoria é do admin, nasce rascunho',
                      'owner=u10 created_by=admin published_at=nulo',
                      'owner=' || coalesce(v_owner::text, 'nulo')
                        || ' created_by=' || coalesce(v_creator::text, 'nulo')
                        || ' published_at=' || coalesce(v_pub::text, 'nulo'),
                      v_owner = 'b1000000-0000-4000-8000-000000000010'
                      and v_creator = 'b1000000-0000-4000-8000-000000000006'
                      and v_pub is null);
exception when others then
  reset role;
  perform pg_temp.rec(103, 'admin cria canil: dono é o alvo, autoria é do admin, nasce rascunho',
                      'sucesso', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 104. Uma linha de auditoria, com o motivo e o slug queimado no details.
do $$
declare
  v_id     uuid;
  v_n      int;
  -- TEXT, não uuid: não existe `min(uuid)`/`max(uuid)` no Postgres. O cast é o
  -- que permite agregar o ator numa consulta que também conta as linhas —
  -- mesmo motivo pelo qual o caso 85 agrega só `reason`.
  v_actor  text;
  v_reason text;
  v_slug   text;
begin
  select id into v_id from battery_ids where label = 'canil_para_u10';

  select count(*), max(a.actor_id::text), max(a.reason), max(a.details->>'slug')
    into v_n, v_actor, v_reason, v_slug
    from public.audit_log a
   where a.action = 'kennel.create_for_user' and a.entity_id = v_id;

  perform pg_temp.rec(104, 'criação do canil gera 1 linha de auditoria, com motivo e slug',
                      '1 linha, ator=admin, slug=battery-canil-dez',
                      v_n || ' linha(s), ator=' || coalesce(v_actor, 'nulo')
                        || ', slug=' || coalesce(v_slug, 'nulo')
                        || ', motivo=' || coalesce(left(v_reason, 20), 'nulo'),
                      v_n = 1
                      and v_actor = 'b1000000-0000-4000-8000-000000000006'
                      and v_slug = 'battery-canil-dez'
                      and v_reason like 'criador sem canil%');
end $$;

-- 105. Segundo canil para o MESMO dono. `kennels_owner_uk` é único parcial em
--      `(owner_id) where deleted_at is null` — um criador tem no máximo um
--      canil vivo, e é invariante do projeto.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_create_kennel_for_user(
    p_owner_id => 'b1000000-0000-4000-8000-000000000010',
    p_name     => 'Canil Battery Dez Bis',
    p_slug     => 'battery-canil-dez-bis',
    p_reason   => 'tentativa de segundo canil — caso de bateria'
  );
  reset role;
  perform pg_temp.rec(105, 'segundo canil para o mesmo dono', '23505 unique_violation',
                      'ACEITOU — DOIS CANIS VIVOS PARA O MESMO CRIADOR', false);
exception when others then
  reset role;
  perform pg_temp.rec(105, 'segundo canil para o mesmo dono', '23505 unique_violation',
                      sqlstate || ' ' || sqlerrm, sqlstate = '23505');
end $$;

-- 106. Slug JÁ QUEIMADO, para um dono que ainda não tem canil. Isola o outro
--      índice: aqui `kennels_owner_uk` não é violado, só `kennels_slug_key`.
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_create_kennel_for_user(
    p_owner_id => 'b1000000-0000-4000-8000-000000000011',
    p_name     => 'Canil Slug Repetido',
    p_slug     => 'battery-canil-nove',  -- já é de K9
    p_reason   => 'tentativa de slug repetido — caso de bateria'
  );
  reset role;
  perform pg_temp.rec(106, 'slug já em uso é recusado com a mensagem do slug, não a do dono',
                      '23505 + mensagem sobre endereço',
                      'ACEITOU — DOIS CANIS COM O MESMO ENDEREÇO', false);
exception when others then
  reset role;
  v_msg := sqlerrm;
  perform pg_temp.rec(106, 'slug já em uso é recusado com a mensagem do slug, não a do dono',
                      '23505 + mensagem sobre endereço',
                      sqlstate || ' ' || left(v_msg, 40),
                      sqlstate = '23505' and v_msg like '%endereço%');
end $$;

-- 107. Usuário de destino inexistente.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_create_kennel_for_user(
    p_owner_id => 'b1000000-0000-4000-8000-0000000000ff',
    p_name     => 'Canil do Ninguém',
    p_slug     => 'battery-canil-ninguem',
    p_reason   => 'usuário inexistente — caso de bateria'
  );
  reset role;
  perform pg_temp.rec(107, 'canil para usuário inexistente', 'P0002 no_data_found',
                      'ACEITOU — CANIL SEM DONO DE VERDADE', false);
exception when others then
  reset role;
  perform pg_temp.rec(107, 'canil para usuário inexistente', 'P0002 no_data_found',
                      sqlstate || ' ' || sqlerrm, sqlstate = 'P0002');
end $$;

-- 108. O REQUISITO CENTRAL: o dono edita o canil que o admin criou, como se
--      fosse dele. Sem isto, "cadastrar em nome de alguém" produziria um
--      registro órfão que ninguém no painel do criador consegue tocar.
do $$
declare v_id uuid; v_n int;
begin
  select id into v_id from battery_ids where label = 'canil_para_u10';

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000010","role":"authenticated"}';
  with alterado as (
    update public.kennels set description = 'editado pelo dono'
     where id = v_id and deleted_at is null
    returning 1
  )
  select count(*) into v_n from alterado;
  reset role;

  perform pg_temp.rec(108, 'o DONO edita o canil que o admin criou para ele',
                      '1 linha alterada', v_n || ' linha(s)', v_n = 1);
exception when others then
  reset role;
  perform pg_temp.rec(108, 'o DONO edita o canil que o admin criou para ele',
                      '1 linha alterada', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- -----------------------------------------------------------------------------
-- Publicação: ação SEPARADA da criação, e auditada
-- -----------------------------------------------------------------------------

-- 109. Admin publica o canil que criou.
do $$
declare v_id uuid; v_pub timestamptz;
begin
  select id into v_id from battery_ids where label = 'canil_para_u10';

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_kennel_published(v_id, true, 'dono pediu para colocar no ar');
  reset role;

  select published_at into v_pub from public.kennels where id = v_id;

  perform pg_temp.rec(109, 'admin publica o canil do dono', 'published_at preenchido',
                      coalesce(v_pub::text, 'nulo'), v_pub is not null);
exception when others then
  reset role;
  perform pg_temp.rec(109, 'admin publica o canil do dono', 'published_at preenchido',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 110. Auditoria da publicação — ação PRÓPRIA, separada da criação.
do $$
declare v_id uuid; v_n int; v_actor text;
begin
  select id into v_id from battery_ids where label = 'canil_para_u10';

  select count(*), max(a.actor_id::text) into v_n, v_actor
    from public.audit_log a
   where a.action = 'kennel.publish' and a.entity_id = v_id;

  perform pg_temp.rec(110, 'publicar gera linha kennel.publish, distinta da criação',
                      '1 linha, ator=admin',
                      v_n || ' linha(s), ator=' || coalesce(v_actor, 'nulo'),
                      v_n = 1 and v_actor = 'b1000000-0000-4000-8000-000000000006');
end $$;

-- 111. Publicar de novo é NO-OP e não polui a trilha. O ramo
--      `if (v_old is not null) = p_published then return` existe para isto:
--      sem ele, cada clique repetido viraria uma linha de histórico que não
--      mudou nada.
do $$
declare v_id uuid; v_n int;
begin
  select id into v_id from battery_ids where label = 'canil_para_u10';

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_kennel_published(v_id, true, 'segunda chamada — caso de bateria');
  reset role;

  select count(*) into v_n from public.audit_log a
   where a.action = 'kennel.publish' and a.entity_id = v_id;

  perform pg_temp.rec(111, 'publicar canil já publicado não gera segunda linha',
                      '1 linha', v_n || ' linha(s)', v_n = 1);
exception when others then
  reset role;
  perform pg_temp.rec(111, 'publicar canil já publicado não gera segunda linha',
                      '1 linha', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 112. Tirar do ar é o par oposto, com ação própria.
do $$
declare v_id uuid; v_pub timestamptz; v_n int;
begin
  select id into v_id from battery_ids where label = 'canil_para_u10';

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_kennel_published(v_id, false, 'dono pediu para tirar do ar');
  reset role;

  select published_at into v_pub from public.kennels where id = v_id;
  select count(*) into v_n from public.audit_log a
   where a.action = 'kennel.unpublish' and a.entity_id = v_id;

  perform pg_temp.rec(112, 'admin tira o canil do ar, com ação própria na trilha',
                      'published_at nulo e 1 linha kennel.unpublish',
                      'published_at=' || coalesce(v_pub::text, 'nulo')
                        || ' linhas=' || v_n,
                      v_pub is null and v_n = 1);
exception when others then
  reset role;
  perform pg_temp.rec(112, 'admin tira o canil do ar, com ação própria na trilha',
                      'published_at nulo e 1 linha kennel.unpublish',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 113. O mesmo para CÃO, sobre o registro que o Grupo 10 criou.
do $$
declare v_dog_id uuid; v_pub timestamptz; v_n int;
begin
  select id into v_dog_id from battery_ids where label = 'dog_para_u9';

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_set_dog_published(v_dog_id, true, 'dono pediu para publicar o cão');
  reset role;

  select published_at into v_pub from public.dogs where id = v_dog_id;
  select count(*) into v_n from public.audit_log a
   where a.action = 'dog.publish' and a.entity_id = v_dog_id;

  perform pg_temp.rec(113, 'admin publica o cão do dono, com auditoria',
                      'published_at preenchido e 1 linha dog.publish',
                      'published_at=' || coalesce(v_pub::text, 'nulo') || ' linhas=' || v_n,
                      v_pub is not null and v_n = 1);
exception when others then
  reset role;
  perform pg_temp.rec(113, 'admin publica o cão do dono, com auditoria',
                      'published_at preenchido e 1 linha dog.publish',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- -----------------------------------------------------------------------------
-- Mídia: o dono sai da ENTIDADE, e o caminho tem de ser o dele
-- -----------------------------------------------------------------------------

-- O CAMINHO FELIZ DA MÍDIA NÃO MORA AQUI, e a limitação é do Storage, não uma
-- escolha de cobertura: `storage.protect_delete()` recusa DELETE direto em
-- `storage.objects` ("Use the Storage API instead"). O INSERT de um objeto de
-- fixture até passa, mas não haveria como removê-lo — e como esta bateria
-- COMMITA quando passa, cada execução deixaria para trás uma linha apontando
-- para um arquivo que nunca existiu.
--
-- Quem prova o registro bem-sucedido é o Cenário 22 de `scripts/test-rls.mts`,
-- com upload de verdade pela API do Storage: dono vindo da entidade, autoria do
-- admin e mime lido do arquivo. É evidência mais forte que esta, não mais fraca.
--
-- O que SOBRA para o SQL é o caso 114, e ele não precisa de arquivo nenhum: a
-- checagem de prefixo acontece ANTES da leitura de `storage.objects`, então a
-- recusa é alcançável sem fixture.

-- 114. Caminho começando pelo id do ADMIN, não do dono. A policy de Storage
--      aceitaria (o admin pode escrever sob qualquer prefixo vivo), então é a
--      função quem impede a metadata de apontar para arquivo de outra pessoa.
do $$
declare v_k uuid;
begin
  select id into v_k from battery_ids where label = 'canil_para_u10';

  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_register_media_for_user(
    p_role         => 'kennel_logo',
    p_entity_id    => v_k,
    p_storage_path => 'b1000000-0000-4000-8000-000000000006/kennel_logo/x/y.webp',
    p_reason       => 'caminho no prefixo errado — caso de bateria'
  );
  reset role;
  perform pg_temp.rec(114, 'mídia com caminho fora do prefixo do dono',
                      '23514 check_violation',
                      'ACEITOU — METADATA APONTANDO PARA ARQUIVO DE OUTRA PESSOA', false);
exception when others then
  reset role;
  perform pg_temp.rec(114, 'mídia com caminho fora do prefixo do dono',
                      '23514 check_violation', sqlstate || ' ' || sqlerrm,
                      sqlstate = '23514');
end $$;


-- -----------------------------------------------------------------------------
-- Admin SUSPENSO nas portas novas. Dentro de SECURITY DEFINER não há RLS:
-- `private.is_admin()` é a ÚNICA coisa que barra.
-- -----------------------------------------------------------------------------

-- 115. Admin suspenso cria canil.
do $$
declare v_erro text;
begin
  update public.profiles set suspended_at = now()
   where id = 'b1000000-0000-4000-8000-000000000006';

  begin
    set local role authenticated;
    set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
    perform public.admin_create_kennel_for_user(
      p_owner_id => 'b1000000-0000-4000-8000-000000000011',
      p_name     => 'Canil de Admin Suspenso',
      p_slug     => 'battery-canil-suspenso',
      p_reason   => 'admin suspenso tentando criar canil — caso de bateria'
    );
    reset role;
    v_erro := null;
  exception when others then
    reset role;
    v_erro := sqlstate;
  end;

  update public.profiles set suspended_at = null
   where id = 'b1000000-0000-4000-8000-000000000006';

  perform pg_temp.rec(115, 'admin SUSPENSO chama admin_create_kennel_for_user',
                      '42501 insufficient_privilege',
                      coalesce(v_erro, 'ACEITOU — SUSPENSÃO NÃO BARRA O ADMIN'),
                      v_erro = '42501');
end $$;

-- 116. Admin suspenso publica.
do $$
declare v_erro text; v_k uuid;
begin
  select id into v_k from battery_ids where label = 'canil_para_u10';

  update public.profiles set suspended_at = now()
   where id = 'b1000000-0000-4000-8000-000000000006';

  begin
    set local role authenticated;
    set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
    perform public.admin_set_kennel_published(v_k, true, 'admin suspenso publicando — bateria');
    reset role;
    v_erro := null;
  exception when others then
    reset role;
    v_erro := sqlstate;
  end;

  update public.profiles set suspended_at = null
   where id = 'b1000000-0000-4000-8000-000000000006';

  perform pg_temp.rec(116, 'admin SUSPENSO chama admin_set_kennel_published',
                      '42501 insufficient_privilege',
                      coalesce(v_erro, 'ACEITOU — SUSPENSÃO NÃO BARRA A PUBLICAÇÃO'),
                      v_erro = '42501');
end $$;


-- =============================================================================
-- Grupo 12 — cadastro assistido (casos 117 a 128)
--
-- O admin passa a escrever pela SESSÃO, não por ser admin. Isto ESTREITA o que
-- existia: `or private.is_admin()` estava solto em treze policies e dentro de
-- `private.can_manage_dog`, então um admin escrevia em vacina, exame genético,
-- microchip, vídeo, depoimento, FAQ e ninhada de qualquer criador, a qualquer
-- momento, sem rastro.
--
-- O caso 117 é o que prova o estreitamento, e o 128 é o que impede a correção
-- de virar bloqueio: o DONO continua escrevendo sem sessão nenhuma. Sem os dois
-- juntos, um `false` constante passaria em metade do grupo.
--
-- u6 = admin, u9 = dono de K9, u1 = criador comum (fixtures dos grupos 7 e 10).
-- =============================================================================

-- 117. SEM sessão, o admin não edita o canil de terceiro. Era permitido até
--      esta migration — é o buraco que ela fecha.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  with alterado as (
    update public.kennels set city = 'Tentativa Sem Sessao'
     where id = 'c1000000-0000-4000-8000-000000000024'
    returning 1
  )
  select count(*) into v_n from alterado;
  reset role;

  perform pg_temp.rec(117, 'admin SEM sessão edita canil de terceiro',
                      '0 linhas — policy nega',
                      v_n || ' linha(s)' || case when v_n > 0 then ' — ESCRITA SILENCIOSA CONTINUA' else '' end,
                      v_n = 0);
exception when others then
  reset role;
  perform pg_temp.rec(117, 'admin SEM sessão edita canil de terceiro',
                      '0 linhas — policy nega', sqlstate || ' ' || sqlerrm, sqlstate = '42501');
end $$;

-- 118. E também não escreve na saúde de um cão de terceiro — o ramo que vinha
--      de `can_manage_dog`, e que nenhuma tela jamais ofereceu.
do $$
declare v_dog_id uuid; v_erro text;
begin
  select id into v_dog_id from battery_ids where label = 'dog_para_u9';

  begin
    set local role authenticated;
    set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
    insert into public.dog_health_records (dog_id, kind, product, applied_on, created_by)
    values (v_dog_id, 'vaccine', 'V10 Battery', current_date, 'b1000000-0000-4000-8000-000000000006');
    reset role;
    v_erro := null;
  exception when others then
    reset role;
    v_erro := sqlstate;
  end;

  perform pg_temp.rec(118, 'admin SEM sessão grava saúde em cão de terceiro',
                      '42501 insufficient_privilege',
                      coalesce(v_erro, 'ACEITOU — ESCRITA SILENCIOSA EM PRONTUÁRIO'),
                      v_erro = '42501');
end $$;

-- 119. Usuário comum não abre sessão de cadastro assistido.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  perform public.admin_start_assist_session(
    'b1000000-0000-4000-8000-000000000009', 'tentativa de usuário comum');
  reset role;
  perform pg_temp.rec(119, 'usuário comum abre cadastro assistido',
                      '42501 insufficient_privilege',
                      'ACEITOU — QUALQUER UM ASSISTE QUALQUER UM', false);
exception when others then
  reset role;
  perform pg_temp.rec(119, 'usuário comum abre cadastro assistido',
                      '42501 insufficient_privilege', sqlstate || ' ' || sqlerrm,
                      sqlstate = '42501');
end $$;

-- 120. Admin não assiste a si mesmo — seria só uma forma de escapar do rastro
--      nas próprias telas.
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_start_assist_session(
    'b1000000-0000-4000-8000-000000000006', 'tentativa de assistir a si mesmo');
  reset role;
  perform pg_temp.rec(120, 'admin abre cadastro assistido para si mesmo',
                      '23514 check_violation', 'ACEITOU', false);
exception when others then
  reset role;
  perform pg_temp.rec(120, 'admin abre cadastro assistido para si mesmo',
                      '23514 check_violation', sqlstate || ' ' || sqlerrm,
                      sqlstate = '23514');
end $$;

-- 121. Abre a sessão de verdade.
do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  select public.admin_start_assist_session(
    'b1000000-0000-4000-8000-000000000009',
    'criador pediu ajuda por telefone — caso de bateria') into v_id;
  reset role;

  insert into battery_ids values ('sessao_u9', v_id);

  perform pg_temp.rec(121, 'admin abre cadastro assistido para u9', 'id devolvido',
                      coalesce(v_id::text, 'nulo'), v_id is not null);
exception when others then
  reset role;
  perform pg_temp.rec(121, 'admin abre cadastro assistido para u9', 'id devolvido',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 122. Segunda sessão, alvo diferente, é recusada: com duas abertas não há
--      resposta para "em nome de quem ele está escrevendo agora?".
do $$
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_start_assist_session(
    'b1000000-0000-4000-8000-000000000001', 'segunda sessão — caso de bateria');
  reset role;
  perform pg_temp.rec(122, 'segunda sessão aberta para outro alvo',
                      '23505 unique_violation', 'ACEITOU — DUAS SESSÕES ABERTAS', false);
exception when others then
  reset role;
  perform pg_temp.rec(122, 'segunda sessão aberta para outro alvo',
                      '23505 unique_violation', sqlstate || ' ' || sqlerrm,
                      sqlstate = '23505');
end $$;

-- 123. AGORA a mesma escrita do caso 117 passa.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  with alterado as (
    update public.kennels set city = 'Cidade Pelo Assistido'
     where id = 'c1000000-0000-4000-8000-000000000024'
    returning 1
  )
  select count(*) into v_n from alterado;
  reset role;

  perform pg_temp.rec(123, 'admin COM sessão edita o canil do alvo', '1 linha',
                      v_n || ' linha(s)', v_n = 1);
exception when others then
  reset role;
  perform pg_temp.rec(123, 'admin COM sessão edita o canil do alvo', '1 linha',
                      'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 124. E a escrita gerou trilha, com o motivo DA SESSÃO — ninguém digitou
--      motivo nesta operação.
do $$
declare v_n int; v_motivo text; v_tabela text;
begin
  select count(*), max(a.reason), max(a.details->>'tabela')
    into v_n, v_motivo, v_tabela
    from public.audit_log a
   where a.action = 'kennel.assist_write'
     and a.entity_id = 'c1000000-0000-4000-8000-000000000024';

  perform pg_temp.rec(124, 'escrita sob sessão vira linha de auditoria com o motivo da sessão',
                      '>=1 linha, motivo da sessão, tabela=kennels',
                      v_n || ' linha(s), tabela=' || coalesce(v_tabela, 'nulo')
                        || ', motivo=' || coalesce(left(v_motivo, 20), 'nulo'),
                      v_n >= 1 and v_tabela = 'kennels' and v_motivo like 'criador pediu ajuda%');
end $$;

-- 125. A saúde do cão do alvo, que o caso 118 recusou, agora entra.
do $$
declare v_dog_id uuid; v_erro text; v_n int;
begin
  select id into v_dog_id from battery_ids where label = 'dog_para_u9';

  begin
    set local role authenticated;
    set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
    insert into public.dog_health_records (dog_id, kind, product, applied_on, created_by)
    values (v_dog_id, 'vaccine', 'V10 Battery', current_date, 'b1000000-0000-4000-8000-000000000006');
    reset role;
    v_erro := null;
  exception when others then
    reset role;
    v_erro := sqlstate || ' ' || sqlerrm;
  end;

  select count(*) into v_n from public.audit_log a
   where a.action = 'dog.assist_write' and a.entity_id = v_dog_id
     and a.details->>'tabela' = 'dog_health_records';

  perform pg_temp.rec(125, 'admin COM sessão grava saúde no cão do alvo, e isso deixa trilha',
                      'sucesso e 1 linha de trilha',
                      coalesce(v_erro, 'gravou') || ', trilha=' || v_n,
                      v_erro is null and v_n = 1);
end $$;

-- 126. A sessão é de u9, então o canil de u1 continua fora de alcance. É o que
--      separa "assistir alguém" de "poder tudo".
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  with alterado as (
    update public.kennels set city = 'Fora do Alvo'
     where id = 'c1000000-0000-4000-8000-000000000001'
    returning 1
  )
  select count(*) into v_n from alterado;
  reset role;

  perform pg_temp.rec(126, 'sessão de u9 NÃO alcança o canil de outro criador',
                      '0 linhas',
                      v_n || ' linha(s)' || case when v_n > 0 then ' — SESSÃO VIROU PODER GERAL' else '' end,
                      v_n = 0);
exception when others then
  reset role;
  perform pg_temp.rec(126, 'sessão de u9 NÃO alcança o canil de outro criador',
                      '0 linhas', sqlstate || ' ' || sqlerrm, sqlstate = '42501');
end $$;

-- 127. Encerrada, o acesso fecha na hora.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  perform public.admin_end_assist_session();

  with alterado as (
    update public.kennels set city = 'Depois de Encerrar'
     where id = 'c1000000-0000-4000-8000-000000000024'
    returning 1
  )
  select count(*) into v_n from alterado;
  reset role;

  perform pg_temp.rec(127, 'encerrada a sessão, a escrita volta a ser negada',
                      '0 linhas',
                      v_n || ' linha(s)' || case when v_n > 0 then ' — SESSÃO NÃO FECHOU' else '' end,
                      v_n = 0);
exception when others then
  reset role;
  perform pg_temp.rec(127, 'encerrada a sessão, a escrita volta a ser negada',
                      '0 linhas', sqlstate || ' ' || sqlerrm, sqlstate = '42501');
end $$;

-- 128. O CONTRASTE que impede o falso positivo: o DONO edita o próprio canil
--      sem sessão nenhuma. Sem este caso, uma policy que negasse todo mundo
--      passaria em 117, 126 e 127 e ninguém notaria até o painel do criador
--      parar de salvar.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub":"b1000000-0000-4000-8000-000000000009","role":"authenticated"}';
  with alterado as (
    update public.kennels set city = 'Editado Pelo Dono'
     where id = 'c1000000-0000-4000-8000-000000000024'
    returning 1
  )
  select count(*) into v_n from alterado;
  reset role;

  perform pg_temp.rec(128, 'o DONO edita o próprio canil sem sessão nenhuma (controle)',
                      '1 linha', v_n || ' linha(s)', v_n = 1);
exception when others then
  reset role;
  perform pg_temp.rec(128, 'o DONO edita o próprio canil sem sessão nenhuma (controle)',
                      '1 linha', 'ERRO: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- =============================================================================
-- Grupo 13 — cadastro mínimo: o único CHECK novo (casos 129 e 130)
--
-- O aditivo de fluxo de 03/09/2026 é quase todo de aplicação — pesos de campo,
-- medidor e publicação automática são regra de TypeScript, testada por unidade
-- sem banco. O que desceu para o schema foram colunas nulas e UMA lista
-- fechada, e é ela que precisa de prova aqui.
--
-- `kennel_litters.status` NÃO reusa os valores de `dogs.litter_status`, que é
-- do FILHOTE e tem `sold`. Aqui "encerrada" é sobre a ninhada inteira, que pode
-- encerrar sem todos os filhotes terem saído — e é por isso que `sold` no lugar
-- de `closed` tem de ser recusado.
-- =============================================================================

-- 129. Status fora da lista é recusado — inclusive `sold`, que é justamente o
--      valor vizinho que alguém copiaria de `dogs.litter_status` por engano.
do $$
begin
  update public.kennel_litters set status = 'sold'
   where id = 'e1000000-0000-4000-8000-000000000002';
  perform pg_temp.rec(129, 'status de ninhada fora da lista fechada',
                      '23514 check_violation',
                      'ACEITOU — LISTA DE STATUS NÃO PROTEGIDA', false);
exception when others then
  perform pg_temp.rec(129, 'status de ninhada fora da lista fechada',
                      '23514 check_violation', sqlstate || ' ' || sqlerrm,
                      sqlstate = '23514');
end $$;

-- 130. O contraste: os três valores da lista entram, e `null` também — o status
--      faz parte do cadastro MÍNIMO, e mínimo não bloqueia gravação.
do $$
declare v_ok boolean := true; v_erro text;
begin
  begin
    update public.kennel_litters set status = 'available'
     where id = 'e1000000-0000-4000-8000-000000000002';
    update public.kennel_litters set status = 'reserved'
     where id = 'e1000000-0000-4000-8000-000000000002';
    update public.kennel_litters set status = 'closed'
     where id = 'e1000000-0000-4000-8000-000000000002';
    update public.kennel_litters set status = null
     where id = 'e1000000-0000-4000-8000-000000000002';
  exception when others then
    v_ok := false;
    v_erro := sqlstate || ' ' || sqlerrm;
  end;

  perform pg_temp.rec(130, 'os três status válidos entram, e nulo também',
                      'todos aceitos',
                      coalesce(v_erro, 'todos aceitos'), v_ok);
end $$;


-- =============================================================================
-- Grupo 14 — GRANT de coluna: a armadilha que já mordeu três vezes (131 e 132)
--
-- `kennels`, `dogs` e `profiles` não têm GRANT de UPDATE no nível da TABELA:
-- têm POR COLUNA. Nesse regime, coluna nova nasce sem privilégio, e o Postgres
-- recusa o UPDATE INTEIRO com 42501 — não só a coluna que falta. Um campo
-- acrescentado sem o `grant` correspondente derruba o formulário todo.
--
-- Já aconteceu três vezes: `instagram_handle`/`registration_number` em
-- `grant_kennel_instagram_registro`, e `breeds`/`auto_published_at` em
-- `cadastro_minimo`, que travou o painel do canil em produção. Três migrations
-- carregam comentários de alerta, e os comentários não bastaram — quem escreve
-- a migration seguinte não lê a anterior.
--
-- Por que estes dois casos PEGAM o que a bateria toda deixou passar: eles leem
-- METADADO (`pg_attribute` + `has_column_privilege`), não dados. A bateria roda
-- como superusuário, então todo caso que EXERCITA uma escrita é cego a GRANT —
-- o superusuário passa por cima de qualquer privilégio. Perguntar ao catálogo é
-- o único jeito de enxergar daqui.
--
-- `pg_attribute`, e não `information_schema.columns`, de propósito: aquela view
-- esconde colunas em que o usuário corrente não tem privilégio nenhum, o que
-- num teste sobre privilégio seria justamente apagar a evidência.
--
-- A lista de exceções é DECLARADA aqui. Mudar o privilégio de uma coluna passa
-- a exigir mexer nesta lista, num arquivo de teste, sob revisão — em vez de
-- acontecer por esquecimento.
-- =============================================================================

create temp table battery_grant_esperado (tabela text, coluna text);

insert into battery_grant_esperado values
  -- kennels: identidade, autoria e carimbos são do banco; `founder_number` é
  -- atribuído por função auditada e `hidden_at` é moderação de admin.
  ('kennels', 'id'), ('kennels', 'owner_id'), ('kennels', 'created_at'),
  ('kennels', 'created_by'), ('kennels', 'updated_at'),
  ('kennels', 'founder_number'), ('kennels', 'hidden_at'),
  -- dogs: só identidade e moderação.
  ('dogs', 'id'), ('dogs', 'hidden_at'),
  -- profiles: `role` é a mais importante da bateria inteira — concedê-la seria
  -- escalada de privilégio direta, qualquer usuário se promovendo a admin.
  -- `email_opt_out` e `unsubscribe_token` mudam pela rota de descadastro, que
  -- funciona SEM login e por isso não pode depender de `authenticated`.
  ('profiles', 'id'), ('profiles', 'role'), ('profiles', 'created_at'),
  ('profiles', 'updated_at'), ('profiles', 'deleted_at'),
  ('profiles', 'suspended_at'), ('profiles', 'email_opt_out'),
  ('profiles', 'unsubscribe_token');

-- 131. Coluna nova sem GRANT — o defeito que travou o painel do canil.
do $$
declare v_faltando text;
begin
  select string_agg(t.tabela || '.' || a.attname, ', ' order by t.tabela, a.attname)
    into v_faltando
    from (values ('kennels'), ('dogs'), ('profiles')) as t(tabela)
    join pg_attribute a
      on a.attrelid = ('public.' || t.tabela)::regclass
     and a.attnum > 0 and not a.attisdropped
   where not exists (
           select 1 from battery_grant_esperado e
            where e.tabela = t.tabela and e.coluna = a.attname)
     and not has_column_privilege('authenticated',
                                  ('public.' || t.tabela)::regclass,
                                  a.attname, 'UPDATE');

  perform pg_temp.rec(131, 'toda coluna editável tem GRANT de UPDATE para authenticated',
                      'nenhuma coluna sem privilégio',
                      coalesce('SEM GRANT — O FORMULÁRIO INTEIRO QUEBRA: ' || v_faltando,
                               'nenhuma coluna sem privilégio'),
                      v_faltando is null);
end $$;

-- 132. O sentido OPOSTO, e é o que protege de verdade: coluna da lista que
--      GANHOU privilégio. Um `grant update` largo demais em `profiles.role`
--      entrega admin a quem pedir, e nenhum outro caso desta bateria veria
--      isso — todos escrevem como superusuário.
do $$
declare v_vazadas text;
begin
  select string_agg(e.tabela || '.' || e.coluna, ', ' order by e.tabela, e.coluna)
    into v_vazadas
    from battery_grant_esperado e
   where has_column_privilege('authenticated',
                              ('public.' || e.tabela)::regclass,
                              e.coluna, 'UPDATE');

  perform pg_temp.rec(132, 'coluna protegida NÃO ganhou GRANT de UPDATE',
                      'nenhuma coluna protegida concedida',
                      coalesce('CONCEDIDA INDEVIDAMENTE: ' || v_vazadas,
                               'nenhuma coluna protegida concedida'),
                      v_vazadas is null);
end $$;

drop table battery_grant_esperado;

-- -----------------------------------------------------------------------------
-- Limpeza. Vem ANTES do relatório de propósito: a Management API devolve o
-- resultado do último statement, então o SELECT final tem de ser o último.
-- battery_result é temporária e independe das fixtures, então limpar aqui não
-- perde nada.
--
-- Ordem importa: identificadores antes dos cães, filhos antes de pais (FK
-- RESTRICT em sire_id/dam_id), cães antes dos canis (FK RESTRICT em kennel_id).
-- auth.users cascateia para profiles.
-- -----------------------------------------------------------------------------

-- Mídia antes dos canis: media.kennel_id é FK RESTRICT.
delete from public.media where storage_path like 'battery/%';

-- Cinto para qualquer mídia de fixture que não caia no padrão de caminho acima
-- — `admin_register_media_for_user` grava sob o prefixo do DONO, não sob
-- 'battery/'. Precisa vir antes de `auth.users` (owner_id é FK RESTRICT).
--
-- NÃO há `delete from storage.objects` aqui, e a ausência é obrigatória:
-- `storage.protect_delete()` recusa DELETE direto naquela tabela. É por isso
-- que este arquivo não cria objeto de Storage nenhum — ver a nota antes do
-- caso 114.
delete from public.media
 where owner_id in (select id from auth.users where email like 'battery-%@example.test');
-- Vídeo antes dos cães: dog_videos.dog_id é FK RESTRICT.
delete from public.dog_videos where provider_uid like 'battery-%';
delete from public.dog_identifiers
 where dog_id in (select id from public.dogs
                   where name like 'Battery%' or name = 'Rex do Dois');

-- Saúde e exames antes dos cães: as duas FKs são ON DELETE CASCADE, mas apagar
-- explicitamente mantém a limpeza legível e independente disso.
delete from public.dog_health_records
 where dog_id in (select id from public.dogs where name like 'Battery%');
delete from public.dog_genetic_tests
 where dog_id in (select id from public.dogs where name like 'Battery%');

-- A NINHADA FICA NO MEIO, e as duas metades da ordem são obrigatórias por FKs
-- que apontam em sentidos opostos — as duas já quebraram a limpeza na prática:
--
--   dogs.litter_id            -> kennel_litters   (RESTRICT)  filhote ANTES
--   kennel_litters.sire_id    -> dogs             (RESTRICT)  ninhada ANTES do
--   kennel_litters.dam_id     -> dogs             (RESTRICT)  progenitor dela
--
-- Ou seja: filhotes, depois ninhadas, depois o resto dos cães. Inverter
-- qualquer um dos dois lados derruba a limpeza inteira e a bateria morre sem
-- imprimir o relatório.
delete from public.dogs where name like 'Battery Filhote%';

-- POR CANIL, não por lista de id: o Grupo 10 cria ninhada pela RPC, com uuid
-- gerado na hora, e uma lista fixa deixava essa para trás — o DELETE de
-- `kennels` então falhava com `kennel_litters_kennel_id_fkey`.
delete from public.kennel_litters
 where kennel_id in (select id from public.kennels where slug like 'battery-%');

delete from public.dogs where name = 'Battery E';
delete from public.dogs where name in ('Battery C', 'Battery D');
delete from public.dogs where name like 'Battery%' or name = 'Rex do Dois';
delete from public.kennels where slug like 'battery-%';

-- Sessões de cadastro assistido: `admin_id` e `target_profile_id` são ON DELETE
-- RESTRICT, então elas saem antes dos perfis — mesma razão do audit_log abaixo.
delete from public.admin_assist_sessions
 where admin_id in (select id from auth.users where email like 'battery-%@example.test')
    or target_profile_id in (select id from auth.users where email like 'battery-%@example.test');

-- audit_log ANTES de auth.users: `actor_id` é ON DELETE RESTRICT de propósito
-- (trilha com ator apagado não é trilha), então apagar o admin de fixture sem
-- limpar as linhas dele derrubaria a limpeza inteira com erro de FK.
delete from public.audit_log
 where actor_id in (select id from auth.users where email like 'battery-%@example.test');

delete from auth.users where email like 'battery-%@example.test';

-- =============================================================================
-- Relatório — precisa ser o ÚLTIMO statement do arquivo
-- =============================================================================

select
  n,
  status,
  caso,
  esperado,
  obtido,
  (select count(*) from battery_result where status = 'FAIL') as total_fail
from battery_result
order by n;
