import {
  DEFAULT_ORG_AVATAR,
  DEFAULT_TEAM_AVATAR,
  DEFAULT_USER_AVATAR
} from '@fastgpt/global/common/system/constants';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { AuditEventEnum, type TeamAuditEvent } from '@fastgpt/global/support/user/audit/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import {
  AuditResourceTypeEnum,
  isCollectionAuditResource,
  normalizeAuditListResources,
  type AuditListResourceType,
  type AuditResourceType
} from '@fastgpt/global/support/user/audit/type';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { auditLogMap } from './constants';
import { processAuditMetadata } from './processors';

export type AuditTranslator = (key: any, options?: Record<string, any>) => string;

export type PresentedAuditResource = {
  key: string;
  type?: AuditResourceTypeEnum;
  name: string;
  avatar?: string;
  href?: string;
  deleted?: boolean;
  nameMissing?: boolean;
};

/** 这些事件的主目标资源已在本次操作中被删除，即使未落库 deleted 标记也不生成跳转链接。 */
const DELETE_TARGET_EVENTS = new Set<string>([
  AuditEventEnum.DELETE_APP,
  AuditEventEnum.DELETE_DATASET,
  AuditEventEnum.DELETE_COLLECTION,
  AuditEventEnum.DELETE_SKILL,
  AuditEventEnum.DELETE_DEPARTMENT,
  AuditEventEnum.DELETE_GROUP
]);

const APP_EVENTS = new Set<string>([
  AuditEventEnum.CREATE_APP,
  AuditEventEnum.UPDATE_APP_INFO,
  AuditEventEnum.MOVE_APP,
  AuditEventEnum.DELETE_APP,
  AuditEventEnum.UPDATE_APP_COLLABORATOR,
  AuditEventEnum.DELETE_APP_COLLABORATOR,
  AuditEventEnum.TRANSFER_APP_OWNERSHIP,
  AuditEventEnum.CREATE_APP_COPY,
  AuditEventEnum.SAVE_APP,
  AuditEventEnum.PUBLISH_APP,
  AuditEventEnum.UPDATE_PUBLISH_APP,
  AuditEventEnum.CREATE_APP_PUBLISH_CHANNEL,
  AuditEventEnum.UPDATE_APP_PUBLISH_CHANNEL,
  AuditEventEnum.DELETE_APP_PUBLISH_CHANNEL,
  AuditEventEnum.EXPORT_APP_CHAT_LOG,
  AuditEventEnum.CREATE_EVALUATION,
  AuditEventEnum.EXPORT_EVALUATION,
  AuditEventEnum.DELETE_EVALUATION
]);

const DATASET_EVENTS = new Set<string>([
  AuditEventEnum.CREATE_DATASET,
  AuditEventEnum.UPDATE_DATASET,
  AuditEventEnum.DELETE_DATASET,
  AuditEventEnum.MOVE_DATASET,
  AuditEventEnum.UPDATE_DATASET_COLLABORATOR,
  AuditEventEnum.DELETE_DATASET_COLLABORATOR,
  AuditEventEnum.TRANSFER_DATASET_OWNERSHIP,
  AuditEventEnum.EXPORT_DATASET,
  AuditEventEnum.SEARCH_TEST,
  DatasetAuditEventEnum.DATASET_CONFIG_UPDATE,
  DatasetAuditEventEnum.DATASET_TAG_CREATE,
  DatasetAuditEventEnum.DATASET_TAG_RENAME,
  DatasetAuditEventEnum.DATASET_TAG_DELETE,
  DatasetAuditEventEnum.DATASET_TRAINING_RETRY,
  DatasetAuditEventEnum.DATASET_INDEX_REBUILD
]);

const COLLECTION_EVENTS = new Set<string>([
  AuditEventEnum.CREATE_COLLECTION,
  AuditEventEnum.UPDATE_COLLECTION,
  AuditEventEnum.DELETE_COLLECTION,
  AuditEventEnum.RETRAIN_COLLECTION,
  AuditEventEnum.CREATE_DATA,
  AuditEventEnum.UPDATE_DATA,
  AuditEventEnum.DELETE_DATA,
  DatasetAuditEventEnum.DATASET_COLLECTION_CREATE,
  DatasetAuditEventEnum.DATASET_COLLECTION_RENAME,
  DatasetAuditEventEnum.DATASET_COLLECTION_MOVE,
  DatasetAuditEventEnum.DATASET_COLLECTION_ENABLE,
  DatasetAuditEventEnum.DATASET_COLLECTION_DISABLE,
  DatasetAuditEventEnum.DATASET_COLLECTION_SOURCE_READ,
  DatasetAuditEventEnum.DATASET_COLLECTION_QA_EXPORT,
  DatasetAuditEventEnum.DATASET_COLLECTION_SYNC,
  DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD,
  DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE,
  DatasetAuditEventEnum.DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME,
  DatasetAuditEventEnum.DATASET_COLLECTION_TRAINING_RETRY,
  DatasetAuditEventEnum.DATASET_TRAINING_TASK_RETRY,
  DatasetAuditEventEnum.DATASET_TRAINING_RECORD_DELETE
]);

const SKILL_EVENTS = new Set<string>([
  AuditEventEnum.CREATE_SKILL,
  AuditEventEnum.UPDATE_SKILL,
  AuditEventEnum.DEPLOY_SKILL,
  AuditEventEnum.DELETE_SKILL,
  AuditEventEnum.IMPORT_SKILL,
  AuditEventEnum.EXPORT_SKILL,
  AuditEventEnum.COPY_SKILL,
  AuditEventEnum.MOVE_SKILL,
  AuditEventEnum.UPDATE_SKILL_COLLABORATOR,
  AuditEventEnum.DELETE_SKILL_COLLABORATOR,
  AuditEventEnum.TRANSFER_SKILL_OWNERSHIP
]);

const API_KEY_EVENTS = new Set<string>([
  AuditEventEnum.CREATE_API_KEY,
  AuditEventEnum.UPDATE_API_KEY,
  AuditEventEnum.COPY_API_KEY,
  AuditEventEnum.DELETE_API_KEY
]);

const ENTERPRISE_EVENTS = new Set<string>([
  AuditEventEnum.START_ENTERPRISE_AUTH,
  AuditEventEnum.VERIFY_ENTERPRISE_AUTH_AMOUNT,
  AuditEventEnum.RESET_ENTERPRISE_AUTH_TASK
]);

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

/** 解析资源头像或内置图标；优先按当前实时类型选取默认图标，无头像概念的实体返回 undefined。 */
export const resolveAuditResourceAvatar = (resource: AuditListResourceType): string | undefined => {
  switch (resource.currentType ?? resource.type) {
    case AuditResourceTypeEnum.apiKey:
    case AuditResourceTypeEnum.enterprise:
      return undefined;
    case AuditResourceTypeEnum.appFolder:
    case AuditResourceTypeEnum.toolFolder:
    case AuditResourceTypeEnum.datasetFolder:
    case AuditResourceTypeEnum.skillFolder:
      return resource.avatar || FolderImgUrl;
    case AuditResourceTypeEnum.collectionFolder:
      return 'common/folderFill';
    case AuditResourceTypeEnum.collection:
      return getCollectionIcon({
        type: isCollectionAuditResource(resource) ? resource.collectionType : undefined,
        name: resource.name
      });
    case AuditResourceTypeEnum.app:
      return resource.avatar || 'core/app/type/simpleFill';
    case AuditResourceTypeEnum.tool:
      return resource.avatar || 'core/app/type/pluginFill';
    case AuditResourceTypeEnum.dataset:
      return resource.avatar || 'core/dataset/commonDatasetColor';
    case AuditResourceTypeEnum.skill:
      return resource.avatar || 'core/skill/default';
    case AuditResourceTypeEnum.member:
      return resource.avatar || DEFAULT_USER_AVATAR;
    case AuditResourceTypeEnum.department:
      return resource.avatar || DEFAULT_ORG_AVATAR;
    case AuditResourceTypeEnum.group:
      return resource.avatar || 'support/team/group';
    case AuditResourceTypeEnum.team:
      return resource.avatar || DEFAULT_TEAM_AVATAR;
    default:
      return undefined;
  }
};

/** 解析站内相对跳转地址（不含部署前缀）；优先按当前实时类型路由，不可跳转、缺少 ID/父级上下文或已删除时返回 undefined。 */
export const resolveAuditResourceHref = (resource: AuditListResourceType): string | undefined => {
  if (!resource.id || resource.deleted) return undefined;

  switch (resource.currentType ?? resource.type) {
    case AuditResourceTypeEnum.app:
    case AuditResourceTypeEnum.tool:
      return `/app/detail?appId=${encodeURIComponent(resource.id)}`;
    case AuditResourceTypeEnum.appFolder:
      return `/dashboard/agent?parentId=${encodeURIComponent(resource.id)}`;
    case AuditResourceTypeEnum.toolFolder:
      return `/dashboard/tool?parentId=${encodeURIComponent(resource.id)}`;
    case AuditResourceTypeEnum.dataset:
      return `/dataset/detail?datasetId=${encodeURIComponent(resource.id)}`;
    case AuditResourceTypeEnum.datasetFolder:
      return `/dataset/list?parentId=${encodeURIComponent(resource.id)}`;
    case AuditResourceTypeEnum.collection: {
      const datasetId = isCollectionAuditResource(resource)
        ? (resource.datasetId ?? resource.parentId)
        : undefined;
      if (!datasetId) return undefined;
      const query = new URLSearchParams({
        datasetId,
        currentTab: 'dataCard',
        collectionId: resource.id
      });
      return `/dataset/detail?${query}`;
    }
    case AuditResourceTypeEnum.collectionFolder: {
      const datasetId = isCollectionAuditResource(resource)
        ? (resource.datasetId ?? resource.parentId)
        : undefined;
      if (!datasetId) return undefined;
      const query = new URLSearchParams({
        datasetId,
        currentTab: 'collectionCard',
        parentId: resource.id
      });
      return `/dataset/detail?${query}`;
    }
    case AuditResourceTypeEnum.skill:
      return `/skill/detail?skillId=${encodeURIComponent(resource.id)}`;
    case AuditResourceTypeEnum.skillFolder:
      return `/dashboard/skill?parentId=${encodeURIComponent(resource.id)}`;
    default:
      return undefined;
  }
};

const inferLegacyAppTypeFromMetadata = (appType?: string): AuditResourceTypeEnum => {
  if (!appType) return AuditResourceTypeEnum.app;
  if (appType === 'account_team:type.Folder') return AuditResourceTypeEnum.appFolder;
  if (
    appType === 'app:toolType_workflow' ||
    appType === 'app:toolType_http' ||
    appType === 'app:toolType_mcp' ||
    appType === 'account_team:type.Http plugin'
  ) {
    return AuditResourceTypeEnum.tool;
  }
  return AuditResourceTypeEnum.app;
};

const pickMetadataFallbackName = (
  event: string,
  metadata?: Record<string, unknown>
): string | undefined => {
  if (!metadata) return undefined;
  if (event === AuditEventEnum.RESUME_INHERIT_PERMISSION) {
    return asNonEmptyString(metadata.targetResource);
  }
  if (APP_EVENTS.has(event)) return asNonEmptyString(metadata.appName);
  if (COLLECTION_EVENTS.has(event)) return asNonEmptyString(metadata.collectionName);
  if (DATASET_EVENTS.has(event)) return asNonEmptyString(metadata.datasetName);
  if (SKILL_EVENTS.has(event)) return asNonEmptyString(metadata.skillName);
  if (
    event === AuditEventEnum.CREATE_APP_FOLDER ||
    event === AuditEventEnum.CREATE_DATASET_FOLDER ||
    event === AuditEventEnum.CREATE_SKILL_FOLDER
  ) {
    return asNonEmptyString(metadata.folderName);
  }
  if (event === AuditEventEnum.CHANGE_MEMBER_NAME) {
    return asNonEmptyString(metadata.newName) ?? asNonEmptyString(metadata.memberName);
  }
  if (event === AuditEventEnum.CHANGE_MEMBER_NAME_ACCOUNT) {
    return asNonEmptyString(metadata.newName) ?? asNonEmptyString(metadata.oldName);
  }
  if (event === AuditEventEnum.KICK_OUT_TEAM || event === AuditEventEnum.RECOVER_TEAM_MEMBER) {
    return asNonEmptyString(metadata.memberName);
  }
  if (
    event === AuditEventEnum.CREATE_DEPARTMENT ||
    event === AuditEventEnum.CHANGE_DEPARTMENT ||
    event === AuditEventEnum.DELETE_DEPARTMENT ||
    event === AuditEventEnum.RELOCATE_DEPARTMENT
  ) {
    return asNonEmptyString(metadata.newName) ?? asNonEmptyString(metadata.departmentName);
  }
  if (event === AuditEventEnum.CREATE_GROUP || event === AuditEventEnum.DELETE_GROUP) {
    return asNonEmptyString(metadata.groupName);
  }
  if (event === AuditEventEnum.ASSIGN_PERMISSION) return asNonEmptyString(metadata.objectName);
  if (event === AuditEventEnum.TRANSFER_TEAM_OWNERSHIP) return asNonEmptyString(metadata.teamName);
  if (API_KEY_EVENTS.has(event)) return asNonEmptyString(metadata.keyName);
  if (ENTERPRISE_EVENTS.has(event)) return asNonEmptyString(metadata.enterpriseName);
  return undefined;
};

/** 历史日志缺少 resources 字段时，按事件从已有 metadata 降级提取只读资源项，保证详情精简后不丢信息。 */
const buildLegacyPresentedResources = ({
  event,
  metadata
}: {
  event: string;
  metadata?: Record<string, unknown>;
}): PresentedAuditResource[] => {
  if (!metadata) return [];

  const fromTyped = (type: AuditResourceTypeEnum, name?: string): PresentedAuditResource[] => {
    if (!name) return [];
    const deleted = DELETE_TARGET_EVENTS.has(event);
    const item: AuditResourceType = { type, name, ...(deleted ? { deleted: true } : {}) };
    return [
      {
        key: `legacy:${type}:${name}`,
        type,
        name,
        avatar: resolveAuditResourceAvatar(item),
        ...(deleted ? { deleted: true } : {})
      }
    ];
  };

  if (
    event === AuditEventEnum.ASSIGN_PERMISSION ||
    event === AuditEventEnum.RESUME_INHERIT_PERMISSION
  ) {
    const name = pickMetadataFallbackName(event, metadata);
    if (!name) return [];
    return [
      {
        key: `legacy:${event}:${name}`,
        name
      }
    ];
  }

  if (APP_EVENTS.has(event)) {
    const type = inferLegacyAppTypeFromMetadata(asNonEmptyString(metadata.appType));
    return fromTyped(type, asNonEmptyString(metadata.appName));
  }
  if (event === AuditEventEnum.CREATE_APP_FOLDER) {
    return fromTyped(AuditResourceTypeEnum.appFolder, asNonEmptyString(metadata.folderName));
  }
  if (COLLECTION_EVENTS.has(event)) {
    return fromTyped(AuditResourceTypeEnum.collection, asNonEmptyString(metadata.collectionName));
  }
  if (DATASET_EVENTS.has(event)) {
    const datasetType = asNonEmptyString(metadata.datasetType);
    const type =
      datasetType === 'account_team:dataset.folder_dataset'
        ? AuditResourceTypeEnum.datasetFolder
        : AuditResourceTypeEnum.dataset;
    return fromTyped(type, asNonEmptyString(metadata.datasetName));
  }
  if (event === AuditEventEnum.CREATE_DATASET_FOLDER) {
    return fromTyped(AuditResourceTypeEnum.datasetFolder, asNonEmptyString(metadata.folderName));
  }
  if (SKILL_EVENTS.has(event)) {
    const skillType = asNonEmptyString(metadata.skillType);
    const type =
      skillType === 'account_team:skill.folder'
        ? AuditResourceTypeEnum.skillFolder
        : AuditResourceTypeEnum.skill;
    return fromTyped(type, asNonEmptyString(metadata.skillName));
  }
  if (event === AuditEventEnum.CREATE_SKILL_FOLDER) {
    return fromTyped(AuditResourceTypeEnum.skillFolder, asNonEmptyString(metadata.folderName));
  }
  if (
    event === AuditEventEnum.CHANGE_MEMBER_NAME ||
    event === AuditEventEnum.CHANGE_MEMBER_NAME_ACCOUNT ||
    event === AuditEventEnum.KICK_OUT_TEAM ||
    event === AuditEventEnum.RECOVER_TEAM_MEMBER
  ) {
    return fromTyped(AuditResourceTypeEnum.member, pickMetadataFallbackName(event, metadata));
  }
  if (
    event === AuditEventEnum.CREATE_DEPARTMENT ||
    event === AuditEventEnum.CHANGE_DEPARTMENT ||
    event === AuditEventEnum.DELETE_DEPARTMENT ||
    event === AuditEventEnum.RELOCATE_DEPARTMENT
  ) {
    return fromTyped(AuditResourceTypeEnum.department, pickMetadataFallbackName(event, metadata));
  }
  if (event === AuditEventEnum.CREATE_GROUP || event === AuditEventEnum.DELETE_GROUP) {
    return fromTyped(AuditResourceTypeEnum.group, pickMetadataFallbackName(event, metadata));
  }
  if (event === AuditEventEnum.TRANSFER_TEAM_OWNERSHIP) {
    return fromTyped(AuditResourceTypeEnum.team, asNonEmptyString(metadata.teamName));
  }
  if (API_KEY_EVENTS.has(event)) {
    return fromTyped(AuditResourceTypeEnum.apiKey, asNonEmptyString(metadata.keyName));
  }
  if (ENTERPRISE_EVENTS.has(event)) {
    return fromTyped(AuditResourceTypeEnum.enterprise, asNonEmptyString(metadata.enterpriseName));
  }

  return [];
};

/** 统一解析资源列展示模型，供页面表格和 CSV 导出复用。 */
export const resolveAuditResources = ({
  event,
  resources,
  metadata
}: {
  event: TeamAuditEvent | string;
  resources?: unknown;
  metadata?: Record<string, unknown>;
}): PresentedAuditResource[] => {
  if (event === AuditEventEnum.CREATE_INVITATION_LINK || event === AuditEventEnum.JOIN_TEAM) {
    return [];
  }

  const normalized = normalizeAuditListResources(resources);
  if (normalized && normalized.length > 0) {
    const fallbackName =
      normalized.length === 1 ? pickMetadataFallbackName(event, metadata) : undefined;
    const forceDeleted = DELETE_TARGET_EVENTS.has(event);

    return normalized.map((rawItem, index) => {
      const item: AuditListResourceType = {
        ...rawItem,
        ...(forceDeleted ? { deleted: true } : {})
      };
      const datasetFallbackName =
        item.type === AuditResourceTypeEnum.dataset ||
        item.type === AuditResourceTypeEnum.datasetFolder
          ? asNonEmptyString(metadata?.datasetName)
          : undefined;
      const resolvedName = asNonEmptyString(item.name) ?? datasetFallbackName ?? fallbackName;
      const nameMissing = !resolvedName;
      const name = resolvedName ?? (item.deleted ? '-' : item.id ? item.id.slice(-8) : '-');

      return {
        key: `${item.type}:${item.id ?? name}:${index}`,
        type: item.type,
        name,
        avatar: resolveAuditResourceAvatar({ ...item, name }),
        href: resolveAuditResourceHref(item),
        ...(item.deleted ? { deleted: true } : {}),
        ...(nameMissing ? { nameMissing: true } : {})
      };
    });
  }

  return buildLegacyPresentedResources({ event, metadata });
};

/** 将资源列表格式化为 CSV 纯文本列。 */
export const formatAuditResourcesText = (
  resources: PresentedAuditResource[],
  t?: AuditTranslator
): string => {
  if (resources.length === 0) return '-';
  return resources
    .map((item) =>
      item.deleted && (item.nameMissing || !item.name) && t
        ? t('account_team:audit_resource_deleted')
        : item.name
    )
    .join('\n');
};

const extractCollaboratorNames = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
};

/** 将多字段资料修改按「每行一项」输出，空值统一展示为 `-`，兼容数组与历史逗号串。 */
const formatUpdatedFieldsLines = ({
  metadata,
  t
}: {
  metadata: Record<string, unknown>;
  t: AuditTranslator;
}): string | undefined => {
  const rawNames = Array.isArray(metadata.newItemNames)
    ? metadata.newItemNames.map((item) => String(item ?? '').trim()).filter(Boolean)
    : typeof metadata.newItemNames === 'string'
      ? metadata.newItemNames
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  if (rawNames.length === 0) return undefined;

  const rawValues = Array.isArray(metadata.newItemValues)
    ? metadata.newItemValues.map((item) => String(item ?? '').trim())
    : typeof metadata.newItemValues === 'string'
      ? rawNames.length === 1
        ? [metadata.newItemValues.trim()]
        : metadata.newItemValues.split(',').map((item) => item.trim())
      : [];

  return rawNames
    .map((rawName, index) =>
      t('account_team:audit_detail_update_fields', {
        newItemNames: t(rawName),
        newItemValues: rawValues[index] || '-'
      })
    )
    .join('\n');
};

const pickMetadataDeletedResourceId = (
  event: string,
  metadata?: Record<string, unknown>
): string | undefined => {
  if (!metadata) return undefined;
  if (event === AuditEventEnum.DELETE_API_KEY) return asNonEmptyString(metadata.keyId);
  if (event === AuditEventEnum.DELETE_APP) return asNonEmptyString(metadata.appId);
  if (event === AuditEventEnum.DELETE_DATASET) return asNonEmptyString(metadata.datasetId);
  if (event === AuditEventEnum.DELETE_COLLECTION) return asNonEmptyString(metadata.collectionId);
  if (event === AuditEventEnum.DELETE_SKILL) return asNonEmptyString(metadata.skillId);
  if (event === AuditEventEnum.DELETE_DEPARTMENT) return asNonEmptyString(metadata.departmentId);
  if (event === AuditEventEnum.DELETE_GROUP) return asNonEmptyString(metadata.groupId);
  return undefined;
};

/** 提取删除资源事件中被删目标的名称与 ID，供详情列按每行一项输出（避免资源列置灰后丢失识别信息）。 */
const formatDeletedResourceLines = ({
  event,
  resources,
  metadata,
  t
}: {
  event: string;
  resources?: AuditResourceType[];
  metadata?: Record<string, unknown>;
  t: AuditTranslator;
}): string[] => {
  const targets = (() => {
    if (resources && resources.length > 0) {
      const picked =
        event === AuditEventEnum.DELETE_API_KEY
          ? resources.filter((item) => item.deleted || item.type === AuditResourceTypeEnum.apiKey)
          : event === AuditEventEnum.DELETE_COLLECTION
            ? resources.filter(
                (item) =>
                  item.type === AuditResourceTypeEnum.collection ||
                  item.type === AuditResourceTypeEnum.collectionFolder
              )
            : resources;
      const fallbackName =
        picked.length === 1 ? pickMetadataFallbackName(event, metadata) : undefined;
      const fallbackId =
        picked.length === 1 ? pickMetadataDeletedResourceId(event, metadata) : undefined;
      return picked
        .map((item) => ({
          name: asNonEmptyString(item.name) ?? fallbackName,
          id: asNonEmptyString(item.id) ?? fallbackId
        }))
        .filter((item) => Boolean(item.name || item.id));
    }

    const name = pickMetadataFallbackName(event, metadata);
    const id = pickMetadataDeletedResourceId(event, metadata);
    return name || id ? [{ name, id }] : [];
  })();

  const lines: string[] = [];
  for (const target of targets) {
    if (target.name) {
      lines.push(t('account_team:audit_detail_resource_name', { name: target.name }));
    }
    if (target.id) {
      lines.push(t('account_team:audit_detail_resource_id', { id: target.id }));
    }
  }
  return lines;
};

const resolveResourceTypeLabel = (
  resourceType: AuditResourceTypeEnum,
  t: AuditTranslator
): string | undefined => {
  switch (resourceType) {
    case AuditResourceTypeEnum.app:
      return t('account_team:audit_resource_type_app');
    case AuditResourceTypeEnum.tool:
      return t('account_team:audit_resource_type_tool');
    case AuditResourceTypeEnum.appFolder:
      return t('account_team:audit_resource_type_appFolder');
    case AuditResourceTypeEnum.toolFolder:
      return t('account_team:audit_resource_type_toolFolder');
    case AuditResourceTypeEnum.dataset:
      return t('account_team:audit_resource_type_dataset');
    case AuditResourceTypeEnum.datasetFolder:
      return t('account_team:audit_resource_type_datasetFolder');
    case AuditResourceTypeEnum.collection:
      return t('account_team:audit_resource_type_collection');
    case AuditResourceTypeEnum.collectionFolder:
      return t('account_team:audit_resource_type_collectionFolder');
    case AuditResourceTypeEnum.skill:
      return t('account_team:audit_resource_type_skill');
    case AuditResourceTypeEnum.skillFolder:
      return t('account_team:audit_resource_type_skillFolder');
    case AuditResourceTypeEnum.member:
      return t('account_team:audit_resource_type_member');
    case AuditResourceTypeEnum.department:
      return t('account_team:audit_resource_type_department');
    case AuditResourceTypeEnum.group:
      return t('account_team:audit_resource_type_group');
    default:
      return undefined;
  }
};

/** 为多资源共用的审计事件生成首行「类型：...」，无结构化资源时省略。 */
const formatResourceTypeLine = ({
  resources,
  t
}: {
  resources?: AuditListResourceType[];
  t: AuditTranslator;
}): string | undefined => {
  const collectionTarget = resources?.find(isCollectionAuditResource);
  const resourceType = collectionTarget?.type ?? resources?.[0]?.type;
  const label = resourceType ? resolveResourceTypeLabel(resourceType, t) : undefined;
  if (!label) return undefined;
  return t('account_team:audit_detail_resource_type', { type: label });
};

/** 为集合审计事件生成首行「知识库：...」，优先展示实时名称，知识库已删时展示「知识库已被删除」。 */
const formatCollectionDatasetLine = ({
  resources,
  metadataDatasetName,
  t
}: {
  resources?: AuditListResourceType[];
  metadataDatasetName?: string;
  t: AuditTranslator;
}): string | undefined => {
  const collectionItem = resources?.find(isCollectionAuditResource);
  if (collectionItem?.datasetDeleted) {
    return t('account_team:audit_detail_collection_dataset', {
      datasetName: t('account_team:audit_detail_dataset_deleted')
    });
  }
  const datasetName = asNonEmptyString(collectionItem?.datasetName) ?? metadataDatasetName;
  return datasetName
    ? t('account_team:audit_detail_collection_dataset', { datasetName })
    : undefined;
};

/**
 * 渲染精简后的审计详情列：只展示实际变更内容或补充上下文，无额外信息时统一返回 `-`。
 * 页面表格与 CSV 导出共用同一套规则。
 */
export const formatAuditSummary = ({
  event,
  resources,
  metadata,
  t,
  formatTime = formatTime2YMDHMS
}: {
  event: TeamAuditEvent | string;
  resources?: unknown;
  metadata?: Record<string, unknown>;
  t: AuditTranslator;
  formatTime?: (time: Date) => string;
}): string => {
  const config = auditLogMap[event as TeamAuditEvent];
  if (!config) {
    return metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : '-';
  }
  const hasMetadata = Boolean(metadata && Object.keys(metadata).length > 0);
  const normalizedResources = normalizeAuditListResources(resources);
  const hasResources = Boolean(normalizedResources && normalizedResources.length > 0);
  if (!hasMetadata && !hasResources) {
    return '-';
  }

  const processed = hasMetadata
    ? processAuditMetadata({
        event: event as TeamAuditEvent,
        metadata: metadata!,
        t,
        formatTime
      })
    : {};
  const collectionDatasetLine = formatCollectionDatasetLine({
    resources: normalizedResources,
    metadataDatasetName: asNonEmptyString(processed.datasetName),
    t
  });

  switch (event) {
    case AuditEventEnum.EXPORT_AUDIT_LOGS:
      return t('account_team:audit_detail_export_audit_logs', processed);

    case AuditEventEnum.CREATE_INVITATION_LINK:
    case AuditEventEnum.JOIN_TEAM: {
      const link =
        asNonEmptyString(processed.link) ?? asNonEmptyString(normalizedResources?.[0]?.name);
      return link ? t('account_team:audit_detail_invitation_link', { link }) : '-';
    }

    case AuditEventEnum.CHANGE_MEMBER_NAME: {
      const oldName = asNonEmptyString(processed.memberName);
      const newName = asNonEmptyString(processed.newName);
      return oldName && newName ? t('account_team:audit_detail_rename', { oldName, newName }) : '-';
    }

    case AuditEventEnum.CHANGE_MEMBER_NAME_ACCOUNT: {
      const oldName = asNonEmptyString(processed.oldName);
      const newName = asNonEmptyString(processed.newName);
      return oldName && newName ? t('account_team:audit_detail_rename', { oldName, newName }) : '-';
    }

    case AuditEventEnum.CHANGE_DEPARTMENT: {
      const fieldLines = metadata ? formatUpdatedFieldsLines({ metadata, t }) : undefined;
      if (fieldLines) return fieldLines;
      const oldName = asNonEmptyString(processed.oldName);
      const newName = asNonEmptyString(processed.newName);
      return oldName && newName && oldName !== newName
        ? t('account_team:audit_detail_rename', { oldName, newName })
        : '-';
    }

    case AuditEventEnum.RELOCATE_DEPARTMENT: {
      const target = asNonEmptyString(processed.targetDepartmentName);
      return target ? t('account_team:audit_detail_move_to', { target }) : '-';
    }

    case AuditEventEnum.ASSIGN_PERMISSION: {
      if (processed.permission === undefined) return '-';
      const typeLine = formatResourceTypeLine({ resources: normalizedResources, t });
      const permLine = t('account_team:audit_detail_team_permission', processed);
      return typeLine ? `${typeLine}\n${permLine}` : permLine;
    }

    case AuditEventEnum.TRANSFER_TEAM_OWNERSHIP:
    case AuditEventEnum.TRANSFER_APP_OWNERSHIP:
    case AuditEventEnum.TRANSFER_DATASET_OWNERSHIP:
    case AuditEventEnum.TRANSFER_SKILL_OWNERSHIP: {
      const oldOwnerName = asNonEmptyString(processed.oldOwnerName);
      const newOwnerName = asNonEmptyString(processed.newOwnerName);
      return oldOwnerName && newOwnerName
        ? t('account_team:audit_detail_transfer_ownership', { oldOwnerName, newOwnerName })
        : '-';
    }

    case AuditEventEnum.RESUME_INHERIT_PERMISSION: {
      const lines: string[] = [];
      const typeLine = formatResourceTypeLine({ resources: normalizedResources, t });
      if (typeLine) lines.push(typeLine);
      if (normalizedResources?.some(isCollectionAuditResource) && collectionDatasetLine) {
        lines.push(collectionDatasetLine);
      }
      lines.push(
        t('account_team:audit_detail_inherit_parent', {
          parentResource: processed.parentResource ?? '-'
        })
      );
      return lines.join('\n');
    }

    case AuditEventEnum.UPDATE_APP_INFO:
    case AuditEventEnum.UPDATE_SKILL: {
      return (metadata ? formatUpdatedFieldsLines({ metadata, t }) : undefined) ?? '-';
    }

    case AuditEventEnum.DELETE_APP:
    case AuditEventEnum.DELETE_DATASET:
    case AuditEventEnum.DELETE_SKILL:
    case AuditEventEnum.DELETE_DEPARTMENT:
    case AuditEventEnum.DELETE_GROUP:
    case AuditEventEnum.DELETE_API_KEY: {
      const lines = formatDeletedResourceLines({
        event,
        resources: normalizedResources,
        metadata,
        t
      });
      return lines.length > 0 ? lines.join('\n') : '-';
    }

    case AuditEventEnum.MOVE_APP:
    case AuditEventEnum.MOVE_DATASET:
    case AuditEventEnum.MOVE_SKILL: {
      const target = asNonEmptyString(processed.targetFolderName);
      return target ? t('account_team:audit_detail_move_to', { target }) : '-';
    }

    case AuditEventEnum.UPDATE_APP_COLLABORATOR:
    case AuditEventEnum.UPDATE_DATASET_COLLABORATOR:
    case AuditEventEnum.UPDATE_SKILL_COLLABORATOR: {
      const orgNames = extractCollaboratorNames(processed.orgList);
      const groupNames = extractCollaboratorNames(processed.groupList);
      const tmbNames = extractCollaboratorNames(processed.tmbList);
      const hasPermission =
        processed.readPermission !== undefined ||
        processed.writePermission !== undefined ||
        processed.managePermission !== undefined;
      if (
        orgNames.length === 0 &&
        groupNames.length === 0 &&
        tmbNames.length === 0 &&
        !hasPermission
      ) {
        return '-';
      }
      const lines: string[] = [];
      if (orgNames.length > 0) {
        lines.push(
          t('account_team:audit_detail_collaborator_org', {
            value: orgNames.join(' / ')
          })
        );
      }
      if (groupNames.length > 0) {
        lines.push(
          t('account_team:audit_detail_collaborator_group', {
            value: groupNames.join(' / ')
          })
        );
      }
      if (tmbNames.length > 0) {
        lines.push(
          t('account_team:audit_detail_collaborator_member', {
            value: tmbNames.join(' / ')
          })
        );
      }
      lines.push(
        t('account_team:audit_detail_collaborator_permissions', {
          readPermission: processed.readPermission ?? '-',
          writePermission: processed.writePermission ?? '-',
          managePermission: processed.managePermission ?? '-'
        })
      );
      return lines.join('\n');
    }

    case AuditEventEnum.DELETE_APP_COLLABORATOR:
    case AuditEventEnum.DELETE_DATASET_COLLABORATOR:
    case AuditEventEnum.DELETE_SKILL_COLLABORATOR: {
      const itemName = asNonEmptyString(processed.itemName);
      const itemValueName = asNonEmptyString(processed.itemValueName);
      return itemName && itemValueName
        ? t('account_team:audit_detail_remove_collaborator', { itemName, itemValueName })
        : '-';
    }

    case AuditEventEnum.UPDATE_PUBLISH_APP: {
      const operationName = asNonEmptyString(processed.operationName);
      return operationName
        ? t('account_team:audit_detail_publish_operation', { operationName })
        : '-';
    }

    case AuditEventEnum.CREATE_APP_PUBLISH_CHANNEL:
    case AuditEventEnum.UPDATE_APP_PUBLISH_CHANNEL:
    case AuditEventEnum.DELETE_APP_PUBLISH_CHANNEL: {
      const channelName = asNonEmptyString(processed.channelName);
      return channelName ? t('account_team:audit_detail_publish_channel', { channelName }) : '-';
    }

    case AuditEventEnum.CREATE_EVALUATION:
    case AuditEventEnum.EXPORT_EVALUATION:
    case AuditEventEnum.DELETE_EVALUATION: {
      const evalName = asNonEmptyString(processed.evalName);
      return evalName ? t('account_team:audit_detail_evaluation', { evalName }) : '-';
    }

    case DatasetAuditEventEnum.DATASET_CONFIG_UPDATE: {
      const changeItem = asNonEmptyString(processed.changeItem);
      return changeItem
        ? t('account_team:audit_detail_dataset_config', {
            changeItem,
            oldValue: processed.oldValue ?? '-',
            newValue: processed.newValue ?? '-'
          })
        : '-';
    }

    case DatasetAuditEventEnum.DATASET_TAG_CREATE:
    case DatasetAuditEventEnum.DATASET_TAG_DELETE: {
      const tagName = asNonEmptyString(processed.tagName);
      return tagName ? t('account_team:audit_detail_dataset_tag', { tagName }) : '-';
    }

    case DatasetAuditEventEnum.DATASET_TAG_RENAME: {
      const oldName = asNonEmptyString(processed.oldName);
      const newName = asNonEmptyString(processed.newName);
      return oldName && newName
        ? t('account_team:audit_detail_dataset_tag_rename', { oldName, newName })
        : '-';
    }

    case DatasetAuditEventEnum.DATASET_INDEX_REBUILD: {
      const oldModelName = asNonEmptyString(processed.oldModelName);
      const newModelName = asNonEmptyString(processed.newModelName);
      return oldModelName && newModelName
        ? t('account_team:audit_detail_index_rebuild', { oldModelName, newModelName })
        : '-';
    }

    case DatasetAuditEventEnum.DATASET_COLLECTION_CREATE: {
      const lines: string[] = [];
      if (collectionDatasetLine) lines.push(collectionDatasetLine);
      const objectType = asNonEmptyString(processed.objectType);
      const location = asNonEmptyString(processed.location);
      if (objectType) {
        lines.push(t('account_team:audit_detail_resource_type', { type: objectType }));
      }
      if (location) {
        lines.push(t('account_team:audit_detail_collection_location', { location }));
      }
      return lines.length > 0 ? lines.join('\n') : '-';
    }

    case DatasetAuditEventEnum.DATASET_COLLECTION_RENAME: {
      const lines: string[] = [];
      if (collectionDatasetLine) lines.push(collectionDatasetLine);
      const oldName = asNonEmptyString(processed.oldName);
      const newName = asNonEmptyString(processed.newName);
      if (oldName && newName) {
        lines.push(t('account_team:audit_detail_rename', { oldName, newName }));
      }
      return lines.length > 0 ? lines.join('\n') : '-';
    }

    case DatasetAuditEventEnum.DATASET_COLLECTION_MOVE: {
      const lines: string[] = [];
      if (collectionDatasetLine) lines.push(collectionDatasetLine);
      const oldPath = asNonEmptyString(processed.oldPath);
      const newPath = asNonEmptyString(processed.newPath);
      if (oldPath && newPath) {
        lines.push(t('account_team:audit_detail_rename', { oldName: oldPath, newName: newPath }));
      }
      return lines.length > 0 ? lines.join('\n') : '-';
    }

    case DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD:
    case DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE: {
      const lines: string[] = [];
      if (collectionDatasetLine) lines.push(collectionDatasetLine);
      const tagName = asNonEmptyString(processed.tagName);
      if (tagName) {
        lines.push(t('account_team:audit_detail_dataset_tag', { tagName }));
      }
      return lines.length > 0 ? lines.join('\n') : '-';
    }

    case DatasetAuditEventEnum.DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME: {
      const lines: string[] = [];
      if (collectionDatasetLine) lines.push(collectionDatasetLine);
      lines.push(
        t('account_team:audit_detail_inherit_parent', {
          parentResource: processed.parentResource ?? '-'
        })
      );
      return lines.join('\n');
    }

    case AuditEventEnum.DELETE_COLLECTION: {
      const lines: string[] = [];
      if (collectionDatasetLine) lines.push(collectionDatasetLine);
      lines.push(
        ...formatDeletedResourceLines({
          event,
          resources: normalizedResources,
          metadata,
          t
        })
      );
      return lines.length > 0 ? lines.join('\n') : '-';
    }

    case AuditEventEnum.CREATE_COLLECTION:
    case AuditEventEnum.UPDATE_COLLECTION:
    case AuditEventEnum.RETRAIN_COLLECTION:
    case AuditEventEnum.CREATE_DATA:
    case AuditEventEnum.UPDATE_DATA:
    case AuditEventEnum.DELETE_DATA:
    case DatasetAuditEventEnum.DATASET_COLLECTION_ENABLE:
    case DatasetAuditEventEnum.DATASET_COLLECTION_DISABLE:
    case DatasetAuditEventEnum.DATASET_COLLECTION_SOURCE_READ:
    case DatasetAuditEventEnum.DATASET_COLLECTION_QA_EXPORT:
    case DatasetAuditEventEnum.DATASET_COLLECTION_SYNC:
    case DatasetAuditEventEnum.DATASET_COLLECTION_TRAINING_RETRY:
    case DatasetAuditEventEnum.DATASET_TRAINING_TASK_RETRY:
    case DatasetAuditEventEnum.DATASET_TRAINING_RECORD_DELETE: {
      return collectionDatasetLine ?? '-';
    }

    default:
      return '-';
  }
};
