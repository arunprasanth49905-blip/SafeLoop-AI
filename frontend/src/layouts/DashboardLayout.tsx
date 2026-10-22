import React from 'react';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { NavigationTab, SystemStatusState } from '../types';

interface DashboardLayoutProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  systemStatus: SystemStatusState;
  children: React.ReactNode;
}

const TAB_TITLES: Record<NavigationTab, string> = {
  overview: 'System Overview',
  playground: 'AI Agent Playground',
  feedback: 'Human & Automated Feedback',
  memory: 'Persistent Learning Memory',
  safety: 'Safety & Regression Monitor',
  evaluation: 'Continuous Evaluation',
  settings: 'System Configuration',
};

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  activeTab,
  onSelectTab,
  systemStatus,
  children,
}) => {
  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} onSelectTab={onSelectTab} />
      <div className="main-wrapper">
        <Header title={TAB_TITLES[activeTab]} systemStatus={systemStatus} />
        <main className="content-body" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};
