import type {
  APIFileItemType,
  ApiDatasetDetailResponse
} from '@fastgpt/global/core/dataset/apiDataset/type';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getLogger, LogCategories } from '../../../common/logger';
import { syncExternalFilePermissions } from './syncPermissions';

export type TreeNode<T = APIFileItemType> = {
  file: T;
  children: TreeNode<T>[];
};

/**
 * Build a tree from a flat list of files.
 *
 * @param files - Flat list of file items, each must have a unique `id` field
 * @param getParentId - Resolves the parent ID for a given file.
 *   Returns the parent's id if the node has a parent in the list, or undefined/null/'' for root nodes.
 * @returns Array of root nodes forming the tree(s)
 */
export function buildTree<T extends { id: string }>(
  files: T[],
  getParentId: (file: T) => string | undefined | null
): TreeNode<T>[] {
  const nodeMap = new Map<string, TreeNode<T>>();
  for (const f of files) {
    nodeMap.set(f.id, { file: f, children: [] });
  }

  const roots: TreeNode<T>[] = [];
  for (const f of files) {
    const node = nodeMap.get(f.id)!;
    const parentId = getParentId(f);
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

type ApiDatasetRequestLike = {
  getFileDetail: (params: { apiFileId: string }) => Promise<ApiDatasetDetailResponse>;
};

/**
 * Sync external file permissions for a single collection (file or folder).
 *
 * Calls `getFileDetail` on the API server to fetch the latest permissions,
 * then delegates to `syncExternalFilePermissions` to update the collection's
 * collaborators if permissions have changed.
 *
 * Silently catches errors (logs a warning) so that a single permission sync
 * failure does not block the overall sync process.
 */
export async function syncCollectionPermissions({
  mongoId,
  file,
  apiDatasetRequest,
  teamId,
  isPermissionSync,
  datasetId
}: {
  mongoId: string;
  file: APIFileItemType;
  apiDatasetRequest: ApiDatasetRequestLike;
  teamId: string;
  isPermissionSync: boolean;
  datasetId: string;
}): Promise<void> {
  if (!isPermissionSync) return;

  const logger = getLogger(LogCategories.MODULE.DATASET);

  try {
    const fileDetail = await apiDatasetRequest.getFileDetail({ apiFileId: file.id });
    if (fileDetail.permissions) {
      await syncExternalFilePermissions({
        collection: {
          _id: mongoId,
          type:
            file.type === 'folder'
              ? DatasetCollectionTypeEnum.folder
              : DatasetCollectionTypeEnum.apiFile
        },
        teamId,
        externalPermissions: fileDetail.permissions
      });
    }
  } catch (permError) {
    logger.warn('Dataset sync permissions failed', {
      datasetId,
      fileId: file.id,
      error: permError
    });
  }
}
