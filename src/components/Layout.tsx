import React, { useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

interface LayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function Layout({ title, subtitle, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-gov-bg text-navy-900">
      {/* Sidebar with responsive toggle */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content body */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopBar
          title={title}
          subtitle={subtitle}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        {/* Scrollable page viewport with subtle CSS enter transition */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 animate-page-enter">
          {children}
        </main>
      </div>
    </div>
  );
}
