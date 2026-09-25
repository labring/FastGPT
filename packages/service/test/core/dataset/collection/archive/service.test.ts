import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

const mocks = vi.hoisted(() => ({
  findArchiveCollectionsByIds: vi.fn(),
  iterateArchiveCollectionsByParentIds: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/collection/archive/entity', () => mocks);

import {
  buildDatasetArchivePlan,
  prepareDatasetArchiveManifest
} from '@fastgpt/service/core/dataset/collection/archive/service';

const ids = {
  parent: '68ad85a7463006c963799a01',
  folder: '68ad85a7463006c963799a02',
  childFolder: '68ad85a7463006c963799a03',
  childFile: '68ad85a7463006c963799a04',
  deepFile: '68ad85a7463006c963799a05',
  standaloneFile: '68ad85a7463006c963799a06',
  image: '68ad85a7463006c963799a07',
  link: '68ad85a7463006c963799a08',
  emptyFolder: '68ad85a7463006c963799a09'
} as const;

const datasetId = '68ad85a7463006c963799b01';
const teamId = '68ad85a7463006c963799c01';
const collection = ({
  _id,
  parentId,
  name,
  type,
  fileId
}: {
  _id: string;
  parentId: string | null;
  name: string;
  type: DatasetCollectionTypeEnum;
  fileId?: string;
}) => ({ _id, parentId, name, type, fileId, teamId, datasetId });

const collections = [
  collection({
    _id: ids.parent,
    parentId: null,
    name: 'Parent',
    type: DatasetCollectionTypeEnum.folder
  }),
  collection({
    _id: ids.folder,
    parentId: ids.parent,
    name: 'Folder',
    type: DatasetCollectionTypeEnum.folder
  }),
  collection({
    _id: ids.childFolder,
    parentId: ids.folder,
    name: 'Child',
    type: DatasetCollectionTypeEnum.folder
  }),
  collection({
    _id: ids.childFile,
    parentId: ids.folder,
    name: 'Collection child file',
    type: DatasetCollectionTypeEnum.file,
    fileId: `dataset/${datasetId}/child-file`
  }),
  collection({
    _id: ids.deepFile,
    parentId: ids.childFolder,
    name: 'Collection deep file',
    type: DatasetCollectionTypeEnum.file,
    fileId: `dataset/${datasetId}/deep-file`
  }),
  collection({
    _id: ids.standaloneFile,
    parentId: ids.parent,
    name: 'Standalone',
    type: DatasetCollectionTypeEnum.file,
    fileId: `dataset/${datasetId}/standalone-file`
  }),
  collection({
    _id: ids.image,
    parentId: ids.folder,
    name: 'Image',
    type: DatasetCollectionTypeEnum.images
  }),
  collection({
    _id: ids.link,
    parentId: null,
    name: 'Link',
    type: DatasetCollectionTypeEnum.link
  }),
  collection({
    _id: ids.emptyFolder,
    parentId: ids.parent,
    name: 'Empty',
    type: DatasetCollectionTypeEnum.folder
  })
];

const iterateCollections = <T>(items: T[], onClose?: () => void) =>
  (async function* () {
    try {
      yield* items;
    } finally {
      onClose?.();
    }
  })();

describe('buildDatasetArchivePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findArchiveCollectionsByIds.mockImplementation(
      async ({ collectionIds }: { collectionIds: string[] }) =>
        collections.filter((item) => collectionIds.includes(item._id))
    );
    mocks.iterateArchiveCollectionsByParentIds.mockImplementation(
      ({ parentIds }: { parentIds: string[] }) =>
        iterateCollections(
          collections.filter((item) => item.parentId && parentIds.includes(item.parentId))
        )
    );
  });

  it('deduplicates selected descendants and recursively includes files with their ancestors', async () => {
    const plan = await buildDatasetArchivePlan({
      teamId,
      datasetId,
      datasetName: 'Knowledge Base',
      collectionIds: [ids.folder, ids.childFile, ids.standaloneFile]
    });

    expect(plan.directories.map((item) => item.collectionId)).toEqual([
      ids.parent,
      ids.folder,
      ids.childFolder
    ]);
    expect(plan.files.map((item) => item.collectionId)).toEqual([
      ids.childFile,
      ids.deepFile,
      ids.standaloneFile
    ]);
    expect(plan.files.map((item) => item.collectionId)).not.toContain(ids.image);
  });

  it('keeps an explicitly selected empty folder', async () => {
    const plan = await buildDatasetArchivePlan({
      teamId,
      datasetId,
      datasetName: 'Knowledge Base',
      collectionIds: [ids.emptyFolder]
    });

    expect(plan.directories.map((item) => item.collectionId)).toEqual([
      ids.parent,
      ids.emptyFolder
    ]);
    expect(plan.files).toEqual([]);
  });

  it('reads every file from a wide folder through the bounded cursor', async () => {
    const wideFolder = collection({
      _id: ids.folder,
      parentId: null,
      name: 'Wide folder',
      type: DatasetCollectionTypeEnum.folder
    });
    const children = Array.from({ length: 501 }, (_, index) =>
      collection({
        _id: (index + 1).toString(16).padStart(24, '0'),
        parentId: wideFolder._id,
        name: `File ${index + 1}`,
        type: DatasetCollectionTypeEnum.file,
        fileId: `dataset/${datasetId}/file-${index + 1}`
      })
    );
    mocks.findArchiveCollectionsByIds.mockResolvedValueOnce([wideFolder]);
    mocks.iterateArchiveCollectionsByParentIds.mockReturnValue(iterateCollections(children));

    const plan = await buildDatasetArchivePlan({
      teamId,
      datasetId,
      datasetName: 'Knowledge Base',
      collectionIds: [wideFolder._id],
      maxFiles: 1000
    });

    expect(plan.files).toHaveLength(501);
    expect(mocks.iterateArchiveCollectionsByParentIds).toHaveBeenCalledOnce();
  });

  it('stops and closes the cursor as soon as the file limit is exceeded', async () => {
    const wideFolder = collection({
      _id: ids.folder,
      parentId: null,
      name: 'Wide folder',
      type: DatasetCollectionTypeEnum.folder
    });
    const children = Array.from({ length: 500 }, (_, index) =>
      collection({
        _id: (index + 1).toString(16).padStart(24, '0'),
        parentId: wideFolder._id,
        name: `File ${index + 1}`,
        type: DatasetCollectionTypeEnum.file,
        fileId: `dataset/${datasetId}/file-${index + 1}`
      })
    );
    let yieldedCount = 0;
    let iteratorClosed = false;
    mocks.findArchiveCollectionsByIds.mockResolvedValueOnce([wideFolder]);
    mocks.iterateArchiveCollectionsByParentIds.mockReturnValue(
      (async function* () {
        try {
          for (const child of children) {
            yieldedCount += 1;
            yield child;
          }
        } finally {
          iteratorClosed = true;
        }
      })()
    );

    await expect(
      buildDatasetArchivePlan({
        teamId,
        datasetId,
        datasetName: 'Knowledge Base',
        collectionIds: [wideFolder._id],
        maxFiles: 200
      })
    ).rejects.toBe(DatasetErrEnum.archiveLimitExceeded);

    expect(yieldedCount).toBe(201);
    expect(iteratorClosed).toBe(true);
  });

  it('excludes path-only ancestors from collection permission checks', async () => {
    const plan = await buildDatasetArchivePlan({
      teamId,
      datasetId,
      datasetName: 'Knowledge Base',
      collectionIds: [ids.childFile]
    });

    expect(plan.directories.map((item) => item.collectionId)).toEqual([ids.parent, ids.folder]);
    expect(plan.permissionCollectionIds).toEqual([ids.childFile]);
  });

  it.each(['ancestors', 'descendants'])('stops scheduling %s after cancellation', async (phase) => {
    const error = new Error('preparation cancelled');
    let cancelled = false;
    if (phase === 'ancestors') {
      mocks.findArchiveCollectionsByIds.mockImplementationOnce(async () => {
        cancelled = true;
        return collections.filter((item) => item._id === ids.folder);
      });
    } else {
      mocks.iterateArchiveCollectionsByParentIds.mockImplementationOnce(() =>
        (async function* () {
          cancelled = true;
          yield* collections.filter((item) => item.parentId === ids.folder);
        })()
      );
    }
    await expect(
      buildDatasetArchivePlan({
        teamId,
        datasetId,
        datasetName: 'KB',
        collectionIds: [ids.folder],
        assertActive: () => {
          if (cancelled) throw error;
        }
      })
    ).rejects.toBe(error);
    expect(mocks.findArchiveCollectionsByIds).toHaveBeenCalledTimes(phase === 'ancestors' ? 1 : 2);
    expect(mocks.iterateArchiveCollectionsByParentIds).toHaveBeenCalledTimes(
      phase === 'ancestors' ? 0 : 1
    );
  });

  it('rejects an unsupported-only selection and missing explicit collections', async () => {
    await expect(
      buildDatasetArchivePlan({
        teamId,
        datasetId,
        datasetName: 'Knowledge Base',
        collectionIds: [ids.link]
      })
    ).rejects.toBe(DatasetErrEnum.archiveNoDownloadableFile);

    await expect(
      buildDatasetArchivePlan({
        teamId,
        datasetId,
        datasetName: 'Knowledge Base',
        collectionIds: ['68ad85a7463006c963799aff']
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
  });

  it('terminates corrupted folder cycles without duplicating entries', async () => {
    const cycleA = collection({
      _id: ids.folder,
      parentId: ids.childFolder,
      name: 'A',
      type: DatasetCollectionTypeEnum.folder
    });
    const cycleB = collection({
      _id: ids.childFolder,
      parentId: ids.folder,
      name: 'B',
      type: DatasetCollectionTypeEnum.folder
    });
    const cycleCollections = [cycleA, cycleB];
    mocks.findArchiveCollectionsByIds.mockImplementation(
      async ({ collectionIds }: { collectionIds: string[] }) =>
        cycleCollections.filter((item) => collectionIds.includes(item._id))
    );
    mocks.iterateArchiveCollectionsByParentIds.mockImplementation(
      ({ parentIds }: { parentIds: string[] }) =>
        iterateCollections(
          cycleCollections.filter((item) => item.parentId && parentIds.includes(item.parentId))
        )
    );

    const plan = await buildDatasetArchivePlan({
      teamId,
      datasetId,
      datasetName: 'Knowledge Base',
      collectionIds: [ids.folder]
    });

    expect(new Set(plan.directories.map((item) => item.collectionId))).toEqual(
      new Set([ids.folder, ids.childFolder])
    );
    expect(mocks.iterateArchiveCollectionsByParentIds).toHaveBeenCalledTimes(2);
  });
});

describe('prepareDatasetArchiveManifest', () => {
  const basePlan = {
    datasetId,
    datasetName: 'Knowledge Base',
    permissionCollectionIds: [ids.folder, ids.childFile, ids.deepFile],
    directories: [
      { collectionId: ids.parent, parentId: null, name: 'Docs' },
      { collectionId: ids.folder, parentId: ids.parent, name: 'Reports' }
    ],
    files: [
      {
        collectionId: ids.childFile,
        parentId: ids.folder,
        fileId: `dataset/${datasetId}/child-file`
      },
      {
        collectionId: ids.deepFile,
        parentId: ids.folder,
        fileId: `dataset/${datasetId}/deep-file`
      }
    ]
  };

  it('uses S3 original filenames, resolves collisions and preserves directories', async () => {
    const manifest = await prepareDatasetArchiveManifest({
      plan: basePlan,
      getFileMetadata: vi.fn(async () => ({ filename: 'Report.pdf', contentLength: 10 })),
      limits: {
        maxFiles: 10,
        maxSourceSizeBytes: 100,
        prepareDeadlineAt: Date.now() + 10_000
      }
    });

    expect(manifest.directories).toEqual(['Knowledge Base/Docs', 'Knowledge Base/Docs/Reports']);
    expect(manifest.files).toEqual([
      {
        key: `dataset/${datasetId}/child-file`,
        path: 'Knowledge Base/Docs/Reports/Report.pdf'
      },
      {
        key: `dataset/${datasetId}/deep-file`,
        path: 'Knowledge Base/Docs/Reports/Report (2).pdf'
      }
    ]);
  });

  it('limits metadata reads to eight concurrent operations', async () => {
    let active = 0;
    let maxActive = 0;
    const plan = {
      ...basePlan,
      files: Array.from({ length: 16 }, (_, index) => ({
        collectionId: `${index}`.padStart(24, '0'),
        parentId: ids.folder,
        fileId: `dataset/${datasetId}/file-${index}`
      }))
    };

    await prepareDatasetArchiveManifest({
      plan,
      getFileMetadata: vi.fn(async (key: string) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return { filename: key.split('/').at(-1) ?? 'file', contentLength: 1 };
      }),
      limits: {
        maxFiles: 20,
        maxSourceSizeBytes: 100,
        prepareDeadlineAt: Date.now() + 10_000
      }
    });

    expect(maxActive).toBe(8);
  });

  it('does not schedule another metadata request after cancellation of the initial eight', async () => {
    const controller = new AbortController();
    const error = new Error('lease lost');
    const resolvers: Array<() => void> = [];
    const getFileMetadata = vi.fn(
      () =>
        new Promise<{ filename: string; contentLength: number }>((resolve) => {
          resolvers.push(() => resolve({ filename: 'file', contentLength: 1 }));
        })
    );
    const pending = prepareDatasetArchiveManifest({
      plan: {
        ...basePlan,
        files: Array.from({ length: 16 }, (_, i) => ({
          ...basePlan.files[0],
          collectionId: String(i)
        }))
      },
      getFileMetadata,
      assertActive: () => controller.signal.throwIfAborted(),
      limits: { maxFiles: 20, maxSourceSizeBytes: 100, prepareDeadlineAt: Date.now() + 10_000 }
    }).catch((failure) => failure);
    expect(resolvers).toHaveLength(8);
    controller.abort(error);
    resolvers.slice().forEach((resolve) => resolve());
    await new Promise((resolve) => setImmediate(resolve));
    const scheduled = getFileMetadata.mock.calls.length;
    resolvers.slice(8).forEach((resolve) => resolve());
    const result = await pending;
    expect(scheduled).toBe(8);
    expect(result).toBe(error);
  });

  it('rejects invalid keys, missing metadata, count, size and preparation timeout', async () => {
    const getFileMetadata = vi.fn(async () => ({ filename: 'file.txt', contentLength: 60 }));

    await expect(
      prepareDatasetArchiveManifest({
        plan: {
          ...basePlan,
          files: basePlan.files
            .slice(0, 1)
            .map((file) => ({ ...file, fileId: 'dataset/other/file' }))
        },
        getFileMetadata,
        limits: { maxFiles: 10, maxSourceSizeBytes: 100, prepareDeadlineAt: Date.now() + 10_000 }
      })
    ).rejects.toBe(DatasetErrEnum.archiveInvalidFile);

    await expect(
      prepareDatasetArchiveManifest({
        plan: basePlan,
        getFileMetadata: vi.fn(async () => undefined),
        limits: { maxFiles: 10, maxSourceSizeBytes: 100, prepareDeadlineAt: Date.now() + 10_000 }
      })
    ).rejects.toBe(DatasetErrEnum.archiveInvalidFile);

    await expect(
      prepareDatasetArchiveManifest({
        plan: basePlan,
        getFileMetadata,
        limits: { maxFiles: 1, maxSourceSizeBytes: 100, prepareDeadlineAt: Date.now() + 10_000 }
      })
    ).rejects.toBe(DatasetErrEnum.archiveLimitExceeded);

    await expect(
      prepareDatasetArchiveManifest({
        plan: basePlan,
        getFileMetadata,
        limits: { maxFiles: 10, maxSourceSizeBytes: 100, prepareDeadlineAt: Date.now() + 10_000 }
      })
    ).rejects.toBe(DatasetErrEnum.archiveLimitExceeded);

    await expect(
      prepareDatasetArchiveManifest({
        plan: basePlan,
        getFileMetadata,
        limits: { maxFiles: 10, maxSourceSizeBytes: 1000, prepareDeadlineAt: Date.now() - 1 }
      })
    ).rejects.toBe(DatasetErrEnum.archiveUnavailable);
  });
});
