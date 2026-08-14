import { describe, expect, it } from "vitest";

import {
  ACCEPTED_VIDEO_MIMES,
  formatSeconds,
  isTerminal,
  mapStreamState,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  parsePlaybackOrigin,
  streamIframeUrl,
  validateVideoFile,
  VIDEO_STATUSES,
} from "./constraints";

const MP4 = "video/mp4";

describe("validateVideoFile", () => {
  it("aceita MP4, MOV e WebM dentro dos limites", () => {
    for (const type of ACCEPTED_VIDEO_MIMES) {
      expect(validateVideoFile({ type, size: 5_000_000, durationSeconds: 12 })).toEqual({
        ok: true,
      });
    }
  });

  it("recusa formato fora da lista", () => {
    const result = validateVideoFile({ type: "video/x-msvideo", size: 1000 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("MP4");
  });

  it("recusa imagem enviada no campo de vídeo", () => {
    expect(validateVideoFile({ type: "image/jpeg", size: 1000 }).ok).toBe(false);
  });

  it("recusa arquivo vazio", () => {
    expect(validateVideoFile({ type: MP4, size: 0 }).ok).toBe(false);
  });

  it("recusa acima de 200 MB — o teto do upload simples do Cloudflare", () => {
    expect(validateVideoFile({ type: MP4, size: MAX_VIDEO_BYTES }).ok).toBe(true);
    const result = validateVideoFile({ type: MP4, size: MAX_VIDEO_BYTES + 1 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("200.0 MB");
  });

  it("recusa acima do limite de duração, e aceita exatamente no limite", () => {
    expect(
      validateVideoFile({ type: MP4, size: 1000, durationSeconds: MAX_VIDEO_SECONDS }).ok,
    ).toBe(true);

    const result = validateVideoFile({
      type: MP4,
      size: 1000,
      durationSeconds: MAX_VIDEO_SECONDS + 1,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("1:31");
  });

  it("sem duração informada, só checa formato e tamanho", () => {
    // É o estado da seleção do arquivo, antes de o `<video>` decodificar os
    // metadados. Barrar aqui exigiria esperar a decodificação para dizer
    // "formato não aceito", que já dava para dizer na hora.
    expect(validateVideoFile({ type: MP4, size: 1000 })).toEqual({ ok: true });
  });

  it("duração não-finita passa — alguns WebM não trazem o índice de duração", () => {
    // O navegador devolve `Infinity` nesse caso. Não dá para afirmar que
    // estourou o limite, e barrar recusaria arquivo válido; quem decide com a
    // duração real é o Cloudflare, depois.
    expect(validateVideoFile({ type: MP4, size: 1000, durationSeconds: Infinity }).ok).toBe(true);
    expect(validateVideoFile({ type: MP4, size: 1000, durationSeconds: NaN }).ok).toBe(true);
  });

  it("recusa duração zero ou negativa — arquivo ilegível", () => {
    expect(validateVideoFile({ type: MP4, size: 1000, durationSeconds: 0 }).ok).toBe(false);
    expect(validateVideoFile({ type: MP4, size: 1000, durationSeconds: -3 }).ok).toBe(false);
  });
});

describe("mapStreamState", () => {
  it("aceita cada um dos estados que a API reporta", () => {
    for (const status of VIDEO_STATUSES) {
      expect(mapStreamState(status, "pendingupload")).toBe(status);
    }
  });

  it("ESTADO DESCONHECIDO MANTÉM O ATUAL, nunca vira erro", () => {
    // O ponto da função. `live-inprogress` existe na API e não se aplica a nós;
    // se um estado novo virasse `error`, uma novidade do lado do Cloudflare
    // transformaria o vídeo do dono em falha permanente. Mantendo o atual, o
    // polling segue e o pior caso é o teto de tentativas — recuperável.
    expect(mapStreamState("live-inprogress", "inprogress")).toBe("inprogress");
    expect(mapStreamState("algo-que-ainda-nao-existe", "queued")).toBe("queued");
  });

  it("valor não-textual mantém o atual", () => {
    expect(mapStreamState(undefined, "downloading")).toBe("downloading");
    expect(mapStreamState(null, "ready")).toBe("ready");
    expect(mapStreamState(42, "error")).toBe("error");
  });
});

describe("isTerminal", () => {
  it("só ready e error encerram o polling", () => {
    expect(isTerminal("ready")).toBe(true);
    expect(isTerminal("error")).toBe(true);
    expect(isTerminal("pendingupload")).toBe(false);
    expect(isTerminal("downloading")).toBe(false);
    expect(isTerminal("queued")).toBe(false);
    expect(isTerminal("inprogress")).toBe(false);
  });
});

describe("parsePlaybackOrigin", () => {
  it("extrai a origem da URL de thumbnail que a API devolve", () => {
    expect(
      parsePlaybackOrigin(
        "https://customer-f33zs165nr7gyfy4.cloudflarestream.com/6b9e68b07dfee8cc/thumbnails/thumbnail.jpg",
      ),
    ).toBe("https://customer-f33zs165nr7gyfy4.cloudflarestream.com");
  });

  it("recusa host que não é o subdomínio de cliente do Stream", () => {
    // Isto vira o `src` de um <iframe> na página pública. O CHECK
    // `dog_videos_origin_host` guarda a mesma regra do lado do banco.
    expect(parsePlaybackOrigin("https://evil.com/x/thumbnails/thumbnail.jpg")).toBeNull();
    expect(parsePlaybackOrigin("https://cloudflarestream.com/x")).toBeNull();
    expect(
      parsePlaybackOrigin("https://customer-abc.cloudflarestream.com.evil.com/x"),
    ).toBeNull();
    expect(parsePlaybackOrigin("https://customer-.cloudflarestream.com/x")).toBeNull();
  });

  it("recusa http — o embed tem de ser https", () => {
    expect(parsePlaybackOrigin("http://customer-abc123.cloudflarestream.com/x")).toBeNull();
  });

  it("recusa lixo, vazio e ausente", () => {
    expect(parsePlaybackOrigin("não é url")).toBeNull();
    expect(parsePlaybackOrigin("")).toBeNull();
    expect(parsePlaybackOrigin(null)).toBeNull();
    expect(parsePlaybackOrigin(undefined)).toBeNull();
  });
});

describe("streamIframeUrl", () => {
  const playbackOrigin = "https://customer-abc123.cloudflarestream.com";
  const providerUid = "6b9e68b07dfee8cc2d116e4c51d6a957";

  it("monta o endereço do player embutido", () => {
    expect(streamIframeUrl({ playbackOrigin, providerUid })).toBe(
      `${playbackOrigin}/${providerUid}/iframe`,
    );
  });

  it("passa o poster escapado, para não piscar preto entre o clique e o primeiro quadro", () => {
    const url = streamIframeUrl({
      playbackOrigin,
      providerUid,
      posterUrl: `${playbackOrigin}/${providerUid}/thumbnails/thumbnail.jpg?time=1s`,
    });
    expect(url).toContain("?poster=https%3A%2F%2Fcustomer-abc123");
    expect(url).toContain("%3Ftime%3D1s");
  });

  it("NUNCA embute autoplay", () => {
    // O requisito é explícito: o vídeo só toca por decisão do visitante.
    const url = streamIframeUrl({
      playbackOrigin,
      providerUid,
      posterUrl: `${playbackOrigin}/${providerUid}/thumbnails/thumbnail.jpg`,
    });
    expect(url).not.toContain("autoplay");
  });
});

describe("formatSeconds", () => {
  it("formata minuto e segundo", () => {
    expect(formatSeconds(7)).toBe("0:07");
    expect(formatSeconds(60)).toBe("1:00");
    expect(formatSeconds(83)).toBe("1:23");
  });

  it("arredonda para cima — 6,2s de vídeo são 7s, não 6s", () => {
    expect(formatSeconds(6.2)).toBe("0:07");
  });

  it("degrada para 0:00 no que não dá para formatar", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(-1)).toBe("0:00");
    expect(formatSeconds(Infinity)).toBe("0:00");
    expect(formatSeconds(NaN)).toBe("0:00");
  });
});
