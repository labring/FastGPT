import { loadModelProviders } from '../../../thirdProvider/fastgptPlugin/model';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache
} from '@fastgpt/global/core/ai/provider';

// Preload model providers
export async function preloadModelProviders(): Promise<void> {
  const { modelProviders, aiproxyChannels } = await loadModelProviders();

  const { ModelProviderListCache, ModelProviderMapCache } = formatModelProviders(modelProviders);
  global.ModelProviderRawCache = modelProviders;
  global.ModelProviderListCache = ModelProviderListCache;
  global.ModelProviderMapCache = ModelProviderMapCache;

  global.aiproxyChannelTemplatesCache = aiproxyChannels;
}

export const getModelProviders = (language = 'en') => {
  return getModelProviderListFromCache(global.ModelProviderListCache, language);
};
export const getModelProvider = (provider?: string, language = 'en') => {
  return getModelProviderFromCache({
    cache: global.ModelProviderMapCache,
    provider,
    language
  });
};
