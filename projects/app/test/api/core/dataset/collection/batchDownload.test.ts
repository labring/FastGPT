import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MemberRateLimitPolicy } from '@fastgpt/service/common/rateLimit/interface/member';

const mocks = vi.hoisted(() => ({
  authDatasetCollection: vi.fn(),
  assertMemberRateLimit: vi.fn(),
  loggerError: vi.fn(),
  prepareDatasetArchive: vi.fn(),
  streamDatasetArchiveResponse: vi.fn(),
  withDatasetArchiveResources: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: vi.fn((handler) => handler) }));
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: vi.fn(() => ({ error: mocks.loggerError }))
}));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: mocks.authDatasetCollection
}));
vi.mock('@fastgpt/service/common/rateLimit/interface/member', async (importOriginal) => ({
  ...(await importOriginal()),
  assertMemberRateLimit: mocks.assertMemberRateLimit
}));
vi.mock('@/service/core/dataset/collection/archive', () => ({
  prepareDatasetArchive: mocks.prepareDatasetArchive,
  streamDatasetArchiveResponse: mocks.streamDatasetArchiveResponse,
  withDatasetArchiveResources: mocks.withDatasetArchiveResources
}));

import handler from '@/pages/api/core/dataset/collection/batchDownload';

const collectionId = '68ad85a7463006c963799a05';
const datasetId = '68ad85a7463006c963799b01';
const createRequest = (collectionIds: string | string[] = [collectionId]) =>
  Object.assign(new EventEmitter(), { body: { collectionIds } });

class FakeResponse extends EventEmitter {
  headers = new Map<string, string>();
  headersSent = false;
  destroyed = false;
  writableEnded = false;
  writableFinished = false;
  destroy = vi.fn((error?: Error) => {
    this.destroyed = true;
    return this;
  });
  setHeader = vi.fn((name: string, value: string) => {
    this.headers.set(name, value);
    return this;
  });
  removeHeader = (name: string) => this.headers.delete(name);
}

describe('POST /core/dataset/collection/batchDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authDatasetCollection.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'member-1',
      collection: {
        _id: collectionId,
        datasetId,
        dataset: { _id: datasetId, name: 'Knowledge Base', type: DatasetTypeEnum.dataset }
      }
    });
    mocks.withDatasetArchiveResources.mockImplementation(async ({ fn }) =>
      fn({ signals: [new AbortController().signal], assertValid: vi.fn() })
    );
    mocks.prepareDatasetArchive.mockResolvedValue({
      directories: [],
      files: []
    });
    mocks.streamDatasetArchiveResponse.mockResolvedValue(undefined);
  });

  it('authenticates read access, prepares under resource leases and streams a ZIP response', async () => {
    const req = createRequest() as any;
    const res = new FakeResponse();

    await handler(req, res as any);

    expect(mocks.authDatasetCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        collectionId,
        authToken: true,
        authApiKey: true,
        per: ReadPermissionVal
      })
    );
    expect(mocks.withDatasetArchiveResources).toHaveBeenCalledWith(
      expect.objectContaining({ tmbId: 'member-1' })
    );
    expect(mocks.assertMemberRateLimit).toHaveBeenCalledWith({
      policy: MemberRateLimitPolicy.DownloadDatasetArchive,
      memberId: 'member-1'
    });
    expect(mocks.prepareDatasetArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        datasetId,
        datasetName: 'Knowledge Base',
        collectionIds: [collectionId]
      })
    );
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Cache-Control')).toBe('no-store, no-transform');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    expect(res.headers.get('Content-Disposition')).toContain('attachment;');
    expect(mocks.streamDatasetArchiveResponse).toHaveBeenCalledTimes(1);
  });

  it('rejects non-general datasets before acquiring archive resources', async () => {
    mocks.authDatasetCollection.mockResolvedValueOnce({
      teamId: 'team-1',
      tmbId: 'member-1',
      collection: {
        _id: collectionId,
        datasetId,
        dataset: { _id: datasetId, name: 'Website', type: DatasetTypeEnum.websiteDataset }
      }
    });

    await expect(
      handler(createRequest(collectionId) as any, new FakeResponse() as any)
    ).rejects.toBe(DatasetErrEnum.archiveUnsupportedDataset);
    expect(mocks.withDatasetArchiveResources).not.toHaveBeenCalled();
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

  it('clears ZIP headers before returning an error to the JSON middleware', async () => {
    const res = new FakeResponse();
    const error = new Error('failed before first byte');
    mocks.streamDatasetArchiveResponse.mockRejectedValueOnce(error);
    await expect(handler(createRequest() as any, res as any)).rejects.toBe(error);
    expect(res.headers.size).toBe(0);
    expect(res.destroyed).toBe(false);
  });

  it.each(['request', 'response', 'lease'])(
    'propagates %s cancellation during preflight and cleans up listeners',
    async (source) => {
      const req = createRequest();
      const res = new FakeResponse();
      const lease = new AbortController();
      mocks.withDatasetArchiveResources.mockImplementationOnce(async ({ fn }) =>
        fn({ signals: [lease.signal], assertValid: vi.fn() })
      );
      let signalDuringPreparation: AbortSignal | undefined;
      mocks.prepareDatasetArchive.mockImplementationOnce(async ({ signal }) => {
        signalDuringPreparation = signal;
        if (source === 'request') req.emit('aborted');
        if (source === 'response') res.emit('close');
        if (source === 'lease') lease.abort(new Error('lease lost'));
        signal?.throwIfAborted();
        return { directories: ['Empty'], files: [] };
      });
      await handler(req as any, res as any).catch(() => undefined);
      expect(signalDuringPreparation?.aborted).toBe(true);
      expect(mocks.streamDatasetArchiveResponse).not.toHaveBeenCalled();
      expect(req.listenerCount('aborted')).toBe(0);
      expect(res.listenerCount('close')).toBe(0);
      expect(res.listenerCount('finish')).toBe(0);
    }
  );
});
