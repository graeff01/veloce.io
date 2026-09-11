# Testar o app no iPhone — sem Xcode e sem conta paga

Este Mac (**MacBook Pro Early 2015**, macOS 12) tem o Monterey como teto e **não
roda Xcode atual** — logo, não constrói para a App Store. Mas dá para rodar o app
num iPhone real hoje, de graça, pelo **Expo Go**.

## Passos

1. **Expo Go** na App Store (grátis) no iPhone.
2. iPhone e Mac na **mesma rede Wi-Fi**.
3. No Mac, três processos:

```bash
# banco
pg_ctl -D ~/Downloads/veloce-devdb -o "-p 5433 -k /tmp -c listen_addresses=127.0.0.1" \
  -l ~/Downloads/veloce-devdb/server.log start     # LC_ALL=C

# backend
cd ~/Downloads/veloce-mobile && npm run dev

# app
cd ~/Downloads/veloce-mobile/apps/mobile && npx expo start --lan
```

4. Dados de demonstração:

```bash
cd ~/Downloads/veloce-mobile
DEV_LAN_IP=$(ipconfig getifaddr en0) npx tsx scripts/seed-mobile-dev.ts
```

O script imprime o link do painel, o e-mail e a senha. Ele **se recusa a rodar**
contra qualquer banco que não seja local.

5. Escanear o QR do `expo start` com a câmera do iPhone.
6. No app, colar o link impresso pelo seed e entrar.

O link já vem com o IP da rede (`http://192.168.x.x:3000/r/<token>`), e
`resolveApiBase` aceita faixa LAN com HTTP **apenas em desenvolvimento** —
produção continua exigindo HTTPS.

## O que dá para validar assim

- Renderização real: safe areas, notch, teclado, rolagem de histórico longo.
- Vínculo do aparelho e login; credencial no Keychain.
- Marca do cliente aplicada em runtime (cor e nome vindos de `/me`).
- Lista de conversas, busca, "só minhas", etiquetas, funil, origem do anúncio.
- Thread com ticks de entrega e leitura.
- **Janela de 24h**: o lead "Carlos" tem última mensagem de 3 dias atrás — a barra
  de envio deve aparecer desabilitada.
- Permissões de câmera, galeria e microfone.
- **Formato do áudio gravado** — a incerteza aberta desde a análise: confirmar que
  o `RecordingPresets.HIGH_QUALITY` produz `.m4a` (`audio/mp4`).
- Navegação, estados de carregando/erro/vazio.

## O que NÃO dá para validar no Expo Go

- **Push APNs**: o Expo Go usa o serviço de push do Expo, não o nosso APNs com o
  nosso bundle id. Exige build próprio → conta Apple Developer.
- **Deep link em cold start** com o esquema `veloce://`: no Expo Go o esquema é o
  dele.
- Ícone, splash e o bundle id `io.veloce.portal`.
- Comportamento de build de produção (Hermes em release, tamanho final).

## Envio real de mensagem

O `WaConnection` da demo tem token falso: a UI de envio funciona até a borda e o
erro da Meta aparece na tela. **Não** mande mensagem de teste apontando para um
`WaConnection` real — isso escreveria no WhatsApp de um cliente.

## Quando a conta Apple passar a ser necessária

Só para: build próprio (EAS Build, que roda **na nuvem** — este Mac não precisa
compilar), APNs de verdade, TestFlight e a submissão.

**A conta de US$ 99 não resolve o problema deste Mac; o EAS Build resolve.** Não é
preciso trocar de máquina para publicar.
