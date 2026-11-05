import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadUsage } from '@/web/support/wallet/usage/download';
import { serializeUsageFilters } from '@/web/support/wallet/usage/utils';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: (url: string) => `/base${url}`
}));
vi.mock('@fastgpt/web/i18n/utils', () => ({
  getLanguageRequestHeaders: () => ({ 'Fastgpt-Language': 'zh-CN' })
}));

const body = {
  dateStart: '2026-11-01T00:00:00+08:00',
  dateEnd: '2026-11-01T23:59:59.999+08:00',
  subjectFilter: { type: 'member' as const, ids: [] },
  expectedScope: 'team' as const,
  requestKey: 'download',
  appNameMap: {},
  sourcesMap: {},
  title: 'Time,Member'
};
const context = {
  requestKey: 'download',
  canManageMembers: false,
  scope: 'self',
  subjectFilter: { type: 'member', ids: [] },
  selectedItems: [],
  notices: ['PERMISSION_CHANGED'],
  selectionChanged: false,
  scopeChanged: true,
  resetPagination: true
};

describe('usage download adapter', () => {
  let dom: JSDOM;
  const save = vi.fn(),
    create = vi.fn(() => 'blob:usage'),
    revoke = vi.fn();
  beforeEach(() => {
    dom = new JSDOM('<!doctype html><body></body>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(dom.window.HTMLAnchorElement.prototype, 'click').mockImplementation(save);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(create);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
    save.mockClear();
    create.mockClear();
    revoke.mockClear();
  });
  afterEach(() => {
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('saves only a 200 CSV, preserving the request body, cancellation and base path', async () => {
    const csv = '\uFEFFTime,Member\n2026-11-01,Left';
    vi.mocked(fetch).mockResolvedValue(
      new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
    );
    const controller = new AbortController();
    expect(await downloadUsage({ body, signal: controller.signal, isCurrent: () => true })).toEqual(
      { kind: 'downloaded' }
    );
    expect(fetch).toHaveBeenCalledWith(
      '/base/api/proApi/support/wallet/usage/exportUsage',
      expect.objectContaining({ signal: controller.signal, body: JSON.stringify(body) })
    );
    expect(save).toHaveBeenCalledOnce();
    expect(await (create.mock.calls[0] as unknown as [Blob])[0].text()).toBe(csv.slice(1));
    expect(
      [...new Uint8Array(await (create.mock.calls[0] as unknown as [Blob])[0].arrayBuffer())].slice(
        0,
        3
      )
    ).toEqual([0xef, 0xbb, 0xbf]);
    expect(revoke).toHaveBeenCalledWith('blob:usage');
    expect(document.querySelector('a')).toBeNull();
  });

  it('parses a 409 JSON conflict without saving any file', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { reason: 'USAGE_PERMISSION_CHANGED', context } }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    expect(await downloadUsage({ body, isCurrent: () => true })).toMatchObject({
      kind: 'conflict',
      reason: 'USAGE_PERMISSION_CHANGED',
      context: { scope: 'self' }
    });
    expect(save).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    [200, 'application/json', '{"data":{}}'],
    [500, 'text/csv', 'partial'],
    [409, 'application/json', '{"data":{"reason":"invalid"}}'],
    [200, 'text/html', '<html>Error</html>']
  ])('rejects invalid status or payload %s %s', async (status, contentType, text) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(text, { status, headers: { 'Content-Type': contentType } })
    );
    await expect(downloadUsage({ body, isCurrent: () => true })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it('does not save a completed CSV after the user changes filters', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Time,Member', { headers: { 'Content-Type': 'text/csv' } })
    );
    expect(await downloadUsage({ body, isCurrent: () => false })).toEqual({ kind: 'stale' });
    expect(save).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('retains permission error classification for clearing old team data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ statusText: 'unAuthTeam', message: 'Permission denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    await expect(downloadUsage({ body, isCurrent: () => true })).rejects.toMatchObject({
      code: 403,
      statusText: 'unAuthTeam'
    });
  });

  it('propagates interrupted CSV streams instead of saving partial content', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error('Stream interrupted'));
      }
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { headers: { 'Content-Type': 'text/csv' } })
    );
    await expect(downloadUsage({ body, isCurrent: () => true })).rejects.toThrow(
      'Stream interrupted'
    );
    expect(save).not.toHaveBeenCalled();
  });
});

describe('usage common date serialization', () => {
  it('clones dates and shares closed local natural days and source filters', () => {
    const from = new Date('2026-11-01T11:12:13Z'),
      to = new Date('2026-11-03T12:13:14Z');
    const before = [from.getTime(), to.getTime()];
    const result = serializeUsageFilters({
      dateRange: { from, to },
      sourceFilter: { mode: 'selected', values: [UsageSourceEnum.api, UsageSourceEnum.fastgpt] },
      projectName: 'App'
    });
    expect([from.getTime(), to.getTime()]).toEqual(before);
    expect(result.dateStart).toMatch(/T00:00:00\.000[+-]\d\d:\d\d$/);
    expect(result.dateEnd).toMatch(/T23:59:59\.999[+-]\d\d:\d\d$/);
    expect(result.sources).toEqual([UsageSourceEnum.api, UsageSourceEnum.fastgpt]);
    expect(result.projectName).toBe('App');
  });
});
