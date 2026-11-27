/**
 * 沙盒运行期与迁移期历史兼容隔离层（4.18.0 过渡期保留）。
 *
 * 保留范围：
 * - `LEGACY_DEVBOX_PROVIDER`：供 4.18.0 迁移与清理任务识别 `v2` 旧 Devbox 记录；
 * - `shouldForwardAllowLegacyUnlabeled`：仅对 Task 7/8 处理的 4.17.x 无标签存量 PVC 透传 `allowLegacyUnlabeled`；
 * - `assertLegacyCompatibleSessionSandboxOwner` / `listLegacyCompatibleSandboxesBySessionId`：仅对 Task 7/8 的 `deleteOpenSandboxContainer({ allowLegacyUnlabeled: true })` 兼容清理缺少 `app: 'fastgpt'` 标签的存量容器；
 * - `parseLegacySandboxPreviewCredential`：兼容已签发未过期的旧版 `<sandboxId>:<sessionId>` Preview 凭证。
 *
 * 移除窗口（>= 4.19.0）：
 * 待 `20261117_migrate_sandbox_to_opensandbox` 与 `20261117_cleanup_legacy_sandbox_resources` 完成且确认不再需要
 * `agent_sandbox_instances_v2` / `sandbox/archive/` / 旧 PVC / 旧 Preview 会话兼容后整体删除 `legacy/`。
 */
import type { SandboxInfo as SdkSandboxInfo, SandboxManager } from '@alibaba-group/opensandbox';
import { asRedisLogicalKey } from '@fastgpt/dal/redis/adapter';
import { throwIfAborted } from '@fastgpt/global/common/system/utils';
import z from 'zod';

export const LEGACY_DEVBOX_PROVIDER = 'sealosdevbox' as const;

const LegacySandboxPreviewSandboxIdSchema = z.string().regex(/^(?:app|skilledit)-[a-f0-9]{16}$/);

/** 仅允许在显式开启且卷名属于受管前缀时向 volume-manager 透传 `allowLegacyUnlabeled`。 */
export const shouldForwardAllowLegacyUnlabeled = ({
  claimName,
  volumeNamePrefix,
  allowLegacyUnlabeled
}: {
  claimName: string;
  volumeNamePrefix: string;
  allowLegacyUnlabeled?: boolean;
}): boolean =>
  Boolean(allowLegacyUnlabeled && claimName.startsWith(`${volumeNamePrefix.toLowerCase()}-`));

/** 校验按 `sessionId` 访问的存量容器归属：允许缺少 `app` 标签，若携带则必须为 `fastgpt`。 */
export function assertLegacyCompatibleSessionSandboxOwner(
  info: SdkSandboxInfo,
  owner: { sessionId?: string }
): void {
  if (info.metadata?.sessionId !== owner.sessionId) {
    throw new Error(`OpenSandbox ownership mismatch: ${info.id}`);
  }
  if (info.metadata?.app && info.metadata.app !== 'fastgpt') {
    throw new Error(`OpenSandbox ownership mismatch: ${info.id}`);
  }
}

/** 仅按 `sessionId` 查询运行期候选容器，兼容尚未携带 `app: 'fastgpt'` 标签的存量容器。 */
export async function listLegacyCompatibleSandboxesBySessionId(params: {
  manager: SandboxManager;
  sessionId: string;
  isActive: (info: SdkSandboxInfo) => boolean;
  signal?: AbortSignal;
}): Promise<SdkSandboxInfo[]> {
  const { manager, sessionId, isActive, signal } = params;
  const items: SdkSandboxInfo[] = [];

  for (let page = 1; ; page++) {
    throwIfAborted(signal);
    const res = await manager.listSandboxInfos({
      metadata: { sessionId },
      pageSize: 100,
      page
    });
    for (const item of res.items) {
      assertLegacyCompatibleSessionSandboxOwner(item, { sessionId });
      if (isActive(item)) {
        items.push(item);
      }
    }
    if (!res.pagination?.hasNextPage) return items;
  }
}

/** 解析旧版 `<sandboxId>:<sessionId>` Preview 凭证为 Redis key 与 `legacySandboxId` 约束。 */
export function parseLegacySandboxPreviewCredential(params: {
  credential: string;
  keyPrefix: string;
  sessionIdSchema: z.ZodType<string>;
}) {
  const [rawSandboxId, rawSessionId, ...extraSegments] = params.credential.split(':');
  if (extraSegments.length > 0) {
    throw new Error('Invalid sandbox preview session');
  }
  const legacySandboxId = LegacySandboxPreviewSandboxIdSchema.parse(rawSandboxId);
  const sessionId = params.sessionIdSchema.parse(rawSessionId);

  return {
    sessionKey: asRedisLogicalKey(`${params.keyPrefix}:${legacySandboxId}:${sessionId}`),
    legacySandboxId
  };
}
