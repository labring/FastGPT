/**
 * 隔离式旧版 v2 沙箱未迁移门禁（legacy 专用目录，不耦合新版领域模型）。
 *
 * 当新版 `agent_sandbox_instances_v3` 未命中记录时，只读检查旧集合 `agent_sandbox_instances_v2`
 * 是否存在尚未迁移到 v3 的历史记录，防止升级后在未跑完迁移任务前误创建空白新卷覆盖旧工作区。
 *
 * 注意：直接通过底层 `connectionMongo.connection.db` 访问原集合，不注册 Mongoose Model，
 * 避免在新集群启动时由 `MongoIndexManager` 自动创建废弃的 `v2` 空索引。
 */
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { connectionMongo } from '../../../../common/mongo';

export const LEGACY_SANDBOX_V2_COLLECTION_NAME = 'agent_sandbox_instances_v2';

/**
 * 进程级短 TTL 空表缓存（30s）：稳态下消除每次创建沙箱对 `v2` 空表的重复查询，
 * 同时避免 `4.17 -> 4.18` 滚动发布新旧 Pod 并存窗口内永久锁存空表状态。
 */
const LEGACY_V2_EMPTY_CACHE_TTL_MS = 30_000;
let legacyV2EmptyConfirmedUntil = 0;

/** 重置进程内 `v2` 空表缓存（仅供测试使用）。 */
export const resetLegacyV2EmptyCacheForTest = (): void => {
  legacyV2EmptyConfirmedUntil = 0;
};

/**
 * 校验目标业务源/用户在旧集合 `agent_sandbox_instances_v2` 中不存在待迁移记录。
 *
 * - 若未建立 Mongo 实时连接（如纯 mock 单元测试环境）或进程内已确认 `v2` 为空，直接放行；
 * - 若命中非 `deleting` 的 `v2` 记录，抛出 `SandboxErrEnum.agentSandboxMigrationInProgress`（HTTP 409）；
 * - 若未命中且全表无任何非 `deleting` 记录，置位进程内空表缓存，消除后续查询开销。
 */
export async function assertNoUnmigratedLegacySandbox(params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId?: string;
}): Promise<void> {
  // 1. 进程内已确认 v2 无待迁移记录，或当前处于从未发起 Mongo 连接的纯 mock 单测环境（readyState === 0 且无 host）时直接短路；
  //    若真实连接正在重连/断开（readyState 为 2/3 或已配置 host 却失联），必须 Fail-Closed 报错中止，防止断连窗口误建空白 v3 卷。
  if (Date.now() < legacyV2EmptyConfirmedUntil) return;
  if (connectionMongo.connection.readyState === 0 && !connectionMongo.connection.host) return;
  if (connectionMongo.connection.readyState !== 1 || !connectionMongo.connection.db) {
    throw new Error(
      'MongoDB connection is unavailable while checking legacy sandbox migration gate'
    );
  }

  const collection = connectionMongo.connection.db.collection(LEGACY_SANDBOX_V2_COLLECTION_NAME);

  // 2. 按逻辑身份查询是否存在未迁移的旧版实例（deleting 态为待清理残留，不阻塞新建）。
  const matched = await collection.findOne(
    {
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      ...(params.userId !== undefined ? { userId: params.userId } : {}),
      status: { $ne: 'deleting' }
    },
    { projection: { _id: 1 } }
  );
  if (matched) {
    throw new UserError(SandboxErrEnum.agentSandboxMigrationInProgress);
  }

  // 3. 若当前身份未命中，顺带探测全表是否已无任何有效旧记录；为空则开启短 TTL 空表缓存。
  const anyActiveLegacyDoc = await collection.findOne(
    { status: { $ne: 'deleting' } },
    { projection: { _id: 1 } }
  );
  if (!anyActiveLegacyDoc) {
    legacyV2EmptyConfirmedUntil = Date.now() + LEGACY_V2_EMPTY_CACHE_TTL_MS;
  }
}
