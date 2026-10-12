import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  backfillSandboxInstanceTeamId,
  findSandboxInstanceBySource
} from '../infrastructure/instance/repository';
import { resolveSandboxSourceTeamId } from './sourceGuard';

/**
 * 在运行入口确定团队归属，并补齐历史实例；返回值供配额、新建和恢复流程直接使用。
 * source 是归属真值，已有归属冲突时拒绝使用。回填失败原样抛出，禁止带着缺失归属激活。
 * 使用实例当前 provider 回填，兼容激活前尚未完成的 provider 迁移。
 */
export async function ensureSandboxTeamOwnership(params: {
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
}) {
  const teamId = await resolveSandboxSourceTeamId(params);
  if (!teamId) {
    throw new Error(`Sandbox source has no teamId: ${params.sourceType}/${params.sourceId}`);
  }

  const current = await findSandboxInstanceBySource(params);
  if (!current) return { teamId, resource: null };
  if (current.sandboxId !== params.sandboxId) {
    throw new Error(`Sandbox identity does not match source: ${params.sandboxId}`);
  }
  if (current.teamId) {
    if (current.teamId !== teamId) {
      throw new Error(`Sandbox team ownership mismatch: ${params.sandboxId}`);
    }
    return { teamId, resource: { ...current, teamId } };
  }

  const result = await backfillSandboxInstanceTeamId({
    provider: current.provider,
    sandboxId: current.sandboxId,
    teamId
  });
  if (result.matchedCount === 1) return { teamId, resource: { ...current, teamId } };

  // 并发回填可能已先完成；重新确认持久化结果，不能把未命中更新当成补齐成功。
  const updated = await findSandboxInstanceBySource(params);
  if (updated?.sandboxId !== params.sandboxId || updated.teamId !== teamId) {
    throw new Error(`Sandbox team ownership was not persisted: ${params.sandboxId}`);
  }
  return { teamId, resource: updated };
}
