import { configureLoggerFromEnv, getLogger } from '@fastgpt-sdk/logger';

export const LogCategories = {
  MODULE: {
    MCP: {
      SERVER: ['mcp', 'server'] as const,
      API: ['mcp', 'api'] as const
    }
  }
};

export async function configureLogger(options: { serviceName?: string } = {}) {
  await configureLoggerFromEnv({
    env: process.env,
    defaultCategory: LogCategories.MODULE.MCP.SERVER,
    defaultServiceName: options.serviceName || 'fastgpt-mcp-server',
    sensitiveProperties: ['fastgpt']
  });
}

export { getLogger };
