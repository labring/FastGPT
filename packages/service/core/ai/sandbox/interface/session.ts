/**
 * 沙盒接口层：提供 SandboxEditor 会话存在性查询与运行态批量保活入口。
 */
import type { SandboxClientQuery } from '../application/runtime/type';
import {
  existsSandboxInstanceBySandboxId,
  touchRunningSandboxInstancesByIds
} from '../infrastructure/instance/repository';

/**
 * 检查指定 runtime sandbox 记录是否存在。
 *
 * 该查询只读本地实例表，不会拉起或恢复远端 sandbox。
 */
export async function checkSandboxSessionExist(
  query: Pick<SandboxClientQuery, 'sandboxId'>
): Promise<boolean> {
  return existsSandboxInstanceBySandboxId({
    sandboxId: query.sandboxId
  });
}

/**
 * 批量刷新存在活跃终端或预览流量的运行态沙盒实例活跃时间（不唤醒已停止实例）。
 */
export async function keepaliveSandboxSessionsByIds(sandboxIds: string[]): Promise<number> {
  if (sandboxIds.length === 0) {
    return 0;
  }
  return touchRunningSandboxInstancesByIds({
    sandboxIds
  });
}
