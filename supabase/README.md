# Banco

## Estado atual: VERIFICADO em projeto de desenvolvimento

Aplicado e verificado contra o projeto de desenvolvimento
`lcqhnfdsrioufwvnrqnt` (Postgres 17.6). Última verificação: 2026-08-03.

| Verificação                                                       | Resultado                            |
| ----------------------------------------------------------------- | ------------------------------------ |
| `db reset --linked` — aplicação do zero, em banco vazio, na ordem | sem erro (2026-07-31)                |
| Bateria SQL (`tests/battery.sql`)                                 | **27 PASS, 0 FAIL**                  |
| Evidência pela API (`npm run test:rls`)                           | **59 PASS, 0 FAIL**                  |
| `db advisors --linked --type security`                            | 7 WARN, todos aceitos e justificados |
| `db push` incremental                                             | sem erro                             |

Os 7 WARN estão explicados um a um em "Advisors de segurança", abaixo: dois são
configuração de auth (HaveIBeenPwned, MFA) e cinco são `SECURITY DEFINER`
deliberados. **Nenhum é alerta de schema ou de RLS.**

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

`tests/battery.sql` roda os 27 casos numa transação, imprime PASS/FAIL e limpa
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

E o selo Criador Fundador, que tem seção própria mais abaixo:

| #   | Caso                                        | Esperado                              |
| --- | ------------------------------------------- | ------------------------------------- |
| 0   | `handle_new_user` cria `profiles` no signup | perfil criado com `role = 'user'`     |
| 21  | canil incompleto                            | sem número, e a sequence NÃO avança   |
| 22  | canil completo                              | número entre 1 e 100, pelo trigger    |
| 23  | `update` de `founder_number` já atribuído   | erro — trigger de imutabilidade       |
| 24  | re-disparo em canil que já tem selo         | mesmo número, e a sequence NÃO avança |
| 25  | exclusão lógica de canil com selo           | número permanece na linha             |
| 26  | pool esgotado: 101º canil elegível          | sem selo, e o cadastro **não quebra** |

E a posse do canil. A bateria roda como superusuário, então a RLS é ignorada —
o índice único **não** é, e é por isso que estes casos medem o mecanismo real:

| #   | Caso                                              | Esperado                                        |
| --- | ------------------------------------------------- | ----------------------------------------------- |
| 27  | segundo canil vivo para o mesmo dono, slug novo   | erro — `kennels_owner_uk`                       |
| 28  | novo canil depois de excluir logicamente o antigo | sucesso — a exclusão libera a vaga              |
| 29  | reverter a exclusão tendo outro canil vivo        | erro — o índice cobre o UPDATE, não só o INSERT |

Por fim, `supabase db advisors --linked` deve sair apenas com os sete WARN
listados em "Advisors de segurança" — qualquer alerta além desses é regressão.

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

## Advisors de segurança — sete WARN aceitos, com motivo

`db advisors --type security` sai com sete alertas. Nenhum é regressão de schema
ou de RLS: dois são configuração de auth e cinco são funções `SECURITY DEFINER`
deliberadas (`dog_pedigree`, `dog_descendant_ids` e `record_landing_event`).

**`record_landing_event`** é `SECURITY DEFINER` executável por `anon`
justamente para a aplicação NÃO precisar da chave secreta — ver "Página de
captura". Ela só insere contagem anônima, com forma fixa e tamanho cortado, e
recusa em silêncio o que não for `view` ou `signup`. Não lê nada e não devolve
nada.

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

**`authenticated_security_definer_function_executable` → `dog_descendant_ids`** —
aceito e necessário. A função é `SECURITY DEFINER` para percorrer a árvore
inteira, inclusive por cães que a RLS do usuário esconderia: um descendente
invisível seria oferecido como pai ou mãe e o ciclo só apareceria no erro do
banco. Devolve **apenas ids**, nunca colunas, e qualquer `SELECT` feito com
esses ids continua passando pela RLS.

**`anon_` e `authenticated_security_definer_function_executable` → `dog_pedigree`**
— os dois WARN mais recentes, aceitos, e aqui o `anon` é **de propósito**: a
página do QR é anônima por construção, então quem chama a função é justamente
quem não fez login.

A função é `SECURITY DEFINER` porque a árvore precisa ser percorrida INTEIRA. Se
rodasse com a RLS do visitante, um bisavô que é rascunho de outro criador
truncaria o galho e todos os ancestrais acima dele desapareceriam — o pedigree
pararia no meio, sem explicação e sem o usuário saber que faltou algo.

O que ela devolve para cão restrito é **nome e posição, e nada mais**: `public_id`,
sexo, raça, nascimento e canil saem `NULL`, decididos campo a campo dentro da
própria função por `dog_is_public`, e não na tela. Sem `public_id` não há sequer
URL construível. A profundidade é travada no corpo em 5 gerações, então o
parâmetro não serve para varrer o banco: no máximo 63 linhas por chamada, todas
alcançáveis a partir de um cão que o chamador já conhece.

A visibilidade do nome é decisão de produto e está registrada em "Precisa de
confirmação do cliente", abaixo.

O acesso de `anon` a `dog_descendant_ids` **foi fechado** na migration
`20260802225046_revoke_dog_descendants_from_anon.sql`. O grant explícito a
`authenticated` não bastava: função em `public` nasce com `EXECUTE` para
`PUBLIC`, e `anon` herda daí. Enquanto esteve aberto, um visitante anônimo podia
enumerar os ids de descendentes de qualquer cão, inclusive de rascunhos.

## Selo Criador Fundador — atomicidade e limite no mesmo mecanismo

100 canis, numerados de 1 a 100, atribuídos na ordem em que se tornam elegíveis.

A abordagem ingênua tem corrida clássica: `if count < 100 then assign count+1`.
Duas transações leem 99 juntas e saem 100 e 101, ou o mesmo número duas vezes.
O defeito é **ler e depois escrever**.

A `sequence kennel_founder_seq` elimina a janela porque não há leitura prévia:

- `nextval` é atômico e nunca repete valor, mesmo com N transações simultâneas;
- `maxvalue 100 no cycle` faz a 101ª chamada levantar `2200H`
  (`sequence_generator_limit_exceeded`) — **verificado neste Postgres**, não
  suposto.

O objeto que distribui os números é o mesmo que se recusa a distribuir o 101º.

**Custo declarado:** `nextval` não é transacional. Um rollback não devolve o
número, então o pool poderia render 99 selos. Por isso `nextval` é a última
operação da função, depois da trava de linha, da checagem de "já tem" e da
elegibilidade — sobra só um `UPDATE` por chave primária, que não viola
constraint.

**Duas camadas contra o usuário escolher o próprio número:**

1. `GRANT UPDATE` **por coluna** em `kennels` — `founder_number` fica fora da
   lista, e o Postgres recusa antes da policy. É a que impede `NULL → 1`.
2. Trigger de imutabilidade — bloqueia `valor → qualquer coisa`. Não cobre
   `NULL → valor`, porque esse é o caminho legítimo da atribuição.

### Reset em desenvolvimento

`npm run test:rls` prova a concorrência, e provar isso **consome números reais**
— `nextval` não volta atrás nem no rollback nem no DELETE das fixtures.
`npm run db:founder-reset` devolve a sequence ao início. O script recusa rodar
se houver selo em canil que não seja fixture, como salvaguarda contra apontar
para o projeto errado.

## Mídia pública: dois buckets, move e a janela do CDN

**Decidido e implementado:** bucket separado `kennel-media-public`, e o objeto é
**MOVIDO** na publicação — nunca copiado, senão todo conteúdo publicado ocuparia
plano duas vezes.

O move é feito com a **sessão do usuário**, não com a chave secreta: mover entre
buckets é DELETE na origem + INSERT no destino, e as policies dão os dois ao dono
no próprio prefixo. A RLS continua no circuito.

### Ordem das operações — é a regra de segurança

**Publicar:** move primeiro, publica depois. Se o move falhar, **não publica**.
Entidade publicada com mídia privada é o pior estado: a página cacheada não pode
usar URL assinada, então a imagem quebraria de forma permanente.

**Despublicar:** despublica primeiro, move depois. O passo que importa para
privacidade é a página sumir, e ele não pode ficar refém do Storage. Na ordem
inversa, um move com erro deixaria a entidade inteiramente pública.

### A janela do CDN, que nenhum código elimina

Despublicar remove o objeto do bucket público **na hora**, mas o CDN continua
servindo a cópia em cache até o `Cache-Control` vencer.

Por isso o upload grava **`cacheControl: 3600`**, e não "imutável": o _conteúdo_
é imutável — o caminho tem uuid e o arquivo nunca muda — mas a _autorização_
para vê-lo não é. Uma hora limita a janela e ainda dá taxa de acerto altíssima
no cenário que importa, milhares de leituras de QR ao longo de uma feira.

Isto foi descoberto pelo `test:rls`, que media o CDN e via HTTP 200 depois do
move. O teste passou a medir o **Storage**, que é a fonte da verdade, e a janela
virou comportamento documentado e comunicado ao usuário na tela de publicação.

### Reconciliação

`media.bucket_id` e a localização real do arquivo podem divergir: o par "mover"

- "gravar a linha" não é atômico. `reconcileMediaBucket` é idempotente e roda em
  todo publish/unpublish.

`npm run media:reconcile` varre **tudo** e relata; com `--apply`, corrige.
Existe porque a reconciliação sob demanda não basta: uma linha que caísse no
meio de um move só seria consertada no próximo publish daquele canil. É o
comando para rodar antes de um evento.

Classifica três estados: em ordem, **divergente** (arquivo num bucket, linha
dizendo outro — corrige) e **órfã** (arquivo em bucket nenhum — só relata, porque
apagar metadata é decisão humana).

## Auditoria de performance — o que ela achou

Rodada antes do teste de carga, com **45.000 cães semeados** no projeto de
desenvolvimento. O volume não é detalhe: com 59 linhas todo plano é seq scan, e
está certo — varrer 59 linhas é mais barato que abrir índice. Conclusão tirada
daquele tamanho é chute.

```bash
npm run seed:load         # semeia 45k caes em 8 camadas + ANALYZE
npm run seed:load-clean   # remove (DELETE fisico de fixture, ver o arquivo)
```

O `ANALYZE` no fim é obrigatório: sem estatística fresca o planner continua
achando que a tabela é pequena e todo `EXPLAIN` seguinte é ficção.

### O achado que valeu a auditoria

`listPublicDogsOfKennel` levava **1227 ms** para devolver 48 linhas. O índice
`dogs_kennel_published_idx` existia para ela, mas ordenava por `published_at` e
a consulta ordena por `created_at` — ordenação diferente, índice inútil para o
`ORDER BY`. O planner caía no índice de `created_at` e descartava 3.492 linhas
no heap.

Corrigido na migration `20260804022015_perf_indexes`: mesma ordenação da
consulta, parcial só nos publicados. **1227 ms → 2,9 ms**, buffers de 3571 para 49.

### O que NÃO era problema

O `Seq Scan on dogs` dentro da CTE recursiva do pedigree assusta e é correto: a
59 linhas custa 2,54. Com 45 mil, o planner trocou sozinho para
`Index Scan using dogs_pkey`, sem nenhuma mudança de código, e a RPC completa de
5 gerações ficou em **30 ms**. Não mexer.

### Índices verificados

Zero FKs sem índice (consulta em `pg_constraint` × `pg_index`). O índice
trigram de nome é usado por `ILIKE` quando não há predicado mais barato.

## Página de captura — medição sem dado pessoal

Anexo I.11. A tabela `landing_events` conta acessos e conversões, e o desenho
inteiro parte de uma restrição: **não guardar nada que identifique uma pessoa.**
Sem IP, sem user agent, sem cookie, sem id de sessão, sem id de usuário. Uma
linha diz "houve um acesso desta origem, neste caminho, nesta hora" e nada mais.

Isso custa a atribuição individual — não dá para dizer que _aquele_ visitante
virou _aquele_ cadastro — e economiza duas coisas: o banner de consentimento,
que atrasaria justamente a página que precisa abrir rápido em 4G de feira, e a
responsabilidade de guardar dado pessoal de milhares de pessoas que só
escanearam um QR. A conversão sai em **agregado**: acessos de uma origem contra
cadastros da mesma origem.

**Escrita não passa pela API.** Nem `anon` nem `authenticated` têm INSERT; a
única porta é `public.record_landing_event`, `SECURITY DEFINER`, que fixa a forma
do que entra e corta tamanho. Assim a aplicação nunca precisa da chave secreta —
uma chave que bypassa RLS dentro do runtime do site seria risco permanente.
**Leitura só para admin:** número de acesso é dado de negócio do cliente.

**Como o acesso é contado:** um `<img>` de 42 bytes na página de captura. A
landing precisa continuar estática para vir do CDN, e página estática não executa
nada por visita — o pixel resolve isso sem uma linha de JavaScript. A campanha
vem do `Referer`, porque o HTML é idêntico para todo mundo e a URL do pixel não
pode carregar o `?de=`.

```bash
npm run metrics              # últimos 30 dias
npm run metrics -- --dias 7
npm run metrics -- --json
```

O script existe porque o painel administrativo é item separado do contrato e
ainda não foi feito. Quando existir, lê a mesma tabela.

**Robô é descartado antes de virar linha.** O user agent é lido e jogado fora.
A lista cobre buscadores, prévia de link de chat (o WhatsApp dispara toda vez que
alguém cola a URL numa conversa) e runtimes de linguagem — este último entrou
depois de o teste ponta a ponta flagrar que o `fetch` do Node passava como
visitante de verdade.

## QR Code — o único artefato que não dá para corrigir depois

O QR vai para crachá, folder e placa de estande. Quando o criador troca o nome do
cão, o papel já está na mão de alguém. Por isso duas decisões são de banco, não
de interface:

- **cão → `/d/{public_id}`** — `public_id` é imutável, e não por convenção: o
  trigger `dogs_freeze_public_id` recusa qualquer UPDATE. É impossível quebrar
  pela aplicação.
- **canil → `/c/{slug}`** — único global, e **não é liberado nem por exclusão
  lógica**, justamente para o QR impresso não passar a resolver outro canil.

A rota de download recebe o **uuid interno** e busca o identificador estável no
banco. A inversão é de propósito: nada que vem da requisição entra no conteúdo
codificado, então a rota não vira gerador de QR de conteúdo arbitrário hospedado
no nosso domínio. O chamador escolhe QUAL registro, nunca PARA ONDE aponta.

**Correção de erro H (30%)**, medido: com a URL do cão, H dá versão 5 (37×37
módulos); M daria versão 3 (29×29). Com a zona de silêncio, 45 módulos de
largura — daí sai o **mínimo de 3 cm impressos**, que está escrito na tela do
painel. Abaixo disso o módulo fica sob 0,5 mm e câmera ruim erra.

**O aviso que evita prejuízo:** enquanto `NEXT_PUBLIC_SITE_URL` for localhost ou
rede privada, o cartão mostra em vermelho que aquele QR não serve para
impressão. Sem isso é perfeitamente possível mandar 500 crachás para a gráfica
apontando para `http://localhost:3000`.

Verificado ponta a ponta com sessão real: PNG e SVG para cão e canil, tamanho
absurdo preso no teto, `kind` inválido e id não-uuid em 400, registro inexistente
em 404 — e **cão de outra pessoa em 404 pela RLS**, não por checagem de tela.

## Pedigree de 5 gerações — uma query, numerada por posição

`public.dog_pedigree(dog_id, generations)` devolve a árvore inteira numa CTE
recursiva. Nunca N+1: 62 ancestrais seriam 62 idas ao banco por acesso, e esta é
a página que abre em 4G no meio de uma feira.

**A numeração é Ahnentafel** (Sosa-Stradonitz): o sujeito é 1, o pai de N é 2N e
a mãe de N é 2N+1. Gerações 1 a 5 ocupam as posições 2 a 63.

Isso resolve de graça a invariante "pedigree renderiza por CAMINHO, não por nó":
o binário da posição **é** a sequência de viradas pai/mãe, então a chave da linha
é a posição e o `dog_id` é só um atributo dela. Ancestral repetido por
linebreeding volta em várias posições e é desenhado várias vezes sem nenhum
código especial — e a numeração ainda serve de rótulo legível ("posição 11 =
`1011` = mãe da mãe do pai"), que é o que a interface mostra.

**`UNION ALL`, e aqui é o oposto do trigger de ciclo.** Em `dogs_check_ancestry`
o `UNION` deduplica, e é justamente a deduplicação que faz a recursão terminar
com linebreeding. Aqui queremos a repetição, então a terminação vem do limite de
profundidade — travado no corpo da função, não confiando no parâmetro.

`dog_is_public(deleted_at, published_at, owner_id, kennel_id)` é a **fonte única**
da regra de visibilidade: a mesma função decide a policy `dogs_select` e os
campos que o pedigree devolve. Antes ela era uma expressão escrita duas vezes, e
duplicar regra de visibilidade é como um vazamento nasce seis meses depois.

### Evidência de que a reescrita da policy não mudou comportamento

`dogs_select` foi reescrita para chamar o helper. Como é caminho crítico, o
comportamento foi capturado caso a caso antes e depois:

| Arquivo                             | O que é                                     |
| ----------------------------------- | ------------------------------------------- |
| `reports/baseline-pre-pedigree.md`  | os 86 casos ANTES da reescrita              |
| `reports/baseline-post-pedigree.md` | comparativo caso a caso: **0 divergências** |

A comparação olha o **texto do resultado** de cada caso, não o placar — um caso
que saísse de "0 linhas" para "erro de permissão" continuaria PASS e teria
mudado de comportamento. Os dois arquivos vão para a homologação junto do
relatório de RLS.

```bash
npm run evidence:baseline   # captura o antes
npm run evidence:compare    # captura o depois e compara
```

### Linhagem de demonstração

```bash
npm run seed:pedigree
```

Cria em DESENVOLVIMENTO uma árvore de 5 gerações que exercita de uma vez os
quatro casos que importam: profundidade cheia, lacuna assimétrica, galho curto e
quatro ancestrais repetidos. São todos fantasmas (sem dono, sem canil), então não
encostam em nenhum dado de teste existente. O script é idempotente e traz a
instrução de limpeza por exclusão lógica no cabeçalho.

## Decisão anterior, agora resolvida

Hoje o bucket `kennel-media` é privado e a entrega usa **URL assinada com 1h**.
Serve para tela autenticada e não serve para perfil público: URL assinada expira,
o que quebra cache/ISR e quebra QR impresso, que vive meses.

Os dois caminhos possíveis, e o que já está preparado para os dois:

**(a) Bucket público separado só para mídia de registro publicado.** Publicar
**move** o objeto do bucket privado para o público; despublicar move de volta.
Mover e não copiar, senão o mesmo arquivo ocupa plano duas vezes — e
armazenamento é justamente o limite que estoura primeiro.

**(b) Rota de proxy no servidor** que valida publicação e serve com cache.

Preparação já feita, que mantém os dois viáveis sem retrabalho:

- `media.bucket_id` é **coluna**, não constante no código;
- **nenhum componente monta URL**: tudo passa por `resolveMediaUrls`, em
  `src/modules/media/queries.ts`. Trocar a estratégia é mexer nessa função;
- `constraints.ts` já tem `isPubliclyServable()` e a lista `PUBLIC_BUCKETS`,
  hoje vazia — o ponto onde (a) se liga.

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

### Nome de ancestral não publicado aparece no pedigree — MUDANÇA DE COMPORTAMENTO

**Isto mudou.** Antes da migration `20260803082954_dog_pedigree`, o nome de um cão
não publicado de outro criador **não aparecia em lugar nenhum do site**: a página
do cão mostrava "Registro não público" na linha do pai ou da mãe. Depois dela, o
nome **aparece** na árvore de qualquer descendente publicado.

O que continua escondido: `public_id` (logo, não há link nem URL para chegar ao
registro), sexo, raça, data de nascimento e canil. Sai o nome e a posição.

**Por que foi aceito:** pedigree com lacuna não é pedigree. Se o avô materno
some porque outro criador ainda não publicou o registro dele, o documento perde a
função — e o nome do ancestral é, no domínio da cinofilia, dado
convencionalmente público: consta em pedigree impresso, em catálogo de exposição
e em registro de entidade. Esconder o nome protegeria pouco e quebraria muito.

**O que o cliente precisa decidir:** se isso é aceitável para os criadores dele.
A pergunta concreta é se um criador se incomoda de ver o nome de um cão que
cadastrou e ainda não publicou aparecendo na árvore do cão de outra pessoa.

**Custo de reverter:** baixo, e por isso a decisão não é irreversível. É trocar
`d.name` por um `case when public.dog_is_public(...) then d.name end` dentro de
`public.dog_pedigree`, numa migration nova. Nenhuma migração de dados, nenhuma
mudança de policy, nenhuma quebra de URL. A tela já sabe renderizar nó sem link;
passaria a renderizar nó sem nome.

Vai junto com a definição dos campos públicos, acima — as duas decisões são a
mesma conversa.

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
- **Posse do canil, e a assimetria com o slug** — `kennels.owner_id` é único
  **entre as linhas vivas** (`kennels_owner_uk`, parcial por `deleted_at`): um
  criador tem no máximo um canil. Note que o predicado é o OPOSTO do escopo do
  slug logo acima, e é decisão, não descuido:

  |            | identifica               | ao excluir                                           |
  | ---------- | ------------------------ | ---------------------------------------------------- |
  | `slug`     | uma **URL já divulgada** | nunca recicla — o QR impresso não pode mudar de dono |
  | `owner_id` | uma **relação viva**     | recicla — quem fechou o canil pode abrir outro       |

  O índice cobre o INSERT e também o `update ... set deleted_at = null`, que
  nenhuma policy de INSERT enxergaria — `deleted_at` está na lista de
  `grant update` por coluna. Ver a migration `canil_unico_por_dono`.
