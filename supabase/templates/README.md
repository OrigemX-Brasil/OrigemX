# Templates de e-mail do Supabase Auth

HTML para **colar no painel**: Supabase → Authentication → Emails.

Estes e-mails saem do **Supabase**, pelo SMTP, e vão para o **usuário**. Não
confundir com `src/lib/notify/`, que é o nosso código mandando aviso interno
para a **equipe** pela API do Resend.

## Os três, e por que só três

| Arquivo               | Onde colar           | Disparado por                               |
| --------------------- | -------------------- | ------------------------------------------- |
| `confirm-signup.html` | Confirm signup       | `signUp()` em `src/modules/auth/actions.ts` |
| `reset-password.html` | Reset password       | `resetPasswordForEmail()`, mesmo arquivo    |
| `change-email.html`   | Change Email Address | ⚠️ nenhum caminho do app — ver abaixo       |

> ⚠️ **Editar o arquivo aqui não muda nada em produção.** O painel guarda a
> própria cópia do HTML; o repositório é só a fonte. Toda alteração exige
> **recolar** no painel de cada projeto — ver "Como recolar", no fim.

**Assuntos sugeridos**, que também são colados no painel:

```
Confirme seu e-mail — OrigemX
Redefinir sua senha — OrigemX
Confirme seu novo e-mail — OrigemX
```

**Não existem** templates para Magic Link, Invite user e Reauthentication: nada
no projeto chama `signInWithOtp`, `admin.inviteUserByEmail` nem reautenticação.
Template para fluxo inexistente envelhece sem ninguém notar e dá falsa sensação
de cobertura — quando o fluxo for implementado, o template sai junto.

### Sobre o `change-email.html`

O app não tem tela de troca de e-mail. O template existe porque a troca é
plausível **como operação manual de suporte**, direto no painel do Supabase, e aí
o usuário receberia o padrão em inglês e sem identidade.

Como `double_confirm_changes = true` no `config.toml`, o Supabase manda **este
mesmo template para os dois endereços**, o antigo e o novo. Por isso o texto
mostra de onde para onde a mudança vai: quem recebe no endereço antigo precisa
entender que está sendo **avisado**, não convidado a confirmar um cadastro.

## O link: `token_hash`, nunca `{{ .ConfirmationURL }}`

Esta é a decisão mais importante dos três arquivos, e custou um bug em produção.

O Supabase tem **dois padrões de link, mutuamente exclusivos**:

| Padrão                   | O link aponta para          | Quem verifica | Chega na rota como           |
| ------------------------ | --------------------------- | ------------- | ---------------------------- |
| `{{ .ConfirmationURL }}` | `/auth/v1/verify` do GoTrue | o **GoTrue**  | `?code=` ou `#access_token=` |
| **`token_hash`**         | a **nossa** rota            | **nós**       | `?token_hash=&type=`         |

Com `{{ .ConfirmationURL }}` a sessão volta num **fragmento de URL** (`#…`), e
**fragmento não é enviado no HTTP** — nenhum código de servidor consegue lê-lo.
O sintoma era exatamente este: o link ativava a conta, e a página de destino
dizia "Esse link expirou ou já foi usado". Falso erro, toda vez.

Por isso os três usam:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=TIPO&next=DESTINO
```

| Template         | `type`         | `next`        |
| ---------------- | -------------- | ------------- |
| `confirm-signup` | `signup`       | `/painel`     |
| `reset-password` | `recovery`     | `/nova-senha` |
| `change-email`   | `email_change` | `/painel`     |

**O `type` não é decorativo**: é ele que diz ao `verifyOtp` qual token
verificar. Trocar `recovery` por `signup` faz o link de senha falhar.

Vantagem colateral: como o destino é a própria Site URL, o link **não depende da
allow-list de Redirect URLs**. Com `{{ .ConfirmationURL }}`, um `redirect_to`
fora da lista era descartado em silêncio e o usuário caía na home.

## Variáveis

O painel usa template Go do GoTrue. Cada template só recebe algumas:

| Variável                           | Onde vale                                      |
| ---------------------------------- | ---------------------------------------------- |
| `{{ .TokenHash }}`                 | os três — é o que vai no link                  |
| `{{ .SiteURL }}`                   | os três                                        |
| `{{ .Email }}` / `{{ .NewEmail }}` | só no change-email                             |
| `{{ .ConfirmationURL }}`           | existe, mas **não usamos** — ver acima         |
| `{{ .Token }}`                     | código de 8 dígitos; nenhum template daqui usa |

**Variável que o template não recebe sai literal na caixa do usuário** — um
`{{ .NewEmail }}` colado no confirm-signup apareceria como esse texto mesmo. Ao
adaptar um template a partir de outro, confira a coluna acima.

## As imagens, e o que quebra hoje

`NEXT_PUBLIC_SITE_URL` **não existe aqui** — o painel não enxerga o `.env` da
aplicação. O equivalente é `{{ .SiteURL }}`, que o próprio Supabase substitui
pela Site URL do projeto:

```html
<img src="{{ .SiteURL }}/brand/email-logo.png" alt="OrigemX" />
```

⚠️ **Enquanto o app não estiver publicado, a imagem chega quebrada.** A Site URL
aponta para `localhost`, que não existe para quem recebe. Por isso o `alt` é o
nome do produto: sem imagem, o e-mail continua legível e identificável. Some
sozinho no primeiro deploy com domínio real.

## A faixa branca no topo — decisão medida

O wordmark fornecido (`public/brand/email-logo.png`) é **escuro com fundo
transparente**. Medido na região do texto: 2.878 pixels opacos, 100% escuros,
luminância média **9,7 de 255**. Sobre o `#0B0F1A` da marca isso dá contraste de
**1,04:1** — o mínimo da WCAG para elemento gráfico é 3:1. A palavra "ORIGEM"
não apareceria; sobraria o X colorido solto.

Por isso o logo fica numa faixa branca e o corpo do e-mail segue escuro.

**Quando existir um wordmark claro:** troque o arquivo em `public/brand/` e mude
`bgcolor="#FFFFFF"` para `bgcolor="#0B0F1A"` no bloco do header, nos três
arquivos. É a única mudança necessária.

## Por que o HTML é "antigo"

Este é o único lugar do projeto onde tabela e estilo inline são o certo. O
Outlook renderiza e-mail com o motor do **Word**: flex, grid, classe e folha
externa não existem lá. As regras seguidas:

- tabelas com `role="presentation"`, estilo inline, `bgcolor` explícito;
- fonte web-safe — e-mail não carrega Google Fonts de forma confiável;
- botão como `<td bgcolor>` com `<a>` de padding, nunca `<button>`;
- `color-scheme` declarado, senão Gmail e Outlook invertem cor por conta própria
  e produzem texto claro sobre fundo claro;
- 600 px com `max-width`, para caber em tela de celular;
- **toda** URL absoluta, de imagem e de link;
- pré-cabeçalho escondido, que é o texto de prévia na lista de e-mails;
- o endereço do link também em texto — cliente corporativo reescreve ou bloqueia
  botão, e sem isso a pessoa fica sem saída.

## Como recolar

O painel não lê este repositório. Em **Authentication → Emails**, para cada
template: abrir, apagar o conteúdo e colar o arquivo inteiro.

| Colar em             | Arquivo               |
| -------------------- | --------------------- |
| Confirm signup       | `confirm-signup.html` |
| Reset password       | `reset-password.html` |
| Change Email Address | `change-email.html`   |

Depois de colar, **conferir na hora**: pedir um link de recuperação para um
e-mail seu e olhar o endereço do botão. Ele precisa apontar para o **seu
domínio** com `token_hash=` — se apontar para `…supabase.co/auth/v1/verify`, a
cópia antiga ainda está no ar e o bug do "link expirado" continua.

E conferir a **Site URL** do projeto (Authentication → URL Configuration): é ela
que o `{{ .SiteURL }}` vira. Apontando para `localhost`, todo link enviado é
inútil para quem recebe.

## Handover ao cliente

No projeto do cliente, estes arquivos podem sair do copia-e-cola e virar
configuração, apontando `content_path` no `config.toml`:

```toml
[auth.email.template.confirmation]
subject = "Confirme seu e-mail — OrigemX"
content_path = "./supabase/templates/confirm-signup.html"
```

⚠️ Isso só vale com `config push`, que **sobrescreve a configuração de auth
inteira** — ver a seção AMBIENTE do `CLAUDE.md` antes de rodar.
