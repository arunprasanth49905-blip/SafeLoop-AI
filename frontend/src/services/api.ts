/**
 * SafeLoop AI API Client
 * Provides typed methods for contacting the FastAPI backend services.
 */

import { AgentStatusResponse, HealthResponse } from '../types';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

class ApiError extends Error {
  public status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
    });
    return response;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`);
    }
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError(`Failed to connect to backend at ${API_BASE_URL}: ${message}`);
  } finally {
    clearTimeout(id);
  }
}

export const apiService = {
  getBaseUrl(): string {
    return API_BASE_URL;
  },

  /**
   * Fetches backend health status from GET /health
   */
  async getHealth(): Promise<HealthResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new ApiError(`Health check returned status ${response.status}`, response.status);
    }
    return (await response.json()) as HealthResponse;
  },

  /**
   * Fetches AI Agent provider status from GET /api/agent/status
   */
  async getAgentStatus(): Promise<AgentStatusResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/agent/status`);
    if (!response.ok) {
      throw new ApiError(`Agent status check returned status ${response.status}`, response.status);
    }
    return (await response.json()) as AgentStatusResponse;
  },
};
