/**
 * 沙盒接口层：提供 SandboxEditor 和 proxy 会话相关入口。
 *
 * 本文件收口 chat source 到 sandbox runtime 的寻址转换；ticket 签发和 API 鉴权仍
 * 保留在 App API 边界，后续再逐步迁移。
 */
import { assertSandboxSourceActive } from '../application/sourceGuard';
import type { SandboxClientQuery } from '../application/runtime/type';
import {
  existsSandboxInstanceBySandboxId,
  touchRunningSandboxInstance
} from '../infrastructure/instance/repository';

/**
 * 检查指定 runtime sandbox 记录是否存在。
 *
 * 该查询只读本地实例表，不会拉起或恢复远端 sandbox。
 */
export async function checkSandboxSessionExist(query: SandboxClientQuery): Promise<boolean> {
  return existsSandboxInstanceBySandboxId({ sandboxId: query.sandboxId });
}

/**
 * 保持指定 runtime sandbox 可用（纯 Mongo 保活）。
 *
 * Proxy 保活场景不恢复 archived/stopped sandbox，也不发起多余的远端容器连接。
 */
export async function keepaliveSandboxSession(query: SandboxClientQuery): Promise<void> {
  await assertSandboxSourceActive({
    sourceType: query.sourceType,
    sourceId: query.sourceId
  });
  await touchRunningSandboxInstance({
    sandboxId: query.sandboxId,
    sourceType: query.sourceType,
    sourceId: query.sourceId,
    userId: query.userId
  });
}
