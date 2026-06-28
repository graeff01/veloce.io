// Configuração do Google Ads. As credenciais plugam via env quando estiverem
// prontas (developer token aprovado + OAuth do Google Cloud). Enquanto não houver,
// isGoogleAdsConfigured() = false e o motor fica em "aguardando configuração".
export const GOOGLE_ADS = {
  developerToken:  process.env.GOOGLE_ADS_DEVELOPER_TOKEN  || "",
  clientId:        process.env.GOOGLE_ADS_CLIENT_ID        || "",
  clientSecret:    process.env.GOOGLE_ADS_CLIENT_SECRET    || "",
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "", // MCC opcional
  apiVersion:      process.env.GOOGLE_ADS_API_VERSION      || "v18",
};

// Tudo pronto pra falar com a API? (faltando qualquer chave → ainda não).
export function isGoogleAdsConfigured(): boolean {
  return Boolean(GOOGLE_ADS.developerToken && GOOGLE_ADS.clientId && GOOGLE_ADS.clientSecret);
}
