import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/common/system/getInitData';
import { Call } from '@test/utils/request';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { resetLogoutState } from '@/web/support/user/logoutState';

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
  let useUserStore: typeof import('@/web/support/user/useUserStore').useUserStore;
  let clientInitData: typeof import('@/web/common/system/staticData').clientInitData;
  let getDocPath: typeof import('@/web/common/system/doc').getDocPath;
  let getSandboxProxyWsUrl: typeof import('@/pageComponents/chat/SandboxEditor/api').getSandboxProxyWsUrl;
  let initialState: ReturnType<typeof useSystemStore.getState>;
  let initialUserState: ReturnType<typeof useUserStore.getState>;
  const storage = new Map<string, string>();

  beforeAll(async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    });
    ({ useSystemStore } = await import('@/web/common/system/useSystemStore'));
    ({ clientInitData } = await import('@/web/common/system/staticData'));
    ({ useUserStore } = await import('@/web/support/user/useUserStore'));
    ({ getDocPath } = await import('@/web/common/system/doc'));
    ({ getSandboxProxyWsUrl } = await import('@/pageComponents/chat/SandboxEditor/api'));
    initialState = useSystemStore.getState();
    initialUserState = useUserStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useSystemStore.setState(initialState, true);
    useUserStore.setState(initialUserState, true);
    resetLogoutState();
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
      uploadFileMaxAmount: 7,
      uploadFileMaxSize: 32,
      show_compliance_copywriting: true,
      enable_team_model: true,
      agentSandboxProxyUrl: 'https://sandbox.example.com/',
      limit: { agentSandboxMaxFileBytes: 2 * 1024 ** 2, maxFolderDepth: 4 },
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
    useUserStore.setState(initialUserState, true);
    vi.unstubAllGlobals();
  });

  it('replaces legacy data, retains cache hits and refreshes chat configuration and persistence on login/logout', async () => {
    useSystemStore.setState({ initDataBufferId: 'unAuth_config-1', feConfigs: global.feConfigs });

    // 旧缓存必须被整体替换，返回值、Store 和持久化中都不能残留旧私有字段。
    const { feConfigs: publicConfig } = await clientInitData();
    expect(publicConfig).not.toHaveProperty('payConfig');
    expect(publicConfig).not.toHaveProperty('futurePrivateField');
    expect(publicConfig.agentSandboxProxyUrl).toBe('https://sandbox.example.com/');
    expect(publicConfig.limit).toEqual({ agentSandboxMaxFileBytes: 2 * 1024 ** 2 });
    expect(publicConfig.uploadFileMaxSize).toBe(32);
    expect(useSystemStore.getState().feConfigs).toEqual(publicConfig);
    expect(useSystemStore.getState().initDataBufferId).toBe('unAuth_v6_config-1');
    expect(JSON.parse(storage.get('globalStore')!).state.feConfigs).toEqual(publicConfig);

    const cached = await clientInitData();
    expect(cached.feConfigs).toBe(useSystemStore.getState().feConfigs);
    expect(cached.feConfigs).toEqual(publicConfig);

    // 登录切换缓存命名空间；随后登录态命中缓存时，缺省的套餐仍须保留。
    mocks.authenticated = true;
    useUserStore.setState({ authGeneration: 1 });
    await clientInitData();
    const authenticated = useSystemStore.getState();
    expect(authenticated.feConfigs.payConfig).toEqual({ wx: true });
    expect(authenticated.feConfigs).toMatchObject({
      uploadFileMaxAmount: 7,
      uploadFileMaxSize: 32,
      show_compliance_copywriting: true,
      enable_team_model: true,
      agentSandboxProxyUrl: 'https://sandbox.example.com/',
      limit: global.feConfigs.limit
    });
    expect(authenticated.initDataBufferId).toBe('config-1');
    expect(authenticated.systemVersion).toBe('4.17.3');
    expect(authenticated.authenticatedConfigGeneration).toBe(1);
    expect(authenticated).not.toHaveProperty('aiproxyChannels');
    expect(JSON.parse(storage.get('globalStore')!).state.feConfigs).toEqual(
      authenticated.feConfigs
    );

    await clientInitData();
    expect(useSystemStore.getState().subPlans).toBe(authenticated.subPlans);
    expect(JSON.parse(storage.get('globalStore')!).state).not.toHaveProperty('aiproxyChannels');
    expect(JSON.parse(storage.get('globalStore')!).state).not.toHaveProperty(
      'authenticatedConfigGeneration'
    );

    // 退出后再次整体替换，防止用 merge 将登录态配置留在本地。
    mocks.authenticated = false;
    useUserStore.getState().invalidateAuthSession();
    const anonymous = await clientInitData();
    expect(anonymous.feConfigs).toEqual(publicConfig);
    expect(useSystemStore.getState().feConfigs).toEqual(publicConfig);
    expect(useSystemStore.getState().initDataBufferId).toBe('unAuth_v6_config-1');
    expect(useSystemStore.getState().systemVersion).toBe('4.17.3');
    expect(useSystemStore.getState().authenticatedConfigGeneration).toBeUndefined();
    expect(JSON.parse(storage.get('globalStore')!).state.feConfigs).toEqual(publicConfig);

    expect(mocks.GET.mock.calls).toEqual(
      ['unAuth_config-1', 'unAuth_v6_config-1', 'unAuth_v6_config-1', 'config-1', 'config-1'].map(
        (bufferId) => ['/common/system/getInitData', { bufferId }]
      )
    );
  });

  it.each([true, false])(
    'preserves the latest configuration when login=%s and responses finish out of order',
    async (login) => {
      const authenticated = await Call(handler, { auth, headers: {} });
      const anonymous = await Call(handler, { headers: {} });
      let releaseOlder!: (response: typeof authenticated.data) => void;
      const heldResponse = new Promise<typeof authenticated.data>((resolve) => {
        releaseOlder = resolve;
      });
      mocks.GET.mockReturnValueOnce(heldResponse).mockResolvedValueOnce(
        login ? authenticated.data : anonymous.data
      );

      const olderRequest = clientInitData();
      useUserStore.getState().invalidateAuthSession();
      const latest = await clientInitData();
      releaseOlder(login ? anonymous.data : authenticated.data);
      expect(await olderRequest).toEqual(latest);

      expect(useSystemStore.getState().initDataBufferId).toBe(
        login ? 'config-1' : 'unAuth_v6_config-1'
      );
      expect(Boolean(useSystemStore.getState().feConfigs.payConfig)).toBe(login);
      expect(useSystemStore.getState().authenticatedConfigGeneration).toBe(
        login ? useUserStore.getState().authGeneration : undefined
      );
      expect(JSON.parse(storage.get('globalStore')!).state.feConfigs).toEqual(latest.feConfigs);
    }
  );

  it('keeps an expired session unready when the server returns anonymous data', async () => {
    mocks.authenticated = true;
    useUserStore.setState({ authGeneration: 1 });
    vi.mocked(authCert).mockRejectedValueOnce(new Error('Session expired'));
    await clientInitData();

    expect(useSystemStore.getState().authenticatedConfigGeneration).toBeUndefined();
    expect(useSystemStore.getState().feConfigs).not.toHaveProperty('payConfig');
  });

  it('removes channel metadata from legacy persisted stores without losing other configuration', async () => {
    storage.set(
      'globalStore',
      JSON.stringify({
        version: 1,
        state: {
          feConfigs: global.feConfigs,
          initDataBufferId: 'config-1',
          aiproxyChannels: global.aiproxyChannelsCache,
          modelProviders: ['legacy-provider'],
          modelProviderMap: { old: 'provider' },
          defaultModels: { old: 'model' }
        }
      })
    );

    await useSystemStore.persist.rehydrate();

    expect(useSystemStore.getState().feConfigs).toEqual(global.feConfigs);
    expect(useSystemStore.getState().initDataBufferId).toBe('config-1');
    expect(useSystemStore.getState()).not.toHaveProperty('aiproxyChannels');
    expect(useSystemStore.getState()).not.toHaveProperty('modelProviders');
    expect(useSystemStore.getState()).not.toHaveProperty('modelProviderMap');
    expect(useSystemStore.getState()).not.toHaveProperty('defaultModels');
    const persisted = JSON.parse(storage.get('globalStore')!);
    expect(persisted.version).toBe(2);
    expect(persisted.state).not.toHaveProperty('aiproxyChannels');
  });

  it('keeps public plans and real documentation/sandbox consumers available across cache hits', async () => {
    mocks.referer = 'https://app.example.com/login';
    await clientInitData(3, true);
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
    expect(getSandboxProxyWsUrl({ channel: 'fs', ticket: 'share/ticket?x=1' })).toBe(
      'https://sandbox.example.com/fs?ticket=share%2Fticket%3Fx%3D1'
    );
    expect(useSystemStore.getState().feConfigs.limit?.agentSandboxMaxFileBytes).toBe(2 * 1024 ** 2);
  });

  it('preserves zero upload limits in memory and persistence across an anonymous cache hit', async () => {
    global.feConfigs.uploadFileMaxAmount = 0;
    global.feConfigs.uploadFileMaxSize = 0;
    await clientInitData();
    await clientInitData();
    expect(useSystemStore.getState().feConfigs).toMatchObject({
      uploadFileMaxAmount: 0,
      uploadFileMaxSize: 0
    });
    expect(JSON.parse(storage.get('globalStore')!).state.feConfigs).toMatchObject({
      uploadFileMaxAmount: 0,
      uploadFileMaxSize: 0
    });
  });
});
