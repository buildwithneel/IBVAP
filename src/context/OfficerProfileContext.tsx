import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { OperatorProfile } from "../types";
import { getOfficerProfile, mockOperator } from "../data/mockData";

interface OfficerProfileContextType {
  isOpen: boolean;
  activeOfficer: OperatorProfile | null;
  openProfile: (nameOrProfile?: string | OperatorProfile) => void;
  closeProfile: () => void;
}

const OfficerProfileContext = createContext<OfficerProfileContextType | undefined>(undefined);

export function OfficerProfileProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeOfficer, setActiveOfficer] = useState<OperatorProfile | null>(null);

  const openProfile = useCallback((nameOrProfile?: string | OperatorProfile) => {
    if (!nameOrProfile) {
      setActiveOfficer(mockOperator);
    } else if (typeof nameOrProfile === "string") {
      setActiveOfficer(getOfficerProfile(nameOrProfile));
    } else {
      setActiveOfficer(nameOrProfile);
    }
    setIsOpen(true);
  }, []);

  const closeProfile = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <OfficerProfileContext.Provider
      value={{
        isOpen,
        activeOfficer,
        openProfile,
        closeProfile,
      }}
    >
      {children}
    </OfficerProfileContext.Provider>
  );
}

export function useOfficerProfile() {
  const context = useContext(OfficerProfileContext);
  if (!context) {
    throw new Error("useOfficerProfile must be used within an OfficerProfileProvider");
  }
  return context;
}
