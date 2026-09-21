import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { isAuthorizedDatasetFileS3Key } from '../../../../common/s3/sources/dataset/key';
import {
  findArchiveCollectionsByIds,
  findArchiveCollectionsByParentIds,
  type DatasetArchiveCollection
} from './entity';
import { reserveUniqueArchiveName, sanitizeArchivePathSegment } from './utils';

export type DatasetArchivePlan = {
  datasetId: string;
  datasetName: string;
  permissionCollectionIds: string[];
  directories: Array<{ collectionId: string; parentId: string | null; name: string }>;
  files: Array<{ collectionId: string; parentId: string | null; fileId: string }>;
};

export type DatasetArchiveManifest = {
  directories: string[];
  files: Array<{ key: string; path: string }>;
};

type NormalizedCollection = ReturnType<typeof normalizeCollection>;

const sortByCollectionId = <T extends { collectionId: string }>(items: T[]) =>
  [...items].sort((left, right) => left.collectionId.localeCompare(right.collectionId));

function normalizeCollection(collection: DatasetArchiveCollection | Record<string, unknown>) {
  return {
    collectionId: String('collectionId' in collection ? collection.collectionId : collection._id),
    parentId: collection.parentId ? String(collection.parentId) : null,
    name: String(collection.name),
    type: String(collection.type),
    fileId: typeof collection.fileId === 'string' ? collection.fileId : undefined
  };
}

/**
 * 构建选中 Collection 对应的逻辑目录和文件计划。查询按层批量执行，祖先只用于恢复完整路径，
 * 只有显式选择的文件夹及其后代会向下展开并进入权限校验范围。
 */
export const buildDatasetArchivePlan = async ({
  teamId,
  datasetId,
  datasetName,
  collectionIds,
  assertActive
}: {
  teamId: string;
  datasetId: string;
  datasetName: string;
  collectionIds: string[];
  assertActive?: () => void;
}): Promise<DatasetArchivePlan> => {
  assertActive?.();
  const selectedIds = [...new Set(collectionIds.map(String))];
  const selectedCollections = (
    await findArchiveCollectionsByIds({ teamId, datasetId, collectionIds: selectedIds })
  ).map(normalizeCollection);
  assertActive?.();

  if (selectedCollections.length !== selectedIds.length) {
    throw DatasetErrEnum.unAuthDatasetCollection;
  }

  const knownCollections = new Map(
    selectedCollections.map((collection) => [collection.collectionId, collection])
  );
  let ancestorIds = getParentIds(selectedCollections);

  while (ancestorIds.length > 0) {
    assertActive?.();
    const unresolvedIds = ancestorIds.filter((id) => !knownCollections.has(id));
    if (unresolvedIds.length === 0) break;

    const ancestors = (
      await findArchiveCollectionsByIds({ teamId, datasetId, collectionIds: unresolvedIds })
    ).map(normalizeCollection);
    assertActive?.();
    if (ancestors.length !== unresolvedIds.length) {
      throw DatasetErrEnum.archiveInvalidFile;
    }

    ancestors.forEach((collection) => knownCollections.set(collection.collectionId, collection));
    ancestorIds = getParentIds(ancestors);
  }

  const selectedFolderIds = new Set(
    selectedCollections
      .filter((collection) => collection.type === DatasetCollectionTypeEnum.folder)
      .map((collection) => collection.collectionId)
  );
  const selectedRoots = selectedCollections
    .filter(
      (collection) =>
        collection.type === DatasetCollectionTypeEnum.folder ||
        collection.type === DatasetCollectionTypeEnum.file
    )
    .filter((collection) => {
      const visited = new Set<string>([collection.collectionId]);
      let parentId = collection.parentId;

      while (parentId && !visited.has(parentId)) {
        if (selectedFolderIds.has(parentId)) return false;
        visited.add(parentId);
        parentId = knownCollections.get(parentId)?.parentId ?? null;
      }
      return true;
    });

  if (selectedRoots.length === 0) {
    throw DatasetErrEnum.archiveNoDownloadableFile;
  }

  const includedDirectories = new Map<string, NormalizedCollection>();
  const includedFiles = new Map<string, NormalizedCollection>();
  const permissionCollectionIds = new Set<string>();
  const addAncestors = (collection: NormalizedCollection) => {
    const visited = new Set<string>([collection.collectionId]);
    let parentId = collection.parentId;

    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = knownCollections.get(parentId);
      if (!parent || parent.type !== DatasetCollectionTypeEnum.folder) {
        throw DatasetErrEnum.archiveInvalidFile;
      }
      includedDirectories.set(parent.collectionId, parent);
      parentId = parent.parentId;
    }
  };

  let folderFrontier: string[] = [];
  for (const root of selectedRoots) {
    addAncestors(root);
    permissionCollectionIds.add(root.collectionId);
    if (root.type === DatasetCollectionTypeEnum.folder) {
      includedDirectories.set(root.collectionId, root);
      folderFrontier.push(root.collectionId);
    } else {
      includedFiles.set(root.collectionId, root);
    }
  }

  const expandedFolders = new Set<string>();
  while (folderFrontier.length > 0) {
    assertActive?.();
    const currentFolderIds = [...new Set(folderFrontier)].filter(
      (folderId) => !expandedFolders.has(folderId)
    );
    if (currentFolderIds.length === 0) break;
    currentFolderIds.forEach((folderId) => expandedFolders.add(folderId));

    const children = (
      await findArchiveCollectionsByParentIds({ teamId, datasetId, parentIds: currentFolderIds })
    ).map(normalizeCollection);
    assertActive?.();
    folderFrontier = [];

    for (const child of children) {
      knownCollections.set(child.collectionId, child);
      if (child.type === DatasetCollectionTypeEnum.folder) {
        permissionCollectionIds.add(child.collectionId);
        includedDirectories.set(child.collectionId, child);
        if (!expandedFolders.has(child.collectionId)) folderFrontier.push(child.collectionId);
      } else if (child.type === DatasetCollectionTypeEnum.file) {
        permissionCollectionIds.add(child.collectionId);
        includedFiles.set(child.collectionId, child);
      }
    }
  }

  for (const collection of [...includedDirectories.values(), ...includedFiles.values()]) {
    addAncestors(collection);
  }

  const parentByDirectoryId = new Map(
    [...includedDirectories.values()].map((directory) => [
      directory.collectionId,
      directory.parentId && includedDirectories.has(directory.parentId) ? directory.parentId : null
    ])
  );

  // 损坏数据可能形成父子循环；稳定断开每个循环中 ID 最小的节点，避免路径计算死循环。
  for (const directoryId of parentByDirectoryId.keys()) {
    assertActive?.();
    const path: string[] = [];
    const pathIndexes = new Map<string, number>();
    let currentId: string | null = directoryId;

    while (currentId) {
      const cycleStart = pathIndexes.get(currentId);
      if (cycleStart !== undefined) {
        const cycleRoot = [...path.slice(cycleStart)].sort()[0];
        parentByDirectoryId.set(cycleRoot, null);
        break;
      }
      pathIndexes.set(currentId, path.length);
      path.push(currentId);
      currentId = parentByDirectoryId.get(currentId) ?? null;
    }
  }

  const pendingDirectories = new Map(includedDirectories);
  const sortedDirectories: NormalizedCollection[] = [];
  const emittedIds = new Set<string>();
  while (pendingDirectories.size > 0) {
    assertActive?.();
    const ready = sortByCollectionId(
      [...pendingDirectories.values()].filter((directory) => {
        const parentId = parentByDirectoryId.get(directory.collectionId);
        return !parentId || emittedIds.has(parentId);
      })
    );
    if (ready.length === 0) throw DatasetErrEnum.archiveInvalidFile;

    ready.forEach((directory) => {
      pendingDirectories.delete(directory.collectionId);
      emittedIds.add(directory.collectionId);
      sortedDirectories.push(directory);
    });
  }

  return {
    datasetId,
    datasetName,
    permissionCollectionIds: [...permissionCollectionIds].sort(),
    directories: sortedDirectories.map((directory) => ({
      collectionId: directory.collectionId,
      parentId: parentByDirectoryId.get(directory.collectionId) ?? null,
      name: directory.name
    })),
    files: sortByCollectionId([...includedFiles.values()]).map((file) => ({
      collectionId: file.collectionId,
      parentId: file.parentId,
      fileId: file.fileId ?? ''
    }))
  };
};

function getParentIds(collections: NormalizedCollection[]) {
  return [
    ...new Set(
      collections
        .map((collection) => collection.parentId)
        .filter((parentId): parentId is string => !!parentId)
    )
  ];
}

const withDeadline = async <T>(promise: Promise<T>, deadlineAt: number): Promise<T> => {
  // 调用方已经发出请求；即使进入本函数时期限刚好耗尽，也必须消费迟到的拒绝。
  void promise.catch(() => undefined);
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw DatasetErrEnum.archiveUnavailable;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(DatasetErrEnum.archiveUnavailable), remainingMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * 在发送响应头前读取所有 S3 metadata，校验对象归属、数量和逻辑总大小，并生成最终 ZIP 路径。
 * metadata 固定最多 8 并发；任一失败都会终止整个预检。
 */
export const prepareDatasetArchiveManifest = async ({
  plan,
  getFileMetadata,
  limits,
  assertActive
}: {
  plan: DatasetArchivePlan;
  getFileMetadata: (
    key: string
  ) => Promise<{ filename: string; contentLength?: number } | undefined>;
  limits: {
    maxFiles: number;
    maxSourceSizeBytes: number;
    prepareDeadlineAt: number;
  };
  assertActive?: () => void;
}): Promise<DatasetArchiveManifest> => {
  const checkActive = () => {
    assertActive?.();
    if (Date.now() >= limits.prepareDeadlineAt) throw DatasetErrEnum.archiveUnavailable;
  };
  checkActive();
  if (plan.files.length > limits.maxFiles) throw DatasetErrEnum.archiveLimitExceeded;
  if (
    plan.files.some(
      (file) =>
        !file.fileId ||
        !isAuthorizedDatasetFileS3Key({ key: file.fileId, datasetId: plan.datasetId })
    )
  ) {
    throw DatasetErrEnum.archiveInvalidFile;
  }

  const metadataList = new Array<{ filename: string; contentLength: number }>(plan.files.length);
  let nextIndex = 0;
  let failure: unknown;
  const worker = async () => {
    while (nextIndex < plan.files.length && !failure) {
      const index = nextIndex;
      nextIndex += 1;
      const file = plan.files[index];

      try {
        // 先检查再调用 S3；调用后再检查，确保迟到结果不会触发下一项调度。
        checkActive();
        const metadata = await withDeadline(getFileMetadata(file.fileId), limits.prepareDeadlineAt);
        checkActive();
        if (
          !metadata ||
          !metadata.filename ||
          typeof metadata.contentLength !== 'number' ||
          !Number.isSafeInteger(metadata.contentLength) ||
          metadata.contentLength < 0
        ) {
          throw DatasetErrEnum.archiveInvalidFile;
        }
        metadataList[index] = {
          filename: metadata.filename,
          contentLength: metadata.contentLength
        };
      } catch (error) {
        failure = error;
        throw error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(8, plan.files.length) }, () => worker()));
  checkActive();

  const totalSourceSize = metadataList.reduce((sum, metadata) => {
    const nextTotal = sum + metadata.contentLength;
    if (!Number.isSafeInteger(nextTotal)) throw DatasetErrEnum.archiveLimitExceeded;
    return nextTotal;
  }, 0);
  if (totalSourceSize > limits.maxSourceSizeBytes) {
    throw DatasetErrEnum.archiveLimitExceeded;
  }

  const datasetRoot = sanitizeArchivePathSegment(plan.datasetName);
  const pathByDirectoryId = new Map<string, string>();
  const usedNamesByPath = new Map<string, Set<string>>();
  const getUsedNames = (path: string) => {
    const usedNames = usedNamesByPath.get(path) ?? new Set<string>();
    usedNamesByPath.set(path, usedNames);
    return usedNames;
  };
  const directories = plan.directories.map((directory) => {
    checkActive();
    const parentPath =
      (directory.parentId && pathByDirectoryId.get(directory.parentId)) || datasetRoot;
    const name = reserveUniqueArchiveName({
      rawName: directory.name,
      usedNames: getUsedNames(parentPath)
    });
    const path = `${parentPath}/${name}`;
    pathByDirectoryId.set(directory.collectionId, path);
    return path;
  });
  const files = plan.files.map((file, index) => {
    checkActive();
    const parentPath = (file.parentId && pathByDirectoryId.get(file.parentId)) || datasetRoot;
    const metadata = metadataList[index];
    const name = reserveUniqueArchiveName({
      rawName: metadata.filename,
      usedNames: getUsedNames(parentPath)
    });

    return {
      key: file.fileId,
      path: `${parentPath}/${name}`
    };
  });

  return { directories, files };
};
