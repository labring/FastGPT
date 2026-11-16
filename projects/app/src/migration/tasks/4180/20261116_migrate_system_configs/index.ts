import { migrateLegacyConfigScopes, verifyLegacyConfigScopes } from './scopes';
import { SYSTEM_INSTANCE_CONFIG_DOMAINS } from '@fastgpt/global/common/system/config/schema';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '../../../registry';
import {
  applyInstanceConfigMigration,
  inspectInstanceConfigMigration,
  type SchemaSanitizedIssue
} from './service';
import {
  cleanupInstanceConfigDeprecatedFields,
  verifyInstanceConfigDeprecatedFields
} from './cleanup';
import {
  backfillExternalFileCheck,
  verifyExternalFileCheck,
  backfillModelDeprecationSms,
  verifyModelDeprecationSms,
  rehomeFileDomain,
  verifyFileDomainMigration,
  rehomeHttpRuntimePolicies,
  verifyHttpRuntimePolicyMigration,
  restoreCustomDomainConfig,
  verifyCustomDomainConfig
} from './backfill';
import {
  rehomeSubserviceConnections,
  verifyRehomedSubserviceConnections,
  rehomeAgentSandboxProxy,
  verifyAgentSandboxProxyMigration,
  rehomeSandboxOvercommit,
  verifySandboxOvercommitMigration
} from './subservices';
import { encryptStoredConfigSecrets, verifyStoredConfigSecrets } from './secrets';

const MAX_SKIPPED_PATHS_TEXT_LENGTH = 1000;

/**
 * 汇总迁移时被跳过或需要人工处理的配置项。
 * 只拼接路径/变量名，不包含配置值，避免密钥进入迁移结果和页面。
 */
const buildSkippedConfigSummary = ({
  schemaSanitizedIssues,
  backfillSkippedPaths,
  envRehomedWarnings
}: {
  schemaSanitizedIssues: SchemaSanitizedIssue[];
  backfillSkippedPaths?: string[];
  envRehomedWarnings: string[];
}) => {
  const paths = Array.from(
    new Set([
      ...schemaSanitizedIssues.map((issue) =>
        issue.path ? `${issue.domain}.${issue.path}` : `${issue.domain}.*`
      ),
      ...(backfillSkippedPaths ?? []),
      ...envRehomedWarnings.map((warning) => `ENV: ${warning}`)
    ])
  );

  const domains = new Set<string>();
  for (const issue of schemaSanitizedIssues) domains.add(issue.domain);
  for (const path of backfillSkippedPaths ?? []) {
    const domain = path.split('.')[0];
    if (domain) domains.add(domain);
  }

  const joinedPaths = paths.join(', ');
  const skippedPaths =
    joinedPaths.length > MAX_SKIPPED_PATHS_TEXT_LENGTH
      ? `${joinedPaths.slice(0, MAX_SKIPPED_PATHS_TEXT_LENGTH - 3)}...`
      : joinedPaths;

  return {
    skippedConfigCount: paths.length,
    skippedDomainCount: domains.size,
    skippedPaths
  };
};

/**
 * 系统配置迁移的唯一入口：导入旧配置、清理废弃字段并补齐全部受管配置。
 * 采用幂等全量重跑，无 checkpoint；失败后重新检查与补缺，保留管理员值和显式清空。
 * 空集合首次初始化承接 App defaultConfig.json；后台独立执行，不阻塞业务启动。
 * 任务成功后由 Runner 永久跳过，后续启动不再导入旧 ENV 或文件。
 */
export const migrateSystemConfigs = async (context: SystemMigrationContext) => {
  await context.reportProgress({
    key: 'inspect',
    status: SystemMigrationStatusEnum.running
  });

  const inspection = await inspectInstanceConfigMigration();

  // 已改由环境变量承载的历史字段无法自动搬运，提示部署者手动补充配置
  for (const warning of inspection.envRehomedWarnings) {
    context.logger.warn(`Instance config env re-home required: ${warning}`);
  }

  // 旧值不满足当前 Schema 收紧校验的项已被剔除，提示部署者按需重新配置
  for (const warning of inspection.schemaSanitizedWarnings) {
    context.logger.warn(`Instance config sanitized during migration: ${warning}`);
  }

  await context.reportProgress({
    key: 'inspect',
    status: SystemMigrationStatusEnum.succeeded,
    params: {
      existingDomainCount: inspection.existingDomainCount,
      missingDomainCount: inspection.missingDomainCount,
      pendingBackfillDomainCount: inspection.pendingBackfillDomainCount,
      hasLegacyConfig: inspection.hasLegacyConfig
    }
  });

  await context.assertActive();

  // 域齐全只允许跳过旧值导入，仍须执行清理、补充字段和完整终验。
  const needsLegacyMigration =
    inspection.missingDomainCount > 0 || inspection.pendingBackfillDomainCount > 0;

  await context.reportProgress({
    key: 'migrate',
    status: SystemMigrationStatusEnum.running
  });

  const result = needsLegacyMigration
    ? await applyInstanceConfigMigration({
        overrides: inspection.overrides,
        explicitDefaultPaths: inspection.explicitDefaultPaths,
        ...(inspection.initialization ? { initialization: inspection.initialization } : {}),
        logger: context.logger
      })
    : { migratedCount: 0, backfilledDomains: [], backfilledPaths: [], backfillSkippedPaths: [] };
  const skippedSummary = buildSkippedConfigSummary({
    schemaSanitizedIssues: inspection.schemaSanitizedIssues ?? [],
    backfillSkippedPaths: result.backfillSkippedPaths,
    envRehomedWarnings: inspection.envRehomedWarnings
  });

  // 补写的字段属客户既有配置，逐条落在日志里便于排查"某个值为什么变成了这个"
  if (result.backfilledPaths.length > 0) {
    context.logger.info('Instance config fields backfilled from env/legacy config', {
      backfilledPaths: result.backfilledPaths
    });
  }

  await context.reportProgress({
    key: 'migrate',
    status: SystemMigrationStatusEnum.succeeded,
    params: {
      migratedDomainCount: result.migratedCount,
      backfilledDomainCount: result.backfilledDomains.length
    },
    current: result.migratedCount,
    // 使用默认值的域也会创建文档；只数非默认 overrides 会使 current > total 并导致任务失败。
    total: SYSTEM_INSTANCE_CONFIG_DOMAINS.length
  });

  // 清理完成后再补充目标字段，避免旧字段残留使严格 Schema 拒绝后续回填。
  await context.reportProgress({ key: 'cleanup', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  const cleanup = await cleanupInstanceConfigDeprecatedFields({ logger: context.logger });
  await context.assertActive();
  await context.reportProgress({
    key: 'cleanup',
    status: SystemMigrationStatusEnum.succeeded,
    current: cleanup.updatedDomains.length,
    total: cleanup.scannedDocuments
  });

  const backfills = [
    // 先完成业务域初始化和废弃字段清理，再合并套餐与运营配置，避免遮蔽文件或严格校验失败。
    () => migrateLegacyConfigScopes(),
    backfillExternalFileCheck,
    rehomeSubserviceConnections,
    backfillModelDeprecationSms,
    rehomeAgentSandboxProxy,
    rehomeSandboxOvercommit,
    rehomeFileDomain,
    rehomeHttpRuntimePolicies,
    restoreCustomDomainConfig,
    // 既有完整域也要重扫加密；前述回填完成后统一处理尚未触及的旧明文。
    encryptStoredConfigSecrets
  ];
  await context.reportProgress({
    key: 'backfill',
    status: SystemMigrationStatusEnum.running,
    current: 0,
    total: backfills.length
  });
  for (const [index, backfill] of backfills.entries()) {
    await context.assertActive();
    await backfill({ assertActive: () => context.assertActive() });
    await context.assertActive();
    await context.reportProgress({
      key: 'backfill',
      status: SystemMigrationStatusEnum.running,
      current: index + 1,
      total: backfills.length
    });
  }
  await context.reportProgress({
    key: 'backfill',
    status: SystemMigrationStatusEnum.succeeded,
    current: backfills.length,
    total: backfills.length
  });

  await context.assertActive();
  await context.reportProgress({
    key: 'validate',
    status: SystemMigrationStatusEnum.running
  });

  // 终验：重新跑一次 inspect。必须满足「全域落库且无未迁入缺口」，
  // 否则说明存在未消解的冲突或部分写入失败，明确抛错失败，不能用空 validate 冒充成功。
  const postInspection = await inspectInstanceConfigMigration();
  if (postInspection.missingDomainCount > 0 || postInspection.pendingBackfillDomainCount > 0) {
    const remaining = [
      ...postInspection.pendingBackfillPaths,
      ...(postInspection.missingDomainCount > 0
        ? [`${postInspection.missingDomainCount} domains missing`]
        : [])
    ];
    throw new Error(
      `Instance config migration incomplete: ${remaining.join(', ')} failed to migrate`
    );
  }

  const cleanupVerification = await verifyInstanceConfigDeprecatedFields();
  if (
    cleanupVerification.remainingDocuments.length > 0 ||
    cleanupVerification.invalidDomains.length > 0
  ) {
    throw new Error('System configuration migration left deprecated or invalid domain fields');
  }
  // 每个目标都必须具备持久化依据，不能以 Schema 自动补出的默认值替代迁移完成。
  for (const verify of [
    verifyExternalFileCheck,
    verifyRehomedSubserviceConnections,
    verifyModelDeprecationSms,
    verifyAgentSandboxProxyMigration,
    verifySandboxOvercommitMigration,
    verifyFileDomainMigration,
    verifyHttpRuntimePolicyMigration,
    verifyCustomDomainConfig,
    verifyLegacyConfigScopes,
    verifyStoredConfigSecrets
  ]) {
    await context.assertActive();
    await verify();
  }
  await context.assertActive();

  await context.reportProgress({
    key: 'validate',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    migratedDomainCount: result.migratedCount,
    backfilledDomainCount: result.backfilledDomains.length,
    removedFieldCount: cleanup.removedFieldCount,
    backfilledStepCount: backfills.length,
    ...skippedSummary
  };
};
