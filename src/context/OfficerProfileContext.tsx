import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { OperatorProfile } from "../types";
import { api } from "../services/api";

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
    const user = api.getStoredUser();

    if (typeof nameOrProfile === "object" && nameOrProfile !== null) {
      setActiveOfficer(nameOrProfile);
    } else {
      const name = typeof nameOrProfile === "string" ? nameOrProfile : user?.name || "Duty Officer";
      setActiveOfficer({
        name,
        officerId: user?.badgeNumber || "SSB-SEC-8421",
        designation: user?.role || "Duty Officer",
        role: user?.role || "Border Surveillance Operator",
        organization: "Sashastra Seema Bal (SSB)",
        forceUnit: user?.unit || "Border Security Force",
        deploymentStation: "Sector Alpha Command Terminal",
        clearanceLevel: "Level-3 (Restricted Surveillance)",
        status: "Active",
        assignment: "Perimeter Optical Monitoring",
        sessionStatus: "Authenticated",
        lastActivity: "Active Session",
        activeSessionIp: "10.142.1.88",
        loginTime: new Date().toLocaleTimeString("en-IN"),
        lastAuditDate: new Date().toISOString().slice(0, 10),
        contactExtension: "Ext. 4100",
        permissions: (user?.permissions || ["view_feeds", "acknowledge_alerts"]).map((p) => ({
          label: p.toUpperCase().replace(/_/g, " "),
          status: "Granted" as const,
        })),
        sessionLog: [
          { time: new Date().toLocaleTimeString("en-IN"), action: "Terminal Authentication", status: "OK" as const },
        ],
      });
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
