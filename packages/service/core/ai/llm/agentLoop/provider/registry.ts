import type { AgentLoopProvider, AgentLoopProviderName } from '../domain';
import { fastAgentProvider } from './fastAgent';

const providerRegistry = new Map<AgentLoopProviderName, AgentLoopProvider>([
  [fastAgentProvider.name, fastAgentProvider]
]);

/**
 * 解析 agent loop provider。
 * 未知 provider 显式报错，避免业务层静默回退到错误 loop。
 */
export const getAgentLoopProvider = (
  provider: AgentLoopProviderName = 'fastAgent'
): AgentLoopProvider => {
  const resolved = providerRegistry.get(provider);
  if (!resolved) {
    throw new Error(`Unknown agent loop provider: ${provider}`);
  }
  return resolved;
};
