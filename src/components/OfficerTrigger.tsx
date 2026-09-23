import { ReactNode, MouseEvent, KeyboardEvent } from "react";
import { useOfficerProfile } from "../context/OfficerProfileContext";

interface OfficerTriggerProps {
  name: string;
  className?: string;
  children?: ReactNode;
  title?: string;
  showUnderline?: boolean;
  stopPropagation?: boolean;
}

/**
 * Accessible interactive button for clicking an officer name to open their
 * User Details dossier panel without navigating away.
 */
export default function OfficerTrigger({
  name,
  className = "",
  children,
  title,
  showUnderline = true,
  stopPropagation = true,
}: OfficerTriggerProps) {
  const { openProfile } = useOfficerProfile();

  const handleClick = (e: MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
    openProfile(name);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      if (stopPropagation) {
        e.stopPropagation();
      }
      e.preventDefault();
      openProfile(name);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={title || `View officer profile for ${name}`}
      aria-label={`View officer profile for ${name}`}
      className={`inline-flex items-center text-left font-medium transition-colors cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-navy-400 focus:ring-offset-1 ${
        showUnderline
          ? "hover:text-blue-600 hover:underline underline-offset-2"
          : "hover:text-white"
      } ${className}`}
    >
      {children || name}
    </button>
  );
}
