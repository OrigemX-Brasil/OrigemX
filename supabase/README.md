# Banco

## Estado atual: VERIFICADO em projeto de desenvolvimento

Aplicado e verificado em 2026-07-31 contra o projeto de desenvolvimento
`lcqhnfdsrioufwvnrqnt` (Postgres 17.6).

| Verificação                                                       | Resultado                    |
| ----------------------------------------------------------------- | ---------------------------- |
| `db reset --linked` — aplicação do zero, em banco vazio, na ordem | sem erro                     |
| `db advisors --linked --type security`                            | `results: []` — zero alertas |
| Bateria de 21 casos (`tests/battery.sql`)                         | **21 PASS, 0 FAIL**          |
| `db push` incremental em banco vazio                              | sem erro                     |

Não há Supabase local neste ambiente (sem Docker) — ver a seção AMBIENTE do
`CLAUDE.md`. Toda verificação roda contra o projeto de desenvolvimento.

```bash
npm run db:push     # aplica migrations pendentes no projeto linkado
npm run db:types    # regenera src/lib/types/database.ts
npx supabase db query --linked --file supabase/tests/battery.sql
npx supabase db advisors --linked --type security
```

> Nunca apontar `db push` ou `db reset` para o projeto do cliente sem
> confirmação explícita. `db reset` APAGA o banco inteiro.

## Bateria de verificação

`tests/battery.sql` roda os 21 casos numa transação, imprime PASS/FAIL e limpa
as próprias fixtures. Casos que **devem falhar** rodam dentro de bloco com
`EXCEPTION`: um caso que não levante erro é marcado FAIL em vez de derrubar a
execução.

### Armadilha do simulador de identidade

`request.jwt.claims` tem escopo de **transação**. Ela sobrevive ao fim do bloco
e ao `reset role` — então `set local role anon` **não** torna a sessão anônima:
ela continua carregando a identidade do último usuário autenticado, e
`can_manage_dog()` a autoriza.

Isso já produziu um falso positivo aqui (o caso 18 "passou" sendo u1 disfarçado
de anônimo). Por isso todo bloco define papel **e** claims, e registra qual
identidade estava valendo — um contexto errado aparece no relatório em vez de
virar PASS silencioso.

### Os casos

| #   | Caso                                                          | Esperado                                     |
| --- | ------------------------------------------------------------- | -------------------------------------------- |
| 1   | cão como pai de si mesmo (`sire_id = id`)                     | erro — trigger de ciclo (ver nota)           |
| 2   | `sire_id = dam_id`                                            | erro — validação de sexo (ver nota)          |
| 3   | ciclo indireto: A pai de B, B pai de C, então C como pai de A | erro — trigger `dogs_check_ancestry`         |
| 4   | fêmea em `sire_id`                                            | erro — trigger `dogs_check_ancestry`         |
| 5   | `update dogs set public_id = '...'`                           | erro — trigger `dogs_freeze_public_id`       |
| 6   | mesmo microchip em dois cães                                  | erro — índice `dog_identifiers_microchip_uk` |
| 7   | **linebreeding**: mesmo ancestral por dois caminhos           | **deve passar** — é legítimo                 |

E os testes de autorização, com um usuário comum autenticado:

| #   | Caso                                                                   | Esperado                               |
| --- | ---------------------------------------------------------------------- | -------------------------------------- |
| 8   | `update kennels` de outra pessoa                                       | 0 linhas afetadas                      |
| 9   | `update profiles set role = 'admin'` no próprio perfil                 | erro de permissão de coluna            |
| 10  | `select` em `dog_identifiers` de cão de terceiro                       | 0 linhas                               |
| 11  | mover cão para o canil de outra pessoa via `update dogs set kennel_id` | 0 linhas                               |
| 12  | `delete` em qualquer tabela                                            | erro de permissão — exclusão é lógica  |
| 13  | anônimo lendo canil ou cão com `published_at is null`                  | 0 linhas                               |
| 14  | dono lendo o próprio rascunho (`published_at is null`)                 | **deve retornar** — senão não edita    |
| 15  | dois cães `slug='rex'` em **canis diferentes**                         | **deve passar** — único por canil      |
| 16  | dois cães `slug='rex'` no **mesmo** canil                              | erro — `dogs_kennel_slug_key`          |
| 17  | `slug` preenchido com `kennel_id` nulo                                 | erro — `dogs_slug_requires_kennel`     |
| 18  | anônimo lendo fantasma (`owner_id` e `kennel_id` nulos, não publicado) | **deve retornar** — é nó de árvore     |
| 19  | anônimo lendo cão COM canil, sem dono, não publicado                   | 0 linhas — é rascunho, não fantasma    |
| 20  | `delete` físico de canil que tem cães                                  | erro — FK RESTRICT em `dogs.kennel_id` |

Por fim, `supabase db advisors --linked` deve sair sem alertas de segurança.

### Nota sobre os casos 1 e 2 — dois CHECKs são inalcançáveis

Os CHECKs `dogs_not_own_sire`, `dogs_not_own_dam` e `dogs_sire_dam_distinct`
existem no banco, mas **não são eles que barram** os casos 1 e 2. Trigger BEFORE
roda antes da validação de CHECK, e:

- caso 1: a CTE de ciclo já encontra o próprio cão entre os ancestrais;
- caso 2: para `sire_id = dam_id` chegar ao CHECK, o mesmo cão teria de ser
  macho **e** fêmea — a validação de sexo barra antes, sempre.

Ou seja, os três CHECKs são **defesa em profundidade**: inalcançáveis enquanto
os triggers existirem, e a rede que sobra se um trigger for removido um dia. Os
casos 1 e 2 provam que a operação é bloqueada, não qual mecanismo bloqueou.

## Evidência de RLS pela API — `npm run test:rls`

A bateria SQL acima roda dentro do banco, como `postgres`. Isso deixa um ponto
cego: `postgres` ignora RLS, então ela verifica as políticas mas não o caminho
real de um cliente.

`scripts/test-rls.mts` fecha esse buraco. Usa `supabase-js` com dois usuários
reais e um cliente anônimo, falando com a API REST pela chave publishable — a
mesma porta que um atacante usaria. A chave secreta só cria e destrói fixtures,
nunca prova acesso. Sai com código != 0 se qualquer cenário falhar e escreve
`reports/rls-report.md`, que é o documento de homologação.

**Rode nas duas camadas.** A diferença entre elas já encontrou um bug que a
bateria SQL não podia encontrar: `dogs_select` chamava
`private.can_manage_dog(id)`, que reconsulta `dogs` pelo id — num
`INSERT ... RETURNING`, que é o que a API sempre emite, a linha nova ainda não
está no snapshot da função, então a policy negava e **criar cão em rascunho era
impossível pela API**. Inserindo como `postgres`, a bateria SQL passava.

Por isso as policies de `dogs` decidem posse pelas **colunas da própria linha**
(`owner_id`, `created_by`) e só usam função para o pulo em outra tabela
(`private.owns_kennel`). `private.can_manage_dog` continua válida para
`dog_identifiers`, que consulta `dogs` — uma tabela diferente da sua.

## Advisors de segurança — dois WARN aceitos, com motivo

`db advisors --type security` sai com dois alertas depois que a autenticação
entrou. Nenhum é regressão de schema; os dois são configuração de auth.

**`auth_leaked_password_protection`** — a checagem contra o HaveIBeenPwned está
desligada. Não é esquecimento: o recurso é **gated no plano Pro**
(`entitlementKey: auth.password_hibp`) e não existe chave para ele no
`config.toml` — é ajuste de painel/API. Enquanto o projeto for Free, não há como
ligar. Vai para a checklist do cliente.

O que dá para fazer sem plano pago já está feito: `minimum_password_length = 8`
(acima do mínimo 6 do Supabase), imposto pelo servidor de Auth e não só pelo
formulário.

**`auth_insufficient_mfa_options`** — MFA está **fora do escopo** do Anexo I.2.
Aceito conscientemente; entra quando for contratado.

## Precisa de confirmação do cliente

### Visibilidade do ancestral fantasma

**Regra implementada:** cão sem dono **e** sem canil (`owner_id is null and
kennel_id is null`) é legível publicamente mesmo sem `published_at`. Cão com
dono e não publicado permanece invisível, e a tela de pedigree renderiza a
posição como "não publicado", sem link.

A premissa é que o fantasma existe só para ser nó de árvore e não carrega dado
privado. Isso precisa ser confirmado **junto com a definição de quais campos são
públicos** — se o cliente decidir que algum campo do cão é sensível (por
exemplo, dados do criador de origem ou histórico de transferência), a premissa
cai e a policy `dogs_select` tem de ser reapertada.

Enquanto não houver essa definição, nada além dos campos hoje existentes em
`dogs` deve ser considerado público.

### Ponto aberto: hard delete de perfil

`dogs.owner_id` é `ON DELETE SET NULL`, e `profiles.id` cascateia de
`auth.users`. Então apagar uma conta transforma em `NULL` o `owner_id` dos cães
daquela pessoa. Um cão que tenha ficado **sem dono e sem canil** passa a se
encaixar na regra de fantasma acima e vira publicamente legível, mesmo que
estivesse como rascunho.

Não foi alterado porque a correção óbvia — `ON DELETE RESTRICT`, como em
`kennel_id` — impediria apagar a conta de quem tem cães cadastrados, o que
conflita com pedido de exclusão de dados. A decisão é de produto: o que acontece
com os cães quando o criador apaga a conta.

## Pendente para a próxima migration

### Número do fundador

Vai em **`kennels.founder_number int unique null`**, alimentado por uma
`SEQUENCE` dedicada (`kennels_founder_number_seq`).

Mora em `kennels` e não em `profiles` porque o número é distintivo do **canil**
— é ele que tem página pública, e é nela que o selo aparece. Um criador com dois
canis teria dois números, o que é o comportamento correto.

Três detalhes que precisam estar certos quando entrar:

- **`null`, não `not null`**: o número é dos primeiros N canis. Quem chegar
  depois fica sem, e sem não é zero.
- **Nunca `identity` nem `serial`**: os dois atribuem valor a toda linha, o que
  daria número de fundador a todo mundo. A sequence é chamada explicitamente,
  só quando a regra de corte permitir.
- **`unique`**: dois canis com o mesmo número destroem o sentido do selo.

A regra de corte (quantos fundadores, até quando) é decisão de produto e ainda
não foi definida.

## Pontos que merecem atenção na revisão

- **`extensions` schema** — `pg_trgm` é instalada em `extensions`, convenção do
  Supabase. Em um Postgres avulso esse schema não existe.
- **Colisão de `public_id`** — não há retry. 31^12 torna a chance desprezível e
  o índice único transforma a colisão em erro, não em dado errado. Se o volume
  justificar, o retry entra depois.
- **Escopo dos slugs** — `kennels.slug` é único **globalmente**;
  `dogs.slug` é único **por canil** e é opcional (nulo em ancestral fantasma).
  Nenhum dos dois é parcial por `deleted_at`, de propósito: slug reaproveitado
  faria uma URL já compartilhada resolver para outro registro. O QR não depende
  de slug — ele aponta para `dogs.public_id`, que é imutável.
