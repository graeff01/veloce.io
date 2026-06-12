// Encaixe conservador de rótulos de anúncio: junta variações/typos do mesmo
// anúncio no rótulo "popular" (mais frequente). Ex.: "Taos HighBoline" (1 lead)
// encaixa em "Taos Highline" (25 leads). Threshold alto → erra pouco.

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[m];
}

function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

const THRESHOLD = 0.82;

// Recebe os rótulos (1 por lead, com repetição) e devolve um mapa
// rótuloOriginal → rótuloCanônico (o popular mais parecido, ou ele mesmo).
export function snapAdLabels(labels: string[]): Map<string, string> {
  const freq = new Map<string, number>();
  for (const l of labels) freq.set(l, (freq.get(l) ?? 0) + 1);

  // Âncoras = rótulos com 2+ leads (os "de verdade"). Variações raras encaixam neles.
  const anchors = [...freq.entries()].filter(([, c]) => c >= 2).map(([l]) => ({ raw: l, n: norm(l) }));

  const out = new Map<string, string>();
  for (const label of freq.keys()) {
    if (anchors.some((a) => a.raw === label)) { out.set(label, label); continue; } // já é âncora
    const ln = norm(label);
    let best: { raw: string; score: number } | null = null;
    for (const a of anchors) {
      let score = ratio(ln, a.n);
      if (a.n && ln && (ln.includes(a.n) || a.n.includes(ln))) score = Math.max(score, 0.9); // contém → forte
      if (!best || score > best.score) best = { raw: a.raw, score };
    }
    out.set(label, best && best.score >= THRESHOLD ? best.raw : label);
  }
  return out;
}
