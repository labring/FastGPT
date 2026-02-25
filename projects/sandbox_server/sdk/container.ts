import axios, { type AxiosInstance } from 'axios';
import {
  CreateContainerSchema,
  ContainerInfoResponseSchema,
  SuccessResponseSchema
} from './schemas';
import type { CreateContainerInput, ContainerInfo } from './types';

/**
 * Container SDK
 * Provides type-safe API calls for container lifecycle management
 */
export class ContainerSDK {
  private readonly client: AxiosInstance;

  constructor(baseUrl: string, token: string) {
    this.client = axios.create({
      baseURL: `${baseUrl.replace(/\/$/, '')}/v1`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    });
  }

  /**
   * Create a new container
   */
  async create(params: CreateContainerInput): Promise<void> {
    const validated = CreateContainerSchema.parse(params);
    const response = await this.client.post('/containers', validated);
    SuccessResponseSchema.parse(response.data);
  }

  /**
   * Get container information
   */
  async get(name: string): Promise<ContainerInfo | null> {
    try {
      const response = await this.client.get(`/containers/${encodeURIComponent(name)}`);
      const result = ContainerInfoResponseSchema.parse(response.data);
      return result.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Pause a running container
   */
  async pause(name: string): Promise<void> {
    const response = await this.client.post(`/containers/${encodeURIComponent(name)}/pause`);
    SuccessResponseSchema.parse(response.data);
  }

  /**
   * Start a paused container
   */
  async start(name: string): Promise<void> {
    const response = await this.client.post(`/containers/${encodeURIComponent(name)}/start`);
    SuccessResponseSchema.parse(response.data);
  }

  /**
   * Delete a container
   */
  async delete(name: string): Promise<void> {
    const response = await this.client.delete(`/containers/${encodeURIComponent(name)}`);
    SuccessResponseSchema.parse(response.data);
  }
}
