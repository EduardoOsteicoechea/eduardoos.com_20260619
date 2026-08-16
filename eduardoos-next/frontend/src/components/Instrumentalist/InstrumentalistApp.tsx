import ServiceGate from "../ServiceGate/ServiceGate";
import InstrumentalistPage from "./InstrumentalistPage";

export default function InstrumentalistApp() {
  return (
    <ServiceGate serviceId="instrumentalist" serviceLabel="Instrumentalist">
      <InstrumentalistPage />
    </ServiceGate>
  );
}
