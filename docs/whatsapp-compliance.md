# WhatsApp — Conformidade e Risco de Ban (Veloce IA)

> Documento central de risco. Objetivo: garantir que a IA de atendimento e o
> "modo operador" (entrega de fichas) **não derrubem o número oficial do cliente**.
> Última pesquisa: jun/2026 (fontes no fim).

## TL;DR — Veredito

| Item | Veredito | Por quê |
|---|---|---|
| **A IA que temos hoje** (atende/qualifica lead de anúncio fora do horário) | ✅ **Permitido** | É bot **task-specific** (escopo da loja), responde só a quem **mandou mensagem primeiro** (dentro da janela de 24h), recusa off-topic e tem handoff humano. É exatamente o padrão que a Meta permite. |
| **Modo operador** (triadora manda msg de manhã → IA devolve as fichas) | ✅ **Permitido** | A triadora **inicia** a conversa → abre a **janela de serviço de 24h** → a empresa pode mandar mensagem **livre (free-form), sem template**, por 24h. É o desenho oficial da plataforma. |

Nenhum dos dois burla regra. Os dois usam a **janela de atendimento de 24h** (conversa iniciada pelo usuário), que é o mecanismo legítimo do WhatsApp Business Platform.

---

## 1. A regra de IA da Meta (jan/2026)

- **Banido:** "general-purpose AI chatbot" — assistente de domínio aberto (tipo ChatGPT/Perplexity no WhatsApp) onde o usuário "pergunta qualquer coisa". Gera volume sem propósito de negócio.
- **Permitido:** automações **task-specific** ancoradas num serviço de negócio — atendimento/FAQ, pedidos, agendamento, qualificação de lead, etc.
- **Vigência:** novos números a partir de 15/out/2025; números existentes têm até **15/jan/2026** para se adequar.

**Nossa IA se enquadra no PERMITIDO** porque:
- Escopo **estrito** ao produto da loja + estado do lead (não responde fora disso).
- **Recusa off-topic** (testado: "qual a capital da França?" → "aqui é de carros").
- Tem **handoff humano** (`escalar_humano`) — exigência explícita de compliance.
- Não funciona como assistente geral; o bot é **ancilar** ao serviço da loja.

**Regras para manter o enquadramento (NÃO quebrar):**
1. Não transformar a IA em assistente geral. Manter o escopo travado.
2. Manter a recusa de off-topic e o caminho de handoff humano.
3. Documentar o caso de uso (atendimento/qualificação) — este doc serve a isso.

---

## 2. A janela de atendimento de 24h (base dos dois fluxos)

- Quando **o usuário** manda mensagem (ou liga), abre uma **janela de 24h**.
- Dentro da janela a empresa manda **mensagens livres ilimitadas** (texto, imagem, vídeo, arquivo) — **sem template, sem custo** de template.
- **Cada nova mensagem do usuário reseta** a janela para 24h.
- **Fora da janela:** só **template aprovado** pela Meta.
- **Implied opt-in não vale** para mensagem iniciada pela empresa — mas **quando o cliente fala primeiro, pode responder livre** sem novo opt-in.

**Consequência prática:**
- IA respondendo lead = lead mandou primeiro → janela aberta → **livre**. ✅
- Modo operador = triadora manda "manda os leads" → janela dela aberta → IA devolve fichas **livre** por 24h. ✅ Ela reabre todo dia de manhã.

---

## 3. O que REALMENTE derruba conta (e como nos blindamos)

| Causa de ban/restrição | Risco nosso | Mitigação (já feita / a manter) |
|---|---|---|
| **Mensagem não solicitada** a quem não fez opt-in / não tem o número salvo | Baixo | Só respondemos quem **mandou primeiro**. NUNCA iniciamos com lead sem template+opt-in. |
| **Blocks/reports** de usuários (derruba o *quality rating* Verde→Amarelo→Vermelho) | Baixo-Médio | Ser útil e não-robótico; **honrar opt-out** (já implementado); não insistir; 1 resposta por mensagem recebida. |
| **Volume/velocidade** (rajada de msgs) | Baixo | ~1 resposta por inbound; recomendação do setor é 1–4 msgs/h por chat com interação real — estamos dentro. |
| **Ferramenta não-oficial** (Baileys, whatsapp-web.js, WhatsApp modificado) = ban quase certo | **Nenhum** | Usamos **só a Cloud API oficial** (graph.facebook.com). **NUNCA** usar lib não-oficial pra "mandar em grupo" ou afins. |
| **Conteúdo proibido** (adulto, ilegal, MLM, etc.) | Nenhum | Escopo é carros/atendimento. |
| **Assistente geral** (regra jan/2026) | Nenhum | Escopo travado + recusa off-topic. |

### Quality rating
Conta nova começa num **tier** de conversas/dia (ex.: 250 → 1k → 10k…), escala automático **se a qualidade for boa** (poucos blocks/reports). Responder a inbound (conversas de serviço) é o uso mais seguro. Para o volume de **uma loja**, sobra folga.

---

## 4. Pontos de atenção (gray areas a controlar)

1. **Nunca iniciar conversa com o LEAD sem template + opt-in.** Hoje só respondemos. Se um dia quisermos follow-up proativo ("ainda tem interesse?"), **exige template utilitário aprovado + opt-in registrado**. Isso é compliance, não opcional.
2. **Modo operador depende da janela da triadora.** Se ela esquecer de mandar a msg matinal, a janela fecha e a IA não consegue empurrar ficha até ela falar de novo.
   - *Belt-and-suspenders (opcional):* um **template utilitário aprovado** ("Você tem N leads novos") pode cutucá-la mesmo com a janela fechada — também é compliant (template utilitário para staff que consente).
3. **O número de operador NÃO pode ser o próprio número da BV** (esse é da IA, na Cloud API).
4. **Privacidade (LGPD):** a triadora recebe dados de leads (nome/telefone). É tratamento legítimo (leads da própria loja, repassados à própria equipe). Já coberto pela redaction/retenção/audit log do sistema.

---

## 5. Regras de ouro (checklist por cliente)

- [ ] Número na **Cloud API oficial** (nunca lib não-oficial).
- [ ] IA com **escopo travado** + recusa off-topic + handoff humano.
- [ ] IA **só responde inbound** (nunca inicia com lead sem template+opt-in).
- [ ] **Opt-out** ativo e honrado.
- [ ] Número de operador cadastrado ≠ número da IA.
- [ ] Monitorar **quality rating** no WhatsApp Manager (manter Verde).

---

## Fontes

- [Not All Chatbots Are Banned: WhatsApp's 2026 AI Policy (respond.io)](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)
- [WhatsApp AI Policy 2026 Guide (Alibaba Cloud)](https://www.alibabacloud.com/help/en/chatapp/use-cases/whatsapp-ai-policy-2026-guide)
- [Meta muda termos p/ barrar chatbots de propósito geral (TechCrunch)](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/)
- [WhatsApp 24-Hour Conversation Window (YCloud)](https://www.ycloud.com/blog/whatsapp-24-hour-conversation-window-explained)
- [WhatsApp Business Platform 24 Hour Rule (Enchant)](https://www.enchant.com/whatsapp-business-platform-24-hour-rule)
- [Service messages (Meta for Developers)](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)
- [WhatsApp Business Banned: Reasons & Prevention (respond.io)](https://respond.io/blog/whatsapp-business-banned)
- [WhatsApp Business Account Banned/Blocked (Sinch)](https://sinch.com/blog/whatsapp-business-account-banned/)
- [WhatsApp Business Messaging Policy (oficial)](https://whatsappbusiness.com/policy/)
- [Get opt-in for WhatsApp (Meta for Developers)](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)
