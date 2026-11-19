import type { SourceMemberType } from '../type';
import type { TeamAuditEvent } from './constants';
import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { AppTypeEnum, ToolTypeList } from '../../../core/app/constants';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '../../../core/dataset/constants';
import { AgentSkillTypeEnum } from '../../../core/ai/skill/constants';

/** 审计日志中所有受管实体类型；按显式枚举判别，便于展示头像/图标与构造跳转链接。 */
export enum AuditResourceTypeEnum {
  app = 'app',
  tool = 'tool',
  appFolder = 'appFolder',
  toolFolder = 'toolFolder',
  dataset = 'dataset',
  datasetFolder = 'datasetFolder',
  collection = 'collection',
  collectionFolder = 'collectionFolder',
  skill = 'skill',
  skillFolder = 'skillFolder',
  member = 'member',
  department = 'department',
  group = 'group',
  team = 'team',
  apiKey = 'apiKey',
  enterprise = 'enterprise'
}

const ToolAppTypes = new Set<string>([...ToolTypeList, AppTypeEnum.httpPlugin, AppTypeEnum.tool]);

/** 根据应用/工具类型快照分类审计资源，统一区分应用、工具与两类文件夹。 */
export const classifyAppAuditResourceType = (
  appType?: AppTypeEnum | string
): AuditResourceTypeEnum => {
  if (appType === AppTypeEnum.folder) return AuditResourceTypeEnum.appFolder;
  if (appType === AppTypeEnum.toolFolder) return AuditResourceTypeEnum.toolFolder;
  if (appType && ToolAppTypes.has(appType)) return AuditResourceTypeEnum.tool;
  return AuditResourceTypeEnum.app;
};

/** 每项标识一个受操作实体，写入时记录名称/头像快照以便删除后依然可读且导出无需二次查库。 */
export const AuditResourceSchema = z
  .strictObject({
    type: z.enum(AuditResourceTypeEnum).meta({ description: '关联资源类型' }),
    id: z.string().trim().min(1).optional().meta({ description: '关联资源 ID' }),
    name: z.string().optional().meta({ description: '操作时的资源名称快照' }),
    avatar: z.string().optional().meta({ description: '资源头像或内置图标' }),
    parentId: ObjectIdSchema.optional().meta({
      description: '父级资源 ID（集合所属知识库 ID，用于构造详情页跳转）',
      example: '68ad85a7463006c963799a05'
    }),
    collectionType: z.enum(DatasetCollectionTypeEnum).optional().meta({
      description: '操作时的集合类型，用于区分目录跳转和文件图标',
      example: DatasetCollectionTypeEnum.file
    }),
    deleted: z.boolean().optional().meta({
      description: '资源是否已删除或不存在；已删除资源仅展示文本不跳转'
    })
  })
  .refine((item) => Boolean(item.id || item.name?.trim()), {
    message: 'Each audit resource must provide an id or a non-empty name'
  });
export type AuditResourceType = z.infer<typeof AuditResourceSchema>;
export const AuditResourcesSchema = z.array(AuditResourceSchema);

const toOptionalIdString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  if (!str) return undefined;
  return ObjectIdSchema.safeParse(str).success ? str.toLowerCase() : str;
};

const toOptionalText = (value?: string | null): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const toOptionalObjectIdString = (value: unknown): string | undefined => {
  const str = toOptionalIdString(value);
  return str && ObjectIdSchema.safeParse(str).success ? str : undefined;
};

/** 构造单条审计资源快照，统一剔除空字段并在应用/工具/目录间做精确分类。 */
export const buildAppAuditResource = (
  app: {
    _id?: unknown;
    id?: unknown;
    name?: string | null;
    avatar?: string | null;
    type?: AppTypeEnum | string;
  },
  options?: { deleted?: boolean }
): AuditResourceType => ({
  type: classifyAppAuditResourceType(app.type),
  ...(toOptionalIdString(app._id ?? app.id) ? { id: toOptionalIdString(app._id ?? app.id) } : {}),
  ...(toOptionalText(app.name) ? { name: toOptionalText(app.name) } : {}),
  ...(toOptionalText(app.avatar) ? { avatar: toOptionalText(app.avatar) } : {}),
  ...(options?.deleted ? { deleted: true } : {})
});

export const buildDatasetAuditResource = (
  dataset: {
    _id?: unknown;
    id?: unknown;
    name?: string | null;
    avatar?: string | null;
    type?: DatasetTypeEnum | string;
  },
  options?: { deleted?: boolean }
): AuditResourceType => ({
  type:
    dataset.type === DatasetTypeEnum.folder
      ? AuditResourceTypeEnum.datasetFolder
      : AuditResourceTypeEnum.dataset,
  ...(toOptionalIdString(dataset._id ?? dataset.id)
    ? { id: toOptionalIdString(dataset._id ?? dataset.id) }
    : {}),
  ...(toOptionalText(dataset.name) ? { name: toOptionalText(dataset.name) } : {}),
  ...(toOptionalText(dataset.avatar) ? { avatar: toOptionalText(dataset.avatar) } : {}),
  ...(options?.deleted ? { deleted: true } : {})
});

export const buildCollectionAuditResource = (
  collection: {
    _id?: unknown;
    id?: unknown;
    datasetId?: unknown;
    name?: string | null;
    type?: DatasetCollectionTypeEnum;
  },
  options?: { deleted?: boolean }
): AuditResourceType => {
  const parentId = toOptionalObjectIdString(collection.datasetId);
  return {
    type:
      collection.type === DatasetCollectionTypeEnum.folder
        ? AuditResourceTypeEnum.collectionFolder
        : AuditResourceTypeEnum.collection,
    ...(toOptionalIdString(collection._id ?? collection.id)
      ? { id: toOptionalIdString(collection._id ?? collection.id) }
      : {}),
    ...(toOptionalText(collection.name) ? { name: toOptionalText(collection.name) } : {}),
    ...(parentId ? { parentId } : {}),
    ...(collection.type ? { collectionType: collection.type } : {}),
    ...(options?.deleted ? { deleted: true } : {})
  };
};

export const buildSkillAuditResource = (
  skill: {
    _id?: unknown;
    id?: unknown;
    name?: string | null;
    avatar?: string | null;
    type?: AgentSkillTypeEnum | string;
  },
  options?: { deleted?: boolean }
): AuditResourceType => ({
  type:
    skill.type === AgentSkillTypeEnum.folder
      ? AuditResourceTypeEnum.skillFolder
      : AuditResourceTypeEnum.skill,
  ...(toOptionalIdString(skill._id ?? skill.id)
    ? { id: toOptionalIdString(skill._id ?? skill.id) }
    : {}),
  ...(toOptionalText(skill.name) ? { name: toOptionalText(skill.name) } : {}),
  ...(toOptionalText(skill.avatar) ? { avatar: toOptionalText(skill.avatar) } : {}),
  ...(options?.deleted ? { deleted: true } : {})
});

export const buildEntityAuditResource = ({
  type,
  id,
  name,
  avatar,
  deleted
}: {
  type: AuditResourceTypeEnum;
  id?: unknown;
  name?: string | null;
  avatar?: string | null;
  deleted?: boolean;
}): AuditResourceType | undefined => {
  const normalizedId = toOptionalIdString(id);
  const normalizedName = toOptionalText(name);
  if (!normalizedId && !normalizedName) return undefined;
  return {
    type,
    ...(normalizedId ? { id: normalizedId } : {}),
    ...(normalizedName ? { name: normalizedName } : {}),
    ...(toOptionalText(avatar) ? { avatar: toOptionalText(avatar) } : {}),
    ...(deleted ? { deleted: true } : {})
  };
};

/**
 * 兼容读取新结构化资源与历史仅存 `{ appId | datasetId | skillId | collectionId }` 的旧记录。
 */
export const normalizeStoredAuditResource = (raw: unknown): AuditResourceType | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;

  if (typeof record.type === 'string') {
    const candidate = {
      type: record.type,
      ...(toOptionalIdString(record.id) ? { id: toOptionalIdString(record.id) } : {}),
      ...(typeof record.name === 'string' && record.name ? { name: record.name } : {}),
      ...(typeof record.avatar === 'string' && record.avatar ? { avatar: record.avatar } : {}),
      ...(toOptionalIdString(record.parentId)
        ? { parentId: toOptionalIdString(record.parentId) }
        : {}),
      ...(typeof record.collectionType === 'string'
        ? { collectionType: record.collectionType }
        : {}),
      ...(typeof record.deleted === 'boolean' ? { deleted: record.deleted } : {})
    };
    const parsed = AuditResourceSchema.safeParse(candidate);
    return parsed.success ? parsed.data : undefined;
  }

  // 历史记录：collectionId 优先于 datasetId（集合可能同时携带所属 datasetId）。
  const collectionId = toOptionalIdString(record.collectionId);
  if (collectionId) {
    const collectionType =
      typeof record.collectionType === 'string' &&
      Object.values(DatasetCollectionTypeEnum).includes(
        record.collectionType as DatasetCollectionTypeEnum
      )
        ? (record.collectionType as DatasetCollectionTypeEnum)
        : undefined;
    const datasetId = toOptionalIdString(record.datasetId);
    const parsed = AuditResourceSchema.safeParse({
      type:
        collectionType === DatasetCollectionTypeEnum.folder
          ? AuditResourceTypeEnum.collectionFolder
          : AuditResourceTypeEnum.collection,
      id: collectionId,
      ...(datasetId ? { parentId: datasetId } : {}),
      ...(collectionType ? { collectionType } : {})
    });
    return parsed.success ? parsed.data : undefined;
  }

  const appId = toOptionalIdString(record.appId);
  if (appId) {
    const parsed = AuditResourceSchema.safeParse({
      type: classifyAppAuditResourceType(
        typeof record.appType === 'string' ? record.appType : undefined
      ),
      id: appId
    });
    return parsed.success ? parsed.data : undefined;
  }

  const skillId = toOptionalIdString(record.skillId);
  if (skillId) {
    const parsed = AuditResourceSchema.safeParse({
      type: AuditResourceTypeEnum.skill,
      id: skillId
    });
    return parsed.success ? parsed.data : undefined;
  }

  const datasetId = toOptionalIdString(record.datasetId);
  if (datasetId) {
    const parsed = AuditResourceSchema.safeParse({
      type: AuditResourceTypeEnum.dataset,
      id: datasetId
    });
    return parsed.success ? parsed.data : undefined;
  }

  return undefined;
};

export const normalizeStoredAuditResources = (raw: unknown): AuditResourceType[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((item) => normalizeStoredAuditResource(item))
    .filter((item): item is AuditResourceType => item !== undefined);
};

export type TeamAuditSchemaType = {
  _id: string;
  teamId: string;
  timestamp: Date;
  event: TeamAuditEvent;
  resources?: AuditResourceType[];
  metadata?: Record<string, string>;
} & (
  | {
      tmbId: string;
      scope?: 'member';
    }
  | {
      tmbId?: never;
      scope: 'system';
    }
);
export type TeamAuditListItemType = {
  _id: string;
  sourceMember: SourceMemberType;
  event: TeamAuditEvent;
  timestamp: Date;
  resources?: AuditResourceType[];
  metadata: Record<string, string>;
};
