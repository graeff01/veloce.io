# App iOS — segurança

## Credencial

- Só no **Keychain** (`expo-secure-store`), nunca AsyncStorage.
- `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: não viaja em backup do iCloud nem é
  restaurada em outro aparelho. Trocar de celular exige login novo — correto,
  porque a sessão é vinculada a um `deviceId`.
- TTL 30 dias (navegador: 60). Revogável por aparelho.
- O **token do portal** nunca é persistido: vive em memória durante o login e sai
  de escopo. Não vai para log, analytics ou documentação.

## Autorização

- O servidor decide, sempre. `sections` do `/me` pinta o menu; cada rota
  revalida. Esconder botão não é autorização.
- Seção desconhecida vinda da API é descartada em vez de virar item de menu.
- `tenant` nunca vem do app: `clientId` é derivado da `PortalSession`.
- 401 → limpa Keychain e volta ao login (uma vez só, mesmo com N chamadas
  paralelas). 403 **não** desloga. Queda de rede **não** desloga.

## Dados de terceiros

Conversas são dados pessoais de **leads**, que não são usuários do app.

- Log: `src/core/redact.ts` é a única saída autorizada. Telefone mantém 4
  dígitos; e-mail mantém só o domínio; corpo de mensagem **nunca** aparece, nem
  truncado; `Bearer` e token do portal são cortados inteiros.
- Mídia baixada vai para o diretório de **cache** (o iOS pode limpar sozinho), e
  o logout apaga a pasta.
- Sem analytics de terceiros na V1 — evita obrigação de rótulo de privacidade em
  troca de pouco.

## Rede

- HTTPS obrigatório fora da rede local. `resolveApiBase` recusa HTTP em host que
  não seja loopback/LAN e **bloqueia dev/staging apontando para produção**.
- Nenhuma URL de produção embutida no binário. Sem configuração, é erro visível.
- TLS nunca é desabilitado.
- Nenhum secret no bundle. `APNS_*` são do servidor.

## Pendências antes de qualquer publicação

1. `PORTAL_SECTION_ENFORCE=1` — hoje a seção só pinta o menu; a API observa e
   deixa passar. Com um segundo cliente isso vira acesso indevido real.
2. Confirmar `PORTAL_FIRST_USER_ADMIN` desligado.
3. Exclusão de conta **dentro do app** (a App Store normalmente exige). Não há
   endpoint; a tela de perfil hoje apenas orienta, sem prometer nem excluir.
4. Clientes com `requireLogin=false` não têm credencial e não podem usar o app.
