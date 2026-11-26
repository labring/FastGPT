import type { S3SandboxSource } from '@fastgpt/service/common/s3/sources/sandbox';
import { deleteSandboxResource } from '@fastgpt/service/core/ai/sandbox/application/resource';
import type { SandboxClientQuery } from '@fastgpt/service/core/ai/sandbox/application/runtime/type';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';

/** 集成测试单用例 App Sandbox 清理：先解除进行中的 `operation.retryAfter` 冷却，再清理远端容器/卷、Mongo 记录、S3 归档与测试 App。 */
export const cleanupAppSandbox = async (
  query: SandboxClientQuery,
  s3Sandbox: S3SandboxSource
): Promise<void> => {
  const doc = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
  if (doc) {
    if (doc.operation) {
      await MongoSandboxInstance.updateOne(
        { _id: doc._id, 'operation.id': doc.operation.id },
        { $set: { 'operation.retryAfter': new Date(0) } }
      );
    }
    if (doc.provider === 'opensandbox') {
      await deleteSandboxResource({
        ...doc,
        provider: 'opensandbox'
      }).catch(() => undefined);
    }
    await MongoSandboxInstance.deleteOne({ _id: doc._id }).catch(() => undefined);
  }
  await s3Sandbox.deleteSandboxArchives({ sandboxId: query.sandboxId }).catch(() => undefined);
  await MongoApp.deleteOne({ _id: query.sourceId }).catch(() => undefined);
};
