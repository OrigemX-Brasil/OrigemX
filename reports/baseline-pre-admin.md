# Baseline — antes do painel administrativo

Capturado em 2026-08-10T19:06:50.805Z. 97 casos.

Valores voláteis (uuid gerado, token da execução) aparecem normalizados
como `<uuid>` e `<run>` — o que muda entre execuções sem que o
comportamento tenha mudado não pode poluir a comparação.

| caso | esperado | obtido | status |
|---|---|---|---|
| `bateria#00` | 2 profiles | 2 profiles | PASS |
| `bateria#01` | bloqueio (trigger de ciclo dispara antes do CHECK) | 23514 ciclo genealógico: o cão <uuid> apareceria como ancestral de si mesmo | PASS |
| `bateria#02` | bloqueio (validação de sexo dispara antes do CHECK) | 23514 dam_id (<uuid>) precisa referenciar uma cadela | PASS |
| `bateria#03` | erro trigger dogs_check_ancestry | 23514 ciclo genealógico: o cão <uuid> apareceria como ancestral de si mesmo | PASS |
| `bateria#04` | erro trigger dogs_check_ancestry | 23514 sire_id (<uuid>) precisa referenciar um cão macho | PASS |
| `bateria#05` | erro trigger dogs_freeze_public_id | 23001 public_id é imutável (cão <uuid>): QR Code já impresso passaria a apontar para o lugar errado | PASS |
| `bateria#06` | erro índice microchip_uk | 23505 duplicate key value violates unique constraint "dog_identifiers_microchip_uk" | PASS |
| `bateria#07` | DEVE PASSAR | inseriu | PASS |
| `bateria#08` | 0 linhas | 0 linhas | PASS |
| `bateria#09` | erro de permissão de coluna | 42501 permission denied for table profiles | PASS |
| `bateria#10` | 0 linhas | 0 linhas | PASS |
| `bateria#11` | 0 linhas | 0 linhas | PASS |
| `bateria#12` | erro de permissão | 42501 permission denied for table dogs | PASS |
| `bateria#13` | 0 linhas | 0 linhas (identidade: anônimo) | PASS |
| `bateria#14` | 1 linha | 1 linhas (identidade: <uuid>) | PASS |
| `bateria#15` | DEVE PASSAR (2 linhas) | 2 linhas | PASS |
| `bateria#16` | erro índice dogs_kennel_slug_key | 23505 duplicate key value violates unique constraint "dogs_kennel_slug_key" | PASS |
| `bateria#17` | erro CHECK dogs_slug_requires_kennel | 23514 new row for relation "dogs" violates check constraint "dogs_slug_requires_kennel" | PASS |
| `bateria#18` | 1 linha — é nó de árvore | 1 linhas (identidade: anônimo) | PASS |
| `bateria#19` | 0 linhas — é rascunho | 0 linhas (identidade: anônimo) | PASS |
| `bateria#20` | erro FK RESTRICT | 23503 update or delete on table "kennels" violates foreign key constraint "dogs_kennel_id_fkey" on table "dogs" | PASS |
| `bateria#21` | sem número e sequence parada | sem número, sequence parada | PASS |
| `bateria#22` | número entre 1 e 100 | 123 | FAIL |
| `bateria#23` | erro do trigger de imutabilidade | 23001 O selo Criador Fundador é imutável e intransferível (canil <uuid>, número 123) | PASS |
| `bateria#24` | mesmo número e sequence parada | 123 -> 123, sequence parada | PASS |
| `bateria#25` | número permanece na linha | 123 | PASS |
| `bateria#26` | sem selo, e o cadastro não quebra | selo 101, cadastro sem erro | FAIL |
| `bateria#27` | 1 canil vivo | 1 canis vivos | PASS |
| `bateria#28` | 1 canil novo vivo | 1 criado | PASS |
| `bateria#29` | 1 canil vivo | 1 canis vivos | PASS |
| `rls#1. Criação — A cria o próprio canil` | 1 linha | 1 linha | PASS |
| `rls#1. Criação — B cria o próprio canil` | 1 linha | 1 linha | PASS |
| `rls#1. Criação — A cria cão PUBLICADO no próprio canil` | 1 linha | 1 linha | PASS |
| `rls#1. Criação — A cria cão RASCUNHO no próprio canil` | 1 linha | 1 linha | PASS |
| `rls#1. Criação — B cria o próprio cão` | 1 linha | 1 linha | PASS |
| `rls#1. Criação — A registra microchip do próprio cão` | sucesso | sucesso | PASS |
| `rls#2. Leitura de B sobre A — B lê o cão RASCUNHO de A` | 0 linhas | 0 linha(s) | PASS |
| `rls#2. Leitura de B sobre A — B lê o microchip do cão de A (dado sensível)` | 0 linhas | 0 linha(s) | PASS |
| `rls#2. Leitura de B sobre A — B varre TODOS os rascunhos da base procurando os de A` | nenhum rascunho de A | 0 rascunho(s) de A em 12 visíveis | PASS |
| `rls#2. Leitura de B sobre A — B lê o cão PUBLICADO de A (comportamento esperado: diretório é público)` | 1 linha | 1 linha(s) | PASS |
| `rls#3. Escrita de B sobre A — B faz UPDATE no canil de A` | 0 linhas afetadas | 0 linha(s) | PASS |
| `rls#3. Escrita de B sobre A — B faz UPDATE no cão publicado de A` | 0 linhas afetadas | 0 linha(s) | PASS |
| `rls#3. Escrita de B sobre A — B move o cão de A para o próprio canil` | 0 linhas afetadas | 0 linha(s) | PASS |
| `rls#3. Escrita de B sobre A — B faz DELETE no cão de A` | erro de permissão (exclusão é lógica) | erro 42501: permission denied for table dogs | PASS |
| `rls#3. Escrita de B sobre A — B faz DELETE no PRÓPRIO cão (DELETE físico é negado a todos)` | erro de permissão | erro 42501: permission denied for table dogs | PASS |
| `rls#4. Anônimo — anônimo lê cão publicado` | 1 linha | 1 linha(s) | PASS |
| `rls#4. Anônimo — anônimo lê cão em rascunho` | 0 linhas | 0 linha(s) | PASS |
| `rls#4. Anônimo — anônimo lê dog_identifiers (microchip)` | 0 linhas ou erro de permissão | erro 42501: permission denied for table dog_identifiers | PASS |
| `rls#4. Anônimo — anônimo tenta INSERT em dogs` | erro de permissão | erro 42501: permission denied for table dogs | PASS |
| `rls#5. Storage — B grava no PRÓPRIO prefixo (controle: precisa funcionar)` | sucesso | sucesso | PASS |
| `rls#5. Storage — B grava no prefixo de A` | erro de permissão | erro: new row violates row-level security policy | PASS |
| `rls#5. Storage — B lista o prefixo de A` | vazio ou erro | 0 objeto(s) | PASS |
| `rls#5. Storage — B baixa arquivo de A` | erro de permissão | erro: Object not found | PASS |
| `rls#5. Storage — anônimo baixa arquivo de A` | erro de permissão | erro: Object not found | PASS |
| `rls#6. Admin — usuário comum se promove a admin` | erro de permissão de coluna | erro 42501: permission denied for table profiles | PASS |
| `rls#6. Admin — usuário comum edita o perfil de outro` | 0 linhas afetadas | 0 linha(s) | PASS |
| `rls#6. Admin — usuário comum chama private.is_admin() via RPC` | erro — schema private não é exposto | erro: Could not find the function public.is_admin without parameters in the schema cache | PASS |
| `rls#6. Admin — usuário comum chama função de trigger via RPC` | erro — EXECUTE revogado | erro: Could not find the function public.dogs_check_ancestry without parameters in the schema cache | PASS |
| `rls#6. Admin — papel de B no banco após as tentativas` | user | user | PASS |
| `rls#7. Criação de conta — conta criada com user_metadata.role = 'admin'` | profile nasce com role = 'user' | role = user | PASS |
| `rls#7. Criação de conta — conta em formato OAuth (name/picture) gera profile preenchido` | full_name e avatar_url preenchidos | full_name = Fulano do Google, avatar_url = preenchido | PASS |
| `rls#7. Criação de conta — conta em formato OAuth nasce como usuário comum` | role = 'user' | role = user | PASS |
| `rls#8. CRUD de canil — A atualiza TODOS os campos editáveis de uma vez (payload real de updateKennel)` | 1 linha — nenhuma coluna sem GRANT | 1 linha(s) | PASS |
| `rls#8. CRUD de canil — A exclui o próprio canil (lógico)` | 1 linha marcada | 1 linha(s) | PASS |
| `rls#8. CRUD de canil — linha continua na tabela — exclusão é lógica, nunca física` | linha existe com deleted_at preenchido | existe, deleted_at preenchido | PASS |
| `rls#8. CRUD de canil — anônimo lê canil excluído logicamente` | 0 linhas | 0 linha(s) | PASS |
| `rls#8. CRUD de canil — C (sem canil) tenta reusar o endereço de um canil excluído de A` | erro em kennels_slug_key — slug fica reservado para sempre | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | PASS |
| `rls#9. Genealogia — A cadastra ancestral fantasma (sem dono e sem canil)` | criado | criado | PASS |
| `rls#9. Genealogia — anônimo lê o fantasma — é nó de árvore, não precisa estar publicado` | 1 linha | 1 linha(s) | PASS |
| `rls#9. Genealogia — dog_descendant_ids devolve o descendente` | inclui o filho | inclui | PASS |
| `rls#9. Genealogia — ciclo pela API vira mensagem legível, não 500` | erro traduzido, sem jargão de banco | [23514] -> "Esse cão já aparece como descendente na árvore. Defini-lo como pai ou mãe faria com que ele fosse ancestral de si mesmo, o que o registro não permite." | PASS |
| `rls#9. Genealogia — macho na posição de mãe vira mensagem no campo certo` | campo dam_id, texto sobre fêmea | dam_id: "A mãe precisa ser uma fêmea." | PASS |
| `rls#10. Mídia — A registra metadata do próprio logo` | criado | criado | PASS |
| `rls#10. Mídia — B grava metadata no canil de A` | erro de permissão | erro 42501: new row violates row-level security policy for table "media" | PASS |
| `rls#10. Mídia — mime fora da lista de imagem` | erro CHECK media_mime_valid | erro 23514: new row for relation "media" violates check constraint "media_mime_valid" | PASS |
| `rls#10. Mídia — arquivo acima do teto do banco` | erro CHECK media_size_positive | erro 23514: new row for relation "media" violates check constraint "media_size_positive" | PASS |
| `rls#10. Mídia — quota do usuário soma o que ele gravou` | pelo menos 12345 bytes | 12345 | PASS |
| `rls#11b. Selo Fundador (concorrência) — canil sem cão não recebe selo` | todos sem número | 0 com número | PASS |
| `rls#11b. Selo Fundador (concorrência) — 5 atribuições CONCORRENTES não geram número duplicado` | 5 números distintos | 5 atribuídos, 5 distintos | PASS |
| `rls#11b. Selo Fundador (concorrência) — nenhum número emitido abaixo de 100` | todos >= 100 | min 118, max 122 | PASS |
| `rls#11b. Selo Fundador (concorrência) — exclusão lógica não devolve o número ao pool` | número permanece | nº 118 | PASS |
| `rls#11a. Selo Fundador (autorização) — usuário grava founder_number no PRÓPRIO canil` | erro de permissão de coluna | erro 42501: permission denied for table kennels | PASS |
| `rls#11a. Selo Fundador (autorização) — usuário grava founder_number no canil de OUTRO` | erro de permissão | erro 42501: permission denied for table kennels | PASS |
| `rls#11a. Selo Fundador (autorização) — após as duas tentativas, o número no banco não mudou` | continua nulo | nulo | PASS |
| `rls#12. Bucket público — A grava no próprio prefixo do bucket público` | sucesso | sucesso | PASS |
| `rls#12. Bucket público — B grava no prefixo de A no bucket público` | erro de permissão | erro: new row violates row-level security policy | PASS |
| `rls#12. Bucket público — anônimo grava no bucket público` | erro de permissão | erro: new row violates row-level security policy | PASS |
| `rls#12. Bucket público — URL pública não carrega token nem expiração` | sem ?token= e sem expires | /storage/v1/object/public/kennel-media-public/<uuid>/canis/publico-<run>.png | PASS |
| `rls#12. Bucket público — anônimo BAIXA o objeto pela URL pública, sem sessão` | HTTP 200 | HTTP 200 | PASS |
| `rls#12. Bucket público — A move o objeto de volta ao bucket privado (despublicar)` | sucesso | sucesso | PASS |
| `rls#12. Bucket público — objeto sai do bucket público ao despublicar (fonte: Storage)` | não está mais lá | removido | PASS |
| `rls#13. Um canil por dono — U cria o primeiro canil` | sucesso | sucesso | PASS |
| `rls#13. Um canil por dono — U cria um SEGUNDO canil, com endereço novo` | erro em kennels_owner_uk | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | PASS |
| `rls#13. Um canil por dono — B, que já tem canil, também é barrado — o limite é por dono, não global` | erro em kennels_owner_uk | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | PASS |
| `rls#13. Um canil por dono — depois de excluir logicamente, U cadastra outro canil` | sucesso — a exclusão libera a vaga | 1 linha(s) | PASS |
| `rls#13. Um canil por dono — o endereço do canil excluído de U continua reservado` | erro em kennels_slug_key — a vaga volta, o endereço não | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | PASS |
| `rls#13. Um canil por dono — U tenta REVERTER a exclusão tendo outro canil vivo` | erro em kennels_owner_uk — o índice cobre o UPDATE, não só o INSERT | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | PASS |
