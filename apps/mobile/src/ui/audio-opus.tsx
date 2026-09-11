// ── Nota de voz do WhatsApp no iPhone ─────────────────────────────────────────
// O WhatsApp envia nota de voz em Ogg/Opus. No iOS existem DOIS decodificadores
// e eles não concordam:
//   · AVFoundation (motor do expo-audio) NÃO abre Opus — o player fica mudo;
//   · WebKit (motor do Safari) ABRE — é por isso que o portal web toca no iPhone.
//
// Então usamos o mesmo decodificador que o portal: um WebView de 0×0, invisível,
// só como motor de áudio. A interface continua nativa — o WebView não desenha
// nada, apenas decodifica e reporta o tempo.
//
// A alternativa era converter Opus→AAC no servidor, o que exigiria ffmpeg na
// imagem de produção. Isto resolve sem tocar em infraestrutura.
//
// O áudio vai EMBUTIDO na página como `data:` URI. Apontar para `file://` não
// funciona: o WKWebView só lê arquivos dentro do escopo que recebeu na carga, e
// o cache de mídia está fora dele — dava "áudio indisponível".

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export interface ControleAudio {
  tocar: () => void;
  pausar: () => void;
  irPara: (segundos: number) => void;
}

export interface EstadoAudio {
  tocando: boolean;
  posicao: number;
  duracao: number;
}

/** A página é mínima de propósito: um <audio> e três avisos de volta. */
function pagina(dataUri: string): string {
  return `<!doctype html><meta charset="utf-8">
<body style="margin:0;background:transparent">
<audio id="a" src="${dataUri}" preload="auto"></audio>
<script>
  var a = document.getElementById('a');
  var avisar = function (tipo) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      tipo: tipo,
      posicao: a.currentTime || 0,
      duracao: isFinite(a.duration) ? a.duration : 0
    }));
  };
  a.addEventListener('loadedmetadata', function () { avisar('pronto'); });
  a.addEventListener('timeupdate', function () { avisar('tempo'); });
  a.addEventListener('play',  function () { avisar('tocando'); });
  a.addEventListener('pause', function () { avisar('pausado'); });
  a.addEventListener('ended', function () { a.currentTime = 0; avisar('fim'); });
  a.addEventListener('error', function () { avisar('erro'); });
</script></body>`;
}

export const AudioOpus = forwardRef<ControleAudio, {
  /** `data:` URI já pronto — ver `midiaEmDataUri`. */
  dados: string;
  onEstado: (e: EstadoAudio) => void;
  onErro?: () => void;
}>(function AudioOpus({ dados, onEstado, onErro }, ref) {
  const web = useRef<WebView>(null);
  const [tocando, setTocando] = useState(false);

  const executar = useCallback((js: string) => {
    web.current?.injectJavaScript(`${js}; true;`);
  }, []);

  useImperativeHandle(ref, () => ({
    tocar: () => executar("a.play()"),
    pausar: () => executar("a.pause()"),
    irPara: (s: number) => executar(`a.currentTime = ${s}`),
  }), [executar]);

  const receber = useCallback((e: WebViewMessageEvent) => {
    let d: { tipo?: string; posicao?: number; duracao?: number };
    try { d = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (d.tipo === "erro") { onErro?.(); return; }
    const vivo = d.tipo === "tocando" || (d.tipo === "tempo" && tocando);
    if (d.tipo === "tocando") setTocando(true);
    if (d.tipo === "pausado" || d.tipo === "fim") setTocando(false);
    onEstado({
      tocando: d.tipo === "fim" || d.tipo === "pausado" ? false : vivo || tocando,
      posicao: d.posicao ?? 0,
      duracao: d.duracao ?? 0,
    });
  }, [onEstado, onErro, tocando]);

  return (
    // 0×0 e sem toque: é motor, não interface.
    <View style={{ width: 0, height: 0, opacity: 0 }} pointerEvents="none">
      <WebView
        ref={web}
        source={{ html: pagina(dados) }}
        // Sem acesso a arquivo: o áudio vai embutido, nada é lido do disco.
        originWhitelist={["about:blank"]}
        // Sem isto, o WebKit exige gesto DENTRO da página para tocar — e o
        // gesto do usuário aconteceu do lado nativo.
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        onMessage={receber}
        javaScriptEnabled
        // Só o documento embutido. Qualquer navegação é recusada: o conteúdo é
        // mídia de TERCEIRO (o lead), e este WebView não pode virar uma janela
        // para a internet.
        onShouldStartLoadWithRequest={(r) => r.url === "about:blank" || r.url.startsWith("data:")}
        // Sem histórico, sem JS de fora, sem abrir outra janela.
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        cacheEnabled={false}
        incognito
      />
    </View>
  );
});
