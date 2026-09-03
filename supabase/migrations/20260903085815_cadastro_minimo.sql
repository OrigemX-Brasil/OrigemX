-- =============================================================================
-- OrigemX — cadastro mínimo: as colunas que faltavam, e a marca de publicação
--            automática
--
-- O PEDIDO (aditivo de fluxo, 03/09/2026): o criador preenche um conjunto
-- MÍNIMO, ouve "cadastro concluído" e o perfil já vai ao ar. A porcentagem de
-- completude vira incentivo, nunca pendência.
--
-- O QUE ESTA MIGRATION FAZ: só abre espaço. Nenhuma coluna aqui é NOT NULL, e
-- nenhuma trava escrita — a decisão de produto é que o mínimo NÃO bloqueia o
-- salvar, então o banco não é o lugar de exigi-lo. Quem sabe o que é "mínimo" é
-- `fields.ts` de cada módulo, e quem conta é `completeness.ts`.
--
-- POR QUE NENHUM NOT NULL, dito de outro jeito: exigir no schema tornaria
-- impossível gravar o registro pela metade — e gravar pela metade é exatamente
-- o comportamento pedido. Além disso a FOTO nunca poderia ser obrigatória no
-- INSERT: `buildStoragePath` precisa do id da entidade, então o registro tem de
-- existir ANTES de qualquer upload.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Canil: raças criadas
--
-- `text[]`, e não texto livre, pelo mesmo motivo de `dogs.titles`: "raças
-- criadas" é lista por natureza, e um campo único viraria "pastor alemão,
-- golden" — impossível de filtrar depois sem reprocessar string.
--
-- Sem CHECK de conteúdo elemento a elemento: `titles` também não tem, e
-- normalizar array em CHECK exige `unnest` num predicado, que o Postgres não
-- aceita. Quem apara e descarta vazio é `normalizeKennelInput`, no mesmo lugar
-- que já faz isso para os demais campos.
-- -----------------------------------------------------------------------------

alter table public.kennels add column breeds text[];

comment on column public.kennels.breeds is
  'Raças que o canil cria. Entra no conjunto mínimo do cadastro (ver modules/kennels/fields.ts). Lista, não texto: é o que permite filtrar por raça depois.';


-- -----------------------------------------------------------------------------
-- 2. Ninhada: identificação, raça e status
--
-- `name` é NOVO e não substitui `description`: a ninhada precisa de um rótulo
-- curto para aparecer em lista ("Ninhada Aurora × Thor"), e `description` é
-- texto de 500 caracteres que ninguém quer ver numa linha de tabela.
--
-- `breed` é da NINHADA, e não derivada dos pais de propósito: um cruzamento
-- pode ter pai e mãe ainda não cadastrados (o report é explícito em que isso não
-- pode bloquear), e mesmo com os dois presentes a raça da ninhada é o que o
-- criador anuncia — não uma inferência nossa.
--
-- `status` NÃO REUSA `dogs.litter_status`, e a diferença é real: aquele é do
-- FILHOTE e usa `sold`, porque um animal é vendido. Aqui "encerrada" é sobre a
-- ninhada inteira, que pode encerrar sem todos os filhotes terem saído.
-- -----------------------------------------------------------------------------

alter table public.kennel_litters
  add column name   text,
  add column breed  text,
  add column status text;

alter table public.kennel_litters
  add constraint kennel_litters_name_len check (
    name is null
    or (char_length(btrim(name)) > 0 and char_length(name) <= 120)
  ),
  add constraint kennel_litters_breed_len check (
    breed is null
    or (char_length(btrim(breed)) > 0 and char_length(breed) <= 80)
  ),
  -- Lista FECHADA, no molde de `dogs_litter_status_valid`: status novo nasce
  -- na mesma migration que a tela que o mostra, senão a interface passa a
  -- exibir um valor que ninguém traduziu.
  add constraint kennel_litters_status_valid check (
    status is null or status in ('available', 'reserved', 'closed')
  );

comment on column public.kennel_litters.name is
  'Identificação curta da ninhada, para listas. NÃO substitui `description`, que é o texto longo.';
comment on column public.kennel_litters.breed is
  'Raça anunciada da ninhada. Independente dos progenitores de propósito: eles podem não estar cadastrados, e mesmo cadastrados quem anuncia é o criador.';
comment on column public.kennel_litters.status is
  'available | reserved | closed. Da NINHADA — distinto de dogs.litter_status, que é do filhote e usa `sold`.';


-- -----------------------------------------------------------------------------
-- 3. A marca de publicação automática
--
-- Concluir o mínimo passa a colocar o registro no ar sozinho. Esta coluna é o
-- que impede isso de acontecer DUAS vezes.
--
-- O CASO QUE ELA RESOLVE, e que não tem outra solução: o criador conclui o
-- cadastro, o perfil vai ao ar, e ele decide TIRAR do ar. Depois edita a cidade.
-- Sem esta marca, "o mínimo está completo e `published_at` é nulo" é
-- indistinguível de "nunca foi publicado" — e a automação o arrastaria de volta
-- ao ar, desfazendo uma decisão explícita dele. Com ela, publicar sozinho
-- acontece no máximo uma vez por registro.
--
-- Guardar QUANDO, e não um booleano: a data responde "isto foi ao ar sozinho, e
-- em que momento" sem precisar cruzar com `audit_log` — e é a pergunta que
-- aparece quando um criador diz que não publicou nada.
--
-- NÃO é redundante com `published_at`: aquele é o ESTADO atual (e volta a nulo
-- ao despublicar); este é um fato do passado, e nunca é limpo.
-- -----------------------------------------------------------------------------

alter table public.kennels         add column auto_published_at timestamptz;
alter table public.dogs            add column auto_published_at timestamptz;
alter table public.kennel_litters  add column auto_published_at timestamptz;

comment on column public.kennels.auto_published_at is
  'Quando o registro foi ao ar SOZINHO, por ter fechado o cadastro mínimo. Nunca é limpo: é o que impede a automação de republicar por cima de quem despublicou de propósito.';
comment on column public.dogs.auto_published_at is
  'Ver kennels.auto_published_at.';
comment on column public.kennel_litters.auto_published_at is
  'Ver kennels.auto_published_at.';
