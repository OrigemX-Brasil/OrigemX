# Módulos por domínio

Um diretório por domínio. Cada um agrupa tudo que pertence àquele conceito, em
vez de espalhar por camadas técnicas (`components/`, `hooks/`, `services/` na
raiz). Quem for mexer em canil abre `kennels/` e encontra tudo.

```
modules/
  profiles/    perfil do criador
  kennels/     canil
  dogs/        cão — identidade canônica
  media/       upload, redimensionamento e publicação de imagem
  pedigree/    montagem e render da árvore de 5 gerações
  qr/          QR Code do cão e do canil
  alerts/      alertas in-app baseados em regras (Anexo I.8)
  capture/     página de captura e sua medição (Anexo I.11)
  public/      consultas e metadata das páginas abertas
  auth/        sessão, login e proteção de rota
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

**`alerts/` também não tem tabela, e por decisão.** Um alerta é uma afirmação
sobre o dado de agora; guardado, vira segunda fonte de verdade que fica velha no
instante em que o criador sobe o logo, e manter os dois em dia exigiria
recálculo em background — fila é FORA DE ESCOPO. Derivando, a autorização vem de
graça: só nasce alerta de linha que a RLS já deixou o usuário ler.

O catálogo de regras vive em [`alerts/rules.ts`](alerts/rules.ts) e é **o único
arquivo que o cliente precisa abrir** para trocar texto, mudar prioridade
(reordenando o array), desligar um aviso ou ajustar um limite.
[`alerts/engine.ts`](alerts/engine.ts) não conhece nenhuma regra — se ajustar
uma exigir tocar no motor, a separação falhou.

Alerta **não bloqueia** nada: não existe severidade "erro", e nenhum fluxo de
gravação consulta o catálogo. E **não existe campo de canal** — in-app apenas,
porque e-mail, push, WhatsApp e SMS são FORA DE ESCOPO por contrato.

**`capture/` não guarda dado pessoal, e é o que define o módulo.** Sem IP, user
agent, cookie ou id de usuário — a conversão é agregada por origem, não ligada a
pessoas. Ver `supabase/README.md`.

A página de captura (`src/app/page.tsx`) **precisa continuar estática**: é o que
alguém vê depois de escanear um QR numa feira, com 4G disputado. Nada de
`searchParams`, `headers()` ou `cookies()` nela — qualquer um dos três a torna
dinâmica e joga fora o cache de borda. A medição acontece por `<img>`, e a
campanha é recuperada no `/cadastro`, que é dinâmico de propósito.
