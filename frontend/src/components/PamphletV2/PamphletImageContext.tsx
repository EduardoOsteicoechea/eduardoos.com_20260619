/**
 * PamphletImageContext.tsx — User + pamphlet scope for resolving legacy content image keys.
 */
import { createContext, useContext, type ReactNode } from "react";

export interface PamphletImageContextValue {
  pamphletId: string;
  userEmail: string | null;
}

const PamphletImageContext = createContext<PamphletImageContextValue>({
  pamphletId: "active",
  userEmail: null,
});

export function PamphletImageProvider({
  pamphletId,
  userEmail,
  children,
}: PamphletImageContextValue & { children: ReactNode }) {
  return (
    <PamphletImageContext.Provider value={{ pamphletId, userEmail }}>
      {children}
    </PamphletImageContext.Provider>
  );
}

export function usePamphletImageContext(): PamphletImageContextValue {
  return useContext(PamphletImageContext);
}
