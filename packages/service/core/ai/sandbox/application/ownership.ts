import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { findSandboxInstanceBySource } from '../infrastructure/instance/repository';
import { assertNoUnmigratedLegacySandbox } from '../legacy/v2MigrationGate';
import { resolveSandboxSourceTeamId } from './sourceGuard';

/**
 * 在运行入口校验业务源与沙盒实例的团队归属；返回值供配额、新建和唤醒流程使用。
 *
 * `agent_sandbox_instances_v3` 中 `teamId` 为必填字段；source 是归属真值，已有归属缺失或不一致时拒绝激活。
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
  if (!current) {
    await assertNoUnmigratedLegacySandbox(params);
    return { teamId, resource: null };
  }
  if (current.sandboxId !== params.sandboxId) {
    throw new Error(`Sandbox identity does not match source: ${params.sandboxId}`);
  }
  if (!current.teamId || current.teamId !== teamId) {
    throw new Error(`Sandbox team ownership mismatch: ${params.sandboxId}`);
  }
  return { teamId, resource: current };
}
