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

| #   | Caso                                                                   | Esperado                              |
| --- | ---------------------------------------------------------------------- | ------------------------------------- |
| 8   | `update kennels` de outra pessoa                                       | 0 linhas afetadas                     |
| 9   | `update profiles set role = 'admin'` no próprio perfil                 | erro de permissão de coluna           |
| 10  | `select` em `dog_identifiers` de cão de terceiro                       | 0 linhas                              |
| 11  | mover cão para o canil de outra pessoa via `update dogs set kennel_id` | 0 linhas                              |
| 12  | `delete` em qualquer tabela                                            | erro de permissão — exclusão é lógica |

Por fim, `supabase db advisors --linked` deve sair sem alertas de segurança.

## Pontos que merecem atenção na revisão

- **`extensions` schema** — `pg_trgm` é instalada em `extensions`, convenção do
  Supabase. Em um Postgres avulso esse schema não existe.
- **Colisão de `public_id`** — não há retry. 31^12 torna a chance desprezível e
  o índice único transforma a colisão em erro, não em dado errado. Se o volume
  justificar, o retry entra depois.
- **Slug global** — `dogs.slug` e `kennels.slug` são únicos globalmente,
  inclusive contra linhas com `deleted_at`. É deliberado: slug reaproveitado
  faria QR impresso resolver para o registro errado. A aplicação precisa gerar
  slug com desambiguação.
