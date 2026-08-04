-- =============================================================================
-- OrigemX — carga sintética para auditoria de performance
--
--     npm run seed:load        (semeia)
--     npm run seed:load-clean  (remove)
--
-- APENAS PARA O PROJETO DE DESENVOLVIMENTO. Não é migration e não vai para o
-- banco do cliente.
--
-- POR QUE ISTO EXISTE: com 59 cães, todo plano de consulta é um seq scan — e
-- está CERTO, porque varrer 59 linhas é mais barato que abrir um índice.
-- Qualquer conclusão sobre carga tirada daquele tamanho seria chute. Aqui a
-- tabela passa do ponto onde o planner troca de estratégia, e aí o EXPLAIN
-- passa a dizer alguma coisa.
--
-- POR CAMADAS, e não com pais sorteados no monte todo: a camada 0 não tem pais,
-- e cada camada seguinte só aponta para a anterior. Ciclo fica IMPOSSÍVEL por
-- construção, em vez de improvável — o trigger `dogs_check_ancestry` recusaria
-- e a semeadura morreria no meio.
--
-- O sexo decide de qual lado o pai e a mãe são sorteados, porque o mesmo trigger
-- valida que `sire_id` é macho e `dam_id` é fêmea.
--
-- É LENTO DE PROPÓSITO. Cada linha passa pelo trigger de ancestralidade, que
-- percorre a árvore acima dela. É exatamente o caminho que o produto usa para
-- cadastrar um cão — um COPY seria mais rápido e não provaria nada sobre o
-- custo real de inserção.
-- =============================================================================

do $$
declare
  v_kennel     uuid := '00000000-0000-4000-9000-000000000001';
  v_owner      uuid := '89a4a675-371a-4314-895f-adb96f5d5a78';
  v_per_layer  int  := 5000;
  v_layers     int  := 8;
  v_layer      int;
  v_males      uuid[];
  v_females    uuid[];
  v_nm         uuid[];
  v_nf         uuid[];
  v_total      int;
begin
  insert into public.kennels (id, name, slug, owner_id, created_by, city, state, description)
  values (v_kennel, 'CARGA - remover', 'carga-remover', v_owner, v_owner,
          'Sao Paulo', 'SP', 'Canil sintetico de auditoria de performance.')
  on conflict (id) do nothing;

  -- Camada 0: raiz da floresta, sem pais.
  with ins as (
    insert into public.dogs (name, sex, breed, color, coat, kennel_id, owner_id, created_by)
    select 'Carga L0 ' || g,
           case when g % 2 = 0 then 'male' else 'female' end,
           'Fila Brasileiro', 'Fulvo', 'Curta',
           v_kennel, v_owner, v_owner
      from generate_series(1, v_per_layer) g
    returning id, sex
  )
  select array_agg(id) filter (where sex = 'male'),
         array_agg(id) filter (where sex = 'female')
    into v_males, v_females
    from ins;

  raise notice 'camada 0: % machos, % femeas', array_length(v_males,1), array_length(v_females,1);

  for v_layer in 1..v_layers loop
    with ins as (
      insert into public.dogs (name, sex, breed, color, coat, kennel_id, owner_id, created_by,
                               sire_id, dam_id, born_on)
      select 'Carga L' || v_layer || ' ' || g,
             case when g % 2 = 0 then 'male' else 'female' end,
             'Fila Brasileiro', 'Fulvo', 'Curta',
             v_kennel, v_owner, v_owner,
             v_males[1 + (g % array_length(v_males, 1))],
             v_females[1 + (g % array_length(v_females, 1))],
             date '2015-01-01' + (v_layer * 365)
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

  -- Subconjunto publicado, para medir o perfil público do canil com dado real.
  -- Mais que os 48 do limite atual, senão a paginação nova não teria o que
  -- mostrar.
  update public.dogs
     set published_at = now()
   where kennel_id = v_kennel
     and name like 'Carga L8 %'
     -- Terceiro campo do nome é o número da linha. Extrair dígito por regex
     -- pegaria também o 8 de "L8" e o filtro sairia errado.
     and split_part(name, ' ', 3)::int <= 800;

  update public.kennels set published_at = now() where id = v_kennel;

  select count(*) into v_total from public.dogs where kennel_id = v_kennel;
  raise notice 'total semeado: % caes', v_total;
end $$;

-- OBRIGATÓRIO. Sem estatística fresca o planner continua achando que `dogs` tem
-- 59 linhas, e todo EXPLAIN depois disto seria ficção.
analyze public.dogs;
analyze public.kennels;

select count(*) as caes_de_carga,
       count(*) filter (where published_at is not null) as publicados
  from public.dogs
 where kennel_id = '00000000-0000-4000-9000-000000000001';
