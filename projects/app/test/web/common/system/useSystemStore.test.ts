import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/common/system/getInitData';
import { Call } from '@test/utils/request';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

const auth = {
  userId: 'user-1',
  teamId: 'team-1',
  tmbId: 'member-1',
  appId: '',
  authType: AuthUserTypeEnum.token,
  sourceName: undefined,
  apikey: '',
  isRoot: false,
  sessionId: 'session-1'
};

const mocks = vi.hoisted(() => ({
  GET: vi.fn(),
  authenticated: false,
  referer: 'https://app.example.com/login'
}));

vi.mock('@/web/common/api/request', () => ({
  GET: mocks.GET,
  POST: vi.fn(),
  POSTRawFile: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn()
}));

describe('initStaticData through the real initialization pipeline', () => {
  let useSystemStore: typeof import('@/web/common/system/useSystemStore').useSystemStore;
  let clientInitData: typeof import('@/web/common/system/staticData').clientInitData;
  let getDocPath: typeof import('@/web/common/system/doc').getDocPath;
  let initialState: ReturnType<typeof useSystemStore.getState>;
  const storage = new Map<string, string>();

  beforeAll(async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    });
    ({ useSystemStore } = await import('@/web/common/system/useSystemStore'));
    ({ clientInitData } = await import('@/web/common/system/staticData'));
    ({ getDocPath } = await import('@/web/common/system/doc'));
    initialState = useSystemStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useSystemStore.setState(initialState, true);
    storage.clear();
    mocks.authenticated = false;
    mocks.referer = 'https://app.example.com/login';
    global.systemInitBufferId = 'config-1';
    global.systemVersion = '4.17.3';
    global.subPlans = { extraDatasetSize: { price: 4 } };
    global.aiproxyChannelsCache = [
      {
        channelId: 1,
        name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: 'model/openai'
      }
    ];
    global.feConfigs = {
      systemTitle: 'Custom FastGPT',
      docUrl: 'https://docs.example.com',
      limit: { uploadFileMaxAmount: 7, uploadFileMaxSize: 32, maxFolderDepth: 4 },
      show_compliance_copywriting: true,
      enable_team_model: true,
      payConfig: { wx: true },
      futurePrivateField: 'private-future-config'
    };

    // 只替换 HTTP 传输，接口过滤、响应校验和 Store 更新均运行真实逻辑。
    mocks.GET.mockImplementation(async (_url: string, query: { bufferId?: string }) => {
      const response = await Call(handler, {
        headers: { referer: mocks.referer },
        query,
        ...(mocks.authenticated
          ? {
              auth
            }
          : {})
      });
      if (response.code !== 200) throw response.error;
      return response.data;
    });
  });

  afterAll(() => {
    useSystemStore.setState(initialState, true);
    vi.unstubAllGlobals();
  });

  it('replaces legacy data, retains cache hits and refreshes chat configuration and persistence on login/logout', async () => {
    useSystemStore.setState({ initDataBufferId: 'unAuth_config-1', feConfigs: global.feConfigs });

    // 旧缓存必须被整体替换，返回值、Store 和持久化中都不能残留旧私有字段。
    const { feConfigs: publicConfig } = await clientInitData();
    expect(publicConfig).not.toHaveProperty('payConfig');
    expect(publicConfig).not.toHaveProperty('futurePrivateField');
    expect(publicConfig).not.toHaveProperty('agentSandboxProxyUrl');
    expect(publicConfig.limit).toEqual({ uploadFileMaxAmount: 7, uploadFileMaxSize: 32 });
    expect(publicConfig.limit?.uploadFileMaxSize).toBe(32);
    expect(useSystemStore.getState().feConfigs).toEqual(publicConfig);
    expect(useSystemStore.getState().initDataBufferId).toBe('unAuth_v9_config-1');
    expect(JSON.parse(storage.get('globalStore')!).state.feConfigs).toEqual(publicConfig);

    const cached = await clientInitData();
    expect(cached.feConfigs).toBe(useSystemStore.getState().feConfigs);
    expect(cached.feConfigs).toEqual(publicConfig);

    // 登录切换缓存命名空间；随后登录态命中缓存时，缺省的套餐仍须保留。
    mocks.authenticated = true;
    await clientInitData();
    const authenticated = useSystemStore.getState();
    expect(authenticated.feConfigs.payConfig).toEqual({ wx: true });
    expect(authenticated.feConfigs).toMatchObject({
      limit: { uploadFileMaxAmount: 7, uploadFileMaxSize: 32, maxFolderDepth: 4 },
      show_compliance_copywriting: true,
      enable_team_model: true
    });
    expect(authenticated.initDataBufferId).toBe('config-1');
    expect(authenticated.systemVersion).toBe('4.17.3');
    expect(authenticated).not.toHaveProperty('aiproxyChannels');
    expect(JSON.parse(storage.get('globalStore')!).state.feConfigs).toEqual(
      authenticated.feConfigs
    );

    await clientInitData();
    expect(useSystemStore.getState().subPlans).toBe(authenticated.subPlans);
    expect(JSON.parse(storage.get('globalStore')!).state).not.toHaveProperty('aiproxyChannels');

    // 退出后再次整体替换，防止用 merge 将登录态配置留在本地。
    mocks.authenticated = false;
    const anonymous = await clientInitData();
    expect(anonymous.feConfigs).toEqual(publicConfig);
    expect(useSystemStore.getState().feConfigs).toEqual(publicConfig);
    expect(useSystemStore.getState().initDataBufferId).toBe('unAuth_v9_config-1');
    expect(useSystemStore.getState().systemVersion).toBe('4.17.3');
    expect(JSON.parse(storage.get('globalStore')!).state.feConfigs).toEqual(publicConfig);

    expect(mocks.GET.mock.calls).toEqual(
      ['unAuth_config-1', 'unAuth_v9_config-1', 'unAuth_v9_config-1', 'config-1', 'config-1'].map(
        (bufferId) => ['/common/system/getInitData', { bufferId }]
      )
    );
  });

  it.each([1, 2, 3])(
    'clears legacy config and channel caches from version %s while retaining unrelated state',
    async (version) => {
      storage.set(
        'globalStore',
        JSON.stringify({
          version,
          state: {
            gitStar: 123,
            feConfigs: { ...global.feConfigs, sso: { url: 'https://sso.internal.example.com' } },
            initDataBufferId: 'config-1',
            aiproxyChannels: global.aiproxyChannelsCache,
            modelProviders: ['legacy-provider'],
            modelProviderMap: { old: 'provider' },
            defaultModels: { old: 'model' }
          }
        })
      );

      await useSystemStore.persist.rehydrate();

      expect(useSystemStore.getState().feConfigs).toEqual(initialState.feConfigs);
      expect(useSystemStore.getState().initDataBufferId).toBeUndefined();
      expect(useSystemStore.getState()).not.toHaveProperty('aiproxyChannels');
      expect(useSystemStore.getState()).not.toHaveProperty('modelProviders');
      expect(useSystemStore.getState()).not.toHaveProperty('modelProviderMap');
      expect(useSystemStore.getState()).not.toHaveProperty('defaultModels');
      const persisted = JSON.parse(storage.get('globalStore')!);
      expect(persisted.version).toBe(4);
      expect(persisted.state.gitStar).toBe(123);
      expect(persisted.state).not.toHaveProperty('aiproxyChannels');
    }
  );

  it('keeps public plans and documentation consumers available across cache hits', async () => {
    mocks.referer = 'https://app.example.com/price';
    await clientInitData({ includeSubPlans: true });
    expect(mocks.GET).toHaveBeenLastCalledWith('/common/system/getInitData', {
      bufferId: undefined,
      includeSubPlans: true
    });
    const { subPlans } = useSystemStore.getState();
    expect(subPlans).toEqual(global.subPlans);

    mocks.referer = 'https://app.example.com/chat/share?shareId=share-1';
    await clientInitData();

    expect(useSystemStore.getState().subPlans).toBe(subPlans);
    expect(getDocPath('/guide/version/cloud/privacy')).toBe(
      'https://docs.example.com/guide/version/cloud/privacy'
    );

    global.subPlans = { extraDatasetSize: { price: 8 } };
    mocks.referer = '';
    await clientInitData({ includeSubPlans: true });
    expect(useSystemStore.getState().subPlans).toEqual(global.subPlans);
    expect(useSystemStore.getState().feConfigs.docUrl).toBe('https://docs.example.com');
  });

  it('falls back from zero upload limits in memory and persistence across an anonymous cache hit', async () => {
    global.feConfigs.limit.uploadFileMaxAmount = 0;
    global.feConfigs.limit.uploadFileMaxSize = 0;
    await clientInitData();
    await clientInitData();
    expect(useSystemStore.getState().feConfigs).toMatchObject({
      limit: { uploadFileMaxAmount: 1000, uploadFileMaxSize: 1000 }
    });
    expect(JSON.parse(storage.get('globalStore')!).state.feConfigs).toMatchObject({
      limit: { uploadFileMaxAmount: 1000, uploadFileMaxSize: 1000 }
    });
  });
});
