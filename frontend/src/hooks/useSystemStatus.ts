/**
 * Custom hook to monitor backend health and agent readiness.
 * Avoids aggressive polling while giving clean real-time status.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { AgentStatusResponse, HealthResponse, SystemStatusState } from '../types';

export function useSystemStatus(): SystemStatusState {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [agent, setAgent] = useState<AgentStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Parallel execution for health and agent status
      const [healthRes, agentRes] = await Promise.all([
        apiService.getHealth(),
        apiService.getAgentStatus().catch(() => null), // Agent status failure handled gracefully
      ]);

      setHealth(healthRes);
      setAgent(agentRes);
      setLastChecked(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Backend connection unavailable';
      setError(msg);
      setHealth(null);
      setAgent(null);
      setLastChecked(new Date());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount
    checkStatus();
  }, [checkStatus]);

  return {
    health,
    agent,
    isLoading,
    error,
    lastChecked,
    checkStatus,
  };
}
