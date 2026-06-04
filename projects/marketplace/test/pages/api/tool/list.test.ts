import { beforeEach, describe, expect, it, vi } from 'vitest';

const toolDataMocks = vi.hoisted(() => ({
  getToolList: vi.fn()
}));

const s3Mocks = vi.hoisted(() => ({
  getPkgdownloadURL: vi.fn((toolId: string) => `https://cdn.example.com/${toolId}.pkg`)
}));

vi.mock('@/service/tool/data', () => toolDataMocks);
vi.mock('@/service/s3', () => s3Mocks);

const createResponse = () => {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    writableFinished: false,
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      res.body = payload;
      res.writableFinished = true;
      return res;
    }),
    end: vi.fn(() => {
      res.writableFinished = true;
      return res;
    })
  };

  return res;
};

const createTool = (override: Record<string, unknown> = {}) => ({
  type: 'tool',
  pluginId: 'tool-a',
  toolId: 'tool-a',
  id: 'tool-a',
  name: { en: 'Tool A' },
  description: { en: 'Tool A description' },
  icon: 'icon.svg',
  author: 'FastGPT',
  tags: ['search'],
  downloadCount: 7,
  ...override
});

describe('/api/tool/list', () => {
  beforeEach(() => {
    toolDataMocks.getToolList.mockReset();
    s3Mocks.getPkgdownloadURL.mockClear();
  });

  it('filters by tag without crashing when a marketplace tool has no tags', async () => {
    toolDataMocks.getToolList.mockResolvedValue([
      createTool({
        toolId: 'missing-tags',
        id: 'missing-tags',
        pluginId: 'missing-tags',
        tags: undefined
      }),
      createTool({ toolId: 'matched', id: 'matched', pluginId: 'matched', tags: ['search'] })
    ]);

    const { default: handler } = await import('../../../../../src/pages/api/tool/list');
    const res = createResponse();
    await handler(
      {
        method: 'POST',
        query: {},
        body: {
          pageNum: 1,
          pageSize: 10,
          tags: ['search']
        }
      } as any,
      res as any
    );

    expect(res.body).toMatchObject({ code: 200 });
    expect(res.body).toMatchObject({
      code: 200,
      data: {
        total: 1,
        list: [
          {
            toolId: 'matched',
            tags: ['search'],
            downloadUrl: 'https://cdn.example.com/matched.pkg'
          }
        ]
      }
    });
  });

  it('keeps tools without tags when no tag filter is requested', async () => {
    toolDataMocks.getToolList.mockResolvedValue([
      createTool({
        toolId: 'missing-tags',
        id: 'missing-tags',
        pluginId: 'missing-tags',
        tags: undefined,
        secretSchema: { properties: [{ key: 'apiKey' }] }
      })
    ]);

    const { default: handler } = await import('../../../../../src/pages/api/tool/list');
    const res = createResponse();
    await handler(
      {
        method: 'POST',
        query: {},
        body: {
          pageNum: 1,
          pageSize: 10
        }
      } as any,
      res as any
    );

    expect(res.body).toMatchObject({
      code: 200,
      data: {
        total: 1,
        list: [
          {
            toolId: 'missing-tags',
            hasSecret: true,
            downloadUrl: 'https://cdn.example.com/missing-tags.pkg'
          }
        ]
      }
    });
  });
});
