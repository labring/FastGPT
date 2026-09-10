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

  global.aiproxyChannelsCache = aiproxyChannels;
}

export const getModelProviders = (language = 'en') => {
  return getModelProviderListFromCache(global.ModelProviderListCache, language);
};

/** Provider 与协议是独立元数据；读取不触发模型目录加载，模板和修复入口不依赖坏目录。 */
export const getModelProviderMetadata = () => ({
  providers: global.ModelProviderRawCache,
  aiproxyChannels: global.aiproxyChannelsCache
});
export const getModelProvider = (provider?: string, language = 'en') => {
  return getModelProviderFromCache({
    cache: global.ModelProviderMapCache,
    provider,
    language
  });
};
