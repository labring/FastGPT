import axios, { type AxiosInstance, type AxiosError } from 'axios';
import {
  ExecRequestSchema,
  ExecResponseSchema,
  HealthResponseSchema,
  type ExecRequest,
  type ExecResponse,
  type HealthResponse
} from '../schemas';

const DEFAULT_CWD = '/app/sandbox';

/**
 * Sandbox Client
 * Communicates with the sandbox server running inside container
 */
export class SandboxClient {
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 60s timeout for long-running commands
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<{ error?: string }>) => {
        if (error.code === 'ECONNREFUSED') {
          return Promise.reject(new Error('Sandbox server is not reachable'));
        }

        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          return Promise.reject(new Error('Request timeout'));
        }

        const status = error.response?.status;
        if (status === 404) {
          return Promise.reject(new Error('Endpoint not found'));
        }

        const responseData = {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.response?.data?.error || error.message || 'Request failed',
          data: error.response?.data
        };
        return Promise.reject(responseData);
      }
    );
  }

  /**
   * Check if sandbox server is healthy
   */
  async health(): Promise<HealthResponse> {
    const response = await this.client.get('/health');
    return HealthResponseSchema.parse(response.data);
  }

  /**
   * Check if sandbox is healthy (boolean)
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.health();
      return result.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Execute a shell command in the sandbox
   */
  async exec(params: ExecRequest): Promise<ExecResponse> {
    const validated = ExecRequestSchema.parse(params);

    const response = await this.client.post('/exec', {
      command: validated.command,
      cwd: validated.cwd || DEFAULT_CWD
    });

    return ExecResponseSchema.parse(response.data);
  }
}

/**
 * Create a new SandboxClient instance
 */
export function createSandboxClient(baseUrl: string): SandboxClient {
  return new SandboxClient(baseUrl);
}
