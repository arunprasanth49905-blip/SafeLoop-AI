import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from './layouts/DashboardLayout';
import { OverviewPage } from './pages/OverviewPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { MemoryPage } from './pages/MemoryPage';
import { SafetyPage } from './pages/SafetyPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { ImprovementPage } from './pages/ImprovementPage';
import { WorkflowOptimizationPage } from './pages/WorkflowOptimizationPage';
import { SettingsPage } from './pages/SettingsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useSystemStatus } from './hooks/useSystemStatus';
import { NavigationTab } from './types';

const VALID_TABS: NavigationTab[] = [
  'overview',
  'playground',
  'feedback',
  'evaluation',
  'improvement',
  'memory',
  'workflows',
  'safety',
  'settings',
];

const getTabFromHash = (): NavigationTab => {
  if (typeof window === 'undefined') return 'overview';
  const rawHash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (VALID_TABS.includes(rawHash as NavigationTab)) {
    return rawHash as NavigationTab;
  }
  return 'overview';
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavigationTab>(getTabFromHash);
  const systemStatus = useSystemStatus();

  const handleSelectTab = useCallback((tab: NavigationTab) => {
    setActiveTab(tab);
    if (window.location.hash !== `#${tab}`) {
      window.location.hash = `#${tab}`;
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const tabFromUrl = getTabFromHash();
      setActiveTab(tabFromUrl);
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const renderActivePage = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPage systemStatus={systemStatus} />;
      case 'playground':
        return <PlaygroundPage systemStatus={systemStatus} />;
      case 'feedback':
        return <FeedbackPage />;
      case 'evaluation':
        return <EvaluationPage />;
      case 'improvement':
        return <ImprovementPage />;
      case 'memory':
        return <MemoryPage />;
      case 'workflows':
        return <WorkflowOptimizationPage />;
      case 'safety':
        return <SafetyPage />;
      case 'settings':
        return <SettingsPage systemStatus={systemStatus} />;
      default:
        return <OverviewPage systemStatus={systemStatus} />;
    }
  };

  return (
    <DashboardLayout
      activeTab={activeTab}
      onSelectTab={handleSelectTab}
      systemStatus={systemStatus}
    >
      <ErrorBoundary key={activeTab}>
        {renderActivePage()}
      </ErrorBoundary>
    </DashboardLayout>
  );
};

export default App;
