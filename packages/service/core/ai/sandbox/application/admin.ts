/**
 * 沙盒业务层：汇总后台任务和管理脚本所需沙盒能力。
 *
 * 负责收口 cron、批量归档和当前 provider 查询；不承载迁移脚本自己的 Mongo 修复逻辑。
 */
import { getConfiguredSandboxProvider as resolveConfiguredSandboxProvider } from '../infrastructure/provider/config';

export { cronJob as runSandboxArchiveCron } from './cron';
export {
  archiveInactiveSandboxes,
  archiveSandboxResources,
  type SandboxArchiveResult
} from './archive';
export type { SandboxProviderType } from '../type';

/**
 * 返回当前启用的 sandbox provider。
 *
 * 管理脚本通过业务层读取 provider，避免接口层直接暴露 infrastructure 配置模块。
 */
export function getConfiguredSandboxProvider() {
  return resolveConfiguredSandboxProvider();
}
