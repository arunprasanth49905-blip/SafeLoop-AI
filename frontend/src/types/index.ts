/**
 * SafeLoop AI Frontend Types
 */

export type NavigationTab =
  | 'overview'
  | 'playground'
  | 'feedback'
  | 'memory'
  | 'safety'
  | 'evaluation'
  | 'settings';

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface AgentStatusResponse {
  provider: string;
  configured: boolean;
  model: string | null;
  status_message: string;
}

export interface SystemStatusState {
  health: HealthResponse | null;
  agent: AgentStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  lastChecked: Date | null;
  checkStatus: () => Promise<void>;
}
