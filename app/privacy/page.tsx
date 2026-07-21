import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — Veloce",
  description: "Como a Veloce coleta, usa e protege os dados no atendimento via WhatsApp.",
};

// Página PÚBLICA (fora do grupo (dashboard)) — usada como URL de política de
// privacidade do app da Meta/WhatsApp e para conformidade LGPD.
const ATUALIZADO_EM = "21 de julho de 2026";
const CONTATO_EMAIL = "contato@veloce.io"; // TODO: confirmar o e-mail oficial da Veloce

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 96px", color: "#1f2937", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.65 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <img src="/logo.png" alt="Veloce" width={40} height={40} style={{ borderRadius: 8 }} />
        <span style={{ fontWeight: 700, fontSize: 18, color: "#4F46E5" }}>Veloce</span>
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 800, margin: "16px 0 4px" }}>Política de Privacidade</h1>
      <p style={{ color: "#6b7280", marginTop: 0 }}>Última atualização: {ATUALIZADO_EM}</p>

      <p>
        Esta Política descreve como a <strong>Veloce</strong> (&quot;nós&quot;) coleta, utiliza,
        compartilha e protege informações no âmbito da nossa plataforma de atendimento e
        automação de conversas por WhatsApp, prestada às empresas nossas clientes. Estamos
        comprometidos com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e com as
        políticas da Meta Platforms para a WhatsApp Business Platform.
      </p>

      <h2 style={h2}>1. Quem somos e nosso papel</h2>
      <p>
        A Veloce fornece uma plataforma que ajuda empresas a atender seus clientes no WhatsApp,
        incluindo respostas automatizadas por inteligência artificial, organização de leads e
        relatórios. Em regra, a <strong>empresa cliente</strong> que contrata a Veloce é a
        controladora dos dados dos seus próprios clientes, e a Veloce atua como
        <strong> operadora</strong>, tratando os dados conforme as instruções dela e esta Política.
      </p>

      <h2 style={h2}>2. Dados que coletamos</h2>
      <ul style={ul}>
        <li><strong>Dados de contato e conversa:</strong> nome de perfil, número de telefone e o conteúdo das mensagens trocadas no WhatsApp (texto, imagens, áudios e mídias enviadas pelo cliente).</li>
        <li><strong>Dados de atendimento:</strong> etapa do funil, interesses, orçamentos gerados e observações registradas durante o atendimento.</li>
        <li><strong>Dados de origem de anúncios:</strong> quando o contato vem de um anúncio (Clique-para-WhatsApp), podemos registrar o anúncio de origem para fins de análise.</li>
        <li><strong>Dados técnicos:</strong> identificadores de mensagem, data/hora e status de entrega, necessários ao funcionamento do serviço.</li>
      </ul>

      <h2 style={h2}>3. Como usamos os dados</h2>
      <ul style={ul}>
        <li>Responder e dar continuidade ao atendimento iniciado pelo cliente no WhatsApp.</li>
        <li>Gerar orçamentos, encaminhar para um vendedor humano e organizar os leads.</li>
        <li>Transcrever áudios e gerar respostas por meio de modelos de inteligência artificial.</li>
        <li>Produzir métricas e relatórios agregados para a empresa cliente.</li>
      </ul>
      <p>Não vendemos dados pessoais e não os utilizamos para publicidade de terceiros.</p>

      <h2 style={h2}>4. Compartilhamento com terceiros</h2>
      <p>Compartilhamos dados apenas com provedores essenciais à operação, sob obrigações de confidencialidade:</p>
      <ul style={ul}>
        <li><strong>Meta Platforms / WhatsApp</strong> — para envio e recebimento das mensagens (WhatsApp Business Platform).</li>
        <li><strong>Provedores de IA</strong> (ex.: OpenAI, ElevenLabs, Groq) — para gerar respostas, transcrever áudios e sintetizar voz.</li>
        <li><strong>Infraestrutura de nuvem</strong> — para hospedagem segura da aplicação e do banco de dados.</li>
      </ul>

      <h2 style={h2}>5. Retenção</h2>
      <p>
        Mantemos os dados pelo tempo necessário à prestação do serviço à empresa cliente e ao
        cumprimento de obrigações legais. A pedido da empresa cliente ou do titular, os dados
        podem ser excluídos, ressalvadas as hipóteses de guarda obrigatória.
      </p>

      <h2 style={h2}>6. Seus direitos (LGPD)</h2>
      <p>Você pode solicitar acesso, correção, portabilidade, anonimização ou exclusão dos seus dados, bem como revogar o consentimento. Para não receber mais mensagens automáticas, basta responder pedindo o descadastramento — respeitamos o opt-out.</p>

      <h2 style={h2}>7. Segurança</h2>
      <p>Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo criptografia de credenciais sensíveis, controle de acesso e validação da autenticidade das mensagens recebidas.</p>

      <h2 style={h2}>8. Contato</h2>
      <p>
        Para exercer seus direitos ou tirar dúvidas sobre esta Política, entre em contato:
        {" "}<a href={`mailto:${CONTATO_EMAIL}`} style={{ color: "#4F46E5" }}>{CONTATO_EMAIL}</a>.
      </p>

      <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 40 }}>© {new Date().getFullYear()} Veloce. Todos os direitos reservados.</p>
    </main>
  );
}

const h2: React.CSSProperties = { fontSize: 19, fontWeight: 700, margin: "32px 0 8px" };
const ul: React.CSSProperties = { paddingLeft: 20, margin: "8px 0" };
