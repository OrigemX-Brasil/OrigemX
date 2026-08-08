-- =============================================================================
-- OrigemX — cão de exemplo da home ("Veja como fica")
--
-- AO CONTRÁRIO DOS OUTROS seed-*.sql DESTA PASTA, ESTE É SCRIPT DE PRODUÇÃO,
-- não de dev. Aponta pro kennel real "O Criador" (slug o-criador, id fixo
-- abaixo) — o canil que representa o próprio OrigemX. Não roda com
-- `npm run seed:*` de propósito, pra não virar hábito de re-executar contra
-- qualquer projeto linkado sem pensar.
--
-- Cria o filhote Thor (Rottweiler, dono real — o mesmo dono do "O Criador")
-- e 15 ancestrais fantasmas (owner_id/kennel_id nulos, publicamente visíveis
-- por `dog_is_public()` sem precisar de published_at — mesma técnica que
-- `seed-pedigree-demo.sql` já usa e prova funcionar). Alcança a 4ª geração,
-- com lacunas propositais (pos. 10, 14, 25 sem ancestral informado) — árvore
-- realista, não artificialmente cheia.
--
-- Idempotente: UUID fixo em cada linha, `on conflict (id) do nothing`.
--
-- Numeração de Ahnentafel (a mesma de src/modules/pedigree/tree.ts): posição
-- par é pai, ímpar é mãe; pai/mãe de N ficam em 2N/2N+1.
-- =============================================================================

-- Passo 1 — todos os cães, sem parentesco ainda (liga depois, passo 2, pra
-- não brigar com o gatilho dogs_check_ancestry checando sexo de linha que
-- ainda não existe).
insert into public.dogs (id, name, sex, breed, born_on, kennel_id, owner_id, created_by, published_at)
values
  -- pos 1 — o filhote, cão de verdade do "O Criador"
  ('10000000-0000-4000-9000-000000000001', 'Thor', 'male', 'Rottweiler', '2025-11-02',
   '67c946ad-4303-4fdd-83b0-e21e4851fa6d', '58ce26b2-7fa1-4239-b7f0-0c223279eb74',
   '58ce26b2-7fa1-4239-b7f0-0c223279eb74', now())
on conflict (id) do nothing;

-- pos 2-25 — ancestrais fantasmas (sem kennel_id/owner_id/published_at de
-- propósito: é isso que os torna públicos por dog_is_public() sem precisar
-- publicar cada um).
insert into public.dogs (id, name, sex, breed, born_on)
values
  ('10000000-0000-4000-9000-000000000002', 'Rex von Thalheim',        'male',   'Rottweiler', '2021-03-15'),
  ('10000000-0000-4000-9000-000000000003', 'Bela do Vale Negro',      'female', 'Rottweiler', '2021-07-22'),
  ('10000000-0000-4000-9000-000000000004', 'Kaiser do Alto da Serra', 'male',   'Rottweiler', '2017-05-10'),
  ('10000000-0000-4000-9000-000000000005', 'Greta von Hoffmann',      'female', 'Rottweiler', '2018-02-18'),
  ('10000000-0000-4000-9000-000000000006', 'Duque da Pedra Negra',    'male',   'Rottweiler', '2017-09-30'),
  ('10000000-0000-4000-9000-000000000007', 'Ísis do Vale Negro',      'female', 'Rottweiler', '2018-01-25'),
  ('10000000-0000-4000-9000-000000000008', 'Ares do Alto da Serra',   'male',   'Rottweiler', '2013-06-12'),
  ('10000000-0000-4000-9000-000000000009', 'Xena von Thalheim',       'female', 'Rottweiler', '2014-04-08'),
  ('10000000-0000-4000-9000-000000000011', 'Nina von Hoffmann',       'female', 'Rottweiler', '2014-11-19'),
  ('10000000-0000-4000-9000-000000000012', 'Otto da Pedra Negra',     'male',   'Rottweiler', '2013-08-27'),
  ('10000000-0000-4000-9000-000000000013', 'Ursa do Vale Negro',      'female', 'Rottweiler', '2014-03-14'),
  ('10000000-0000-4000-9000-000000000015', 'Frida do Vale Negro',     'female', 'Rottweiler', '2014-09-05'),
  ('10000000-0000-4000-9000-000000000018', 'Blitz von Thalheim',      'male',   'Rottweiler', '2010-02-20'),
  ('10000000-0000-4000-9000-000000000019', 'Hela von Thalheim',       'female', 'Rottweiler', '2010-06-16'),
  ('10000000-0000-4000-9000-000000000024', 'Conde da Pedra Negra',    'male',   'Rottweiler', '2009-10-08')
on conflict (id) do nothing;

-- Passo 2 — parentesco. pos. 10, 14 e 25 ficam de fora de propósito (lacuna
-- realista); pos. 25 sem informar ao lado de pos. 24 informado demonstra a
-- lacuna assimétrica que a árvore já sabe desenhar.
update public.dogs set sire_id = v.sire_id::uuid, dam_id = v.dam_id::uuid
from (values
  ('10000000-0000-4000-9000-000000000001'::uuid, '10000000-0000-4000-9000-000000000002'::uuid, '10000000-0000-4000-9000-000000000003'::uuid),
  ('10000000-0000-4000-9000-000000000002'::uuid, '10000000-0000-4000-9000-000000000004'::uuid, '10000000-0000-4000-9000-000000000005'::uuid),
  ('10000000-0000-4000-9000-000000000003'::uuid, '10000000-0000-4000-9000-000000000006'::uuid, '10000000-0000-4000-9000-000000000007'::uuid),
  ('10000000-0000-4000-9000-000000000004'::uuid, '10000000-0000-4000-9000-000000000008'::uuid, '10000000-0000-4000-9000-000000000009'::uuid),
  ('10000000-0000-4000-9000-000000000005'::uuid, null,                                          '10000000-0000-4000-9000-000000000011'::uuid),
  ('10000000-0000-4000-9000-000000000006'::uuid, '10000000-0000-4000-9000-000000000012'::uuid, '10000000-0000-4000-9000-000000000013'::uuid),
  ('10000000-0000-4000-9000-000000000007'::uuid, null,                                          '10000000-0000-4000-9000-000000000015'::uuid),
  ('10000000-0000-4000-9000-000000000009'::uuid, '10000000-0000-4000-9000-000000000018'::uuid, '10000000-0000-4000-9000-000000000019'::uuid),
  ('10000000-0000-4000-9000-000000000012'::uuid, '10000000-0000-4000-9000-000000000024'::uuid, null)
) as v(id, sire_id, dam_id)
where public.dogs.id = v.id;

-- Conferência: o public_id do filhote é o que vai no card/QR da home.
select public_id, name, sire_id, dam_id from public.dogs
where id = '10000000-0000-4000-9000-000000000001';

-- Limpeza, se algum dia este exemplo for descontinuado:
-- update public.dogs set deleted_at = now()
-- where id::text like '10000000-0000-4000-9000-0000000000%';
