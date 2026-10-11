/**
 * 沙盒接口层：系统迁移任务使用的实例维护入口。
 *
 * 只向系统迁移暴露窄能力（按「缺失 teamId」条件读取与回填实例记录），运行期业务不消费；
 * 业务运行期的 teamId 补齐由 Quota 检查经 repository 直接完成。
 */
export {
  backfillSandboxInstanceTeamIdsBatch,
  countSandboxInstancesMissingTeamId,
  findSandboxInstanceMissingTeamId,
  getSandboxInstanceMissingTeamIdSnapshotEnd,
  readSandboxInstancesMissingTeamId
} from '../infrastructure/instance/repository';
export type { SandboxInstanceMissingTeamIdRecord } from '../infrastructure/instance/repository';
