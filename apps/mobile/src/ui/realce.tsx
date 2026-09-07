// ── Realce do trecho buscado ──────────────────────────────────────────────────
// Pular até a mensagem certa e não marcar nada dentro dela deixa metade do
// trabalho para o olho: numa mensagem longa, achar a palavra continua sendo
// leitura linha a linha. O realce fecha o ciclo da busca.

import { Text, type TextStyle } from "react-native";
import { fatiar } from "../core/realce";

export function TextoRealcado({ texto, termo, estilo, estiloRealce }: {
  texto: string;
  termo: string;
  estilo?: TextStyle | TextStyle[];
  estiloRealce: TextStyle;
}) {
  const partes = fatiar(texto, termo);
  if (partes.length === 1 && !partes[0]!.casa) return <Text style={estilo}>{texto}</Text>;
  return (
    <Text style={estilo}>
      {partes.map((p, i) =>
        p.casa
          ? <Text key={i} style={estiloRealce}>{p.trecho}</Text>
          : <Text key={i}>{p.trecho}</Text>,
      )}
    </Text>
  );
}
