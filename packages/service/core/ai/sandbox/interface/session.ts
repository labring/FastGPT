/**
 * 沙盒接口层：提供 SandboxEditor 和 proxy 会话相关入口。
 *
 * 本文件收口 chat source 到 sandbox runtime 的寻址转换；ticket 签发和 API 鉴权仍
 * 保留在 App API 边界，后续再逐步迁移。
 */
import { checkSandboxRuntimeInstanceExists, getSandboxClient } from './runtime';
import type { SandboxClientQuery } from './runtime';

export type { SandboxClientQuery } from './runtime';

/**
 * 检查指定 runtime sandbox 记录是否存在。
 *
 * 该查询只读本地实例表，不会拉起或恢复远端 sandbox。
 */
export async function checkSandboxSessionExist(query: SandboxClientQuery): Promise<boolean> {
  return checkSandboxRuntimeInstanceExists(query);
}

/**
 * 保持指定 runtime sandbox 可用。
 *
 * Proxy 保活场景不恢复 archived sandbox，避免内部保活把冷归档资源重新拉起。
 */
export async function keepaliveSandboxSession(query: SandboxClientQuery): Promise<void> {
  await getSandboxClient(query, { restoreArchived: false });
}
