import axios, { type AxiosInstance } from 'axios';
import { ExecRequestSchema, ExecResultResponseSchema, HealthCheckResponseSchema } from './schemas';
import type { ExecRequest, ExecResponse } from './types';

/**
 * Sandbox SDK
 * Provides type-safe API calls for sandbox operations
 */
export class SandboxSDK {
  private readonly client: AxiosInstance;

  constructor(baseUrl: string, token: string) {
    this.client = axios.create({
      baseURL: `${baseUrl.replace(/\/$/, '')}/v1`,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    });
  }

  /**
   * Execute a command in the sandbox
   */
  async exec(name: string, params: ExecRequest): Promise<ExecResponse> {
    const validated = ExecRequestSchema.parse(params);
    const response = await this.client.post(`/sandbox/${encodeURIComponent(name)}/exec`, validated);
    const result = ExecResultResponseSchema.parse(response.data);
    return result.data;
  }

  /**
   * Check sandbox health
   */
  async health(name: string): Promise<boolean> {
    const response = await this.client.get(`/sandbox/${encodeURIComponent(name)}/health`);
    const result = HealthCheckResponseSchema.parse(response.data);
    return result.healthy;
  }
}
