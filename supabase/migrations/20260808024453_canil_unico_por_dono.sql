-- =============================================================================
-- OrigemX — UM canil vivo por criador
--
-- Reversão de invariante, decidida pelo dono do produto. Até aqui o schema
-- dizia o contrário, e em letra: o comentário da tabela afirmava "um criador
-- pode ter mais de um".
--
-- =============================================================================
-- POR QUE UM ÍNDICE, E NÃO UMA POLICY
-- =============================================================================
--
-- A alternativa óbvia seria apertar `kennels_insert_own` com
--
--     not exists (select 1 from kennels where owner_id = auth.uid()
--                                         and deleted_at is null)
--
-- e ela é PIOR QUE NADA, por três motivos:
--
--   1. NÃO GARANTE. `WITH CHECK` é avaliado no snapshot do statement. Em READ
--      COMMITTED duas inserções simultâneas leem zero linhas, as duas passam,
--      e o dono termina com dois canis. É o mesmo defeito que a migration do
--      selo Fundador documenta e recusa: ler e depois escrever. Só o índice
--      único serializa de verdade, porque o conflito é detectado na gravação
--      da entrada de índice.
--
--   2. MENTE SOBRE O MOTIVO. Policy negada sai como 42501 ("sem permissão"),
--      e o criador leria isso quando a verdade é "você já tem um canil". O
--      índice sai como 23505 COM O NOME, que a aplicação traduz — ver
--      src/modules/kennels/errors.ts.
--
--   3. NÃO COBRE O UPDATE. `deleted_at` está na lista de `grant update` por
--      coluna (migration do selo Fundador), então nada impede
--      `update kennels set deleted_at = null` num canil excluído enquanto
--      outro está vivo. Uma policy de INSERT não enxerga esse caminho. O
--      índice enxerga. Este é o argumento decisivo.
--
-- =============================================================================
-- POR QUE NÃO HÁ BACKFILL
-- =============================================================================
--
-- Se algum dono tiver 2+ canis vivos, o `create unique index` abaixo FALHA e o
-- `db push` para, citando o par duplicado. É o comportamento desejado:
-- resolver duplicata é ESCOLHER QUAL CANIL MORRE, e essa escolha não pode ser
-- feita em silêncio por uma migration. A limpeza é passo manual e visível.
--
-- Para o resíduo de fixture do test:rls existe `npm run db:limpar-rls`.
-- =============================================================================

-- Parcial por `deleted_at` de propósito: excluir logicamente LIBERA A VAGA.
-- Note a assimetria com o slug, que é deliberada:
--
--   * o SLUG identifica uma URL já divulgada — `kennels_slug_key` é global, e
--     não parcial, para que um QR impresso nunca passe a resolver para outro
--     canil. Endereço queimado é endereço queimado.
--   * a POSSE identifica uma relação VIVA. Quando a relação acaba, a vaga
--     volta. Um criador que fechou o canil pode abrir outro — com outro
--     endereço.
create unique index kennels_owner_uk
  on public.kennels (owner_id)
  where deleted_at is null;

comment on index public.kennels_owner_uk is
  'Um canil VIVO por dono. Parcial por deleted_at: excluir logicamente libera a vaga, mas NÃO libera o slug (kennels_slug_key é global, de propósito). Cobre também o UPDATE que zeraria deleted_at tendo outro canil vivo — caminho que nenhuma policy de INSERT enxergaria. O nome deste índice é string literal em src/modules/kennels/errors.ts, em scripts/test-rls.mts e em supabase/tests/battery.sql.';

-- Redundante a partir daqui: mesma coluna, mesmo predicado. Um btree único
-- serve toda leitura que o não-único servia, e o não-único ainda cobrava
-- manutenção a cada gravação de canil.
--
-- Vem DEPOIS da criação de propósito: se o índice novo falhar por duplicata,
-- o antigo continua de pé.
drop index if exists public.kennels_owner_id_idx;

comment on table public.kennels is
  'Canil. Um criador tem no máximo UM canil vivo — garantido por kennels_owner_uk. Excluir logicamente libera a vaga; o endereço público continua queimado para sempre.';
