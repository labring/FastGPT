import axios, { type AxiosInstance, type AxiosError } from 'axios';
import {
  CreateContainerSchema,
  SealosContainerResponseSchema,
  type CreateContainerInput,
  type ContainerInfo,
  type ContainerStatus
} from '../schemas';
import { env, containerConfig } from '../env';

/**
 * Sealos API Client
 * Handles container lifecycle management through Sealos API
 */
export class SealosClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.SEALOS_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SEALOS_KC}`
      }
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        // Handle empty response for void operations
        if (response.data === undefined || response.data === null) {
          return response;
        }

        // Check API-level error code
        if (response.data.code === 404) {
          return Promise.reject({ status: 404, message: 'Resource not found' });
        }

        if (response.data.code && response.data.code !== 200) {
          return Promise.reject(response.data.error || response.data.message || 'API error');
        }

        return response;
      },
      (error: AxiosError<{ error?: string; message?: string }>) => {
        const status = error.response?.status;
        const errorData = error.response?.data;
        console.log(errorData, 2222);
        if (status === 401 || status === 403) {
          return Promise.reject(new Error('Authentication failed'));
        }

        if (status === 404) {
          return Promise.reject({
            status: 404,
            message: errorData?.message || 'Resource not found'
          });
        }

        if (status && status >= 500) {
          return Promise.reject(new Error(errorData?.message || 'Server error'));
        }

        const message = errorData?.error || errorData?.message || error.message || 'Request failed';
        return Promise.reject(new Error(message));
      }
    );
  }

  /**
   * Create a new container with fixed configuration from environment variables
   */
  async createContainer(params: CreateContainerInput): Promise<void> {
    const validated = CreateContainerSchema.parse(params);

    // Parse entrypoint configuration
    let launchCommand: { command?: string; args?: string } | undefined;
    if (containerConfig.entrypoint) {
      try {
        const parsed = JSON.parse(containerConfig.entrypoint);
        if (Array.isArray(parsed) && parsed.length > 0) {
          launchCommand = {
            command: parsed[0],
            args: parsed.slice(1).join(' ')
          };
        }
      } catch {
        // If not JSON, treat as direct command
        launchCommand = { command: containerConfig.entrypoint };
      }
    }

    await this.client
      .post('/api/v1/app', {
        name: validated.name,
        image: {
          imageName: containerConfig.image
        },
        resource: {
          cpu: containerConfig.cpu,
          memory: containerConfig.memory,
          replicas: 1
        },
        ports: [
          {
            number: containerConfig.port,
            exposesPublicDomain: containerConfig.exposesPublicDomain
          }
        ],
        launchCommand
      })
      .catch((err) => {
        if (err.code === 409) {
          return;
        }

        return Promise.reject(err);
      });
  }

  /**
   * Get container information by name
   */
  async getContainer(name: string): Promise<ContainerInfo | null> {
    try {
      const response = await this.client.get(`/api/v1/app/${encodeURIComponent(name)}`);
      const data = SealosContainerResponseSchema.parse(response.data.data);

      return {
        name: data.name,
        image: data.image,
        status: this.mapContainerStatus(data.status),
        server: data.ports[0],
        createdAt: data.createTime
      };
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Pause a running container
   */
  async pauseContainer(name: string): Promise<void> {
    try {
      await this.client.post(`/api/v1/app/${encodeURIComponent(name)}/pause`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
        return;
      }
      throw err;
    }
  }

  /**
   * Resume/start a paused container
   */
  async resumeContainer(name: string): Promise<void> {
    try {
      await this.client.post(`/api/v1/app/${encodeURIComponent(name)}/start`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
        return;
      }
      throw err;
    }
  }

  /**
   * Delete a container
   */
  async deleteContainer(name: string): Promise<void> {
    try {
      await this.client.delete(`/api/v1/app/${encodeURIComponent(name)}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
        return;
      }
      throw err;
    }
  }

  /**
   * Map Sealos API status to internal status
   */
  private mapContainerStatus(status: {
    replicas: number;
    availableReplicas: number;
    isPause: boolean;
  }): ContainerStatus {
    if (status.isPause) {
      return {
        state: 'Paused',
        replicas: status.replicas,
        availableReplicas: status.availableReplicas
      };
    }
    if (status.availableReplicas > 0) {
      return {
        state: 'Running',
        replicas: status.replicas,
        availableReplicas: status.availableReplicas
      };
    }
    return {
      state: 'Creating',
      replicas: status.replicas,
      availableReplicas: status.availableReplicas
    };
  }
}

/**
 * Create a new SealosClient instance
 */
export function createSealosClient(): SealosClient {
  return new SealosClient();
}
