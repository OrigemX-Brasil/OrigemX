-- =============================================================================
-- OrigemX — fecha dog_descendant_ids para anônimo
--
-- Erro meu na migration anterior: concedi EXECUTE a `authenticated` e parei aí.
-- Toda função criada em `public` já nasce com EXECUTE para PUBLIC, e `anon`
-- herda de PUBLIC — o GRANT explícito não substitui o implícito, soma-se a ele.
--
-- O efeito prático era um vazamento pequeno mas real: um visitante anônimo
-- podia chamar /rest/v1/rpc/dog_descendant_ids e enumerar os ids de
-- descendentes de QUALQUER cão, inclusive de rascunhos que a RLS esconde. Não
-- devolve nome nem nenhuma coluna, mas revela a forma da árvore e a existência
-- de registros não publicados.
--
-- `authenticated` mantém o acesso: é quem usa o seletor de pai e mãe. A função
-- continua SECURITY DEFINER de propósito, para enxergar descendente que a RLS
-- do usuário esconderia — um descendente invisível seria oferecido como
-- progenitor, e o ciclo só apareceria no erro do banco.
--
-- Migration corretiva em vez de edição da anterior: aquela já está aplicada, e
-- reescrever histórico aplicado faz o checksum divergir entre ambientes.
-- =============================================================================

revoke execute on function public.dog_descendant_ids(uuid) from public, anon;

-- Reafirma o acesso de quem precisa. O revoke de PUBLIC acima não atinge um
-- grant nominal, mas deixar explícito evita que a próxima leitura deste arquivo
-- conclua que ninguém pode chamar a função.
grant execute on function public.dog_descendant_ids(uuid) to authenticated;
