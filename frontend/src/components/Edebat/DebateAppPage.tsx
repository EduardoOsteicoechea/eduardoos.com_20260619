import ServiceGate from "../ServiceGate/ServiceGate";
import EdebatPage from "../Edebat/EdebatPage";

export default function DebateAppPage() {
  return (
    <ServiceGate serviceId="debate" serviceLabel="Debate App">
      <EdebatPage />
    </ServiceGate>
  );
}
