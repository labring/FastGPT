/**
 * 沙盒接口层：提供后台任务和管理脚本使用的沙盒入口。
 *
 * 本文件只暴露归档 cron、批量归档和 provider 查询能力；迁移脚本自身的数据修复逻辑
 * 仍保留在对应 admin API 中。
 */
export {
  runSandboxArchiveCron,
  archiveInactiveSandboxes,
  archiveSandboxResources,
  getConfiguredSandboxProvider,
  type SandboxArchiveResult
} from '../application/admin';
export type { SandboxProviderType } from '../application/admin';
