/** App Sandbox 跨 provider 生命周期迁移。 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { findSandboxInstanceBySource } from '../infrastructure/instance/repository';
import type { SandboxProviderType } from '../type';
import { assertSandboxSourceActive } from './sourceGuard';

/**
 * 通过单一 Durable Saga 归档旧资源并原子切换 provider。
 *
 * Mongo snapshot 保存步骤进度，Redis lease 隔离执行者，BullMQ 只负责低延迟唤醒。
 */
export async function migrateSandboxProviderBeforeUse(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
}) {
  await assertSandboxSourceActive({
    sourceType: params.sourceType,
    sourceId: params.sourceId
  });
  const existing = await findSandboxInstanceBySource({
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    userId: params.userId
  });
  if (!existing || existing.provider === params.provider) return;
  if (existing.sandboxId !== params.sandboxId) {
    throw new Error(
      `Sandbox provider migration sandboxId mismatch: expected ${params.sandboxId}, received ${existing.sandboxId}`
    );
  }

  const { migrateSandboxProviderWithSaga } = await import('./lifecycle/service');
  await migrateSandboxProviderWithSaga({
    resource: existing,
    targetProvider: params.provider
  });
}

export const migrateAppSandboxProviderBeforeUse = (params: {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceId: string;
  userId: string;
}) =>
  migrateSandboxProviderBeforeUse({
    ...params,
    sourceType: ChatSourceTypeEnum.app
  });
