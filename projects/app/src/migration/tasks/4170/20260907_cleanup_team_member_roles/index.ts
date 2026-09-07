import { z } from 'zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  cleanupTeamMemberRoleBatch,
  countRemainingTeamMemberRoles,
  getTeamMemberRoleSnapshotEnd,
  readTeamMemberRoleBatch,
  validateTeamMemberRoleSource
} from './service';

const CursorSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/)
  .nullable();
const CheckpointSchema = z
  .object({
    version: z.literal(1),
    endId: CursorSchema,
    lastId: CursorSchema,
    scannedCount: z.number().int().nonnegative()
  })
  .refine(({ endId, lastId }) => !lastId || (!!endId && lastId <= endId));

/**
 * 4.17.0 阻塞清理：历史 role 已退出权限计算，当前写入仅保留 owner 或缺失字段。
 * 按固定上界、ObjectId 游标分批断点续跑，内存上界为统一批大小；$unset 和批次重放幂等。
 * 旧节点可读取缺失 role，无需停机；若仍有旧写入产生非法角色，最终校验失败并停止启动。
 * 不依赖前序非阻塞回填成功。异常直接交给 Runner，不访问阻塞任务禁用的失败明细接口。
 */
export const cleanupTeamMemberRoles = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'members', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  await validateTeamMemberRoleSource();
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    checkpoint = {
      version: 1,
      endId: await getTeamMemberRoleSnapshotEnd(),
      lastId: null,
      scannedCount: 0
    };
    await context.saveCheckpoint(checkpoint);
  }

  while (checkpoint.endId && checkpoint.lastId !== checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const records = await readTeamMemberRoleBatch({
      lastId: checkpoint.lastId,
      endId: checkpoint.endId,
      limit: systemMigrationBatchSize
    });
    if (!records.length) break;

    await context.assertActive();
    await cleanupTeamMemberRoleBatch({ ids: records.map(({ _id }) => _id) });
    await context.assertActive();
    checkpoint = {
      ...checkpoint,
      lastId: String(records.at(-1)!._id),
      scannedCount: checkpoint.scannedCount + records.length
    };
    // 批次事务提交并校验后才保存断点；失权或保存失败时，接管者安全重放。
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'members',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scannedCount
    });
  }
  await context.reportProgress({
    key: 'members',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.scannedCount
  });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  const remaining = await countRemainingTeamMemberRoles();
  if (remaining) {
    context.logger.error('Legacy team member roles remain after cleanup', { remaining });
    throw new Error(`${remaining} legacy team member roles remain after cleanup`);
  }
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return { scannedCount: checkpoint.scannedCount, remaining };
};
