# Banco

## Estado atual: migrations NÃO APLICADAS E NÃO VERIFICADAS

Não há Supabase local (sem Docker) e não há projeto linkado neste repositório.
As migrations em `migrations/` foram escritas e revisadas, mas **nunca foram
executadas contra um Postgres**. Nenhuma linha de SQL aqui tem prova de que
sequer compila.

Antes de considerar o schema pronto, é preciso linkar um projeto de
desenvolvimento e rodar a bateria abaixo.

```bash
supabase login
supabase link --project-ref <ref-do-projeto-de-DESENVOLVIMENTO>
npm run db:push
npm run db:types
```

> Nunca apontar `db push` ou `db reset` para o projeto do cliente sem
> confirmação explícita. Ver a seção AMBIENTE do `CLAUDE.md`.

## Bateria de verificação

Depois do primeiro `db push`, rodar cada caso abaixo. Os seis primeiros **devem
falhar** — se algum passar, a invariante correspondente não está protegida.

| #   | Caso                                                          | Esperado                                     |
| --- | ------------------------------------------------------------- | -------------------------------------------- |
| 1   | cão como pai de si mesmo (`sire_id = id`)                     | erro — CHECK `dogs_not_own_sire`             |
| 2   | `sire_id = dam_id`                                            | erro — CHECK `dogs_sire_dam_distinct`        |
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
