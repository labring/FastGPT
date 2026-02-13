import { loadModelProviders } from '../../../thirdProvider/fastgptPlugin/model';
import {
  type langType,
  defaultProvider,
  formatModelProviders
} from '@fastgpt/global/core/ai/provider';

// Preload model providers
export async function preloadModelProviders(): Promise<void> {
  const { modelProviders, aiproxyIdMap } = await loadModelProviders();

  const { ModelProviderListCache, ModelProviderMapCache } = formatModelProviders(modelProviders);
  global.ModelProviderRawCache = modelProviders;
  global.ModelProviderListCache = ModelProviderListCache;
  global.ModelProviderMapCache = ModelProviderMapCache;

  global.aiproxyIdMapCache = aiproxyIdMap;
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
