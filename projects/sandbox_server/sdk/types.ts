/**
 * SDK Type Definitions
 * Independent type definitions for SDK users (no external dependencies)
 */

// ==================== Container Types ====================

export interface CreateContainerInput {
  name: string;
}

export interface ContainerStatus {
  state: 'Running' | 'Creating' | 'Paused' | 'Error' | 'Unknown';
  replicas?: number;
  availableReplicas?: number;
}

export interface ContainerServer {
  serviceName: string;
  number: number;
  publicDomain?: string;
  domain?: string;
}

export interface ContainerInfo {
  name: string;
  image: {
    imageName: string;
  };
  status: ContainerStatus;
  server?: ContainerServer;
  createdAt?: string;
}

// ==================== Sandbox Types ====================

export interface ExecRequest {
  command: string;
  cwd?: string;
}

export interface ExecResponse {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
  error?: string;
}
