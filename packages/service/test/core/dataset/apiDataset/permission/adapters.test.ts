import { describe, expect, it } from 'vitest';
import { PERMISSION_FETCH_CONCURRENCY } from '@fastgpt/global/core/dataset/apiDataset/constants';
import { fetchCustomApiFilePermissions } from '@fastgpt/service/core/dataset/apiDataset/permission/adapters/custom';
import { PermissionSyncDeadlineError } from '@fastgpt/service/core/dataset/apiDataset/permission/utils';

const createRequest = (results: Record<string, unknown>) =>
  ({
    getFileDetail: async ({ apiFileId }: { apiFileId: string }) => results[apiFileId]
  }) as unknown as Parameters<typeof fetchCustomApiFilePermissions>[0]['request'];

const RATE_LIMIT = { success: false, code: 'RATE_LIMIT', message: 'too many requests' };
const OK_EMPTY = { success: true, data: { id: 'x', permissions: [] } };

describe('fetchCustomApiFilePermissions', () => {
  it('returns raw permissions and keeps the three states apart', async () => {
    const request = createRequest({
      missing: { success: true, data: { id: 'missing' } },
      gone: { success: false, code: 'NOT_FOUND', message: 'File not found' },
      empty: { success: true, data: { id: 'empty', permissions: [] } }
    });

    const result = await fetchCustomApiFilePermissions({
      request,
      apiFileIds: ['missing', 'gone', 'empty']
    });

    // 不做格式校验：空数组原样保留，缺字段/NOT_FOUND 都是 undefined
    expect(result.get('missing')).toEqual({
      apiFileId: 'missing',
      status: 'ok',
      rawPermissions: undefined
    });
    expect(result.get('gone')).toEqual({
      apiFileId: 'gone',
      status: 'ok',
      rawPermissions: undefined
    });
    expect(result.get('empty')).toEqual({ apiFileId: 'empty', status: 'ok', rawPermissions: [] });
  });

  it('passes malformed permission items through for the fetch stage to validate', async () => {
    const permissions = [{ tmbId: 'tmb-1' }, { tmbId: 'tmb-2', permission: 7 }];
    const request = createRequest({ f1: { success: true, data: { id: 'f1', permissions } } });

    const result = await fetchCustomApiFilePermissions({ request, apiFileIds: ['f1'] });

    expect(result.get('f1')).toEqual({
      apiFileId: 'f1',
      status: 'ok',
      rawPermissions: permissions
    });
  });

  it('marks a single node failure as failed without aborting the round', async () => {
    const request = createRequest({
      ok: OK_EMPTY,
      bad: RATE_LIMIT,
      gone: { success: true, data: { id: 'gone' } }
    });

    const result = await fetchCustomApiFilePermissions({
      request,
      apiFileIds: ['ok', 'bad', 'gone']
    });

    expect(result.get('bad')).toEqual({ apiFileId: 'bad', status: 'failed' });
    expect(result.get('ok')?.status).toBe('ok');
    expect(result.get('gone')?.status).toBe('ok');
  });

  it('throws when a full batch fails: the external service is considered unavailable', async () => {
    const apiFileIds = Array.from({ length: PERMISSION_FETCH_CONCURRENCY }, (_, i) => `f${i}`);
    const request = createRequest(Object.fromEntries(apiFileIds.map((id) => [id, RATE_LIMIT])));

    await expect(fetchCustomApiFilePermissions({ request, apiFileIds })).rejects.toThrow(
      /whole batch/
    );
  });

  it('keeps going when only the trailing partial batch fails', async () => {
    const ids = Array.from({ length: PERMISSION_FETCH_CONCURRENCY + 1 }, (_, i) => `f${i}`);
    const results: Record<string, unknown> = Object.fromEntries(ids.map((id) => [id, OK_EMPTY]));
    results[ids.at(-1)!] = RATE_LIMIT;
    const request = createRequest(results);

    const result = await fetchCustomApiFilePermissions({ request, apiFileIds: ids });

    // 末批不足并发度时全失败只记 failed，符合「单节点失败不中止整轮」
    expect(result.get(ids.at(-1)!)).toEqual({ apiFileId: ids.at(-1)!, status: 'failed' });
    expect(result.get('f0')?.status).toBe('ok');
  });

  it('propagates the deadline error instead of recording it as a failed node', async () => {
    const request = createRequest({ f1: OK_EMPTY });

    await expect(
      fetchCustomApiFilePermissions({
        request,
        apiFileIds: ['f1'],
        deadlineAt: Date.now() - 1
      })
    ).rejects.toBeInstanceOf(PermissionSyncDeadlineError);
  });

  it('aborts as a deadline error when the budget runs out during a request', async () => {
    const request = {
      getFileDetail: () => new Promise(() => {})
    } as unknown as Parameters<typeof fetchCustomApiFilePermissions>[0]['request'];

    // 预算远小于单请求超时上限：本次请求超时即代表截止时间已到，不能记成节点失败
    await expect(
      fetchCustomApiFilePermissions({
        request,
        apiFileIds: ['f1'],
        deadlineAt: Date.now() + 20
      })
    ).rejects.toBeInstanceOf(PermissionSyncDeadlineError);
  });
});
