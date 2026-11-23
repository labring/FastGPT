import { describe, expect, it, vi } from 'vitest';
import { AppLogKeysEnum, AppLogTimespanEnum } from '@fastgpt/global/core/app/logs/constants';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { createAppLogsService } from '../../src/domain/app/app-logs-service';
import type { FileIoAdapter } from '../../src/infra/fs/file-io';
import type { FastGptHttpClient, RawHttpResponse } from '../../src/infra/http/fastgpt-http-client';
import { CliApiError, CliArgumentError } from '../../src/shared/errors';

const APP_ID = '68ad85a7463006c963799a05';
const OTHER_APP_ID = '68ad85a7463006c963799a06';
const FIXED_NOW = new Date('2026-11-23T12:00:00.000Z');

function makeFileIo(overrides: Partial<FileIoAdapter> = {}): FileIoAdapter {
  return {
    resolvePath: (targetPath) => `/workspace/${targetPath}`,
    exists: vi.fn().mockResolvedValue(false),
    readTextFile: vi.fn(),
    readBinaryFile: vi.fn(),
    writeTextAtomic: vi.fn().mockImplementation(async ({ filePath }) => `/workspace/${filePath}`),
    createTextFiles: vi.fn(),
    ...overrides
  };
}

function makeClient({
  requestResponse = {},
  csvText = '\uFEFFtitle\nrow1'
}: {
  requestResponse?: unknown;
  csvText?: string;
} = {}): FastGptHttpClient {
  const rawResponse: RawHttpResponse = {
    status: 200,
    headers: new Headers({ 'content-type': 'text/csv; charset=utf-8' }),
    text: vi.fn().mockResolvedValue(csvText),
    arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(csvText).buffer)
  };
  return {
    baseUrl: 'https://cloud.fastgpt.cn/api',
    request: vi.fn().mockResolvedValue(requestResponse),
    requestRaw: vi.fn().mockResolvedValue(rawResponse),
    uploadMultipart: vi.fn(),
    streamSse: vi.fn()
  };
}

describe('createAppLogsService', () => {
  it('defaults to a 7-day range and returns cursor pagination metadata on search', async () => {
    const nextCursor = { timestamp: 1735689600000, id: APP_ID };
    const client = makeClient({
      requestResponse: {
        list: [{ _id: APP_ID, chatId: 'chat-1' }],
        nextCursor
      }
    });
    const service = createAppLogsService({
      fileIo: makeFileIo(),
      now: () => FIXED_NOW
    });

    const res = await service.search({
      client,
      credential: { kind: 'token' },
      input: {
        appId: APP_ID,
        chatSearch: 'billing',
        searchType: 'title',
        sources: [ChatSourceEnum.api],
        feedbackType: 'good',
        unreadOnly: true,
        errorFilter: 'has_error'
      }
    });

    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/core/app/logs/search',
      body: {
        appId: APP_ID,
        dateStart: '2026-11-16T12:00:00.000Z',
        dateEnd: '2026-11-23T12:00:00.000Z',
        chatSearch: 'billing',
        searchType: 'title',
        sources: ['api'],
        feedbackType: 'good',
        unreadOnly: true,
        errorFilter: 'has_error'
      }
    });
    expect(res.changed).toBe(false);
    expect(res.meta).toEqual({
      count: 1,
      nextCursor,
      hasMore: true
    });
  });

  it('passes through cursor JSON or cursorTimestamp + cursorId and sets hasMore false when absent', async () => {
    const client = makeClient({ requestResponse: { list: [] } });
    const service = createAppLogsService({
      fileIo: makeFileIo(),
      now: () => FIXED_NOW
    });

    const first = await service.search({
      client,
      credential: { kind: 'personalKey' },
      input: {
        appId: APP_ID,
        days: 3,
        cursor: JSON.stringify({ timestamp: 1735689600000, id: APP_ID })
      }
    });
    expect(client.request).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      path: '/core/app/logs/search',
      body: {
        appId: APP_ID,
        dateStart: '2026-11-20T12:00:00.000Z',
        dateEnd: '2026-11-23T12:00:00.000Z',
        cursor: { timestamp: 1735689600000, id: APP_ID }
      }
    });
    expect(first.meta).toEqual({
      count: 0,
      nextCursor: undefined,
      hasMore: false
    });

    await service.search({
      client,
      credential: { kind: 'personalKey' },
      input: {
        appId: APP_ID,
        dateStart: '2026-11-01',
        dateEnd: '2026-11-05',
        cursorTimestamp: 1735689600000,
        cursorId: OTHER_APP_ID
      }
    });
    expect(client.request).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/core/app/logs/search',
      body: {
        appId: APP_ID,
        dateStart: '2026-11-01T00:00:00.000',
        dateEnd: '2026-11-05T00:00:00.000',
        cursor: { timestamp: 1735689600000, id: OTHER_APP_ID }
      }
    });
  });

  it('rejects invalid time ranges and cursor combinations locally', async () => {
    const client = makeClient();
    const service = createAppLogsService({
      fileIo: makeFileIo(),
      now: () => FIXED_NOW
    });

    await expect(
      service.search({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID, dateStart: '2026-11-01' }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      service.search({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID, days: 7, dateStart: '2026-11-01', dateEnd: '2026-11-02' }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      service.search({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID, dateStart: '2026-11-05', dateEnd: '2026-11-01' }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      service.search({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID, days: 0 }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      service.search({
        client,
        credential: { kind: 'token' },
        input: {
          appId: APP_ID,
          cursor: '{"timestamp":1,"id":"68ad85a7463006c963799a05"}',
          cursorTimestamp: 1
        }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      service.search({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID, cursorTimestamp: 1 }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      service.search({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID, cursor: '{bad-json' }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    expect(client.request).not.toHaveBeenCalled();
  });

  it('builds offset and page pagination metadata for list and users', async () => {
    const client = makeClient({
      requestResponse: { list: [{ _id: '1' }, { _id: '2' }], total: 12 }
    });
    const service = createAppLogsService({
      fileIo: makeFileIo(),
      now: () => FIXED_NOW
    });

    const listRes = await service.list({
      client,
      credential: { kind: 'token' },
      input: { appId: APP_ID, page: 2, pageSize: 5 }
    });
    expect(client.request).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      path: '/core/app/logs/list',
      body: {
        appId: APP_ID,
        dateStart: '2026-11-16T12:00:00.000Z',
        dateEnd: '2026-11-23T12:00:00.000Z',
        pageNum: 2,
        pageSize: 5
      }
    });
    expect(listRes.meta).toEqual({
      total: 12,
      page: 2,
      pageSize: 5,
      hasMore: true,
      count: 2
    });

    const usersRes = await service.users({
      client,
      credential: { kind: 'token' },
      input: {
        appId: APP_ID,
        offset: 10,
        page: 1,
        pageSize: 5,
        searchKey: 'alice',
        sources: ['online']
      }
    });
    expect(client.request).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/core/app/logs/getUsers',
      body: {
        appId: APP_ID,
        dateStart: '2026-11-16T12:00:00.000Z',
        dateEnd: '2026-11-23T12:00:00.000Z',
        offset: 10,
        pageSize: 5,
        searchKey: 'alice',
        sources: ['online']
      }
    });
    expect(usersRes.meta).toEqual({
      total: 12,
      offset: 10,
      pageSize: 5,
      hasMore: false,
      count: 2
    });
  });

  it('enforces appId binding across token, personalKey, appKey, and unknownApiKey', async () => {
    const client = makeClient({ requestResponse: { totalUsers: 5 } });
    const service = createAppLogsService({
      fileIo: makeFileIo(),
      now: () => FIXED_NOW
    });

    await expect(
      service.stats({ client, credential: { kind: 'token' }, input: {} })
    ).rejects.toBeInstanceOf(CliArgumentError);
    await expect(
      service.stats({ client, credential: { kind: 'personalKey' }, input: {} })
    ).rejects.toBeInstanceOf(CliArgumentError);
    await expect(
      service.stats({
        client,
        credential: { kind: 'appKey', boundAppId: APP_ID },
        input: { appId: OTHER_APP_ID }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await service.stats({
      client,
      credential: { kind: 'appKey', boundAppId: APP_ID },
      input: {}
    });
    expect(client.request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      path: '/proApi/core/app/logs/getTotalData'
    });

    await service.stats({
      client,
      credential: { kind: 'unknownApiKey' },
      input: {}
    });
    expect(client.request).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/proApi/core/app/logs/getTotalData'
    });

    await service.stats({
      client,
      credential: { kind: 'appKey', boundAppId: APP_ID },
      input: { appId: APP_ID }
    });
    expect(client.request).toHaveBeenNthCalledWith(3, {
      method: 'GET',
      path: '/proApi/core/app/logs/getTotalData',
      query: { appId: APP_ID }
    });
  });

  it('maps Pro 404 errors on stats and chart to a clear FastGPT Pro error', async () => {
    const client = makeClient();
    vi.mocked(client.request).mockRejectedValue(
      new CliApiError({
        message: 'Not Found',
        httpStatus: 404
      })
    );
    const service = createAppLogsService({
      fileIo: makeFileIo(),
      now: () => FIXED_NOW
    });

    await expect(
      service.stats({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID }
      })
    ).rejects.toMatchObject({
      exitCode: 4,
      httpStatus: 404,
      message: expect.stringContaining('FastGPT Pro')
    });

    await expect(
      service.chart({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID }
      })
    ).rejects.toMatchObject({
      exitCode: 4,
      httpStatus: 404,
      message: expect.stringContaining('FastGPT Pro')
    });
  });

  it('applies timespan defaults and retention offset on chart', async () => {
    const client = makeClient({
      requestResponse: { userData: [], chatData: [], appData: [] }
    });
    const service = createAppLogsService({
      fileIo: makeFileIo(),
      now: () => FIXED_NOW
    });

    await service.chart({
      client,
      credential: { kind: 'token' },
      input: {
        appId: APP_ID,
        timespan: AppLogTimespanEnum.week,
        userTimespan: AppLogTimespanEnum.day,
        source: [ChatSourceEnum.api],
        offset: 7
      }
    });

    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/proApi/core/app/logs/getChartData',
      body: {
        appId: APP_ID,
        dateStart: '2026-11-16T12:00:00.000Z',
        dateEnd: '2026-11-23T12:00:00.000Z',
        source: ['api'],
        offset: 7,
        userTimespan: 'day',
        chatTimespan: 'week',
        appTimespan: 'week'
      }
    });
  });

  it('exports CSV with defaults, enforces overwrite guard, and writes atomically when outputPath is set', async () => {
    const csv = '\uFEFFchat logs\nrow1';
    const expectedBytes = new TextEncoder().encode(csv).byteLength;
    const fileIo = makeFileIo();
    const client = makeClient({ csvText: csv });
    const service = createAppLogsService({
      fileIo,
      now: () => FIXED_NOW
    });

    const inlineRes = await service.exportLogs({
      client,
      credential: { kind: 'token' },
      input: { appId: APP_ID }
    });
    expect(client.requestRaw).toHaveBeenCalledWith({
      method: 'POST',
      path: '/core/app/logs/exportLogs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appId: APP_ID,
        dateStart: '2026-11-16T12:00:00.000Z',
        dateEnd: '2026-11-23T12:00:00.000Z',
        title: 'chat logs',
        sourcesMap: Object.fromEntries(
          Object.values(ChatSourceEnum).map((source) => [source, { label: source }])
        ),
        logKeys: Object.values(AppLogKeysEnum)
      }),
      timeoutMs: 120_000
    });
    expect(inlineRes.data).toEqual({ csv, bytes: expectedBytes });

    vi.mocked(fileIo.exists).mockResolvedValueOnce(true);
    await expect(
      service.exportLogs({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID },
        outputPath: 'logs.csv'
      })
    ).rejects.toBeInstanceOf(CliArgumentError);
    expect(client.requestRaw).toHaveBeenCalledTimes(1);

    vi.mocked(fileIo.exists).mockResolvedValueOnce(true);
    const fileRes = await service.exportLogs({
      client,
      credential: { kind: 'token' },
      input: { appId: APP_ID },
      outputPath: 'logs.csv',
      overwrite: true
    });
    expect(fileIo.writeTextAtomic).toHaveBeenCalledWith({
      filePath: 'logs.csv',
      content: csv
    });
    expect(fileRes.data).toEqual({
      outputPath: '/workspace/logs.csv',
      bytes: expectedBytes
    });
  });
});
