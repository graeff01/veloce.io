/**
 * Tabela de nov/2026 da JR: preço VELHO → NOVO de cada modelo.
 * Fonte única para jr-tabela-nov2026.ts (aplica) e jr-trava-preco-medir.ts
 * (mede a trava contra conversas que aconteceram com a tabela velha).
 */
// ── A tabela ─────────────────────────────────────────────────────────────────
// `tem`: palavras que o nome PRECISA ter (cada item pode ser "a|b" = uma ou
// outra). `sem`: palavras que NÃO pode ter. Nome normalizado: minúsculo, sem
// acento. Valores conferidos página a página contra os dois PDFs.
export interface Modelo { nome: string; velho: number; novo: number; tem: string[]; sem?: string[] }
export const T: Modelo[] = [
  { nome: "Popular Lisa 55",                       velho: 817,   novo: 857,   tem: ["popular|lisa", "55"], sem: ["fogao", "campeir"] },
  { nome: "Popular Lisa 65",                       velho: 927,   novo: 977,   tem: ["popular|lisa", "65"], sem: ["fogao", "campeir"] },
  { nome: "Popular Tijolinho 65",                  velho: 1037,  novo: 1197,  tem: ["tijolinho|popular", "65"] },
  { nome: "Popular Tijolinho 75",                  velho: 1147,  novo: 1297,  tem: ["tijolinho|popular", "75"] },
  { nome: "Conjunto Popular Lisa 55 + Campeirinho", velho: 1924, novo: 2024,  tem: ["popular", "campeir|fogao"] },
  { nome: "Conjunto Popular Lisa 65 + Campeirinho", velho: 2034, novo: 2144,  tem: ["popular", "campeir|fogao"] },
  { nome: "Prime 7 espetos",                       velho: 1247,  novo: 1307,  tem: ["7"], sem: ["fogao", "forno", "campeir", "napoli"] },
  { nome: "Prime 9 espetos",                       velho: 1447,  novo: 1517,  tem: ["9"], sem: ["fogao", "forno", "campeir", "napoli"] },
  { nome: "Prime 11 espetos",                      velho: 1547,  novo: 1627,  tem: ["11"], sem: ["fogao", "forno", "campeir", "napoli"] },
  { nome: "Prime 16 espetos",                      velho: 1997,  novo: 2097,  tem: ["16"], sem: ["fogao", "forno", "campeir", "napoli"] },
  { nome: "Prime Parrilla 81",                     velho: 2957,  novo: 3107,  tem: ["parrilla"] },
  { nome: "Prime Parrilla 105",                    velho: 3577,  novo: 3757,  tem: ["parrilla"] },
  { nome: "Prime 32 espetos",                      velho: 4215,  novo: 4427,  tem: ["32"] },
  { nome: "Tradição",                              velho: 3757,  novo: 3947,  tem: ["tradicao"], sem: ["gourmet", "napoli"] },
  { nome: "Tradição Gourmet",                      velho: 4297,  novo: 4517,  tem: ["tradicao", "gourmet"], sem: ["napoli"] },
  { nome: "Gourmet",                               velho: 4197,  novo: 4407,  tem: ["gourmet"], sem: ["tradicao", "supreme", "napoli", "fogao", "forno", "bancada", "cuba", "pia"] },
  { nome: "Gourmet Supreme",                       velho: 14897, novo: 15647, tem: ["supreme"] },
  { nome: "Prime 7 + Fogão Campeirinho",           velho: 2354,  novo: 2474,  tem: ["7", "campeir"], sem: ["napoli"] },
  { nome: "Prime 9 + Fogão Campeirinho",           velho: 2554,  novo: 2684,  tem: ["9", "campeir"], sem: ["napoli"] },
  { nome: "Prime 9 + Fogão 3 bocas",               velho: 3064,  novo: 3214,  tem: ["9", "3 bocas"], sem: ["forno"] },
  { nome: "Prime 9 + Fogão 4 bocas",               velho: 3644,  novo: 3824,  tem: ["9", "4 bocas"], sem: ["forno"] },
  { nome: "Prime 11 + Fogão Campeirinho",          velho: 2654,  novo: 2794,  tem: ["11", "campeir"], sem: ["napoli"] },
  { nome: "Prime 11 + Fogão 3 bocas",              velho: 3164,  novo: 3324,  tem: ["11", "3 bocas"], sem: ["forno"] },
  { nome: "Prime 11 + Fogão 4 bocas",              velho: 3744,  novo: 3934,  tem: ["11", "4 bocas"], sem: ["forno"] },
  { nome: "Prime 16 + Fogão 4 bocas",              velho: 4194,  novo: 4404,  tem: ["16", "4 bocas"], sem: ["forno"] },
  { nome: "Prime 9 + Forno e Fogão 3 bocas",       velho: 4004,  novo: 4204,  tem: ["9", "forno", "3 bocas"] },
  { nome: "Prime 11 + Forno e Fogão 4 bocas",      velho: 4644,  novo: 4884,  tem: ["11", "forno", "4 bocas"] },
  { nome: "Prime 7 + Forno Napoli + Campeirinho",  velho: 3911,  novo: 4111,  tem: ["7", "napoli"] },
  { nome: "Prime 9 + Forno Napoli + Campeirinho",  velho: 4111,  novo: 4321,  tem: ["9", "napoli"] },
  // No catálogo VELHO esta página dizia "16 espetos" com 1,62 m — erro de
  // título. O novo corrige para 11 espetos (81 + 81 = 162 cm, confere).
  { nome: "Prime 11 + Forno Napoli (1,62 m)",      velho: 3104,  novo: 3264,  tem: ["napoli"] },
  { nome: "Prime 16 + Forno Napoli",               velho: 3554,  novo: 3734,  tem: ["16", "napoli"], sem: ["3 bocas"] },
  { nome: "Prime 16 + Napoli + Forno e Fogão 3",   velho: 6111,  novo: 6421,  tem: ["16", "napoli"] },
  { nome: "Tradição Gourmet + Forno Napoli",       velho: 5854,  novo: 6154,  tem: ["tradicao", "napoli"] },
  { nome: "Gourmet + Forno Napoli",                velho: 5754,  novo: 6044,  tem: ["gourmet", "napoli"] },
  { nome: "Gourmet + Fogão Campeirinho",           velho: 5304,  novo: 5574,  tem: ["gourmet", "campeir"] },
  { nome: "Gourmet + Fogão 3 bocas",               velho: 5814,  novo: 6104,  tem: ["gourmet", "3 bocas"], sem: ["forno"] },
  { nome: "Gourmet + Fogão 4 bocas",               velho: 6394,  novo: 6714,  tem: ["gourmet", "4 bocas"], sem: ["forno"] },
  { nome: "Gourmet + Forno e Fogão 3 bocas",       velho: 6754,  novo: 7094,  tem: ["gourmet", "forno", "3"] },
  { nome: "Gourmet + Forno e Fogão 4 bocas",       velho: 7294,  novo: 7664,  tem: ["gourmet", "forno", "4"] },
  { nome: "Fogão Campeirinho",                     velho: 1107,  novo: 1167,  tem: ["campeir"] },
  { nome: "Fogão Campeiro 3 bocas",                velho: 1617,  novo: 1697,  tem: ["3 bocas|3b"], sem: ["forno"] },
  { nome: "Fogão Campeiro 4 bocas",                velho: 2197,  novo: 2307,  tem: ["4 bocas|4b"], sem: ["forno"] },
  { nome: "Forno Napoli",                          velho: 1557,  novo: 1637,  tem: ["napoli"] },
  { nome: "Forno e Fogão Campeiro 3 bocas",        velho: 2557,  novo: 2687,  tem: ["forno", "3"] },
  { nome: "Forno e Fogão Campeiro 4 bocas",        velho: 3097,  novo: 3257,  tem: ["forno", "4"] },
  { nome: "Pia com cuba inox",                     velho: 957,   novo: 1007,  tem: ["pia|cuba"] },
  { nome: "Pia com cuba gourmet",                  velho: 1057,  novo: 1107,  tem: ["pia|cuba"] },
  { nome: "Balcão 1 m",                            velho: 897,   novo: 947,   tem: ["balcao"] },
  { nome: "Bancada Gourmet",                       velho: 2197,  novo: 2307,  tem: ["bancada"] },
];
