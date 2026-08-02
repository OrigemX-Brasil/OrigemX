# OrigemX — Evidência de RLS

|           |                                            |
| --------- | ------------------------------------------ |
| Data      | 2026-08-02T02:57:18.149Z                   |
| Projeto   | `https://lcqhnfdsrioufwvnrqnt.supabase.co` |
| Execução  | `msb7lx8w`                                 |
| Resultado | **APROVADO** — 36/36 PASS                  |

## Método

Dois usuários reais (A e B) e um cliente anônimo, falando com a API REST do
Supabase pela chave publishable — a mesma porta que um atacante usaria. Nada
passa pela interface. A chave secreta é usada apenas para criar e destruir as
fixtures, nunca para provar acesso.

## Escopo do isolamento

O OrigemX é um **diretório público** de canis. Canil e cão marcados como
publicados são legíveis por qualquer pessoa — isso é o produto, não uma
falha. O que a RLS isola é:

- registro em **rascunho** (`published_at` nulo) — só quem gerencia vê;
- **dado sensível** (`dog_identifiers`: microchip e registro) — nunca público;
- **escrita** — ninguém altera registro alheio;
- **arquivo no Storage** — cada usuário só acessa o próprio prefixo.

## Resultado por cenário

| Cenário                 | Verificação                                                             | Esperado                               | Obtido                                                                                              |          |
| ----------------------- | ----------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| 1. Criação              | A cria o próprio canil                                                  | 1 linha                                | 1 linha                                                                                             | **PASS** |
| 1. Criação              | B cria o próprio canil                                                  | 1 linha                                | 1 linha                                                                                             | **PASS** |
| 1. Criação              | A cria cão PUBLICADO no próprio canil                                   | 1 linha                                | 1 linha                                                                                             | **PASS** |
| 1. Criação              | A cria cão RASCUNHO no próprio canil                                    | 1 linha                                | 1 linha                                                                                             | **PASS** |
| 1. Criação              | B cria o próprio cão                                                    | 1 linha                                | 1 linha                                                                                             | **PASS** |
| 1. Criação              | A registra microchip do próprio cão                                     | sucesso                                | sucesso                                                                                             | **PASS** |
| 2. Leitura de B sobre A | B lê o cão RASCUNHO de A                                                | 0 linhas                               | 0 linha(s)                                                                                          | **PASS** |
| 2. Leitura de B sobre A | B lê o microchip do cão de A (dado sensível)                            | 0 linhas                               | 0 linha(s)                                                                                          | **PASS** |
| 2. Leitura de B sobre A | B varre TODOS os rascunhos da base procurando os de A                   | nenhum rascunho de A                   | 0 rascunho(s) de A em 0 visíveis                                                                    | **PASS** |
| 2. Leitura de B sobre A | B lê o cão PUBLICADO de A (comportamento esperado: diretório é público) | 1 linha                                | 1 linha(s)                                                                                          | **PASS** |
| 3. Escrita de B sobre A | B faz UPDATE no canil de A                                              | 0 linhas afetadas                      | 0 linha(s)                                                                                          | **PASS** |
| 3. Escrita de B sobre A | B faz UPDATE no cão publicado de A                                      | 0 linhas afetadas                      | 0 linha(s)                                                                                          | **PASS** |
| 3. Escrita de B sobre A | B move o cão de A para o próprio canil                                  | 0 linhas afetadas                      | 0 linha(s)                                                                                          | **PASS** |
| 3. Escrita de B sobre A | B faz DELETE no cão de A                                                | erro de permissão (exclusão é lógica)  | erro 42501: permission denied for table dogs                                                        | **PASS** |
| 3. Escrita de B sobre A | B faz DELETE no PRÓPRIO cão (DELETE físico é negado a todos)            | erro de permissão                      | erro 42501: permission denied for table dogs                                                        | **PASS** |
| 4. Anônimo              | anônimo lê cão publicado                                                | 1 linha                                | 1 linha(s)                                                                                          | **PASS** |
| 4. Anônimo              | anônimo lê cão em rascunho                                              | 0 linhas                               | 0 linha(s)                                                                                          | **PASS** |
| 4. Anônimo              | anônimo lê dog_identifiers (microchip)                                  | 0 linhas ou erro de permissão          | erro 42501: permission denied for table dog_identifiers                                             | **PASS** |
| 4. Anônimo              | anônimo tenta INSERT em dogs                                            | erro de permissão                      | erro 42501: permission denied for table dogs                                                        | **PASS** |
| 5. Storage              | B grava no PRÓPRIO prefixo (controle: precisa funcionar)                | sucesso                                | sucesso                                                                                             | **PASS** |
| 5. Storage              | B grava no prefixo de A                                                 | erro de permissão                      | erro: new row violates row-level security policy                                                    | **PASS** |
| 5. Storage              | B lista o prefixo de A                                                  | vazio ou erro                          | 0 objeto(s)                                                                                         | **PASS** |
| 5. Storage              | B baixa arquivo de A                                                    | erro de permissão                      | erro: Object not found                                                                              | **PASS** |
| 5. Storage              | anônimo baixa arquivo de A                                              | erro de permissão                      | erro: Object not found                                                                              | **PASS** |
| 6. Admin                | usuário comum se promove a admin                                        | erro de permissão de coluna            | erro 42501: permission denied for table profiles                                                    | **PASS** |
| 6. Admin                | usuário comum edita o perfil de outro                                   | 0 linhas afetadas                      | 0 linha(s)                                                                                          | **PASS** |
| 6. Admin                | usuário comum chama private.is_admin() via RPC                          | erro — schema private não é exposto    | erro: Could not find the function public.is_admin without parameters in the schema cache            | **PASS** |
| 6. Admin                | usuário comum chama função de trigger via RPC                           | erro — EXECUTE revogado                | erro: Could not find the function public.dogs_check_ancestry without parameters in the schema cache | **PASS** |
| 6. Admin                | papel de B no banco após as tentativas                                  | user                                   | user                                                                                                | **PASS** |
| 7. Criação de conta     | conta criada com user_metadata.role = 'admin'                           | profile nasce com role = 'user'        | role = user                                                                                         | **PASS** |
| 7. Criação de conta     | conta em formato OAuth (name/picture) gera profile preenchido           | full_name e avatar_url preenchidos     | full_name = Fulano do Google, avatar_url = preenchido                                               | **PASS** |
| 7. Criação de conta     | conta em formato OAuth nasce como usuário comum                         | role = 'user'                          | role = user                                                                                         | **PASS** |
| 8. CRUD de canil        | A exclui o próprio canil (lógico)                                       | 1 linha marcada                        | 1 linha(s)                                                                                          | **PASS** |
| 8. CRUD de canil        | linha continua na tabela — exclusão é lógica, nunca física              | linha existe com deleted_at preenchido | existe, deleted_at preenchido                                                                       | **PASS** |
| 8. CRUD de canil        | anônimo lê canil excluído logicamente                                   | 0 linhas                               | 0 linha(s)                                                                                          | **PASS** |
| 8. CRUD de canil        | B tenta reusar o endereço de um canil excluído de A                     | erro — slug fica reservado para sempre | erro 23505: duplicate key value violates unique constraint "kennels_slug_key"                       | **PASS** |
