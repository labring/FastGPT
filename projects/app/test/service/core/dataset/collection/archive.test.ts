import { PassThrough, Readable, Writable } from 'node:stream';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { DatasetArchiveManifest } from '@fastgpt/service/core/dataset/collection/archive/service';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

const preparationMocks = vi.hoisted(() => ({
  findArchiveCollectionsByIds: vi.fn(),
  findArchiveCollectionsByParentIds: vi.fn(),
  findArchiveCollectionPermissionItems: vi.fn(),
  getFileMetadata: vi.fn()
}));
const permissionMocks = vi.hoisted(() => ({
  canShortCircuitCollectionPermission: vi.fn(),
  getReadableCollectionIds: vi.fn(),
  getGroupsByTmbId: vi.fn(),
  getOrgIdSetWithParentByTmbId: vi.fn()
}));
vi.mock('@fastgpt/service/core/dataset/collection/archive/entity', () => preparationMocks);
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({ getFileMetadata: preparationMocks.getFileMetadata })
}));
vi.mock('@fastgpt/service/support/permission/collection/auth', () => ({
  canShortCircuitCollectionPermission: permissionMocks.canShortCircuitCollectionPermission,
  getReadableCollectionIds: permissionMocks.getReadableCollectionIds
}));
vi.mock('@fastgpt/service/support/permission/memberGroup/controllers', () => ({
  getGroupsByTmbId: permissionMocks.getGroupsByTmbId
}));
vi.mock('@fastgpt/service/support/permission/org/controllers', () => ({
  getOrgIdSetWithParentByTmbId: permissionMocks.getOrgIdSetWithParentByTmbId
}));
import {
  assertDatasetArchiveCollectionsReadable,
  createDatasetArchiveResourceRunner,
  prepareDatasetArchive,
  writeDatasetArchive
} from '@/service/core/dataset/collection/archive';

const createFakeLeaseCache = (unavailableKeys: string[] = []) => {
  const calls: string[] = [];
  const unavailable = new Set(unavailableKeys);
  const withLease = vi.fn(async ({ key, label, fn }: any) => {
    calls.push(key);
    if (unavailable.has(key)) throw new RedisLeaseUnavailableError({ key, label });

    const controller = new AbortController();
    return fn({ signal: controller.signal, assertValid: vi.fn() });
  });

  return { calls, withLease };
};

describe('createDatasetArchiveResourceRunner', () => {
  it('holds a member lease and the first available cluster slot around the task', async () => {
    const leaseCache = createFakeLeaseCache(['dataset-archive:slot:0']);
    const run = createDatasetArchiveResourceRunner({ leaseCache: leaseCache as any });
    const task = vi.fn(async ({ signals }: { signals: AbortSignal[] }) => {
      expect(signals).toHaveLength(2);
      return 'done';
    });

    await expect(run({ tmbId: 'member-1', concurrency: 2, fn: task })).resolves.toBe('done');
    expect(leaseCache.calls).toEqual([
      'dataset-archive:member:member-1',
      'dataset-archive:slot:0',
      'dataset-archive:slot:1'
    ]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('maps member contention and exhausted cluster slots to distinct errors', async () => {
    const memberLease = createFakeLeaseCache(['dataset-archive:member:member-1']);
    const runWithBusyMember = createDatasetArchiveResourceRunner({
      leaseCache: memberLease as any
    });
    await expect(
      runWithBusyMember({ tmbId: 'member-1', concurrency: 2, fn: vi.fn() })
    ).rejects.toBe(DatasetErrEnum.archiveMemberBusy);

    const slotLease = createFakeLeaseCache(['dataset-archive:slot:0', 'dataset-archive:slot:1']);
    const runWithoutSlot = createDatasetArchiveResourceRunner({ leaseCache: slotLease as any });
    await expect(runWithoutSlot({ tmbId: 'member-1', concurrency: 2, fn: vi.fn() })).rejects.toBe(
      DatasetErrEnum.archiveUnavailable
    );
  });
});

describe('prepareDatasetArchive', () => {
  const datasetId = '68ad85a7463006c963799b01';
  const file = {
    _id: '68ad85a7463006c963799a01',
    parentId: null,
    name: 'File',
    type: DatasetCollectionTypeEnum.file,
    fileId: `dataset/${datasetId}/file`
  };
  const options = { teamId: 'team', datasetId, datasetName: 'KB', collectionIds: [file._id] };
  beforeEach(() => {
    vi.clearAllMocks();
    preparationMocks.findArchiveCollectionsByParentIds.mockResolvedValue([]);
    preparationMocks.getFileMetadata.mockResolvedValue({ filename: 'file.txt', contentLength: 1 });
  });
  afterEach(() => vi.useRealTimers());

  it('releases preparation on lease cancellation before an outstanding Mongo read returns', async () => {
    let completeRead!: (value: unknown[]) => void;
    preparationMocks.findArchiveCollectionsByIds.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeRead = resolve;
        })
    );
    const controller = new AbortController();
    const error = new Error('lease lost during Mongo');
    const pending = prepareDatasetArchive({ ...options, signal: controller.signal }).catch(
      (failure) => failure
    );
    controller.abort(error);
    const outcome = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve('pending Mongo'), 100))
    ]);
    completeRead([file]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(outcome).toBe(error);
    expect(preparationMocks.getFileMetadata).not.toHaveBeenCalled();
  });

  it('rejects unreadable archive collections before reading S3 metadata', async () => {
    preparationMocks.findArchiveCollectionsByIds.mockResolvedValueOnce([file]);
    const assertCollectionsReadable = vi.fn(async () => {
      throw DatasetErrEnum.unAuthDatasetCollection;
    });

    await expect(
      prepareDatasetArchive({
        ...options,
        signal: new AbortController().signal,
        assertCollectionsReadable
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
    expect(assertCollectionsReadable).toHaveBeenCalledWith([file._id]);
    expect(preparationMocks.getFileMetadata).not.toHaveBeenCalled();
  });

  it('checks only downloadable collections and not ancestors used solely for ZIP paths', async () => {
    const parent = {
      _id: '68ad85a7463006c963799a02',
      parentId: null,
      name: 'Parent',
      type: DatasetCollectionTypeEnum.folder
    };
    const child = { ...file, parentId: parent._id };
    preparationMocks.findArchiveCollectionsByIds.mockImplementation(
      async ({ collectionIds }: { collectionIds: string[] }) =>
        [parent, child].filter((item) => collectionIds.includes(item._id))
    );
    const assertCollectionsReadable = vi.fn();

    await prepareDatasetArchive({
      ...options,
      collectionIds: [child._id],
      signal: new AbortController().signal,
      assertCollectionsReadable
    });

    expect(assertCollectionsReadable).toHaveBeenCalledWith([child._id]);
  });

  it('enforces the entire 300-second preparation deadline while the first Mongo read is pending', async () => {
    vi.useFakeTimers();
    let completeRead!: (value: unknown[]) => void;
    preparationMocks.findArchiveCollectionsByIds.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeRead = resolve;
        })
    );
    let outcome: unknown = 'pending';
    const pending = prepareDatasetArchive({
      ...options,
      signal: new AbortController().signal
    }).then(
      (value) => {
        outcome = value;
      },
      (error) => {
        outcome = error;
      }
    );
    await vi.advanceTimersByTimeAsync(300_000);
    const deadlineOutcome = outcome;
    completeRead([file]);
    await pending;
    expect(deadlineOutcome).toBe(DatasetErrEnum.archiveUnavailable);
    expect(preparationMocks.getFileMetadata).not.toHaveBeenCalled();
  });

  it('consumes a late Mongo rejection after preparation has been cancelled', async () => {
    let rejectRead!: (error: Error) => void;
    preparationMocks.findArchiveCollectionsByIds.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectRead = reject;
        })
    );
    const controller = new AbortController();
    const error = new Error('client cancelled');
    const pending = prepareDatasetArchive({ ...options, signal: controller.signal });
    const rejected = expect(pending).rejects.toBe(error);
    controller.abort(error);
    await rejected;
    rejectRead(new Error('late Mongo failure'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(preparationMocks.getFileMetadata).not.toHaveBeenCalled();
  });

  it('uses the remaining preparation deadline for metadata after a slow collection query', async () => {
    vi.useFakeTimers();
    let completeRead!: (value: unknown[]) => void;
    preparationMocks.findArchiveCollectionsByIds.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeRead = resolve;
        })
    );
    preparationMocks.getFileMetadata.mockImplementationOnce(() => new Promise(() => {}));
    const pending = prepareDatasetArchive({
      ...options,
      signal: new AbortController().signal
    }).catch((failure) => failure);
    await vi.advanceTimersByTimeAsync(299_000);
    completeRead([file]);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBe(DatasetErrEnum.archiveUnavailable);
  });

  it('exits metadata preparation immediately on abort and never schedules a ninth request', async () => {
    const files = Array.from({ length: 16 }, (_, i) => ({ ...file, _id: String(i) }));
    preparationMocks.findArchiveCollectionsByIds.mockResolvedValueOnce(files);
    const completeReads: Array<() => void> = [];
    preparationMocks.getFileMetadata.mockImplementation(
      () =>
        new Promise((resolve) => {
          completeReads.push(() => resolve({ filename: 'file', contentLength: 1 }));
        })
    );
    const controller = new AbortController();
    const error = new Error('client cancelled metadata');
    const pending = prepareDatasetArchive({
      ...options,
      collectionIds: files.map((item) => item._id),
      signal: controller.signal
    }).catch((failure) => failure);
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(error);
    const outcome = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve('pending metadata'), 100))
    ]);
    completeReads.slice().forEach((resolve) => resolve());
    await new Promise((resolve) => setImmediate(resolve));
    const scheduled = completeReads.length;
    completeReads.slice(8).forEach((resolve) => resolve());
    await pending;
    expect(outcome).toBe(error);
    expect(scheduled).toBe(8);
  });
});

describe('assertDatasetArchiveCollectionsReadable', () => {
  it('rejects a manifest containing a collection the member cannot read', async () => {
    const permissionCollections = [
      {
        _id: 'folder-1',
        datasetId: 'dataset-1',
        tmbId: 'owner-1',
        parentId: null,
        inheritPermission: true,
        type: DatasetCollectionTypeEnum.folder
      },
      {
        _id: 'private-file-1',
        datasetId: 'dataset-1',
        tmbId: 'owner-1',
        parentId: 'folder-1',
        inheritPermission: true,
        type: DatasetCollectionTypeEnum.file
      }
    ];
    permissionMocks.canShortCircuitCollectionPermission.mockResolvedValue(false);
    permissionMocks.getGroupsByTmbId.mockResolvedValue([]);
    permissionMocks.getOrgIdSetWithParentByTmbId.mockResolvedValue(new Set());
    permissionMocks.getReadableCollectionIds.mockResolvedValue(['folder-1']);
    preparationMocks.findArchiveCollectionPermissionItems.mockResolvedValue(permissionCollections);

    await expect(
      assertDatasetArchiveCollectionsReadable({
        teamId: 'team-1',
        datasetId: 'dataset-1',
        tmbId: 'member-1',
        isRoot: false,
        collectionIds: ['folder-1', 'private-file-1']
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
    expect(preparationMocks.findArchiveCollectionPermissionItems).toHaveBeenCalledWith({
      teamId: 'team-1',
      datasetId: 'dataset-1',
      collectionIds: ['folder-1', 'private-file-1']
    });
    expect(permissionMocks.getReadableCollectionIds).toHaveBeenCalledWith(
      expect.objectContaining({
        collections: permissionCollections,
        teamId: 'team-1',
        tmbId: 'member-1'
      })
    );
  });

  it('always evaluates collection ACLs after the fresh permission check requires them', async () => {
    const permissionCollection = {
      _id: 'private-file-1',
      datasetId: 'dataset-1',
      tmbId: 'owner-1',
      parentId: null,
      inheritPermission: false,
      type: DatasetCollectionTypeEnum.file
    };
    permissionMocks.canShortCircuitCollectionPermission.mockResolvedValue(false);
    permissionMocks.getGroupsByTmbId.mockResolvedValue([]);
    permissionMocks.getOrgIdSetWithParentByTmbId.mockResolvedValue(new Set());
    permissionMocks.getReadableCollectionIds.mockImplementation(
      async ({ collectionPermissionEnabled }: { collectionPermissionEnabled?: boolean }) =>
        collectionPermissionEnabled ? [] : [permissionCollection._id]
    );
    preparationMocks.findArchiveCollectionPermissionItems.mockResolvedValue([
      permissionCollection
    ]);

    await expect(
      assertDatasetArchiveCollectionsReadable({
        teamId: 'team-1',
        datasetId: 'dataset-1',
        tmbId: 'member-1',
        isRoot: false,
        collectionIds: [permissionCollection._id]
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
    expect(permissionMocks.getReadableCollectionIds).toHaveBeenCalledWith(
      expect.objectContaining({ collectionPermissionEnabled: true })
    );
  });
});

describe('writeDatasetArchive', () => {
  const manifest: DatasetArchiveManifest = {
    directories: ['Knowledge Base/Empty'],
    files: [
      { key: 'dataset/id/a', path: 'Knowledge Base/a.txt' },
      { key: 'dataset/id/b', path: 'Knowledge Base/b.txt' }
    ]
  };

  it('destroys the active source synchronously when cancellation is signalled', async () => {
    const destination = new PassThrough();
    destination.resume();
    const source = new PassThrough();
    const controller = new AbortController();
    const error = new Error('lease lost while reading');
    const pending = writeDatasetArchive({
      destination,
      manifest,
      signal: controller.signal,
      getFileStream: async () => source
    }).catch((failure) => failure);
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(error);
    const destroyedAtAbort = source.destroyed;
    await expect(pending).resolves.toBe(error);
    destination.destroy();
    expect(destroyedAtAbort).toBe(true);
  });

  it('handles destination failure immediately while the current source is stalled', async () => {
    const destination = new PassThrough();
    destination.resume();
    const source = new PassThrough();
    const error = new Error('destination failed');
    const getFileStream = vi.fn(async () => source);
    const result = writeDatasetArchive({
      destination,
      manifest,
      signal: new AbortController().signal,
      getFileStream
    }).catch((failure) => failure);
    await new Promise((resolve) => setImmediate(resolve));
    destination.destroy(error);
    const outcome = await Promise.race([
      result,
      new Promise((resolve) => setTimeout(() => resolve('still writing'), 100))
    ]);
    source.destroy();
    expect(outcome).toBe(error);
    expect(source.destroyed).toBe(true);
    expect(getFileStream).toHaveBeenCalledTimes(1);
  });

  it('aborts empty-directory finalization while the destination applies backpressure', async () => {
    const destination = new Writable({ highWaterMark: 1, write() {} });
    const controller = new AbortController();
    const error = new Error('lease lost during finalize');
    const result = writeDatasetArchive({
      destination,
      manifest: {
        directories: Array.from({ length: 2000 }, (_, i) => `Knowledge Base/${i}`),
        files: []
      },
      signal: controller.signal,
      getFileStream: async () => undefined
    }).catch((failure) => failure);
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(error);
    const outcome = await Promise.race([
      result,
      new Promise((resolve) => setTimeout(() => resolve('still finalizing'), 100))
    ]);
    destination.destroy();
    expect(outcome).toBe(error);
  });

  it('aborts while waiting for the final destination flush', async () => {
    const controller = new AbortController();
    const error = new Error('lease lost during flush');
    const destination = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
      final() {
        controller.abort(error);
      }
    });
    const result = writeDatasetArchive({
      destination,
      manifest: { directories: ['Empty'], files: [] },
      signal: controller.signal,
      getFileStream: async () => undefined
    }).catch((failure) => failure);
    const outcome = await Promise.race([
      result,
      new Promise((resolve) => setTimeout(() => resolve('still flushing'), 100))
    ]);
    destination.destroy();
    expect(outcome).toBe(error);
  });

  it('exits a pending S3 open on abort and destroys any stream returned later', async () => {
    const destination = new PassThrough();
    destination.resume();
    const controller = new AbortController();
    const error = new Error('lease lost opening S3');
    let resolveStream!: (stream: Readable) => void;
    const source = new PassThrough();
    const result = writeDatasetArchive({
      destination,
      manifest,
      signal: controller.signal,
      getFileStream: () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        })
    }).catch((failure) => failure);
    controller.abort(error);
    const outcome = await Promise.race([
      result,
      new Promise((resolve) => setTimeout(() => resolve('still opening'), 100))
    ]);
    resolveStream(source);
    await new Promise((resolve) => setImmediate(resolve));
    destination.destroy();
    expect(outcome).toBe(error);
    expect(source.destroyed).toBe(true);
  });

  it('consumes a late S3 open rejection after cancellation', async () => {
    const destination = new PassThrough();
    destination.resume();
    const controller = new AbortController();
    const error = new Error('client cancelled');
    let rejectStream!: (error: Error) => void;
    const pending = writeDatasetArchive({
      destination,
      manifest,
      signal: controller.signal,
      getFileStream: () =>
        new Promise((_, reject) => {
          rejectStream = reject;
        })
    });
    const rejected = expect(pending).rejects.toBe(error);
    controller.abort(error);
    await rejected;
    rejectStream(new Error('late S3 failure'));
    destination.destroy();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('destroys an opened source when cancellation races with its await continuation', async () => {
    const destination = new PassThrough();
    destination.resume();
    const source = new PassThrough();
    const controller = new AbortController();
    const error = new Error('client cancelled after S3 opened');
    const pending = writeDatasetArchive({
      destination,
      manifest,
      signal: controller.signal,
      getFileStream: () => {
        const opened = Promise.resolve(source);
        void opened.then(() => queueMicrotask(() => controller.abort(error)));
        return opened;
      }
    });
    await expect(pending).rejects.toBe(error);
    const destroyedAfterCancellation = source.destroyed;
    destination.destroy();
    source.destroy();
    expect(destroyedAfterCancellation).toBe(true);
  });

  it('writes a STORE ZIP64 archive and opens S3 streams sequentially', async () => {
    const destination = new PassThrough();
    const chunks: Buffer[] = [];
    destination.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    let activeStreams = 0;
    let maxActiveStreams = 0;
    const openedKeys: string[] = [];

    await writeDatasetArchive({
      destination,
      manifest,
      signal: new AbortController().signal,
      getFileStream: async (key) => {
        openedKeys.push(key);
        activeStreams += 1;
        maxActiveStreams = Math.max(maxActiveStreams, activeStreams);
        return Readable.from(
          (async function* () {
            try {
              await new Promise((resolve) => setTimeout(resolve, 1));
              yield key.endsWith('/a') ? 'A' : 'B';
            } finally {
              activeStreams -= 1;
            }
          })()
        );
      }
    });

    const buffer = Buffer.concat(chunks);
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining([
        'Knowledge Base/Empty/',
        'Knowledge Base/a.txt',
        'Knowledge Base/b.txt'
      ])
    );
    await expect(zip.file('Knowledge Base/a.txt')?.async('string')).resolves.toBe('A');
    await expect(zip.file('Knowledge Base/b.txt')?.async('string')).resolves.toBe('B');
    expect(openedKeys).toEqual(['dataset/id/a', 'dataset/id/b']);
    expect(maxActiveStreams).toBe(1);
    expect(buffer.readUInt16LE(8)).toBe(0);
    expect(buffer.indexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]))).toBeGreaterThanOrEqual(0);
  });

  it('destroys the current stream and rejects when an S3 stream fails', async () => {
    const destination = new PassThrough();
    destination.resume();
    const streamError = new Error('S3 stream failed');
    const stream = Readable.from(
      (async function* () {
        yield 'partial';
        throw streamError;
      })()
    );

    await expect(
      writeDatasetArchive({
        destination,
        manifest: { ...manifest, files: manifest.files.slice(0, 1) },
        signal: new AbortController().signal,
        getFileStream: async () => stream
      })
    ).rejects.toThrow('S3 stream failed');
    expect(stream.destroyed).toBe(true);
  });
});
