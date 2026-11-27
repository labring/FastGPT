import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerRoleVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';

const { fetchCustomApiFilePermissions } = vi.hoisted(() => ({
  fetchCustomApiFilePermissions: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/apiDataset/permission/adapters/custom', () => ({
  fetchCustomApiFilePermissions
}));

const { fetchApiFilePermissions } =
  await import('@fastgpt/service/core/dataset/apiDataset/permission/adapters');

const apiDatasetServer = { apiServer: { baseUrl: 'https://api.example.com' } } as Parameters<
  typeof fetchApiFilePermissions
>[0]['apiDatasetServer'];
const request = {} as Parameters<typeof fetchApiFilePermissions>[0]['request'];

const rawSnapshots = (entries: Array<[string, unknown]>) =>
  new Map(
    entries.map(([apiFileId, rawPermissions]) => [
      apiFileId,
      { apiFileId, status: 'ok' as const, rawPermissions }
    ])
  );

beforeEach(() => {
  vi.clearAllMocks();
  fetchCustomApiFilePermissions.mockResolvedValue(new Map());
});

describe('fetchApiFilePermissions', () => {
  it('rejects non-apiServer datasets without fetching', async () => {
    await expect(
      fetchApiFilePermissions({ apiDatasetServer: {}, request, apiFileIds: ['f1'] })
    ).rejects.toThrow(/apiServer/);

    expect(fetchCustomApiFilePermissions).not.toHaveBeenCalled();
  });

  it('drops only the invalid items and keeps the valid ones of the same file', async () => {
    fetchCustomApiFilePermissions.mockResolvedValue(
      rawSnapshots([
        [
          'f1',
          [
            { tmbId: 'tmb-1', permission: ReadRoleVal },
            { tmbId: 'tmb-2' }, // 缺 role
            { tmbId: 'tmb-3', groupId: 'group-1', permission: 2 }, // 多主体
            { tmbId: 'tmb-4', permission: 7 }, // 掩码不是合法 role
            { tmbId: 'tmb-5', permission: 3 }, // 不在 4/2/1/owner 内
            { username: 'alice', permission: OwnerRoleVal }
          ]
        ]
      ])
    );

    const result = await fetchApiFilePermissions({
      apiDatasetServer,
      request,
      apiFileIds: ['f1']
    });

    expect(result.get('f1')).toEqual({
      apiFileId: 'f1',
      status: 'ok',
      permissions: [
        { tmbId: 'tmb-1', permission: ReadRoleVal },
        { username: 'alice', permission: OwnerRoleVal }
      ]
    });
  });

  it('treats an all-invalid array as not provided instead of an empty list', async () => {
    fetchCustomApiFilePermissions.mockResolvedValue(
      rawSnapshots([['f1', [{ tmbId: 'tmb-1' }, { tmbId: 'tmb-2', permission: 7 }]]])
    );

    const result = await fetchApiFilePermissions({
      apiDatasetServer,
      request,
      apiFileIds: ['f1']
    });

    // 写 `[]` 会把节点撤成仅 owner 可见；全部非法时按「外部未表达」处理
    expect(result.get('f1')).toEqual({ apiFileId: 'f1', status: 'ok', permissions: undefined });
  });

  it('keeps an explicit empty list and maps non-array values to undefined', async () => {
    fetchCustomApiFilePermissions.mockResolvedValue(
      rawSnapshots([
        ['empty', []],
        ['missing', undefined],
        ['string', 'not-an-array'],
        ['object', { tmbId: 'tmb-1', permission: 4 }]
      ])
    );

    const result = await fetchApiFilePermissions({
      apiDatasetServer,
      request,
      apiFileIds: ['empty', 'missing', 'string', 'object']
    });

    expect(result.get('empty')).toEqual({ apiFileId: 'empty', status: 'ok', permissions: [] });
    for (const apiFileId of ['missing', 'string', 'object']) {
      expect(result.get(apiFileId)).toEqual({ apiFileId, status: 'ok', permissions: undefined });
    }
  });

  it('passes failed nodes through untouched', async () => {
    fetchCustomApiFilePermissions.mockResolvedValue(
      new Map([
        ['bad', { apiFileId: 'bad', status: 'failed' }],
        ['ok', { apiFileId: 'ok', status: 'ok', rawPermissions: [] }]
      ])
    );

    const result = await fetchApiFilePermissions({
      apiDatasetServer,
      request,
      apiFileIds: ['bad', 'ok']
    });

    expect(result.get('bad')).toEqual({ apiFileId: 'bad', status: 'failed' });
    expect(result.get('ok')).toEqual({ apiFileId: 'ok', status: 'ok', permissions: [] });
  });

  it('forwards the deadline to the custom adapter', async () => {
    const deadlineAt = Date.now() + 60_000;

    await fetchApiFilePermissions({ apiDatasetServer, request, apiFileIds: [], deadlineAt });

    expect(fetchCustomApiFilePermissions).toHaveBeenCalledWith({
      request,
      apiFileIds: [],
      deadlineAt
    });
  });
});
