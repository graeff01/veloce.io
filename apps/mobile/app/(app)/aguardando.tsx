import { ListaConversas } from "../../src/ui/lista-conversas";

// Mesmo recorte do ?tab=waiting do portal: leads cuja última mensagem é do LEAD.
export default function Aguardando() {
  return <ListaConversas filtro="aguardando" titulo="Aguardando resposta" />;
}
