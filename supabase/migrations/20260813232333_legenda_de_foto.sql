-- =============================================================================
-- Legenda por foto
--
-- Distinta de `alt`: `alt` descreve a imagem para quem não a vê (acessibi-
-- lidade); `caption` é o que o dono quer DIZER sobre a foto ("Campeão
-- Brasileiro 2024"), visível a quem enxerga. `alt` já existe desde a tabela
-- nascer e está sempre nula — nenhuma tela grava nela hoje — então continua
-- livre para o seu propósito real, sem ser reaproveitada aqui.
--
-- Sem policy nova, sem grant novo: `media` já concede
-- `grant insert, update on public.media to authenticated` em nível de
-- TABELA (cobre colunas futuras), e `media_update` já restringe a LINHA ao
-- dono (ou admin), não-suspenso. Legenda é dado comum do dono, não
-- escotilha administrativa — não é o caso de `kennels.founder_number`.
-- =============================================================================

alter table public.media add column caption text;

-- Legenda em branco não existe: ou tem texto, ou é NULL. Impede string
-- vazia/só-espaço de entrar por fora da aplicação e virar uma faixa vazia
-- na página pública. 140 espelha `MAX_CAPTION_LENGTH` em constraints.ts.
--
-- As duas metades do CHECK medem coisas diferentes de propósito:
-- `char_length(btrim(caption)) > 0` barra vazio/só-espaço; `char_length
-- (caption) <= 140` mede a string CRUA, não a aparada — senão um texto de
-- 140 caracteres cercado por milhares de espaços passaria (btrim reduziria
-- para 140 na leitura), inchando a linha sem limite real.
alter table public.media
  add constraint media_caption_len
  check (caption is null or (char_length(btrim(caption)) > 0 and char_length(caption) <= 140));

comment on column public.media.caption is
  'Legenda visível da foto, escrita pelo dono. Distinta de `alt`: alt descreve a imagem para quem não a vê; caption é o que se quer dizer sobre ela.';
