# Submissão à App Store — o que preencher

Preparado antes da conta Apple existir. O que depende dela está marcado como
**[precisa da conta]**.

## Identidade

| Campo | Valor |
| --- | --- |
| Nome | Veloce |
| Bundle ID | `io.veloce.portal` |
| Categoria | Negócios |
| Classificação etária | 4+ (sem conteúdo sensível gerado pelo app) |
| Ícone | `assets/icon.png` — 1024×1024, RGB sem canal alfa ✔ |

## Conta de demonstração para o revisor

O revisor **precisa** entrar. Nunca entregue acesso a um cliente real: as
conversas são de pessoas de verdade e isso violaria a privacidade delas.

```
npx tsx scripts/seed-apple-review.ts
```

O script cria um cliente fictício isolado (`apple-review-demo`), com cinco
conversas inventadas e um orçamento pendente. A conexão de WhatsApp nasce com
credencial inválida de propósito — nenhuma mensagem sai para o mundo. Ele
imprime o link, o e-mail e a senha para colar no formulário de revisão.

Verificado: a conta de revisão **não enxerga conversa de nenhum outro cliente**.

Para remover depois: `npx tsx scripts/seed-apple-review.ts --clean`

### Notas para o revisor (campo "Notes")

> O aplicativo é a versão para atendentes de um portal de atendimento por
> WhatsApp. As contas são criadas pela agência que presta o serviço, não dentro
> do aplicativo — por isso o primeiro acesso exige o link do painel, que a
> agência envia ao cliente. O link e as credenciais de teste estão nos campos
> acima.
>
> A exclusão da conta é feita pela agência, a pedido do titular; o caminho está
> descrito em Perfil › Privacidade e termos › Exclusão de dados.

## Questionário de privacidade (App Privacy)

O que o aplicativo **coleta**, e para quê:

| Dado | Coletado? | Ligado à identidade? | Finalidade |
| --- | --- | --- | --- |
| E-mail | Sim | Sim | Autenticação do atendente |
| Nome | Sim | Sim | Identificar quem respondeu o lead |
| Conteúdo de mensagens | Sim | Sim | Função principal do produto |
| Fotos e áudio | Sim | Sim | Enviados pelo atendente ao lead |
| Identificador de aparelho | Sim | Sim | Sessão e notificação push |
| Localização | Não | — | — |
| Contatos do telefone | Não | — | — |
| Publicidade / rastreamento | Não | — | Não há SDK de anúncio nem rastreio |

Declarar **"não usado para rastreamento"**: o aplicativo não tem SDK de
publicidade, não usa IDFA e não compartilha dado com terceiros para marketing.

## Permissões — textos já no `app.json`

- Câmera: enviar foto ao lead durante o atendimento.
- Fotos: anexar imagem da galeria à conversa.
- Microfone: gravar nota de voz para o lead.

## Criptografia

`ITSAppUsesNonExemptEncryption` já declarado. O app usa apenas HTTPS padrão —
se enquadra na isenção.

## Riscos conhecidos de revisão

**Exclusão de conta.** A Apple exige o fluxo dentro do app quando a conta é
criada nele. Aqui ela é criada pela agência, o que sustenta a exceção — mas o
revisor pode cobrar. A resposta está nas notas acima; se insistirem, o caminho
é implementar um pedido de exclusão dentro do app que abra um chamado.

**Itens "em breve".** A aba Mais lista nove módulos que ainda não têm tela, com
rótulo "em breve" e o toque desabilitado. A Apple reprova conteúdo de
espaço reservado (diretriz 4.2). Antes de submeter, considere **esconder** os
itens sem tela em vez de mostrá-los desabilitados.

## Validação adiada para o build nativo

O **envio ao WhatsApp** — texto, foto, documento e nota de voz — nunca foi
exercitado de ponta a ponta. Não por descuido: na cópia local a credencial do
WhatsApp é neutralizada de propósito (`accessToken = DESATIVADO_COPIA_LOCAL`),
então qualquer envio para em 502 na autenticação com a Meta. Validar de verdade
exige credencial válida, o que significa produção e uma mensagem real chegando
a alguém.

O que JÁ foi verificado desse caminho:

- a rota `send-media` aceita multipart e responde corretamente (testada por
  curl: 502 com "Authentication Error", que é a trava do token);
- o `FormData` do app foi corrigido — o atalho `{ uri, name, type }` do React
  Native antigo é recusado por esta versão com "Unsupported FormDataPart
  implementation", e agora montamos um `Blob` de verdade;
- o tempo limite de envio subiu de 20s para 90s, porque upload não cabe no
  limite de uma leitura.

**O que falta confirmar quando houver conta e build nativo:** que a mensagem
sai, chega ao lead e volta como confirmação de entrega. Testar primeiro em um
número próprio, nunca em lead de cliente.

## Dependências que faltam **[precisa da conta]**

1. Programa Apple Developer (US$ 99/ano).
2. Chave APNs `.p8` registrada no EAS, e a migration `device_token` aplicada.
3. `eas build --profile production` — o Mac desta máquina não compila iOS.
4. Capturas de tela nos tamanhos exigidos.

## Dependências de backend (independem da Apple)

1. Deploy do gate de autorização do portal.
2. Deploy do suporte ao app + migration `portal_session_device`.
   **Sem isso o app não faz login em produção.**
3. `EXPO_PUBLIC_API_URL` como segredo do EAS, apontando ao domínio real.
