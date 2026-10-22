import React, { useState } from 'react';
import { DashboardLayout } from './layouts/DashboardLayout';
import { OverviewPage } from './pages/OverviewPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { MemoryPage } from './pages/MemoryPage';
import { SafetyPage } from './pages/SafetyPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { SettingsPage } from './pages/SettingsPage';
import { useSystemStatus } from './hooks/useSystemStatus';
import { NavigationTab } from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const systemStatus = useSystemStatus();

  const renderActivePage = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPage systemStatus={systemStatus} />;
      case 'playground':
        return <PlaygroundPage systemStatus={systemStatus} />;
      case 'feedback':
        return <FeedbackPage />;
      case 'memory':
        return <MemoryPage />;
      case 'safety':
        return <SafetyPage />;
      case 'evaluation':
        return <EvaluationPage />;
      case 'settings':
        return <SettingsPage systemStatus={systemStatus} />;
      default:
        return <OverviewPage systemStatus={systemStatus} />;
    }
  };

  return (
    <DashboardLayout
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      systemStatus={systemStatus}
    >
      {renderActivePage()}
    </DashboardLayout>
  );
};

export default App;
