import { describe, expect, it } from 'vitest';
import { FastGptError } from '../src/core/errors';
import { isUserInputInteractive, isUserSelectInteractive } from '../src/helpers/interactive';
import { createCursorPaginator, createPageNumPaginator } from '../src/helpers/pagination';
import { FastGPT } from '../src/index';

const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });

describe('OpenAPI-Backed Helpers (Interactive Workflow & Auto-Pagination)', () => {
  it('detects, unwraps, and replies to userSelect and userInput interactive workflow pauses', async () => {
    const sentPayloads: Array<Record<string, unknown>> = [];

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-app-key',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        sentPayloads.push(body);
        return jsonRes({
          id: 'cmpl-resume',
          choices: [{ index: 0, message: { role: 'assistant', content: '已继续执行完成' } }]
        });
      }
    });

    // 1. 从嵌套子流程交互响应中提取并解包最内层交互
    const nonStreamCompletion = {
      id: 'cmpl-1',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: [
              {
                interactive: {
                  type: 'childrenInteractive',
                  params: {
                    childrenResponse: {
                      type: 'userSelect',
                      params: {
                        description: '请选择审批路径',
                        userSelectOptions: [
                          { key: 'opt1', value: '通过' },
                          { key: 'opt2', value: '驳回' }
                        ]
                      }
                    }
                  }
                }
              }
            ]
          }
        }
      ]
    };

    expect(client.chat.interactive.isPending(nonStreamCompletion)).toBe(true);
    const outer = client.chat.interactive.extract(nonStreamCompletion);
    expect(outer?.type).toBe('childrenInteractive');
    const inner = client.chat.interactive.unwrap(outer!);
    expect(inner.type).toBe('userSelect');
    expect(isUserSelectInteractive(inner)).toBe(true);
    expect(isUserInputInteractive(inner)).toBe(false);

    // 验证 README 中的严格类型收窄用法可直接访问 userSelectOptions[0].value，无需强制断言
    if (inner.type === 'userSelect') {
      const firstOptionValue: string = inner.params.userSelectOptions[0]!.value;
      expect(firstOptionValue).toBe('通过');
    }

    // 未知交互类型归入独立判别值 type: 'unknown'，保留原始 rawType 与字段，避免与已知分支重叠
    const unknownPrompt = client.chat.interactive.extract({
      interactive: { type: 'futureCustomNode', params: { step: 1 } }
    });
    expect(unknownPrompt?.type).toBe('unknown');
    if (unknownPrompt?.type === 'unknown') {
      expect(unknownPrompt.rawType).toBe('futureCustomNode');
      expect(unknownPrompt.params).toEqual({ step: 1 });
    }

    // 2. 恢复 userSelect
    await client.chat.interactive.replyUserSelect({
      chatId: 'c-interactive',
      value: '通过'
    });
    expect(sentPayloads[0]?.messages).toEqual([{ role: 'user', content: '通过' }]);
    expect(sentPayloads[0]?.stream).toBe(false);

    // 3. 恢复 userInput 表单
    await client.chat.interactive.replyUserForm({
      chatId: 'c-interactive',
      values: { project: 'FastGPT', budget: 1000 }
    });
    expect(sentPayloads[1]?.messages).toEqual([
      { role: 'user', content: JSON.stringify({ project: 'FastGPT', budget: 1000 }) }
    ]);
  });

  it('auto-paginates offset and pageNum list endpoints with maxItems, pages(), toArray(), and AbortSignal', async () => {
    const allItems = Array.from({ length: 5 }, (_, idx) => ({
      _id: `chunk-${idx + 1}`,
      q: `Q${idx + 1}`,
      a: `A${idx + 1}`
    }));
    const requestedOffsets: number[] = [];

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { offset: number; pageSize: number };
        requestedOffsets.push(body.offset);
        return jsonRes({
          code: 200,
          data: {
            total: allItems.length,
            list: allItems.slice(body.offset, body.offset + body.pageSize)
          }
        });
      }
    });

    // 1. 全量逐条遍历（pageSize=2，共 3 页：0, 2, 4）
    const collectedIds: string[] = [];
    for await (const item of client.datasets.data.listAutoPaging(
      { collectionId: 'col-1' },
      { pageSize: 2 }
    )) {
      collectedIds.push(item._id);
    }
    expect(collectedIds).toEqual(['chunk-1', 'chunk-2', 'chunk-3', 'chunk-4', 'chunk-5']);
    expect(requestedOffsets).toEqual([0, 2, 4]);

    // 2. maxItems 截断与 pages() 按页迭代
    requestedOffsets.length = 0;
    const pageSizes: number[] = [];
    for await (const page of client.datasets.data
      .listAutoPaging({ collectionId: 'col-1' }, { pageSize: 2, maxItems: 3 })
      .pages()) {
      pageSizes.push(page.length);
    }
    expect(pageSizes).toEqual([2, 1]);
    expect(requestedOffsets).toEqual([0, 2]);

    // 3. AbortSignal 中途取消
    const ac = new AbortController();
    ac.abort();
    await expect(
      client.datasets.data
        .listAutoPaging({ collectionId: 'col-1' }, { signal: ac.signal })
        .toArray()
    ).rejects.toThrow(FastGptError);

    // 4. 通用 pageNum 分页器
    const threeItems = allItems.slice(0, 3);
    const pageNums: number[] = [];
    const numPaged = await createPageNumPaginator({
      pageSize: 2,
      fetchPage: async ({ pageNum, pageSize }) => {
        pageNums.push(pageNum);
        const start = (pageNum - 1) * pageSize;
        return {
          total: threeItems.length,
          list: threeItems.slice(start, start + pageSize)
        };
      }
    }).toArray();
    expect(pageNums).toEqual([1, 2]);
    expect(numPaged.map((i) => i._id)).toEqual(['chunk-1', 'chunk-2', 'chunk-3']);
  });

  it('continues auto-paging without silent data loss when server clamps pageSize (e.g. max 500 or narrower route cap)', async () => {
    // 1. 模拟 FastGPT 服务端 PaginationPageSizeLimit = 500 截断规则：800 条数据，调用方传 pageSize: 1000
    const allCollections = Array.from({ length: 800 }, (_, idx) => ({
      _id: `col-${idx + 1}`
    }));
    const requestedPageSizes: number[] = [];

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { offset: number; pageSize: number };
        requestedPageSizes.push(body.pageSize);
        const serverClampedSize = Math.min(body.pageSize, 500);
        return jsonRes({
          code: 200,
          data: {
            total: allCollections.length,
            list: allCollections.slice(body.offset, body.offset + serverClampedSize)
          }
        });
      }
    });

    const collected = await client.datasets.collections
      .listAutoPaging({ datasetId: 'ds-1' }, { pageSize: 1000 })
      .toArray();
    expect(collected).toHaveLength(800);
    expect(collected[0]?._id).toBe('col-1');
    expect(collected[799]?._id).toBe('col-800');
    expect(requestedPageSizes.every((size) => size <= 500)).toBe(true);

    // 2. 模拟子接口更严格的页大小上限（如 100 条/页），offset 与 pageNum 模式均能完整翻完 250 条
    const allRecords = Array.from({ length: 250 }, (_, idx) => ({ _id: `rec-${idx + 1}` }));
    const narrowClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { offset: number; pageSize: number };
        const clamped = Math.min(body.pageSize, 100);
        return jsonRes({
          code: 200,
          data: {
            total: allRecords.length,
            list: allRecords.slice(body.offset, body.offset + clamped)
          }
        });
      }
    });
    const offsetAll = await narrowClient.datasets.collections
      .listAutoPaging({ datasetId: 'ds-2' }, { pageSize: 300 })
      .toArray();
    expect(offsetAll).toHaveLength(250);

    const pageNumCalls: Array<{ pageNum: number; pageSize: number }> = [];
    const pageNumAll = await createPageNumPaginator({
      pageSize: 1000,
      fetchPage: async ({ pageNum, pageSize }) => {
        pageNumCalls.push({ pageNum, pageSize });
        const clamped = Math.min(pageSize, 100);
        const start = (pageNum - 1) * clamped;
        return {
          total: allRecords.length,
          list: allRecords.slice(start, start + clamped)
        };
      }
    }).toArray();
    expect(pageNumAll).toHaveLength(250);
    expect(pageNumAll[0]?._id).toBe('rec-1');
    expect(pageNumAll[249]?._id).toBe('rec-250');
    // 全程保持一致的 pageSize 寻址基线，避免短页反推改写 pageSize 引发跨页重读
    expect(pageNumCalls).toEqual([
      { pageNum: 1, pageSize: 500 },
      { pageNum: 2, pageSize: 500 },
      { pageNum: 3, pageSize: 500 }
    ]);
  });

  it('preserves consistent pageNum addressing baseline on initialPageNum > 1 with server cap and honors pageSize/hasMore metadata', async () => {
    // 1. 复现边界场景：总计 120 条、服务端单页上限 50，客户端从 initialPageNum=3, pageSize=100 起始；
    // 第 3 页命中尾页（101..120，共 20 条），绝不能把后续 pageSize 改写为 20 回读第 61..120 条。
    const items120 = Array.from({ length: 120 }, (_, idx) => ({ _id: `item-${idx + 1}` }));
    const clampedCalls: Array<{ pageNum: number; pageSize: number }> = [];

    const tailItems = await createPageNumPaginator({
      initialPageNum: 3,
      pageSize: 100,
      fetchPage: async ({ pageNum, pageSize }) => {
        clampedCalls.push({ pageNum, pageSize });
        const clamped = Math.min(pageSize, 50);
        const start = (pageNum - 1) * clamped;
        return {
          total: items120.length,
          list: items120.slice(start, start + clamped)
        };
      }
    }).toArray();

    expect(tailItems.map((i) => i._id)).toEqual(
      Array.from({ length: 20 }, (_, idx) => `item-${101 + idx}`)
    );
    expect(clampedCalls).toEqual([
      { pageNum: 3, pageSize: 100 },
      { pageNum: 4, pageSize: 100 }
    ]);

    // 2. 若响应提供服务端实际 pageSize 或 hasMore 元数据，则精确终止且无需额外空页探测
    const metaCalls: Array<{ pageNum: number; pageSize: number }> = [];
    const metaTail = await createPageNumPaginator({
      initialPageNum: 3,
      pageSize: 100,
      fetchPage: async ({ pageNum, pageSize }) => {
        metaCalls.push({ pageNum, pageSize });
        const clamped = Math.min(pageSize, 50);
        const start = (pageNum - 1) * clamped;
        return {
          total: items120.length,
          pageSize: clamped,
          list: items120.slice(start, start + clamped)
        };
      }
    }).toArray();

    expect(metaTail).toHaveLength(20);
    expect(metaCalls).toEqual([{ pageNum: 3, pageSize: 100 }]);

    const hasMoreCalls: number[] = [];
    const hasMoreItems = await createPageNumPaginator({
      initialPageNum: 2,
      pageSize: 50,
      fetchPage: async ({ pageNum }) => {
        hasMoreCalls.push(pageNum);
        return {
          total: 200,
          hasMore: pageNum < 3,
          list: [{ _id: `p-${pageNum}` }]
        };
      }
    }).toArray();
    expect(hasMoreItems.map((i) => i._id)).toEqual(['p-2', 'p-3']);
    expect(hasMoreCalls).toEqual([2, 3]);
  });

  it('auto-paginates cursor endpoints via createCursorPaginator and apps.logs.searchAutoPaging', async () => {
    const sentBodies: Array<Record<string, unknown>> = [];
    const cursor1 = { timestamp: 1735689600000, id: '68ad85a7463006c963799a02' };

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      defaultAppId: '68ad85a7463006c963799a05',
      fetch: async (input, init) => {
        const url = String(input);
        expect(url.endsWith('/api/core/app/logs/search')).toBe(true);
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        sentBodies.push(body);

        if (body.cursor === undefined) {
          return jsonRes({
            code: 200,
            data: {
              list: [
                {
                  _id: 'log-1',
                  chatId: 'c1',
                  updateTime: '2026-01-02T00:00:00.000Z',
                  source: 'api'
                },
                {
                  _id: 'log-2',
                  chatId: 'c2',
                  updateTime: '2026-01-01T00:00:00.000Z',
                  source: 'api'
                }
              ],
              nextCursor: cursor1
            }
          });
        }
        expect(body.cursor).toEqual(cursor1);
        return jsonRes({
          code: 200,
          data: {
            list: [
              {
                _id: 'log-3',
                chatId: 'c3',
                updateTime: '2025-12-31T00:00:00.000Z',
                source: 'api'
              }
            ]
          }
        });
      }
    });

    const logs = await client.apps.logs
      .searchAutoPaging({
        dateStart: '2025-12-01T00:00:00.000Z',
        dateEnd: '2026-01-03T00:00:00.000Z'
      })
      .toArray();
    expect(logs.map((item) => item._id)).toEqual(['log-1', 'log-2', 'log-3']);
    expect(sentBodies).toHaveLength(2);
    expect(sentBodies[0]?.cursor).toBeUndefined();
    expect(sentBodies[1]?.cursor).toEqual(cursor1);

    // 验证 maxItems、maxPages、AbortSignal 控制
    const capped = await createCursorPaginator<string, string>({
      maxItems: 3,
      maxPages: 2,
      fetchPage: async ({ cursor }) => {
        if (cursor === undefined) {
          return { list: ['a', 'b'], nextCursor: 'cur-2' };
        }
        return { list: ['c', 'd'], nextCursor: 'cur-3' };
      }
    }).toArray();
    expect(capped).toEqual(['a', 'b', 'c']);

    const ac = new AbortController();
    ac.abort();
    await expect(
      createCursorPaginator<string, string>({
        signal: ac.signal,
        fetchPage: async () => ({ list: ['never'] })
      }).toArray()
    ).rejects.toThrow(FastGptError);
  });
});
