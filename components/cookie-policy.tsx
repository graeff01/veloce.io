import { COMPANY } from "@/lib/company";
import { legalWrap, legalH1, legalSub, legalH2, legalUl, legalFoot } from "@/components/legal-styles";

// Política de Cookies da Veloce. Fonte única — página pública /cookies e modal do login.
export function CookiePolicyContent() {
  return (
    <div style={legalWrap}>
      <h1 style={legalH1}>Política de Cookies</h1>
      <p style={legalSub}>Última atualização: {COMPANY.updatedAt}</p>

      <p>
        Esta Política explica como a <strong>{COMPANY.name}</strong> utiliza cookies e tecnologias
        semelhantes na sua plataforma, em conformidade com a LGPD (Lei nº 13.709/2018).
      </p>

      <h2 style={legalH2}>1. O que são cookies</h2>
      <p>
        Cookies são pequenos arquivos guardados no seu navegador que permitem que a plataforma
        funcione e lembre de preferências. Também usamos armazenamento local (localStorage) para fins
        semelhantes.
      </p>

      <h2 style={legalH2}>2. Cookies que utilizamos</h2>
      <ul style={legalUl}>
        <li><strong>Essenciais:</strong> necessários para o login, a sessão autenticada e a segurança. Sem eles a plataforma não funciona; por isso não dependem de consentimento.</li>
        <li><strong>Preferências:</strong> lembram escolhas como o tema (claro/escuro) e o consentimento de cookies.</li>
        <li><strong>Analíticos (se ativados):</strong> ajudam a entender o uso de forma agregada para melhorar o serviço.</li>
      </ul>
      <p>Não utilizamos cookies para publicidade de terceiros nem vendemos dados.</p>

      <h2 style={legalH2}>3. Como gerenciar</h2>
      <p>
        Você pode aceitar ou recusar cookies não essenciais no aviso exibido ao acessar a plataforma,
        e pode apagar cookies e o armazenamento local a qualquer momento nas configurações do seu
        navegador. Bloquear cookies essenciais pode impedir o funcionamento do serviço.
      </p>

      <h2 style={legalH2}>4. Contato</h2>
      <p>
        Dúvidas sobre esta Política de Cookies:{" "}
        <a href={`mailto:${COMPANY.privacyEmail}`} style={{ color: "#4F46E5" }}>{COMPANY.privacyEmail}</a>.
      </p>

      <p style={legalFoot}>© {new Date().getFullYear()} {COMPANY.name}. Todos os direitos reservados.</p>
    </div>
  );
}
