import React from 'react';
import {
  LayoutDashboard,
  Bot,
  MessageSquarePlus,
  BrainCircuit,
  ShieldCheck,
  BarChart3,
  Settings,
} from 'lucide-react';
import { NavigationTab } from '../types';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

interface NavItemConfig {
  id: NavigationTab;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'playground', label: 'AI Playground', icon: Bot },
  { id: 'feedback', label: 'Feedback', icon: MessageSquarePlus },
  { id: 'memory', label: 'Learning Memory', icon: BrainCircuit },
  { id: 'safety', label: 'Safety Monitor', icon: ShieldCheck },
  { id: 'evaluation', label: 'Evaluation', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/safeloop-logo.svg" alt="SafeLoop AI Logo" className="logo-icon" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="brand-text">SafeLoop AI</span>
          <span className="brand-badge">Phase 1</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main Navigation">
        {NAV_ITEMS.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <IconComponent size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Architecture</span>
          <span style={{ color: 'var(--text-secondary)' }}>Agentic Closed-Loop</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Foundation</span>
          <span style={{ color: 'var(--accent-cyan)' }}>v0.1.0 Ready</span>
        </div>
      </div>
    </aside>
  );
};
