import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '../../registry';
import {
  cleanupInstanceConfigDeprecatedFields,
  verifyInstanceConfigDeprecatedFields
} from './service';

/**
 * 清理 system_instance_configs 中已从 Schema 移除的废弃 overrides 字段。
 *
 * 采用「幂等全量重跑」：集合最多 11 条 Domain 文档，规模与耗时都有上界，
 * 每次执行都重新读取并确定性覆盖，因此不保存 checkpoint，重复执行不会产生副作用。
 * 残留字段会让 strictObject 校验失败，故必须在节点 ready 前阻塞清理。
 */
export const cleanupInstanceConfigDeprecatedFieldsTask = async (
  context: SystemMigrationContext
) => {
  await context.reportProgress({
    key: 'cleanup',
    status: SystemMigrationStatusEnum.running
  });

  await context.assertActive();

  const result = await cleanupInstanceConfigDeprecatedFields({ logger: context.logger });

  await context.reportProgress({
    key: 'cleanup',
    status: SystemMigrationStatusEnum.succeeded,
    current: result.updatedDomains.length,
    total: result.scannedDocuments
  });

  await context.assertActive();

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.running
  });

  const verification = await verifyInstanceConfigDeprecatedFields();

  // 完成条件：不得残留废弃字段，且所有 Domain 都能按新 Schema 解析
  if (verification.remainingDocuments.length > 0 || verification.invalidDomains.length > 0) {
    throw new Error(
      `Instance config cleanup verification failed: remaining=[${verification.remainingDocuments.join(
        ','
      )}] invalid=[${verification.invalidDomains.join(',')}]`
    );
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    scannedDocuments: verification.scannedDocuments,
    updatedDomains: result.updatedDomains.length,
    removedFieldCount: result.removedFieldCount
  };
};
