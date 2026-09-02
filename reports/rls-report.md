# OrigemX — Evidência de RLS

| | |
|---|---|
| Data | 2026-09-02T01:02:40.765Z |
| Projeto | `https://lcqhnfdsrioufwvnrqnt.supabase.co` |
| Execução | `mtje4ywy` |
| Resultado | **APROVADO** — 186/186 PASS |


## Método

Usuários reais e um cliente anônimo, falando com a API REST do Supabase pela
chave publishable — a mesma porta que um atacante usaria. Nada passa pela
interface. A chave secreta é usada apenas para criar e destruir as fixtures,
nunca para provar acesso.

São vários atores porque a invariante exige: um criador tem no máximo **um
canil vivo** (`kennels_owner_uk`), então cada canil que o roteiro precisa
manter ao mesmo tempo tem dono próprio. A corrida do selo Fundador, em
particular, roda com um usuário por canil — contenção entre sessões
distintas, que é o modelo real de produção.

## Escopo do isolamento

O OrigemX é um **diretório público** de canis. Canil e cão marcados como
publicados são legíveis por qualquer pessoa — isso é o produto, não uma
falha. O que a RLS isola é:

- registro em **rascunho** (`published_at` nulo) — só quem gerencia vê;
- **dado sensível** (`dog_identifiers`: microchip e registro) — nunca público;
- **escrita** — ninguém altera registro alheio;
- **arquivo no Storage** — cada usuário só acessa o próprio prefixo.

## Resultado por cenário

| Cenário | Verificação | Esperado | Obtido | |
|---|---|---|---|---|
| 1. Criação | A cria o próprio canil | 1 linha | 1 linha | **PASS** |
| 1. Criação | B cria o próprio canil | 1 linha | 1 linha | **PASS** |
| 1. Criação | A cria cão PUBLICADO no próprio canil | 1 linha | 1 linha | **PASS** |
| 1. Criação | A cria cão RASCUNHO no próprio canil | 1 linha | 1 linha | **PASS** |
| 1. Criação | B cria o próprio cão | 1 linha | 1 linha | **PASS** |
| 1. Criação | A registra microchip do próprio cão | sucesso | sucesso | **PASS** |
| 2. Leitura de B sobre A | B lê o cão RASCUNHO de A | 0 linhas | 0 linha(s) | **PASS** |
| 2. Leitura de B sobre A | B lê o microchip do cão de A (dado sensível) | 0 linhas | 0 linha(s) | **PASS** |
| 2. Leitura de B sobre A | B varre TODOS os rascunhos da base procurando os de A | nenhum rascunho de A | 0 rascunho(s) de A em 12 visíveis | **PASS** |
| 2. Leitura de B sobre A | B lê o cão PUBLICADO de A (comportamento esperado: diretório é público) | 1 linha | 1 linha(s) | **PASS** |
| 3. Escrita de B sobre A | B faz UPDATE no canil de A | 0 linhas afetadas | 0 linha(s) | **PASS** |
| 3. Escrita de B sobre A | B faz UPDATE no cão publicado de A | 0 linhas afetadas | 0 linha(s) | **PASS** |
| 3. Escrita de B sobre A | B move o cão de A para o próprio canil | 0 linhas afetadas | 0 linha(s) | **PASS** |
| 3. Escrita de B sobre A | B faz DELETE no cão de A | erro de permissão (exclusão é lógica) | erro 42501: permission denied for table dogs | **PASS** |
| 3. Escrita de B sobre A | B faz DELETE no PRÓPRIO cão (DELETE físico é negado a todos) | erro de permissão | erro 42501: permission denied for table dogs | **PASS** |
| 4. Anônimo | anônimo lê cão publicado | 1 linha | 1 linha(s) | **PASS** |
| 4. Anônimo | anônimo lê cão em rascunho | 0 linhas | 0 linha(s) | **PASS** |
| 4. Anônimo | anônimo lê dog_identifiers (microchip) | 0 linhas ou erro de permissão | erro 42501: permission denied for table dog_identifiers | **PASS** |
| 4. Anônimo | anônimo tenta INSERT em dogs | erro de permissão | erro 42501: permission denied for table dogs | **PASS** |
| 5. Storage | B grava no PRÓPRIO prefixo (controle: precisa funcionar) | sucesso | sucesso | **PASS** |
| 5. Storage | B grava no prefixo de A | erro de permissão | erro: new row violates row-level security policy | **PASS** |
| 5. Storage | B lista o prefixo de A | vazio ou erro | 0 objeto(s) | **PASS** |
| 5. Storage | B baixa arquivo de A | erro de permissão | erro: Object not found | **PASS** |
| 5. Storage | anônimo baixa arquivo de A | erro de permissão | erro: Object not found | **PASS** |
| 6. Admin | usuário comum se promove a admin | erro de permissão de coluna | erro 42501: permission denied for table profiles | **PASS** |
| 6. Admin | usuário comum edita o perfil de outro | 0 linhas afetadas | 0 linha(s) | **PASS** |
| 6. Admin | usuário comum chama private.is_admin() via RPC | erro — schema private não é exposto | erro: Could not find the function public.is_admin without parameters in the schema cache | **PASS** |
| 6. Admin | usuário comum chama função de trigger via RPC | erro — EXECUTE revogado | erro: Could not find the function public.dogs_check_ancestry without parameters in the schema cache | **PASS** |
| 6. Admin | papel de B no banco após as tentativas | user | user | **PASS** |
| 7. Criação de conta | conta criada com user_metadata.role = 'admin' | profile nasce com role = 'user' | role = user | **PASS** |
| 7. Criação de conta | conta em formato OAuth (name/picture) gera profile preenchido | full_name e avatar_url preenchidos | full_name = Fulano do Google, avatar_url = preenchido | **PASS** |
| 7. Criação de conta | conta em formato OAuth nasce como usuário comum | role = 'user' | role = user | **PASS** |
| 8. CRUD de canil | A atualiza TODOS os campos editáveis de uma vez (payload real de updateKennel) | 1 linha — nenhuma coluna sem GRANT | 1 linha(s) | **PASS** |
| 8. CRUD de canil | A exclui o próprio canil (lógico) | 1 linha marcada | 1 linha(s) | **PASS** |
| 8. CRUD de canil | linha continua na tabela — exclusão é lógica, nunca física | linha existe com deleted_at preenchido | existe, deleted_at preenchido | **PASS** |
| 8. CRUD de canil | anônimo lê canil excluído logicamente | 0 linhas | 0 linha(s) | **PASS** |
| 8. CRUD de canil | C (sem canil) tenta reusar o endereço de um canil excluído de A | erro em kennels_slug_key — slug fica reservado para sempre | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | **PASS** |
| 9. Genealogia | A cadastra ancestral fantasma (sem dono e sem canil) | criado | criado | **PASS** |
| 9. Genealogia | anônimo lê o fantasma — é nó de árvore, não precisa estar publicado | 1 linha | 1 linha(s) | **PASS** |
| 9. Genealogia | dog_descendant_ids devolve o descendente | inclui o filho | inclui | **PASS** |
| 9. Genealogia | ciclo pela API vira mensagem legível, não 500 | erro traduzido, sem jargão de banco | [23514] -> "Esse cão já aparece como descendente na árvore. Defini-lo como pai ou mãe faria com que ele fosse ancestral de si mesmo, o que o registro não permite." | **PASS** |
| 9. Genealogia | macho na posição de mãe vira mensagem no campo certo | campo dam_id, texto sobre fêmea | dam_id: "A mãe precisa ser uma fêmea." | **PASS** |
| 10. Mídia | A registra metadata do próprio logo | criado | criado | **PASS** |
| 10. Mídia | B grava metadata no canil de A | erro de permissão | erro 42501: new row violates row-level security policy for table "media" | **PASS** |
| 10. Mídia | mime fora da lista de imagem | erro CHECK media_mime_valid | erro 23514: new row for relation "media" violates check constraint "media_mime_valid" | **PASS** |
| 10. Mídia | arquivo acima do teto do banco | erro CHECK media_size_positive | erro 23514: new row for relation "media" violates check constraint "media_size_positive" | **PASS** |
| 10. Mídia | B escreve legenda na mídia de A | 0 linhas afetadas | 0 linha(s) | **PASS** |
| 10. Mídia | legenda de A permanece intacta após a tentativa de B | null | null | **PASS** |
| 10. Mídia | A escreve legenda na própria mídia | 1 linha, legenda gravada | 1 linha(s) | **PASS** |
| 10. Mídia | quota do usuário soma o que ele gravou | pelo menos 12345 bytes | 12345 | **PASS** |
| 10. Mídia | A cria um ancestral fantasma (sem dono, sem canil) | criado | criado | **PASS** |
| 10. Mídia | A (criador do fantasma) grava foto nele | criado | 1 linha(s) | **PASS** |
| 10. Mídia | B (não é quem criou o fantasma) tenta gravar foto nele | erro de permissão | erro 42501: new row violates row-level security policy for table "media" | **PASS** |
| 11b. Selo Fundador (concorrência) | canil sem cão não recebe selo | todos sem número | 0 com número | **PASS** |
| 11b. Selo Fundador (concorrência) | 5 atribuições CONCORRENTES não geram número duplicado | 5 números distintos | 5 atribuídos, 5 distintos | **PASS** |
| 11b. Selo Fundador (concorrência) | nenhum número emitido abaixo de 100 | todos >= 100 | min 555079, max 555083 | **PASS** |
| 11b. Selo Fundador (concorrência) | exclusão lógica não devolve o número ao pool | número permanece | nº 555082 | **PASS** |
| 11a. Selo Fundador (autorização) | usuário grava founder_number no PRÓPRIO canil | erro de permissão de coluna | erro 42501: permission denied for table kennels | **PASS** |
| 11a. Selo Fundador (autorização) | usuário grava founder_number no canil de OUTRO | erro de permissão | erro 42501: permission denied for table kennels | **PASS** |
| 11a. Selo Fundador (autorização) | após as duas tentativas, o número no banco não mudou | continua nulo | nulo | **PASS** |
| 12. Bucket público | A grava no próprio prefixo do bucket público | sucesso | sucesso | **PASS** |
| 12. Bucket público | B grava no prefixo de A no bucket público | erro de permissão | erro: new row violates row-level security policy | **PASS** |
| 12. Bucket público | anônimo grava no bucket público | erro de permissão | erro: new row violates row-level security policy | **PASS** |
| 12. Bucket público | URL pública não carrega token nem expiração | sem ?token= e sem expires | /storage/v1/object/public/kennel-media-public/66fe5601-371b-49de-a11e-44bedae12bcb/canis/publico-mtje4ywy.png | **PASS** |
| 12. Bucket público | anônimo BAIXA o objeto pela URL pública, sem sessão | HTTP 200 | HTTP 200 | **PASS** |
| 12. Bucket público | A move o objeto de volta ao bucket privado (despublicar) | sucesso | sucesso | **PASS** |
| 12. Bucket público | objeto sai do bucket público ao despublicar (fonte: Storage) | não está mais lá | removido | **PASS** |
| 13. Um canil por dono | U cria o primeiro canil | sucesso | sucesso | **PASS** |
| 13. Um canil por dono | U cria um SEGUNDO canil, com endereço novo | erro em kennels_owner_uk | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | **PASS** |
| 13. Um canil por dono | B, que já tem canil, também é barrado — o limite é por dono, não global | erro em kennels_owner_uk | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | **PASS** |
| 13. Um canil por dono | depois de excluir logicamente, U cadastra outro canil | sucesso — a exclusão libera a vaga | 1 linha(s) | **PASS** |
| 13. Um canil por dono | o endereço do canil excluído de U continua reservado | erro em kennels_slug_key — a vaga volta, o endereço não | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | **PASS** |
| 13. Um canil por dono | U tenta REVERTER a exclusão tendo outro canil vivo | erro em kennels_owner_uk — o índice cobre o UPDATE, não só o INSERT | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | **PASS** |
| 14. Superfície admin_* | usuário comum chama admin_set_profile_suspended | erro — insufficient_privilege | erro: apenas um admin pode suspender ou reativar um usuário | **PASS** |
| 14. Superfície admin_* | usuário comum chama admin_set_founder_number | erro — insufficient_privilege | erro: apenas um admin pode corrigir o número do canil | **PASS** |
| 14. Superfície admin_* | usuário comum chama admin_set_kennel_hidden | erro — insufficient_privilege | erro: apenas um admin pode ocultar ou reativar um canil | **PASS** |
| 14. Superfície admin_* | usuário comum chama admin_set_dog_hidden | erro — insufficient_privilege | erro: apenas um admin pode ocultar ou reativar um cão | **PASS** |
| 14. Superfície admin_* | estado de B, do canil e do cão após as quatro tentativas | nada mudou | nada mudou | **PASS** |
| 14. Superfície admin_* | usuário comum chama admin_get_profile_email | erro — insufficient_privilege | erro: apenas um admin pode ler o e-mail de um usuário | **PASS** |
| 14. Superfície admin_* | admin chama admin_get_profile_email para B | rls-mtje4ywy-b@origemx.test | rls-mtje4ywy-b@origemx.test | **PASS** |
| 15. Ciclo de suspensão | admin suspende B de verdade, pela RPC | sucesso | sucesso | **PASS** |
| 15. Ciclo de suspensão | audit_log tem exatamente 1 linha para esta suspensão | 1 linha | 1 linha(s) | **PASS** |
| 15. Ciclo de suspensão | B (já suspenso) tenta escrever com a sessão que já tinha aberta | 0 linhas | 0 linha(s) | **PASS** |
| 15. Ciclo de suspensão | B tenta logar de novo (sessão nova) enquanto suspenso | erro — banido | erro: User is banned | **PASS** |
| 15. Ciclo de suspensão | admin reativa B de verdade, pela RPC | sucesso | sucesso | **PASS** |
| 15. Ciclo de suspensão | B loga de novo depois de reativado | sucesso | sucesso | **PASS** |
| 15. Ciclo de suspensão | B volta a conseguir escrever, com a sessão antiga, depois de reativado | 1 linha | 1 linha(s) | **PASS** |
| 16. Ciclo de ocultar canil e cão | admin oculta o canil de B de verdade, pela RPC | sucesso | sucesso | **PASS** |
| 16. Ciclo de ocultar canil e cão | admin oculta o cão de B de verdade, pela RPC | sucesso | sucesso | **PASS** |
| 16. Ciclo de ocultar canil e cão | audit_log tem exatamente 1 linha para cada ocultação | 2 linhas | 2 linha(s) | **PASS** |
| 16. Ciclo de ocultar canil e cão | sessão anônima não vê mais o canil oculto | 0 linhas | 0 linha(s) | **PASS** |
| 16. Ciclo de ocultar canil e cão | sessão anônima não vê mais o cão oculto | 0 linhas | 0 linha(s) | **PASS** |
| 16. Ciclo de ocultar canil e cão | o DONO continua enxergando o próprio canil oculto | 1 linha | 1 linha(s) | **PASS** |
| 16. Ciclo de ocultar canil e cão | o DONO continua enxergando o próprio cão oculto | 1 linha | 1 linha(s) | **PASS** |
| 16. Ciclo de ocultar canil e cão | admin reativa o canil de B de verdade, pela RPC | sucesso | sucesso | **PASS** |
| 16. Ciclo de ocultar canil e cão | admin reativa o cão de B de verdade, pela RPC | sucesso | sucesso | **PASS** |
| 16. Ciclo de ocultar canil e cão | audit_log tem exatamente 1 linha para cada reativação | 2 linhas | 2 linha(s) | **PASS** |
| 16. Ciclo de ocultar canil e cão | sessão anônima volta a ver o canil, reativado | 1 linha | 1 linha(s) | **PASS** |
| 16. Ciclo de ocultar canil e cão | sessão anônima volta a ver o cão, reativado | 1 linha | 1 linha(s) | **PASS** |
| 17. Corrigir número do selo | admin tenta atribuir a um canil o número que já pertence a outro | erro — número já pertence a outro canil | erro: o número 555079 já pertence a outro canil | **PASS** |
| 17. Corrigir número do selo | número do canil-alvo não mudou depois da tentativa de duplicidade | nº 555083 | nº 555083 | **PASS** |
| 17. Corrigir número do selo | admin libera o número do canil (correção real, primeira metade) | sucesso | sucesso | **PASS** |
| 17. Corrigir número do selo | admin devolve o número certo (correção real, segunda metade) | sucesso | sucesso | **PASS** |
| 17. Corrigir número do selo | audit_log grava as duas correções, de→para corretos | 2 linhas: {de:555081,para:null} e {de:null,para:555081} | 2 linha(s): [{"de":555081,"para":null},{"de":null,"para":555081}] | **PASS** |
| 17. Corrigir número do selo | canil termina com o número original — round-trip fechado | nº 555081 | nº 555081 | **PASS** |
| 18. Vídeo | A registra o vídeo do próprio cão | criado | criado | **PASS** |
| 18. Vídeo | B registra vídeo no cão de A | negado (42501) | erro 42501: new row violates row-level security policy for table "dog_videos" | **PASS** |
| 18. Vídeo | B registra vídeo forjando owner_id de A | negado (42501) | erro 42501: new row violates row-level security policy for table "dog_videos" | **PASS** |
| 18. Vídeo | B altera o status do vídeo de A | 0 linhas | 0 linha(s) | **PASS** |
| 18. Vídeo | A apaga fisicamente o próprio vídeo | negado (42501) | erro 42501: permission denied for table dog_videos | **PASS** |
| 18. Vídeo | A registra um SEGUNDO vídeo no mesmo cão | negado (23505) | erro 23505: duplicate key value violates unique constraint "dog_videos_one_per_dog" | **PASS** |
| 18. Vídeo | anônimo lê o vídeo de cão PUBLICADO | 1 linha | 1 linha(s) | **PASS** |
| 18. Vídeo | anônimo lê o vídeo de cão em RASCUNHO | 0 linhas | 0 linha(s) | **PASS** |
| 18. Vídeo | listagem anônima sem filtro traz vídeo de rascunho | 0 linhas do rascunho | 0 linha(s) | **PASS** |
| 18. Vídeo | A exclui logicamente o PRÓPRIO vídeo (RETURNING precisa voltar a linha) | 1 linha | 1 linha(s) | **PASS** |
| 18. Vídeo | anônimo lê vídeo já excluído logicamente | 0 linhas | 0 linha(s) | **PASS** |
| 18. Vídeo | A envia outro vídeo depois de remover o anterior | criado | 1 linha(s) | **PASS** |
| 19. Ninhadas | A cria o canil deste cenário (a vaga estava livre desde o cenário 10) | 1 linha | 1 linha | **PASS** |
| 19. Ninhadas | A cria ninhada RASCUNHO no próprio canil | criada | criada | **PASS** |
| 19. Ninhadas | B cria ninhada no canil de A | negado (42501) | erro 42501: new row violates row-level security policy for table "kennel_litters" | **PASS** |
| 19. Ninhadas | B cria ninhada no PRÓPRIO canil forjando created_by de A | negado (42501) | erro 42501: new row violates row-level security policy for table "kennel_litters" | **PASS** |
| 19. Ninhadas | B (autenticado, não dono) lê a ninhada RASCUNHO de A | 0 linhas | 0 linha(s) | **PASS** |
| 19. Ninhadas | B altera a descrição da ninhada de A | 0 linhas | 0 linha(s) | **PASS** |
| 19. Ninhadas | A publica a própria ninhada | 1 linha | 1 linha(s) | **PASS** |
| 19. Ninhadas | anônimo lê ninhada publicada, com canil publicado | 1 linha | 1 linha(s) | **PASS** |
| 19. Ninhadas | ninhada PUBLICADA some da leitura anônima quando o CANIL volta a rascunho | 0 linhas | 0 linha(s) | **PASS** |
| 19. Ninhadas | o DONO continua vendo a própria ninhada com o canil em rascunho | 1 linha | 1 linha(s) | **PASS** |
| 19. Ninhadas | B NÃO consegue cadastrar filhote na ninhada de A (owns_litter no WITH CHECK) | recusado | erro 42501: new row violates row-level security policy for table "dogs" | **PASS** |
| 19. Ninhadas | A (dona) cadastra filhote na própria ninhada | criado | 1 linha(s) | **PASS** |
| 19. Ninhadas | preço em cão FORA de ninhada é recusado (fronteira do aditivo) | recusado | erro 23514: new row for relation "dogs" violates check constraint "dogs_price_requires_litter" | **PASS** |
| 19. Ninhadas | A cria uma SEGUNDA ninhada no mesmo canil — sem unicidade entre ninhadas | criada | criada | **PASS** |
| 19. Ninhadas | A grava as 4 fotos da ninhada, uma por posição | 4 criadas | 4 criada(s) | **PASS** |
| 19. Ninhadas | 5ª foto em position=5 (fora do intervalo 1-4) | erro CHECK media_litter_position_valid | erro 23514: new row for relation "media" violates check constraint "media_litter_position_valid" | **PASS** |
| 19. Ninhadas | 5ª foto reaproveitando position=1, já ocupada por linha viva | erro em media_litter_position_uk | erro 23505: duplicate key value violates unique constraint "media_litter_position_uk" | **PASS** |
| 19. Ninhadas | B grava foto na ninhada de A | negado (42501) | erro 42501: new row violates row-level security policy for table "media" | **PASS** |
| 19. Ninhadas | anônimo lê fotos de ninhada em RASCUNHO | 0 linhas | 0 linha(s) | **PASS** |
| 19. Ninhadas | A exclui logicamente a foto da posição 1 | 1 linha | 1 linha(s) | **PASS** |
| 19. Ninhadas | A grava outra foto na posição 1, depois de excluir a anterior | criada | 1 linha(s) | **PASS** |
| 19. Ninhadas | anônimo lê as fotos depois de a ninhada ser publicada | 4 linhas | 4 linha(s) | **PASS** |
| 19. Ninhadas | A exclui logicamente a PRÓPRIA ninhada (RETURNING precisa voltar a linha) | 1 linha | 1 linha(s) | **PASS** |
| 19. Ninhadas | anônimo lê ninhada já excluída logicamente | 0 linhas | 0 linha(s) | **PASS** |
| 19. Ninhadas | A apaga fisicamente a própria ninhada | negado (42501) | erro 42501: permission denied for table kennel_litters | **PASS** |
| 20. Exames genéticos | anônimo lê exame de cão PUBLICADO | 1 linha | 1 linha(s) | **PASS** |
| 20. Exames genéticos | anônimo lê exame de cão em RASCUNHO | 0 linhas | 0 linha(s) | **PASS** |
| 20. Exames genéticos | anônimo lê registro de saúde de cão em RASCUNHO (mesma delegação) | 0 linhas | 0 linha(s) | **PASS** |
| 20. Exames genéticos | listagem anônima sem filtro NÃO traz exame de cão em rascunho | nenhuma linha do cão em rascunho | 18 linha(s) | **PASS** |
| 20. Exames genéticos | B cadastra exame no cão de A | recusado | erro 42501: new row violates row-level security policy for table "dog_genetic_tests" | **PASS** |
| 20. Exames genéticos | B edita exame do cão de A | recusado (0 linhas) | 0 linha(s) | **PASS** |
| 20. Exames genéticos | A edita o PRÓPRIO exame | 1 linha | 1 linha(s) | **PASS** |
| 20. Exames genéticos | A apaga fisicamente o próprio exame | negado (42501) | erro 42501: permission denied for table dog_genetic_tests | **PASS** |
| 20. Exames genéticos | anônimo lê saúde de cão PUBLICADO | 1 linha | 1 linha(s) | **PASS** |
| 20. Exames genéticos | B cadastra registro de saúde no cão de A | recusado | erro 42501: new row violates row-level security policy for table "dog_health_records" | **PASS** |
| 20. Exames genéticos | B edita registro de saúde do cão de A | recusado (0 linhas) | 0 linha(s) | **PASS** |
| 20. Exames genéticos | A edita o PRÓPRIO registro de saúde | 1 linha | 1 linha(s) | **PASS** |
| 20. Exames genéticos | A apaga fisicamente o próprio registro de saúde | negado (42501) | erro 42501: permission denied for table dog_health_records | **PASS** |
| 21. Admin cadastra para outro usuário | usuário comum chama admin_create_dog_for_kennel | erro — insufficient_privilege | erro: apenas um admin pode cadastrar um cão em nome de outra pessoa | **PASS** |
| 21. Admin cadastra para outro usuário | usuário comum chama admin_create_litter_for_kennel | erro — insufficient_privilege | erro: apenas um admin pode cadastrar uma ninhada em nome de outra pessoa | **PASS** |
| 21. Admin cadastra para outro usuário | nada foi gravado pelas duas tentativas negadas | 0 linhas | 0 linha(s) | **PASS** |
| 21. Admin cadastra para outro usuário | B cadastra cão com owner_id de outra pessoa, direto pela API | negado (42501) | erro 42501: new row violates row-level security policy for table "dogs" | **PASS** |
| 21. Admin cadastra para outro usuário | B cadastra cão no canil de D, direto pela API | negado (42501) | erro 42501: new row violates row-level security policy for table "dogs" | **PASS** |
| 21. Admin cadastra para outro usuário | admin SUSPENSO chama admin_create_dog_for_kennel | erro — insufficient_privilege | erro: apenas um admin pode cadastrar um cão em nome de outra pessoa | **PASS** |
| 21. Admin cadastra para outro usuário | admin SUSPENSO chama admin_create_litter_for_kennel | erro — insufficient_privilege | erro: apenas um admin pode cadastrar uma ninhada em nome de outra pessoa | **PASS** |
| 21. Admin cadastra para outro usuário | admin cadastra cão comum no canil de outro usuário | sucesso — id devolvido | id 5b6bf693-e870-46f4-b465-16bdac8984fa | **PASS** |
| 21. Admin cadastra para outro usuário | owner_id vem do canil de destino, created_by é o admin | owner=ea876538-395c-4e21-ac7a-23954301e3ae kennel=1794588a-b678-4dd4-98ea-135d2500be79 created_by=ee5932ca-ae28-4ed8-b141-90c105a616d1 | owner=ea876538-395c-4e21-ac7a-23954301e3ae kennel=1794588a-b678-4dd4-98ea-135d2500be79 created_by=ee5932ca-ae28-4ed8-b141-90c105a616d1 | **PASS** |
| 21. Admin cadastra para outro usuário | cadastro do cão gera exatamente 1 linha de auditoria, com o motivo | 1 linha, motivo preservado | 1 linha(s), motivo: cliente pediu por telefone — caso de evidência | **PASS** |
| 21. Admin cadastra para outro usuário | admin cadastra ninhada no canil de outro usuário | sucesso — id devolvido | id 15cf456d-ccba-4b8d-9ab1-82ab28a89fd1 | **PASS** |
| 21. Admin cadastra para outro usuário | ninhada nasce SEMPRE rascunho — publicar continua sendo do dono | created_by=ee5932ca-ae28-4ed8-b141-90c105a616d1 published_at=nulo | created_by=ee5932ca-ae28-4ed8-b141-90c105a616d1 published_at=nulo | **PASS** |
| 21. Admin cadastra para outro usuário | cadastro da ninhada gera exatamente 1 linha de auditoria | 1 linha | 1 linha(s) | **PASS** |
| 21. Admin cadastra para outro usuário | filhote cadastrado pelo admin herda par e status da ninhada | litter=15cf456d-ccba-4b8d-9ab1-82ab28a89fd1 status=available par=c05ab8d0-c26d-4d59-aff3-caad6a3b933a/b8ef3595-798b-4e8e-9251-fc9ee3d30099 | litter=15cf456d-ccba-4b8d-9ab1-82ab28a89fd1 status=available sire=c05ab8d0-c26d-4d59-aff3-caad6a3b933a dam=b8ef3595-798b-4e8e-9251-fc9ee3d30099 | **PASS** |
| 21. Admin cadastra para outro usuário | D (dono) LÊ o cão que o admin cadastrou em nome dele | 1 linha | 1 linha(s) | **PASS** |
| 21. Admin cadastra para outro usuário | D (dono) EDITA o cão que o admin cadastrou em nome dele | 1 linha | 1 linha(s) | **PASS** |
| 21. Admin cadastra para outro usuário | D (dono) EDITA a ninhada que o admin cadastrou em nome dele | 1 linha | 1 linha(s) | **PASS** |
| 22. Admin cadastra canil, mídia e publica | usuário comum chama admin_create_kennel_for_user | erro — insufficient_privilege | erro: apenas um admin pode cadastrar um canil em nome de outra pessoa | **PASS** |
| 22. Admin cadastra canil, mídia e publica | usuário comum chama admin_register_media_for_user | erro — insufficient_privilege | erro: apenas um admin pode registrar mídia em nome de outra pessoa | **PASS** |
| 22. Admin cadastra canil, mídia e publica | usuário comum chama admin_set_kennel_published | erro — insufficient_privilege | erro: apenas um admin pode publicar ou despublicar um canil em nome de outra pessoa | **PASS** |
| 22. Admin cadastra canil, mídia e publica | usuário comum chama admin_set_dog_published | erro — insufficient_privilege | erro: apenas um admin pode publicar ou despublicar um cão em nome de outra pessoa | **PASS** |
| 22. Admin cadastra canil, mídia e publica | usuário comum grava no prefixo de D (a policy alargou só para admin) | erro de permissão | erro: new row violates row-level security policy | **PASS** |
| 22. Admin cadastra canil, mídia e publica | admin grava sob prefixo que não é de nenhum perfil | erro de permissão | erro: new row violates row-level security policy | **PASS** |
| 22. Admin cadastra canil, mídia e publica | admin grava no prefixo do DONO (controle: precisa funcionar) | sucesso | sucesso | **PASS** |
| 22. Admin cadastra canil, mídia e publica | canil criado pelo admin pertence a E, com autoria do admin e em rascunho | owner=05808cfe-5b07-4259-85e2-cf904691491a created_by=ee5932ca-ae28-4ed8-b141-90c105a616d1 published_at=null | owner=05808cfe-5b07-4259-85e2-cf904691491a created_by=ee5932ca-ae28-4ed8-b141-90c105a616d1 published_at=null | **PASS** |
| 22. Admin cadastra canil, mídia e publica | segundo canil para o mesmo dono (kennels_owner_uk) | erro — unique_violation | erro: este usuário já tem um canil; cada criador tem no máximo um canil vivo | **PASS** |
| 22. Admin cadastra canil, mídia e publica | E (dono) EDITA o canil que o admin criou em nome dele | 1 linha | 1 linha(s) | **PASS** |
| 22. Admin cadastra canil, mídia e publica | admin publica o canil de E, e a decisão fica na trilha | published_at preenchido | published_at=2026-09-02T01:02:33.579163+00:00 | **PASS** |
| 22. Admin cadastra canil, mídia e publica | publicação por admin gera 1 linha de auditoria identificando o admin | 1 linha, ator=ee5932ca-ae28-4ed8-b141-90c105a616d1 | 1 linha(s), ator=ee5932ca-ae28-4ed8-b141-90c105a616d1 | **PASS** |
| 22. Admin cadastra canil, mídia e publica | mídia com caminho no prefixo do ADMIN, e não do dono | erro — check_violation | erro: o caminho precisa começar pelo id do dono (ea876538-395c-4e21-ac7a-23954301e3ae), e começa por "ee5932ca-ae28-4ed8-b141-90c105a616d1" | **PASS** |
| 22. Admin cadastra canil, mídia e publica | mídia registrada pelo admin pertence ao DONO, com mime lido do Storage | owner=ea876538-395c-4e21-ac7a-23954301e3ae created_by=ee5932ca-ae28-4ed8-b141-90c105a616d1 mime=image/png | owner=ea876538-395c-4e21-ac7a-23954301e3ae created_by=ee5932ca-ae28-4ed8-b141-90c105a616d1 mime=image/png | **PASS** |
