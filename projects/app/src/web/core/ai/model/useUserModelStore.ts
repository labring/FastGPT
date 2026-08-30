import { create, devtools, immer } from '@fastgpt/web/common/zustand';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache,
  type langType,
  type ModelProviderItemType
} from '@fastgpt/global/core/ai/provider';
import type {
  MyModelItemType,
  MyLLMModelItemType,
  MyEmbeddingModelItemType,
  MyTTSModelItemType,
  MySTTModelItemType,
  MyRerankModelItemType
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';
import {
  GetModelCatalogResponseSchema,
  type GetModelCatalogResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getUserModelCatalog } from '@/web/common/system/api';

const MODEL_CATALOG_CACHE_PREFIX = 'fastgpt:model-catalog:v1:';

type CatalogData = NonNullable<GetModelCatalogResponse['data']>;
type CatalogCache = CatalogData & { version: string };
type DefaultModels = {
  llm?: MyLLMModelItemType;
  datasetTextLLM?: MyLLMModelItemType;
  datasetImageLLM?: MyLLMModelItemType;
  chatTitleLLM?: MyLLMModelItemType;
  embedding?: MyEmbeddingModelItemType;
  tts?: MyTTSModelItemType;
  stt?: MySTTModelItemType;
  rerank?: MyRerankModelItemType;
};

const emptyProviderList = (): Record<langType, ModelProviderItemType[]> => ({
  en: [],
  'zh-CN': [],
  'zh-Hant': []
});
const emptyProviderMap = (): Record<langType, Record<string, ModelProviderItemType>> => ({
  en: {},
  'zh-CN': {},
  'zh-Hant': {}
});
const getCacheKey = (teamId: string, tmbId: string) =>
  `${MODEL_CATALOG_CACHE_PREFIX}${teamId}:${tmbId}`;

const readCache = (teamId: string, tmbId: string): CatalogCache | undefined => {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.parse(localStorage.getItem(getCacheKey(teamId, tmbId)) || '') as CatalogCache;
    const parsed = GetModelCatalogResponseSchema.safeParse({
      version: raw.version,
      data: raw
    });
    return parsed.success && parsed.data.data
      ? { ...parsed.data.data, version: parsed.data.version }
      : undefined;
  } catch {
    return;
  }
};

const writeCache = (teamId: string, tmbId: string, cache: CatalogCache) => {
  try {
    localStorage.setItem(getCacheKey(teamId, tmbId), JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to persist model catalog', error);
  }
};

type UserModelStoreState = {
  identity?: string;
  version?: string;
  loading: boolean;
  loaded: boolean;
  modelList: MyModelItemType[];
  modelMap: Record<string, MyModelItemType>;
  defaultModelIds: ModelDefaultIds;
  defaultModels: DefaultModels;
  modelProviders: Record<langType, ModelProviderItemType[]>;
  modelProviderMap: Record<langType, Record<string, ModelProviderItemType>>;
  loadModelCatalog: (props: { teamId: string; tmbId: string; force?: boolean }) => Promise<void>;
  clearMemory: () => void;
  clearAllPersistedCaches: () => void;
  getModelProvider: (provider?: string, language?: string) => ModelProviderItemType;
  getModelProviders: (language?: string) => ModelProviderItemType[];
};

/** 当前成员模型目录的唯一客户端数据源。持久缓存严格按 teamId+tmbId 隔离。 */
export const useUserModelStore = create<UserModelStoreState>()(
  devtools(
    immer((set, get) => {
      const applyCatalog = ({ identity, cache }: { identity: string; cache: CatalogCache }) => {
        const formattedProviders = formatModelProviders(cache.providers);
        set((state) => {
          state.identity = identity;
          state.version = cache.version;
          state.loaded = true;
          state.modelList = cache.models;
          state.modelMap = Object.fromEntries(cache.models.map((model) => [model.modelId, model]));
          state.defaultModelIds = cache.defaultModelIds;
          state.defaultModels = Object.fromEntries(
            Object.entries(cache.defaultModelIds).map(([key, modelId]) => [
              key,
              cache.models.find((model) => model.modelId === modelId)
            ])
          ) as DefaultModels;
          state.modelProviders = formattedProviders.ModelProviderListCache;
          state.modelProviderMap = formattedProviders.ModelProviderMapCache;
        });
      };

      return {
        identity: undefined,
        version: undefined,
        loading: false,
        loaded: false,
        modelList: [],
        modelMap: {},
        defaultModelIds: {},
        defaultModels: {},
        modelProviders: emptyProviderList(),
        modelProviderMap: emptyProviderMap(),
        async loadModelCatalog({ teamId, tmbId, force = false }) {
          const identity = `${teamId}:${tmbId}`;
          if (!force && get().loaded && get().identity === identity) return;
          if (get().loading && get().identity === identity) return;

          const cached = force ? undefined : readCache(teamId, tmbId);
          if (cached && get().identity !== identity) applyCatalog({ identity, cache: cached });
          set((state) => {
            state.identity = identity;
            state.loading = true;
          });

          try {
            const response = await getUserModelCatalog(cached?.version);
            // 身份在请求期间变化时丢弃旧响应，防止跨成员目录串写。
            if (get().identity !== identity) return;
            if (response.data) {
              const nextCache = { ...response.data, version: response.version };
              applyCatalog({ identity, cache: nextCache });
              writeCache(teamId, tmbId, nextCache);
            } else if (cached) {
              applyCatalog({ identity, cache: { ...cached, version: response.version } });
            } else {
              throw new Error('Model catalog returned no data for an empty cache');
            }
          } finally {
            if (get().identity === identity) {
              set((state) => {
                state.loading = false;
              });
            }
          }
        },
        clearMemory() {
          set((state) => {
            state.identity = undefined;
            state.version = undefined;
            state.loading = false;
            state.loaded = false;
            state.modelList = [];
            state.modelMap = {};
            state.defaultModelIds = {};
            state.defaultModels = {};
            state.modelProviders = emptyProviderList();
            state.modelProviderMap = emptyProviderMap();
          });
        },
        clearAllPersistedCaches() {
          if (typeof window !== 'undefined') {
            Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
              .filter((key): key is string => !!key)
              .forEach((key) => {
                if (key.startsWith(MODEL_CATALOG_CACHE_PREFIX)) localStorage.removeItem(key);
              });
          }
          get().clearMemory();
        },
        getModelProvider(provider, language = 'en') {
          return getModelProviderFromCache({ cache: get().modelProviderMap, provider, language });
        },
        getModelProviders(language = 'en') {
          return getModelProviderListFromCache(get().modelProviders, language);
        }
      };
    })
  )
);

/** 仅在服务端确认一次新的登录成功后调用，清除所有历史成员目录并强制重新拉取。 */
export const resetUserModelCatalogAfterLogin = () =>
  useUserModelStore.getState().clearAllPersistedCaches();
