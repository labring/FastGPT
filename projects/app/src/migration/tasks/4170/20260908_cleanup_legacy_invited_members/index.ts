import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { cleanupLegacyInvitedMemberRecords, countLegacyInvitedMembers } from './service';

/**
 * 4.17.0 非阻塞清理：小数据集全量重跑，不读写 checkpoint。
 * waiting/reject 自 4.9.1 起弃用，当前滚动升级节点不再产生这些状态。
 * 事务提交后崩溃可安全重跑；受保护成员保留并报告失败，由管理员修复后重试。
 * 不删除 users、业务资源或历史版本，也不生成额外备份。
 */
export const cleanupLegacyInvitedMembers = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'cleanup', status: SystemMigrationStatusEnum.running });
  const assertActive = async () => {
    context.signal.throwIfAborted();
    await context.assertActive();
  };
  const { counts, failedRecords } = await cleanupLegacyInvitedMemberRecords(assertActive);
  await assertActive();
  // 全量扫描覆盖历史失败记录，直接替换完整快照，无需 checkpoint 或历史错误驱动。
  await context.reportFailedRecords(failedRecords);
  if (failedRecords.length) {
    await context.fail({
      message: `${failedRecords.length} protected legacy invited members require manual review`,
      failedRecords
    });
  }
  await context.reportProgress({
    key: 'cleanup',
    status: SystemMigrationStatusEnum.succeeded,
    params: counts
  });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await assertActive();
  const remaining = await countLegacyInvitedMembers();
  if (remaining) throw new Error(`${remaining} legacy invited members remain after cleanup`);
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return counts;
};
