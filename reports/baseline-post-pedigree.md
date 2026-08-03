# Comparativo de comportamento — antes e depois da reescrita de `dogs_select`

| | |
|---|---|
| Antes | 2026-08-03T05:51:34.084Z (86 casos) |
| Depois | 2026-08-03T08:50:21.289Z (86 casos) |
| Divergências | **0** |

Nenhum caso mudou de comportamento. Não é só que as suítes passaram —
o texto do `obtido` de cada caso é idêntico ao de antes.

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
| `bateria#22` | 6 | 6 | igual |
| `bateria#23` | 23001 O selo Criador Fundador é imutável e intransferível (canil <uuid>, número 6) | 23001 O selo Criador Fundador é imutável e intransferível (canil <uuid>, número 6) | igual |
| `bateria#24` | 6 -> 6, sequence parada | 6 -> 6, sequence parada | igual |
| `bateria#25` | 6 | 6 | igual |
| `bateria#26` | selo nenhum, cadastro sem erro | selo nenhum, cadastro sem erro | igual |
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
| `rls#11. Selo Fundador — 5 atribuições CONCORRENTES não geram número duplicado` | 5 atribuídos, 5 distintos | 5 atribuídos, 5 distintos | igual |
| `rls#11. Selo Fundador — canil sem cão não recebe selo` | 0 com número | 0 com número | igual |
| `rls#11. Selo Fundador — exclusão lógica não devolve o número ao pool` | nº 1 | nº 1 | igual |
| `rls#11. Selo Fundador — nenhum número fora do intervalo 1..100` | min 1, max 5 | min 1, max 5 | igual |
| `rls#11. Selo Fundador — usuário grava founder_number no canil de outro` | erro 42501: permission denied for table kennels | erro 42501: permission denied for table kennels | igual |
| `rls#11. Selo Fundador — usuário grava founder_number pela API` | erro 42501: permission denied for table kennels | erro 42501: permission denied for table kennels | igual |
| `rls#12. Bucket público — A grava no próprio prefixo do bucket público` | sucesso | sucesso | igual |
| `rls#12. Bucket público — A move o objeto de volta ao bucket privado (despublicar)` | sucesso | sucesso | igual |
| `rls#12. Bucket público — B grava no prefixo de A no bucket público` | erro: new row violates row-level security policy | erro: new row violates row-level security policy | igual |
| `rls#12. Bucket público — URL pública não carrega token nem expiração` | /storage/v1/object/public/kennel-media-public/<uuid>/canis/publico-<run>.png | /storage/v1/object/public/kennel-media-public/<uuid>/canis/publico-<run>.png | igual |
| `rls#12. Bucket público — anônimo BAIXA o objeto pela URL pública, sem sessão` | HTTP 200 | HTTP 200 | igual |
| `rls#12. Bucket público — anônimo grava no bucket público` | erro: new row violates row-level security policy | erro: new row violates row-level security policy | igual |
| `rls#12. Bucket público — objeto sai do bucket público ao despublicar (fonte: Storage)` | removido | removido | igual |
| `rls#2. Leitura de B sobre A — B lê o cão PUBLICADO de A (comportamento esperado: diretório é público)` | 1 linha(s) | 1 linha(s) | igual |
| `rls#2. Leitura de B sobre A — B lê o cão RASCUNHO de A` | 0 linha(s) | 0 linha(s) | igual |
| `rls#2. Leitura de B sobre A — B lê o microchip do cão de A (dado sensível)` | 0 linha(s) | 0 linha(s) | igual |
| `rls#2. Leitura de B sobre A — B varre TODOS os rascunhos da base procurando os de A` | 0 rascunho(s) de A em 1 visíveis | 0 rascunho(s) de A em 1 visíveis | igual |
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
| `rls#8. CRUD de canil — A exclui o próprio canil (lógico)` | 1 linha(s) | 1 linha(s) | igual |
| `rls#8. CRUD de canil — B tenta reusar o endereço de um canil excluído de A` | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | erro 23505: duplicate key value violates unique constraint "kennels_slug_key" | igual |
| `rls#8. CRUD de canil — anônimo lê canil excluído logicamente` | 0 linha(s) | 0 linha(s) | igual |
| `rls#8. CRUD de canil — linha continua na tabela — exclusão é lógica, nunca física` | existe, deleted_at preenchido | existe, deleted_at preenchido | igual |
| `rls#9. Genealogia — A cadastra ancestral fantasma (sem dono e sem canil)` | criado | criado | igual |
| `rls#9. Genealogia — anônimo lê o fantasma — é nó de árvore, não precisa estar publicado` | 1 linha(s) | 1 linha(s) | igual |
| `rls#9. Genealogia — ciclo pela API vira mensagem legível, não 500` | [23514] -> "Esse cão já aparece como descendente na árvore. Defini-lo como pai ou mãe faria com que ele fosse ancestral de si mesmo, o que o registro não permite." | [23514] -> "Esse cão já aparece como descendente na árvore. Defini-lo como pai ou mãe faria com que ele fosse ancestral de si mesmo, o que o registro não permite." | igual |
| `rls#9. Genealogia — dog_descendant_ids devolve o descendente` | inclui | inclui | igual |
| `rls#9. Genealogia — macho na posição de mãe vira mensagem no campo certo` | dam_id: "A mãe precisa ser uma fêmea." | dam_id: "A mãe precisa ser uma fêmea." | igual |
