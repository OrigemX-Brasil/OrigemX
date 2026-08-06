-- =============================================================================
-- OrigemX — o número do canil deixa de ter teto
--
-- PEDIDO DO PRODUTO: todo canil novo recebe número a partir de 100, e não há
-- limite de quantos canis podem ser publicados.
--
-- O QUE JÁ ERA VERDADE, E FICA REGISTRADO
--
-- Publicar canil NUNCA teve limite. `try_assign_founder_number` captura o
-- 2200H do esgotamento e devolve NULL em vez de propagar — de propósito, para
-- que o INSERT do cão ou do logo que disparou o trigger não abortasse. O teto
-- limitava só quem GANHAVA número; o canil se cadastrava e publicava igual.
--
-- O QUE MUDA AQUI
--
-- Some o teto. A sequence vai até o limite do integer e o CHECK perde a borda
-- superior, então canil elegível recebe número enquanto houver canil — 100,
-- 101, 102, sem fim prático.
--
-- O QUE ISSO CUSTA, DITO SEM RODEIO
--
-- O selo "Criador Fundador" era escasso por construção: 100 posições, e o
-- objeto que distribuía os números era o mesmo que se recusava a distribuir o
-- 101º. Sem teto, `founder_number` deixa de ser selo e vira NÚMERO DE REGISTRO
-- sequencial. Quem tiver o 137 não é fundador de nada — é o 38º canil a se
-- tornar elegível depois da mudança de janela.
--
-- A escassez não dá para recuperar depois: números emitidos são imutáveis por
-- trigger. Se o selo voltar a ser produto, precisará de coluna própria, e os
-- fundadores terão de ser escolhidos por outro critério que não "chegou primeiro".
--
-- O QUE **NÃO** MUDA, E AINDA IMPEDE "TODO CANIL TEM NÚMERO"
--
-- `kennel_is_founder_eligible` continua exigindo nome, cidade, estado, LOGO e ao
-- menos UM CÃO. Canil sem logo ou sem cão continua com `founder_number` nulo —
-- não por limite, mas por não estar completo. Mexer nisso é outra decisão, e
-- não está neste pedido.
-- =============================================================================

-- 1. O CHECK perde a borda superior. O piso continua 1 por causa do canil que
--    recebeu o nº 1 antes da mudança de janela.
alter table public.kennels
  drop constraint kennels_founder_number_range;

alter table public.kennels
  add constraint kennels_founder_number_range
  check (founder_number is null or founder_number >= 1);

-- 2. O teto da sequence. `no maxvalue` num `as integer` vale 2147483647 — não é
--    infinito, mas está muitas ordens de grandeza além de qualquer volume que
--    este produto vá ver.
alter sequence public.kennel_founder_seq no maxvalue;

comment on sequence public.kennel_founder_seq is
  'Numeração sequencial do canil. Emissão começa em 100; sem teto desde 2026-08-06 — deixou de impor escassez.';

comment on column public.kennels.founder_number is
  'Número de registro do canil, sequencial e imutável. Emissão a partir de 100; o canil nº 1 é anterior. NULL = canil ainda não elegível (falta nome, cidade, estado, logo ou cão) — não é limite.';
