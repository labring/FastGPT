import { loadModelProviders } from '../../../thirdProvider/fastgptPlugin/model';
import {
  type langType,
  defaultProvider,
  formatModelProviders
} from '@fastgpt/global/core/ai/provider';
import type { AIProxyChannelsType } from '@fastgpt/global/sdk/fastgpt-plugin';

// Preload model providers
export async function preloadModelProviders(): Promise<void> {
  const { modelProviders, aiproxyChannels: _aiproxyChannels } = await loadModelProviders();
  const aiproxyChannels: AIProxyChannelsType = _aiproxyChannels ?? [];

  const { ModelProviderListCache, ModelProviderMapCache } = formatModelProviders(modelProviders);
  global.ModelProviderRawCache = modelProviders;
  global.ModelProviderListCache = ModelProviderListCache;
  global.ModelProviderMapCache = ModelProviderMapCache;

  global.aiproxyChannelsCache = aiproxyChannels;
}

export const getModelProviders = (language = 'en') => {
  return global.ModelProviderListCache[language as langType] || [];
};
export const getModelProvider = (provider?: string, language = 'en') => {
  if (!provider) {
    return defaultProvider;
  }

  return global.ModelProviderMapCache[language as langType][provider] ?? defaultProvider;
};
