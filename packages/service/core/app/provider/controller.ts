import { loadModelProviders } from '../../../thirdProvider/fastgptPlugin/model';
import {
  type langType,
  defaultProvider,
  formatModelProviders
} from '@fastgpt/global/core/ai/provider';

// Preload model providers
export async function preloadModelProviders(): Promise<void> {
  const { modelProviders, aiproxyChannels } = await loadModelProviders();

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

  // Locales without a pre-built provider name/avatar map (e.g. those not covered by langType)
  // fall back to the default provider info instead of throwing.
  return global.ModelProviderMapCache[language as langType]?.[provider] ?? defaultProvider;
};
