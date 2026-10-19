import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useYuqueDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/yuqueDataset/api';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { createDatasetCache } from '@fastgpt/service/support/tmpData/datasetCache';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import { serviceEnv } from '@fastgpt/service/env';
import type { AsyncCache } from '@fastgpt/service/common/cache/type';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/api/axios')>()),
  createProxyAxios: () => ({
    request,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
  })
}));
const cache = createDatasetCache({ namespace: 'yuque-browse-test', ttlMs: 180_000 });
const server = { token: 'token', userId: 'group', basePath: '100' };
const node = {
  id: 10,
  uuid: 'parent',
  type: 'DOC',
  title: 'Parent',
  parent_uuid: '',
  child_uuid: 'child'
};
const child = {
  id: 11,
  uuid: 'child',
  type: 'DOC',
  title: 'Child',
  parent_uuid: 'parent',
  child_uuid: ''
};
const toc = [node, child];
const ok = (data: unknown) => ({ data: { data } });
const provider = (
  overrides: Partial<typeof server> = {},
  injectedCache: AsyncCache | undefined = cache
) => useYuqueDatasetRequest({ yuqueServer: { ...server, ...overrides }, cache: injectedCache });

beforeEach(async () => {
  request.mockReset();
  await MongoTmpData.deleteMany({});
});

describe('语雀浏览快照缓存', () => {
  it('新 Provider 进入、返回目录及读取节点详情复用同一整库 TOC', async () => {
    request.mockResolvedValue(ok(toc));
    expect((await provider().listFiles({}))[0].name).toBe('Parent');
    expect((await provider().listFiles({ parentId: '100-10-parent' }))[0].name).toBe('Child');
    expect((await provider().getFileDetail({ apiFileId: '100-11-child' })).success).toBe(true);
    await provider().listFiles({});
    expect(request).toHaveBeenCalledTimes(1);
    expect(await MongoTmpData.countDocuments({})).toBe(1);
  });

  it('同缓存对象的跨实例并发只发一次来源请求', async () => {
    let resolve!: (value: ReturnType<typeof ok>) => void;
    request.mockReturnValue(
      new Promise<ReturnType<typeof ok>>((done) => {
        resolve = done;
      })
    );
    const pending = Array.from({ length: 10 }, () => provider().listFiles({}));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    resolve(ok(toc));
    const lists = await Promise.all(pending);
    expect(lists.every((list) => list[0].name === 'Parent')).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('过期后获取新快照，读取命中不延长有效期', async () => {
    request.mockResolvedValueOnce(ok(toc)).mockResolvedValueOnce(ok([{ ...node, title: 'New' }]));
    await provider().listFiles({});
    const original = await MongoTmpData.findOne({}).lean();
    await provider().listFiles({});
    expect((await MongoTmpData.findOne({}).lean())!.expireAt).toEqual(original!.expireAt);
    await MongoTmpData.updateOne({}, { $set: { expireAt: new Date(Date.now() - 1) } });
    expect((await provider().listFiles({}))[0].name).toBe('New');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('服务地址、凭证、团队和知识库隔离，缓存键不含原始 Token', async () => {
    request.mockResolvedValue(ok(toc));
    await provider().listFiles({});
    await provider({ token: 'different-secret' }).listFiles({});
    await provider({ userId: 'another-group' }).listFiles({});
    await provider().listFiles({ parentId: '101' });
    const oldBaseUrl = serviceEnv.YUQUE_DATASET_BASE_URL;
    try {
      Object.defineProperty(serviceEnv, 'YUQUE_DATASET_BASE_URL', {
        value: 'https://private.yuque.test'
      });
      await provider().listFiles({});
    } finally {
      Object.defineProperty(serviceEnv, 'YUQUE_DATASET_BASE_URL', { value: oldBaseUrl });
    }
    expect(request).toHaveBeenCalledTimes(5);
    expect(await MongoTmpData.countDocuments({})).toBe(5);
  });

  it('不注入缓存的正式处理获取新 TOC，不消费浏览快照', async () => {
    request.mockResolvedValueOnce(ok(toc)).mockResolvedValueOnce(ok([{ ...node, title: 'Fresh' }]));
    await provider().listFiles({});
    const fresh = await getApiDatasetRequest({ yuqueServer: server });
    expect((await fresh.listFiles({}))[0].name).toBe('Fresh');
    await fresh.listFiles({});
    expect(request).toHaveBeenCalledTimes(2);
    expect((await provider().listFiles({}))[0].name).toBe('Parent');
  });

  it.each([[], [{ id: 1, name: 'Repo' }]].map((repos) => ({ repos })))(
    '根知识库列表 %j 与 TOC 分开缓存',
    async ({ repos }) => {
      request.mockResolvedValueOnce(ok(repos)).mockResolvedValueOnce(ok(toc));
      await provider({ basePath: '' }).listFiles({});
      expect(await provider({ basePath: '' }).listFiles({})).toHaveLength(repos.length);
      await provider().listFiles({});
      expect(request).toHaveBeenCalledTimes(2);
      expect(await MongoTmpData.countDocuments({})).toBe(2);
    }
  );

  it('分页中途失败不缓存部分结果，重试后多个实例及详情共用完整快照', async () => {
    const firstPage = Array.from({ length: 100 }, (_, id) => ({
      id: id + 1,
      name: String(id + 1)
    }));
    request
      .mockResolvedValueOnce(ok(firstPage))
      .mockRejectedValueOnce(new Error('second page failed'));
    const api = provider({ basePath: '' });
    await expect(api.listFiles({})).rejects.toThrow('second page failed');
    expect(await MongoTmpData.countDocuments({})).toBe(0);
    request
      .mockResolvedValueOnce(ok(firstPage))
      .mockResolvedValueOnce(ok([{ id: 101, name: 'Last' }]));
    expect(await api.listFiles({})).toHaveLength(101);
    expect((await api.getFileDetail({ apiFileId: '101' })).success).toBe(true);
    expect((await provider({ basePath: '' }).getFileDetail({ apiFileId: '1' })).success).toBe(true);
    expect(request).toHaveBeenCalledTimes(4);
    expect(await MongoTmpData.countDocuments({})).toBe(1);
  });

  it.each(['toc', 'repos'])('%s 加载失败不缓存，后续请求仍可重试', async (kind) => {
    const data = kind === 'toc' ? toc : [{ id: 1, name: 'Repo' }];
    request
      .mockRejectedValueOnce({ response: { status: 429 }, message: 'quota exhausted' })
      .mockResolvedValueOnce(ok(data));
    const api = provider({ basePath: kind === 'toc' ? '100' : '' });
    await expect(api.listFiles({})).rejects.toMatchObject({ message: 'quota exhausted' });
    expect(await MongoTmpData.countDocuments({})).toBe(0);
    await api.listFiles({});
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('缺失可选 Token 时仍返回来源鉴权错误，不在缓存键计算阶段失败', async () => {
    request.mockRejectedValueOnce({ response: { status: 401 }, message: 'token required' });
    await expect(provider({ token: undefined }).listFiles({})).rejects.toMatchObject({
      message: 'token required'
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(await MongoTmpData.countDocuments({})).toBe(0);
  });

  it.each(['get', 'set'] as const)('缓存 %s 失败不阻断来源请求', async (method) => {
    const injected: AsyncCache = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined)
    };
    vi.mocked(injected[method]).mockRejectedValueOnce(new Error('cache unavailable'));
    request.mockResolvedValue(ok(toc));
    expect((await provider({}, injected).listFiles({}))[0].name).toBe('Parent');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('非法缓存按未命中处理，合法空 TOC 也能缓存', async () => {
    const injected: AsyncCache = {
      get: vi.fn(async () => [{ error: 'bad snapshot' }]),
      set: vi.fn(async () => undefined)
    };
    request.mockResolvedValue(ok([]));
    expect(await provider({}, injected).listFiles({})).toEqual([]);
    expect(injected.set).toHaveBeenCalledWith(expect.any(String), []);
    await provider().listFiles({});
    await provider().listFiles({});
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('来源返回缺失标识的记录不会写入共享缓存', async () => {
    request.mockResolvedValueOnce(ok([{ ...node, id: undefined }]));
    await provider().listFiles({});
    expect(await MongoTmpData.countDocuments({})).toBe(0);
    request.mockResolvedValueOnce(ok([{ id: '', name: 'Repo' }]));
    await expect(provider({ basePath: '' }).listFiles({})).rejects.toBe('Invalid file data format');
    expect(await MongoTmpData.countDocuments({})).toBe(0);
  });
});
