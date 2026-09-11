// ── Cliente SSE ───────────────────────────────────────────────────────────────
// O React Native não traz `EventSource`. E ainda que trouxesse, não serviria: a
// especificação dele não permite enviar cabeçalhos, e nossa credencial é
// `Authorization: Bearer`. Por isso XMLHttpRequest, que aceita cabeçalho e
// entrega o corpo em pedaços conforme chega.
//
// Usado APENAS com a conversa aberta na tela. A divisão é:
//   • em primeiro plano, o SSE mantém a conversa viva;
//   • em segundo plano, quem avisa é o push (o iOS suspende conexões).
// Tratar os dois como concorrentes foi um erro meu anterior — são complementares.

/** Fatia o buffer em eventos completos, devolvendo o resto ainda incompleto. */
export function fatiarEventos(buffer: string): { eventos: string[]; resto: string } {
  const partes = buffer.split("\n\n");
  const resto = partes.pop() ?? "";
  return { eventos: partes.filter((p) => p.trim().length > 0), resto };
}

/** Extrai o campo `data:` de um evento. Ignora comentários (heartbeat `: hb`). */
export function dadosDoEvento(evento: string): string | null {
  const linhas = evento.split("\n").map((l) => l.trim());
  const dados = linhas.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  return dados.length ? dados.join("\n") : null;
}

export interface AssinaturaSse {
  fechar(): void;
}

export interface OpcoesSse {
  url: string;
  headers: Record<string, string>;
  /** Chamado a cada evento com `data:`. O conteúdo é o payload cru. */
  aoEvento(dados: string): void;
  /** Chamado quando a conexão cai. O chamador decide se reconecta. */
  aoFechar?(): void;
}

/**
 * Abre a conexão. Devolve um cancelador. Nunca lança: falha de stream é
 * degradação, não erro — a tela continua funcionando pelo recarregamento normal.
 */
export function abrirSse({ url, headers, aoEvento, aoFechar }: OpcoesSse): AssinaturaSse {
  const xhr = new XMLHttpRequest();
  let lido = 0;
  let buffer = "";
  let encerrado = false;

  const encerrar = () => {
    if (encerrado) return;
    encerrado = true;
    aoFechar?.();
  };

  xhr.open("GET", url, true);
  for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
  xhr.setRequestHeader("accept", "text/event-stream");

  xhr.onprogress = () => {
    // `responseText` acumula: só o trecho novo interessa.
    const novo = xhr.responseText.slice(lido);
    lido = xhr.responseText.length;
    buffer += novo;

    const { eventos, resto } = fatiarEventos(buffer);
    buffer = resto;
    for (const ev of eventos) {
      const dados = dadosDoEvento(ev);
      if (dados !== null) aoEvento(dados);
    }
  };

  xhr.onerror = encerrar;
  xhr.onabort = encerrar;
  xhr.onload = encerrar;
  xhr.ontimeout = encerrar;

  try {
    xhr.send();
  } catch {
    encerrar();
  }

  return {
    fechar() {
      encerrado = true; // não chama aoFechar: o fechamento foi nosso
      try { xhr.abort(); } catch { /* já encerrado */ }
    },
  };
}
