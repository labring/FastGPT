import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { MongoTeamAudit } from './schema';
import { getLogger, LogCategories } from '../../../common/logger';
import {
  AUDIT_DETAILS_MAX_COUNT,
  type AdminAuditEventEnum,
  type AuditEventEnum,
  type AdminAuditEventParamsType,
  type AuditEventParamsType
} from '@fastgpt/global/support/user/audit/constants';
import {
  TeamAuditDetailSchema,
  type TeamAuditDetail,
  type TeamAuditMetadataValue
} from '@fastgpt/global/support/user/audit/type';
import { retryFn } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.INFRA.MONGO);

export type AuditLogInput = {
  teamId: string;
  event: AuditEventEnum | AdminAuditEventEnum;
  params?: Record<string, unknown>;
} & (
  | {
      scope?: 'member';
      tmbId: string;
    }
  | {
      scope: 'system';
      tmbId?: never;
    }
);

export function getI18nAppType(type: AppTypeEnum): string {
  if (type === AppTypeEnum.folder) return i18nT('account_team:type.Folder');
  if (type === AppTypeEnum.simple) return i18nT('app:type.Chat_Agent');
  if (type === AppTypeEnum.chatAgent) return 'Agent';
  if (type === AppTypeEnum.workflow) return i18nT('account_team:type.Workflow bot');
  if (type === AppTypeEnum.workflowTool) return i18nT('app:toolType_workflow');
  if (type === AppTypeEnum.httpPlugin) return i18nT('account_team:type.Http plugin');
  if (type === AppTypeEnum.httpToolSet) return i18nT('app:toolType_http');
  if (type === AppTypeEnum.mcpToolSet) return i18nT('app:toolType_mcp');
  if (type === AppTypeEnum.tool) return i18nT('app:toolType_mcp');
  return i18nT('common:UnKnow');
}

export function getI18nCollaboratorItemType(
  tmbId: string | undefined,
  groupId: string | undefined,
  orgId: string | undefined
): string {
  if (tmbId) return i18nT('account_team:member');
  if (groupId) return i18nT('account_team:group');
  if (orgId) return i18nT('account_team:department');
  return i18nT('common:UnKnow');
}

export function getI18nDatasetType(type: DatasetTypeEnum | string): string {
  if (type === DatasetTypeEnum.folder) return i18nT('account_team:dataset.folder_dataset');
  if (type === DatasetTypeEnum.dataset) return i18nT('account_team:dataset.common_dataset');
  if (type === DatasetTypeEnum.websiteDataset) return i18nT('account_team:dataset.website_dataset');
  if (type === DatasetTypeEnum.externalFile) return i18nT('account_team:dataset.external_file');
  if (type === DatasetTypeEnum.apiDataset) return i18nT('account_team:dataset.api_file');
  if (type === DatasetTypeEnum.feishu) return i18nT('account_team:dataset.feishu_dataset');
  if (type === DatasetTypeEnum.yuque) return i18nT('account_team:dataset.yuque_dataset');
  if (type === DatasetTypeEnum.dingtalk) return i18nT('account_team:dataset.dingtalk_dataset');
  return i18nT('common:UnKnow');
}

export function getI18nSkillType(type: AgentSkillTypeEnum | string): string {
  if (type === AgentSkillTypeEnum.folder) return i18nT('account_team:skill.folder');
  if (type === AgentSkillTypeEnum.skill) return i18nT('account_team:skill.skill');
  return i18nT('common:UnKnow');
}

/** 返回权限继承审计使用的顶层资源类型 i18n key，避免统一事件把 App 和 Skill 展示成 Dataset。 */
export function getI18nAuditResourceType(type: 'app' | 'dataset' | 'skill'): string {
  return i18nT(`account_team:resource_type.${type}`);
}

export function getI18nInformLevel(level: string): string {
  if (level === 'common') return i18nT('account_team:inform_level_common');
  if (level === 'important') return i18nT('account_team:inform_level_important');
  if (level === 'emergency') return i18nT('account_team:inform_level_emergency');
  return i18nT('common:UnKnow');
}

/**
 * 校验执行主体与 tmbId 的组合是否自洽，返回错误文案而不是抛异常。
 *
 * 不抛异常的原因：addAuditLog 对外承诺“调用方无需等待或捕获异常”（内部重试并吞错），
 * 而参数不合法属于确定性错误，重试没有意义；因此丢弃事件并记错误日志，
 * 既不阻塞业务，也不会把审计异常泄露到业务调用栈。返回值仅用于需要确认旁路是否落库的调用方，
 * 普通调用方可以继续忽略。
 * 不查库校验 tmbId 归属的原因：调用方的 tmbId 均来自 parseHeaderCert 鉴权层，
 * 已绑定到当前 teamId；审计写入是高频旁路路径（全仓库上百个调用点，含数据块增删改），
 * 不应为此每次多一次 Mongo 往返。
 */
const getAuditActorError = ({ tmbId, scope }: { tmbId?: string; scope: 'member' | 'system' }) => {
  if (scope === 'system') {
    return tmbId ? 'System audit events must not include tmbId' : undefined;
  }
  return tmbId ? undefined : 'Member audit events require tmbId';
};

type AuditMetadata = {
  [key: string]: unknown;
  details?: TeamAuditDetail[];
  detailsTruncated?: boolean;
};

/** 校验动态 metadata 中的明细项，避免把不可信数据当作 TeamAuditDetail 使用。 */
const isTeamAuditDetail = (value: unknown): value is TeamAuditDetail =>
  TeamAuditDetailSchema.safeParse(value).success;

/**
 * 单条审计文档保留的处理明细上限。
 * 批量导入、全量重建、网站同步等场景可能涉及上万对象，明细全量写入会超过 Mongo
 * 16MB 单文档上限；数量类字段（count / successCount / failedCount）不受影响，始终保留完整值。
 * 截断过长的 details 时会标记 detailsTruncated 供消费方识别。
 */
const capAuditDetails = (params: AuditMetadata): AuditMetadata => {
  const details = params.details;
  if (!details || details.length <= AUDIT_DETAILS_MAX_COUNT) return params;

  return {
    ...params,
    details: details.slice(0, AUDIT_DETAILS_MAX_COUNT),
    detailsTruncated: true
  };
};

/**
 * 落库前规范化 metadata：仅保留通过 schema 校验的 details，再统一截断过长明细，避免单条 Mongo 文档超过 16MB。
 * 其他事件字段保持 unknown，避免为了兼容不同事件而使用 any 或不安全断言。
 */
const buildAuditMetadata = (params?: Record<string, unknown>): AuditMetadata | undefined => {
  if (!params) return undefined;

  const { details: rawDetails, detailsTruncated: rawDetailsTruncated, ...metadata } = params;
  const detailsTruncated =
    typeof rawDetailsTruncated === 'boolean' ? rawDetailsTruncated : undefined;
  const metadataWithoutDetails = {
    ...metadata,
    ...(detailsTruncated === undefined ? {} : { detailsTruncated })
  };

  if (!Array.isArray(rawDetails)) return metadataWithoutDetails;

  const details: TeamAuditDetail[] = rawDetails.filter(isTeamAuditDetail);
  return capAuditDetails({
    ...metadataWithoutDetails,
    details,
    ...(details.length !== rawDetails.length ? { detailsTruncated: true } : {})
  });
};

/** 写入单条审计；调用方根据业务一致性要求决定等待或显式处理失败。 */
export function addAuditLog<T extends AuditEventEnum>({
  teamId,
  tmbId,
  scope,
  event,
  params
}: {
  tmbId: string;
  teamId: string;
  scope?: 'member';
  event: T;
  params?: AuditEventParamsType[T];
}): Promise<boolean>;

export function addAuditLog<T extends AdminAuditEventEnum>({
  teamId,
  tmbId,
  scope,
  event,
  params
}: {
  tmbId: string;
  teamId: string;
  scope?: 'member';
  event: T;
  params?: AdminAuditEventParamsType[T];
}): Promise<boolean>;

export function addAuditLog<T extends AuditEventEnum | AdminAuditEventEnum>({
  teamId,
  scope,
  event,
  params
}: {
  teamId: string;
  scope: 'system';
  tmbId?: never;
  event: T;
  params?: Record<string, unknown>;
}): Promise<boolean>;

export function addAuditLog<T extends AuditEventEnum | AdminAuditEventEnum>({
  teamId,
  tmbId,
  scope = 'member',
  event,
  params
}: AuditLogInput & { event: T }): Promise<boolean> {
  const actorError = getAuditActorError({ tmbId, scope });
  if (actorError) {
    logger.error('Audit log actor invalid, event dropped', {
      error: actorError,
      teamId,
      tmbId,
      scope,
      event
    });
    return Promise.resolve(false);
  }

  return retryFn(async () => {
    await MongoTeamAudit.create({
      ...(scope === 'member' ? { tmbId } : {}),
      teamId,
      scope,
      event,
      metadata: buildAuditMetadata(params)
    });
    return true;
  }).catch((error) => {
    // 审计是旁路记录：写入失败只记日志，不把异常抛回业务调用方；false 供少数调用方决定是否跳过后续更新。
    logger.error('Audit log write failed', { error, teamId, tmbId, event });
    return false;
  });
}

/**
 * 幂等创建带 taskId 的任务型审计。
 *
 * 这是通用持久化能力：调用方显式传入事件类型，工具层不绑定任何具体业务事件；并发创建时
 * 由唯一索引和 `$setOnInsert` 保证同一 team/scope/event/taskId 只保留一条主记录。
 */
export const upsertAuditLogByTaskId = async ({
  teamId,
  tmbId,
  scope = 'member',
  event,
  taskId,
  params
}: AuditLogInput & {
  event: AuditEventEnum;
  taskId: string;
  params?: Record<string, unknown>;
}): Promise<boolean> => {
  const actorError = getAuditActorError({ tmbId, scope });
  if (actorError) {
    logger.error('Audit log actor invalid, event dropped', {
      error: actorError,
      teamId,
      tmbId,
      scope,
      event
    });
    return false;
  }

  try {
    await retryFn(async () => {
      await MongoTeamAudit.updateOne(
        { teamId, scope, event, 'metadata.taskId': taskId },
        {
          $setOnInsert: {
            ...(scope === 'member' ? { tmbId } : {}),
            teamId,
            scope,
            event,
            metadata: buildAuditMetadata({ ...(params ?? {}), taskId }),
            timestamp: new Date()
          }
        },
        { upsert: true }
      );
    });
    return true;
  } catch (error) {
    logger.error('Audit task upsert failed', { error, teamId, taskId, scope, event });
    return false;
  }
};

/**
 * 判断指定团队、执行范围、事件和 taskId 下的任务审计是否已经创建。
 * 查询失败时按“未创建”返回，由调用方继续走补建路径；查询异常不会阻塞业务任务本身。
 */
export const hasAuditLogByTaskId = async ({
  teamId,
  taskId,
  scope,
  event
}: {
  teamId: string;
  taskId: string;
  scope: 'member' | 'system';
  event: AuditEventEnum;
}): Promise<boolean> => {
  try {
    return await retryFn(async () =>
      Boolean(
        await MongoTeamAudit.exists({
          teamId,
          scope,
          event,
          'metadata.taskId': taskId
        })
      )
    );
  } catch (error) {
    logger.error('Audit task lookup failed', { teamId, taskId, scope, event, error });
    return false;
  }
};

/**
 * 更新指定任务型审计的状态和附加 metadata。
 *
 * 通过 team、scope、event 和 taskId 精确定位记录，Mongo 更新失败会按统一策略重试；
 * 找不到任务或重试耗尽时向调用方抛出，由调用方决定是否记录并吞掉异常。
 *
 * 传入 expectedResult 时，会把当前结果一起放进更新条件，借助 Mongo 的单条原子更新
 * 实现状态转换的 compare-and-set：延迟到达的 bind、失败或收口操作不能覆盖已经落库的终态。
 */
export const updateAuditLogByTaskId = async ({
  teamId,
  taskId,
  scope,
  event,
  result,
  expectedResult,
  metadata
}: {
  teamId: string;
  taskId: string;
  scope: 'member' | 'system';
  event: AuditEventEnum;
  result: string;
  expectedResult?: string;
  metadata?: Record<string, TeamAuditMetadataValue>;
}): Promise<void> => {
  await retryFn(async () => {
    const updateResult = await MongoTeamAudit.updateOne(
      {
        teamId,
        scope,
        event,
        'metadata.taskId': taskId,
        ...(expectedResult !== undefined ? { 'metadata.result': expectedResult } : {})
      },
      {
        $set: {
          'metadata.result': result,
          // 与首次写入口径一致：任务态事件的后续更新同样要截断明细
          ...Object.fromEntries(
            Object.entries(buildAuditMetadata(metadata) ?? {}).map(([key, value]) => [
              `metadata.${key}`,
              value
            ])
          )
        }
      }
    );
    if (updateResult.matchedCount !== 1) {
      throw new Error(`Audit task not found: ${taskId}`);
    }
  });
};

/** 将任务事件及仍在处理的逐项明细统一标记为失败。 */
export const failAuditLogByTaskId = async ({
  teamId,
  taskId,
  scope,
  event,
  failureReason
}: {
  teamId: string;
  taskId: string;
  scope: 'member' | 'system';
  event: AuditEventEnum;
  failureReason: string;
}): Promise<void> => {
  const audit = await retryFn(() =>
    MongoTeamAudit.findOne(
      { teamId, scope, event, 'metadata.taskId': taskId },
      'metadata.details metadata.detailsTruncated metadata.count metadata.insertLen'
    ).lean()
  );
  if (!audit) throw new Error(`Audit task not found: ${taskId}`);

  const rawDetails = audit.metadata?.details;
  // 完整校验后再访问 result，避免不可信数据被强制断言成业务类型。
  const details = (() => {
    if (!Array.isArray(rawDetails)) return undefined;

    const validDetails = rawDetails.filter(isTeamAuditDetail);
    if (validDetails.length !== rawDetails.length) return undefined;

    return validDetails.map((detail) => ({
      ...detail,
      ...(detail.result === 'processing' ? { result: 'failed', failureReason } : {})
    }));
  })();

  const getNonNegativeInteger = (value: unknown) => {
    if (typeof value !== 'number' && typeof value !== 'string') return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;

    const count = Number(value);
    return Number.isInteger(count) && count >= 0 ? count : undefined;
  };
  const expectedCount =
    getNonNegativeInteger(audit.metadata?.count) ??
    getNonNegativeInteger(audit.metadata?.insertLen);
  const failedDetailCount = details?.filter((detail) => detail.result === 'failed').length ?? 0;
  // 明细可能未保存，或已经因文档大小限制被截断；此时用业务总处理量补足失败数量，
  // 不能把当前可见的明细条数当成完整失败数。兼容旧记录时也用总量大于明细数识别截断。
  const detailsIncomplete =
    !details ||
    details.length === 0 ||
    audit.metadata?.detailsTruncated === true ||
    (expectedCount !== undefined && details.length < expectedCount);
  const failedCount =
    detailsIncomplete && expectedCount !== undefined
      ? Math.max(expectedCount, failedDetailCount, 1)
      : Math.max(failedDetailCount, 1);

  await updateAuditLogByTaskId({
    teamId,
    taskId,
    scope,
    event,
    result: 'failed',
    expectedResult: 'processing',
    metadata: {
      failureReason,
      successCount: '0',
      failedCount: String(failedCount),
      ...(details ? { details } : {})
    }
  });
};

/** 批量写入审计日志，保留每个变更对象一条日志的展示粒度。 */
export const addAuditLogs = async (logs: AuditLogInput[]): Promise<void> => {
  if (logs.length === 0) return;

  // 逐条校验执行主体：任一条不合法就丢弃整批，避免部分写入后无法区分哪些对象已记录
  const invalidEntry = logs
    .map((log) => ({
      log,
      error: getAuditActorError({ tmbId: log.tmbId, scope: log.scope ?? 'member' })
    }))
    .find((entry) => entry.error);
  if (invalidEntry?.error) {
    logger.error('Batch audit log actor invalid, events dropped', {
      error: invalidEntry.error,
      count: logs.length,
      teamId: invalidEntry.log.teamId,
      event: invalidEntry.log.event
    });
    return;
  }

  try {
    await retryFn(async () => {
      await MongoTeamAudit.insertMany(
        logs.map((log) => {
          const scope = log.scope ?? 'member';
          return {
            ...(scope === 'member' ? { tmbId: log.tmbId } : {}),
            teamId: log.teamId,
            scope,
            event: log.event,
            metadata: buildAuditMetadata(log.params)
          };
        }),
        { ordered: true }
      );
    });
  } catch (error) {
    logger.error('Batch audit log write failed', { error, count: logs.length });
  }
};
