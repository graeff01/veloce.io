import { COMPANY } from "@/lib/company";
import { legalWrap, legalH1, legalSub, legalH2, legalUl, legalFoot } from "@/components/legal-styles";

// Exclusão de Dados + Direitos do Titular (LGPD). Fonte única — página pública
// /exclusao-de-dados (serve como "Data Deletion URL" exigida pela Meta) e modal do login.
export function DataDeletionContent() {
  return (
    <div style={legalWrap}>
      <h1 style={legalH1}>Exclusão de Dados e Direitos do Titular</h1>
      <p style={legalSub}>Última atualização: {COMPANY.updatedAt}</p>

      <p>
        A <strong>{COMPANY.name}</strong> respeita os direitos garantidos pela Lei nº 13.709/2018
        (LGPD). Esta página explica como solicitar a <strong>exclusão dos seus dados</strong> e
        exercer os demais direitos como titular.
      </p>

      <h2 style={legalH2}>Seus direitos (LGPD)</h2>
      <ul style={legalUl}>
        <li>Confirmar a existência de tratamento e acessar seus dados;</li>
        <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
        <li>Solicitar a anonimização, o bloqueio ou a <strong>exclusão</strong> dos dados;</li>
        <li>Solicitar a portabilidade e informações sobre compartilhamento;</li>
        <li>Revogar o consentimento e opor-se a tratamentos.</li>
      </ul>

      <h2 style={legalH2}>Como solicitar a exclusão dos seus dados</h2>
      <ul style={legalUl}>
        <li>
          <strong>Pelo WhatsApp:</strong> se você é um cliente que conversou com uma empresa atendida
          pela plataforma, basta responder à conversa pedindo o <strong>descadastramento</strong> ou
          a exclusão dos seus dados — respeitamos o opt-out e interrompemos o envio de mensagens
          automáticas.
        </li>
        <li>
          <strong>Por e-mail:</strong> envie um pedido para{" "}
          <a href={`mailto:${COMPANY.privacyEmail}?subject=Solicitação de exclusão de dados`} style={{ color: "#4F46E5" }}>{COMPANY.privacyEmail}</a>,
          informando o nome e o número de telefone usado no atendimento, para localizarmos e excluir
          seus dados.
        </li>
      </ul>
      <p>
        Confirmaremos e atenderemos o pedido em prazo razoável, ressalvadas as hipóteses de guarda
        obrigatória previstas em lei. Observação: em regra, a <strong>empresa cliente</strong> que
        atendeu você é a controladora dos dados; a {COMPANY.name} atua como operadora e encaminha o
        pedido quando aplicável.
      </p>

      <h2 style={legalH2}>Encarregado de Dados (DPO)</h2>
      <p>
        Nosso Encarregado pela Proteção de Dados é <strong>{COMPANY.dpoName}</strong>. Para exercer
        seus direitos ou tirar dúvidas sobre privacidade, contate:{" "}
        <a href={`mailto:${COMPANY.dpoEmail}`} style={{ color: "#4F46E5" }}>{COMPANY.dpoEmail}</a>.
      </p>

      <p style={legalFoot}>© {new Date().getFullYear()} {COMPANY.name}. Todos os direitos reservados.</p>
    </div>
  );
}
