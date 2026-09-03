import { useSession } from "../../../src/ui/session";
import { ListaConversas } from "../../../src/ui/lista-conversas";

export default function Conversas() {
  const { me } = useSession();
  return <ListaConversas filtro="todas" titulo={me?.brand.name ?? "Conversas"} />;
}
