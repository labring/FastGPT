/** Sandbox source 存活校验，作为 provisioning 与删除之间的持久 fence。 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoApp } from '../../../app/schema';
import { MongoAgentSkills } from '../../skill/model/schema';

/** 业务 source 不存在或已软删除；调用方可据此决定是否显式跳过遗留资源。 */
export class SandboxSourceMissingError extends Error {
  constructor(params: { sourceType: ChatSourceTypeEnum; sourceId: string }) {
    super(`Sandbox source is missing or deleted: ${params.sourceType}/${params.sourceId}`);
    this.name = 'SandboxSourceMissingError';
  }
}

/** source 不存在或已经设置 deleteTime 时禁止创建、恢复或迁移 Sandbox。 */
export async function assertSandboxSourceActive(params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
}) {
  await resolveSandboxSourceTeamId(params);
}

/**
 * 校验 source 存活并解析其团队归属：一次投影查询同时完成持久 fence 与 teamId 解析。
 *
 * source 缺失或软删除时抛 SandboxSourceMissingError；source 存在但缺少 teamId
 * （历史脏数据）时返回 undefined，由调用方按“只计系统总量、不计入任何团队”处理。
 */
export async function resolveSandboxSourceTeamId(params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
}): Promise<string | undefined> {
  const doc = await (async () => {
    if (params.sourceType === ChatSourceTypeEnum.app) {
      return MongoApp.findOne({ _id: params.sourceId, deleteTime: null }, { teamId: 1 }).lean();
    }
    if (params.sourceType === ChatSourceTypeEnum.skillEdit) {
      return MongoAgentSkills.findOne(
        { _id: params.sourceId, deleteTime: null },
        { teamId: 1 }
      ).lean();
    }
    return null;
  })();

  if (!doc) {
    throw new SandboxSourceMissingError(params);
  }
  return doc.teamId ? String(doc.teamId) : undefined;
}

/** Source 删除任务只能清理已经由主业务事务标记为删除的资源。 */
export async function assertSandboxSourceDeleted(params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
}) {
  const deleted = await (async () => {
    if (params.sourceType === ChatSourceTypeEnum.app) {
      return MongoApp.exists({ _id: params.sourceId, deleteTime: { $ne: null } });
    }
    if (params.sourceType === ChatSourceTypeEnum.skillEdit) {
      return MongoAgentSkills.exists({ _id: params.sourceId, deleteTime: { $ne: null } });
    }
    return null;
  })();

  if (!deleted) {
    throw new Error(
      `Sandbox source is not marked for deletion: ${params.sourceType}/${params.sourceId}`
    );
  }
}
