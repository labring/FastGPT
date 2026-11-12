import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getLocale: vi.fn(),
  getAdminModerationPluginList: vi.fn(),
  saveModerationConfig: vi.fn(),
  deleteModerationPlugin: vi.fn(),
  restoreModerationPlugin: vi.fn(),
  checkModerationForTest: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: mocks.getLocale
}));

vi.mock('@fastgpt/service/core/plugin/moderation/service', () => ({
  getAdminModerationPluginList: mocks.getAdminModerationPluginList,
  saveModerationConfig: mocks.saveModerationConfig,
  deleteModerationPlugin: mocks.deleteModerationPlugin,
  restoreModerationPlugin: mocks.restoreModerationPlugin,
  checkModerationForTest: mocks.checkModerationForTest,
  getModerationPolicy: vi.fn(),
  updateModerationPolicy: vi.fn()
}));

vi.mock('@fastgpt/service/core/plugin/moderation/record/entity', () => ({
  findModerationRecords: vi.fn()
}));

import { handler as listHandler } from '@/pages/api/core/plugin/admin/moderation/list';
import { handler as configHandler } from '@/pages/api/core/plugin/admin/moderation/config';
import { handler as deleteHandler } from '@/pages/api/core/plugin/admin/moderation/delete';
import { handler as restoreHandler } from '@/pages/api/core/plugin/admin/moderation/restore';
import { handler as checkHandler } from '@/pages/api/core/plugin/admin/moderation/check';
import { handler as policyHandler } from '@/pages/api/core/plugin/admin/moderation/policy';
import { handler as recordsHandler } from '@/pages/api/core/plugin/admin/moderation/records';
import * as moderationService from '@fastgpt/service/core/plugin/moderation/service';
import * as moderationRecordEntity from '@fastgpt/service/core/plugin/moderation/record/entity';

const makeReq = <B, Q>({ body = {} as B, query = {} as Q }: { body?: B; query?: Q }) =>
  ({ body, query }) as unknown as ApiRequestProps<B, Q>;

const res = {} as ApiResponseType<unknown>;

describe('admin moderation list handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue({ tmbId: 'tmb-1', userId: 'user-1' });
    mocks.getLocale.mockReturnValue('zh-CN');
    mocks.getAdminModerationPluginList.mockResolvedValue([]);
  });

  it('returns the merged plugin list', async () => {
    mocks.getAdminModerationPluginList.mockResolvedValueOnce([
      {
        pluginId: 'baidu-moderation',
        source: 'system',
        version: '1.0.0',
        name: '百度内容审核',
        provider: 'baidu',
        enabled: true,
        available: true
      }
    ]);

    const result = await listHandler(makeReq({ body: {}, query: {} }), res);

    expect(result).toHaveLength(1);
    expect(result[0].pluginId).toBe('baidu-moderation');
    expect(mocks.getAdminModerationPluginList).toHaveBeenCalledWith({
      lang: 'zh-CN',
      includeDeleted: undefined
    });
  });

  it('requests uninstalled plugins for the marketplace restore flow', async () => {
    await listHandler(makeReq({ body: {}, query: { includeDeleted: true } }), res);

    expect(mocks.getAdminModerationPluginList).toHaveBeenCalledWith({
      lang: 'zh-CN',
      includeDeleted: true
    });
  });

  it('rejects a non-root caller before touching the service', async () => {
    mocks.authSystemAdmin.mockRejectedValueOnce('unAuthorization');

    await expect(listHandler(makeReq({ body: {}, query: {} }), res)).rejects.toBe(
      'unAuthorization'
    );
    expect(mocks.getAdminModerationPluginList).not.toHaveBeenCalled();
  });

  it('rejects an invalid includeDeleted value', async () => {
    await expect(
      listHandler(makeReq({ body: {}, query: { includeDeleted: {} as any } }), res)
    ).rejects.toBeTruthy();
    expect(mocks.getAdminModerationPluginList).not.toHaveBeenCalled();
  });
});

describe('admin moderation config handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue({ tmbId: 'tmb-1', userId: 'user-1' });
    mocks.getLocale.mockReturnValue('zh-CN');
    mocks.saveModerationConfig.mockResolvedValue({
      pluginId: 'x',
      source: 'system',
      name: 'X Moderation',
      provider: 'x'
    });
  });

  it('forwards config fields to the service', async () => {
    await configHandler(
      makeReq({
        body: {
          pluginId: 'baidu-moderation',
          secretsVal: { strategyId: 'abc' },
          enabled: true
        }
      }),
      res
    );

    expect(mocks.saveModerationConfig).toHaveBeenCalledWith({
      pluginId: 'baidu-moderation',
      version: undefined,
      secretsVal: { strategyId: 'abc' },
      enabled: true,
      lang: 'zh-CN'
    });
  });

  it('rejects a body without pluginId', async () => {
    await expect(configHandler(makeReq({ body: {} }), res)).rejects.toBeTruthy();
    expect(mocks.saveModerationConfig).not.toHaveBeenCalled();
  });
});

describe('admin moderation delete handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue({ tmbId: 'tmb-1', userId: 'user-1' });
    mocks.deleteModerationPlugin.mockResolvedValue(undefined);
  });

  it('deletes by pluginId and source', async () => {
    const result = await deleteHandler(
      makeReq({ body: { pluginId: 'baidu-moderation', source: 'local' } }),
      res
    );

    expect(moderationService.deleteModerationPlugin).toHaveBeenCalledWith({
      pluginId: 'baidu-moderation',
      source: 'local'
    });
    expect(result).toBeUndefined();
  });

  it('propagates the service refusal for an enabled plugin', async () => {
    mocks.deleteModerationPlugin.mockRejectedValueOnce(
      'Disable the moderation plugin before deleting it'
    );

    await expect(
      deleteHandler(makeReq({ body: { pluginId: 'baidu-moderation' } }), res)
    ).rejects.toBe('Disable the moderation plugin before deleting it');
  });
});

describe('admin moderation restore handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue({ tmbId: 'tmb-1' });
  });

  it('restores the selected source without passing enablement or credentials', async () => {
    await restoreHandler(makeReq({ body: { pluginId: 'keyword', source: 'system' } }));
    expect(mocks.restoreModerationPlugin).toHaveBeenCalledWith({
      pluginId: 'keyword',
      source: 'system'
    });
  });

  it('rejects unauthorized restoration', async () => {
    mocks.authSystemAdmin.mockRejectedValueOnce('unAuthorization');
    await expect(restoreHandler(makeReq({ body: { pluginId: 'keyword' } }))).rejects.toBe(
      'unAuthorization'
    );
    expect(mocks.restoreModerationPlugin).not.toHaveBeenCalled();
  });
});

describe('admin moderation check handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue({ tmbId: 'tmb-1', userId: 'user-1' });
    mocks.getLocale.mockReturnValue('zh-CN');
  });

  it('returns the moderation result directly', async () => {
    mocks.checkModerationForTest.mockResolvedValueOnce({
      verdict: 'block',
      keywords: ['badword'],
      hits: [{ label: 'porn', providerLabel: 'Porn' }],
      provider: 'baidu'
    });

    const result = await checkHandler(
      makeReq({
        body: { pluginId: 'baidu-moderation', input: { content: 'hello' } }
      }),
      res
    );

    expect(result.verdict).toBe('block');
    expect(result.hits).toHaveLength(1);
  });

  it('returns the error verdict as a normal result, not a thrown failure', async () => {
    mocks.checkModerationForTest.mockResolvedValueOnce({
      verdict: 'error',
      keywords: [],
      hits: [],
      provider: 'baidu',
      errorMessage: 'provider timeout'
    });

    const result = await checkHandler(
      makeReq({ body: { pluginId: 'baidu-moderation', input: { content: 'hello' } } }),
      res
    );

    expect(result.verdict).toBe('error');
    expect(result.errorMessage).toBe('provider timeout');
  });

  it('propagates framework-level failures', async () => {
    mocks.checkModerationForTest.mockRejectedValueOnce('plugin not found');

    await expect(
      checkHandler(makeReq({ body: { pluginId: 'missing', input: { content: 'hello' } } }), res)
    ).rejects.toBe('plugin not found');
  });

  it('rejects a body carrying an unsupported modality field', async () => {
    await expect(
      checkHandler(
        makeReq({
          body: { pluginId: 'baidu-moderation', input: { content: 'x', modality: 'image' } }
        }),
        res
      )
    ).rejects.toBeTruthy();
    expect(mocks.checkModerationForTest).not.toHaveBeenCalled();
  });
});

describe('admin moderation policy handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue({ tmbId: 'tmb-1', userId: 'user-1' });
  });

  it('handles GET request and returns policy', async () => {
    vi.spyOn(moderationService, 'getModerationPolicy').mockResolvedValueOnce({
      enabled: true,
      activePluginId: 'test-plugin',
      hooks: { userInput: true, modelInput: false, finalOutput: true },
      strategy: {
        streamInterval: 50,
        suspectedRiskAction: 'blockAndLog' as any,
        serviceExceptionAction: 'pass' as any
      }
    });

    const result = await policyHandler({ method: 'GET', body: {}, query: {} } as any, res);

    expect(result.enabled).toBe(true);
    expect((result as any).activePluginId).toBe('test-plugin');
  });

  it('handles POST request and updates policy', async () => {
    const updateSpy = vi.spyOn(moderationService, 'updateModerationPolicy').mockResolvedValueOnce({
      enabled: false,
      activePluginId: undefined,
      hooks: { userInput: true, modelInput: false, finalOutput: true },
      strategy: {
        streamInterval: 50,
        suspectedRiskAction: 'blockAndLog' as any,
        serviceExceptionAction: 'pass' as any
      }
    });

    const result = await policyHandler(
      {
        method: 'POST',
        body: {
          enabled: false,
          hooks: { userInput: true, modelInput: false, finalOutput: true },
          strategy: {
            streamInterval: 50,
            suspectedRiskAction: 'blockAndLog',
            serviceExceptionAction: 'pass'
          }
        },
        query: {}
      } as any,
      res
    );

    expect(updateSpy).toHaveBeenCalled();
    expect(result.enabled).toBe(false);
  });
});

describe('admin moderation records handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue({ tmbId: 'tmb-1', userId: 'user-1' });
  });

  it('handles query and forwards parameters to service', async () => {
    const findSpy = vi
      .spyOn(moderationRecordEntity, 'findModerationRecords')
      .mockResolvedValueOnce({
        total: 1,
        list: [
          {
            _id: 'rec-1',
            stage: 'entry',
            content: 'test text',
            verdict: 'pass',
            keywords: [],
            hits: [],
            actionTaken: 'pass',
            createTime: new Date()
          }
        ] as any
      });

    const result = await recordsHandler(
      makeReq({
        body: {
          stage: 'entry',
          verdict: 'pass',
          offset: 0,
          limit: 20
        }
      }),
      res
    );

    expect(findSpy).toHaveBeenCalledWith({
      stage: 'entry',
      verdict: 'pass',
      offset: 0,
      limit: 20
    });
    expect(result.total).toBe(1);
    expect(result.list).toHaveLength(1);
  });
});
