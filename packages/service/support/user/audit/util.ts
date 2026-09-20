import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { MongoTeamAudit } from './schema';
import { getLogger, LogCategories } from '../../../common/logger';
import type {
  AdminAuditEventEnum,
  AuditEventEnum,
  AdminAuditEventParamsType,
  AuditEventParamsType
} from '@fastgpt/global/support/user/audit/constants';
import type {
  TeamAuditDetail,
  TeamAuditMetadataValue
} from '@fastgpt/global/support/user/audit/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';
import type { localeType } from '@fastgpt/global/common/i18n/type';

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

/** 审计快照不得持久化团队成员名内部保留值，递归处理事件中的数组和普通对象。 */
const sanitizeAuditMetadata = (value: unknown): unknown => {
  if (value === UNSET_TEAM_MEMBER_NAME) return '';
  if (Array.isArray(value)) return value.map(sanitizeAuditMetadata);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeAuditMetadata(item)])
    );
  }
  return value;
};

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
 * 既不阻塞业务，也不会把审计异常泄露到业务调用栈。
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

/**
 * 系统执行主体（scope=system）的展示名，按请求语言返回本地化文案。
 *
 * 不用 i18n key 的原因：团队审计页的执行主体列直接渲染 sourceMember.name，
 * 不像 metadata 那样会走 i18n key 翻译分支，返回 key 会原样显示给用户；
 * 而本需求不改动任何前端代码，因此只能在服务端按请求语言给出文案。
 * 译法与前端 account_team 命名空间的既有习惯保持一致，新增语言时需同步补充。
 */
const systemAuditActorNames: Record<localeType, string> = {
  en: 'System task',
  'zh-CN': '系统任务',
  'zh-Hant': '系統任務',
  'ko-KR': '시스템 작업'
};
export const getSystemAuditActorName = (locale: localeType) => systemAuditActorNames[locale];

/**
 * 单条审计文档保留的处理明细上限。
 * 批量导入、全量重建、网站同步等场景可能涉及上万对象，明细全量写入会超过 Mongo
 * 16MB 单文档上限；数量类字段（count / successCount / failedCount）不受影响，始终保留完整值。
 */
const MAX_AUDIT_DETAILS = 200;

/** 截断过长的 details，并在发生截断时标记 detailsTruncated 供消费方识别。 */
const capAuditDetails = <T extends Record<string, any> | undefined>(params?: T) => {
  const details = params?.details;
  if (!Array.isArray(details) || details.length <= MAX_AUDIT_DETAILS) return params;

  return {
    ...params,
    details: details.slice(0, MAX_AUDIT_DETAILS),
    detailsTruncated: true
  };
};

/**
 * 落库前统一处理 metadata：先按上限截断 details（防单文档超过 Mongo 16MB），
 * 再清洗团队成员名哨兵值（防内部保留值泄露到审计快照）。
 * 顺序不可颠倒：截断会展开出新对象，清洗必须作用在最终落库的结构上。
 */
const buildAuditMetadata = <T extends Record<string, any> | undefined>(params?: T) =>
  sanitizeAuditMetadata(capAuditDetails(params)) as T;

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
}): Promise<void>;

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
}): Promise<void>;

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
}): Promise<void>;

export function addAuditLog<T extends AuditEventEnum | AdminAuditEventEnum>({
  teamId,
  tmbId,
  scope = 'member',
  event,
  params
}: AuditLogInput & { event: T; params?: any }): Promise<void> {
  const actorError = getAuditActorError({ tmbId, scope });
  if (actorError) {
    logger.error('Audit log actor invalid, event dropped', {
      error: actorError,
      teamId,
      tmbId,
      scope,
      event
    });
    return Promise.resolve();
  }

  return retryFn(async () => {
    const metadata = buildAuditMetadata(params);
    const taskId = params && typeof params.taskId === 'string' ? params.taskId : undefined;
    if (event === 'SYNC_DATASET' && taskId) {
      await MongoTeamAudit.updateOne(
        { teamId, scope, event, 'metadata.taskId': taskId },
        {
          $setOnInsert: {
            ...(scope === 'member' ? { tmbId } : {}),
            teamId,
            scope,
            event,
            metadata,
            timestamp: new Date()
          }
        },
        { upsert: true }
      );
      return;
    }
    await MongoTeamAudit.create({
      ...(scope === 'member' ? { tmbId } : {}),
      teamId,
      scope,
      event,
      metadata
    });
  }).catch((error) => {
    // 审计是旁路记录：写入失败只记日志，不把异常抛回业务调用方
    logger.error('Audit log write failed', { error, teamId, tmbId, event });
  });
}

export const hasAuditLogByTaskId = async ({
  teamId,
  taskId,
  scope
}: {
  teamId: string;
  taskId: string;
  scope: 'member' | 'system';
}): Promise<boolean> => {
  try {
    return await retryFn(async () =>
      Boolean(
        await MongoTeamAudit.exists({
          teamId,
          scope,
          event: 'SYNC_DATASET',
          'metadata.taskId': taskId
        })
      )
    );
  } catch (error) {
    logger.error('Dataset sync audit lookup failed', { teamId, taskId, scope, error });
    return false;
  }
};

export const updateAuditLogByTaskId = async ({
  teamId,
  taskId,
  scope,
  event,
  result,
  metadata
}: {
  teamId: string;
  taskId: string;
  scope: 'member' | 'system';
  event: AuditEventEnum;
  result: string;
  metadata?: Record<string, TeamAuditMetadataValue>;
}): Promise<void> => {
  await retryFn(async () => {
    const updateResult = await MongoTeamAudit.updateOne(
      { teamId, scope, event, 'metadata.taskId': taskId },
      {
        $set: {
          'metadata.result': result,
          // 与首次写入口径一致：任务态事件的后续更新同样要截断明细并清洗成员名哨兵值
          ...Object.fromEntries(
            Object.entries(capAuditDetails(metadata) ?? {}).map(([key, value]) => [
              `metadata.${key}`,
              sanitizeAuditMetadata(value)
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
      'metadata.details'
    ).lean()
  );
  if (!audit) throw new Error(`Audit task not found: ${taskId}`);

  const rawDetails = audit.metadata?.details;
  const details =
    Array.isArray(rawDetails) &&
    rawDetails.every((detail) => typeof detail === 'object' && detail !== null)
      ? rawDetails.map((detail) => ({
          ...(detail as TeamAuditDetail),
          ...(detail.result === 'processing' ? { result: 'failed', failureReason } : {})
        }))
      : undefined;

  await updateAuditLogByTaskId({
    teamId,
    taskId,
    scope,
    event,
    result: 'failed',
    metadata: {
      failureReason,
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
