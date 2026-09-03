import { ListaConversas } from "../../src/ui/lista-conversas";

// Mesmo recorte do ?tab=ads do portal: leads que vieram de anúncio.
export default function Anuncios() {
  return <ListaConversas filtro="anuncios" titulo="Vindos de anúncio" />;
}
