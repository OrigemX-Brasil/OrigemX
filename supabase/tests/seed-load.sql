-- =============================================================================
-- OrigemX — carga sintética, para auditoria de performance e teste de carga
--
--     npm run seed:load        (semeia)
--     npm run seed:load-clean  (remove)
--
-- APENAS PARA O PROJETO DE DESENVOLVIMENTO. Não é migration e não vai para o
-- banco do cliente.
--
-- Volume, acordado com o cliente para o teste de carga:
--
--     ~5.000 usuários · ~5.000 canis · ~50.000 cães · ~10.000 publicados
--
-- POR QUE VOLUME IMPORTA: com 60 cães, todo plano de consulta é um seq scan — e
-- está CERTO, porque varrer 60 linhas custa menos que abrir um índice. Qualquer
-- conclusão sobre carga tirada daquele tamanho seria chute. Aqui a tabela passa
-- do ponto onde o planner troca de estratégia.
--
-- POR CAMADAS, e não com pais sorteados no monte todo: a camada 0 não tem pais,
-- e cada camada seguinte só aponta para a anterior. Ciclo fica IMPOSSÍVEL por
-- construção, em vez de improvável — o trigger `dogs_check_ancestry` recusaria e
-- a semeadura morreria no meio. O sexo decide de qual lado o pai e a mãe saem,
-- porque o mesmo trigger valida que `sire_id` é macho e `dam_id` é fêmea.
--
-- É LENTO DE PROPÓSITO. Cada cão passa pelo trigger de ancestralidade, que
-- percorre a árvore acima dele. É o caminho que o produto usa de verdade — um
-- COPY seria mais rápido e não provaria nada sobre o custo real de inserção.
--
-- -----------------------------------------------------------------------------
-- SOBRE ESCREVER DIRETO EM `auth.users`
--
-- Criar 5.000 contas pela API de admin seriam 5.000 chamadas HTTP. Em SQL é uma
-- instrução. O preço é acertar o que o GoTrue espera, e ISSO FALHOU NA PRIMEIRA
-- TENTATIVA: os usuários nasciam e o login devolvia 500.
--
-- A causa: `confirmation_token`, `recovery_token`, `email_change` e
-- `email_change_token_new` aceitam NULL no banco, mas o GoTrue lê essas colunas
-- em `string` do Go, e NULL derruba o servidor de auth. Precisam ser `''`.
--
-- Foi descoberto com DEZ usuários de teste, não com cinco mil — a checagem de
-- login antes de escalar existe para isso, e continua no
-- `scripts/loadtest-prepare.mts`.
--
-- Uma senha, um hash: `gen_salt('bf')` é bcrypt e leva dezenas de milissegundos
-- por chamada. Cinco mil chamadas seriam minutos de CPU à toa; como todos os
-- usuários sintéticos compartilham a senha, um hash serve para todos.
-- =============================================================================

do $$
declare
  v_dominio    text := '@origemx-carga.com';
  v_senha_hash text;
  v_users      uuid[];
  v_kennels    uuid[];
  v_owners     uuid[];
  v_n_users    int := 5000;
  v_per_layer  int := 6250;
  v_layers     int := 7;          -- camada 0 + 7 = 8 camadas × 6.250 = 50.000
  v_layer      int;
  v_males      uuid[];
  v_females    uuid[];
  v_nm         uuid[];
  v_nf         uuid[];
  v_total      int;
begin
  v_senha_hash := extensions.crypt('Senha-De-Carga-123', extensions.gen_salt('bf'));

  -- ---------------------------------------------------------------- usuários
  with novos as (
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      -- As quatro que o GoTrue não aceita NULL. Ver o cabeçalho.
      confirmation_token, recovery_token, email_change, email_change_token_new
    )
    select '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
           'authenticated', 'authenticated',
           'carga-' || g || v_dominio, v_senha_hash,
           now(), now(), now(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           jsonb_build_object('full_name', 'Criador de Carga ' || g),
           '', '', '', ''
      from generate_series(1, v_n_users) g
    returning id
  )
  select array_agg(id) into v_users from novos;

  raise notice 'usuarios: %', array_length(v_users, 1);

  -- O GoTrue procura a identidade do provedor 'email' ao autenticar.
  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               created_at, updated_at, last_sign_in_at)
  select gen_random_uuid(), u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', now(), now(), now()
    from auth.users u
   where u.email like 'carga-%' || v_dominio
     and not exists (select 1 from auth.identities i where i.user_id = u.id);

  -- ------------------------------------------------------------------- canis
  -- Um por usuário. `profiles` já nasceu pelo trigger `handle_new_user`.
  with novos as (
    insert into public.kennels (name, slug, owner_id, created_by, city, state, description)
    select 'Canil de Carga ' || g, 'carga-canil-' || g,
           v_users[g], v_users[g],
           (array['Sao Paulo','Curitiba','Bauru','Londrina','Belo Horizonte'])[1 + (g % 5)],
           (array['SP','PR','SP','PR','MG'])[1 + (g % 5)],
           'Canil sintetico de teste de carga.'
      from generate_series(1, v_n_users) g
    returning id, owner_id
  )
  select array_agg(id order by id), array_agg(owner_id order by id)
    into v_kennels, v_owners
    from novos;

  raise notice 'canis: %', array_length(v_kennels, 1);

  -- -------------------------------------------------------------------- cães
  -- Camada 0: raiz da floresta, sem pais.
  with ins as (
    insert into public.dogs (name, sex, breed, color, coat, kennel_id, owner_id, created_by, born_on)
    select 'Carga L0 ' || g,
           case when g % 2 = 0 then 'male' else 'female' end,
           (array['Fila Brasileiro','Pastor Alemao','Golden Retriever'])[1 + (g % 3)],
           'Fulvo', 'Curta',
           v_kennels[1 + (g % v_n_users)], v_owners[1 + (g % v_n_users)],
           v_owners[1 + (g % v_n_users)],
           date '2010-01-01'
      from generate_series(1, v_per_layer) g
    returning id, sex
  )
  select array_agg(id) filter (where sex = 'male'),
         array_agg(id) filter (where sex = 'female')
    into v_males, v_females
    from ins;

  for v_layer in 1..v_layers loop
    with ins as (
      insert into public.dogs (name, sex, breed, color, coat, kennel_id, owner_id, created_by,
                               sire_id, dam_id, born_on)
      select 'Carga L' || v_layer || ' ' || g,
             case when g % 2 = 0 then 'male' else 'female' end,
             (array['Fila Brasileiro','Pastor Alemao','Golden Retriever'])[1 + (g % 3)],
             'Fulvo', 'Curta',
             v_kennels[1 + ((g * 7 + v_layer) % v_n_users)],
             v_owners[1 + ((g * 7 + v_layer) % v_n_users)],
             v_owners[1 + ((g * 7 + v_layer) % v_n_users)],
             v_males[1 + (g % array_length(v_males, 1))],
             v_females[1 + (g % array_length(v_females, 1))],
             date '2010-01-01' + (v_layer * 400)
        from generate_series(1, v_per_layer) g
      returning id, sex
    )
    select array_agg(id) filter (where sex = 'male'),
           array_agg(id) filter (where sex = 'female')
      into v_nm, v_nf
      from ins;

    v_males := v_nm;
    v_females := v_nf;
    raise notice 'camada % pronta', v_layer;
  end loop;

  -- -------------------------------------------------------------- publicação
  -- Os mais profundos, que são os que têm pedigree cheio de 5 gerações — é o
  -- que o fluxo público precisa encontrar.
  update public.dogs
     set published_at = now()
   where name like 'Carga L7 %'
      or name like 'Carga L6 %';

  update public.kennels
     set published_at = now()
   where slug like 'carga-canil-%'
     and split_part(slug, '-', 3)::int <= 1000;

  select count(*) into v_total from public.dogs where name like 'Carga L%';
  raise notice 'caes: %', v_total;
end $$;

-- OBRIGATÓRIO. Sem estatística fresca o planner continua achando que as tabelas
-- são pequenas, e todo EXPLAIN ou medição depois disto seria ficção.
analyze public.dogs;
analyze public.kennels;
analyze public.profiles;

-- Confirmação do volume, para o cabeçalho do relatório.
select
  (select count(*) from auth.users where email like 'carga-%@origemx-carga.com') as usuarios,
  (select count(*) from public.kennels where slug like 'carga-canil-%') as canis,
  (select count(*) from public.dogs where name like 'Carga L%') as caes,
  (select count(*) filter (where sire_id is not null) + count(*) filter (where dam_id is not null)
     from public.dogs where name like 'Carga L%') as vinculos_de_parentesco,
  (select count(*) from public.dogs where name like 'Carga L%' and published_at is not null) as caes_publicados,
  (select count(*) from public.kennels where slug like 'carga-canil-%' and published_at is not null) as canis_publicados;
