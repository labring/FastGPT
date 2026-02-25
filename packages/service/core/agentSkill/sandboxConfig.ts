/**
 * Skill Sandbox Configuration
 *
 * Provides configuration and defaults for sandbox management.
 */

import type { SandboxImageConfigType } from '@fastgpt/global/core/agentSkill/type';

export type SandboxProviderConfig = {
  baseUrl: string;
  apiKey?: string;
  runtime: 'kubernetes' | 'docker';
};

export type SandboxDefaults = {
  timeout: number; // in seconds
  cleanupInterval: number; // in milliseconds
  inactiveThreshold: number; // in seconds
  defaultImage: SandboxImageConfigType;
  homeDirectory: string;
  workDirectory: string;
  targetPort: number;
};

/**
 * Get sandbox provider configuration from environment variables
 */
export function getSandboxProviderConfig(): SandboxProviderConfig {
  const baseUrl = process.env.SANDBOX_PROVIDER_BASE_URL || 'http://127.0.0.1:8080';
  const apiKey = process.env.SANDBOX_PROVIDER_API_KEY;
  const runtime = (process.env.SANDBOX_PROVIDER_RUNTIME || 'kubernetes') as 'kubernetes' | 'docker';

  return {
    baseUrl,
    apiKey,
    runtime
  };
}

/**
 * Get sandbox default settings
 */
export function getSandboxDefaults(): SandboxDefaults {
  return {
    timeout: parseInt(process.env.SANDBOX_DEFAULT_TIMEOUT || '3600', 10),
    cleanupInterval: parseInt(process.env.SANDBOX_CLEANUP_INTERVAL || '3600000', 10),
    inactiveThreshold: parseInt(process.env.SANDBOX_INACTIVE_THRESHOLD || '7200', 10),
    defaultImage: {
      repository: process.env.SANDBOX_DEFAULT_IMAGE || 'node',
      tag: process.env.SANDBOX_DEFAULT_IMAGE_TAG || '18-alpine'
    },
    homeDirectory: '/home/coder',
    workDirectory: '/workspace/projects',
    targetPort: 8080
  };
}

/**
 * Validate sandbox configuration
 */
export function validateSandboxConfig(config: SandboxProviderConfig): void {
  if (!config.baseUrl) {
    throw new Error('Sandbox provider base URL is required');
  }

  if (!['kubernetes', 'docker'].includes(config.runtime)) {
    throw new Error(`Invalid runtime: ${config.runtime}`);
  }
}
