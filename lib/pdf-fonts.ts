import { Font } from "@react-pdf/renderer";
import path from "path";

// Fonte de marca (Inter Tight, a mesma da UI) para os títulos de display dos
// PDFs. Arquivos locais em public/fonts → sem dependência de rede em runtime.
// Importar este módulo (efeito colateral) registra a família uma vez por processo.
const dir = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Inter Tight",
  fonts: [
    { src: path.join(dir, "InterTight-Bold.ttf"), fontWeight: 700 },
    { src: path.join(dir, "InterTight-ExtraBold.ttf"), fontWeight: 800 },
  ],
});

// Evita quebras de palavra estranhas em títulos (sem hifenização).
Font.registerHyphenationCallback((word) => [word]);
