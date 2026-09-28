import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

const mocks = vi.hoisted(() => ({
  consumeDatasetArchiveTicket: vi.fn(),
  loggerError: vi.fn(),
  nextAPI: vi.fn((handler) => handler),
  parseHeaderCert: vi.fn(),
  streamDatasetArchiveResponse: vi.fn(),
  withDatasetArchiveResources: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: mocks.nextAPI }));
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: vi.fn(() => ({ error: mocks.loggerError }))
}));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  parseHeaderCert: mocks.parseHeaderCert
}));
vi.mock('@/service/core/dataset/collection/archive', () => ({
  streamDatasetArchiveResponse: mocks.streamDatasetArchiveResponse,
  withDatasetArchiveResources: mocks.withDatasetArchiveResources
}));
vi.mock('@/service/core/dataset/collection/archiveTicket', () => ({
  consumeDatasetArchiveTicket: mocks.consumeDatasetArchiveTicket
}));

import handler from '@/pages/api/core/dataset/collection/batchDownload';

const routeOptions = mocks.nextAPI.mock.calls[0]?.[1];

const ticket = 'ticket-1';
const manifest = {
  directories: ['Knowledge Base/Empty'],
  files: [{ key: 'dataset/dataset-1/file-1', path: 'Knowledge Base/file.txt' }]
};

const createRequest = () => Object.assign(new EventEmitter(), { query: { ticket } });

class FakeResponse extends EventEmitter {
  headers = new Map<string, string>();
  headersSent = false;
  destroyed = false;
  destroy = vi.fn((_error?: Error) => {
    this.destroyed = true;
    return this;
  });
  setHeader = vi.fn((name: string, value: string) => {
    this.headers.set(name, value);
    return this;
  });
  removeHeader = (name: string) => this.headers.delete(name);
}

describe('GET /core/dataset/collection/batchDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseHeaderCert.mockResolvedValue({ teamId: 'team-1', tmbId: 'member-1' });
    mocks.consumeDatasetArchiveTicket.mockResolvedValue({
      tmbId: 'member-1',
      teamId: 'team-1',
      datasetId: 'dataset-1',
      manifest
    });
    mocks.withDatasetArchiveResources.mockImplementation(async ({ fn }) =>
      fn({ signals: [new AbortController().signal], assertValid: vi.fn() })
    );
    mocks.streamDatasetArchiveResponse.mockResolvedValue(undefined);
  });

  it('uses the one-time ticket instead of the web request header for CSRF protection', () => {
    expect(routeOptions).toEqual({
      csrf: false,
      redactQueryParams: ['ticket']
    });
  });

  it('allows the download response in a same-origin iframe before validating the ticket', async () => {
    const req = Object.assign(new EventEmitter(), { query: {} });
    const res = new FakeResponse();

    await expect(handler(req as any, res as any)).rejects.toBeDefined();

    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it('authenticates the member, consumes the ticket, and streams the prepared archive', async () => {
    const req = createRequest();
    const res = new FakeResponse();

    await handler(req as any, res as any);

    expect(mocks.parseHeaderCert).toHaveBeenCalledWith({
      req,
      authToken: true,
      authApiKey: true
    });
    expect(mocks.withDatasetArchiveResources).toHaveBeenCalledWith(
      expect.objectContaining({ tmbId: 'member-1', waitForSlot: true })
    );
    expect(mocks.consumeDatasetArchiveTicket).toHaveBeenCalledWith({
      tmbId: 'member-1',
      ticket
    });
    expect(mocks.streamDatasetArchiveResponse).toHaveBeenCalledWith(
      expect.objectContaining({ res, manifest })
    );
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Cache-Control')).toBe('no-store, no-transform');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('Content-Disposition')).toContain('attachment;');
  });

  it('acquires the lease before consuming the ticket', async () => {
    const events: string[] = [];
    mocks.withDatasetArchiveResources.mockImplementation(async ({ fn }) => {
      events.push('lease');
      return fn({ signals: [], assertValid: vi.fn() });
    });
    mocks.consumeDatasetArchiveTicket.mockImplementation(async () => {
      events.push('ticket');
      return { tmbId: 'member-1', teamId: 'team-1', datasetId: 'dataset-1', manifest };
    });

    await handler(createRequest() as any, new FakeResponse() as any);

    expect(events).toEqual(['lease', 'ticket']);
  });

  it('does not consume the ticket when no archive lease is available', async () => {
    mocks.withDatasetArchiveResources.mockRejectedValueOnce(DatasetErrEnum.archiveUnavailable);

    await expect(handler(createRequest() as any, new FakeResponse() as any)).rejects.toBe(
      DatasetErrEnum.archiveUnavailable
    );
    expect(mocks.consumeDatasetArchiveTicket).not.toHaveBeenCalled();
  });

  it('does not consume the ticket when the client disconnects while waiting for a lease', async () => {
    const req = createRequest();
    mocks.withDatasetArchiveResources.mockImplementationOnce(async ({ fn }) => {
      Object.assign(req, { aborted: true });
      req.emit('aborted');
      return fn({ signals: [new AbortController().signal], assertValid: vi.fn() });
    });

    await expect(handler(req as any, new FakeResponse() as any)).rejects.toThrow(
      'S3ProxyDownloadClientAborted'
    );
    expect(mocks.consumeDatasetArchiveTicket).not.toHaveBeenCalled();
  });

  it('rejects a ticket from another team as a terminal ticket error', async () => {
    mocks.consumeDatasetArchiveTicket.mockResolvedValueOnce({
      tmbId: 'member-1',
      teamId: 'team-2',
      datasetId: 'dataset-1',
      manifest
    });

    await expect(handler(createRequest() as any, new FakeResponse() as any)).rejects.toBe(
      DatasetErrEnum.archiveInvalidTicket
    );
    expect(mocks.streamDatasetArchiveResponse).not.toHaveBeenCalled();
  });

  it('rejects a missing or consumed ticket without retrying it as capacity contention', async () => {
    mocks.consumeDatasetArchiveTicket.mockResolvedValueOnce(undefined);

    await expect(handler(createRequest() as any, new FakeResponse() as any)).rejects.toBe(
      DatasetErrEnum.archiveInvalidTicket
    );
    expect(mocks.streamDatasetArchiveResponse).not.toHaveBeenCalled();
  });

  it('turns a pre-stream lease failure into a terminal error after consuming the ticket', async () => {
    mocks.streamDatasetArchiveResponse.mockRejectedValueOnce(DatasetErrEnum.archiveUnavailable);

    await expect(handler(createRequest() as any, new FakeResponse() as any)).rejects.toBe(
      DatasetErrEnum.archiveInvalidTicket
    );
  });

  it('destroys an already-started response when streaming fails', async () => {
    const res = new FakeResponse();
    const streamError = new Error('stream failed');
    mocks.streamDatasetArchiveResponse.mockImplementationOnce(async () => {
      res.headersSent = true;
      throw streamError;
    });

    await expect(handler(createRequest() as any, res as any)).resolves.toBeUndefined();
    expect(res.destroy).toHaveBeenCalledWith(streamError);
  });

  it('clears ZIP headers before returning a pre-stream error', async () => {
    const res = new FakeResponse();
    const error = new Error('failed before first byte');
    mocks.streamDatasetArchiveResponse.mockRejectedValueOnce(error);

    await expect(handler(createRequest() as any, res as any)).rejects.toBe(error);
    expect([...res.headers.entries()]).toEqual([['X-Frame-Options', 'SAMEORIGIN']]);
    expect(res.destroyed).toBe(false);
  });
});
