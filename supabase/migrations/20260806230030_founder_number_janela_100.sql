-- =============================================================================
-- OrigemX — selo Criador Fundador: janela passa de 1..100 para 100..199
--
-- PEDIDO DO PRODUTO: os canis cadastrados a partir de agora recebem número a
-- partir de 100. O primeiro canil já gravado mantém o número que tem — o selo é
-- imutável por trigger, e isso não muda aqui.
--
-- POR QUE NÃO BASTA UM `setval`
--
-- Três guardas apontam para o mesmo 100, e as três precisam mover juntas:
--
--   1. `maxvalue 100 no cycle` na sequence — a chamada seguinte levanta 2200H;
--   2. `check (founder_number between 1 and 100)` — recusa 101 mesmo se alguém
--      escrever fora da aplicação;
--   3. o índice único, que segue valendo e não muda.
--
-- Só o `setval(100)` daria EXATAMENTE mais um selo, o #100, e o cadastro
-- seguinte falharia com erro de sequence esgotada. Seria uma bomba-relógio de
-- um cadastro.
--
-- O QUE MUDA, E O QUE NÃO MUDA
--
-- A janela vira 100..199: continuam sendo 100 posições, então a escassez que dá
-- sentido ao selo é preservada. O que o mecanismo garante continua igual —
-- `nextval` atômico, sem leitura prévia, e o limite imposto pelo próprio objeto
-- que distribui os números. Ver o cabeçalho de 20260803034530_founder_badge.sql.
--
-- O canil que já tem o número 1 fica FORA da janela nova. É legado consciente:
-- renumerá-lo exigiria desabilitar a trigger de congelamento, que existe
-- justamente para que selo atribuído não mude. Consequência aritmética a
-- registrar: o total de selos possíveis passa a ser 101, não 100.
--
-- ⚠️ LIMITE QUE CONTINUA EXISTINDO: esgotada a janela, canil novo recebe NULL —
-- ele não ganha número nenhum. Se a intenção virar "todo canil tem um número de
-- registro", este NÃO é o campo: `founder_number` é selo escasso, não
-- identificador sequencial. Precisaria de coluna própria, sem teto.
-- =============================================================================

-- 1. O intervalo aceito pelo banco. Mantém o piso em 1 para não invalidar o
--    número já gravado.
alter table public.kennels
  drop constraint kennels_founder_number_range;

alter table public.kennels
  add constraint kennels_founder_number_range
  check (founder_number is null or (founder_number between 1 and 199));

-- 2. O teto da sequence, que é o que impõe o limite sob concorrência.
alter sequence public.kennel_founder_seq maxvalue 199;

comment on sequence public.kennel_founder_seq is
  'Numeração do selo Criador Fundador, janela 100..199. maxvalue 199 é o que impõe o limite sob concorrência.';

-- 3. O próximo número emitido.
--
--    `false` no terceiro argumento é o que faz `nextval` devolver 100, e não
--    101: com `true`, o valor passado conta como já consumido.
select setval('public.kennel_founder_seq', 100, false);

comment on column public.kennels.founder_number is
  'Selo Criador Fundador. Janela 100..199 desde 2026-08-06; o canil nº 1 é anterior a ela. Atribuído por try_assign_founder_number, imutável depois de gravado. NULL = sem selo.';
