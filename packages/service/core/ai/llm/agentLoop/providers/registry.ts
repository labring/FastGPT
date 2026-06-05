import type { AgentLoopProviderName } from '../type';
import type { AgentLoopProvider } from './type';
import { fastAgentProvider } from './fastAgent';
import { piAgentProvider } from './piAgent';

export type AgentLoopProviderSelector = AgentLoopProviderName;

const providerRegistry = new Map<AgentLoopProviderName, AgentLoopProvider>([
  [fastAgentProvider.name, fastAgentProvider],
  [piAgentProvider.name, piAgentProvider]
]);

/**
 * 解析 agent loop provider。未知 provider 必须显式报错，避免业务层静默回退到错误 loop。
 */
export const getAgentLoopProvider = (
  provider: AgentLoopProviderSelector = 'fastAgent'
): AgentLoopProvider => {
  const resolved = providerRegistry.get(provider);
  if (!resolved) {
    throw new Error(`Unknown agent loop provider: ${provider}`);
  }
  return resolved;
};

export const registerAgentLoopProvider = (provider: AgentLoopProvider) => {
  providerRegistry.set(provider.name, provider);
};
