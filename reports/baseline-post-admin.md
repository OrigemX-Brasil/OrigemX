# Comparativo de comportamento — antes e depois da reescrita de `dogs_select`

| | |
|---|---|
| Antes | 2026-08-10T19:06:50.805Z (97 casos) |
| Depois | 2026-08-10T19:19:17.046Z (121 casos) |
| Divergências | **31** |

**31 caso(s) divergiram.** Cada linha marcada abaixo precisa de
justificativa antes do commit.

Casos que cobrem diretamente a policy reescrita: `bateria#13`,
`bateria#14`, `bateria#18`, `bateria#19`, e os cenários 2, 4 e 9 do
`test:rls`.

| caso | obtido ANTES | obtido DEPOIS | |
|---|---|---|---|
| `bateria#00` | 2 profiles | 2 profiles | igual |
| `bateria#01` | 23514 ciclo genealógico: o cão <uuid> apareceria como ancestral de si mesmo | 23514 ciclo genealógico: o cão <uuid> apareceria como ancestral de si mesmo | igual |
| `bateria#02` | 23514 dam_id (<uuid>) precisa referenciar uma cadela | 23514 dam_id (<uuid>) precisa referenciar uma cadela | igual |
| `bateria#03` | 23514 ciclo genealógico: o cão <uuid> apareceria como ancestral de si mesmo | 23514 ciclo genealógico: o cão <uuid> apareceria como ancestral de si mesmo | igual |
| `bateria#04` | 23514 sire_id (<uuid>) precisa referenciar um cão macho | 23514 sire_id (<uuid>) precisa referenciar um cão macho | igual |
| `bateria#05` | 23001 public_id é imutável (cão <uuid>): QR Code já impresso passaria a apontar para o lugar errado | 23001 public_id é imutável (cão <uuid>): QR Code já impresso passaria a apontar para o lugar errado | igual |
| `bateria#06` | 23505 duplicate key value violates unique constraint "dog_identifiers_microchip_uk" | 23505 duplicate key value violates unique constraint "dog_identifiers_microchip_uk" | igual |
| `bateria#07` | inseriu | inseriu | igual |
| `bateria#08` | 0 linhas | 0 linhas | igual |
| `bateria#09` | 42501 permission denied for table profiles | 42501 permission denied for table profiles | igual |
| `bateria#10` | 0 linhas | 0 linhas | igual |
| `bateria#11` | 0 linhas | 0 linhas | igual |
| `bateria#12` | 42501 permission denied for table dogs | 42501 permission denied for table dogs | igual |
| `bateria#13` | 0 linhas (identidade: anônimo) | 0 linhas (identidade: anônimo) | igual |
| `bateria#14` | 1 linhas (identidade: <uuid>) | 1 linhas (identidade: <uuid>) | igual |
| `bateria#15` | 2 linhas | 2 linhas | igual |
| `bateria#16` | 23505 duplicate key value violates unique constraint "dogs_kennel_slug_key" | 23505 duplicate key value violates unique constraint "dogs_kennel_slug_key" | igual |
| `bateria#17` | 23514 new row for relation "dogs" violates check constraint "dogs_slug_requires_kennel" | 23514 new row for relation "dogs" violates check constraint "dogs_slug_requires_kennel" | igual |
| `bateria#18` | 1 linhas (identidade: anônimo) | 1 linhas (identidade: anônimo) | igual |
| `bateria#19` | 0 linhas (identidade: anônimo) | 0 linhas (identidade: anônimo) | igual |
| `bateria#20` | 23503 update or delete on table "kennels" violates foreign key constraint "dogs_kennel_id_fkey" on table "dogs" | 23503 update or delete on table "kennels" violates foreign key constraint "dogs_kennel_id_fkey" on table "dogs" | igual |
| `bateria#21` | sem número, sequence parada | sem número, sequence parada | igual |
| `bateria#22` | 123 | 128 | **MUDOU** |
| `bateria#23` | 23001 O selo Criador Fundador é imutável e intransferível (canil <uuid>, número 123) | 23001 O selo Criador Fundador é imutável e intransferível (canil <uuid>, número 128) | **MUDOU** |
| `bateria#24` | 123 -> 123, sequence parada | 128 -> 128, sequence parada | **MUDOU** |
| `bateria#25` | 123 | 128 | **MUDOU** |
| `bateria#26` | selo 101, cadastro sem erro | número nenhum, cadastro sem erro | **MUDOU** |
| `bateria#27` | 1 canis vivos | 1 canis vivos | igual |
| `bateria#28` | 1 criado | 1 criado | igual |
| `bateria#29` | 1 canis vivos | 1 canis vivos | igual |
| `bateria#30` | — | 42501 apenas um admin pode suspender ou reativar um usuário | **NOVO** |
| `bateria#31` | — | 42501 permission denied for table audit_log | **NOVO** |
| `bateria#32` | — | 42501 permission denied for table audit_log | **NOVO** |
| `bateria#33` | — | suspended_at 2026-08-10 19:19:16.013184+00 / banned_until 2126-08-10 19:19:16.013184+00 | **NOVO** |
| `bateria#34` | — | 1 linha(s), motivo: conduta abusiva — caso de bateria | **NOVO** |
| `bateria#35` | — | 1 linha(s) | **NOVO** |
| `bateria#36` | — | 42501 new row violates row-level security policy for table "dogs" | **NOVO** |
| `bateria#37` | — | 0 linhas | **NOVO** |
| `bateria#38` | — | 1 linhas | **NOVO** |
| `bateria#39` | — | false | **NOVO** |
| `bateria#40` | — | 23514 um admin não pode suspender a própria conta | **NOVO** |
| `bateria#41` | — | suspended_at nulo / banned_until nulo | **NOVO** |
| `bateria#42` | — | 23001 O selo Criador Fundador é imutável e intransferível (canil <uuid>, número 900001) | **NOVO** |
| `bateria#43` | — | 900002 | **NOVO** |
| `bateria#44` | — | (vazia) | **NOVO** |
| `bateria#45` | — | founder_number do segundo canil: nulo | **NOVO** |
| `bateria#46` | — | last_value = 900002 | **NOVO** |
| `bateria#47` | — | 42501 permission denied for table kennels | **NOVO** |
| `bateria#48` | — | 0 linhas | **NOVO** |
| `bateria#49` | — | 1 linhas | **NOVO** |
| `bateria#50` | — | 0 linhas | **NOVO** |
| `bateria#51` | — | 0 linhas | **NOVO** |
| `bateria#52` | — | nome Battery A / public_id nulo / is_public false | **NOVO** |
| `bateria#53` | — | 1 linhas | **NOVO** |
| `rls#1. Criação — A cria cão PUBLICADO no próprio canil` | 1 linha | 1 linha | igual |
| `rls#1. Criação — A cria cão RASCUNHO no próprio canil` | 1 linha | 1 linha | igual |
| `rls#1. Criação — A cria o próprio canil` | 1 linha | 1 linha | igual |
| `rls#1. Criação — A registra microchip do próprio cão` | sucesso | sucesso | igual |
| `rls#1. Criação — B cria o próprio canil` | 1 linha | 1 linha | igual |
| `rls#1. Criação — B cria o próprio cão` | 1 linha | 1 linha | igual |
| `rls#10. Mídia — A registra metadata do próprio logo` | criado | criado | igual |
| `rls#10. Mídia — B grava metadata no canil de A` | erro 42501: new row violates row-level security policy for table "media" | erro 42501: new row violates row-level security policy for table "media" | igual |
| `rls#10. Mídia — arquivo acima do teto do banco` | erro 23514: new row for relation "media" violates check constraint "media_size_positive" | erro 23514: new row for relation "media" violates check constraint "media_size_positive" | igual |
| `rls#10. Mídia — mime fora da lista de imagem` | erro 23514: new row for relation "media" violates check constraint "media_mime_valid" | erro 23514: new row for relation "media" violates check constraint "media_mime_valid" | igual |
| `rls#10. Mídia — quota do usuário soma o que ele gravou` | 12345 | 12345 | igual |
| `rls#11a. Selo Fundador (autorização) — após as duas tentativas, o número no banco não mudou` | nulo | nulo | igual |
| `rls#11a. Selo Fundador (autorização) — usuário grava founder_number no PRÓPRIO canil` | erro 42501: permission denied for table kennels | erro 42501: permission denied for table kennels | igual |
| `rls#11a. Selo Fundador (autorização) — usuário grava founder_number no canil de OUTRO` | erro 42501: permission denied for table kennels | erro 42501: permission denied for table kennels | igual |
| `rls#11b. Selo Fundador (concorrência) — 5 atribuições CONCORRENTES não geram número duplicado` | 5 atribuídos, 5 distintos | 5 atribuídos, 5 distintos | igual |
| `rls#11b. Selo Fundador (concorrência) — canil sem cão não recebe selo` | 0 com número | 0 com número | igual |
| `rls#11b. Selo Fundador (concorrência) — exclusão lógica não devolve o número ao pool` | nº 118 | nº 124 | **MUDOU** |
| `rls#11b. Selo Fundador (concorrência) — nenhum número emitido abaixo de 100` | min 118, max 122 | min 123, max 127 | **MUDOU** |
| `rls#12. Bucket público — A grava no próprio prefixo do bucket público` | sucesso | sucesso | igual |
| `rls#12. Bucket público — A move o objeto de volta ao bucket privado (despublicar)` | sucesso | sucesso | igual |
| `rls#12. Bucket público — B grava no prefixo de A no bucket público` | erro: new row violates row-level security policy | erro: new row violates row-level security policy | igual |
| `rls#12. Bucket público — URL pública não carrega token nem expiração` | /storage/v1/object/public/kennel-media-public/<uuid>/canis/publico-<run>.png | /storage/v1/object/public/kennel-media-public/<uuid>/canis/publico-<run>.png | igual |
| `rls#12. Bucket público — anônimo BAIXA o objeto pela URL pública, sem sessão` | HTTP 200 | HTTP 200 | igual |
| `rls#12. Bucket público — anônimo grava no bucket público` | erro: new row violates row-level security policy | erro: new row violates row-level security policy | igual |
| `rls#12. Bucket público — objeto sai do bucket público ao despublicar (fonte: Storage)` | removido | removido | igual |
| `rls#13. Um canil por dono — B, que já tem canil, também é barrado — o limite é por dono, não global` | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | igual |
| `rls#13. Um canil por dono — U cria o primeiro canil` | sucesso | sucesso | igual |
| `rls#13. Um canil por dono — U cria um SEGUNDO canil, com endereço novo` | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | igual |
| `rls#13. Um canil por dono — U tenta REVERTER a exclusão tendo outro canil vivo` | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | erro 23505: duplicate key value violates unique constraint "kennels_owner_uk" | igual |
| `rls#13. Um canil por dono — depois de excluir logicamente, U cadastra outro canil` | 1 linha(s) | 1 linha(s) | igual |
| `rls#13. Um canil por dono — o endereço do canil excluído de U continua reservado` | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | igual |
| `rls#2. Leitura de B sobre A — B lê o cão PUBLICADO de A (comportamento esperado: diretório é público)` | 1 linha(s) | 1 linha(s) | igual |
| `rls#2. Leitura de B sobre A — B lê o cão RASCUNHO de A` | 0 linha(s) | 0 linha(s) | igual |
| `rls#2. Leitura de B sobre A — B lê o microchip do cão de A (dado sensível)` | 0 linha(s) | 0 linha(s) | igual |
| `rls#2. Leitura de B sobre A — B varre TODOS os rascunhos da base procurando os de A` | 0 rascunho(s) de A em 12 visíveis | 0 rascunho(s) de A em 12 visíveis | igual |
| `rls#3. Escrita de B sobre A — B faz DELETE no PRÓPRIO cão (DELETE físico é negado a todos)` | erro 42501: permission denied for table dogs | erro 42501: permission denied for table dogs | igual |
| `rls#3. Escrita de B sobre A — B faz DELETE no cão de A` | erro 42501: permission denied for table dogs | erro 42501: permission denied for table dogs | igual |
| `rls#3. Escrita de B sobre A — B faz UPDATE no canil de A` | 0 linha(s) | 0 linha(s) | igual |
| `rls#3. Escrita de B sobre A — B faz UPDATE no cão publicado de A` | 0 linha(s) | 0 linha(s) | igual |
| `rls#3. Escrita de B sobre A — B move o cão de A para o próprio canil` | 0 linha(s) | 0 linha(s) | igual |
| `rls#4. Anônimo — anônimo lê cão em rascunho` | 0 linha(s) | 0 linha(s) | igual |
| `rls#4. Anônimo — anônimo lê cão publicado` | 1 linha(s) | 1 linha(s) | igual |
| `rls#4. Anônimo — anônimo lê dog_identifiers (microchip)` | erro 42501: permission denied for table dog_identifiers | erro 42501: permission denied for table dog_identifiers | igual |
| `rls#4. Anônimo — anônimo tenta INSERT em dogs` | erro 42501: permission denied for table dogs | erro 42501: permission denied for table dogs | igual |
| `rls#5. Storage — B baixa arquivo de A` | erro: Object not found | erro: Object not found | igual |
| `rls#5. Storage — B grava no PRÓPRIO prefixo (controle: precisa funcionar)` | sucesso | sucesso | igual |
| `rls#5. Storage — B grava no prefixo de A` | erro: new row violates row-level security policy | erro: new row violates row-level security policy | igual |
| `rls#5. Storage — B lista o prefixo de A` | 0 objeto(s) | 0 objeto(s) | igual |
| `rls#5. Storage — anônimo baixa arquivo de A` | erro: Object not found | erro: Object not found | igual |
| `rls#6. Admin — papel de B no banco após as tentativas` | user | user | igual |
| `rls#6. Admin — usuário comum chama função de trigger via RPC` | erro: Could not find the function public.dogs_check_ancestry without parameters in the schema cache | erro: Could not find the function public.dogs_check_ancestry without parameters in the schema cache | igual |
| `rls#6. Admin — usuário comum chama private.is_admin() via RPC` | erro: Could not find the function public.is_admin without parameters in the schema cache | erro: Could not find the function public.is_admin without parameters in the schema cache | igual |
| `rls#6. Admin — usuário comum edita o perfil de outro` | 0 linha(s) | 0 linha(s) | igual |
| `rls#6. Admin — usuário comum se promove a admin` | erro 42501: permission denied for table profiles | erro 42501: permission denied for table profiles | igual |
| `rls#7. Criação de conta — conta criada com user_metadata.role = 'admin'` | role = user | role = user | igual |
| `rls#7. Criação de conta — conta em formato OAuth (name/picture) gera profile preenchido` | full_name = Fulano do Google, avatar_url = preenchido | full_name = Fulano do Google, avatar_url = preenchido | igual |
| `rls#7. Criação de conta — conta em formato OAuth nasce como usuário comum` | role = user | role = user | igual |
| `rls#8. CRUD de canil — A atualiza TODOS os campos editáveis de uma vez (payload real de updateKennel)` | 1 linha(s) | 1 linha(s) | igual |
| `rls#8. CRUD de canil — A exclui o próprio canil (lógico)` | 1 linha(s) | 1 linha(s) | igual |
| `rls#8. CRUD de canil — C (sem canil) tenta reusar o endereço de um canil excluído de A` | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | igual |
| `rls#8. CRUD de canil — anônimo lê canil excluído logicamente` | 0 linha(s) | 0 linha(s) | igual |
| `rls#8. CRUD de canil — linha continua na tabela — exclusão é lógica, nunca física` | existe, deleted_at preenchido | existe, deleted_at preenchido | igual |
| `rls#9. Genealogia — A cadastra ancestral fantasma (sem dono e sem canil)` | criado | criado | igual |
| `rls#9. Genealogia — anônimo lê o fantasma — é nó de árvore, não precisa estar publicado` | 1 linha(s) | 1 linha(s) | igual |
| `rls#9. Genealogia — ciclo pela API vira mensagem legível, não 500` | [23514] -> "Esse cão já aparece como descendente na árvore. Defini-lo como pai ou mãe faria com que ele fosse ancestral de si mesmo, o que o registro não permite." | [23514] -> "Esse cão já aparece como descendente na árvore. Defini-lo como pai ou mãe faria com que ele fosse ancestral de si mesmo, o que o registro não permite." | igual |
| `rls#9. Genealogia — dog_descendant_ids devolve o descendente` | inclui | inclui | igual |
| `rls#9. Genealogia — macho na posição de mãe vira mensagem no campo certo` | dam_id: "A mãe precisa ser uma fêmea." | dam_id: "A mãe precisa ser uma fêmea." | igual |
