import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CameraFeed from "./pages/CameraFeed";
import SurveillanceAnalysis from "./pages/SurveillanceAnalysis";
import Cameras from "./pages/Cameras";
import Reports from "./pages/Reports";
import Intelligence from "./pages/Intelligence";
import UserDetails from "./pages/UserDetails";
import Settings from "./pages/Settings";
import ProtectedRoute from "./components/ProtectedRoute";
import { OfficerProfileProvider } from "./context/OfficerProfileContext";
import { SurveillanceStreamProvider } from "./context/SurveillanceStreamContext";
import OfficerProfileDrawer from "./components/OfficerProfileDrawer";

import { ThemeProvider } from "./context/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <OfficerProfileProvider>
        <SurveillanceStreamProvider>
          <OfficerProfileDrawer />
        <Routes>
        {/* Entry Portal - Public Routes */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        {/* Command Dashboard - Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Tactical Feeds */}
        <Route
          path="/dashboard/feed"
          element={
            <ProtectedRoute>
              <CameraFeed />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/camera-feed"
          element={
            <ProtectedRoute>
              <CameraFeed />
            </ProtectedRoute>
          }
        />

        {/* AI Analysis */}
        <Route
          path="/dashboard/analysis"
          element={
            <ProtectedRoute>
              <SurveillanceAnalysis />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/camera-alert"
          element={
            <ProtectedRoute>
              <SurveillanceAnalysis />
            </ProtectedRoute>
          }
        />

        {/* Fleet Management */}
        <Route
          path="/dashboard/cameras"
          element={
            <ProtectedRoute>
              <Cameras />
            </ProtectedRoute>
          }
        />

        {/* Reports & Dossiers */}
        <Route
          path="/dashboard/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />

        {/* Intelligence Logs */}
        <Route
          path="/dashboard/intelligence"
          element={
            <ProtectedRoute>
              <Intelligence />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/guidance"
          element={
            <ProtectedRoute>
              <Intelligence />
            </ProtectedRoute>
          }
        />

        {/* Settings & Camera Management */}
        <Route
          path="/dashboard/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

        {/* User Dossier */}
        <Route
          path="/dashboard/user"
          element={
            <ProtectedRoute>
              <UserDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/user-details"
          element={
            <ProtectedRoute>
              <UserDetails />
            </ProtectedRoute>
          }
        />

        {/* Legacy /app/* Aliases */}
        <Route path="/app" element={<Navigate to="/dashboard" replace />} />
        <Route path="/app/dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/app/feed" element={<Navigate to="/dashboard/feed" replace />} />
        <Route path="/app/cameras" element={<Navigate to="/dashboard/cameras" replace />} />
        <Route path="/app/analysis" element={<Navigate to="/dashboard/analysis" replace />} />
        <Route path="/app/reports" element={<Navigate to="/dashboard/reports" replace />} />
        <Route path="/app/settings" element={<Navigate to="/dashboard/settings" replace />} />

        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </SurveillanceStreamProvider>
    </OfficerProfileProvider>
    </ThemeProvider>
  );
}
