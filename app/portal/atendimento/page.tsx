import { redirect } from "next/navigation";

// O portal agora é uma página narrativa única — esta rota leva à seção correspondente.
export default function AtendimentoRedirect() {
  redirect("/portal#atendimento");
}
