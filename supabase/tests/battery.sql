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
-- -----------------------------------------------------------------------------

do $$
declare
  u1 constant uuid := 'b1000000-0000-4000-8000-000000000001';
  u2 constant uuid := 'b1000000-0000-4000-8000-000000000002';
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
     '{"full_name":"Battery Dois"}'::jsonb);
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
insert into public.kennels (id, owner_id, name, slug, city, created_by)
values ('c1000000-0000-4000-8000-00000000000f', 'b1000000-0000-4000-8000-000000000001',
        'Battery Incompleto', 'battery-incompleto', 'Campinas',
        'b1000000-0000-4000-8000-000000000001');

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
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');

  insert into public.dogs (id, name, sex, kennel_id, owner_id, created_by)
  values ('d1000000-0000-4000-8000-000000000021', 'Battery Selo', 'male',
          'c1000000-0000-4000-8000-00000000000f',
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');
end $$;

-- 22. Ao completar, o trigger atribui.
do $$
declare v_number integer;
begin
  select founder_number into v_number from public.kennels
   where id = 'c1000000-0000-4000-8000-00000000000f';
  perform pg_temp.rec(22, 'canil completo recebe selo pelo trigger',
                      'número entre 1 e 100',
                      coalesce(v_number::text, 'NENHUM'),
                      v_number between 1 and 100);
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

-- 26. LIMITE: com a sequence esgotada, o próximo elegível não recebe selo e o
--     cadastro NÃO quebra. É o caso que prova que não sai o 101.
do $$
declare
  v_number integer;
  v_erro   text := 'sem erro';
begin
  -- Leva a sequence ao teto. `is_called = true` faz o próximo nextval estourar.
  perform setval('public.kennel_founder_seq', 100, true);

  insert into public.kennels (id, owner_id, name, slug, city, state, created_by)
  values ('c1000000-0000-4000-8000-000000000010', 'b1000000-0000-4000-8000-000000000001',
          'Battery Centro E Um', 'battery-101', 'Campinas', 'SP',
          'b1000000-0000-4000-8000-000000000001');

  insert into public.media (bucket_id, storage_path, kennel_id, role, mime, size_bytes, owner_id, created_by)
  values ('kennel-media', 'battery/logo101-' || gen_random_uuid() || '.webp',
          'c1000000-0000-4000-8000-000000000010', 'kennel_logo', 'image/webp', 1000,
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');

  -- Este INSERT dispara o trigger com a sequence esgotada. Precisa PASSAR.
  insert into public.dogs (id, name, sex, kennel_id, owner_id, created_by)
  values ('d1000000-0000-4000-8000-000000000022', 'Battery Cão 101', 'male',
          'c1000000-0000-4000-8000-000000000010',
          'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');

  select founder_number into v_number from public.kennels
   where id = 'c1000000-0000-4000-8000-000000000010';

  perform pg_temp.rec(26, 'pool esgotado: 101º canil elegível',
                      'sem selo, e o cadastro não quebra',
                      'selo ' || coalesce(v_number::text, 'nenhum') || ', cadastro ' || v_erro,
                      v_number is null);
exception when others then
  perform pg_temp.rec(26, 'pool esgotado: 101º canil elegível',
                      'sem selo, e o cadastro não quebra',
                      'CADASTRO QUEBROU: ' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- Restaura a sequence ao valor de antes da bateria.
do $$
declare b record;
begin
  select * into b from founder_seq_backup;
  perform setval('public.kennel_founder_seq', b.last_value, b.is_called);
end $$;

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
delete from public.dog_identifiers
 where dog_id in (select id from public.dogs
                   where name like 'Battery%' or name = 'Rex do Dois');
delete from public.dogs where name = 'Battery E';
delete from public.dogs where name in ('Battery C', 'Battery D');
delete from public.dogs where name like 'Battery%' or name = 'Rex do Dois';
delete from public.kennels where slug like 'battery-%';
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
