import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CameraFeed from "./pages/CameraFeed";
import SurveillanceAnalysis from "./pages/SurveillanceAnalysis";
import Cameras from "./pages/Cameras";
import Reports from "./pages/Reports";
import Intelligence from "./pages/Intelligence";
import UserDetails from "./pages/UserDetails";

export default function App() {
  return (
    <Routes>
      {/* Wireframe 2 — Login / Entry Portal */}
      <Route path="/" element={<Login />} />

      {/* Wireframe 1 — Main Dashboard */}
      <Route path="/dashboard" element={<Dashboard />} />

      {/* Multi-Camera Tactical Feeds */}
      <Route path="/dashboard/feed" element={<CameraFeed />} />
      <Route path="/dashboard/camera-feed" element={<CameraFeed />} />

      {/* Surveillance Computer Vision Analysis */}
      <Route path="/dashboard/analysis" element={<SurveillanceAnalysis />} />
      <Route path="/dashboard/camera-alert" element={<SurveillanceAnalysis />} />

      {/* Camera Fleet Management */}
      <Route path="/dashboard/cameras" element={<Cameras />} />

      {/* Official Security Reports */}
      <Route path="/dashboard/reports" element={<Reports />} />

      {/* Tactical Intelligence Logs */}
      <Route path="/dashboard/intelligence" element={<Intelligence />} />
      <Route path="/dashboard/guidance" element={<Intelligence />} />

      {/* User / Operator Security Dossier */}
      <Route path="/dashboard/user" element={<UserDetails />} />
      <Route path="/dashboard/user-details" element={<UserDetails />} />

      {/* Catch-all fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
