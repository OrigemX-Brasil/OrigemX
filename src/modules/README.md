# Módulos por domínio

Um diretório por domínio. Cada um agrupa tudo que pertence àquele conceito, em
vez de espalhar por camadas técnicas (`components/`, `hooks/`, `services/` na
raiz). Quem for mexer em canil abre `kennels/` e encontra tudo.

```
modules/
  profiles/    perfil do criador
  kennels/     canil
  dogs/        cão — identidade canônica
  pedigree/    montagem e render da árvore de 5 gerações
```

Dentro de cada módulo:

| Arquivo       | Papel                                                             |
| ------------- | ----------------------------------------------------------------- |
| `queries.ts`  | **Todo** acesso a dados do domínio. Nada de `.from()` fora daqui. |
| `types.ts`    | Tipos de domínio derivados de `@/lib/types/database`.             |
| `components/` | UI do domínio.                                                    |

## Regras

**Listagem sempre paginada.** Toda função de lista em `queries.ts` recebe
`PageParams` e passa por `resolveLimit()` de [`@/lib/pagination`](../lib/pagination.ts).
Não existe `select()` de lista sem `.limit()` — é invariante do projeto, e
concentrar o acesso aqui é o que torna a regra verificável por leitura.

**Autorização não mora aqui.** Quem decide o que o usuário vê é a RLS, em
`supabase/migrations/`. Filtro em `queries.ts` é para a _consulta_ estar certa,
nunca para _proteger_ dado.

**`pedigree/` não tem tabela.** Ele monta a árvore percorrendo `dogs.sire_id` /
`dogs.dam_id` recursivamente. Renderiza por **caminho**, não por nó: em
linebreeding o mesmo ancestral aparece legitimamente em várias posições, e
deduplicar por id apagaria a informação que o criador quer justamente ver.
