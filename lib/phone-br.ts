// Comparação de números de telefone tolerante ao "9º dígito" do celular brasileiro.
// A Cloud API às vezes entrega o número SEM o 9 (ex.: 555191597229) e o cadastro
// tem COM o 9 (ex.: 5551991597229) — comparação por string crua falha. Reduzimos a
// uma chave canônica (DDD + 8 dígitos do assinante), ignorando país (55) e o 9.

export function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

// Chave canônica: os 10 dígitos finais (DDD + assinante de 8), sem o 9 de celular.
export function brKey(n: string): string {
  let d = onlyDigits(n);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2); // remove código do país
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3); // remove o 9 do celular
  return d.length >= 10 ? d.slice(-10) : d;
}

// true se a e b são o mesmo número BR (tolerando 9º dígito e código de país).
export function sameBrazilNumber(a: string, b: string): boolean {
  const ka = brKey(a);
  return ka.length >= 8 && ka === brKey(b);
}

// Variantes do número para consultar por igualdade no banco (com e sem o 9).
export function brVariants(n: string): string[] {
  const key = brKey(n); // DDD + 8
  if (key.length !== 10) return [...new Set([onlyDigits(n)])];
  const ddd = key.slice(0, 2), sub = key.slice(2); // sub = 8 dígitos
  const without9 = ddd + sub;        // 10
  const with9 = ddd + "9" + sub;     // 11
  return [...new Set([without9, with9, "55" + without9, "55" + with9, onlyDigits(n)])];
}
