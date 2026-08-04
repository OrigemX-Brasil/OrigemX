import {
  criarUsuario,
  emailDeCadastro,
  emailDeTeste,
  limparUsuario,
  SENHA_PADRAO,
} from "./support/admin";
import { alerta, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 1. Cadastro e login
 * ============================================================================
 */

test.describe("cadastro por e-mail e senha", () => {
  /**
   * SOBRE A TOLERÂNCIA AO RATE LIMIT, que não é frouxidão:
   *
   * O projeto está sem SMTP próprio, então a confirmação sai pelo serviço
   * embutido do Supabase — que limita a POUCOS e-mails por hora. Rodar a suíte
   * duas vezes seguidas já esbarra nisso.
   *
   * Um teste que falhe por esse limite estaria reportando a cota do provedor
   * como se fosse defeito do produto, e a suíte viraria aquela que "às vezes
   * falha" — a pior espécie, porque ensina a ignorar vermelho.
   *
   * Então o teste afirma o que é NOSSO em qualquer um dos dois caminhos: a tela
   * responde com mensagem legível e traduzida, nunca com o genérico e nunca
   * quebrando. Quando o envio passa, ele ainda confere que o perfil nasceu com
   * papel `user`.
   */
  test("cria a conta e pede confirmação em vez de entrar direto", async ({ page, admin }) => {
    const email = emailDeCadastro("signup");

    await page.goto("/cadastro");
    await page.getByLabel("Nome").fill("Criador de Teste");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(SENHA_PADRAO);
    await page.getByRole("button", { name: "Criar conta" }).click();

    const confirmacao = page.getByRole("heading", { name: "Confirme seu e-mail" });
    const erro = alerta(page);

    await expect(confirmacao.or(erro).first()).toBeVisible();

    if (await erro.isVisible()) {
      const texto = (await erro.textContent()) ?? "";

      /**
       * DUAS barreiras de ambiente, nenhuma defeito do produto:
       *
       *   1. cota de e-mail — sem SMTP próprio, o serviço embutido do Supabase
       *      libera poucos envios por hora;
       *   2. validação de domínio — o Supabase recusa `.test` e `example.com`
       *      no cadastro PÚBLICO, embora a API de admin aceite.
       *
       * O que continua sendo afirmado, e é o que nos cabe: a mensagem é
       * legível, traduzida, e NUNCA o genérico "Não foi possível concluir".
       * Um erro fora dessas duas famílias reprova o teste.
       */
      expect(texto, `erro inesperado no cadastro: ${texto}`).toMatch(
        /Muitas tentativas|E-mail inválido/,
      );
      expect(texto).not.toContain("Não foi possível concluir");

      test.info().annotations.push({
        type: "aviso",
        description:
          `Cadastro não concluído por limite de ambiente ("${texto.slice(0, 60)}"). ` +
          "Some quando houver SMTP próprio e domínio real.",
      });
      return;
    }

    await expect(page.getByRole("status")).toContainText("link de confirmação");

    // O perfil nasceu, com o papel travado em 'user'.
    const { data: user } = await admin.auth.admin.listUsers();
    const criado = user.users.find((u) => u.email === email);
    expect(criado, "usuário deveria existir depois do cadastro").toBeTruthy();

    const { data: perfil } = await admin
      .from("profiles")
      .select("role")
      .eq("id", criado!.id)
      .single();

    expect(perfil?.role, "todo cadastro nasce como 'user', nunca admin").toBe("user");

    await limparUsuario(criado!.id);
  });

  test("e-mail inválido dá mensagem específica, não o genérico", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByLabel("Nome").fill("Criador de Teste");
    // Domínio que o Supabase recusa. Sem tradução própria, isto caía em
    // "Não foi possível concluir" e a pessoa não sabia onde tinha errado.
    await page.getByLabel("E-mail").fill(emailDeTeste("invalido"));
    await page.getByLabel("Senha").fill(SENHA_PADRAO);
    await page.getByRole("button", { name: "Criar conta" }).click();

    const texto = (await alerta(page).textContent()) ?? "";
    expect(texto).not.toContain("Não foi possível concluir");
    expect(texto).toMatch(/E-mail inválido|Muitas tentativas/);
  });

  test("recusa senha curta sem chegar no servidor de auth", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByLabel("E-mail").fill(emailDeTeste("curta"));
    await page.getByLabel("Senha").fill("123");
    await page.getByRole("button", { name: "Criar conta" }).click();

    // `minLength` no campo barra antes do POST. O formulário continua na tela.
    await expect(page.getByLabel("Senha")).toBeVisible();
  });
});

test.describe("login por e-mail e senha", () => {
  test("entra e chega no painel identificado", async ({ page }) => {
    const user = await criarUsuario("login");

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL("**/painel");
    // O painel identifica quem está logado — requisito do Anexo I.2.
    await expect(page.getByText(user.email)).toBeVisible();

    await limparUsuario(user.id);
  });

  test("senha errada dá mensagem legível, não 500, e não diz qual campo errou", async ({
    page,
  }) => {
    const user = await criarUsuario("senha-errada");

    const respostas: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/login")) respostas.push(r.status());
    });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill("senha-completamente-errada");
    await page.getByRole("button", { name: "Entrar" }).click();

    const erro = alerta(page);
    await expect(erro).toBeVisible();
    await expect(erro).toHaveText("E-mail ou senha incorretos.");

    // Não revela se foi o e-mail ou a senha: a tela não pode virar oráculo de
    // quais e-mails têm conta.
    await expect(erro).not.toContainText(/e-mail não|não existe|não encontrado/i);
    expect(
      respostas.every((s) => s < 500),
      `houve resposta 5xx: ${respostas}`,
    ).toBe(true);

    await limparUsuario(user.id);
  });

  test("rota privada sem sessão manda para o login e volta depois", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/painel/canis");

    await page.waitForURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/painel/canis");
  });
});

/**
 * ============================================================================
 * Google — o que dá para testar sem o Google
 * ============================================================================
 *
 * O fluxo real sai do nosso domínio: botão → server action → Supabase →
 * accounts.google.com → volta com um `code` que só o Supabase troca por sessão.
 * Falsificar esse `code` seria falsificar o Supabase, não o Google, e o teste
 * passaria a medir o dublê.
 *
 * Então a cobertura é dividida em três pedaços que são de fato nossos:
 *
 *   1. a SAÍDA — o app inicia o OAuth apontando para o lugar certo, com o
 *      callback certo e carregando a origem da campanha;
 *   2. a VOLTA COM ERRO — provedor recusou, usuário cancelou;
 *   3. o ESTADO DEPOIS — conta criada por OAuth entra no painel e nasce 'user'.
 *
 * O que fica de fora e está declarado: a troca do `code` por sessão, que é
 * código do Supabase.
 */
test.describe("Google (mockado)", () => {
  test("inicia o OAuth no endpoint certo, com o callback e a origem", async ({ page }) => {
    let autorizacao: URL | null = null;

    // Intercepta ANTES de sair para o Google: o teste não depende de rede
    // externa nem de conta real.
    await page.route("**/auth/v1/authorize**", async (route) => {
      autorizacao = new URL(route.request().url());
      await route.fulfill({ status: 200, body: "interceptado" });
    });

    await page.goto("/cadastro?de=feira-e2e");
    await page.getByRole("button", { name: "Continuar com Google" }).click();

    await expect.poll(() => autorizacao !== null, { timeout: 15_000 }).toBe(true);

    const url = autorizacao!;
    expect(url.searchParams.get("provider")).toBe("google");

    const redirect = new URL(url.searchParams.get("redirect_to")!);
    expect(redirect.pathname).toBe("/auth/callback");
    expect(redirect.searchParams.get("next")).toBe("/painel");
    // A origem da campanha atravessa o OAuth — sem isso todo cadastro por
    // Google cairia em "direto" e a conversão do Anexo I.11 sairia menor.
    expect(redirect.searchParams.get("de")).toBe("feira-e2e");
  });

  test("volta com erro do provedor sem quebrar a tela", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&error_description=user+cancelled");

    await page.waitForURL(/\/login\?erro=oauth/);
    await expect(alerta(page)).toHaveText(/não foi possível entrar com o google/i);
  });

  test("conta vinda de OAuth entra no painel e nasce com papel 'user'", async ({
    page,
    admin,
    autenticar,
  }) => {
    // Estado equivalente ao pós-OAuth: a conta existe e tem sessão. É o que o
    // Google produziria; o que não dá para reproduzir é a troca do `code`.
    const user = await criarUsuario("oauth");
    await autenticar(page, user);

    await page.goto("/painel");
    await expect(page.getByText(user.email)).toBeVisible();

    const { data: perfil } = await admin.from("profiles").select("role").eq("id", user.id).single();

    expect(perfil?.role, "papel nunca vem do provider").toBe("user");

    await limparUsuario(user.id);
  });
});
