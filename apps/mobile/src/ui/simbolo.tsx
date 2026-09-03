// ── SF Symbols ────────────────────────────────────────────────────────────────
// Trocar os ícones de web (lucide) pelos do sistema é o ajuste isolado que mais
// muda a leitura de "app nativo": peso, alinhamento óptico e forma são os mesmos
// que o usuário vê em Mensagens, Ajustes e Mail.
//
// `SymbolView` é exclusivo do iOS. O `fallback` cobre qualquer outra plataforma
// para a tela nunca ficar com um buraco no lugar do ícone.

import { Platform } from "react-native";
import { SymbolView, type SymbolViewProps, type SymbolWeight } from "expo-symbols";
import type { ReactNode } from "react";

export interface SimboloProps {
  nome: SymbolViewProps["name"];
  tamanho?: number;
  cor?: string;
  peso?: SymbolWeight;
  /** Desenho equivalente para plataformas sem SF Symbols. */
  reserva?: ReactNode;
}

export function Simbolo({ nome, tamanho = 22, cor, peso = "regular", reserva = null }: SimboloProps) {
  if (Platform.OS !== "ios") return <>{reserva}</>;
  return (
    <SymbolView
      name={nome}
      size={tamanho}
      tintColor={cor}
      weight={peso}
      resizeMode="scaleAspectFit"
      style={{ width: tamanho, height: tamanho }}
    />
  );
}

/** Nomes usados no app, num lugar só — evita string solta espalhada por tela. */
export const SIMBOLO = {
  conversas: "bubble.left.and.bubble.right.fill",
  anuncios: "megaphone.fill",
  orcamentos: "doc.text.fill",
  mais: "ellipsis.circle.fill",
  pessoa: "person.crop.circle",
  busca: "magnifyingglass",
  enviar: "arrow.up.circle.fill",
  anexo: "paperclip",
  camera: "camera.fill",
  microfone: "mic.fill",
  parar: "stop.circle.fill",
  tocar: "play.fill",
  pausar: "pause.fill",
  avancar: "chevron.right",
  fechar: "xmark",
  subindo: "arrow.up.right",
  descendo: "arrow.down.right",
  semAnuncio: "megaphone",
  caixaVazia: "tray",
  relogio: "clock",
} as const;
