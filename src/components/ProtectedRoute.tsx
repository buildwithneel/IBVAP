import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "../services/api";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const authenticated = api.isAuthenticated();

  if (!authenticated) {
    // Redirect unauthenticated user to /login with replace so back button doesn't loop
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
