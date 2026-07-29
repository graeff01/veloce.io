import { COMPANY } from "@/lib/company";
import { legalWrap, legalH1, legalSub, legalH2, legalUl, legalFoot } from "@/components/legal-styles";

// Corpo dos Termos de Serviço da Veloce. Fonte única — usado na página pública /termos
// e no modal do login do portal. Sem hooks (renderiza em server e client).
export function TermsOfServiceContent() {
  return (
    <div style={legalWrap}>
      <h1 style={legalH1}>Termos de Serviço</h1>
      <p style={legalSub}>Última atualização: {COMPANY.updatedAt}</p>

      <p>
        Estes Termos regem o uso da plataforma <strong>{COMPANY.name}</strong>, operada por{" "}
        <strong>{COMPANY.legalName}</strong> (CNPJ {COMPANY.cnpj}), doravante &quot;{COMPANY.name}&quot;.
        Ao acessar ou utilizar a plataforma, a empresa contratante e seus usuários concordam com
        estes Termos. Se não concordar, não utilize o serviço.
      </p>

      <h2 style={legalH2}>1. O serviço</h2>
      <p>
        A {COMPANY.name} fornece uma plataforma de atendimento comercial automatizado por
        inteligência artificial no WhatsApp, com painel de gestão, funil e relatórios, prestada às
        empresas clientes conforme o plano contratado. O serviço é uma ferramenta de apoio ao
        atendimento; a decisão de venda, as ofertas e os preços são de responsabilidade da empresa
        cliente.
      </p>

      <h2 style={legalH2}>2. Cadastro e acesso</h2>
      <ul style={legalUl}>
        <li>O acesso é feito por e-mail e senha; o usuário é responsável por manter suas credenciais em sigilo.</li>
        <li>A empresa cliente é responsável pelas contas de sua equipe e pelo uso que fizerem da plataforma.</li>
        <li>Podemos suspender acessos em caso de uso indevido, fraude ou violação destes Termos.</li>
      </ul>

      <h2 style={legalH2}>3. Uso aceitável</h2>
      <p>É vedado utilizar a plataforma para:</p>
      <ul style={legalUl}>
        <li>Enviar spam, mensagens não solicitadas ou em desacordo com as políticas do WhatsApp e da Meta;</li>
        <li>Praticar atividades ilícitas, enganosas ou que violem direitos de terceiros;</li>
        <li>Tentar acessar indevidamente sistemas, dados ou contas de outros clientes;</li>
        <li>Copiar, revender, sublicenciar ou fazer engenharia reversa da plataforma.</li>
      </ul>

      <h2 style={legalH2}>4. Planos, valores e pagamento</h2>
      <p>
        Os valores, o volume de atendimentos incluído e as condições de pagamento são os definidos
        no contrato/plano firmado com a empresa cliente. O atraso pode ensejar suspensão do serviço,
        conforme o contrato.
      </p>

      <h2 style={legalH2}>5. Propriedade intelectual</h2>
      <p>
        A plataforma {COMPANY.name}, incluindo software, modelos de IA, marca e metodologia, é de
        propriedade exclusiva da {COMPANY.name}. A empresa cliente recebe apenas uma licença de uso,
        não exclusiva e intransferível, durante a vigência do contrato.
      </p>

      <h2 style={legalH2}>6. Dados e privacidade</h2>
      <p>
        O tratamento de dados pessoais segue a nossa Política de Privacidade e a Lei nº 13.709/2018
        (LGPD). A empresa cliente é a controladora dos dados dos seus próprios clientes; a
        {" "}{COMPANY.name} atua como operadora.
      </p>

      <h2 style={legalH2}>7. Disponibilidade e limitação de responsabilidade</h2>
      <p>
        Empenhamo-nos na disponibilidade e na qualidade do serviço em regime de melhor esforço, mas
        não garantimos operação ininterrupta nem resultado comercial específico, e não respondemos
        por falhas de terceiros (por exemplo, WhatsApp/Meta, provedores de IA ou conectividade). Na
        máxima extensão permitida em lei, a responsabilidade limita-se ao previsto no contrato.
      </p>

      <h2 style={legalH2}>8. Vigência e encerramento</h2>
      <p>
        Estes Termos vigoram enquanto durar o uso da plataforma. O encerramento segue as condições
        do contrato firmado. Encerrado o serviço, os dados são tratados conforme a Política de
        Privacidade.
      </p>

      <h2 style={legalH2}>9. Alterações</h2>
      <p>
        Podemos atualizar estes Termos a qualquer tempo; a versão vigente é sempre a publicada nesta
        página, com a data de atualização acima. O uso continuado após mudanças implica concordância.
      </p>

      <h2 style={legalH2}>10. Contato e foro</h2>
      <p>
        Dúvidas sobre estes Termos: <a href={`mailto:${COMPANY.email}`} style={{ color: "#4F46E5" }}>{COMPANY.email}</a>.
        Fica eleito o foro de {COMPANY.city} para dirimir questões oriundas destes Termos.
      </p>

      <p style={legalFoot}>© {new Date().getFullYear()} {COMPANY.name}. Todos os direitos reservados.</p>
    </div>
  );
}
