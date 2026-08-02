import { describe, expect, it } from "vitest";

import {
  buildStoragePath,
  buildThumbPath,
  computeTargetSize,
  extensionForMime,
  formatBytes,
  MAX_IMAGE_DIMENSION,
  MAX_INPUT_BYTES,
  MAX_STORED_BYTES,
  MAX_USER_BYTES,
  pathBelongsTo,
  THUMB_DIMENSION,
  validateInputFile,
  validateQuota,
  validateStoredFile,
} from "./constraints";

describe("computeTargetSize", () => {
  it("reduz pelo lado maior preservando proporção", () => {
    expect(computeTargetSize({ width: 4000, height: 3000 }, 1600)).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(computeTargetSize({ width: 3000, height: 4000 }, 1600)).toEqual({
      width: 1200,
      height: 1600,
    });
  });

  it("NÃO amplia — subir 200px para 1600 só gera bytes e borrão", () => {
    expect(computeTargetSize({ width: 200, height: 150 }, 1600)).toEqual({
      width: 200,
      height: 150,
    });
  });

  it("mantém o quadrado quadrado", () => {
    expect(computeTargetSize({ width: 2000, height: 2000 }, 320)).toEqual({
      width: 320,
      height: 320,
    });
  });

  it("nunca devolve dimensão zero em imagem extremamente alongada", () => {
    // 4000x3 reduzido a 1600 daria altura 1.2 -> arredondaria para 1, não 0.
    const r = computeTargetSize({ width: 4000, height: 3 }, 1600);
    expect(r.width).toBe(1600);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });

  it("lida com entrada inválida sem estourar", () => {
    expect(computeTargetSize({ width: 0, height: 0 }, 1600)).toEqual({ width: 0, height: 0 });
    expect(computeTargetSize({ width: -5, height: 10 }, 1600)).toEqual({ width: 0, height: 0 });
  });

  it("o thumbnail é sensivelmente menor que o full", () => {
    const full = computeTargetSize({ width: 4000, height: 3000 }, MAX_IMAGE_DIMENSION);
    const thumb = computeTargetSize({ width: 4000, height: 3000 }, THUMB_DIMENSION);
    expect(thumb.width).toBeLessThan(full.width);
    expect(thumb.width).toBe(THUMB_DIMENSION);
  });
});

describe("validateInputFile", () => {
  it("aceita os formatos de entrada", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
      expect(validateInputFile({ type, size: 1024 }).ok, type).toBe(true);
    }
  });

  it("recusa o que não é imagem", () => {
    expect(validateInputFile({ type: "application/pdf", size: 1024 }).ok).toBe(false);
    expect(validateInputFile({ type: "image/svg+xml", size: 1024 }).ok).toBe(false);
    expect(validateInputFile({ type: "text/html", size: 1024 }).ok).toBe(false);
  });

  it("recusa arquivo vazio e acima do teto de entrada", () => {
    expect(validateInputFile({ type: "image/jpeg", size: 0 }).ok).toBe(false);
    expect(validateInputFile({ type: "image/jpeg", size: MAX_INPUT_BYTES + 1 }).ok).toBe(false);
    expect(validateInputFile({ type: "image/jpeg", size: MAX_INPUT_BYTES }).ok).toBe(true);
  });
});

describe("validateStoredFile", () => {
  it("só aceita o que a compressão produz", () => {
    expect(validateStoredFile({ mime: "image/webp", size: 1024 }).ok).toBe(true);
    expect(validateStoredFile({ mime: "image/jpeg", size: 1024 }).ok).toBe(true);
    // PNG entra na seleção mas não deve sair da compressão.
    expect(validateStoredFile({ mime: "image/png", size: 1024 }).ok).toBe(false);
  });

  it("recusa acima do teto pós-compressão", () => {
    expect(validateStoredFile({ mime: "image/webp", size: MAX_STORED_BYTES }).ok).toBe(true);
    expect(validateStoredFile({ mime: "image/webp", size: MAX_STORED_BYTES + 1 }).ok).toBe(false);
  });

  it("o teto de armazenamento é bem menor que o de entrada", () => {
    // Se algum dia ficarem iguais, a compressão deixou de servir para algo.
    expect(MAX_STORED_BYTES).toBeLessThan(MAX_INPUT_BYTES);
  });
});

describe("validateQuota", () => {
  it("aceita enquanto cabe", () => {
    expect(validateQuota(0, 1024).ok).toBe(true);
    expect(validateQuota(MAX_USER_BYTES - 1024, 1024).ok).toBe(true);
  });

  it("recusa quando estoura", () => {
    expect(validateQuota(MAX_USER_BYTES, 1).ok).toBe(false);
    expect(validateQuota(MAX_USER_BYTES - 10, 100).ok).toBe(false);
  });

  it("a mensagem diz quanto foi usado e quanto é o teto", () => {
    const r = validateQuota(MAX_USER_BYTES, 1);
    if (r.ok) throw new Error("deveria falhar");
    expect(r.reason).toMatch(/MB/);
  });
});

describe("buildStoragePath", () => {
  const base = { ownerId: "user-1", entityId: "ent-9", fileId: "abc123", extension: "webp" };

  it("começa pelo uid — é o que a policy de storage.objects compara", () => {
    const p = buildStoragePath({ ...base, role: "kennel_logo" });
    expect(p.split("/")[0]).toBe("user-1");
  });

  it("separa escopo de canil e de cão", () => {
    expect(buildStoragePath({ ...base, role: "kennel_logo" })).toBe(
      "user-1/canis/ent-9/abc123.webp",
    );
    expect(buildStoragePath({ ...base, role: "dog_gallery" })).toBe(
      "user-1/caes/ent-9/abc123.webp",
    );
  });
});

describe("buildThumbPath", () => {
  it("insere o sufixo antes da extensão", () => {
    expect(buildThumbPath("u/canis/k/abc.webp")).toBe("u/canis/k/abc_thumb.webp");
  });

  it("lida com caminho sem extensão", () => {
    expect(buildThumbPath("u/canis/k/abc")).toBe("u/canis/k/abc_thumb");
  });

  it("o thumb nunca colide com o original", () => {
    const original = "u/caes/d/foto.webp";
    expect(buildThumbPath(original)).not.toBe(original);
  });
});

describe("pathBelongsTo", () => {
  it("aceita o próprio prefixo", () => {
    expect(pathBelongsTo("user-1/canis/k/a.webp", "user-1")).toBe(true);
  });

  it("recusa prefixo de outro usuário", () => {
    expect(pathBelongsTo("user-2/canis/k/a.webp", "user-1")).toBe(false);
  });

  it("recusa travessia de diretório", () => {
    expect(pathBelongsTo("user-1/../user-2/a.webp", "user-1")).toBe(false);
    expect(pathBelongsTo("/user-1/a.webp", "user-1")).toBe(false);
  });

  it("recusa prefixo que só começa igual", () => {
    expect(pathBelongsTo("user-10/canis/k/a.webp", "user-1")).toBe(false);
  });
});

describe("extensionForMime", () => {
  it("mapeia o que a compressão produz", () => {
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
  });
});

describe("formatBytes", () => {
  it("usa a unidade legível", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
