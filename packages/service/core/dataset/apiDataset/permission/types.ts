import type { ApiDatasetPermissionItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

/** 与全局错误/常量无关的内部类型集中放在这里，避免 sync 与 adapter 互相 import。 */

/**
 * adapter 返回的原始快照，`rawPermissions` 是外部原样数据，未经任何校验。
 * 格式规则统一在 `fetchApiFilePermissions` 判定，adapter 只负责拉取和容错。
 */
export type RawApiFilePermissionSnapshot =
  | {
      apiFileId: string;
      status: 'ok';
      rawPermissions?: unknown;
    }
  | {
      apiFileId: string;
      status: 'failed';
    };

/**
 * 单个节点的外部权限快照（已通过格式校验）。
 *  - `status: 'ok'`：本轮拿到了外部结论；`permissions` 为 `undefined` 表示外部未提供，本地保持不动。
 *  - `status: 'failed'`：单节点拉取失败（超时 / 5xx / 限流）。该节点本轮不写，但不中止整轮。
 */
export type ApiFilePermissionSnapshot =
  | {
      apiFileId: string;
      status: 'ok';
      permissions?: ApiDatasetPermissionItemType[];
    }
  | {
      apiFileId: string;
      status: 'failed';
    };

/** 单节点写入结果：updated 表示 ACL 行实际变化，skipped 表示与本地一致或外部未提供。 */
export type CollectionPermissionSyncStats = {
  checked: number;
  updated: number;
  skipped: number;
  failed: number;
};

/** 一个待写入的 collection 目标态。 */
export type CollectionPermissionTargetState = {
  collectionId: string;
  type: string;
  parentId: string | null;
  /** 目标 ACL 列表（已含 owner 兜底） */
  collaborators: CollaboratorItemType[];
  /** 本地当前 ACL 列表，用于子树物化的 old/new 对照 */
  currentCollaborators: CollaboratorItemType[];
  /** 本地当前是否已是独立态；false 时写入需要同时把 inheritPermission 置为 false */
  isIndependent: boolean;
  /** 与其他节点比较后是否真的有差异；false 直接跳过写库 */
  changed: boolean;
};
