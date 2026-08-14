/**
 * `role="alert"` no erro para o leitor de tela anunciar sem o usuário precisar
 * navegar até lá. `role="status"` no sucesso, que é menos urgente.
 *
 * Não é domínio, é infraestrutura de UI usada por vários módulos — mesmo
 * raciocínio que já tirou `BackLink` para cá (ver `modules/README.md`).
 */
export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;

  if (error) {
    return (
      <p
        role="alert"
        className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
      >
        {error}
      </p>
    );
  }

  return (
    <p
      role="status"
      className="border-success-subtle bg-success-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
    >
      {message}
    </p>
  );
}
