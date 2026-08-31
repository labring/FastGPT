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
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

const MODEL_CATALOG_CACHE_PREFIX = 'fastgpt:model-catalog:v1:';
const inflightCatalogRequests = new Map<
  string,
  { requestKey: string; token: object; request: Promise<void> }
>();

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
const getCacheKey = (identity: string) => `${MODEL_CATALOG_CACHE_PREFIX}${identity}`;

const readCache = (identity: string): CatalogCache | undefined => {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.parse(localStorage.getItem(getCacheKey(identity)) || '') as CatalogCache;
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

const writeCache = (identity: string, cache: CatalogCache) => {
  try {
    localStorage.setItem(getCacheKey(identity), JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to persist model catalog', error);
  }
};

type LoadModelCatalogProps =
  | { teamId: string; tmbId: string; outLinkAuthData?: never; force?: boolean }
  | { teamId?: never; tmbId?: never; outLinkAuthData: OutLinkChatAuthProps; force?: boolean };

type UserModelStoreState = {
  loginGeneration: number;
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
  loadModelCatalog: (props: LoadModelCatalogProps) => Promise<void>;
  clearMemory: () => void;
  clearAllPersistedCaches: () => void;
  getModelProvider: (provider?: string, language?: string) => ModelProviderItemType;
  getModelProviders: (language?: string) => ModelProviderItemType[];
};

/** 登录成员与外链运行身份模型目录的唯一客户端数据源；仅登录成员目录会持久化。 */
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
        loginGeneration: 0,
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
        loadModelCatalog(props) {
          const force = props.force ?? false;
          const outLinkAuthData = props.outLinkAuthData;
          const identity = outLinkAuthData
            ? `outlink:${outLinkAuthData.shareId}`
            : `${props.teamId}:${props.tmbId}`;
          const requestKey = outLinkAuthData
            ? `${identity}:${outLinkAuthData.outLinkUid}`
            : identity;
          const inflightRequest = inflightCatalogRequests.get(identity);
          if (inflightRequest?.requestKey === requestKey && get().identity === identity) {
            return inflightRequest.request;
          }

          const requestToken = {};
          const request = (async () => {
            const currentState = get();
            const currentVersion =
              !force && currentState.identity === identity && currentState.loaded
                ? currentState.version
                : undefined;
            // 外链凭证可能被撤销或更换，禁止从 localStorage 恢复旧权限下的目录。
            const cached =
              !outLinkAuthData && currentVersion === undefined && !force
                ? readCache(identity)
                : undefined;
            if (cached && (currentState.identity !== identity || !currentState.loaded)) {
              applyCatalog({ identity, cache: cached });
            }

            set((state) => {
              // 身份切换且没有对应缓存时先清空旧目录，禁止暴露上一成员模型。
              if (state.identity !== identity && !cached) {
                state.version = undefined;
                state.loaded = false;
                state.modelList = [];
                state.modelMap = {};
                state.defaultModelIds = {};
                state.defaultModels = {};
                state.modelProviders = emptyProviderList();
                state.modelProviderMap = emptyProviderMap();
              }
              state.identity = identity;
              state.loading = true;
            });

            try {
              const response = await getUserModelCatalog({
                version: currentVersion ?? cached?.version,
                outLinkAuthData
              });
              // 身份或同身份请求代次发生变化时丢弃旧响应，防止切换成员后串写或覆盖新请求。
              if (
                get().identity !== identity ||
                inflightCatalogRequests.get(identity)?.token !== requestToken
              ) {
                return;
              }
              if (response.data) {
                const nextCache = { ...response.data, version: response.version };
                applyCatalog({ identity, cache: nextCache });
                if (!outLinkAuthData) writeCache(identity, nextCache);
              } else if (get().loaded) {
                set((state) => {
                  state.version = response.version;
                });
              } else if (cached) {
                applyCatalog({ identity, cache: { ...cached, version: response.version } });
              } else {
                throw new Error('Model catalog returned no data for an empty cache');
              }
            } catch (error) {
              if (
                outLinkAuthData &&
                get().identity === identity &&
                inflightCatalogRequests.get(identity)?.token === requestToken
              ) {
                // 外链失效后不能继续展示本次页面内曾加载的权限目录。
                set((state) => {
                  state.version = undefined;
                  state.loaded = false;
                  state.modelList = [];
                  state.modelMap = {};
                  state.defaultModelIds = {};
                  state.defaultModels = {};
                  state.modelProviders = emptyProviderList();
                  state.modelProviderMap = emptyProviderMap();
                });
              }
              throw error;
            } finally {
              const isCurrentRequest =
                inflightCatalogRequests.get(identity)?.token === requestToken;
              if (get().identity === identity && isCurrentRequest) {
                set((state) => {
                  state.loading = false;
                });
              }
              if (isCurrentRequest) {
                inflightCatalogRequests.delete(identity);
              }
            }
          })();

          // 同一外链凭证复用请求；outLinkUid 变化时用新代次覆盖，旧响应会因 token 不匹配被丢弃。
          inflightCatalogRequests.set(identity, { requestKey, token: requestToken, request });
          return request;
        },
        clearMemory() {
          inflightCatalogRequests.clear();
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
          set((state) => {
            state.loginGeneration += 1;
          });
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
