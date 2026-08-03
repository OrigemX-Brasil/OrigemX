-- =============================================================================
-- OrigemX — linhagem de demonstração para conferir o pedigree na tela
--
--     npm run seed:pedigree
--
-- APENAS PARA O PROJETO DE DESENVOLVIMENTO. Não é migration e não vai para o
-- banco do cliente.
--
-- Todos os cães criados aqui são ANCESTRAIS FANTASMA: `owner_id` e `kennel_id`
-- nulos. Isso os torna publicamente legíveis por `dog_is_public` sem publicar
-- nada, sem pertencer a ninguém e sem encostar em uma única linha dos dados de
-- teste que já existem no banco.
--
-- A exceção é proposital: Curupira recebe um canil, o que o torna RASCUNHO DE
-- TERCEIRO. É o caso que a tela precisa mostrar — nome visível, sem link e sem
-- os demais campos.
--
-- IDEMPOTENTE: uuids fixos, `on conflict do nothing`, e os vínculos aplicados
-- num segundo passo, para a ordem de inserção não importar.
--
-- A ÁRVORE (posições de Ahnentafel entre colchetes):
--
--   Xavante [1]
--   ├─ Tupã [2]
--   │  ├─ Guará Velho [4]   ← também em [12]
--   │  │  ├─ Sertão [8]     ← também em [24]
--   │  │  │  ├─ Marajó [16] ← também em [48]
--   │  │  │  │  └─ Anhangá [32]   (a mãe de Marajó é desconhecida)
--   │  │  │  └─ Tapajós [17] ← também em [49]
--   │  │  └─ (mãe desconhecida) [9]
--   │  └─ Jandaia [5]
--   │     ├─ Curupira [10]  ← rascunho de terceiro: nome sem link
--   │     └─ (mãe desconhecida) [11]
--   └─ Aurora [3]
--      ├─ Ipê Amarelo [6]
--      │  ├─ Guará Velho [12]  ← linebreeding: o mesmo cão de [4]
--      │  └─ (mãe desconhecida) [13]
--      └─ Caatinga [7]         (folha: nenhum dos pais cadastrado)
--
-- Cobre de uma vez os quatro casos exigidos: profundidade cheia de 5 gerações
-- pelo galho do Marajó, lacuna assimétrica em [9], [11], [13] e [25], galho
-- curto no [7], e quatro ancestrais repetidos — Guará, Sertão, Marajó e
-- Tapajós, porque duplicar um nó duplica tudo que está acima dele.
--
-- LIMPEZA (exclusão lógica, como manda a invariante):
--   update public.dogs set deleted_at = now()
--    where id::text like '00000000-0000-4000-8000-0000000000%';
-- =============================================================================

begin;

-- Passo 1: os cães, ainda sem vínculo de parentesco.
insert into public.dogs (id, name, sex, breed, born_on, color)
values
  ('00000000-0000-4000-8000-000000000001', 'Xavante do Origem',  'male',   'Fila Brasileiro', '2022-03-14', 'Fulvo'),
  ('00000000-0000-4000-8000-000000000002', 'Tupã do Origem',     'male',   'Fila Brasileiro', '2019-07-02', 'Fulvo'),
  ('00000000-0000-4000-8000-000000000003', 'Aurora do Origem',   'female', 'Fila Brasileiro', '2019-11-25', 'Tigrado'),
  ('00000000-0000-4000-8000-000000000004', 'Guará Velho',        'male',   'Fila Brasileiro', '2016-01-09', 'Fulvo'),
  ('00000000-0000-4000-8000-000000000005', 'Jandaia da Serra',   'female', 'Fila Brasileiro', '2016-05-30', 'Preto'),
  ('00000000-0000-4000-8000-000000000006', 'Ipê Amarelo',        'male',   'Fila Brasileiro', '2016-08-17', 'Fulvo'),
  ('00000000-0000-4000-8000-000000000007', 'Caatinga do Norte',  'female', 'Fila Brasileiro', '2016-02-04', 'Tigrado'),
  ('00000000-0000-4000-8000-000000000008', 'Sertão de Minas',    'male',   'Fila Brasileiro', '2013-04-21', 'Fulvo'),
  ('00000000-0000-4000-8000-000000000010', 'Curupira do Vale',   'male',   'Fila Brasileiro', '2013-09-12', 'Preto'),
  ('00000000-0000-4000-8000-000000000016', 'Marajó do Pará',     'male',   'Fila Brasileiro', '2010-06-08', 'Fulvo'),
  ('00000000-0000-4000-8000-000000000017', 'Tapajós Real',       'female', 'Fila Brasileiro', '2010-10-19', 'Tigrado'),
  ('00000000-0000-4000-8000-000000000032', 'Anhangá Primeiro',   'male',   'Fila Brasileiro', '2007-03-03', 'Fulvo')
on conflict (id) do nothing;

-- Passo 2: o parentesco. Separado da inserção para não depender da ordem, e
-- porque o trigger `dogs_check_ancestry` valida sexo e ciclo aqui.
update public.dogs set
  sire_id = '00000000-0000-4000-8000-000000000002',
  dam_id  = '00000000-0000-4000-8000-000000000003'
 where id = '00000000-0000-4000-8000-000000000001';

update public.dogs set
  sire_id = '00000000-0000-4000-8000-000000000004',
  dam_id  = '00000000-0000-4000-8000-000000000005'
 where id = '00000000-0000-4000-8000-000000000002';

update public.dogs set
  sire_id = '00000000-0000-4000-8000-000000000006',
  dam_id  = '00000000-0000-4000-8000-000000000007'
 where id = '00000000-0000-4000-8000-000000000003';

-- Mãe desconhecida de propósito: é a lacuna assimétrica.
update public.dogs set
  sire_id = '00000000-0000-4000-8000-000000000008'
 where id = '00000000-0000-4000-8000-000000000004';

update public.dogs set
  sire_id = '00000000-0000-4000-8000-000000000010'
 where id = '00000000-0000-4000-8000-000000000005';

-- Linebreeding: o mesmo Guará Velho que já é avô paterno.
update public.dogs set
  sire_id = '00000000-0000-4000-8000-000000000004'
 where id = '00000000-0000-4000-8000-000000000006';

update public.dogs set
  sire_id = '00000000-0000-4000-8000-000000000016',
  dam_id  = '00000000-0000-4000-8000-000000000017'
 where id = '00000000-0000-4000-8000-000000000008';

update public.dogs set
  sire_id = '00000000-0000-4000-8000-000000000032'
 where id = '00000000-0000-4000-8000-000000000016';

-- Passo 3: Curupira vira rascunho de terceiro. Um canil qualquer serve — o que
-- importa é ele deixar de ser fantasma, e portanto deixar de ser público.
update public.dogs set
  kennel_id = (select id from public.kennels where deleted_at is null order by created_at limit 1)
 where id = '00000000-0000-4000-8000-000000000010'
   and exists (select 1 from public.kennels where deleted_at is null);

commit;

-- Confirmação: a árvore como o site vai lê-la.
select pos, generation, name, is_public, public_id is not null as tem_link
  from public.dog_pedigree('00000000-0000-4000-8000-000000000001', 5)
 order by pos;
