import {
  ApiDatasetPermissionItemSchema,
  type ApiDatasetPermissionItemType,
  type ApiDatasetServerType
} from '@fastgpt/global/core/dataset/apiDataset/type';
import { getLogger, LogCategories } from '../../../../../common/logger';
import type { getApiDatasetRequest } from '../../index';
import { fetchCustomApiFilePermissions } from './custom';
import type { ApiFilePermissionSnapshot } from '../types';

type ApiDatasetRequest = Awaited<ReturnType<typeof getApiDatasetRequest>>;

const logger = getLogger(LogCategories.MODULE.DATASET);

/**
 * 把外部原样的 `permissions` 变成合法权限项列表。这是外部权限格式规则的唯一判定点。
 *
 *  - 不是数组（字段缺失、类型不对）→ `undefined`：一律按「外部未表达」处理，本地保持不动；
 *  - 逐条过 schema（主体四选一 + role 必须是 4/2/1/owner），非法项单独丢弃，不影响同文件其他项；
 *  - `[]` → `[]`：外部明确表达「没有协作者」，这是有意义的结论，不能丢；
 *  - 有内容但全部非法 → `undefined`：本地解析不了不能当成「清空」，写 `[]` 会把节点撤成仅 owner 可见。
 */
const normalizeRawPermissions = ({
  apiFileId,
  rawPermissions
}: {
  apiFileId: string;
  rawPermissions: unknown;
}): ApiDatasetPermissionItemType[] | undefined => {
  if (!Array.isArray(rawPermissions)) return undefined;

  const permissions = rawPermissions.flatMap((item) => {
    const parsed = ApiDatasetPermissionItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  if (permissions.length === 0 && rawPermissions.length > 0) {
    logger.warn('api file permissions are all invalid, treat as not provided', {
      apiFileId,
      itemCount: rawPermissions.length
    });
    return undefined;
  }

  return permissions;
};

/**
 * 按 provider 拉取文件权限，并统一完成格式校验。
 *
 * 目前只有自定义 API 支持 `permissions`；其他 provider 在 schema 层已被拒绝开启同步，
 * 这里仍显式抛错，防止绕过 schema 的内部调用静默写入空快照。
 */
export const fetchApiFilePermissions = async ({
  apiDatasetServer,
  request,
  apiFileIds,
  deadlineAt
}: {
  apiDatasetServer?: ApiDatasetServerType;
  request: ApiDatasetRequest;
  apiFileIds: string[];
  /** 本轮同步的截止时间；到达后不再发起新的外部请求。 */
  deadlineAt?: number;
}): Promise<Map<string, ApiFilePermissionSnapshot>> => {
  if (!apiDatasetServer?.apiServer) {
    throw new Error('Permission sync adapter is only available for apiServer datasets');
  }

  const rawSnapshots = await fetchCustomApiFilePermissions({ request, apiFileIds, deadlineAt });

  const snapshots = new Map<string, ApiFilePermissionSnapshot>();
  for (const snapshot of rawSnapshots.values()) {
    snapshots.set(
      snapshot.apiFileId,
      snapshot.status === 'failed'
        ? snapshot
        : {
            apiFileId: snapshot.apiFileId,
            status: 'ok',
            permissions: normalizeRawPermissions({
              apiFileId: snapshot.apiFileId,
              rawPermissions: snapshot.rawPermissions
            })
          }
    );
  }
  return snapshots;
};
